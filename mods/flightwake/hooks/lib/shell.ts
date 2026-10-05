/**
 * A deliberately small shell-command reader for F3 (test recognition) and F4 (command tripwires).
 * It is NOT a shell parser: it splits on top-level control operators outside quotes and tokenizes each simple
 * command. Anything it can't read plainly is flagged (`isComplex`) so callers can stay conservative.
 */

export type Segment = {
  /** Words of one simple command, quotes removed; leading `VAR=value` assignments moved to `env`. */
  tokens: string[]
  env: string[]
  /** The operator that ended this segment: '&&', '||', ';', '|', '&', '\n', or '' for the last one. */
  op: string
  /** A subshell boundary marker (`(` / `)`), carrying no words; F4 walks into subshells, F3 counts it as compound. */
  group?: 'open' | 'close'
}

export type ParsedCommand = {
  segments: Segment[]
  /** Command substitution, backticks, subshell parens, heredocs or an unterminated quote — not plainly readable. */
  isComplex: boolean
}

const OPS = ['&&', '||', ';;', '|&', ';', '|', '&', '\n'] as const

export function parseCommand(command: string): ParsedCommand {
  const segments: Segment[] = []
  let isComplex = false
  let tokens: string[] = []
  let cur = ''
  let hasCur = false
  let quote: '' | "'" | '"' = ''
  const pushWord = () => {
    if (hasCur) tokens.push(cur)
    cur = ''
    hasCur = false
  }
  const endSegment = (op: string) => {
    pushWord()
    const env: string[] = []
    while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0] as string)) env.push(tokens.shift() as string)
    if (tokens.length || env.length) segments.push({ tokens, env, op })
    else if (segments.length && op) (segments[segments.length - 1] as Segment).op = op
    tokens = []
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i] as string
    if (quote) {
      if (c === quote) quote = ''
      else if (c === '\\' && quote === '"' && i + 1 < command.length) cur += command[++i]
      else {
        if (quote === '"' && (c === '`' || (c === '$' && command[i + 1] === '('))) isComplex = true
        cur += c
      }
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      hasCur = true
      continue
    }
    if (c === '\\' && i + 1 < command.length) {
      if (command[i + 1] === '\n') { i++; continue } // line continuation
      cur += command[++i]
      hasCur = true
      continue
    }
    // `$( … )` and backticks: command substitution stays inside the word (nested parens counted)
    if (c === '$' && command[i + 1] === '(') {
      isComplex = true
      let depth = 0
      for (; i < command.length; i++) {
        const d = command[i] as string
        cur += d
        if (d === '(') depth++
        else if (d === ')' && --depth === 0) break
      }
      hasCur = true
      continue
    }
    if (c === '`') {
      isComplex = true
      const close = command.indexOf('`', i + 1)
      const end = close < 0 ? command.length - 1 : close
      cur += command.slice(i, end + 1)
      i = end
      hasCur = true
      continue
    }
    // A bare `(` / `)` opens / closes a subshell: an explicit marker segment, so the commands inside stay visible
    if (c === '(' || c === ')') {
      isComplex = true
      endSegment('')
      segments.push({ tokens: [], env: [], op: '', group: c === '(' ? 'open' : 'close' })
      continue
    }
    if (c === '<' && command[i + 1] === '<') isComplex = true
    // `&` inside a redirection (`2>&1`, `>&2`, `<&3`, `&>file`, `&>>file`) is part of the word, not an operator
    const isRedirAmp = c === '&' && (command[i - 1] === '>' || command[i - 1] === '<' || command[i + 1] === '>')
    const op = isRedirAmp ? undefined : OPS.find((o) => command.startsWith(o, i))
    if (op) {
      endSegment(op === '|&' ? '|' : op === ';;' ? ';' : op)
      i += op.length - 1
      continue
    }
    if (c === ' ' || c === '\t') {
      pushWord()
      continue
    }
    if (c === '#' && !hasCur) {
      // a comment runs to the end of its line only; the newline itself still ends the segment
      while (i + 1 < command.length && command[i + 1] !== '\n') i++
      continue
    }
    cur += c
    hasCur = true
  }
  if (quote) isComplex = true
  endSegment('')
  return { segments, isComplex }
}

/** True when the tokens start with every token of `prefix` (whitespace-separated), compared exactly. */
export function startsWithTokens(tokens: readonly string[], prefix: string): boolean {
  const p = prefix.trim().split(/\s+/).filter(Boolean)
  return p.length > 0 && p.length <= tokens.length && p.every((t, i) => tokens[i] === t)
}

/**
 * A file a command writes or removes, as far as its words say. `dir` is where a relative `path` resolves: '' = the
 * command's starting directory, 'pkg' or '/abs' after a leading `cd … &&` chain, null = no longer certain (any other cd,
 * or a cd inside a subshell, happened earlier) — the caller must not resolve a relative path then.
 */
export type ShellWrite = {
  path: string
  via: '>' | '>>' | 'cp' | 'mv' | 'rm' | 'tee' | 'sed -i'
  /** remove = rm targets and mv sources (gone afterwards); write = everything else. */
  effect: 'write' | 'remove'
  dir: string | null
}

