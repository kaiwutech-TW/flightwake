/**
 * A fake world beneath the plugin for `claude plugin test`: the test's `on` hooks sit beneath every plugin, and
 * anything the plugin asks of `$` that nobody answers throws — so every test installs a world first.
 * The returned object is live: mutate `files` / `git` / `settings` mid-test to simulate an external program
 * editing files or committing, a /cd, etc.
 */
import type { FsEntry, On } from 'claude-code'

import type { Io } from '../hooks/lib/core'

export type GitTable = Record<string, string | null>

export type World = {
  /** Project root ($.session.root / cwd). */
  root: string
  /** Repo-relative path → content. Directories are implied. */
  files: Record<string, string>
  /**
   * `git <args joined by ' '>` → stdout (exit 0); a null value or a missing key → exit 1 (error).
   * `git: null` → not a git repo: every git call exits 128.
   */
  git: GitTable | null
  /** Merged settings ($.settings.read({})). */
  settings: Record<string, unknown>
  sessionId: string
  /** Every git argv the plugin ran, joined — for asserting what was (not) called. */
  gitCalls: string[]
  /** Every path the plugin read or probed — for asserting the read scope. */
  reads: string[]
  /** Every path whose content the plugin read (fs.read only, not exists / stat / list): "existence only" checks. */
  contentReads: string[]
  /**
   * Forbidden writes — anything other than the mod's own `<base>/sessions/<id>.json` outside the repo; must stay
   * empty. (Those few allowed writes land in `fleetWrites` / `outside` instead.)
   */
  writes: string[]
  /** Absolute paths outside root → content (the fleet's sessions folder, a transcript, a seeded file). */
  outside: Record<string, string>
  /** Absolute path → mtimeMs, for `fs.stat` / `fs.list` (0 when unset). */
  mtimes: Record<string, number>
  /** Absolute paths that are symbolic links (`fs.stat` isLink; `fs.list` kind 'other'). */
  links: string[]
  /** Spelling → where it really lands, for `fs.stat(p, { resolve: true })` realPath (a link above, a case alias). */
  aliases: Record<string, string>
  /** Absolute paths whose fs.stat is refused (EACCES), and whose fs.exists is refused: a guard that cannot get an answer. */
  statDenied: string[]
  existsDenied: string[]
  /** Every allowed fleet write (`<base>/sessions/<id>.json`, outside root), in order. */
  fleetWrites: string[]
  /** When true, an allowed fleet write is refused (EACCES) — a full disk, a read-only home. */
  isFleetWriteFailing: boolean
  /** When true, fs.write / fs.list / fs.stat outside root throw (not a refusal: the capability itself blows up). */
  isFleetIoThrowing: boolean
  /** When true, only an allowed fleet fs.write throws (the guards' stats still answer, so the write is attempted). */
  isFleetWriteThrowing?: boolean
  /** Every fleet write the plugin attempted, landed or not (a refused or thrown one too). */
  fleetWriteAttempts: string[]
  /**
   * When true, a fleet write waits until the test calls one of `heldWrites` (each lands the text it was called with):
   * releasing them in any order shows whether an older write can land after a newer one.
   */
  isFleetWriteHeld: boolean
  heldWrites: (() => void)[]
  /** The largest number of fleet writes in flight at once (held or not). */
  maxFleetWritesInFlight: number
  /** An extra allowed base (an absolute FLIGHTWAKE_HOME): writes under `<fleetHome>/sessions/` are fleet writes too. */
  fleetHome?: string
  /** The time stamped into `mtimes` on a fleet write (a number, or a getter such as a mock clock's `now`). */
  now?: number | (() => number)
  /** $.session.cwd(); defaults to root when unset. */
  cwd?: string
  /** Repo-relative paths whose fs.read is refused (exists still says yes) — a capability failing for one reader. */
  failReads: string[]
  /** When true, $.settings.read is refused (throws in the plugin). */
  isSettingsFailing: boolean
  /** git argv the plugin ran WITHOUT the leading --no-optional-locks (must stay empty: zero writes, .git/index included). */
  gitWithoutNoLocks: string[]
  /** Answers `orca <args>` (the side panel's console); unset → the command is not found (exit 127). */
  orca?: (args: string[]) => { exitCode: number; stdout: string }
  /** Every `orca` argv the plugin ran (binary as given, then the args), joined. */
  orcaCalls: string[]
  /** `date +%z` answer (the local UTC offset, e.g. '+0800'); unset → the command is not available (exit 127). */
  tzOffset?: string
}

