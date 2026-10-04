/**
 * F3 session flight log + /fw-log (docs/plans/mods.md, F3 as revised 2026-10-05).
 *
 * Observation only: the log holds what this session's tools did (files the agent edited, test/typecheck commands
 * whose completion was observed, commits git reported) and nothing else. It never writes a record, never reads
 * git-visible changes made by other programs, and is kept in $.state per session id (a /clear is a new id → fresh
 * log; a module reload keeps it). No cross-session history.
 *
 * Conservative by design: a command is recorded only when it is recognised (known runner, a package script whose
 * body was read, a command STATE.md declares as verification); the result is pass/fail only for a single plain
 * command with a reliable completion and an exit code. Everything else that is recorded is 'unknown' with a reason.
 */
import { atom, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { FwFlightLog, FwTestRun } from '../../types'
import { M, STATE_REL, detectLang, packageScripts, readRel, relToRoot } from '../lib/core'
import type { Io, Lang } from '../lib/core'
import { parseCommand } from '../lib/shell'
import type { Segment } from '../lib/shell'

const flightLog = atom({ plugin: 'flightwake-mod', key: 'flightLog' } as const, null)

const CAP_FILES = 500
const CAP_TESTS = 200
const CAP_COMMITS = 200
const CAP_COMMAND = 300
const CAP_SCRIPT = 200
const LIST_LIMIT = 100

// The Io closure over this file's `$` (IO_OF_TEMPLATE in hooks/lib/core.ts; `$` may not cross an import).
function ioOf($: EngineInterface): Io {
  return {
    root: async () => { try { return (await $.session.root()).replace(/\/+$/, '') } catch { return '' } },
    sessionId: async () => { try { return await $.session.id() } catch { return '' } },
    exists: async (p) => { try { return await $.fs.exists(p) } catch { return false } },
    read: async (p) => {
      try { if (!(await $.fs.exists(p))) return null; const t = await $.fs.read(p); return typeof t === 'string' ? t : null } catch { return null }
    },
    git: async (args, cwd) => {
      try { const r = await $.process.run(['git', ...args], { cwd, timeoutMs: 5000 }); return r.exitCode === 0 ? r.stdout.trim() : null } catch { return null }
    },
    settings: async () => { try { return await $.settings.read({}) } catch { return {} } },
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Redaction: applied to every command and script text before it is stored (never to what is matched against).
// ---------------------------------------------------------------------------------------------------------------

const SECRET_WORDS = 'token|secret|password|passwd|pwd|apikey|api_key|auth|credential|key'
const VALUE = `"[^"]*"|'[^']*'|\\S+`
const RE_URL_CREDS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]*@/gi
const RE_BEARER = /\bBearer\s+[^\s"']+/gi
const RE_KEY_VALUE = new RegExp(`([A-Za-z0-9_.-]*(?:${SECRET_WORDS})[A-Za-z0-9_.-]*=)(?:${VALUE})`, 'gi')
const RE_FLAG_VALUE = new RegExp(`(--?[A-Za-z0-9_.-]*(?:${SECRET_WORDS})[A-Za-z0-9_.-]*\\s+)(?!-)(?:${VALUE})`, 'gi')
const RE_LONG_RUN = /[A-Za-z0-9+/=_-]{32,}/g

export function redact(text: string, cap = CAP_COMMAND): string {
  const out = text
    .replace(RE_URL_CREDS, '$1***@')
    .replace(RE_BEARER, 'Bearer ***')
    .replace(RE_KEY_VALUE, '$1***')
    .replace(RE_FLAG_VALUE, '$1***')
    // A long opaque run with a digit is a likely token; paths (leading / . ~) and plain words are kept, or the
    // evidence itself (e.g. an absolute test path) would be erased.
    .replace(RE_LONG_RUN, (m) => (/^[./~]/.test(m) || !/\d/.test(m) || !/[A-Za-z]/.test(m) ? m : '***'))
  return out.length > cap ? `${out.slice(0, cap - 1)}…` : out
}

// ---------------------------------------------------------------------------------------------------------------
// Recognising a test command (pure: no world access). Returns what to look up, never a verdict.
// ---------------------------------------------------------------------------------------------------------------

/** What a single simple command is, before any package.json / STATE lookup. */
type Candidate =
  | { kind: 'runner' }
  | { kind: 'typecheck' }
  | { kind: 'script'; script: string; isNpmTest: boolean }

const SCRIPT_NAME_RE = /^(test|check|verify|typecheck|lint)([:._-].*)?$/
const WORKSPACE_FLAGS = new Set(['--prefix', '--workspace', '-w', '--workspaces', '--filter', '-F', '-C', '--cwd', '--dir', '--recursive', '-r', '--if-present-in'])

/** Tokens without redirections (`> f`, `2>/dev/null`, `2>&1`, `&>f`, `< in`): lib/shell keeps them as words. */
function stripRedirects(tokens: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as string
    const m = /^(?:\d*|&)(>>?|<)(.*)$/.exec(t)
    if (m) {
      if ((m[2] ?? '') === '') i++ // the target is the next word
      continue
    }
    out.push(t)
  }
  return out
}

/** Strips `npx [flags]`, `pnpm exec`, `pnpm dlx`-free forms and `bunx`; null when the command is not wrapped. */
function unwrapExec(t: readonly string[]): string[] | null {
  let rest: string[] | null = null
  if (t[0] === 'npx') rest = t.slice(1)
  else if (t[0] === 'bunx') rest = t.slice(1)
  else if ((t[0] === 'pnpm' || t[0] === 'yarn') && t[1] === 'exec') rest = t.slice(2)
  if (rest === null) return null
  while (rest.length && (rest[0] as string).startsWith('-')) rest = rest.slice(1)
  return rest
}

const DIRECT_RUNNERS = new Set(['vitest', 'jest', 'mocha', 'ava', 'tap', 'pytest', 'rspec', 'phpunit'])
const TYPECHECKERS = new Set(['tsc', 'vue-tsc', 'mypy', 'pyright'])

function isRunner(t: readonly string[]): boolean {
  const [a, b, c] = t
  if (a === undefined) return false
  if (DIRECT_RUNNERS.has(a)) return true
  if (a === 'playwright' && b === 'test') return true
  if ((a === 'python' || a === 'python3') && b === '-m' && c === 'pytest') return true
  if (a === 'go' && b === 'test') return true
  if (a === 'cargo' && b === 'test') return true
  if (a === 'deno' && b === 'test') return true
  if (a === 'bun' && b === 'test') return true
  if (a === 'make' && (b === 'test' || b === 'check')) return true
  if (a === 'claude' && b === 'plugin' && c === 'test') return true
  if (a === 'node' && t.includes('--test')) return true
  if (a === 'bundle' && b === 'exec' && c === 'rspec') return true
  if (a === 'mvn' && b === 'test') return true
  if ((a === 'gradle' || a === './gradlew') && b === 'test') return true
  if (a === 'dotnet' && b === 'test') return true
  if (a === 'mix' && b === 'test') return true
  return false
}

export function classify(tokensIn: readonly string[]): Candidate | null {
  const t = stripRedirects(tokensIn)
  const first = t[0]
  if (first === undefined) return null
  const wrapped = unwrapExec(t)
  if (wrapped !== null) {
    const w0 = wrapped[0]
    if (w0 === undefined) return null
    if (TYPECHECKERS.has(w0)) return { kind: 'typecheck' }
    return isRunner(wrapped) ? { kind: 'runner' } : null
  }
  if (TYPECHECKERS.has(first)) return { kind: 'typecheck' }
  if (isRunner(t)) return { kind: 'runner' }

  if (first === 'npm' || first === 'pnpm' || first === 'yarn' || first === 'bun') {
    // A workspace/prefix flag points at another package.json than the one we would read: don't guess.
    if (t.some((x) => WORKSPACE_FLAGS.has(x) || x.startsWith('--prefix=') || x.startsWith('--workspace=') || x.startsWith('--filter=') || x.startsWith('--cwd='))) return null
    const sub = t[1]
    if (sub === undefined) return null
    if (first === 'npm' && (sub === 'test' || sub === 't' || sub === 'tst')) return { kind: 'script', script: 'test', isNpmTest: true }
    if (sub === 'run' || sub === 'run-script') {
      const name = t[2]
      return name !== undefined && SCRIPT_NAME_RE.test(name) ? { kind: 'script', script: name, isNpmTest: first === 'npm' && name === 'test' } : null
    }
    if (first !== 'npm' && sub === 'test') return { kind: 'script', script: 'test', isNpmTest: false }
    if ((first === 'pnpm' || first === 'yarn' || first === 'bun') && SCRIPT_NAME_RE.test(sub)) return { kind: 'script', script: sub, isNpmTest: false }
  }
  return null
}

/** A script that hides its own failures: `… || true`, `… || exit 0`, `…; true`. */
export function masksExit(script: string): boolean {
  return /\|\|\s*(true|exit\s+0|:)(\s|$|;|&|\))/.test(script) || /;\s*(true|exit\s+0)(\s|$|;)/.test(script)
}

/** Backtick spans on STATE lines that talk about testing/verifying — the commands this repo declares as its checks. */
export function declaredCommands(stateText: string): string[] {
  const out: string[] = []
  const talk = /test|verify|smoke|check|驗證|验证|測試|测试|檢查|检查|テスト|検証/i
  for (const line of stateText.split(/\r?\n/)) {
    if (!talk.test(line)) continue
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const span = (m[1] ?? '').replace(/\s+/g, ' ').trim()
      if (span && !span.includes('{{')) out.push(span)
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// Planning a Bash call before it runs
// ---------------------------------------------------------------------------------------------------------------

type Planned = {
  kind: FwTestRun['kind']
  script?: string
  isMasked: boolean
}

type Plan = {
  cwd: string
  /** Absolute cwd, for git. */
  cwdAbs: string
  isCompound: boolean
  items: Planned[]
}

const isCdPrefix = (s: Segment): boolean => s.tokens[0] === 'cd' && s.tokens.length === 2 && s.op === '&&' && s.env.length === 0

async function planBash(io: Io, root: string, cwd0: string, command: string): Promise<Plan | null> {
  const parsed = parseCommand(command.trim())
  let segs = parsed.segments
  let cwdAbs = cwd0 || root
  // Leading `cd <dir> &&` segments only move the cwd.
  while (segs.length > 1 && isCdPrefix(segs[0] as Segment)) {
    const dir = (segs[0] as Segment).tokens[1] as string
    if (dir === '-' || dir.startsWith('~') || dir.includes('$')) return null // not resolvable without guessing
    cwdAbs = dir.startsWith('/') ? dir : `${cwdAbs}/${dir}`
    segs = segs.slice(1)
  }
  if (segs.length === 0) return null
  const rel = relToRoot(root, cwdAbs)
  const cwdRel = rel === null ? cwdAbs : rel
  const isCompound = segs.length > 1 || segs.some((s) => s.op !== '') || parsed.isComplex

  const normalized = command.replace(/\s+/g, ' ').trim()
  let declared: string[] | null = null
  const declaredList = async (): Promise<string[]> => {
    if (declared === null) {
      const t = await readRel(io, root, STATE_REL)
      declared = t === null ? [] : declaredCommands(t)
    }
    return declared
  }

  const items: Planned[] = []
  for (const seg of segs) {
    const c = classify(seg.tokens)
    if (c === null) {
      const joined = stripRedirects(seg.tokens).join(' ')
      const decl = await declaredList()
      // The whole command (cd prefix and all) or this one segment, whitespace-normalised, equals a declared span.
      if (decl.includes(joined) || (segs.length === 1 && decl.includes(normalized.replace(/\s*\d*>&\d+/g, '')))) items.push({ kind: 'state-declared', isMasked: false })
      continue
    }
    if (c.kind === 'script') {
      const scripts = await packageScripts(io, root, cwdRel === '' ? '' : cwdRel)
      const body = scripts?.[c.script]
      if (body === undefined || body.trim() === '') continue
      if (c.isNpmTest && /no test specified/i.test(body)) continue // npm's placeholder is not a test
      items.push({ kind: 'package-script', script: redact(body, CAP_SCRIPT), isMasked: masksExit(body) })
      continue
    }
    items.push({ kind: c.kind, isMasked: false })
  }
  if (items.length === 0) return null
  return { cwd: cwdRel === '' ? '.' : cwdRel, cwdAbs, isCompound, items }
}

// ---------------------------------------------------------------------------------------------------------------
// Reading the outcome
// ---------------------------------------------------------------------------------------------------------------

type Outcome = { result: FwTestRun['result']; exitCode: number | null; reason?: string }

type BashResultFields = { interrupted?: boolean; backgroundTaskId?: string; timedOutAfterMs?: number; gitOperation?: { commit?: { sha: string; kind: string } } }

export function outcomeOf(
  res: { isError?: boolean; result?: unknown; text?: string },
  isBackground: boolean,
  isCompound: boolean,
  isMasked: boolean,
): Outcome {
  let o: Outcome
  if (res.isError === true) {
    const text = typeof res.text === 'string' ? res.text : typeof res.result === 'string' ? res.result : ''
    const m = /^Exit code (\d+)/.exec(text)
    o = m ? { result: 'fail', exitCode: Number(m[1]) } : { result: 'unknown', exitCode: null, reason: 'no-exit-code' }
  } else {
    const r = res.result
    if (r === undefined || r === null || typeof r !== 'object') o = { result: 'unknown', exitCode: null, reason: 'no-result' }
    else {
      const b = r as BashResultFields
      if (isBackground || b.backgroundTaskId) o = { result: 'unknown', exitCode: null, reason: 'background' }
      else if (b.interrupted === true) o = { result: 'unknown', exitCode: null, reason: 'interrupted' }
      else if (b.timedOutAfterMs !== undefined) o = { result: 'unknown', exitCode: null, reason: 'timeout' }
      else o = { result: 'pass', exitCode: 0 }
    }
  }
  if (isCompound) return { result: 'unknown', exitCode: null, reason: 'compound' } // never pass/fail from the overall exit
  if (isMasked && o.result !== 'unknown') return { result: 'unknown', exitCode: null, reason: 'script-masks-exit' }
  return o
}

// ---------------------------------------------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------------------------------------------

const freshLog = (sessionId: string, now: number): FwFlightLog => ({ sessionId, startedAt: now, files: [], tests: [], commits: [], dropped: 0 })

/** Applies `change` to this session's log (a log of another session id is replaced: that is the /clear behaviour). */
async function record($: EngineInterface, io: Io, change: (log: FwFlightLog) => void): Promise<void> {
  const sid = await io.sessionId()
  const now = await $.clock.now()
  await update($, flightLog, (cur) => {
    const base = cur !== null && cur.sessionId === sid ? cur : freshLog(sid, now)
    const log: FwFlightLog = { ...base, files: [...base.files], tests: [...base.tests], commits: [...base.commits] }
    change(log)
    return log
  })
}

function touchFile(log: FwFlightLog, path: string, tool: string, at: number, agentId: string | undefined): void {
  const i = log.files.findIndex((f) => f.path === path)
  if (i >= 0) log.files.splice(i, 1)
  else if (log.files.length >= CAP_FILES) {
    log.dropped += 1
    return
  }
  log.files.push(agentId === undefined ? { path, tool, at } : { path, tool, at, agentId })
}

// ---------------------------------------------------------------------------------------------------------------
// /fw-log
// ---------------------------------------------------------------------------------------------------------------

const when = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
const cell = (s: string): string => s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
const code = (s: string): string => (s.includes('`') ? cell(s) : `\`${cell(s)}\``)

export function renderLog(lang: Lang, log: FwFlightLog | null, isFlightwakeHere: boolean): string {
  const lines: string[] = []
  lines.push(`## ${M(lang, { en: 'flightwake session log', 'zh-TW': 'flightwake 本 session 記錄', 'zh-CN': 'flightwake 本 session 记录', ja: 'flightwake セッション記録' })}`, '')
  if (!isFlightwakeHere) {
    lines.push(M(lang, {
      en: "_flightwake isn't set up in this folder (no .flightwake/STATE.md); this log still covers the current session._",
      'zh-TW': '_這個資料夾尚未安裝 flightwake(沒有 .flightwake/STATE.md);以下仍是本 session 的觀測記錄。_',
      'zh-CN': '_这个文件夹尚未安装 flightwake(没有 .flightwake/STATE.md);以下仍是本 session 的观测记录。_',
      ja: '_このフォルダには flightwake が未導入です(.flightwake/STATE.md なし)。以下は現在のセッションの観測記録です。_',
    }), '')
  }
  const isEmpty = log === null || (log.files.length === 0 && log.tests.length === 0 && log.commits.length === 0)
  if (isEmpty || log === null) {
    lines.push(M(lang, {
      en: 'Nothing observed yet in this session.',
      'zh-TW': '本 session 尚未觀測到任何檔案變更、測試或 commit。',
      'zh-CN': '本 session 尚未观测到任何文件变更、测试或 commit。',
      ja: 'このセッションではまだ何も観測されていません。',
    }), '')
  } else {
    lines.push(`### ${M(lang, { en: 'Files changed by the agent', 'zh-TW': 'agent 改過的檔案', 'zh-CN': 'agent 改过的文件', ja: 'エージェントが変更したファイル' })} (${log.files.length})`, '')
    if (log.files.length === 0) lines.push(M(lang, { en: '_none_', 'zh-TW': '_無_', 'zh-CN': '_无_', ja: '_なし_' }))
    for (const f of log.files.slice(0, LIST_LIMIT)) lines.push(`- ${code(f.path)} (${f.tool}${f.agentId ? `, subagent ${f.agentId}` : ''})`)
    if (log.files.length > LIST_LIMIT) lines.push(M(lang, { en: `- … and ${log.files.length - LIST_LIMIT} more`, 'zh-TW': `- …另有 ${log.files.length - LIST_LIMIT} 個`, 'zh-CN': `- …另有 ${log.files.length - LIST_LIMIT} 个`, ja: `- …ほか ${log.files.length - LIST_LIMIT} 件` }))
    lines.push('')

    lines.push(`### ${M(lang, { en: 'Test / typecheck runs', 'zh-TW': '測試 / typecheck 執行', 'zh-CN': '测试 / typecheck 执行', ja: 'テスト / typecheck 実行' })} (${log.tests.length})`, '')
    if (log.tests.length === 0) lines.push(M(lang, { en: '_none observed_', 'zh-TW': '_未觀測到_', 'zh-CN': '_未观测到_', ja: '_観測なし_' }))
    else {
      lines.push(`| ${M(lang, { en: 'command', 'zh-TW': '指令', 'zh-CN': '指令', ja: 'コマンド' })} | ${M(lang, { en: 'kind', 'zh-TW': '類型', 'zh-CN': '类型', ja: '種別' })} | ${M(lang, { en: 'result', 'zh-TW': '結果', 'zh-CN': '结果', ja: '結果' })} | ${M(lang, { en: 'exit code', 'zh-TW': '退出碼', 'zh-CN': '退出码', ja: '終了コード' })} | ${M(lang, { en: 'finished', 'zh-TW': '完成時間', 'zh-CN': '完成时间', ja: '終了時刻' })} | ${M(lang, { en: 'revision', 'zh-TW': '版本', 'zh-CN': '版本', ja: 'リビジョン' })} | cwd | ${M(lang, { en: 'reason', 'zh-TW': '原因', 'zh-CN': '原因', ja: '理由' })} |`)
      lines.push('|---|---|---|---|---|---|---|---|')
      for (const r of log.tests) {
        const result = r.result === 'pass'
          ? M(lang, { en: 'pass', 'zh-TW': '通過', 'zh-CN': '通过', ja: '成功' })
          : r.result === 'fail'
            ? M(lang, { en: 'fail', 'zh-TW': '失敗', 'zh-CN': '失败', ja: '失敗' })
            : M(lang, { en: 'unknown', 'zh-TW': '未知', 'zh-CN': '未知', ja: '不明' })
        const rev = r.revision === null ? '?' : `${r.revision.slice(0, 7)}${r.isDirty === true ? '*' : r.isDirty === null ? '?' : ''}`
        const kind = r.kind === 'package-script' && r.script ? `package-script (${cell(r.script)})` : r.kind
        lines.push(`| ${code(r.command)} | ${kind} | ${result} | ${r.exitCode === null ? '-' : r.exitCode} | ${when(r.finishedAt)} | ${rev} | ${code(r.cwd)} | ${r.reason ?? ''}${r.agentId ? `${r.reason ? ' ' : ''}subagent ${r.agentId}` : ''} |`)
      }
      lines.push('', M(lang, {
        en: '`*` = the working tree had uncommitted changes when the command started; `?` = could not be read.',
        'zh-TW': '`*` = 指令開始時工作區有未 commit 的變更;`?` = 讀不到。',
        'zh-CN': '`*` = 指令开始时工作区有未 commit 的变更;`?` = 读不到。',
        ja: '`*` = コマンド開始時に未コミットの変更あり、`?` = 取得不可。',
      }))
    }
    lines.push('')

    lines.push(`### Commits (${log.commits.length})`, '')
    if (log.commits.length === 0) lines.push(M(lang, { en: '_none_', 'zh-TW': '_無_', 'zh-CN': '_无_', ja: '_なし_' }))
    for (const c of log.commits) lines.push(`- ${code(c.sha.slice(0, 7))} ${c.kind} ${when(c.at)}${c.agentId ? ` (subagent ${c.agentId})` : ''}`)
    lines.push('')

    if (log.dropped > 0) {
      lines.push(M(lang, {
        en: `Note: ${log.dropped} older or overflow entries were dropped by the size caps.`,
        'zh-TW': `注意:${log.dropped} 筆因容量上限未收錄。`,
        'zh-CN': `注意:${log.dropped} 条因容量上限未收录。`,
        ja: `注意: 上限を超えた ${log.dropped} 件は記録されていません。`,
      }), '')
    }
  }
  lines.push('---', M(lang, {
    en: 'Observed by flightwake-mod in this session only: changes made by other programs and runs outside this session are not included. Use the rows verbatim as fw-record\'s `tests:` evidence and change list; `unknown` rows are not evidence of passing.',
    'zh-TW': '由 flightwake-mod 只在本 session 內觀測:其他程式造成的變更、本 session 以外的執行都不在內。可把這些列原樣作為 fw-record 的 `tests:` 證據與變更清單;`unknown`(未知)的列不是通過的證據。',
    'zh-CN': '由 flightwake-mod 只在本 session 内观测:其他程序造成的变更、本 session 以外的执行都不在内。可把这些行原样作为 fw-record 的 `tests:` 证据与变更清单;`unknown`(未知)的行不是通过的证据。',
    ja: 'flightwake-mod がこのセッション内でのみ観測したものです。他のプログラムによる変更やセッション外の実行は含まれません。各行は fw-record の `tests:` 証拠と変更一覧にそのまま使えます。`unknown` の行は成功の証拠ではありません。',
  }))
  return lines.join('\n')
}

// ---------------------------------------------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------------------------------------------

// Declares /fw-log: at session.start, and once more lazily on first use (a hot reload may not re-fire session.start).
// Top-level so that `$` is passed only to a function declared at the top of this file.
let isCommandRegistered = false
async function ensureCommand($: EngineInterface): Promise<void> {
  if (isCommandRegistered) return
  isCommandRegistered = true
  try {
    const io = ioOf($)
    const root = await io.root()
    const lang = root ? await detectLang(io, root) : 'en'
    await $.command.register({
      name: 'fw-log',
      description: M(lang, {
        en: 'Print this session\'s observed files, test runs and commits (flightwake-mod)',
        'zh-TW': '印出本 session 觀測到的檔案變更、測試結果與 commit(flightwake-mod)',
        'zh-CN': '打印本 session 观测到的文件变更、测试结果与 commit(flightwake-mod)',
        ja: 'このセッションで観測したファイル変更・テスト結果・commit を表示(flightwake-mod)',
      }),
    })
  } catch {
    isCommandRegistered = false
  }
}


export function registerRecorder(on: On): void {
  on('session.start', {}, async ($, e, next) => {
    await ensureCommand($)
    return next(e)
  })

  on('command.run', { command: 'fw-log' }, async ($, e, next) => {
    try {
      const io = ioOf($)
      const root = await io.root()
      const sid = await io.sessionId()
      const cur = (await $.state.get({ plugin: 'flightwake-mod', key: 'flightLog' } as const)).value ?? null
      const log = cur !== null && cur.sessionId === sid ? cur : null
      const lang = root ? await detectLang(io, root) : 'en'
      const isHere = root ? await io.exists(`${root}/${STATE_REL}`) : false
      return { text: renderLog(lang, log, isHere) }
    } catch {
      return next(e)
    }
  })

  on('tool.call', {}, async ($, e, next) => {
    const tool = e.tool
    if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') {
      const res = await next(e)
      try {
        if (res.deny === undefined && res.isError !== true) {
          const io = ioOf($)
          const root = await io.root()
          const abs = tool === 'NotebookEdit' ? (e as { notebook_path?: string }).notebook_path : (e as { file_path?: string }).file_path
          if (typeof abs === 'string' && abs) {
            const path = root ? (relToRoot(root, abs) ?? abs) : abs
            const at = await $.clock.now()
            const agentId = e.agentId
            await ensureCommand($)
            await record($, io, (log) => touchFile(log, path, tool, at, agentId))
          }
        }
      } catch {}
      return res
    }
    if (tool !== 'Bash') return next(e)

    // Bash: plan before it runs (revision / dirtiness must be those of the start), observe after.
    const command = (e as { command?: string }).command
    const isBackground = (e as { run_in_background?: boolean }).run_in_background === true
    let plan: Plan | null = null
    let revision: string | null = null
    let isDirty: boolean | null = null
    let startedAt = 0
    try {
      if (typeof command === 'string' && command.trim()) {
        const io = ioOf($)
        const root = await io.root()
        let cwd0 = root
        try { cwd0 = (await $.session.cwd()).replace(/\/+$/, '') || root } catch {}
        plan = await planBash(io, root, cwd0, command)
        if (plan !== null) {
          revision = await io.git(['rev-parse', 'HEAD'], plan.cwdAbs)
          const st = await io.git(['status', '--porcelain'], plan.cwdAbs)
          isDirty = st === null ? null : st !== ''
          startedAt = await $.clock.now()
        }
      }
    } catch {
      plan = null
    }

    const res = await next(e)

    try {
      if (res.deny === undefined) {
        const io = ioOf($)
        const finishedAt = await $.clock.now()
        const agentId = e.agentId
        const commit = res.isError === true ? undefined : (res.result as BashResultFields | undefined)?.gitOperation?.commit
        const runs: FwTestRun[] = []
        if (plan !== null && typeof command === 'string') {
          for (const item of plan.items) {
            const o = outcomeOf(res, isBackground, plan.isCompound, item.isMasked)
            const run: FwTestRun = {
              command: redact(command.trim()),
              kind: item.kind,
              cwd: plan.cwd,
              startedAt,
              finishedAt,
              revision,
              isDirty,
              result: o.result,
              exitCode: o.exitCode,
            }
            if (item.script !== undefined) run.script = item.script
            if (o.reason !== undefined) run.reason = o.reason
            if (agentId !== undefined) run.agentId = agentId
            runs.push(run)
          }
        }
        if (runs.length > 0 || (commit !== undefined && commit.sha)) {
          await ensureCommand($)
          await record($, io, (log) => {
            for (const r of runs) {
              if (log.tests.length >= CAP_TESTS) log.dropped += 1
              else log.tests.push(r)
            }
            if (commit !== undefined && commit.sha && !log.commits.some((c) => c.sha === commit.sha && c.kind === commit.kind)) {
              if (log.commits.length >= CAP_COMMITS) log.dropped += 1
              else log.commits.push(agentId === undefined ? { sha: commit.sha, kind: commit.kind, at: finishedAt } : { sha: commit.sha, kind: commit.kind, at: finishedAt, agentId })
            }
          })
        }
      }
    } catch {}
    return res
  })
}
