/**
 * F8 fleet console — pure helpers over Orca's terminal list (`orca terminal list --json`): which terminals are agents,
 * what state each one is in, how its title reads without the agent's own status marks, and the wrap-up command each
 * agent takes. No `$` here (hooks/lib/core.ts: `$` may not cross an import); features/panel.ts runs `orca` and calls these.
 *
 * Only inside Orca (ORCA_TERMINAL_HANDLE set) and only while the side panel is open. The state read from a title is a
 * heuristic: a Claude Code session with the mod reports its exact state in its fleet file, which wins over the title.
 */
import { M } from './core'
import type { Lang } from './core'

/** How often the console asks Orca for its terminals while the pane is open. */
export const POLL_MS = 10000
/** Output within this long → the agent is taken as working (when nothing more exact is known). */
export const RECENT_OUTPUT_MS = 8000
/** At most this many terminals and repos are shown / read. */
export const TERM_CAP = 60
export const REPO_CAP = 24

export type OrcaTerm = {
  handle: string
  title: string
  agent: string
  worktreePath: string
  lastOutputAt: number | null
}

export type TermState = 'blocked' | 'working' | 'idle' | 'unknown'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const HANDLE_RE = /^term_[A-Za-z0-9-]{1,80}$/

/** The agent terminals in `orca terminal list --json` output (plain shells left out); null when it does not parse. */
export function parseTerminalList(stdout: string): OrcaTerm[] | null {
  let d: unknown
  try { d = JSON.parse(stdout) } catch { return null }
  const list = (d as { result?: { terminals?: unknown } } | null)?.result?.terminals
  if (!Array.isArray(list)) return null
  const out: OrcaTerm[] = []
  for (const t of list as Record<string, unknown>[]) {
    if (!t || typeof t !== 'object') continue
    const agent = typeof t.agentIdentity === 'string' ? t.agentIdentity : ''
    const handle = typeof t.handle === 'string' ? t.handle : ''
    if (agent === '' || !HANDLE_RE.test(handle) || t.connected === false || t.orphaned === true) continue
    out.push({
      handle,
      title: typeof t.title === 'string' ? t.title : '',
      agent,
      worktreePath: typeof t.worktreePath === 'string' ? t.worktreePath.replace(/\/+$/, '') : '',
      lastOutputAt: isNum(t.lastOutputAt) ? t.lastOutputAt : null,
    })
    if (out.length >= TERM_CAP) break
  }
  return out
}

const CLAUDE_IDLE = '✳'
/** Claude Code's title while a turn runs (observed 2026-10-11: `◐ <task>`; braille frames in other builds). */
const SPINNER_RE = /^[◐◓◑◒⠀-⣿]/u
const CODEX_ACTION_RE = /^\[\s*\.?\s*\]\s*Action Required\s*\|\s*/i

/** The title as the person named the task: the agent's status mark, Codex's "Action Required" and its ` | <repo>` tail removed. */
export function cleanTitle(t: OrcaTerm): string {
  let s = t.title.trim()
  s = s.replace(CODEX_ACTION_RE, '')
  s = s.replace(/^[✳◐◓◑◒⠀-⣿]\s*/u, '')
  const repo = baseName(t.worktreePath)
  for (let i = 0; i < 2 && repo && s.endsWith(` | ${repo}`); i++) s = s.slice(0, -` | ${repo}`.length)
  return s.trim() || '—'
}

/** The state read from what Orca shows: a title mark first, then how recently the terminal printed. */
export function termState(t: OrcaTerm, now: number): TermState {
  const title = t.title.trim()
  if (CODEX_ACTION_RE.test(title) || /Action Required/i.test(title)) return 'blocked'
  if (t.agent === 'claude') {
    if (title.startsWith(CLAUDE_IDLE)) return 'idle'
    if (SPINNER_RE.test(title)) return 'working'
  }
  if (t.lastOutputAt === null) return 'unknown'
  return now - t.lastOutputAt <= RECENT_OUTPUT_MS ? 'working' : 'idle'
}

