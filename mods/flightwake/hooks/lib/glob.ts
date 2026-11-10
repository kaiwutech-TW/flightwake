/**
 * Repo-relative glob matching for TRAPS `paths:` and roles `deny-write:` (no regex is ever taken from user data).
 * The rules live in the shared TRAPS core (traps-core.mjs), so the mod, the CLI and the plain trap-check hook match alike.
 */
export { matchGlob, matchAny } from './traps-core.mjs'
