// flightwake-mod's $.state contract: every value any feature keeps for the session. Per-session values carry the
// session id they were made for; a value with another id is stale (a /clear starts a new id) and is replaced.
// Nothing here is kept across sessions, except F7's own session file (<base>/sessions/<id>.json, outside the repo,
// read by other processes), F4's trip file (<base>/trips/<id>.json, `trapsTripped` merged into it, read by
// `npx flightwake traps stats`) and F8's one $.store key `panelOpen` (a boolean preference, not history).

export type FwHealth = 'green' | 'yellow' | 'red' | 'unknown'
export type FwLang = 'en' | 'zh-TW' | 'zh-CN' | 'ja'

/** F1 — the STATE snapshot taken once per session; `text` is the section injected (null = inject nothing). */
export type FwStateSnapshot = { sessionId: string; text: string | null }

/** F2 — what the band draws; computed outside the render hook, read while drawing. */
export type FwBandView = {
  /** Fields hidden because the legacy statusline.mjs is the effective statusLine (no duplicate display). */
  isLegacyGaugeActive: boolean
  health: FwHealth
  /** Display form of the lag: 'dirty' | 'no-baseline' | 'error' | 'behind'. */
  lagKind: 'dirty' | 'no-baseline' | 'behind' | 'error' | 'none'
  behind: number | null
  contextPercent: number | null
  /** The one next-command hint for the current state, already localized; null = none. */
  hint: string | null
  /** True when there is nothing worth showing (the band stays silent). */
  isQuiet: boolean
  /** Install language, so drawing needs no file reads. */
  lang: FwLang
}

/** F6 — what this session has used; tokens summed from the transcript (null when it could not be read), usd from the engine's ledger. */
export type FwSpend = {
  sessionId: string
  /** API-equivalent US dollars as /cost totals them; null where the host keeps no ledger. */
  usd: number | null
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; responses: number } | null
  model: string | null
  /** When it was computed (Date.now()). */
  at: number
}

/** F3 — one observed test/typecheck command completion. */
export type FwTestRun = {
  /** The command as run, with secrets redacted and length-capped. */
  command: string
  /** How it was recognised: a known runner, a package script (content checked), a STATE-declared command, a typecheck. */
  kind: 'runner' | 'package-script' | 'state-declared' | 'typecheck'
  /** The package script body when `kind` is 'package-script'. */
  script?: string
  cwd: string
  startedAt: number
  finishedAt: number
  /** HEAD and working-tree dirtiness when the command started; null when unreadable. */
  revision: string | null
  isDirty: boolean | null
  result: 'pass' | 'fail' | 'unknown'
  exitCode: number | null
  /** Why the result is 'unknown' (timeout, interrupted, background, compound, no-result, …). */
  reason?: string
  /** Set when a subagent ran it. */
  agentId?: string
}

export type FwFileTouch = { path: string; tool: string; at: number; agentId?: string }
export type FwCommit = { sha: string; kind: string; at: number; agentId?: string }

/** F3 — a file a Bash command wrote or removed, inferred from the command's words (redirections, cp/mv/rm/tee/sed -i). */
export type FwShellWrite = { path: string; via: string; at: number; agentId?: string }

export type FwFlightLog = {
  sessionId: string
  startedAt: number
  files: FwFileTouch[]
  /** Inferred from Bash commands, kept apart from `files` (which tools reported for certain); may be incomplete. */
  shellFiles?: FwShellWrite[]
  /** The one-per-session hint about a test run chained with other commands has been given. */
  isChainHintShown?: boolean
  tests: FwTestRun[]
  commits: FwCommit[]
  /** Entries dropped by the size caps, so the summary can say so. */
  dropped: number
}

/** F4 — trap hints already shown this session, keyed `<name>@<content version>`. */
export type FwTrapsHinted = { sessionId: string; keys: string[] }

/** F4 — repo root (absolute, at the match) → TRAPS entry name → ISO time of the first match this session. */
export type FwTripMap = Record<string, Record<string, string>>

/**
 * F4 — the traps tripped in this session, at most once per (repo, entry name): the evidence a TRAPS compaction reads.
 * Recorded by the tripwire for an Edit / Write / NotebookEdit whose file matches `paths`, or a Bash command whose
 * prefix matches `commands` (path-like words inside a command hint but are not recorded), on a call that ran. Written
 * by hooks/features/fleet.ts (the mod's one writing file) to `<base>/trips/<sessionId>.json` as
 * `{ v: 2, sessionId, updated, trips }`, merged with the file already there. `n` counts the pairs: the writer's
 * cheap "anything new?" check.
 */
export type FwTrapsTripped = { sessionId: string; trips: FwTripMap; n: number }

/** F5 — the role guard's session snapshot. */
export type FwRoleGuard = {
  sessionId: string
  /** The project root the seat was read from: a snapshot is valid only for this (session, root) pair. */
  root: string
  /** Role in force: the seat at session start, or a dispatch card that opened the session. */
  role: string | null
  source: 'seat' | 'card' | 'none'
  denyWrite: string[]
  /** Rules released one by one this session, each by its literal glob (a rule may itself be `*`). */
  released: string[]
  /** `/fw-role-release all`: every rule released. Kept apart from `released` so a literal `*` rule never means "all". */
  isAllReleased: boolean
}

