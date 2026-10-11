/**
 * Roles parsing for the opt-in role guard (F5). Two sources of "which role is this session":
 * - the seat block bin/roles.mjs renders at the top of CLAUDE.md (`.claude/CLAUDE.md` first, as roles.mjs
 *   AGENT_FILES.claude), between `<!-- flightwake-roles:begin … -->` and `<!-- flightwake-roles:end -->`;
 * - a dispatch card (`npx flightwake roles card <id>`) at the start of a prompt, which overrides the seat for
 *   that session (docs/roles.md: "the card … overrides the seat role of the folder the worker lands in").
 * Both carry the role body verbatim, so the one machine-readable rule travels with them:
 *   deny-write: ["src/**", "lib/**"]       (a line of its own in the role body in ROLES.md; repo-relative globs)
 * Natural-language "Never" bullets are deliberately NOT compiled into rules.
 */
import { parseInlineList } from './core'

export type ParsedRole = {
  id: string
  title: string
  /** Globs from the role's `deny-write:` line; [] when it has none (→ the guard has nothing to enforce). */
  denyWrite: string[]
}

const BLOCK_RE = /<!-- flightwake-roles:begin[^>]*-->([\s\S]*?)<!-- flightwake-roles:end -->/
// en / zh-TW headings (roles ships those two languages): `# Your role: <id> — <title> (…)` / `# 你的角色:<id> — <title>(…)`
const SEAT_HEAD_RE = /^#\s+(?:Your role:|你的角色[::])\s*([A-Za-z0-9][\w-]*)\s*(?:[—–-]\s*(.*?))?\s*$/m
const CARD_HEAD_RE = /^\s*#\s+(?:Role card:|角色卡[::])\s*([A-Za-z0-9][\w-]*)\s*(?:[—–-]\s*(.*?))?\s*$/m
const DENY_RE = /^deny-write:\s*(.+)$/m

const denyOf = (text: string): string[] => parseInlineList(DENY_RE.exec(text)?.[1])

/** The seat role in an instruction file's text, or null when it carries no roles block. */
export function parseSeatBlock(fileText: string): ParsedRole | null {
  const block = BLOCK_RE.exec(fileText)?.[1]
  if (block === undefined) return null
  const h = SEAT_HEAD_RE.exec(block)
  if (!h || !h[1]) return null
  return { id: h[1], title: (h[2] ?? '').replace(/[((].*$/, '').trim(), denyWrite: denyOf(block) }
}

/**
 * A dispatch card at the very start of a prompt (leading whitespace allowed), or null. Only the opening heading
 * counts — a card quoted further down a prompt is a reference, not an assignment.
 */
export function parseCard(promptText: string): ParsedRole | null {
  const firstLine = promptText.replace(/^\s+/, '').split(/\r?\n/, 1)[0] ?? ''
  const h = CARD_HEAD_RE.exec(firstLine)
  if (!h || !h[1]) return null
  return { id: h[1], title: (h[2] ?? '').trim(), denyWrite: denyOf(promptText) }
}