/** A word that can only be a path as written: no expansions, no globs, not a device, not a descriptor. */
const isPathWord = (w: string | undefined): w is string =>
  typeof w === 'string' && w !== '' && !/[$`*?[\]{}~]/.test(w) && !w.startsWith('/dev/') && !w.startsWith('&') && !w.startsWith('-')

/**
 * Splits a command's arguments by its own option grammar: flags that take a value consume it (attached or as the next
 * word), `--` ends options, everything else is an operand. `withValue` lists the short and long options that take a value.
 */
function operands(args: readonly string[], withValue: { short: string; long: readonly string[] }): { operands: string[]; values: Record<string, string[]> } {
  const out: string[] = []
  const values: Record<string, string[]> = {}
  const keep = (k: string, v: string) => { (values[k] ??= []).push(v) }
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '--') { out.push(...args.slice(i + 1)); break }
    if (a.startsWith('--')) {
      const [name, eq] = a.includes('=') ? [a.slice(2, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a.slice(2), undefined]
      if (withValue.long.includes(name)) keep(name, eq ?? (args[++i] ?? ''))
      continue
    }
    if (a.startsWith('-') && a.length > 1) {
      // a cluster of short flags; the first one that takes a value takes the rest of the word or the next word
      for (let j = 1; j < a.length; j++) {
        const f = a[j] as string
        if (withValue.short.includes(f)) { keep(f, j + 1 < a.length ? a.slice(j + 1) : (args[++i] ?? '')); break }
      }
      continue
    }
    out.push(a)
  }
  return { operands: out, values }
}

const joinDir = (dir: string, name: string): string => `${dir.replace(/\/+$/, '')}/${name.replace(/^.*\//, '')}`

/**
 * The write targets plainly readable from a command (F3's "changed through shell commands" list): output
 * redirections (`>f`, `>> f`, `2>f`, `&>f`; not fd duplications like `2>&1`, not /dev/*), and the operands of
 * cp/mv (destination, or each source joined to `-t DIR`; mv also its sources), rm, tee and `sed -i`, each read with that
 * command's option grammar so option values (sed -e/-f scripts, -S suffixes, …) never pass for paths. Words with
 * expansions or globs are skipped. Only a candidate list — the recorder lists what git confirms as changed.
 */
export function shellWriteTargets(command: string): ShellWrite[] {
  const out: ShellWrite[] = []
  let dir: string | null = ''
  let isChainCertain = true // every segment so far ended with && (a cd here is a certain move)
  let depth = 0
  for (const seg of parseCommand(command).segments) {
    if (seg.group === 'open') { depth++; continue }
    if (seg.group === 'close') { depth = Math.max(0, depth - 1); if (seg.op && seg.op !== '&&') isChainCertain = false; continue }
    const add = (path: string, via: ShellWrite['via'], effect: ShellWrite['effect'] = 'write') => { if (isPathWord(path)) out.push({ path, via, effect, dir }) }
    const words: string[] = []
    const t = seg.tokens
    for (let i = 0; i < t.length; i++) {
      const tok = t[i] as string
      const m = /^(?:\d*|&)(>>?)(.*)$/.exec(tok)
      if (m) {
        const via = m[1] as '>' | '>>'
        const rest = m[2] as string
        if (rest === '') add(t[++i] as string, via) // `> file`
        else if (!rest.startsWith('&')) add(rest, via) // `>file`; `>&2` duplicates a descriptor
        continue
      }
      if (/^\d*<.*/.test(tok)) { if (tok.replace(/^\d*</, '') === '') i++; continue } // input redirection: skip its word
      words.push(tok)
    }
    const [cmd, ...args] = words
    if (cmd === 'cd') {
      const target = args[0] === '--' ? args[1] : args[0]
      const isResolvable = target !== undefined && args.length <= (args[0] === '--' ? 2 : 1) && target !== '-' && isPathWord(target)
      dir = depth === 0 && isChainCertain && seg.op === '&&' && isResolvable && dir !== null
        ? (target.startsWith('/') ? target : dir ? `${dir}/${target}` : target)
        : null
    } else if (cmd === 'cp' || cmd === 'mv') {
      const { operands: o, values } = operands(args, { short: 'tS', long: ['target-directory', 'suffix', 'backup'] })
      const into = values.t?.[0] ?? values['target-directory']?.[0]
      if (into !== undefined) {
        if (isPathWord(into)) for (const src of o) { if (cmd === 'mv') add(src, 'mv', 'remove'); if (isPathWord(src)) add(joinDir(into, src), cmd) }
      } else if (o.length >= 2) {
        if (cmd === 'mv') for (const src of o.slice(0, -1)) add(src, 'mv', 'remove')
        add(o[o.length - 1] as string, cmd)
      }
    } else if (cmd === 'rm') {
      for (const a of operands(args, { short: '', long: [] }).operands) add(a, 'rm', 'remove')
    } else if (cmd === 'tee') {
      for (const a of operands(args, { short: '', long: [] }).operands) add(a, 'tee')
    } else if (cmd === 'sed') {
      // -i takes its suffix only when attached (GNU) — except BSD's separate empty word (`-i ''`), which is dropped here
      const hasInPlace = args.some((a) => a === '-i' || /^-i./.test(a) || a === '--in-place' || a.startsWith('--in-place='))
      if (hasInPlace) {
        const cleaned = args.filter((a, i) => !(a === '' && args[i - 1] === '-i'))
        const { operands: o, values } = operands(cleaned.map((a) => (/^-i./.test(a) ? '-i' : a)), { short: 'efl', long: ['expression', 'file', 'line-length'] })
        // with -e/-f the script is an option value, so every operand is a file; otherwise the first operand is the script
        const files = values.e || values.f || values.expression || values.file ? o : o.slice(1)
        for (const f of files) add(f, 'sed -i')
      }
    }
    if (seg.op !== '&&') isChainCertain = false
  }
  return out
}
