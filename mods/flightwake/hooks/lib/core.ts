/**
 * Shared world access for every feature.
 *
 * READ SCOPE (docs/plans/mods.md, revised 2026-10-05) — the mod reads only:
 *   .flightwake/ · git state · the flightwake / roles markers in CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md ·
 *   the flightwake marker in AGENTS.md / GEMINI.md (language only) · package.json `scripts` · the effective
 *   `statusLine` setting. Nothing else, and no network. Everything outside the module goes through `$`; every helper here
 * swallows its own errors and answers null/false, so a feature built on them degrades silently (no
 * .flightwake/, not a git repo, git missing, unreadable file) instead of surfacing an error to the person.
 * Read-only by contract: nothing here writes outside the mod's own $.state / $.store.
 */

export const PLUGIN = 'flightwake-mod' as const
/** Mirrors .claude-plugin/plugin.json `version` (the mod cannot read its own manifest); test/smoke.sh checks they match. */
export const MOD_VERSION = '0.1.0'
export const FW_DIR = '.flightwake'
export const STATE_REL = '.flightwake/STATE.md'
export const TRAPS_REL = '.flightwake/TRAPS.md'

export type Lang = 'en' | 'zh-TW' | 'zh-CN' | 'ja'
export const LANGS: readonly Lang[] = ['en', 'zh-TW', 'zh-CN', 'ja']
/** A message in the four install languages; a missing key falls back to English (same rule as hooks/*.mjs). */
export type Msg = { en: string } & Partial<Record<Exclude<Lang, 'en'>, string>>
export const M = (lang: Lang, m: Msg): string => m[lang] ?? m.en

/**
 * The world as the shared helpers see it. `$` can't be passed across an import — the engine's loader refuses a
 * module that does (`$ is followed only into a function declared in this same file, never across an import`) —
 * so each feature file builds this from its own `$` with a local `ioOf($)` (copy IO_OF_TEMPLATE below) and passes
 * the closures in. Every member must swallow its own errors (null / false / {}), never throw.
 */
export type Io = {
  /** $.session.root(), absolute, no trailing slash; '' when unreadable. */
  root: () => Promise<string>
  /** $.session.id(); '' when unreadable. */
  sessionId: () => Promise<string>
  /** $.fs.exists(abs); false on error. */
  exists: (abs: string) => Promise<boolean>
  /** $.fs.read(abs) as text; null when absent/unreadable. */
  read: (abs: string) => Promise<string | null>
  /**
   * `git --no-optional-locks <args>` in cwd: trimmed stdout on exit 0, null otherwise (not a repo, git missing,
   * timeout). The flag is part of the zero-write promise: a plain `git status` may refresh and rewrite .git/index.
   */
  git: (args: readonly string[], cwd: string) => Promise<string | null>
  /** $.settings.read({}) — the merged, effective settings; {} on error. */
  settings: () => Promise<Record<string, unknown>>
}

/*
 * IO_OF_TEMPLATE — paste into a feature file (it must live in the same file as the hooks that call it):
 *
 *   import type { EngineInterface } from 'claude-code'
 *   import type { Io } from '../lib/core'
 *
 *   function ioOf($: EngineInterface): Io {
 *     return {
 *       root: async () => { try { return (await $.session.root()).replace(/\/+$/, '') } catch { return '' } },
 *       sessionId: async () => { try { return await $.session.id() } catch { return '' } },
 *       exists: async (p) => { try { return await $.fs.exists(p) } catch { return false } },
 *       read: async (p) => {
 *         try { if (!(await $.fs.exists(p))) return null; const t = await $.fs.read(p); return typeof t === 'string' ? t : null } catch { return null }
 *       },
 *       git: async (args, cwd) => {
 *         try { const r = await $.process.run(['git', '--no-optional-locks', ...args], { cwd, timeoutMs: 5000 }); return r.exitCode === 0 ? r.stdout.trim() : null } catch { return null }
 *       },
 *       settings: async () => { try { return await $.settings.read({}) } catch { return {} } },
 *     }
 *   }
 */


export const joinPath = (root: string, rel: string): string => `${root}/${rel.replace(/^\/+/, '')}`

/**
 * `abs` relative to `root` with forward slashes, or null when it lies outside root.
 * Purely lexical: collapses `.`/`..` segments; does not resolve links.
 */
