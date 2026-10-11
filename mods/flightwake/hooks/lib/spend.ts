/**
 * F6 spend — pure helpers: sum a Claude Code transcript's API usage, format tokens / dollars, locate the transcript.
 * No `$` here (hooks/lib/core.ts: `$` may not cross an import); the feature file reads the world and calls these.
 */

export type TokenTotals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  /** Distinct API responses counted (one per message id). */
  responses: number
}

export const emptyTotals = (): TokenTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, responses: 0 })

export const totalTokens = (t: TokenTotals): number => t.input + t.output + t.cacheRead + t.cacheWrite

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/**
 * Sum `message.usage` over a transcript (one JSON object per line). Claude Code stores one API response as several
 * lines when it has several content blocks (thinking, text, tool_use), each carrying the same `message.id` and the same
 * `usage`, so responses are counted once per id; a line without an id counts on its own. Lines that do not parse are
 * skipped. Subagent transcripts are separate files and are not included.
 */
export function sumTranscriptUsage(text: string): TokenTotals {
  const t = emptyTotals()
  const seen = new Set<string>()
  let anon = 0
  for (const line of text.split('\n')) {
    if (line.indexOf('"usage"') < 0) continue
    let j: unknown
    try { j = JSON.parse(line) } catch { continue }
    const m = (j as { message?: { id?: unknown; usage?: unknown } } | null)?.message
    const u = m?.usage
    if (!u || typeof u !== 'object') continue
    const idRaw = m?.id ?? (j as { requestId?: unknown }).requestId
    const id = typeof idRaw === 'string' && idRaw !== '' ? idRaw : `#${++anon}`
    if (seen.has(id)) continue
    seen.add(id)
    const r = u as Record<string, unknown>
    t.input += num(r.input_tokens)
    t.output += num(r.output_tokens)
    t.cacheRead += num(r.cache_read_input_tokens)
    t.cacheWrite += num(r.cache_creation_input_tokens)
    t.responses += 1
  }
  return t
}

/** 950 → "950", 12_345 → "12.3k", 1_234_567 → "1.23M". */
export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '?'
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 2 : 1).replace(/\.?0+$/, '')}k`
  return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
}

/** 0 → "$0.00", 4.9957 → "$5.00", 0.0042 → "$0.004" (sub-cent amounts keep a third decimal so they do not read as free). */
export function fmtUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return '$?'
  if (usd > 0 && usd < 0.01) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

/**
 * Where Claude Code keeps the main transcript of a session: `<home>/.claude/projects/<cwd with every character
 * outside [A-Za-z0-9] replaced by '-'>/<session id>.jsonl` (the layout the CLI has used since 1.x; verified on
 * 2.1.294). The caller treats a missing file as "no figure", never as zero.
 */
export function transcriptPath(home: string, cwd: string, sessionId: string): string | null {
  if (!home || !cwd || !sessionId) return null
  const key = cwd.replace(/[^A-Za-z0-9]/g, '-')
  return `${home.replace(/\/+$/, '')}/.claude/projects/${key}/${sessionId}.jsonl`
}
