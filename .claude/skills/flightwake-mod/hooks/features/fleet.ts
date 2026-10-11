/**
 * F7 fleet — this session reports its state (working / blocked / idle / ended) to `<base>/sessions/<id>.json`,
 * outside the repo (base = an absolute FLIGHTWAKE_HOME, else ~/.flightwake), for /fw-fleet, `npx flightwake fleet`,
 * the bottom gauge (hooks/statusline.mjs) and other tools (Orca). The question it answers is "who needs me".
 *
 * The one write the mod makes, and the only file in hooks/ that may call `$.fs.write` (a smoke grep enforces it):
 * refused when the base lies inside the session root, by spelling or by real path (re-checked at every write: the
 * root follows /cd), or is a flightwake records folder or lies in any git repo or flightwake root; never through a
 * symbolic link, never over a file that is not ours (both re-checked at every heartbeat), never for a -p / SDK run;
 * a guard that cannot get an answer refuses. Never written: prompt, command, question, option or plan text, URLs,
 * tool_input, paths outside the root, git remote or branch, model, cost. No git at all.
 *
 * blocked means a person is needed now: an unanswered classic.PermissionRequest (no settings hook beneath answered,
 * so the dialog is up) or a main-loop AskUserQuestion / ExitPlanMode in flight. A tool.check `ask` alone is not proof
 * (it may go to the auto-mode classifier or a headless decider); it is kept only to pair the dialog with its call.
 * The evidence lives in module memory on purpose: a reload drops it, since a dialog cannot be proven after one.
 * State machine, writer policy and file schema: the F7 spec (docs/mod.md "Fleet file contract").
 */
import type { EngineInterface, On, Timer } from 'claude-code'

import { fwContext, MOD_VERSION, relToRoot } from '../lib/core'
import type { Io, Lang } from '../lib/core'
import { transcriptPath } from '../lib/spend'
import {
  CLOCK_SKEW_MS, ENDED_CAP, ENDED_CAP_ALL, fleetBase, fleetFilePath, fleetReport, fmtAge, HEARTBEAT_MS, HINT_DELAY_MS,
  HINT_TOAST_MS, hintCandidates, inputPrint, isOursText, isSafeId, LIST_WINDOW_ALL_MS, LIST_WINDOW_MS, lastSeen,
  notReportingReason, parseRec, pickHint, recordText, repoMarkersOf, resumableOf, resumeCmd, rowOf, schemaMajor, selectFiles, selfAndAncestors,
  sessionsDirOf, staleAfter, STALE_FLOOR_MS, T, targetOf, tildePath, transcriptOf, turnReason, countOthers, deriveState, SCHEMA,
} from '../lib/fleet'
import type { Activity, BlockedKind, FleetEnv, Host, ListEntry, SessionRec } from '../lib/fleet'
import type { FwFleet, FwFleetStatus } from '../../types/index'

// The loader holds every $.state reference to literal plugin/key values written in this file
const FLEET_REF = { plugin: 'flightwake-mod', key: 'fleet' } as const

/** A guard's answer: 'unknown' (the call was refused or failed other than ENOENT) refuses, like 'yes'. */
type Tri = 'yes' | 'no' | 'unknown'

type FleetIo = Io & {
  /** $.fs.write; null on success, else the error's code (or name). The mod's only write. */
  write: (abs: string, text: string) => Promise<string | null>
  /** $.fs.list; null when the folder is missing or unreadable. */
  list: (abs: string) => Promise<ListEntry[] | null>
  /** Whether the path itself is a symbolic link: 'no' only when it is not one or is missing (ENOENT). */
  isLink: (abs: string) => Promise<Tri>
  /** Whether the path exists: 'unknown' when $.fs.exists was refused. */
  probe: (abs: string) => Promise<Tri>
  /**
   * Where the path really lands: the realPath of its deepest existing folder (`{ resolve: true }`), the rest of
   * the path appended; null when it cannot be placed (no realPath, or a stat refused other than ENOENT).
   */
  place: (abs: string) => Promise<string | null>
}

/** A rejection that says the path is missing (the engine's ENOENT), as opposed to a refusal. */
function isEnoent(err: unknown): boolean {
  const x = err as { code?: unknown; message?: unknown } | null
  if (x !== null && typeof x === 'object' && x.code === 'ENOENT') return true
  const text = x !== null && typeof x === 'object' && typeof x.message === 'string' ? x.message : typeof err === 'string' ? err : ''
  return /\bENOENT\b/.test(text)
}

