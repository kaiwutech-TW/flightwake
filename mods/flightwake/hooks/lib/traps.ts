/**
 * TRAPS.md parsing. An entry is a frontmatter block (`---` … `---`) followed by its body, up to the next entry's
 * opening `---`. Entries without frontmatter (pre-OKF registries) are not entries here — they simply never match.
 *
 * Matching fields (both optional; an entry with neither never takes part, and never errors):
 *   paths:    ["hooks/**", "*.sql"]      repo-relative globs, checked against written files
 *   commands: ["git push", "npm publish"] command-token prefixes, checked against Bash commands
 * No regex anywhere. Reading rules: missing `status` → active; missing `confidence` → unknown (presented as a lead);
 * an entry whose text still holds a `{{…}}` placeholder is template residue and skipped.
 * The parser itself is the shared TRAPS core (traps-core.mjs); this file keeps what is Claude Code's own.
 */
export { parseTraps, isActive, hasMatchers } from './traps-core.mjs'
export type { Confidence, TrapEntry } from './traps-core.mjs'

/**
 * Claude Code's own words for a call that never ran because permission was refused: the prompt's "no" (main loop or
 * subagent), a deny rule, `dontAsk`, the auto-mode classifier, a built-in safety check. Read only on an error result.
 * A settings PreToolUse hook's deny reads as its own reason, so that one is caught by id instead (classic.PreToolUse).
 */
export const REFUSAL_RE = /^\s*(?:<tool_use_error>\s*)?(?:The user doesn't want to proceed with this tool use\b|Permission (?:for this (?:tool use|action|command)|to use \S+)[^\n]*?(?:was|has been) denied\b)/
