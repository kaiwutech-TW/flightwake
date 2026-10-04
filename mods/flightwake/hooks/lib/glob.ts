/**
 * Repo-relative glob matching for TRAPS `paths:` and roles `deny-write:` (no regex is ever taken from user data).
 * Syntax: `**` any number of path segments, `*` within one segment, `?` one character; everything else literal.
 * A pattern with no `/` matches the basename at any depth (gitignore-style: `*.sql` hits `db/x.sql`);
 * a trailing `/` means "this directory and everything under it". Paths and patterns use `/`; a leading `./` or
 * `/` on the pattern is dropped (patterns are always repo-relative).
 */
const cache = new Map<string, RegExp>()

function compile(pattern: string): RegExp {
  const hit = cache.get(pattern)
  if (hit) return hit
  let p = pattern.trim().replace(/^\.\//, '').replace(/^\/+/, '')
  if (p.endsWith('/')) p += '**'
  const anyDepth = !p.includes('/')
  let re = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i] as string
    if (c === '*') {
      if (p[i + 1] === '*') {
        // `**/` → zero or more segments; a bare `**` → anything
        if (p[i + 2] === '/') {
          re += '(?:[^/]+/)*'
          i += 2
        } else {
          re += '.*'
          i += 1
        }
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  const out = new RegExp(anyDepth ? `^(?:.*/)?${re}$` : `^${re}$`)
  cache.set(pattern, out)
  return out
}

/** Whether repo-relative `path` matches `pattern`. An empty pattern never matches. */
export function matchGlob(pattern: string, path: string): boolean {
  if (!pattern.trim()) return false
  return compile(pattern).test(path.replace(/^\.\//, ''))
}

export const matchAny = (patterns: readonly string[], path: string): string | null =>
  patterns.find((p) => matchGlob(p, path)) ?? null