// The Io closure over this file's `$` (IO_OF_TEMPLATE in hooks/lib/core.ts; `$` may not cross an import), plus the
// fleet's own write / list / link check. F7 runs no git and reads no settings.
function fleetIoOf($: EngineInterface): FleetIo {
  return {
    root: async () => { try { return (await $.session.root()).replace(/\/+$/, '') } catch { return '' } },
    sessionId: async () => { try { return await $.session.id() } catch { return '' } },
    exists: async (p) => { try { return await $.fs.exists(p) } catch { return false } },
    read: async (p) => {
      try { if (!(await $.fs.exists(p))) return null; const t = await $.fs.read(p); return typeof t === 'string' ? t : null } catch { return null }
    },
    git: async () => null,
    settings: async () => ({}),
    write: async (p, text) => {
      try { await $.fs.write(p, text); return null } catch (err) {
        const x = err as { code?: unknown; name?: unknown } | null
        return typeof x?.code === 'string' && x.code ? x.code : typeof x?.name === 'string' && x.name ? x.name : 'error'
      }
    },
    list: async (p) => {
      try {
        const es = await $.fs.list(p)
        return Array.isArray(es) ? es.map((e) => ({ name: e.name, kind: e.kind, isLink: e.isLink === true, mtimeMs: e.mtimeMs })) : null
      } catch { return null }
    },
    isLink: async (p) => {
      try { return (await $.fs.stat(p)).isLink === true ? 'yes' : 'no' } catch (err) { return isEnoent(err) ? 'no' : 'unknown' }
    },
    probe: async (p) => { try { return (await $.fs.exists(p)) ? 'yes' : 'no' } catch { return 'unknown' } },
    place: async (p) => {
      const full = p.length > 1 ? p.replace(/[\\/]+$/, '') : p
      for (const a of selfAndAncestors(full)) {
        let real: string | undefined
        try {
          real = (await $.fs.stat(a, { resolve: true })).realPath
        } catch (err) {
          if (isEnoent(err)) continue
          return null
        }
        if (typeof real !== 'string' || real === '') return null
        const rest = a === full ? '' : a === '/' ? full.slice(1) : full.slice(a.length + 1)
        return rest === '' ? real : `${real.replace(/[\\/]+$/, '')}/${rest}`
      }
      return null
    },
  }
}

/** The env F7 reads, each by its literal name (an unanswered read counts as unset). */
async function readEnv($: EngineInterface): Promise<FleetEnv & { host: Host }> {
  let FLIGHTWAKE_HOME: string | undefined
  let HOME: string | undefined
  let USERPROFILE: string | undefined
  try { FLIGHTWAKE_HOME = await $.env.get('FLIGHTWAKE_HOME') } catch { FLIGHTWAKE_HOME = undefined }
  try { HOME = await $.env.get('HOME') } catch { HOME = undefined }
  try { USERPROFILE = await $.env.get('USERPROFILE') } catch { USERPROFILE = undefined }
  const host: Host = {}
  try { const v = await $.env.get('ORCA_TERMINAL_HANDLE'); if (typeof v === 'string' && v !== '') host.orcaTerminal = v } catch {}
  try { const v = await $.env.get('ORCA_WORKSPACE_ID'); if (typeof v === 'string' && v !== '') host.orcaWorkspace = v } catch {}
  try { const v = await $.env.get('TMUX_PANE'); if (typeof v === 'string' && v !== '') host.tmuxPane = v } catch {}
  return { FLIGHTWAKE_HOME, HOME, USERPROFILE, host }
}

async function clockNow($: EngineInterface): Promise<number> {
  try { const t = await $.clock.now(); return typeof t === 'number' && Number.isFinite(t) ? t : Date.now() } catch { return Date.now() }
}

// ── module memory (a reload drops it on purpose) ───────────────────────────────────────────────────────────────
type Evidence = { kind: BlockedKind; tool: string; target: string | null; agent: boolean; since: number }

/** This process's FwFleet; mirrored into $.state after every change (the copy /fw-mod reads and a reload restores). */
let F: FwFleet | null = null
/**
 * Real-call `ask` verdicts by tool_use_id, kept only to pair a PermissionRequest (which has no id) with its call:
 * by tool name and a fingerprint of the input (module memory only, never written).
 */
const asks = new Map<string, { tool: string; at: number; paired: boolean; fp: string | null }>()
/** Open proof that a person is needed: tool_use_id (or `perm:n`) → what. */
const evidence = new Map<string, Evidence>()
/** Tool calls inside next(e), main loop and subagents together. */
const inFlight = new Map<string, { tool: string; target: string | null; agent: boolean; at: number }>()
let activity: Activity | null = null
let chain: Promise<void> = Promise.resolve()
let dirty = false
let timer: Timer | null = null
let anon = 0
let lastWriteAt = 0
let lastBlockedKey = 'null'
let pendingFlush = false
let isTicking = false
/** What a write carries besides FwFleet, refreshed at start, adoption and heartbeat (session.end reads only this). */
const W: { root: string; repoRoot: string | null; lang: Lang; home: string | null; host: Host; realRoot: string | null; realSessions: string | null } =
  { root: '', repoRoot: null, lang: 'en', home: null, host: {}, realRoot: null, realSessions: null }

const noop = (): void => {}
const canWrite = (f: FwFleet | null): f is FwFleet => f !== null && (f.status === 'active' || f.status === 'write-failed') && f.path !== null
/** Events are tracked only while this session writes and has not ended. */
const isTracking = (): boolean => canWrite(F) && F !== null && F.ended === null

function clearEvidence(): void {
  evidence.clear()
  asks.clear()
}

/**
 * At a main-loop turn boundary: the main loop's evidence and asks go. A subagent's or teammate's open dialog may
 * outlive the main turn; it stays until its own call settles, is denied, draws its pill, or the session ends.
 */
