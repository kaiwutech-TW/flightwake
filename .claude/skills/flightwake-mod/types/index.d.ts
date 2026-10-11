// flightwake-mod's $.state contract: every value any feature keeps for the session. Per-session values carry the
// session id they were made for; a value with another id is stale (a /clear starts a new id) and is replaced.
// Nothing here is kept across sessions ($.store is unused by design: no cross-session history), except F7's own
// session file (<base>/sessions/<id>.json, outside the repo), which is not $.store and is read by other processes.

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
}

declare module 'claude-code' {
  interface PluginState {
    'flightwake-mod': {
      stateSnapshot: FwStateSnapshot | null
      bandView: FwBandView | null
      bandToastSession: string | null
      flightLog: FwFlightLog | null
      trapsHinted: FwTrapsHinted | null
      roleGuard: FwRoleGuard | null
      spend: FwSpend | null
      fleet: FwFleet | null
    }
  }
}