export const baseName = (p: string): string => {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/** The wrap-up command an agent takes in its prompt, or null when flightwake has none for it. */
export function wrapUpCommand(agent: string): string | null {
  if (agent === 'claude') return '/fw-record'
  if (agent === 'codex') return '$fw-record'
  return null
}

/** Codex's `$` opens its skill picker, which takes the Enter sent with the text: wait this long, then read the composer back. */
export const SUBMIT_CHECK_MS = 800

/** The composer text in `orca terminal read --json` output (UI-only, never part of the tail), trimmed; null when none. */
export function draftOf(stdout: string | null): string | null {
  if (stdout === null) return null
  let d: unknown
  try { d = JSON.parse(stdout) } catch { return null }
  const draft = (d as { result?: { terminal?: { draft?: unknown } } } | null)?.result?.terminal?.draft
  return typeof draft === 'string' && draft.trim() !== '' ? draft.trim() : null
}

/** A context bar of `width` cells: filled / empty strings and the colour band (≥80 red, ≥60 yellow). */
export function contextBar(percent: number, width = 10): { filled: string; empty: string; color: 'green' | 'yellow' | 'red' } {
  const p = Math.max(0, Math.min(100, percent))
  const n = Math.round((p / 100) * width)
  return { filled: '█'.repeat(n), empty: '░'.repeat(width - n), color: p >= 80 ? 'red' : p >= 60 ? 'yellow' : 'green' }
}

/** Agent display name. */
export const agentName = (agent: string): string => (agent === 'claude' ? 'Claude' : agent === 'codex' ? 'Codex' : agent)

const ORDER: Record<TermState, number> = { blocked: 0, working: 1, idle: 2, unknown: 3 }

/** Terminals grouped by repo (worktree path): repos with a blocked agent first, then working; inside, blocked → idle. */
export function groupByRepo<T extends { term: OrcaTerm; state: TermState }>(rows: readonly T[]): { path: string; rows: T[] }[] {
  const by = new Map<string, T[]>()
  for (const r of rows) {
    const k = r.term.worktreePath
    const list = by.get(k)
    if (list) list.push(r)
    else by.set(k, [r])
  }
  const groups = [...by.entries()].map(([path, rs]) => ({ path, rows: [...rs].sort((a, b) => ORDER[a.state] - ORDER[b.state]) }))
  const rank = (g: { rows: T[] }) => Math.min(...g.rows.map((r) => ORDER[r.state]))
  return groups.sort((a, b) => rank(a) - rank(b) || baseName(a.path).localeCompare(baseName(b.path)))
}

type L<V> = Record<Lang, V>
const L4 = <V>(m: L<V>): L<V> => m

export const T = {
  fleet: L4({ en: 'Fleet', 'zh-TW': '機隊', 'zh-CN': '机队', ja: 'フリート' }),
  thisRepo: L4({ en: 'This repo', 'zh-TW': '本 repo', 'zh-CN': '本 repo', ja: 'このリポジトリ' }),
  you: L4({ en: 'this session', 'zh-TW': '本 session', 'zh-CN': '本 session', ja: 'このセッション' }),
  jump: L4({ en: 'go', 'zh-TW': '跳過去', 'zh-CN': '跳过去', ja: '移動' }),
  wrap: L4({ en: 'wrap up', 'zh-TW': '收尾', 'zh-CN': '收尾', ja: '締め' }),
  confirm: L4<(cmd: string) => string>({ en: (c) => `send ${c}`, 'zh-TW': (c) => `確定送出 ${c}`, 'zh-CN': (c) => `确定发送 ${c}`, ja: (c) => `${c} を送る` }),
  cancel: L4({ en: 'cancel', 'zh-TW': '取消', 'zh-CN': '取消', ja: 'やめる' }),
  sent: L4<(cmd: string, who: string) => string>({
    en: (c, w) => `sent ${c} to ${w}`, 'zh-TW': (c, w) => `已送 ${c} 給 ${w}`, 'zh-CN': (c, w) => `已发 ${c} 给 ${w}`, ja: (c, w) => `${w} に ${c} を送った`,
  }),
  notIdle: L4<(who: string) => string>({
    en: (w) => `${w} is not idle any more — nothing sent`, 'zh-TW': (w) => `${w} 已不是閒置——沒有送出`, 'zh-CN': (w) => `${w} 已不是闲置——没有发送`, ja: (w) => `${w} はもう待機中ではない——送信しなかった`,
  }),
  failed: L4<(what: string) => string>({ en: (w) => `orca: ${w} failed`, 'zh-TW': (w) => `orca:${w} 失敗`, 'zh-CN': (w) => `orca:${w} 失败`, ja: (w) => `orca:${w} に失敗` }),
  noOrca: L4({ en: 'Orca did not answer — showing Claude Code sessions from their own reports', 'zh-TW': 'Orca 沒有回應——改列 Claude Code session 自己的回報', 'zh-CN': 'Orca 没有响应——改列 Claude Code session 自己的上报', ja: 'Orca が応答しない——Claude Code セッションの自己報告を表示' }),
  outsideOrca: L4({ en: 'outside Orca: Claude Code sessions with the mod only', 'zh-TW': '不在 Orca 裡:只列有裝 mod 的 Claude Code session', 'zh-CN': '不在 Orca 里:只列有装 mod 的 Claude Code session', ja: 'Orca の外:mod 入りの Claude Code セッションのみ' }),
  waitingFirst: L4({ en: 'asking Orca…', 'zh-TW': '正在問 Orca…', 'zh-CN': '正在问 Orca…', ja: 'Orca に問い合わせ中…' }),
  stateHeuristic: L4({ en: 'Codex and other agents: state read from the tab title and output', 'zh-TW': 'Codex 等:狀態由分頁標題與輸出推斷', 'zh-CN': 'Codex 等:状态由标签标题与输出推断', ja: 'Codex など:状態はタブ名と出力から推定' }),
  noAgents: L4({ en: 'no agent terminals', 'zh-TW': '沒有 agent 分頁', 'zh-CN': '没有 agent 标签', ja: 'エージェントのタブなし' }),
}

/** State words, shared with /fw-fleet's vocabulary plus `unknown`. */
export const stateWord = (lang: Lang, s: TermState): string => M(lang, {
  blocked: { en: 'waiting on you', 'zh-TW': '等你回覆', 'zh-CN': '等你回复', ja: '応答待ち' },
  working: { en: 'working', 'zh-TW': '工作中', 'zh-CN': '工作中', ja: '作業中' },
  idle: { en: 'idle', 'zh-TW': '閒置', 'zh-CN': '闲置', ja: '待機' },
  unknown: { en: 'unknown', 'zh-TW': '不明', 'zh-CN': '不明', ja: '不明' },
}[s])