function clearMainEvidence(): void {
  for (const [k, ev] of evidence) if (!ev.agent) evidence.delete(k)
  for (const [k] of asks) if (inFlight.get(k)?.agent !== true) asks.delete(k)
}

/** The oldest open evidence, as the record's `blocked`. */
function oldestEvidence(): Evidence | null {
  let best: Evidence | null = null
  for (const ev of evidence.values()) if (best === null || ev.since < best.since) best = ev
  return best
}

function recordOf(f: FwFleet, now: number): SessionRec {
  const blocked = f.state === 'blocked' ? oldestEvidence() : null
  return {
    schema: SCHEMA,
    mod: MOD_VERSION,
    sessionId: f.sessionId,
    instance: f.instance,
    state: f.state,
    why: f.why,
    stateSince: f.stateSince,
    seq: f.seq,
    heartbeatAt: f.ended !== null ? f.ended.at : now,
    heartbeatMs: HEARTBEAT_MS,
    startedAt: f.startedAt,
    root: W.root,
    repoRoot: W.repoRoot,
    launchCwd: f.launchCwd,
    lang: W.lang,
    surface: f.surface,
    blocked: blocked === null ? null : { kind: blocked.kind, tool: blocked.tool, target: blocked.target, agent: blocked.agent, since: blocked.since },
    activity: activity === null ? null : { ...activity },
    inFlight: inFlight.size,
    turns: f.turns,
    lastTurn: f.lastTurn,
    ended: f.ended,
    resume: { id: f.resumeId, resumable: f.turns > 0 },
    transcript: W.home ? transcriptPath(W.home, f.launchCwd, f.sessionId) : null,
    parent: f.parent,
    contested: f.contested,
    host: { ...W.host },
  }
}

async function persist($: EngineInterface): Promise<void> {
  if (F === null) return
  try { await $.state.set(FLEET_REF, { ...F }) } catch {}
}

/**
 * The write guards that need no IO, re-checked before every write: the root follows /cd and worktree moves, so a
 * base that was outside the root at start may be inside it now. On a hit the status says so and nothing is written.
 */
function isStillOutside(f: FwFleet): boolean {
  if (f.base === null || f.path === null) return false
  const real = W.realSessions
  // by spelling against the root as it is now; by real path against the root as last resolved (start, heartbeat)
  const isInside = real === null || W.realRoot === null || relToRoot(W.realRoot, real) !== null ||
    (W.root !== '' && (relToRoot(W.root, f.base) !== null || relToRoot(W.root, f.path) !== null || relToRoot(W.root, real) !== null))
  if (isInside) {
    f.status = 'inside-repo'
    stopTimer()
    return false
  }
  return true
}

/**
 * `blocked` with no evidence left can only follow a ToolProgress clear (U1) whose after(0) has not run (or never
 * will: a refused clock.after drops its callback). Re-derive before writing, so a record never pairs blocked with null.
 */
function reconcile(f: FwFleet, now: number): void {
  if (f.state !== 'blocked' || evidence.size > 0) return
  f.state = deriveState({ isEnded: f.ended !== null, evidence: 0, turnOpen: f.turnOpen, compacting: f.compacting })
  f.why = 'unblocked:running'
  f.stateSince = now
}

/** The single-flight writer: always writes the newest memory; a burst of changes coalesces into one write. */
async function doWrite($: EngineInterface): Promise<void> {
  if (!dirty) return
  dirty = false
  const f = F
  if (!canWrite(f) || f.path === null) return
  if (!isStillOutside(f)) { await persist($); return }
  const now = await clockNow($)
  reconcile(f, now)
  f.seq += 1
  const err = await fleetIoOf($).write(f.path, recordText(recordOf(f, now)))
  lastWriteAt = now
  if (err === null) { f.status = 'active'; f.lastError = null } else { f.status = 'write-failed'; f.lastError = err }
  await persist($)
}

function schedule($: EngineInterface): void {
  dirty = true
  lastBlockedKey = JSON.stringify(F !== null && F.state === 'blocked' ? oldestEvidence() : null)
  chain = chain.then(() => doWrite($)).catch(noop)
}

/** Write `f` as it stands now, queued in order (for a record that is about to be replaced in memory). */
async function writeSnapshot($: EngineInterface, f: FwFleet): Promise<void> {
  if (!canWrite(f) || f.path === null || !isStillOutside(f)) return
  const now = await clockNow($)
  f.seq += 1
  const path = f.path
  const text = recordText(recordOf(f, now))
  chain = chain.then(async () => { await fleetIoOf($).write(path, text); lastWriteAt = now }).catch(noop)
}

/** Derive the state; on a change set stateSince / why, and write when the state or the blocked view changed. */
async function apply($: EngineInterface, why: string): Promise<void> {
  const f = F
  if (f === null) return
  pendingFlush = false // this derives from the evidence as it stands now: any ToolProgress clear is taken in
  const next = deriveState({ isEnded: f.ended !== null, evidence: evidence.size, turnOpen: f.turnOpen, compacting: f.compacting })
  let isChanged = false
  if (next !== f.state) {
    f.state = next
    f.why = why
    f.stateSince = await clockNow($)
    isChanged = true
  }
  if (JSON.stringify(next === 'blocked' ? oldestEvidence() : null) !== lastBlockedKey) isChanged = true
  await persist($)
  if (isChanged && canWrite(f)) {
    // the root as it is now (a /cd since the last heartbeat), so the write guard sees it; no fs read
    try { const r = (await $.session.root()).replace(/\/+$/, ''); if (r !== '') W.root = r } catch {}
    schedule($)
  }
}