const rel = (w: World, p: string): string | null =>
  p === w.root ? '' : p.startsWith(`${w.root}/`) ? p.slice(w.root.length + 1) : null

/** A path outside root that exists: a seeded file, a folder holding one, or a link. */
const isOutside = (w: World, p: string): boolean =>
  p in w.outside || w.links.includes(p) || Object.keys(w.outside).some((k) => k.startsWith(`${p}/`))

/**
 * The one write the mod may make: `<base>/sessions/<id>.json` with base = `fleetHome` when set, else HOME_OUT's
 * `.flightwake`; a FILE_RE name, no `..`, never under root. Anything else (another repo's `.flightwake/sessions`
 * included) is a forbidden write.
 */
const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/
const isFleetPath = (w: World, p: string): boolean => {
  const pre = `${w.fleetHome ?? `${HOME_OUT}/.flightwake`}/sessions/`
  return rel(w, p) === null && p.startsWith(pre) && FILE_NAME_RE.test(p.slice(pre.length)) && !p.split('/').includes('..')
}

/** Where `p` really lands: the longest `aliases` spelling it starts with, swapped for its target. */
const realOf = (w: World, p: string): string => {
  let best = ''
  for (const a of Object.keys(w.aliases)) if ((p === a || p.startsWith(`${a}/`)) && a.length > best.length) best = a
  return best === '' ? p : `${w.aliases[best]}${p.slice(best.length)}`
}