export function relToRoot(root: string, abs: string): string | null {
  const norm = (p: string) => {
    const out: string[] = []
    for (const seg of p.split('/')) {
      if (seg === '' || seg === '.') continue
      if (seg === '..') out.pop()
      else out.push(seg)
    }
    return out
  }
  const r = norm(root)
  const a = norm(abs.startsWith('/') ? abs : `${root}/${abs}`)
  if (a.length < r.length || r.some((s, i) => a[i] !== s)) return null
  return a.slice(r.length).join('/')
}

/** A text file under the root, or null when absent/unreadable. */
export const readRel = (io: Io, root: string, rel: string): Promise<string | null> => io.read(joinPath(root, rel))

/** `git <args>` in root (see Io.git). */
export const git = (io: Io, root: string, args: readonly string[]): Promise<string | null> => io.git(args, root)

/** The YAML-ish frontmatter block of a Markdown file as flat key → raw string (inline comments stripped). */
export function parseFrontmatter(text: string): Record<string, string> | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m || m[1] === undefined) return null
  return parseFlatYaml(m[1])
}

/** `key: value` lines → record; `# comment` tails and surrounding quotes removed; nested/continuation lines ignored. */
export function parseFlatYaml(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!m || m[1] === undefined) continue
    let v = (m[2] ?? '').replace(/\s+#.*$/, '').trim()
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

/** An inline YAML list (`[a, "b c", 'd']`) or a single scalar → items; empty input → []. */
export function parseInlineList(v: string | undefined): string[] {
  if (!v) return []
  const s = v.trim()
  const body = s.startsWith('[') && s.endsWith(']') ? s.slice(1, -1) : s
  const items: string[] = []
  const re = /\s*("([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|([^,]+))\s*(?:,|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null && m[0] !== '') {
    const item = (m[2] ?? m[3] ?? m[4] ?? '').trim()
    if (item) items.push(item)
  }
  return items
}

/**
 * Files whose flightwake marker carries the install language, in bin/cli.mjs detectMarker order: Claude's first,
 * then AGENTS.md / GEMINI.md (read for the marker only — a repo installed for Codex/Gemini alone has just those).
 */
export const MARKER_FILES = ['.claude/CLAUDE.md', 'CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', 'GEMINI.md'] as const
/** `<!-- flightwake:begin v<version> [attr=value …] -->`; attributes in any order (e.g. `lang=zh-TW profile=notes`). */
const MARKER_RE = /<!-- flightwake:begin v(\d+\.\d+\.\d+\S*)((?:\s+[\w-]+=[^\s>]+)*)\s*-->/

/** The language attribute of a marker line, or what its absence means; null when the text holds no marker. */
export function markerLang(text: string): Lang | null {
  const m = MARKER_RE.exec(text)
  if (!m) return null
  const attrs = m[2] ?? ''
  const lang = /(?:^|\s)lang=([\w-]+)/.exec(attrs)?.[1]
  // A pre-0.9 marker carried no attributes at all, and every install back then was zh-TW. A marker that has other
  // attributes but no lang is a newer writer that left the language out: fall back to the default, English.
  if (lang === undefined) return attrs.trim() === '' ? 'zh-TW' : 'en'
  return (LANGS as readonly string[]).includes(lang) ? (lang as Lang) : 'en'
}

/** The profile attribute of a marker (`profile=notes`); absent = code; null when the text holds no marker. */
export function markerProfile(text: string): 'code' | 'notes' | null {
  const m = MARKER_RE.exec(text)
  if (!m) return null
  return /(?:^|\s)profile=notes(?:\s|$)/.test(m[2] ?? '') ? 'notes' : 'code'
}

/** The profile recorded at install time, from the same first marker detectLang reads; none → code. */
export async function detectProfile(io: Io, root: string): Promise<'code' | 'notes'> {
  for (const rel of MARKER_FILES) {
    const t = await readRel(io, root, rel)
    if (t === null) continue
    const p = markerProfile(t)
    if (p !== null) return p
  }
  return 'code'
}

/** The language recorded at install time: the first marker found in MARKER_FILES; none → en. */
export async function detectLang(io: Io, root: string): Promise<Lang> {
  for (const rel of MARKER_FILES) {
    const t = await readRel(io, root, rel)
    if (t === null) continue
    const l = markerLang(t)
    if (l !== null) return l
  }
  return 'en'
}

export type Health = 'green' | 'yellow' | 'red' | 'unknown'

/** health from STATE frontmatter (`health: green  # …`); anything unrecognised is 'unknown'. */
export function healthOf(stateText: string): Health {
  const h = /^health:\s*(\S+)/m.exec(stateText)?.[1]
  return h === 'green' || h === 'yellow' || h === 'red' ? h : 'unknown'
}

/** The shipped STATE template's own frontmatter placeholders (identical in all four languages). */
const TEMPLATE_FIELDS = ['{{DATE}}', '{{SESSION_OR_PERSON}}', '{{YYMMDD}}', '{{slug}}'] as const

/**
 * STATE is still the unfilled template: its frontmatter still holds one of the template's own placeholders.
 * Only those count — a filled STATE may legitimately document `{{customer}}`-style placeholders in its body.
 */
export function isUninitializedState(stateText: string): boolean {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(stateText)
  if (!m || m[1] === undefined) return false
  const front = m[1]
  return TEMPLATE_FIELDS.some((f) => front.includes(f))
}

/**
 * STATE lag with state-check.mjs's full semantics:
 * - `dirty`: STATE.md has uncommitted changes → an update is in progress, counts as fresh
 * - `no-baseline`: STATE.md was never committed → not measured (state-check stays quiet)
 * - `behind`: human commits since STATE's last commit (`--author=\[bot\]` excluded); 0 = in sync
 * - `error`: a git call failed midway → unknown; callers must NEVER render this as "in sync"
 * null: not a git repo / git unavailable (nothing to say).
 */
export type StateLag =
  | { kind: 'dirty' }
  | { kind: 'no-baseline' }
  | { kind: 'behind'; behind: number }
  | { kind: 'error' }

export async function stateLag(io: Io, root: string): Promise<StateLag | null> {
  const status = await git(io, root, ['status', '--porcelain', '--', STATE_REL])
  if (status === null) return null
  if (status !== '') return { kind: 'dirty' }
  const last = await git(io, root, ['log', '-1', '--format=%H', '--', STATE_REL])
  if (last === null) return { kind: 'error' }
  if (last === '') return { kind: 'no-baseline' }
  const range = `${last}..HEAD`
  const all = await git(io, root, ['rev-list', '--count', range])
  const bots = await git(io, root, ['rev-list', '--count', '--author=\\[bot\\]', range])
  const a = Number(all)
  const b = Number(bots)
  if (all === null || bots === null || all === '' || bots === '' || !Number.isFinite(a) || !Number.isFinite(b)) {
    return { kind: 'error' }
  }
  return { kind: 'behind', behind: Math.max(0, a - b) }
}

/**
 * Whether the legacy node gauge (hooks/statusline.mjs) is the *effective* statusLine: the settings as the engine
 * runs under them (every source merged), not whether a settings file mentions it. The mod only reads this to
 * hide its own duplicate fields; it never edits settings.
 */
export async function legacyStatuslineActive(io: Io): Promise<boolean> {
  try {
    return JSON.stringify((await io.settings()).statusLine ?? null).includes('statusline.mjs')
  } catch {
    return false
  }
}

/**
 * `scripts` of the package.json in `dirRel` (repo-relative, '' = root), or null when there is none / it doesn't
 * parse. The only reason the mod reads package.json: confirming what a `npm test`-style script actually runs.
 */
export async function packageScripts(io: Io, root: string, dirRel = ''): Promise<Record<string, string> | null> {
  const t = await readRel(io, root, dirRel ? `${dirRel.replace(/\/+$/, '')}/package.json` : 'package.json')
  if (t === null) return null
  try {
    const s = JSON.parse(t).scripts
    if (!s || typeof s !== 'object') return null
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(s)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    return null
  }
}

/** FNV-1a 32-bit, hex — a cheap content version for dedup keys (not a security hash). */
export function contentHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * The context every feature starts from: the root and the install language, or null when this folder has no
 * .flightwake/STATE.md (flightwake isn't installed here → every feature stays silent).
 */
export type FwContext = { root: string; lang: Lang }
export async function fwContext(io: Io): Promise<FwContext | null> {
  const root = (await io.root()).replace(/\/+$/, '')
  if (!root) return null
  if (!(await io.exists(joinPath(root, STATE_REL)))) return null
  return { root, lang: await detectLang(io, root) }
}