// ── guards (spec §2): run at session.start and at adoption, never at session.end ──────────────────────────────
type Guard = { status: FwFleetStatus; base: string | null; path: string | null; existing: SessionRec | null }

/**
 * Where the sessions folder really lands, against the root resolved the same way (a spelling check misses a link
 * above the base): refreshes W.realRoot / W.realSessions; false when it lands inside the root or cannot be placed.
 */
async function placeOutside(io: FleetIo, root: string, base: string): Promise<boolean> {
  W.realRoot = await io.place(root)
  W.realSessions = await io.place(sessionsDirOf(base))
  return W.realRoot !== null && W.realSessions !== null && relToRoot(W.realRoot, W.realSessions) === null && relToRoot(root, W.realSessions) === null
}

async function guard($: EngineInterface, io: FleetIo, id: string, isInteractive: boolean): Promise<Guard> {
  if (!isInteractive) return { status: 'not-interactive', base: null, path: null, existing: null }
  const env = await readEnv($)
  W.home = env.HOME || env.USERPROFILE || null
  W.host = env.host
  const base = fleetBase(env)
  if (base === null) return { status: 'no-home', base: null, path: null, existing: null }
  const path = fleetFilePath(base, id)
  if (path === null) return { status: 'bad-id', base, path: null, existing: null }
  const root = await io.root()
  // the file must lie outside the repo: the base, and the file itself (a root inside the base is fine)
  if (!root || relToRoot(root, base) !== null || relToRoot(root, path) !== null) return { status: 'inside-repo', base, path, existing: null }
  // ...and by real path (a link or a relative spelling above the base); denied when it cannot be placed
  if (!(await placeOutside(io, root, base))) return { status: 'inside-repo', base, path, existing: null }
  // ...and outside every other repo and records folder: a repo at $HOME, or FLIGHTWAKE_HOME=<some repo>/.flightwake;
  // probed under the base's spelling and its real path; a probe that cannot be answered refuses
  const realBase = await io.place(base)
  if (realBase === null) return { status: 'inside-repo', base, path, existing: null }
  for (const p of new Set([...repoMarkersOf(base), ...repoMarkersOf(realBase)])) {
    if ((await io.probe(p)) !== 'no') return { status: 'other-repo', base, path, existing: null }
  }
  for (const p of [base, sessionsDirOf(base), path]) {
    if ((await io.isLink(p)) !== 'no') return { status: 'symlink', base, path: p, existing: null }
  }
  let existing: SessionRec | null = null
  const isThere = await io.probe(path)
  if (isThere === 'unknown') return { status: 'foreign-file', base, path, existing: null }
  if (isThere === 'yes') {
    const text = await io.read(path)
    if (text === null || !isOursText(text)) return { status: 'foreign-file', base, path, existing: null }
    existing = parseRec(text)
  }
  return { status: 'active', base, path, existing }
}

/** Another live process holds this id: its own fresh, not-ended record. */
const isLiveSibling = (rec: SessionRec | null, instance: string, now: number): boolean =>
  rec !== null && schemaMajor(rec) === 1 && rec.instance !== instance && (rec.ended === null || rec.ended === undefined) &&
  typeof rec.heartbeatAt === 'number' && now - rec.heartbeatAt <= staleAfter(rec) && rec.heartbeatAt <= now + CLOCK_SKEW_MS

async function refreshWorld($: EngineInterface, io: FleetIo, withRepo: boolean): Promise<void> {
  const root = await io.root()
  const isMoved = root !== '' && root !== W.root
  if (root !== '') W.root = root
  if (withRepo || isMoved) {
    try { const r = await $.session.repo(); W.repoRoot = r && typeof r.root === 'string' ? r.root.replace(/\/+$/, '') : null } catch { W.repoRoot = null }
  }
}

async function sessionTurns($: EngineInterface): Promise<number> {
  try { const n = await $.session.turns(); return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0 } catch { return 0 }
}

function startTimer($: EngineInterface): void {
  try { timer?.cancel() } catch {}
  timer = null
  try { timer = $.clock.every(HEARTBEAT_MS, () => { void tick($) }) } catch { timer = null }
}

function stopTimer(): void {
  try { timer?.cancel() } catch {}
  timer = null
}

