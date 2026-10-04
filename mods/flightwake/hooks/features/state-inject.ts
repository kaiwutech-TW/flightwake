/**
 * F1 STATE snapshot into the system prompt (docs/plans/mods.md, revised; DECISIONS 2026-10-05).
 * One snapshot per session id, taken on session.start (pre-warm) or lazily on the first prompt.compose, then
 * reused: the section never changes mid-session, so the prompt cache behind it stays valid. /clear (session.end
 * reason 'clear') drops it; the next compose retakes it under the new id. Read-only; a failure injects nothing.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { M, STATE_REL, fwContext, isUninitializedState, readRel } from '../lib/core'
import type { Io, Lang } from '../lib/core'

const SECTION_ID = 'flightwake-mod:state'
/** DECISIONS 2026-10-05: STATE text over this many characters is injected condensed. */
const LIMIT = 6000

const snapshotRef = atom({ plugin: 'flightwake-mod', key: 'stateSnapshot' } as const, null)

type Snap = { sessionId: string; text: string | null }

// Local copy of IO_OF_TEMPLATE (hooks/lib/core.ts): `$` must not cross an import.
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

/** STATE split into its frontmatter block and its top-level "# " sections (comments and fenced code ignored). */
function splitState(text: string): { front: string; sections: string[] } {
  const lines = text.split(/\r?\n/)
  let i = 0
  let front: string[] = []
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---')
    if (end > 0) { front = lines.slice(0, end + 1); i = end + 1 }
  }
  const sections: string[][] = []
  let inComment = false
  let inFence = false
  for (; i < lines.length; i++) {
    const line = lines[i] ?? ''
    let isHeading = false
    if (inComment) {
      if (line.includes('-->')) inComment = false
    } else if (inFence) {
      if (/^\s*(```|~~~)/.test(line)) inFence = false
    } else if (/^\s*(```|~~~)/.test(line)) {
      inFence = true
    } else if (line.trimStart().startsWith('<!--')) {
      if (!line.includes('-->')) inComment = true
    } else if (/^# /.test(line)) {
      isHeading = true
    }
    if (isHeading) sections.push([line])
    else sections[sections.length - 1]?.push(line)
  }
  return { front: front.join('\n'), sections: sections.map((s) => s.join('\n').replace(/\s+$/, '')) }
}

/** `text` cut at a line boundary to at most `max` characters (the "…" marker included); unchanged when it fits. */
function trimLines(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, Math.max(0, max - 2))
  const nl = cut.lastIndexOf('\n')
  return `${nl > 0 ? cut.slice(0, nl) : cut}\n…`
}

/** The condensed STATE: frontmatter (health), the 2nd and 3rd top-level sections, each trimmed if still over LIMIT. */
function condense(text: string): string {
  const { front, sections } = splitState(text)
  const kept = [sections[1], sections[2]].filter((s): s is string => typeof s === 'string')
  const frontKept = front ? trimLines(front, 1500) : ''
  const join = (b: string[]) => [frontKept, ...b].filter(Boolean).join('\n\n')
  if (join(kept).length <= LIMIT) return join(kept)
  const budget = LIMIT - frontKept.length - 2 * (kept.length + 1)
  if (kept.length === 0) return join([trimLines(sections.join('\n\n') || text, Math.max(200, budget))])
  const each = Math.max(200, Math.floor(budget / kept.length))
  return join(kept.map((s) => trimLines(s, each)))
}

