// flightwake-mod's $.state contract: every value any feature keeps for the session. Per-session values carry the
// session id they were made for; a value with another id is stale (a /clear starts a new id) and is replaced.
// Nothing here is kept across sessions ($.store is unused by design: no cross-session history).

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

export type FwFlightLog = {
  sessionId: string
  startedAt: number
  files: FwFileTouch[]
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
  /** Role in force: the seat at session start, or a dispatch card that opened the session. */
  role: string | null
  source: 'seat' | 'card' | 'none'
  denyWrite: string[]
  /** Released globs for this session ('*' = every rule); shown persistently while non-empty. */
  released: string[]
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
    }
  }
}