// ── adoption: the process goes on under another session id (/clear, /resume, a fork) ─────────────────────────
async function adopt($: EngineInterface, newId: string, via: 'clear' | 'resume' | 'fork' | 'id-changed'): Promise<void> {
  const old = F
  if (old === null || old.status === 'not-interactive') return
  const io = fleetIoOf($)
  const now = await clockNow($)
  if (old.ended === null && canWrite(old)) {
    const stateAtEnd = old.state === 'ended' ? 'idle' : old.state
    old.ended = { reason: 'id-changed', at: now, stateAtEnd }
    old.state = 'ended'
    old.why = 'session.end:id-changed'
    old.stateSince = now
    await writeSnapshot($, old)
  }
  clearEvidence()
  inFlight.clear()
  activity = null
  const g = await guard($, io, newId, true)
  await refreshWorld($, io, true)
  const turns = g.status === 'active' ? await sessionTurns($) : 0
  F = {
    sessionId: newId,
    instance: old.instance,
    startedAt: now,
    launchCwd: old.launchCwd,
    surface: old.surface,
    status: g.status,
    lastError: null,
    path: g.path,
    base: g.base,
    state: 'idle',
    why: `adopt:${via}`,
    stateSince: now,
    seq: typeof g.existing?.seq === 'number' && Number.isFinite(g.existing.seq) ? g.existing.seq : 0,
    turnOpen: false,
    compacting: false,
    turns,
    lastTurn: null,
    ended: null,
    resumeId: newId,
    parent: { sessionId: old.sessionId, via },
    contested: isLiveSibling(g.existing, old.instance, now),
    hinted: old.hinted,
    others: old.others,
  }
  await persist($)
  if (canWrite(F)) {
    if (timer === null) startTimer($)
    schedule($)
  }
}

/** Row A3: the engine moved to another id without telling us (no classic.SessionStart): end the old, adopt the new. */
async function ensureCurrent($: EngineInterface): Promise<void> {
  if (F === null || F.status === 'not-interactive') return
  let id = ''
  try { id = await $.session.id() } catch { return }
  if (id && id !== F.sessionId) await adopt($, id, 'id-changed')
}

// ── readers over the sessions folder ──────────────────────────────────────────────────────────────────────────
async function scan(io: FleetIo, dir: string, now: number, windowMs: number): Promise<{ recs: SessionRec[]; unreadable: number; skipped: number; isMissing: boolean }> {
  const entries = await io.list(dir)
  if (entries === null) return { recs: [], unreadable: 0, skipped: 0, isMissing: true }
  const { names, skipped } = selectFiles(entries, now, windowMs)
  const recs: SessionRec[] = []
  let unreadable = 0
  for (const name of names) {
    const text = await io.read(`${dir}/${name}`)
    const rec = text === null ? null : parseRec(text)
    if (rec === null) unreadable += 1
    else recs.push(rec)
  }
  return { recs, unreadable, skipped, isMissing: false }
}


// ── heartbeat ─────────────────────────────────────────────────────────────────────────────────────────────────
async function tick($: EngineInterface): Promise<void> {
  if (isTicking) return
  isTicking = true
  try {
    if (!canWrite(F)) return
    await ensureCurrent($)
    const f = F
    if (!canWrite(f) || f.ended !== null || f.path === null || f.base === null) return
    const io = fleetIoOf($)
    await refreshWorld($, io, false)
    // the guards again: a /cd may have moved the root over the base, or a link may have replaced a folder since start
    if (W.root !== '') await placeOutside(io, W.root, f.base)
    if (!isStillOutside(f)) { await persist($); return }
    for (const p of [f.base, sessionsDirOf(f.base), f.path]) {
      if ((await io.isLink(p)) !== 'no') { f.status = 'symlink'; f.path = p; stopTimer(); await persist($); return }
    }
    const now = await clockNow($)
    // contested: another live process wrote this id since our last write
    const mine = await io.read(f.path)
    // something else put a file of its own at our path since start: never overwrite it
    if (mine !== null && !isOursText(mine)) { f.status = 'foreign-file'; stopTimer(); await persist($); return }
    const onDisk = mine === null ? null : parseRec(mine)
    const isContested = onDisk !== null && onDisk.instance !== f.instance && (onDisk.ended === null || onDisk.ended === undefined) &&
      typeof onDisk.heartbeatAt === 'number' && onDisk.heartbeatAt > lastWriteAt && onDisk.heartbeatAt <= now + CLOCK_SKEW_MS
    f.contested = isContested
    // the other sessions, with the gauge's filter (files touched within the stale floor's 4/3), for /fw-mod
    const s = await scan(io, sessionsDirOf(f.base), now, (STALE_FLOOR_MS * 4) / 3)
    f.others = countOthers(s.recs, f.sessionId, now)
    await persist($)
    schedule($)
  } catch {
  } finally {
    isTicking = false
  }
}

// ── resume hint (once per process, fresh start only) ──────────────────────────────────────────────────────────
async function hintScan($: EngineInterface): Promise<void> {
  try {
    const f = F
    if (!canWrite(f) || f.hinted || f.base === null) return
    const io = fleetIoOf($)
    const now = await clockNow($)
    const s = await scan(io, sessionsDirOf(f.base), now, LIST_WINDOW_MS)
    const me = { id: f.sessionId, root: W.root }
    const existing = new Set<string>()
    for (const c of hintCandidates(s.recs, me, now)) {
      const t = transcriptOf(c, W.home)
      if (t !== null && (await io.exists(t))) { existing.add(t); break }
    }
    const c = pickHint(s.recs, me, now, existing)
    if (c === null) return
    const cmd = resumeCmd(c, f.launchCwd)
    if (cmd === null) return
    const word = T.word[W.lang] as Record<string, string>
    const was = c.ended?.stateAtEnd ?? c.state
    const text = T.hint[W.lang]({ age: fmtAge(now - lastSeen(c)), s: (typeof was === 'string' && word[was]) || word.unknown || '?', cmd })
    $.ui.toast(text, { timeoutMs: HINT_TOAST_MS })
    if (F !== null) { F.hinted = true; await persist($) }
  } catch {}
}