/** F7 — why this session is or is not writing its fleet file (spec §2). */
export type FwFleetStatus = 'active' | 'no-home' | 'not-interactive' | 'bad-id' | 'inside-repo' | 'other-repo' | 'symlink' | 'foreign-file' | 'write-failed'

/**
 * F7 — this process's session-state report. Written only from non-render hooks and clock callbacks. The volatile
 * parts (open permission / question evidence, tool calls in flight, the writer queue) live in module memory on
 * purpose: a reload drops them, since a dialog cannot be proven after a reload.
 */
export type FwFleet = {
  sessionId: string
  /** Per-process writer token; survives a hot reload (it lives here). */
  instance: string
  startedAt: number
  launchCwd: string
  surface: string | null
  status: FwFleetStatus
  /** `e.code ?? e.name` of the last failed write. */
  lastError: string | null
  /** The session file; for 'symlink' / 'foreign-file' the path the reason names. */
  path: string | null
  base: string | null
  state: 'working' | 'blocked' | 'idle' | 'ended'
  why: string
  stateSince: number
  seq: number
  turnOpen: boolean
  compacting: boolean
  turns: number
  lastTurn: { reason: string; at: number; durationMs: number } | null
  ended: { reason: string; at: number; stateAtEnd: 'working' | 'blocked' | 'idle' } | null
  resumeId: string
  parent: { sessionId: string; via: string } | null
  contested: boolean
  hinted: boolean
  /** The other sessions' live / blocked counts from the last heartbeat, for /fw-mod; null before the first. */
  others: { live: number; blocked: number } | null
  /** The other live sessions from the last heartbeat, blocked first, for the side panel; null before the first. */
  othersList?: FwFleetOther[] | null
}

/** F7 — one other live session as the side panel lists it: no paths, no prompt or command text. */
export type FwFleetOther = {
  label: string
  display: 'working' | 'blocked' | 'idle'
  blockedKind: 'permission' | 'question' | 'plan' | null
  /** How long it has been in that state, as of the heartbeat that listed it. */
  ageMs: number
  /** From its own record; null for a writer before mod 0.3.0 or when unknown. */
  contextPercent: number | null
  role: string | null
  fwVersion: string | null
  mod: string | null
  /** Its Orca terminal handle (`host.orcaTerminal`), which joins it to Orca's terminal list; null outside Orca. */
  orcaTerminal: string | null
}

/** F8 console — one agent terminal from `orca terminal list --json` (plain shells left out). */
export type FwConsoleTerm = { handle: string; title: string; agent: string; worktreePath: string; lastOutputAt: number | null }

/** F8 console — what a listed worktree's own flightwake files say (read-only: STATE frontmatter and the marker). */
export type FwConsoleRepo = { isFlightwake: boolean; health: FwHealth; fwVersion: string | null }

/** F8 console — the last answer from Orca, taken every 10 s while the pane is open inside Orca. */
export type FwConsole = {
  at: number
  status: 'ok' | 'no-orca'
  terms: FwConsoleTerm[]
  /** Keyed by worktree path. */
  repos: Record<string, FwConsoleRepo>
}

/** F8 console — the pane's own interaction state: the row waiting for a wrap-up confirmation, and the last outcome. */
export type FwPanelUi = {
  confirm: string | null
  notice: { text: string; isError: boolean; at: number } | null
}

/** F8 — what the side panel draws from STATE; computed outside rendering (session.start, turn.complete, a commit). */
export type FwPanelDigest = {
  sessionId: string
  lang: FwLang
  health: FwHealth
  /** STATE frontmatter `updated`; null when absent. */
  updated: string | null
  isUninitialized: boolean
  /** Top-level items of the "In progress" and "Next entry points" sections, one line each, markup stripped. */
  inProgress: string[]
  next: string[]
  /** Items left out by the caps, per section. */
  moreInProgress: number
  moreNext: number
  /** The panel's own lag reading, taken only while the band is off (else the band's view is read); null = not taken. */
  lag: { kind: FwBandView['lagKind']; behind: number | null } | null
  contextPercent: number | null
  /** The flightwake install version from the instruction-file marker; null when none. */
  fwVersion: string | null
  /** This session's Orca terminal handle (ORCA_TERMINAL_HANDLE); null outside Orca, where the console has no Orca rows. */
  selfHandle: string | null
  /** What needs attention beyond STATE's own items; each field null/empty when there is nothing to say. */
  attention: {
    /** Uncommitted entries in `git status --porcelain`; null when not measured (not a git repo, git failed). */
    dirty: number | null
    /** STATE's comment after a non-green health. */
    healthWhy: string | null
    /** The latest record's file name and its "Unfinished / Handoff" items. */
    record: string | null
    unfinished: string[]
    moreUnfinished: number
    /** Active TRAPS entries, only when over the compaction line. */
    trapsActive: number | null
  }
}

declare module 'claude-code' {
  interface PluginState {
    'flightwake-mod': {
      stateSnapshot: FwStateSnapshot | null
      bandView: FwBandView | null
      bandToastSession: string | null
      flightLog: FwFlightLog | null
      trapsHinted: FwTrapsHinted | null
      trapsTripped: FwTrapsTripped | null
      roleGuard: FwRoleGuard | null
      spend: FwSpend | null
      fleet: FwFleet | null
      panelDigest: FwPanelDigest | null
      console: FwConsole | null
      panelUi: FwPanelUi | null
    }
  }
}
