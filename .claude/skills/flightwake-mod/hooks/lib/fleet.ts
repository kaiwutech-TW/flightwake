/**
 * F7 fleet — pure helpers: where session files live, the `flightwake.session/1` record, how a reader derives what
 * to show (working / blocked / idle / stale / ended / unknown), the resume hint's choice, and every F7 message in
 * the four install languages. No `$` here (hooks/lib/core.ts: `$` may not cross an import); features/fleet.ts reads
 * and writes the world and calls these.
 *
 * The base-dir rule, the file-name rule and the constants below are mirrored in bin/fleet.mjs and
 * hooks/statusline.mjs (test/smoke.sh greps that the constants match). Change all three together.
 */
import { M, relToRoot, tableCell } from './core'
import type { Lang } from './core'

// ── constants (mirrored in bin/fleet.mjs and hooks/statusline.mjs) ──────────────────────────────────────────────
export const SCHEMA = 'flightwake.session/1'
export const HEARTBEAT_MS = 30000
export const STALE_FACTOR = 4
export const STALE_FLOOR_MS = 90000
export const CLOCK_SKEW_MS = 60000
export const BLOCKED_ALERT_MS = 2000
export const HINT_WINDOW_MS = 7 * 86400000
export const LIST_WINDOW_MS = 7 * 86400000
export const LIST_WINDOW_ALL_MS = 30 * 86400000
export const LIST_CAP = 200
/** The first mod version that writes session files (what the empty /fw-fleet message names as the minimum). */
export const FLEET_SINCE = '0.2.0'
/** /fw-fleet: ended rows shown without / with `all`. */
export const ENDED_CAP = 10
export const ENDED_CAP_ALL = 500
/** The resume hint waits this long after session.start (it reads the folder; the session should be up first). */
export const HINT_DELAY_MS = 1500
export const HINT_TOAST_MS = 12000

// ── base directory and names (mirrors bin/fleet.mjs and hooks/statusline.mjs) ──────────────────────────────────
export type FleetEnv = { FLIGHTWAKE_HOME?: string | undefined; HOME?: string | undefined; USERPROFILE?: string | undefined }

export const isAbsolutePath = (p: string): boolean => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)
const stripTrailingSlash = (p: string): string => (p.length > 1 ? p.replace(/[\\/]+$/, '') : p) || p

/**
 * The folder session files live under: an absolute FLIGHTWAKE_HOME, else `<HOME or USERPROFILE>/.flightwake` when
 * that home is absolute; null when neither is usable. An empty or relative FLIGHTWAKE_HOME is ignored, and a
 * relative home gives null: a relative path would resolve against the working directory, which is the repo.
 */
export function fleetBase(env: FleetEnv): string | null {
  const fh = env.FLIGHTWAKE_HOME
  if (typeof fh === 'string' && fh !== '' && isAbsolutePath(fh)) return stripTrailingSlash(fh)
  const h = env.HOME || env.USERPROFILE
  if (typeof h === 'string' && h !== '' && isAbsolutePath(h)) return `${stripTrailingSlash(h)}/.flightwake`
  return null
}

export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
export const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/
export const isSafeId = (id: unknown): id is string => typeof id === 'string' && ID_RE.test(id)
export const sessionsDirOf = (base: string): string => `${base}/sessions`
/** `<base>/sessions/<id>.json`, or null when the id cannot be a file name. */
export const fleetFilePath = (base: string, id: string): string | null => (isSafeId(id) ? `${sessionsDirOf(base)}/${id}.json` : null)

/** The path itself, then each folder above it up to the root (`/a/b` → `/a/b`, `/a`, `/`; `C:\a` → `C:\a`, `C:`). */
export function selfAndAncestors(p: string): string[] {
  const out: string[] = []
  let cur = p.length > 1 ? p.replace(/[\\/]+$/, '') : p
  while (cur !== '' && out.length < 64) {
    out.push(cur)
    if (cur === '/' || /^[A-Za-z]:$/.test(cur)) break
    const i = Math.max(cur.lastIndexOf('/'), cur.lastIndexOf('\\'))
    if (i < 0) break
    cur = i === 0 ? '/' : cur.slice(0, i)
  }
  return out
}

/**
 * What marks a base as somebody's repo or records (bin/fleet.mjs fleetDirInRepo applies the same rule):
 * `<base>/STATE.md` (a flightwake records folder, e.g. FLIGHTWAKE_HOME=<repo>/.flightwake, or a repo installed at
 * $HOME), and `<p>/.git` and `<p>/.flightwake/STATE.md` for the base and every folder above it (the second catches a
 * flightwake root with no git, reached through a link or a case alias, which a spelling check cannot see). The mod
 * writes nowhere such a probe exists, or where one cannot be answered.
 */
export const repoMarkersOf = (base: string): string[] => [
  `${base}/STATE.md`,
  ...selfAndAncestors(base).flatMap((a) => (a === '/' ? ['/.git', '/.flightwake/STATE.md'] : [`${a}/.git`, `${a}/.flightwake/STATE.md`])),
]