// ── /fw-fleet ─────────────────────────────────────────────────────────────────────────────────────────────────
let isCommandRegistered = false
async function ensureCommand($: EngineInterface, lang: Lang): Promise<void> {
  if (isCommandRegistered) return
  isCommandRegistered = true
  try {
    await $.command.register({ name: 'fw-fleet', description: T.description[lang] })
  } catch {
    isCommandRegistered = false
  }
}

async function fleetCommandText($: EngineInterface, io: FleetIo, lang: Lang, args: string): Promise<string> {
  const isAll = args.trim() === 'all'
  const env = await readEnv($)
  const base = fleetBase(env)
  if (base === null) return `## /fw-fleet\n\n${T.nodir[lang]}`
  const dir = sessionsDirOf(base)
  const now = await clockNow($)
  const s = await scan(io, dir, now, isAll ? LIST_WINDOW_ALL_MS : LIST_WINDOW_MS)
  const me = await io.sessionId()
  const myLaunch = F?.launchCwd ?? null
  const rows = []
  for (const rec of s.recs) {
    let cmd: string | null = null
    if (resumableOf(rec, now)) {
      const t = transcriptOf(rec, env.HOME || env.USERPROFILE || null)
      if (t !== null && (await io.exists(t))) cmd = resumeCmd(rec, myLaunch)
    }
    rows.push(rowOf(rec, now, cmd))
  }
  return fleetReport(lang, {
    rows,
    me,
    dir: tildePath(dir, env.HOME || env.USERPROFILE || null),
    days: isAll ? 30 : 7,
    endedCap: isAll ? ENDED_CAP_ALL : ENDED_CAP,
    skipped: s.skipped,
    unreadable: s.unreadable,
    ver: MOD_VERSION,
    notMe: notReportingReason(lang, F),
  })
}

