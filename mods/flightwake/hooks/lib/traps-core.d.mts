/** Types for traps-core.mjs (the shared TRAPS core: mod, CLI and the plain trap-check hook). */

export type Confidence = 'confirmed' | 'probable' | 'suspected' | 'unknown'

export type TrapEntry = {
  name: string
  status: 'active' | 'superseded' | string
  confidence: Confidence
  type: string
  tags: string[]
  discovered: string
  paths: string[]
  commands: string[]
  /** The body's bold-labelled lines in order (template: symptom, root cause, fix/workaround, evidence). */
  labelled: string[]
  body: string
  /** Content version of the whole entry (frontmatter + body): dedup key part, so an edited entry can hint again. */
  version: string
}

export declare function parseFlatYaml(block: string): Record<string, string>
export declare function parseInlineList(v: string | undefined): string[]
export declare function contentHash(text: string): string
export declare function parseTraps(text: string): TrapEntry[]
export declare const isActive: (e: TrapEntry) => boolean
export declare const hasMatchers: (e: TrapEntry) => boolean

export declare const normGlob: (g: string) => string
export declare function globRegExp(pattern: string): RegExp
export declare function matchGlob(pattern: string, path: string): boolean
export declare const matchAny: (patterns: readonly string[], path: string) => string | null

export declare function relToRoot(root: string, abs: string): string | null

export type Segment = {
  /** Words of one simple command, quotes removed; leading `VAR=value` assignments moved to `env`. */
  tokens: string[]
  env: string[]
  /** The operator that ended this segment: '&&', '||', ';', '|', '&', '\n', or '' for the last one. */
  op: string
  /** A subshell boundary marker (`(` / `)`), carrying no words. */
  group?: 'open' | 'close'
}

export type ParsedCommand = {
  segments: Segment[]
  /** Command substitution, backticks, subshell parens, heredocs or an unterminated quote — not plainly readable. */
  isComplex: boolean
}

/** What one segment's words write, without the directory it runs in. */
export type SegmentWrite = {
  path: string
  via: '>' | '>>' | 'cp' | 'mv' | 'rm' | 'tee' | 'sed -i'
  /** remove = rm targets and mv sources (gone afterwards); write = everything else. */
  effect: 'write' | 'remove'
}

export declare function parseCommand(command: string): ParsedCommand
export declare function startsWithTokens(tokens: readonly string[], prefix: string): boolean
export declare const isPathWord: (w: string | undefined) => w is string
export declare function segmentWrites(t: readonly string[]): SegmentWrite[]

export declare function patchPaths(patch: string): string[]

/** `via`: the repo-relative path or the command prefix that matched. */
export type Hit = { entry: TrapEntry; via: string }

export declare function matchFile(entries: readonly TrapEntry[], root: string, filePath: string): Hit[]
export declare function matchFiles(entries: readonly TrapEntry[], root: string, cwd: string, filePaths: readonly string[]): Hit[]
export declare function matchBash(entries: readonly TrapEntry[], root: string, cwd0: string, command: string): Hit[]
