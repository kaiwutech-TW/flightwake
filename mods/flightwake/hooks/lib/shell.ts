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

/** A file a command writes or removes, as far as its words say: the word as written and how it is written. */
export type ShellWrite = { path: string; via: '>' | '>>' | 'cp' | 'mv' | 'rm' | 'tee' | 'sed -i' }

const isFileWord = (w: string | undefined): w is string =>
  typeof w === 'string' && w !== '' && !w.includes('$') && !w.includes('`') && !w.startsWith('/dev/') && !w.startsWith('&')
const nonFlags = (words: readonly string[]): string[] => {
  const out: string[] = []
  let isAfterDashDash = false
  for (const w of words) {
    if (!isAfterDashDash && w === '--') { isAfterDashDash = true; continue }
    if (!isAfterDashDash && w.startsWith('-')) continue
    out.push(w)
  }
  return out
}

/**
 * The write targets plainly readable from a command (F3's "changed through shell commands" list): output
 * redirections (`>f`, `>> f`, `2>f`, `&>f`; not fd duplications like `2>&1`, not /dev/*), and the targets of cp/mv
 * (destination; mv also its sources), rm, tee and `sed -i`. Words holding `$` or backticks are skipped (not readable
 * without running the shell). An inference from words, never a record of what happened: cp -t, find -delete, scripts,
 * editors, git checkout etc. are not seen.
 */
export function shellWriteTargets(command: string): ShellWrite[] {
  const out: ShellWrite[] = []
  const add = (path: string, via: ShellWrite['via']) => { if (isFileWord(path)) out.push({ path, via }) }
  for (const seg of parseCommand(command).segments) {
    if (seg.group) continue
    const words: string[] = []
    const t = seg.tokens
    for (let i = 0; i < t.length; i++) {
      const tok = t[i] as string
      const m = /^(?:\d*|&)(>>?)(.*)$/.exec(tok)
      if (m && !tok.startsWith('<')) {
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
    if (cmd === 'cp' || cmd === 'mv') {
      const a = nonFlags(args)
      if (a.length >= 2) {
        if (cmd === 'mv') for (const src of a.slice(0, -1)) add(src, 'mv')
        add(a[a.length - 1] as string, cmd)
      }
    } else if (cmd === 'rm' || cmd === 'tee') {
      for (const a of nonFlags(args)) add(a, cmd)
    } else if (cmd === 'sed') {
      const i = args.findIndex((a) => a === '-i' || /^-i\S/.test(a) || a === '--in-place' || a.startsWith('--in-place='))
      if (i >= 0) {
        // BSD sed takes the suffix as the next word (`-i ''`): an empty word right after a bare -i is that suffix
        const rest = args.slice(i + 1)
        const afterSuffix = args[i] === '-i' && rest[0] === '' ? rest.slice(1) : rest
        const files = nonFlags(afterSuffix).filter((a) => a !== '')
        for (const f of files.slice(1)) add(f, 'sed -i') // the first is the script
      }
    }
  }
  return out
}