function snapshotText(lang: Lang, state: string): string {
  if (isUninitializedState(state)) {
    return M(lang, {
      en: 'flightwake: .flightwake/STATE.md is not initialized yet. Run /fw-coldstart first.',
      'zh-TW': 'flightwake:.flightwake/STATE.md 尚未初始化,請先執行 /fw-coldstart。',
      'zh-CN': 'flightwake:.flightwake/STATE.md 尚未初始化,请先执行 /fw-coldstart。',
      ja: 'flightwake: .flightwake/STATE.md はまだ初期化されていません。先に /fw-coldstart を実行してください。',
    })
  }
  const header = M(lang, {
    en: 'flightwake: this is .flightwake/STATE.md as of the last wrap-up, a snapshot taken at session start. Check the git state before acting on it. /fw-coldstart still checks how far STATE lags and reads the latest record.',
    'zh-TW': 'flightwake:以下是 .flightwake/STATE.md 在上次收尾時的內容,於 session 開始時取的快照。動手前請先核對 git 狀態。落後量檢查與最新 record 的閱讀仍由 /fw-coldstart 負責。',
    'zh-CN': 'flightwake:以下是 .flightwake/STATE.md 在上次收尾时的内容,于 session 开始时取的快照。动手前请先核对 git 状态。落后量检查与最新 record 的阅读仍由 /fw-coldstart 负责。',
    ja: 'flightwake: 以下は前回の締め時点の .flightwake/STATE.md で、セッション開始時に取ったスナップショットです。作業の前に git の状態を確認してください。遅れの確認と最新 record の読み込みは引き続き /fw-coldstart が行います。',
  })
  if (state.length <= LIMIT) return `${header}\n\n${state.replace(/\s+$/, '')}`
  const n = state.length
  const note = M(lang, {
    en: `(condensed; full file at ${STATE_REL} (${n} characters, over ${LIMIT}); read it when needed. Consider compacting STATE.)`,
    'zh-TW': `(已精簡;完整內容見 ${STATE_REL}(${n} 字元,超過 ${LIMIT});需要時請讀取原檔。建議壓實 STATE。)`,
    'zh-CN': `(已精简;完整内容见 ${STATE_REL}(${n} 字符,超过 ${LIMIT});需要时请读取原文件。建议压实 STATE。)`,
    ja: `(要約済み。全文は ${STATE_REL}(${n} 文字、上限 ${LIMIT} 超)にあります。必要なときに読んでください。STATE の圧縮を検討してください。)`,
  })
  return `${header}\n\n${condense(state)}\n\n${note}`
}

async function takeText(io: Io): Promise<string | null> {
  const ctx = await fwContext(io)
  if (!ctx) return null
  const state = await readRel(io, ctx.root, STATE_REL)
  return state === null ? null : snapshotText(ctx.lang, state)
}

/** The snapshot for the current session id: kept when it already exists, otherwise taken now and stored. */
async function ensureSnapshot($: EngineInterface): Promise<Snap | null> {
  const io = ioOf($)
  const id = await io.sessionId()
  if (!id) return null
  const cur = (await read($, snapshotRef)) as Snap | null
  if (cur && cur.sessionId === id) return cur
  const fresh: Snap = { sessionId: id, text: await takeText(io) }
  // A concurrent taker (session.start vs. the first compose) may have stored one meanwhile: that one wins.
  await update($, snapshotRef, (c) => ((c as Snap | null)?.sessionId === id ? c : fresh))
  return ((await read($, snapshotRef)) as Snap | null) ?? fresh
}

export function registerStateInject(on: On): void {
  on('session.start', {}, async ($, e, next) => {
    const r = await next(e)
    try { await ensureSnapshot($) } catch {}
    return r
  })

  on('session.end', {}, async ($, e, next) => {
    if (e.reason === 'clear') {
      try { await update($, snapshotRef, () => null) } catch {}
    }
    return next(e)
  })

  on('prompt.compose', {}, async ($, e, next) => {
    const r = await next(e)
    if (e.traits.includes('bare')) return r
    try {
      const snap = await ensureSnapshot($)
      if (!snap || !snap.text) return r
      return { sections: [...r.sections.filter((s) => s.id !== SECTION_ID), { id: SECTION_ID, text: snap.text, scope: 'session' as const }] }
    } catch {
      return r
    }
  })
}
