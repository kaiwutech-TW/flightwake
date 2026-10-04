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
    if (c === '`' || (c === '$' && command[i + 1] === '(') || c === '(' || c === ')' || (c === '<' && command[i + 1] === '<')) {
      isComplex = true
    }
    const op = OPS.find((o) => command.startsWith(o, i))
    if (op) {
      endSegment(op === '|&' ? '|' : op === ';;' ? ';' : op)
      i += op.length - 1
      continue
    }
    if (c === ' ' || c === '\t') {
      pushWord()
      continue
    }
    if (c === '#' && !hasCur) break // comment to end of line (approximation: rest of command)
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