// ── session start (rows S1–S3) ────────────────────────────────────────────────────────────────────────────────
async function onStart($: EngineInterface, e: { cwd: string; surface: string | null; isInteractive: boolean }): Promise<void> {
  const io = fleetIoOf($)
  const ctx = await fwContext(io)
  if (ctx === null) return // S1: flightwake is not installed here
  W.lang = ctx.lang
  W.root = ctx.root
  await ensureCommand($, ctx.lang)
  const sid = await io.sessionId()
  if (!sid) return
  let prev = F
  if (prev === null) { try { prev = (await $.state.get(FLEET_REF)).value ?? null } catch { prev = null } }

  // S3: a reload of this module in the same session — keep the instance and counters; the evidence is gone
  if (prev !== null && prev.sessionId === sid && prev.ended === null) {
    F = { ...prev }
    const wasBlocked = prev.state === 'blocked'
    clearEvidence()
    inFlight.clear()
    // a compaction started under the old module memory cannot be followed: its finally checks `F === f`
    F.compacting = false
    lastBlockedKey = JSON.stringify(null)
    if (canWrite(F)) {
      await guardHome($)
      await refreshWorld($, io, true)
      // the new module memory has no real path yet: place it (a write refused until then)
      if (F.base !== null) await placeOutside(io, W.root, F.base)
      startTimer($)
    }
    await apply($, wasBlocked ? 'reload:evidence-lost' : 'session.start:reload')
    return
  }

  // S2: a fresh process (or a new id) — take the file over as idle; a live sibling on the same id is contested
  const now = await clockNow($)
  if (prev !== null && prev.sessionId !== sid && prev.ended === null && canWrite(prev)) {
    F = prev
    await adopt($, sid, 'id-changed')
    return
  }
  clearEvidence()
  inFlight.clear()
  activity = null
  const g = await guard($, io, sid, e.isInteractive === true)
  const instance = `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const isWriting = g.status === 'active'
  if (isWriting) await refreshWorld($, io, true)
  F = {
    sessionId: sid,
    instance,
    startedAt: now,
    launchCwd: e.cwd,
    surface: e.surface ?? null,
    status: g.status,
    lastError: null,
    path: g.path,
    base: g.base,
    state: 'idle',
    why: 'session.start',
    stateSince: now,
    seq: typeof g.existing?.seq === 'number' && Number.isFinite(g.existing.seq) ? g.existing.seq : 0,
    turnOpen: false,
    compacting: false,
    turns: isWriting ? await sessionTurns($) : 0,
    lastTurn: null,
    ended: null,
    resumeId: sid,
    parent: null,
    contested: isLiveSibling(g.existing, instance, now),
    hinted: false,
    others: null,
  }
  await persist($)
  if (!isWriting) return
  startTimer($)
  schedule($)
  try { $.clock.after(HINT_DELAY_MS, () => { void hintScan($) }) } catch {}
}

/** On a reload the module memory is new: read home and host again (the guards already ran for this id). */
async function guardHome($: EngineInterface): Promise<void> {
  const env = await readEnv($)
  W.home = env.HOME || env.USERPROFILE || null
  W.host = env.host
}

/** Settle a call (row C3): it is no longer in flight, and its evidence (if any) is cleared. */
async function settle($: EngineInterface, key: string, tool: string): Promise<void> {
  const call = inFlight.get(key)
  inFlight.delete(key)
  asks.delete(key)
  let isRemoved = evidence.delete(key)
  const perms = [...evidence.entries()].filter(([k, ev]) => k.startsWith('perm:') && ev.tool === tool)
  if (isRemoved) {
    for (const [k] of perms) evidence.delete(k)
  } else if (call !== undefined) {
    // an unpaired dialog (no tool_use_id to match) raised while this call was in flight: this call has settled
    const own = perms.filter(([, ev]) => ev.since >= call.at).sort((a, b) => a[1].since - b[1].since)[0]
    if (own !== undefined) isRemoved = evidence.delete(own[0])
  }
  // also when a ToolProgress clear took this call's evidence and its after(0) has not re-derived the state yet
  if ((isRemoved || (F !== null && F.state === 'blocked' && evidence.size === 0)) && isTracking()) await apply($, 'unblocked:tool-done')
}

export function registerFleet(on: On): void {
  on('session.start', {}, async ($, e, next) => {
    const r = await next(e)
    try { await onStart($, e) } catch {}
    return r
  })

  // A1: /clear, an in-process /resume or a fork hands us the new id at once
  on('classic.SessionStart', {}, async ($, e, next) => {
    const r = await next(e)
    try {
      const src = e.source
      if (F !== null && (src === 'clear' || src === 'resume' || src === 'fork') && typeof e.session_id === 'string' && e.session_id !== '' && e.session_id !== F.sessionId) {
        await adopt($, e.session_id, src)
      }
    } catch {}
    return r
  })

  // T1 (main loop only: a subagent raises no turn.start)
  on('turn.start', {}, async ($, e, next) => {
    try {
      await ensureCurrent($)
      if (isTracking() && F !== null) {
        F.turnOpen = true
        F.turns += 1
        clearMainEvidence()
        await apply($, 'turn.start')
      }
    } catch {}
    return next(e)
  })

  // P1: a prompt submitted while idle with a turn still open means a turn.complete was missed. Never reads e.text.
  on('prompt.submit', {}, async ($, e, next) => {
    try {
      await ensureCurrent($)
      if (isTracking() && F !== null && e.turnId === undefined && F.turnOpen) {
        F.turnOpen = false
        clearMainEvidence()
        await apply($, 'resync:prompt-while-idle')
      }
    } catch {}
    return next(e)
  })

  // T2: the main loop's turn ended (a subagent's turn changes nothing)
  on('turn.complete', {}, async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId === undefined) {
        await ensureCurrent($)
        if (isTracking() && F !== null) {
          const reason = turnReason(e.reason)
          F.turnOpen = false
          // no compaction of the main conversation outlives the turn boundary
          F.compacting = false
          clearMainEvidence()
          for (const [k, c] of inFlight) if (!c.agent) inFlight.delete(k)
          F.lastTurn = { reason, at: await clockNow($), durationMs: typeof e.durationMs === 'number' && Number.isFinite(e.durationMs) ? e.durationMs : 0 }
          F.turns = Math.max(F.turns, await sessionTurns($))
          await apply($, `turn.complete:${reason}`)
        }
      }
    } catch {}
    return r
  })

  // C1–C3: in flight, activity, question / plan evidence; settled in `finally` however the call ends
  on('tool.call', {}, async ($, e, next) => {
    let key: string | null = null
    const tool = e.tool
    try {
      if (F !== null) {
        await ensureCurrent($)
        if (isTracking()) {
          key = e.tool_use_id || `anon:${++anon}`
          const agent = e.agentId !== undefined
          const target = targetOf(tool, e, W.root)
          const at = await clockNow($)
          inFlight.set(key, { tool, target, agent, at })
          activity = { tool, target, agent, at }
          if (!agent && (tool === 'AskUserQuestion' || tool === 'ExitPlanMode')) {
            evidence.set(key, { kind: tool === 'AskUserQuestion' ? 'question' : 'plan', tool, target: null, agent: false, since: at })
            await apply($, tool === 'AskUserQuestion' ? 'question' : 'plan-approval')
          }
        }
      }
    } catch {}
    try {
      return await next(e)
    } finally {
      if (key !== null) { try { await settle($, key, tool) } catch {} }
    }
  })

  // K1: a real call put to the mode's decider — recorded for pairing only, never blocked by itself
  on('tool.check', {}, async ($, e, next) => {
    const r = await next(e)
    try {
      if (isTracking() && typeof e.tool_use_id === 'string' && e.tool_use_id !== '' && r?.decision === 'ask') {
        asks.set(e.tool_use_id, { tool: e.tool, at: await clockNow($), paired: false, fp: inputPrint(e.input) })
      }
    } catch {}
    return r
  })

  // R1: the permission dialog is up — nothing beneath answered it, in an interactive session. tool_input never kept.
  on('classic.PermissionRequest', {}, async ($, e, next) => {
    const r = await next(e)
    try {
      const tool = typeof e.tool_name === 'string' ? e.tool_name : '?'
      // this dialog's ask, by identity: same tool, same input. Consumed whatever the outcome (a settings hook
      // beneath answering it too), so a later dialog of the same tool never pairs with an ask that had none.
      const fp = inputPrint(e.tool_input)
      const matches = fp === null ? [] : [...asks.entries()].filter(([, a]) => !a.paired && a.tool === tool && a.fp === fp)
      const newest = matches[matches.length - 1]
      if (newest !== undefined) newest[1].paired = true
      if (r?.decision === undefined && r?.block === undefined) {
        await ensureCurrent($)
        if (isTracking()) {
          // two identical calls waiting cannot be told apart: unpaired (`perm:n`), cleared when a call of the tool settles
          let key: string | null = matches.length === 1 && newest !== undefined ? newest[0] : null
          // only for a call still running: next(e) waited on the settings hooks beneath, and the call may have
          // settled meanwhile (then nothing would ever clear the evidence)
          const isLive = key !== null ? inFlight.has(key) : [...inFlight.values()].some((c) => c.tool === tool)
          // a question / plan already blocks on this call (AskUserQuestion and ExitPlanMode reach the person
          // through this dialog too): keep its kind and its since, which is a reader's dedupe key
          const prior = key !== null ? evidence.get(key) : undefined
          if (isLive && prior === undefined) {
            if (key === null) key = `perm:${++anon}`
            evidence.set(key, { kind: 'permission', tool, target: inFlight.get(key)?.target ?? null, agent: e.agent_id !== undefined, since: await clockNow($) })
            await apply($, 'permission-dialog')
          }
        }
      }
    } catch {}
    return r
  })

  // R2: the call was denied — its permission evidence goes
  on('classic.PermissionDenied', {}, async ($, e, next) => {
    const r = await next(e)
    try {
      // Only the denied call's own evidence: the auto-mode classifier denies calls that never had a dialog, so a
      // match by tool name would clear another call's open dialog. An unpaired dialog clears when its call settles.
      if (isTracking() && typeof e.tool_use_id === 'string' && evidence.get(e.tool_use_id)?.kind === 'permission') {
        if (evidence.delete(e.tool_use_id)) await apply($, 'unblocked:denied')
      }
    } catch {}
    return r
  })

  // U1: the engine drew the run pill for a paired call — it is running, so its dialog is answered (clear only).
  // Module memory alone here: $.state.set is refused while a render hook draws, so the write waits for after(0).
  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    try {
      const id = e.props.tool_use_id
      const ev = typeof id === 'string' ? evidence.get(id) : undefined
      if (ev !== undefined && ev.kind === 'permission') {
        evidence.delete(id)
        if (!pendingFlush) {
          // apply() resets the flag, so a callback that never runs (a refused clock.after) cannot hold later ones
          // back; the next write, settle or tick re-derives the state in any case (reconcile, settle)
          pendingFlush = true
          try {
            $.clock.after(0, () => {
              pendingFlush = false
              if (isTracking()) void apply($, 'unblocked:running').catch(noop)
            })
          } catch { pendingFlush = false }
        }
      }
    } catch {}
    return next(e)
  })

  // M1: a manual (or plugin) compaction of the main conversation shows as working while it runs
  on('session.compact', {}, async ($, e, next) => {
    let f: FwFleet | null = null
    try {
      if (e.agentId === undefined && e.trigger !== 'precompute') {
        await ensureCurrent($)
        if (isTracking() && F !== null) {
          f = F
          f.compacting = true
          await apply($, 'compact')
        }
      }
    } catch {}
    try {
      return await next(e)
    } finally {
      if (f !== null && F === f) {
        try { f.compacting = false; if (isTracking()) await apply($, 'compact-done') } catch {}
      }
    }
  })

  // E1: built from memory only (no stat / read / exists inside the 1.5 s bound); the write is awaited
  on('session.end', {}, async ($, e, next) => {
    try {
      const f = F
      if (f !== null && f.sessionId === e.sessionId && f.ended === null) {
        const now = await clockNow($)
        const stateAtEnd = f.state === 'ended' ? 'idle' : f.state
        clearEvidence()
        f.turnOpen = false
        f.compacting = false
        f.ended = { reason: e.reason, at: now, stateAtEnd }
        if (isSafeId(e.resume?.id)) f.resumeId = e.resume.id
        f.state = 'ended'
        f.why = `session.end:${e.reason}`
        f.stateSince = now
        if (e.reason === 'prompt_input_exit' || e.reason === 'logout' || e.reason === 'other') stopTimer()
        if (canWrite(f)) {
          schedule($)
          await chain
        } else {
          await persist($)
        }
      }
    } catch {}
    return next(e)
  })

  on('command.run', { command: 'fw-fleet' }, async ($, e, next) => {
    try {
      const io = fleetIoOf($)
      const ctx = await fwContext(io)
      if (ctx === null) return next(e)
      return { text: await fleetCommandText($, io, ctx.lang, e.args ?? '') }
    } catch {
      return next(e)
    }
  })
}
