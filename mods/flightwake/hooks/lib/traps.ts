/**
 * TRAPS.md parsing. An entry is a frontmatter block (`---` … `---`) followed by its body, up to the next entry's
 * opening `---`. Entries without frontmatter (pre-OKF registries) are not entries here — they simply never match.
 *
 * Matching fields (both optional; an entry with neither never takes part, and never errors):
 *   paths:    ["hooks/**", "*.sql"]      repo-relative globs (lib/glob.ts), checked against written files
 *   commands: ["git push", "npm publish"] command-token prefixes, checked against Bash commands
 * No regex anywhere. Reading rules: missing `status` → active; missing `confidence` → unknown (presented as a lead);
 * an entry whose text still holds a `{{…}}` placeholder is template residue and skipped.
 */
import { contentHash, parseFlatYaml, parseInlineList } from './core'

export type Confidence = 'confirmed' | 'probable' | 'suspected' | 'unknown'

export type TrapEntry = {
  name: string
  status: 'active' | 'superseded' | string
  confidence: Confidence
  type: string
  paths: string[]
  commands: string[]
  /** The body's bold-labelled lines in order (template: symptom, root cause, fix/workaround, evidence). */
  labelled: string[]
  body: string
  /** Content version of the whole entry (frontmatter + body): dedup key part, so an edited entry can hint again. */
  version: string
}

const ENTRY_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n([\s\S]*?)(?=^---[ \t]*\r?\n[A-Za-z_][\w-]*:|(?![\s\S]))/gm

export function parseTraps(text: string): TrapEntry[] {
  const out: TrapEntry[] = []
  // Drop HTML comments first: the shipped header documents the format with example frontmatter-like lines.
  const clean = text.replace(/<!--[\s\S]*?-->/g, '')
  let m: RegExpExecArray | null
  while ((m = ENTRY_RE.exec(clean)) !== null) {
    const fmText = m[1] ?? ''
    const body = (m[2] ?? '').trim()
    const fm = parseFlatYaml(fmText)
    const name = fm.name ?? ''
    if (!name) continue
    if (/\{\{[^}\n]*\}\}/.test(fmText) || /\{\{[^}\n]*\}\}/.test(body)) continue
    const conf = (fm.confidence ?? '').toLowerCase()
    out.push({
      name,
      status: (fm.status ?? 'active').toLowerCase() || 'active',
      confidence: conf === 'confirmed' || conf === 'probable' || conf === 'suspected' ? conf : 'unknown',
      type: fm.type ?? '',
      paths: parseInlineList(fm.paths),
      commands: parseInlineList(fm.commands),
      labelled: body.split(/\r?\n/).filter((l) => /^\*\*[^*]+\*\*/.test(l.trim())).map((l) => l.trim()),
      body,
      version: contentHash(`${fmText}\n${body}`),
    })
  }
  return out
}

export const isActive = (e: TrapEntry): boolean => e.status !== 'superseded'
export const hasMatchers = (e: TrapEntry): boolean => e.paths.length > 0 || e.commands.length > 0
