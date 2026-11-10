const cache = new Map()
function compile(pattern) {
  const hit = cache.get(pattern)
  if (hit) return hit
  let p = pattern.trim().replace(/^\.\//, '').replace(/^\/+/, '')
  if (p.endsWith('/')) p += '**'
  const anyDepth = !p.includes('/')
  let re = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '*') {
      if (p[i + 1] === '*') {
        if (p[i + 2] === '/') { re += '(?:[^/]+/)*'; i += 2 } else { re += '.*'; i += 1 }
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  const out = new RegExp(anyDepth ? `^(?:.*/)?${re}$` : `^${re}$`)
  cache.set(pattern, out)
  return out
}
export function matchGlob(pattern, path) {
  if (!pattern.trim()) return false
  return compile(pattern).test(path.replace(/^\.\//, ''))
}
export const matchAny = (patterns, path) => patterns.find((p) => matchGlob(p, path)) ?? null
