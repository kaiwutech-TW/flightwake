/**
 * A fake world beneath the plugin for `claude plugin test`: the test's `on` hooks sit beneath every plugin, and
 * anything the plugin asks of `$` that nobody answers throws — so every test installs a world first.
 * The returned object is live: mutate `files` / `git` / `settings` mid-test to simulate an external program
 * editing files or committing, a /cd, etc.
 */
import type { On } from 'claude-code'

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
  /** Every fs.write the plugin attempted (must stay empty: the mod never writes files). */
  writes: string[]
  /** $.session.cwd(); defaults to root when unset. */
  cwd?: string
  /** Repo-relative paths whose fs.read is refused (exists still says yes) — a capability failing for one reader. */
  failReads: string[]
  /** When true, $.settings.read is refused (throws in the plugin). */
  isSettingsFailing: boolean
  /** git argv the plugin ran WITHOUT the leading --no-optional-locks (must stay empty: zero writes, .git/index included). */
  gitWithoutNoLocks: string[]
  /** `date +%z` answer (the local UTC offset, e.g. '+0800'); unset → the command is not available (exit 127). */
  tzOffset?: string
}

const rel = (w: World, p: string): string | null =>
  p === w.root ? '' : p.startsWith(`${w.root}/`) ? p.slice(w.root.length + 1) : null

export function installWorld(on: On, init: Partial<World> = {}): World {
  const w = newWorld(init)
  on('session.root', () => ({ value: w.root }))
  on('session.cwd', () => ({ value: w.cwd ?? w.root }))
  on('session.id', () => ({ value: w.sessionId }))
  on('settings.read', () => (w.isSettingsFailing ? { deny: 'settings unavailable' } : { value: w.settings }))
  on('fs.exists', ($, e) => {
    w.reads.push(e.path)
    const r = rel(w, e.path)
    if (r === null) return { value: false }
    return { value: r in w.files || Object.keys(w.files).some((k) => k.startsWith(`${r}/`)) }
  })
  on('fs.read', ($, e) => {
    w.reads.push(e.path)
    const r = rel(w, e.path)
    if (r !== null && w.failReads.includes(r)) return { deny: `EIO: ${e.path}` }
    const t = r === null ? undefined : w.files[r]
    if (t === undefined) return { deny: `ENOENT: ${e.path}` }
    return { value: t }
  })
  on('fs.stat', ($, e) => {
    w.reads.push(e.path)
    const r = rel(w, e.path)
    const t = r === null ? undefined : w.files[r]
    if (t === undefined) return { deny: `ENOENT: ${e.path}` }
    return { value: { kind: 'file', size: t.length, mtimeMs: 0, isLink: false } as never }
  })
  on('fs.write', ($, e) => {
    w.writes.push(e.path)
    return { deny: 'the mod must not write files' }
  })
  on('process.run', ($, e) => {
    const [cmd, ...rest] = e.argv
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
  return { root: '/repo', files: {}, git: {}, settings: {}, sessionId: 'session-1', gitCalls: [], reads: [], writes: [], failReads: [], isSettingsFailing: false, gitWithoutNoLocks: [], ...init }
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
