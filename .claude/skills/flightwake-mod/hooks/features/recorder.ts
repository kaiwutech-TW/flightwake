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

import type { FwFlightLog, FwShellWrite, FwTestRun } from '../../types'
import { M, STATE_REL, fwContext, packageScripts, readRel, relToRoot, tableCell as cell } from '../lib/core'
import type { Io, Lang } from '../lib/core'
import { parseCommand, shellWriteTargets } from '../lib/shell'
import type { Segment } from '../lib/shell'
import { declaredCommands, judge, type Judgment } from '../lib/testcmd'

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
      try { const r = await $.process.run(['git', '--no-optional-locks', ...args], { cwd, timeoutMs: 5000 }); return r.exitCode === 0 ? r.stdout.trim() : null } catch { return null }
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
// Judging a Bash call before it runs: hooks/lib/testcmd.ts (positive proof; pure). Here: the cd prefix and the cwd.
// ---------------------------------------------------------------------------------------------------------------

type Plan = {
  cwd: string
  /** Absolute cwd, for git. */
  cwdAbs: string
  /** Leading `cd <dir> &&` segments were stripped: exit 0 still proves the run, a non-zero exit may be the cd's. */
  hasCdPrefix: boolean
  judgment: Judgment
}

const isCdPrefix = (s: Segment): boolean =>
  s.tokens[0] === 'cd' && s.op === '&&' && s.env.length === 0 && (s.tokens.length === 2 || (s.tokens.length === 3 && s.tokens[1] === '--'))

async function planBash(io: Io, root: string, cwd0: string, command: string): Promise<Plan | null> {
  const parsed = parseCommand(command.trim())
  let segs = parsed.segments
  let cwdAbs = cwd0 || root
  let hasCdPrefix = false
  // Leading `cd <dir> &&` segments only move the cwd.
  while (segs.length > 1 && isCdPrefix(segs[0] as Segment)) {
    const dir = (segs[0] as Segment).tokens.at(-1) as string // `cd dir` or `cd -- dir`
    if (dir === '-' || dir.startsWith('~') || dir.includes('$')) return null // not resolvable without guessing
    cwdAbs = dir.startsWith('/') ? dir : `${cwdAbs}/${dir}`
    segs = segs.slice(1)
    hasCdPrefix = true
  }
  if (segs.length === 0) return null
  const rel = relToRoot(root, cwdAbs)
  const cwdRel = rel === null ? cwdAbs : rel
  const stateText = await readRel(io, root, STATE_REL)
  const scripts = rel === null ? null : await packageScripts(io, root, cwdRel)
  const judgment = judge(segs, parsed.isComplex, { scripts, declared: stateText === null ? [] : declaredCommands(stateText) })
  if (judgment === null) return null
  return { cwd: cwdRel === '' ? '.' : cwdRel, cwdAbs, hasCdPrefix, judgment }
}

// ---------------------------------------------------------------------------------------------------------------
// Reading the outcome
// ---------------------------------------------------------------------------------------------------------------

type Outcome = { result: FwTestRun['result']; exitCode: number | null; reason?: string }

type BashResultFields = { interrupted?: boolean; backgroundTaskId?: string; timedOutAfterMs?: number; gitOperation?: { commit?: { sha: string; kind: string } } }

/** What the tool observably did: its exit code when it completed in the foreground, else why there is none. */
export function observe(res: { isError?: boolean; result?: unknown; text?: string }, isBackground: boolean): { exitCode: number | null; reason?: string } {
  if (res.isError === true) {
    const text = typeof res.text === 'string' ? res.text : typeof res.result === 'string' ? res.result : ''
    const m = /^Exit code (\d+)/.exec(text)
    return m ? { exitCode: Number(m[1]) } : { exitCode: null, reason: 'no-exit-code' }
  }
  const r = res.result
  if (r === undefined || r === null || typeof r !== 'object') return { exitCode: null, reason: 'no-result' }
  const b = r as BashResultFields
  if (isBackground || b.backgroundTaskId) return { exitCode: null, reason: 'background' }
  if (b.interrupted === true) return { exitCode: null, reason: 'interrupted' }
  if (b.timedOutAfterMs !== undefined) return { exitCode: null, reason: 'timeout' }
  return { exitCode: 0 }
}

/**
 * pass/fail only for a proven judgment with an observed exit code; everything else is unknown with its reason, and
 * keeps whatever exit code was observed so the reader can weigh it.
 */