/** A file that is ours: parses with our schema prefix, or (a torn write of ours) begins with it. */
export const OURS_PREFIX_RE = /^\s*\{\s*"schema"\s*:\s*"flightwake\.session\//
export const isOursText = (text: string): boolean => isFleetFile(text) || OURS_PREFIX_RE.test(text)

/**
 * A short fingerprint of a tool's input, held in module memory only (never written): it pairs a PermissionRequest
 * (which has no tool_use_id) with the `tool.check` ask of the same call. Keys sorted, so the order does not matter;
 * null when the input cannot be serialised.
 */
export function inputPrint(input: unknown): string | null {
  const canon = (v: unknown, depth: number): unknown => {
    if (depth > 32) throw new Error('deep')
    if (Array.isArray(v)) return v.map((x) => canon(x, depth + 1))
    if (v !== null && typeof v === 'object') {
      const o: Record<string, unknown> = {}
      for (const key of Object.keys(v as object).sort()) o[key] = canon((v as Record<string, unknown>)[key], depth + 1)
      return o
    }
    return v
  }
  let text: string | undefined
  try { text = JSON.stringify(canon(input, 0)) } catch { return null }
  if (typeof text !== 'string') return null
  let h = 0x811c9dc5 // FNV-1a, 32 bits
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return `${text.length.toString(36)}.${h.toString(36)}`
}

/**
 * The transcript path a record names, only when it is a Claude transcript of that very session under the reader's
 * home (`<home>/.claude/projects/<key>/<sessionId>.jsonl`); anything else is never looked at (a record is another
 * process's file, so the path it names is not trusted). Mirrors bin/fleet.mjs.
 */
export function transcriptOf(rec: { transcript?: unknown; sessionId?: unknown }, home: string | null): string | null {
  const t = rec.transcript
  if (!home || typeof t !== 'string' || !isSafeId(rec.sessionId)) return null
  const pre = `${home.replace(/[\\/]+$/, '')}/.claude/projects/`
  if (!t.startsWith(pre)) return null
  const m = /^[A-Za-z0-9-]+\/([^/\\]+)\.jsonl$/.exec(t.slice(pre.length))
  return m !== null && m[1] === rec.sessionId ? t : null
}

// ── the record (flightwake.session/1; additive-only) ───────────────────────────────────────────────────────────
export type FleetState = 'working' | 'blocked' | 'idle' | 'ended'
export type Display = FleetState | 'stale' | 'unknown'
export type BlockedKind = 'permission' | 'question' | 'plan'
export type Blocked = { kind: BlockedKind; tool: string; target: string | null; agent: boolean; since: number }
export type Activity = { tool: string; target: string | null; agent: boolean; at: number }
export type LastTurn = { reason: string; at: number; durationMs: number }
export type Ended = { reason: string; at: number; stateAtEnd: 'working' | 'blocked' | 'idle' }
export type Parent = { sessionId: string; via: string }
export type Host = { orcaTerminal?: string; orcaWorkspace?: string; tmuxPane?: string }

export type SessionRec = {
  schema: string
  mod: string
  sessionId: string
  instance: string
  state: FleetState
  why: string
  stateSince: number
  seq: number
  heartbeatAt: number
  heartbeatMs: number
  startedAt: number
  root: string
  repoRoot: string | null
  launchCwd: string
  lang: Lang
  surface: string | null
  blocked: Blocked | null
  activity: Activity | null
  inFlight: number
  turns: number
  lastTurn: LastTurn | null
  ended: Ended | null
  resume: { id: string; resumable: boolean }
  transcript: string | null
  parent: Parent | null
  contested: boolean
  host: Host
  /** Added in mod 0.3.0 (additive): context use at the last turn or heartbeat, the seat role, the flightwake install version. */
  context: { percent: number } | null
  role: string | null
  fwVersion: string | null
}

/** Every key of a record, in the order written (spec §3). */
export const RECORD_KEYS = [
  'schema', 'mod', 'sessionId', 'instance', 'state', 'why', 'stateSince', 'seq', 'heartbeatAt', 'heartbeatMs',
  'startedAt', 'root', 'repoRoot', 'launchCwd', 'lang', 'surface', 'blocked', 'activity', 'inFlight', 'turns',
  'lastTurn', 'ended', 'resume', 'transcript', 'parent', 'contested', 'host', 'context', 'role', 'fwVersion',
] as const satisfies readonly (keyof SessionRec)[]

/** The record with its keys in RECORD_KEYS order (every key present; null where unknown). */
export function buildRecord(r: SessionRec): SessionRec {
  const out: Record<string, unknown> = {}
  for (const k of RECORD_KEYS) out[k] = r[k] === undefined ? null : r[k]
  return out as SessionRec
}

export const recordText = (r: SessionRec): string => `${JSON.stringify(buildRecord(r), null, 2)}\n`

/** state = ended ? ended : evidence ? blocked : (turn open or compacting) ? working : idle. */
export function deriveState(f: { isEnded: boolean; evidence: number; turnOpen: boolean; compacting: boolean }): FleetState {
  return f.isEnded ? 'ended' : f.evidence > 0 ? 'blocked' : f.turnOpen || f.compacting ? 'working' : 'idle'
}

/** A turn.complete reason as stored: raw when it is a plain word, else "answer". */
export const turnReason = (r: unknown): string => (typeof r === 'string' && /^[a-z_]{1,32}$/.test(r) ? r : 'answer')

/** The parsed record, or null when the text is not a JSON object (a torn write, a foreign file). */
export function parseRec(text: string): SessionRec | null {
  try {
    const j: unknown = JSON.parse(text)
    return j !== null && typeof j === 'object' && !Array.isArray(j) ? (j as SessionRec) : null
  } catch {
    return null
  }
}

/** True when the text is one of ours (any major): an object whose `schema` starts with `flightwake.session/`. */
export function isFleetFile(text: string): boolean {
  const r = parseRec(text)
  return r !== null && typeof r.schema === 'string' && r.schema.startsWith('flightwake.session/')
}

/** The schema's major version (`flightwake.session/1` → 1), or null. */
export function schemaMajor(rec: { schema?: unknown }): number | null {
  const m = typeof rec.schema === 'string' ? /^flightwake\.session\/(\d+)(?:\.\d+)*$/.exec(rec.schema) : null
  return m && m[1] !== undefined ? Number(m[1]) : null
}

// ── readers: display, stale, resume (mirrors bin/fleet.mjs; the gauge keeps its own subset) ───────────────────
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const STATES: readonly string[] = ['working', 'blocked', 'idle', 'ended']

/** How long without a heartbeat before a record is stale: max(4 × heartbeatMs clamped to 5 s–10 min, 90 s). */
export function staleAfter(rec: { heartbeatMs?: unknown }): number {
  const hb = isNum(rec.heartbeatMs) ? rec.heartbeatMs : HEARTBEAT_MS
  return Math.max(STALE_FACTOR * Math.min(Math.max(hb, 5000), 600000), STALE_FLOOR_MS)
}

/** What a reader shows; a stale record is never shown as working or blocked. */
export function displayOf(rec: SessionRec, now: number): Display {
  if (schemaMajor(rec) !== 1 || !STATES.includes(rec.state as string) || rec.contested === true) return 'unknown'
  if (!isNum(rec.heartbeatAt) || rec.heartbeatAt > now + CLOCK_SKEW_MS) return 'unknown'
  if (rec.state === 'ended') return 'ended'
  if (now - rec.heartbeatAt > staleAfter(rec)) return 'stale'
  return rec.state
}

export function resumableOf(rec: SessionRec, now: number): boolean {
  const d = displayOf(rec, now)
  if (d !== 'ended' && d !== 'stale') return false
  if (rec.resume?.resumable !== true || !isSafeId(rec.resume?.id)) return false
  // the process moved on under a successor id: that one is the session to go back to
  return !(d === 'ended' && (rec.ended?.reason === 'clear' || rec.ended?.reason === 'resume'))
}

export const uncleanOf = (rec: SessionRec, now: number): boolean => {
  const d = displayOf(rec, now)
  return d === 'stale' || (d === 'ended' && rec.ended?.reason === 'other')
}

export const lastSeen = (rec: SessionRec): number => (isNum(rec.ended?.at) ? rec.ended.at : isNum(rec.heartbeatAt) ? rec.heartbeatAt : 0)

/** POSIX single-quoting. */
export const shq = (s: string): string => `'${s.replaceAll("'", "'\\''")}'`

/**
 * `claude --resume <id>`, prefixed with `cd '<launchCwd>' && ` when the record was launched elsewhere
 * (`myLaunchCwd` null = always prefix, as the CLI does). Null when the id is not a safe file-name id.
 */
export function resumeCmd(rec: SessionRec, myLaunchCwd: string | null): string | null {
  const id = rec.resume?.id
  if (!isSafeId(id)) return null
  const cmd = `claude --resume ${id}`
  const at = rec.launchCwd
  return typeof at === 'string' && at !== '' && at !== myLaunchCwd ? `cd ${shq(at)} && ${cmd}` : cmd
}

const baseName = (p: unknown): string => {
  if (typeof p !== 'string' || p === '') return '?'
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}
const cut = (s: string, n: number): string => {
  const cps = Array.from(s)
  return cps.length <= n ? s : `${cps.slice(0, n - 1).join('')}…`
}

/** `basename(root)`, or `repo ⎇ worktree` when the root is a linked worktree; at most 24 characters. */
export function repoLabel(rec: SessionRec, max = 24): string {
  const r = rec.root
  const rr = rec.repoRoot
  const label = typeof rr === 'string' && rr !== '' && rr !== r ? `${baseName(rr)} ⎇ ${baseName(r)}` : baseName(r)
  return cut(label, max)
}

/** 45s · 12m · 3h (under 48 h) · 2d — the same in every language. */
export function fmtAge(ms: number): string {
  const s = Math.max(0, Math.floor((isNum(ms) ? ms : 0) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/** A path shown with `~` when it lies under home. */
export function tildePath(p: string, home: string | null | undefined): string {
  if (!home) return p
  const h = home.replace(/[\\/]+$/, '')
  return h !== '' && (p === h || p.startsWith(`${h}/`)) ? `~${p.slice(h.length)}` : p
}

const TARGET_TOOLS: readonly string[] = ['Edit', 'Write', 'MultiEdit', 'Read', 'NotebookEdit']

/**
 * The repo-relative file a call names, for Edit / Write / MultiEdit / Read / NotebookEdit only; null for every other
 * tool and for any path outside root (never written).
 */
export function targetOf(tool: string, input: unknown, root: string): string | null {
  if (!TARGET_TOOLS.includes(tool) || !root || input === null || typeof input !== 'object') return null
  const i = input as { file_path?: unknown; notebook_path?: unknown }
  const abs = typeof i.file_path === 'string' ? i.file_path : typeof i.notebook_path === 'string' ? i.notebook_path : null
  if (abs === null || !isAbsolutePath(abs)) return null
  const rel = relToRoot(root, abs)
  return rel === null || rel === '' ? null : rel
}

// ── listing ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type ListEntry = { name: string; kind: string; isLink: boolean; mtimeMs: number }

/**
 * Which files of the sessions folder to read: regular files (not links) named `<id>.json`, modified inside the
 * window, newest `cap` first. `skipped` counts the matching names left out (too old or past the cap).
 */
export function selectFiles(entries: readonly ListEntry[], now: number, windowMs: number, cap = LIST_CAP): { names: string[]; skipped: number } {
  const ok = entries.filter((e) => e.kind === 'file' && e.isLink !== true && FILE_RE.test(e.name))
  const inWindow = ok.filter((e) => isNum(e.mtimeMs) && e.mtimeMs >= now - windowMs).sort((a, b) => b.mtimeMs - a.mtimeMs)
  const names = inWindow.slice(0, cap).map((e) => e.name)
  return { names, skipped: ok.length - names.length }
}

// ── sorting ─────────────────────────────────────────────────────────────────────────────────────────────────────
const GROUP: Record<Display, number> = { blocked: 0, working: 1, idle: 2, stale: 3, ended: 4, unknown: 5 }

/** blocked (longest waiting first) → working (newest) → idle (oldest) → stale (newest) → ended (newest) → unknown. */
export function sortFleet<R extends { rec: SessionRec; display: Display }>(rows: readonly R[]): R[] {
  const key = (r: R): number => {
    const x = r.rec
    switch (r.display) {
      case 'blocked': return isNum(x.blocked?.since) ? x.blocked.since : isNum(x.stateSince) ? x.stateSince : 0
      case 'working': return -(isNum(x.stateSince) ? x.stateSince : 0)
      case 'idle': return isNum(x.stateSince) ? x.stateSince : 0
      case 'stale': return -(isNum(x.heartbeatAt) ? x.heartbeatAt : 0)
      case 'ended': return -(isNum(x.ended?.at) ? x.ended.at : 0)
      default: return -(isNum(x.heartbeatAt) ? x.heartbeatAt : 0)
    }
  }
  return [...rows].sort((a, b) => GROUP[a.display] - GROUP[b.display] || key(a) - key(b))
}

/** What the `for` column measures from. */
export function ageOf(rec: SessionRec, display: Display, now: number): number {
  const from = display === 'blocked' ? rec.blocked?.since ?? rec.stateSince
    : display === 'working' || display === 'idle' ? rec.stateSince
      : display === 'ended' ? rec.ended?.at ?? rec.heartbeatAt
        : rec.heartbeatAt
  return isNum(from) ? Math.max(0, now - from) : 0
}

/** Live and blocked counts of the other sessions (display-based, as /fw-fleet counts them). */
export function countOthers(recs: readonly SessionRec[], myId: string, now: number): { live: number; blocked: number } {
  let live = 0
  let blocked = 0
  for (const r of recs) {
    if (r.sessionId === myId) continue
    const d = displayOf(r, now)
    if (d === 'working' || d === 'blocked' || d === 'idle') live += 1
    if (d === 'blocked') blocked += 1
  }
  return { live, blocked }
}

/** One other live session as the side panel lists it (no paths, no prompt or command text). */
export type OtherRow = {
  label: string
  display: 'working' | 'blocked' | 'idle'
  blockedKind: BlockedKind | null
  ageMs: number
  contextPercent: number | null
  role: string | null
  fwVersion: string | null
  mod: string | null
  orcaTerminal: string | null
}

const str = (v: unknown, max = 64): string | null => (typeof v === 'string' && v !== '' ? cut(v, max) : null)

/** The other live sessions in /fw-fleet order (blocked first), at most `cap`. */
export function otherRows(recs: readonly SessionRec[], myId: string, now: number, cap = 8): OtherRow[] {
  const rows: { rec: SessionRec; display: Display }[] = []
  for (const rec of recs) {
    if (rec.sessionId === myId) continue
    const display = displayOf(rec, now)
    if (display === 'working' || display === 'blocked' || display === 'idle') rows.push({ rec, display })
  }
  return sortFleet(rows).slice(0, cap).map(({ rec, display }) => ({
    label: repoLabel(rec),
    display: display as OtherRow['display'],
    blockedKind: display === 'blocked' ? rec.blocked?.kind ?? null : null,
    ageMs: ageOf(rec, display, now),
    // pre-0.3.0 writers have none of these: null, never a guess
    contextPercent: isNum(rec.context?.percent) ? rec.context.percent : null,
    role: str(rec.role, 40),
    fwVersion: str(rec.fwVersion, 32),
    mod: str(rec.mod, 32),
    orcaTerminal: typeof rec.host?.orcaTerminal === 'string' && /^term_[A-Za-z0-9-]{1,80}$/.test(rec.host.orcaTerminal) ? rec.host.orcaTerminal : null,
  }))
}

// ── resume hint ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Records that may be offered as "pick it up" in this root, newest first, before the transcript check: stopped
 * uncleanly, resumable, not contested, seen within 7 days, and nobody has come back since (no other record in this
 * root started after it was last seen — which makes the hint one-time without stored state).
 */
export function hintCandidates(recs: readonly SessionRec[], me: { id: string; root: string }, now: number): SessionRec[] {
  const out = recs.filter((c) =>
    c.sessionId !== me.id && c.root === me.root && uncleanOf(c, now) && c.resume?.resumable === true &&
    isSafeId(c.resume?.id) && c.contested !== true && now - lastSeen(c) <= HINT_WINDOW_MS &&
    !recs.some((r) => r.sessionId !== me.id && r.sessionId !== c.sessionId && r.root === me.root && isNum(r.startedAt) && r.startedAt > lastSeen(c)))
  return out.sort((a, b) => lastSeen(b) - lastSeen(a))
}

/** The one record to offer: the newest candidate whose transcript exists (`existing` holds the paths checked). */
export function pickHint(recs: readonly SessionRec[], me: { id: string; root: string }, now: number, existing: ReadonlySet<string>): SessionRec | null {
  return hintCandidates(recs, me, now).find((c) => typeof c.transcript === 'string' && existing.has(c.transcript)) ?? null
}

// ── messages (four languages each; a test checks every table has all four keys) ──────────────────────────────
type L<V> = Record<Lang, V>
const L4 = <V>(m: L<V>): L<V> => m

export const T = {
  description: L4({
    en: 'Every Claude Code session flightwake knows about: who is blocked, working, idle, or can be resumed (read-only)',
    'zh-TW': '列出 flightwake 知道的所有 Claude Code session:誰在等你、誰在跑、誰閒置、哪些可接回(唯讀)',
    'zh-CN': '列出 flightwake 知道的所有 Claude Code session:谁在等你、谁在跑、谁闲置、哪些可接回(只读)',
    ja: 'flightwake が把握している全 Claude Code セッション:応答待ち・作業中・待機・再開可能(読み取り専用)',
  }),
  summary: L4<(a: { live: number; b: number; r: number; dir: string; days: number }) => string>({
    en: (a) => `**${a.live} live${a.b > 0 ? ` · ⛔ ${a.b} blocked` : ''}${a.r > 0 ? ` · ${a.r} resumable` : ''}** — ${a.dir} (last ${a.days} days)`,
    'zh-TW': (a) => `**${a.live} 個進行中${a.b > 0 ? ` · ⛔ ${a.b} 個等你回覆` : ''}${a.r > 0 ? ` · ${a.r} 個可接回` : ''}** — ${a.dir}(近 ${a.days} 天)`,
    'zh-CN': (a) => `**${a.live} 个进行中${a.b > 0 ? ` · ⛔ ${a.b} 个等你回复` : ''}${a.r > 0 ? ` · ${a.r} 个可接回` : ''}** — ${a.dir}(近 ${a.days} 天)`,
    ja: (a) => `**稼働 ${a.live}${a.b > 0 ? ` · ⛔ 応答待ち ${a.b}` : ''}${a.r > 0 ? ` · 再開可能 ${a.r}` : ''}** — ${a.dir}(直近 ${a.days} 日)`,
  }),
  header: L4({
    en: '| state | session | repo | for | detail |',
    'zh-TW': '| 狀態 | session | repo | 持續 | 細節 |',
    'zh-CN': '| 状态 | session | repo | 持续 | 细节 |',
    ja: '| 状態 | セッション | repo | 経過 | 詳細 |',
  }),
  st: L4<Record<Display, string>>({
    en: { blocked: '⛔ blocked', working: '● working', idle: '○ idle', stale: '◌ stale', ended: '– ended', unknown: '? unknown' },
    'zh-TW': { blocked: '⛔ 等你回覆', working: '● 工作中', idle: '○ 閒置', stale: '◌ 失聯', ended: '– 已結束', unknown: '? 不明' },
    'zh-CN': { blocked: '⛔ 等你回复', working: '● 工作中', idle: '○ 闲置', stale: '◌ 失联', ended: '– 已结束', unknown: '? 不明' },
    ja: { blocked: '⛔ 応答待ち', working: '● 作業中', idle: '○ 待機', stale: '◌ 応答なし', ended: '– 終了', unknown: '? 不明' },
  }),
  /** The plain state words, without their icons. */
  word: L4<Record<Display, string>>({
    en: { blocked: 'blocked', working: 'working', idle: 'idle', stale: 'stale', ended: 'ended', unknown: 'unknown' },
    'zh-TW': { blocked: '等你回覆', working: '工作中', idle: '閒置', stale: '失聯', ended: '已結束', unknown: '不明' },
    'zh-CN': { blocked: '等你回复', working: '工作中', idle: '闲置', stale: '失联', ended: '已结束', unknown: '不明' },
    ja: { blocked: '応答待ち', working: '作業中', idle: '待機', stale: '応答なし', ended: '終了', unknown: '不明' },
  }),
  this: L4({ en: ' (this session)', 'zh-TW': '(本 session)', 'zh-CN': '(本 session)', ja: '(このセッション)' }),
  kind: L4<Record<BlockedKind, string>>({
    en: { permission: 'permission', question: 'question', plan: 'plan approval' },
    'zh-TW': { permission: '權限確認', question: '提問', plan: '計畫待核准' },
    'zh-CN': { permission: '权限确认', question: '提问', plan: '计划待批准' },
    ja: { permission: '許可確認', question: '質問', plan: 'プラン承認' },
  }),
  sub: L4({ en: ' (subagent)', 'zh-TW': '(子 agent)', 'zh-CN': '(子 agent)', ja: '(サブエージェント)' }),
  work: L4<{ turn: string; compact: string }>({
    en: { turn: 'running a turn', compact: 'compacting' },
    'zh-TW': { turn: '執行中', compact: '壓縮中' },
    'zh-CN': { turn: '执行中', compact: '压缩中' },
    ja: { turn: 'ターン実行中', compact: '圧縮中' },
  }),
  idle: L4<{ answer: string; aborted: string; error: string; refusal: string; start: string; clear: string }>({
    en: { answer: 'answered', aborted: 'interrupted', error: 'stopped on an error', refusal: 'refused', start: 'just started', clear: 'after /clear' },
    'zh-TW': { answer: '已回覆', aborted: '被中斷', error: '因錯誤停止', refusal: '拒答', start: '剛開始', clear: '/clear 之後' },
    'zh-CN': { answer: '已回复', aborted: '被中断', error: '因错误停止', refusal: '拒答', start: '刚开始', clear: '/clear 之后' },
    ja: { answer: '回答済み', aborted: '中断', error: 'エラーで停止', refusal: '拒否', start: '開始直後', clear: '/clear 後' },
  }),
  stale: L4<(s: string) => string>({
    en: (s) => `no heartbeat (was ${s}) — crashed or asleep?`,
    'zh-TW': (s) => `沒有心跳(原本${s})——當掉或睡眠中?`,
    'zh-CN': (s) => `没有心跳(原本${s})——崩溃或睡眠中?`,
    ja: (s) => `ハートビートなし(${s}だった)——クラッシュかスリープ?`,
  }),
  end: L4<Record<'prompt_input_exit' | 'clear' | 'resume' | 'logout' | 'other' | 'id-changed', string>>({
    en: { prompt_input_exit: 'exited', clear: '/clear', resume: 'switched (/resume)', logout: 'logout', other: 'closed or killed', 'id-changed': 'id changed' },
    'zh-TW': { prompt_input_exit: '已退出', clear: '/clear', resume: '切到別的 session', logout: '登出', other: '被關閉或終止', 'id-changed': 'id 已變更' },
    'zh-CN': { prompt_input_exit: '已退出', clear: '/clear', resume: '切到别的 session', logout: '登出', other: '被关闭或终止', 'id-changed': 'id 已变更' },
    ja: { prompt_input_exit: '終了', clear: '/clear', resume: '別セッションへ切替', logout: 'ログアウト', other: '閉じられたか強制終了', 'id-changed': 'ID 変更' },
  }),
  unk: L4<{ contested: string; format: string; clock: string }>({
    en: { contested: 'two processes on one session', format: 'unknown format', clock: 'clock ahead' },
    'zh-TW': { contested: '兩個程序共用同一個 session', format: '格式不明', clock: '時鐘超前' },
    'zh-CN': { contested: '两个进程共用同一个 session', format: '格式不明', clock: '时钟超前' },
    ja: { contested: '1 つのセッションを 2 つのプロセスが使用中', format: '不明な形式', clock: '時計が進んでいる' },
  }),
  hidden: L4<(n: number) => string>({
    en: (n) => `${n} older ended file(s) hidden — \`/fw-fleet all\` shows 30 days.`,
    'zh-TW': (n) => `另有 ${n} 個較舊的已結束檔未列出——\`/fw-fleet all\` 顯示 30 天。`,
    'zh-CN': (n) => `另有 ${n} 个较旧的已结束文件未列出——\`/fw-fleet all\` 显示 30 天。`,
    ja: (n) => `古い終了済みファイル ${n} 件は非表示——\`/fw-fleet all\` で 30 日分を表示。`,
  }),
  unreadable: L4<(n: number) => string>({
    en: (n) => `${n} file(s) could not be read (being written, or damaged).`,
    'zh-TW': (n) => `${n} 個檔讀不了(正在寫入或已損壞)。`,
    'zh-CN': (n) => `${n} 个文件读不了(正在写入或已损坏)。`,
    ja: (n) => `${n} 件のファイルを読めませんでした(書き込み中か破損)。`,
  }),
  footer: L4({
    en: 'Read-only: /fw-fleet changes nothing. `npx flightwake fleet --prune` removes ended/stale files older than 7 days.',
    'zh-TW': '唯讀:/fw-fleet 不改任何東西。`npx flightwake fleet --prune` 會刪掉 7 天前已結束/失聯的檔。',
    'zh-CN': '只读:/fw-fleet 不改任何东西。`npx flightwake fleet --prune` 会删掉 7 天前已结束/失联的文件。',
    ja: '読み取り専用:/fw-fleet は何も変更しません。7 日より古い終了/応答なしのファイルは `npx flightwake fleet --prune` で削除。',
  }),
  empty: L4<(a: { days: number; dir: string; ver: string }) => string>({
    en: (a) => `No session has reported in the last ${a.days} days. A file appears in ${a.dir} when an interactive session with flightwake-mod ${a.ver}+ starts.`,
    'zh-TW': (a) => `近 ${a.days} 天沒有 session 回報。裝了 flightwake-mod ${a.ver} 以上的互動 session 啟動時,${a.dir} 會出現一個檔。`,
    'zh-CN': (a) => `近 ${a.days} 天没有 session 上报。装了 flightwake-mod ${a.ver} 以上的交互 session 启动时,${a.dir} 会出现一个文件。`,
    ja: (a) => `直近 ${a.days} 日に報告したセッションはありません。flightwake-mod ${a.ver} 以降の対話セッションが起動すると ${a.dir} にファイルができます。`,
  }),
  nodir: L4({
    en: '/fw-fleet: cannot locate the sessions folder (HOME / USERPROFILE unset or not absolute).',
    'zh-TW': '/fw-fleet:找不到 session 資料夾(HOME / USERPROFILE 都沒設或不是絕對路徑)。',
    'zh-CN': '/fw-fleet:找不到 session 文件夹(HOME / USERPROFILE 都没设或不是绝对路径)。',
    ja: '/fw-fleet: セッションフォルダが見つかりません(HOME / USERPROFILE 未設定または絶対パスでない)。',
  }),
  notme: L4<(reason: string) => string>({
    en: (r) => `This session is not reporting: ${r}`,
    'zh-TW': (r) => `本 session 沒有回報:${r}`,
    'zh-CN': (r) => `本 session 没有上报:${r}`,
    ja: (r) => `このセッションは報告していません:${r}`,
  }),
  hint: L4<(a: { age: string; s: string; cmd: string }) => string>({
    en: (a) => `flightwake: a session in this repo stopped unexpectedly ${a.age} ago (it was ${a.s}). Pick it up: ${a.cmd} — /fw-fleet lists all`,
    'zh-TW': (a) => `flightwake:這個 repo 有個 session 在 ${a.age} 前意外中斷(當時${a.s})。接回去:${a.cmd} — /fw-fleet 列出全部`,
    'zh-CN': (a) => `flightwake:这个 repo 有个 session 在 ${a.age} 前意外中断(当时${a.s})。接回去:${a.cmd} — /fw-fleet 列出全部`,
    ja: (a) => `flightwake: このリポジトリのセッションが ${a.age} 前に予期せず止まりました(${a.s})。再開:${a.cmd} — 一覧は /fw-fleet`,
  }),
  label: L4({ en: 'session fleet', 'zh-TW': 'session 狀態回報', 'zh-CN': 'session 状态上报', ja: 'セッション状態の報告' }),
  modActive: L4<(a: { st: string; file: string; others: { live: number; b: number } | null }) => string>({
    en: (a) => `this session is reported as ${a.st} in ${a.file} (heartbeat 30 s; never prompt or command text)${a.others ? ` · others: ${a.others.live} live, ${a.others.b} blocked — /fw-fleet lists them` : ''}`,
    'zh-TW': (a) => `本 session 以「${a.st}」回報在 ${a.file}(每 30 秒心跳;不寫 prompt 或指令內容)${a.others ? `· 其他:${a.others.live} 個進行中、${a.others.b} 個等你回覆——/fw-fleet 列出` : ''}`,
    'zh-CN': (a) => `本 session 以“${a.st}”上报在 ${a.file}(每 30 秒心跳;不写 prompt 或命令内容)${a.others ? `· 其他:${a.others.live} 个进行中、${a.others.b} 个等你回复——/fw-fleet 列出` : ''}`,
    ja: (a) => `このセッションは「${a.st}」として ${a.file} に報告中(30 秒ごとのハートビート、プロンプトやコマンドの内容は書かない)${a.others ? `· 他:稼働 ${a.others.live}、応答待ち ${a.others.b} — 一覧は /fw-fleet` : ''}`,
  }),
  /** /fw-mod idle reasons (also the `${reason}` of /fw-fleet's "not reporting" line). */
  why: L4<{
    'no-home': string; 'not-interactive': string; 'bad-id': string; 'not-started': string
    'inside-repo': (base: string) => string; 'other-repo': (base: string) => string; symlink: (path: string) => string; 'foreign-file': (path: string) => string; 'write-failed': (code: string) => string
  }>({
    en: {
      'no-home': 'no home folder to write to (HOME / USERPROFILE unset or not absolute)',
      'not-interactive': 'a -p / SDK run: nothing to report',
      'bad-id': 'this session id cannot be a file name',
      'not-started': 'nothing reported yet in this session (it starts when the session starts)',
      'inside-repo': (b) => `${b} is inside this repo, so nothing is written; set FLIGHTWAKE_HOME to an absolute folder outside it`,
      'other-repo': (b) => `${b} is a flightwake records folder or lies in a git repo, so nothing is written; set FLIGHTWAKE_HOME to an absolute folder outside any repo`,
      symlink: (p) => `${p} is a symbolic link; nothing is written through it`,
      'foreign-file': (p) => `${p} is not a flightwake session file; left untouched`,
      'write-failed': (c) => `the last write failed (${c}); retried on the next change — nothing else is affected`,
    },
    'zh-TW': {
      'no-home': '找不到家目錄可寫(HOME / USERPROFILE 都沒設或不是絕對路徑)',
      'not-interactive': '-p / SDK 執行:沒有要回報的',
      'bad-id': '這個 session id 不能當檔名',
      'not-started': '本 session 尚未回報(session 開始時才開始)',
      'inside-repo': (b) => `${b} 在這個 repo 裡,所以不寫;請把 FLIGHTWAKE_HOME 設成 repo 外的絕對路徑`,
      'other-repo': (b) => `${b} 是 flightwake 紀錄資料夾或位在某個 git repo 裡,所以不寫;請把 FLIGHTWAKE_HOME 設成任何 repo 之外的絕對路徑`,
      symlink: (p) => `${p} 是符號連結;不透過它寫入`,
      'foreign-file': (p) => `${p} 不是 flightwake 的 session 檔;不動它`,
      'write-failed': (c) => `上次寫入失敗(${c});下次狀態變化時重試——其他功能不受影響`,
    },
    'zh-CN': {
      'no-home': '找不到主目录可写(HOME / USERPROFILE 都没设或不是绝对路径)',
      'not-interactive': '-p / SDK 运行:没有要上报的',
      'bad-id': '这个 session id 不能当文件名',
      'not-started': '本 session 尚未上报(session 开始时才开始)',
      'inside-repo': (b) => `${b} 在这个 repo 里,所以不写;请把 FLIGHTWAKE_HOME 设成 repo 外的绝对路径`,
      'other-repo': (b) => `${b} 是 flightwake 记录文件夹或位于某个 git repo 里,所以不写;请把 FLIGHTWAKE_HOME 设成任何 repo 之外的绝对路径`,
      symlink: (p) => `${p} 是符号链接;不通过它写入`,
      'foreign-file': (p) => `${p} 不是 flightwake 的 session 文件;不动它`,
      'write-failed': (c) => `上次写入失败(${c});下次状态变化时重试——其他功能不受影响`,
    },
    ja: {
      'no-home': '書き込むホームフォルダがありません(HOME / USERPROFILE 未設定または絶対パスでない)',
      'not-interactive': '-p / SDK 実行:報告対象外',
      'bad-id': 'このセッション ID はファイル名にできません',
      'not-started': 'このセッションはまだ報告していません(セッション開始時に始まる)',
      'inside-repo': (b) => `${b} がこのリポジトリ内にあるため書き込みません。FLIGHTWAKE_HOME をリポジトリ外の絶対パスに設定してください`,
      'other-repo': (b) => `${b} は flightwake の記録フォルダか git リポジトリ内にあるため書き込みません。FLIGHTWAKE_HOME をどのリポジトリにも属さない絶対パスに設定してください`,
      symlink: (p) => `${p} はシンボリックリンクのため、経由して書き込みません`,
      'foreign-file': (p) => `${p} は flightwake のセッションファイルではないため触れません`,
      'write-failed': (c) => `前回の書き込みに失敗(${c})。次の変化で再試行——他の機能には影響なし`,
    },
  }),
}

// ── /fw-fleet rendering ─────────────────────────────────────────────────────────────────────────────────────────
export type FleetRow = { rec: SessionRec; display: Display; ageMs: number; resume: string | null }

export const rowOf = (rec: SessionRec, now: number, resume: string | null): FleetRow => {
  const display = displayOf(rec, now)
  return { rec, display, ageMs: ageOf(rec, display, now), resume }
}

const plainState = (lang: Lang, s: unknown): string => {
  const w = T.word[lang] as Record<string, string>
  return typeof s === 'string' && w[s] !== undefined ? w[s] : T.word[lang].unknown
}

/** The detail cell's text (not yet escaped). */
export function detailOf(lang: Lang, row: FleetRow): string {
  const r = row.rec
  const sub = T.sub[lang]
  const resume = row.resume ? ` · \`${row.resume}\`` : ''
  switch (row.display) {
    case 'blocked': {
      const b = r.blocked
      const kind = b && (T.kind[lang] as Record<string, string>)[b.kind] !== undefined ? (T.kind[lang] as Record<string, string>)[b.kind] : '?'
      if (!b) return kind ?? '?'
      return `${kind} · ${typeof b.tool === 'string' ? b.tool : '?'}${typeof b.target === 'string' ? ` ${b.target}` : ''}${b.agent === true ? sub : ''}`
    }
    case 'working': {
      if (r.why === 'compact') return T.work[lang].compact
      const a = r.activity
      if (a && typeof a.tool === 'string' && (!isNum(r.stateSince) || !isNum(a.at) || a.at >= r.stateSince)) {
        return `${a.tool}${typeof a.target === 'string' ? ` ${a.target}` : ''}${a.agent === true ? sub : ''}`
      }
      return T.work[lang].turn
    }
    case 'idle': {
      const lt = r.lastTurn
      const w = T.idle[lang]
      if (!lt || (isNum(r.startedAt) && isNum(lt.at) && lt.at < r.startedAt)) return r.parent?.via === 'clear' ? w.clear : w.start
      return lt.reason === 'aborted' ? w.aborted : lt.reason === 'error' ? w.error : lt.reason === 'refusal' ? w.refusal : w.answer
    }
    case 'stale':
      return `${T.stale[lang](plainState(lang, r.state))}${resume}`
    case 'ended': {
      const e = T.end[lang] as Record<string, string>
      const reason = r.ended?.reason
      return `${typeof reason === 'string' && e[reason] !== undefined ? e[reason] : e.other}${resume}`
    }
    default: {
      const u = T.unk[lang]
      if (schemaMajor(r) === 1 && r.contested === true) return u.contested
      if (schemaMajor(r) === 1 && isNum(r.heartbeatAt) && STATES.includes(r.state as string)) return u.clock
      return u.format
    }
  }
}

const id8 = (id: unknown): string => (typeof id === 'string' && id !== '' ? Array.from(id).slice(0, 8).join('') : '?')

/** The table lines: header, separator, one row per record (every cell through tableCell). */
export function fleetTable(lang: Lang, rows: readonly FleetRow[], me: string): string[] {
  const out = [T.header[lang], '|---|---|---|---:|---|']
  for (const row of rows) {
    const isMe = row.rec.sessionId === me
    const session = `\`${tableCell(id8(row.rec.sessionId)).replace(/`/g, '')}\`${isMe ? T.this[lang] : ''}`
    out.push(`| ${T.st[lang][row.display]} | ${session} | ${tableCell(repoLabel(row.rec))} | ${fmtAge(row.ageMs)} | ${tableCell(detailOf(lang, row))} |`)
  }
  return out
}

export type FleetReport = {
  rows: readonly FleetRow[]
  me: string
  /** The sessions folder as shown (with `~`). */
  dir: string
  days: number
  endedCap: number
  /** Matching files not read: older than the window or past the listing cap. */
  skipped: number
  unreadable: number
  ver: string
  /** Why this session is not reporting (already localized), or null when it is. */
  notMe: string | null
}

/** The whole /fw-fleet output. */
export function fleetReport(lang: Lang, r: FleetReport): string {
  const sorted = sortFleet(r.rows)
  let ended = 0
  let hidden = r.skipped
  const shown: FleetRow[] = []
  for (const row of sorted) {
    if (row.display === 'ended' && ++ended > r.endedCap) { hidden += 1; continue }
    shown.push(row)
  }
  const out: string[] = ['## /fw-fleet', '']
  if (sorted.length === 0 && r.unreadable === 0) {
    out.push(T.empty[lang]({ days: r.days, dir: r.dir, ver: r.ver }))
    if (r.notMe !== null) out.push('', T.notme[lang](r.notMe))
    if (hidden > 0) out.push('', T.hidden[lang](hidden))
    out.push('', T.footer[lang])
    return out.join('\n')
  }
  const live = sorted.filter((x) => x.display === 'working' || x.display === 'blocked' || x.display === 'idle').length
  const b = sorted.filter((x) => x.display === 'blocked').length
  const res = sorted.filter((x) => x.resume !== null).length
  out.push(T.summary[lang]({ live, b, r: res, dir: r.dir, days: r.days }))
  if (r.notMe !== null) out.push('', T.notme[lang](r.notMe))
  out.push('')
  if (shown.length > 0) out.push(...fleetTable(lang, shown, r.me), '')
  if (hidden > 0) out.push(T.hidden[lang](hidden))
  if (r.unreadable > 0) out.push(T.unreadable[lang](r.unreadable))
  out.push(T.footer[lang])
  return out.join('\n')
}

// ── /fw-mod line ───────────────────────────────────────────────────────────────────────────────────────────────
export type FleetStatus = 'active' | 'no-home' | 'not-interactive' | 'bad-id' | 'inside-repo' | 'other-repo' | 'symlink' | 'foreign-file' | 'write-failed'

/** Why this session is not reporting, localized; null when it is (status active). */
export function notReportingReason(lang: Lang, f: { status: FleetStatus; base: string | null; path: string | null; lastError: string | null } | null): string | null {
  const w = T.why[lang]
  if (f === null) return w['not-started']
  switch (f.status) {
    case 'active': return null
    case 'no-home': return w['no-home']
    case 'not-interactive': return w['not-interactive']
    case 'bad-id': return w['bad-id']
    case 'inside-repo': return w['inside-repo'](f.base ?? '?')
    case 'other-repo': return w['other-repo'](f.base ?? '?')
    case 'symlink': return w.symlink(f.path ?? '?')
    case 'foreign-file': return w['foreign-file'](f.path ?? '?')
    case 'write-failed': return w['write-failed'](f.lastError ?? '?')
    default: return M(lang, { en: String(f.status) })
  }
}

/** The /fw-mod F7 line's body: ON with the reported state, or IDLE with the reason. */
export function fleetModLine(lang: Lang, f: {
  status: FleetStatus; state: FleetState; sessionId: string; base: string | null; path: string | null; lastError: string | null
  others: { live: number; blocked: number } | null
} | null, home: string | null): { isOn: boolean; text: string } {
  const why = notReportingReason(lang, f)
  if (f === null || why !== null) return { isOn: false, text: why ?? T.why[lang]['not-started'] }
  const dir = tildePath(f.base ? sessionsDirOf(f.base) : '?', home)
  return {
    isOn: true,
    text: T.modActive[lang]({ st: T.word[lang][f.state], file: `${dir}/${id8(f.sessionId)}….json`, others: f.others ? { live: f.others.live, b: f.others.blocked } : null }),
  }
}