export function installWorld(on: On, init: Partial<World> = {}): World {
  const w = newWorld(init)
  on('session.root', () => ({ value: w.root }))
  on('session.cwd', () => ({ value: w.cwd ?? w.root }))
  on('session.id', () => ({ value: w.sessionId }))
  on('settings.read', () => (w.isSettingsFailing ? { deny: 'settings unavailable' } : { value: w.settings }))
  on('fs.exists', ($, e) => {
    w.reads.push(e.path)
    if (w.existsDenied.includes(e.path)) return { deny: `EACCES: ${e.path}` }
    const r = rel(w, e.path)
    if (r === null) return { value: isOutside(w, e.path) }
    return { value: r in w.files || Object.keys(w.files).some((k) => k.startsWith(`${r}/`)) }
  })
  on('fs.read', ($, e) => {
    w.reads.push(e.path)
    w.contentReads.push(e.path)
    const r = rel(w, e.path)
    if (r !== null && w.failReads.includes(r)) return { deny: `EIO: ${e.path}` }
    const t = r === null ? w.outside[e.path] : w.files[r]
    if (t === undefined) return { deny: `ENOENT: ${e.path}` }
    return { value: t }
  })
  on('fs.stat', ($, e) => {
    w.reads.push(e.path)
    if (w.statDenied.includes(e.path)) return { deny: `EACCES: ${e.path}` }
    const r = rel(w, e.path)
    if (r === null && w.isFleetIoThrowing) throw new Error(`stat blew up: ${e.path}`)
    const mtimeMs = w.mtimes[e.path] ?? 0
    const isLink = w.links.includes(e.path)
    const real = e.resolve === true ? { realPath: realOf(w, e.path) } : {}
    if (r === null) {
      const t = w.outside[e.path]
      if (t !== undefined) return { value: { kind: 'file', size: t.length, mtimeMs, isLink, ...real } }
      // a seeded folder, a link, `/`, and the folders above the root and the test home (and the home itself)
      const isDir = isOutside(w, e.path) || e.path === '/' || w.root.startsWith(`${e.path}/`) || e.path === HOME_OUT || HOME_OUT.startsWith(`${e.path}/`)
      if (isDir) return { value: { kind: isLink ? 'other' : 'dir', size: 0, mtimeMs, isLink, ...real } }
      return { deny: `ENOENT: ${e.path}` }
    }
    const t = w.files[r]
    if (t !== undefined) return { value: { kind: 'file', size: t.length, mtimeMs, isLink, ...real } }
    if (r === '' || Object.keys(w.files).some((k) => k.startsWith(`${r}/`))) return { value: { kind: 'dir', size: 0, mtimeMs, isLink, ...real } }
    return { deny: `ENOENT: ${e.path}` }
  })
  on('fs.list', ($, e) => {
    w.reads.push(e.path)
    if (w.isFleetIoThrowing) throw new Error(`list blew up: ${e.path}`)
    const dir = e.path.replace(/\/+$/, '')
    const all: Record<string, string> = { ...w.outside }
    for (const [k, v] of Object.entries(w.files)) all[`${w.root}/${k}`] = v
    for (const l of w.links) if (!(l in all)) all[l] = ''
    const pre = `${dir}/`
    const seen = new Map<string, FsEntry>()
    for (const [p, text] of Object.entries(all)) {
      if (!p.startsWith(pre)) continue
      const rest = p.slice(pre.length)
      const name = rest.split('/')[0]!
      if (name === '' || seen.has(name)) continue
      const child = `${pre}${name}`
      if (w.links.includes(child)) seen.set(name, { name, kind: 'other', size: 0, mtimeMs: 0, isLink: true })
      else if (rest.includes('/')) seen.set(name, { name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
      else seen.set(name, { name, kind: 'file', size: text.length, mtimeMs: w.mtimes[child] ?? 0, isLink: false })
    }
    if (seen.size === 0) return { deny: `ENOENT: ${e.path}` }
    return { value: [...seen.values()] }
  })
  let inFlight = 0
  on('fs.write', async ($, e) => {
    if (isFleetPath(w, e.path)) {
      w.fleetWriteAttempts.push(e.path)
      if (w.isFleetIoThrowing || w.isFleetWriteThrowing === true) throw new Error(`write blew up: ${e.path}`)
      if (w.isFleetWriteFailing) return { deny: `EACCES: ${e.path}` }
      inFlight += 1
      w.maxFleetWritesInFlight = Math.max(w.maxFleetWritesInFlight, inFlight)
      try {
        if (w.isFleetWriteHeld) await new Promise<void>((land) => { w.heldWrites.push(land) })
      } finally {
        inFlight -= 1
      }
      w.outside[e.path] = e.text
      w.mtimes[e.path] = typeof w.now === 'function' ? w.now() : (w.now ?? 0)
      w.fleetWrites.push(e.path)
      return { value: undefined }
    }
    w.writes.push(e.path)
    return { deny: 'the mod must not write files' }
  })
  on('process.run', ($, e) => {
    const [cmd, ...rest] = e.argv
    if (cmd === 'orca' || cmd?.endsWith('/orca')) {
      w.orcaCalls.push([cmd, ...rest].join(' '))
      const r = w.orca?.(rest)
      return { value: { exitCode: r?.exitCode ?? 127, stdout: r?.stdout ?? '', stderr: r ? '' : 'not found', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    if (cmd === 'date' && rest.join(' ') === '+%z' && w.tzOffset !== undefined) return { value: { exitCode: 0, stdout: `${w.tzOffset}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (cmd !== 'git') return { value: { exitCode: 127, stdout: '', stderr: 'not found', isStdoutTruncated: false, isStderrTruncated: false } }
    // The mod promises zero writes: every git call carries --no-optional-locks (plain `git status` may rewrite .git/index).
    const args = rest[0] === '--no-optional-locks' ? rest.slice(1) : rest
    if (rest[0] !== '--no-optional-locks') w.gitWithoutNoLocks.push(rest.join(' '))
    const key = args.join(' ')
    w.gitCalls.push(key)
    if (w.git === null) return { value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }
    const out = w.git[key]
    if (out === undefined || out === null) return { value: { exitCode: 1, stdout: '', stderr: `unscripted: git ${key}`, isStdoutTruncated: false, isStderrTruncated: false } }
    return { value: { exitCode: 0, stdout: `${out}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return w
}

/** git answers for a clean repo whose STATE.md was last committed at `stateSha`, `behind` human commits ago. */
export function gitBehind(behind: number, bots = 0, stateSha = 'abc123'): GitTable {
  return {
    'status --porcelain -- .flightwake/STATE.md': '',
    'log -1 --format=%H -- .flightwake/STATE.md': stateSha,
    [`rev-list --count ${stateSha}..HEAD`]: String(behind + bots),
    [`rev-list --count --author=\\[bot\\] ${stateSha}..HEAD`]: String(bots),
    'rev-parse HEAD': 'deadbeef',
    'status --porcelain': '',
  }
}

export const MARKER = (lang = 'en') => `<!-- flightwake:begin v0.14.0 lang=${lang} -->\nobligations\n<!-- flightwake:end -->\n`

export const STATE_FILLED = `---
updated: 2026-10-01
updated_by: Claude
latest_record: records/261001-x.md
health: green   # green | yellow | red
---
<!-- flightwake STATE -->

# Where we are

Shipping v1.

# In progress (don't delete until done)

- [ ] migrate the billing table

# Next entry points

1. finish billing → src/billing.ts

# Standing facts (3-5 pieces of survival knowledge for this repo)

- verify with \`bash test/smoke.sh\`
`

export const STATE_TEMPLATE = `---
updated: {{DATE}}
updated_by: {{SESSION_OR_PERSON}}
latest_record: records/{{YYMMDD}}-{{slug}}.md
health: green   # green | yellow (unverified changes) | red (known broken)
---

# Where we are

{{One paragraph: current focus and status.}}

# In progress (don't delete until done)

- [ ] {{Unfinished work + where it's stuck}}
`

/** An Io over a World with no `$` involved — for testing lib/core helpers directly. */
export function fakeIo(w: World): Io {
  const rel = (p: string) => (p.startsWith(`${w.root}/`) ? p.slice(w.root.length + 1) : null)
  return {
    root: async () => w.root,
    sessionId: async () => w.sessionId,
    exists: async (p) => {
      const r = rel(p)
      return r !== null && (r in w.files || Object.keys(w.files).some((k) => k.startsWith(`${r}/`)))
    },
    read: async (p) => {
      const r = rel(p)
      return r === null || w.failReads.includes(r) ? null : (w.files[r] ?? null)
    },
    git: async (args) => {
      w.gitCalls.push(args.join(' '))
      if (w.git === null) return null
      const out = w.git[args.join(' ')]
      return out === undefined || out === null ? null : out.trim()
    },
    settings: async () => (w.isSettingsFailing ? {} : w.settings),
  }
}

export function newWorld(init: Partial<World> = {}): World {
  return {
    root: '/repo', files: {}, git: {}, settings: {}, sessionId: 'session-1', gitCalls: [], reads: [], contentReads: [], writes: [], failReads: [], isSettingsFailing: false, gitWithoutNoLocks: [],
    outside: {}, mtimes: {}, links: [], aliases: {}, statDenied: [], existsDenied: [], fleetWrites: [], isFleetWriteFailing: false, isFleetIoThrowing: false, fleetWriteAttempts: [],
    isFleetWriteHeld: false, heldWrites: [], maxFleetWritesInFlight: 0, orcaCalls: [],
    ...init,
  }
}

/** Inverse of the /fw-log table cell escaping: split a table row on unescaped `|`, then undo `\\` and `\|`. */
export function tableCells(row: string): string[] {
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!
    if (ch === '\\' && i + 1 < row.length) { cur += row[++i]; continue }
    if (ch === '|') { cells.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  cells.push(cur.trim())
  return cells.slice(1, -1)
}

// ── F7 fleet helpers ───────────────────────────────────────────────────────────────────────────────────────────
/** A home outside the world's root, for tests where F7 writes. */
export const HOME_OUT = '/home/u'
export const FLEET_DIR = '/home/u/.flightwake/sessions'

/** The parsed record of `<dir>/<id>.json` (default: under HOME_OUT), or null when it is missing or torn. */
export function fleetFile(w: World, id: string, dir = FLEET_DIR): Record<string, any> | null {
  const t = w.outside[`${dir}/${id}.json`]
  if (t === undefined) return null
  try { return JSON.parse(t) as Record<string, any> } catch { return null }
}

/** A valid `flightwake.session/1` record (every §3 field present), for seeding other sessions; override any field. */
export function sessionRec(partial: Record<string, unknown> = {}): Record<string, unknown> {
  const id = typeof partial.sessionId === 'string' ? partial.sessionId : 'other-1'
  const at = typeof partial.heartbeatAt === 'number' ? partial.heartbeatAt : 0
  const root = typeof partial.root === 'string' ? partial.root : '/repo'
  return {
    schema: 'flightwake.session/1', mod: '0.2.0', sessionId: id, instance: 'seeded-inst', state: 'idle', why: 'session.start',
    stateSince: at, seq: 1, heartbeatAt: at, heartbeatMs: 30000, startedAt: at, root, repoRoot: root, launchCwd: root,
    lang: 'en', surface: 'terminal', blocked: null, activity: null, inFlight: 0, turns: 0, lastTurn: null, ended: null,
    resume: { id, resumable: false }, transcript: null, parent: null, contested: false, host: {},
    ...partial,
  }
}