export function outcomeOf(j: Judgment, seen: { exitCode: number | null; reason?: string }, hasCdPrefix: boolean): Outcome {
  if (seen.exitCode === null) return { result: 'unknown', exitCode: null, reason: seen.reason ?? 'no-exit-code' }
  if (!j.isProven) return { result: 'unknown', exitCode: seen.exitCode, reason: j.reason ?? 'unproven' }
  if (seen.exitCode === 0) return { result: 'pass', exitCode: 0 }
  if (hasCdPrefix) return { result: 'unknown', exitCode: seen.exitCode, reason: 'cd-prefix' }
  return { result: 'fail', exitCode: seen.exitCode }
}

// ---------------------------------------------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------------------------------------------

const freshLog = (sessionId: string, now: number): FwFlightLog => ({ sessionId, startedAt: now, files: [], shellFiles: [], tests: [], commits: [], dropped: 0 })

/** Applies `change` to this session's log (a log of another session id is replaced: that is the /clear behaviour). */
async function record($: EngineInterface, io: Io, change: (log: FwFlightLog) => void): Promise<void> {
  // Same install test as every feature: no .flightwake/STATE.md under the root → this folder is not ours, keep nothing.
  if ((await fwContext(io)) === null) return
  const sid = await io.sessionId()
  const now = await $.clock.now()
  await update($, flightLog, (cur) => {
    const base = cur !== null && cur.sessionId === sid ? cur : freshLog(sid, now)
    const log: FwFlightLog = { ...base, files: [...base.files], shellFiles: [...(base.shellFiles ?? [])], tests: [...base.tests], commits: [...base.commits] }
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

function touchShellFile(log: FwFlightLog, w: FwShellWrite): void {
  const list = log.shellFiles ?? (log.shellFiles = [])
  const i = list.findIndex((f) => f.path === w.path)
  if (i >= 0) list.splice(i, 1)
  else if (list.length >= CAP_FILES) {
    log.dropped += 1
    return
  }
  list.push(w)
}

/**
 * Candidate files a Bash command wrote, from its words (lib/shell shellWriteTargets), as repo-relative paths. A record
 * would rather miss than misrecord (unlike F4's hints, which would rather over-warn): a relative word is resolved only
 * while the cwd is certain (start, or a leading `cd X &&` chain), and paths outside the repo are dropped. The caller
 * then keeps only what git confirms as changed.
 */
function shellCandidates(root: string, cwd0: string, command: string): Array<{ path: string; via: string }> {
  const out: Array<{ path: string; via: string }> = []
  for (const w of shellWriteTargets(command)) {
    let abs: string
    if (w.path.startsWith('/')) abs = w.path
    else if (w.dir === null) continue // the shell may be anywhere by now: don't guess
    else abs = w.dir.startsWith('/') ? `${w.dir}/${w.path}` : `${cwd0 || root}/${w.dir ? `${w.dir}/` : ''}${w.path}`
    const rel = relToRoot(root, abs)
    if (rel !== null && rel !== '' && !rel.startsWith('.git/') && !out.some((o) => o.path === rel)) out.push({ path: rel, via: w.via })
  }
  return out
}

/**
 * The candidates git reports as changed after the command — modified, added, untracked or deleted (a removal only
 * shows for a tracked file, which is the point). Read-only (--no-optional-locks via io.git; --literal-pathspecs so a
 * path is never a pattern). Not a repo, git failing, or a candidate git does not list → left out.
 */
async function confirmedByGit(io: Io, root: string, candidates: Array<{ path: string; via: string }>): Promise<Array<{ path: string; via: string }>> {
  if (candidates.length === 0) return []
  const out = await io.git(['--literal-pathspecs', 'status', '--porcelain', '-z', '--untracked-files=all', '--', ...candidates.map((c) => c.path)], root)
  if (out === null) return []
  const changed = new Set<string>()
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    // `XY path`; io.git trims the output, so the first entry may have lost the leading space of its status
    const m = /^([ MADRCUT?!]{1,2}) (.+)$/.exec(parts[i] as string)
    if (!m) continue
    changed.add(m[2] as string)
    if (/[RC]/.test((m[1] as string)[0] as string)) { const from = parts[++i]; if (from) changed.add(from) } // rename: the source follows
  }
  return candidates.filter((c) => changed.has(c.path))
}

/** The one-per-session note for a test run that was chained with other commands (its own exit code is not visible). */
const chainHint = (lang: Lang): string => M(lang, {
  en: 'flightwake: this test command ran chained with other commands, so only the whole chain\'s exit code was visible and the run cannot count as passing evidence. When you need evidence (for fw-record\'s tests:), run the test command on its own once.',
  'zh-TW': 'flightwake:這次的測試是和其他指令串在一起跑的,只看得到整串的退出碼,無法當成通過的證據。需要留證據(fw-record 的 tests:)時,請把測試指令單獨執行一次。',
  'zh-CN': 'flightwake:这次的测试是和其他命令串在一起跑的,只看得到整串的退出码,无法当成通过的证据。需要留证据(fw-record 的 tests:)时,请把测试命令单独执行一次。',
  ja: 'flightwake:このテストは他のコマンドとつなげて実行されたため、見えるのはつなげた全体の終了コードだけで、成功の証拠になりません。証拠が必要なとき(fw-record の tests:)は、テストコマンドを単独で一度実行してください。',
})

// ---------------------------------------------------------------------------------------------------------------
// /fw-log
// ---------------------------------------------------------------------------------------------------------------

/** Local UTC offset in minutes (east positive), or null when unknown. */
export type TzOffset = number | null

/** `+0800` → 480; anything else → null. */
export function parseOffset(s: string): TzOffset {
  const m = /^([+-])(\d{2})(\d{2})$/.exec(s.trim())
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null
}

const stamp = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').slice(0, 19)
/** Local time with its offset, then UTC (`2026-10-05 03:32:10 +0800 (19:32:10 UTC)`); UTC only when the offset is unknown. */
export function when(ms: number, tz: TzOffset = null): string {
  if (tz === null) return `${stamp(ms)} UTC`
  const sign = tz < 0 ? '-' : '+'
  const a = Math.abs(tz)
  const off = `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}${String(a % 60).padStart(2, '0')}`
  return `${stamp(ms + tz * 60_000)} ${off} (${stamp(ms).slice(11)} UTC)`
}
const code = (s: string): string => (s.includes('`') ? cell(s) : `\`${cell(s)}\``)

export function renderLog(lang: Lang, log: FwFlightLog | null, tz: TzOffset = null): string {
  const lines: string[] = []
  lines.push(`## ${M(lang, { en: 'flightwake session log', 'zh-TW': 'flightwake 本 session 記錄', 'zh-CN': 'flightwake 本 session 记录', ja: 'flightwake セッション記録' })}`, '')
  const isEmpty = log === null || (log.files.length === 0 && (log.shellFiles ?? []).length === 0 && log.tests.length === 0 && log.commits.length === 0)
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

    const shell = log.shellFiles ?? []
    if (shell.length > 0) {
      lines.push(`### ${M(lang, {
        en: 'Files possibly changed through shell commands — inferred from the commands, may be incomplete',
        'zh-TW': '可能經由 shell 指令改動的檔案——由指令推斷,可能不完整',
        'zh-CN': '可能经由 shell 命令改动的文件——由命令推断,可能不完整',
        ja: 'シェルコマンドで変更された可能性のあるファイル——コマンドから推定、不完全な場合あり',
      })} (${shell.length})`, '')
      for (const f of shell.slice(0, LIST_LIMIT)) lines.push(`- ${code(f.path)} (${f.via}${f.agentId ? `, subagent ${f.agentId}` : ''})`)
      if (shell.length > LIST_LIMIT) lines.push(M(lang, { en: `- … and ${shell.length - LIST_LIMIT} more`, 'zh-TW': `- …另有 ${shell.length - LIST_LIMIT} 個`, 'zh-CN': `- …另有 ${shell.length - LIST_LIMIT} 个`, ja: `- …ほか ${shell.length - LIST_LIMIT} 件` }))
      lines.push('', M(lang, {
        en: 'Read from redirections and cp / mv / rm / tee / sed -i in the commands the agent ran, and listed only where the path could be confirmed (inside the repo, and reported as changed by git afterwards) — so some changes may be missing. Writes made any other way (scripts, other programs, git) are not listed.',
        'zh-TW': '依 agent 執行的指令中的重導向與 cp / mv / rm / tee / sed -i 推斷,且只列出能確認的路徑(在 repo 內、事後 git 也顯示有變更)——所以可能漏記。以其他方式寫入的(腳本、其他程式、git)不會列出。',
        'zh-CN': '依 agent 执行的命令中的重定向与 cp / mv / rm / tee / sed -i 推断,且只列出能确认的路径(在 repo 内、事后 git 也显示有变更)——所以可能漏记。以其他方式写入的(脚本、其他程序、git)不会列出。',
        ja: 'エージェントが実行したコマンドのリダイレクトと cp / mv / rm / tee / sed -i から推定し、確認できたパスだけを載せる(repo 内で、実行後に git が変更ありと示すもの)——そのため漏れがありうる。それ以外の方法(スクリプト、他のプログラム、git)による書き込みは載りません。',
      }), '')
    }

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
        lines.push(`| ${code(r.command)} | ${kind} | ${result} | ${r.exitCode === null ? '-' : r.exitCode} | ${when(r.finishedAt, tz)} | ${rev} | ${code(r.cwd)} | ${r.reason ?? ''}${r.agentId ? `${r.reason ? ' ' : ''}subagent ${r.agentId}` : ''} |`)
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
    for (const c of log.commits) lines.push(`- ${code(c.sha.slice(0, 7))} ${c.kind} ${when(c.at, tz)}${c.agentId ? ` (subagent ${c.agentId})` : ''}`)
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
  }), '', M(lang, {
    en: '`pass` means: a directly called runner ran recognisably and returned 0. It cannot see config files or the outside environment that may keep tests from running (e.g. addopts in pytest.ini, a skip in a build profile), and it is not a guarantee that the tests themselves are meaningful.',
    'zh-TW': '`pass`(通過)的意思是:直接呼叫的 runner 以可辨識的方式執行並回傳 0。它看不到設定檔或外部環境裡會讓測試不執行的設定(例如 pytest.ini 的 addopts、建置 profile 裡的略過設定),也不保證測試內容本身有效。',
    'zh-CN': '`pass`(通过)的意思是:直接调用的 runner 以可辨识的方式执行并返回 0。它看不到配置文件或外部环境里会让测试不执行的设置(例如 pytest.ini 的 addopts、构建 profile 里的跳过设置),也不保证测试内容本身有效。',
    ja: '`pass` の意味:直接呼び出した runner が判別できる形で実行され 0 を返したこと。設定ファイルや外部環境にあるテストを実行させない設定(pytest.ini の addopts、ビルド profile のスキップなど)は見えず、テスト内容そのものが有効である保証でもありません。',
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
    const ctx = await fwContext(io)
    if (ctx === null) {
      isCommandRegistered = false // not installed here: no command (a later record in an installed root registers it)
      return
    }
    const lang = ctx.lang
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
      const ctx = await fwContext(io)
      if (ctx === null) return next(e) // not installed here: as if the command did not exist
      const sid = await io.sessionId()
      const cur = (await $.state.get({ plugin: 'flightwake-mod', key: 'flightLog' } as const)).value ?? null
      const log = cur !== null && cur.sessionId === sid ? cur : null
      // Local offset from the OS (read-only, the person's own clock settings); unknown → UTC only
      let tz: TzOffset = null
      try {
        const r = await $.process.run(['date', '+%z'], { timeoutMs: 2000 })
        if (r.exitCode === 0) tz = parseOffset(r.stdout)
      } catch {}
      return { text: renderLog(ctx.lang, log, tz) }
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
      if (typeof command === 'string' && command.trim() && (await fwContext(ioOf($))) !== null) {
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
    let hint: string | null = null

    try {
      if (res.deny === undefined) {
        const io = ioOf($)
        const finishedAt = await $.clock.now()
        // Files the command wrote, as far as its words say (listed apart from tool edits; F4 reads the same words)
        let shellWrites: Array<{ path: string; via: string }> = []
        let lang: Lang = 'en'
        if (typeof command === 'string' && command.trim()) {
          const ctx = await fwContext(io)
          if (ctx !== null) {
            lang = ctx.lang
            let cwd0 = ctx.root
            try { cwd0 = (await $.session.cwd()).replace(/\/+$/, '') || ctx.root } catch {}
            shellWrites = await confirmedByGit(io, ctx.root, shellCandidates(ctx.root, cwd0, command))
          }
        }
        const agentId = e.agentId
        const commit = res.isError === true ? undefined : (res.result as BashResultFields | undefined)?.gitOperation?.commit
        const runs: FwTestRun[] = []
        if (plan !== null && typeof command === 'string') {
          const j = plan.judgment
          const o = outcomeOf(j, observe(res, isBackground), plan.hasCdPrefix)
          const run: FwTestRun = {
            command: redact(command.trim()),
            kind: j.kind,
            cwd: plan.cwd,
            startedAt,
            finishedAt,
            revision,
            isDirty,
            result: o.result,
            exitCode: o.exitCode,
          }
          if (j.script !== undefined) run.script = redact(j.script, CAP_SCRIPT)
          if (o.reason !== undefined) run.reason = o.reason
          if (agentId !== undefined) run.agentId = agentId
          runs.push(run)
        }
        const isChained = runs.some((r) => r.reason === 'compound')
        if (runs.length > 0 || shellWrites.length > 0 || (commit !== undefined && commit.sha)) {
          await ensureCommand($)
          await record($, io, (log) => {
            for (const w of shellWrites) touchShellFile(log, agentId === undefined ? { ...w, at: finishedAt } : { ...w, at: finishedAt, agentId })
            if (isChained && log.isChainHintShown !== true) {
              log.isChainHintShown = true
              hint = chainHint(lang)
            }
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
    // The chained-run note rides on this tool result (as F4's hints do): it states a fact and what to do, blocks nothing
    if (hint === null || res.deny !== undefined) return res
    return { ...res, context: [...(res.context ?? []), hint] }
  })
}
