/**
 * F4 TRAPS tripwires: when an Edit/Write/NotebookEdit or Bash call matches an active TRAPS entry's `paths` or
 * `commands`, a compact hint is appended to the tool result's `context` (what the model reads after the result).
 * It NEVER blocks: a denied call passes through untouched, and every failure falls through to the plain result.
 * With `trips` on, a trap is also recorded in $.state `trapsTripped` — at most once per session per repo, hinted or
 * not: the evidence a TRAPS compaction reads. Only what the call itself aimed at records: an Edit / Write /
 * NotebookEdit whose file matches `paths`, or a Bash command whose prefix matches `commands`. Path-like words inside
 * a Bash command (`cat db/x.sql`, `git diff -- db/`) still hint but do not record — that matching guesses on purpose.
 * A call that did not run records nothing: a deny, or an error result that is a refusal (a settings PreToolUse hook's
 * deny, the auto-mode classifier's, or the permission prompt's — REFUSAL_RE). This file only records;
 * hooks/features/fleet.ts (registerTripLog, outside this hook) writes `<base>/trips/<id>.json`, the mod's only writer.
 * Contract: docs/plans/mods.md (revised) and the header of hooks/lib/core.ts. Read scope: .flightwake/TRAPS.md only.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { M, fwContext, readRel, relToRoot, TRAPS_REL } from '../lib/core'
import type { Io, Lang } from '../lib/core'
import { addTrips, hasTrip } from '../lib/fleet'
import { matchAny } from '../lib/glob'
import { parseCommand, startsWithTokens } from '../lib/shell'
import { hasMatchers, isActive, parseTraps, REFUSAL_RE } from '../lib/traps'
import type { TrapEntry } from '../lib/traps'

const hinted = atom({ plugin: 'flightwake-mod', key: 'trapsHinted' } as const, null)
const tripped = atom({ plugin: 'flightwake-mod', key: 'trapsTripped' } as const, null)

const MAX_ENTRIES = 5
const MAX_LINE = 300

function ioOf($: EngineInterface): Io {
  return {
    root: async () => { try { return (await $.session.root()).replace(/\/+$/, '') } catch { return '' } },
    sessionId: async () => { try { return await $.session.id() } catch { return '' } },
    exists: async (p) => { try { return await $.fs.exists(p) } catch { return false } },
    read: async (p) => {
      try { if (!(await $.fs.exists(p))) return null; const t = await $.fs.read(p); return typeof t === 'string' ? t : null } catch { return null }
    },
    git: async (args, cwd) => {
      try { const r = await $.process.run(['git', '--no-optional-locks', ...args], { cwd, timeoutMs: 5000 }); return r.exitCode === 0 ? r.stdout.trim() : null } catch { return null }
    },
    settings: async () => { try { return await $.settings.read({}) } catch { return {} } },
  }
}

/** `isAimed`: the call itself aimed at the entry (its file, or a command prefix) — what a trip records. */
type Hit = { entry: TrapEntry; via: string; isAimed: boolean }

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** A bash word that plausibly names a repo file: has `/` or `.`, isn't an option, a URL or a home shorthand. */
function looksLikePath(t: string): boolean {
  if (t.startsWith('-') || t.startsWith('~') || t.includes('://') || t.includes('=')) return false
  return t.includes('/') || t.includes('.')
}

function matchFile(entries: TrapEntry[], root: string, filePath: string): Hit[] {
  const rel = relToRoot(root, filePath)
  if (rel === null || rel === '') return []
  const out: Hit[] = []
  for (const entry of entries) if (entry.paths.length && matchAny(entry.paths, rel) !== null) out.push({ entry, via: rel, isAimed: true })
  return out
}

/** At most this many possible cwds are tracked; past it, matching degrades to glob tails (no cwd at all). */
const MAX_CWDS = 16

/**
 * Coarse match used once the cwd is no longer tracked: does `glob` match the path word itself or any tail of the
 * glob match it (`pkg/src/**` → `src/**` → `**`)? Over-hints by design — F4 only hints, once per entry per session.
 */
function tailMatch(globs: readonly string[], word: string): boolean {
  const w = word.replace(/^\.\//, '')
  for (const g of globs) {
    const segs = g.replace(/^\.?\//, '').split('/')
    for (let k = 0; k < segs.length; k++) {
      const tail = segs.slice(k).join('/')
      if (tail && tail !== '**' && matchAny([tail], w) !== null) return true
    }
  }
  return false
}

/** The file a redirection names (`>out`, `2>>log`, `&>f`, `<in`), or the word itself. '' for a bare operator. */
const redirectTarget = (tok: string): string => tok.replace(/^(?:\d*|&)?[<>]>?/, '')

/**
 * Bash: command prefixes per segment, and path-like words resolved against every directory the shell could be in.
 * F4 only hints and hints once per entry per session, so when the cwd is uncertain it over-hints rather than miss:
 * - only a plain chain `cd X && …` is a certain move (the set of cwds is replaced);
 * - a `cd` followed by `||`, `&`, `|`, `;` or a newline, or after any such operator, may or may not have moved this
 *   shell: the moved directories are ADDED to the set;
 * - `( … )` subshells are walked: inside, cds apply as above; after the `)`, the set from before the `(` is back;
 * - a `cd` that can't be resolved without guessing (`cd -`, `~`, `$VAR`, bare `cd`) leaves the set as it is;
 * - the set is bounded (MAX_CWDS): past it, matching degrades to glob tails (tailMatch) for the rest, so
 *   the hint never costs more than one pass over the words — a long chain of uncertain cds can't blow it up.
 */
function matchBash(entries: TrapEntry[], root: string, cwd0: string, command: string): Hit[] {
  const parsed = parseCommand(command)
  const out = new Map<TrapEntry, string>()
  /** Entries some segment's command prefix matched (the hint may name a path word found earlier). */
  const aimed = new Set<TrapEntry>()
  let cwds: Set<string> | null = new Set<string>([cwd0]) // null = degraded: cwd no longer tracked
  let isCertain = true
  const stack: Array<{ cwds: Set<string> | null; isCertain: boolean }> = []
  for (const seg of parsed.segments) {
    if (seg.group === 'open') {
      stack.push({ cwds: cwds === null ? null : new Set(cwds), isCertain })
      continue
    }
    if (seg.group === 'close') {
      const saved = stack.pop()
      if (saved) ({ cwds, isCertain } = saved)
      if (seg.op && seg.op !== '&&') isCertain = false
      continue
    }
    for (const entry of entries) {
      const prefix = entry.commands.find((p) => startsWithTokens(seg.tokens, p))
      if (prefix !== undefined) {
        aimed.add(entry)
        if (!out.has(entry)) out.set(entry, prefix.trim().split(/\s+/).join(' '))
        continue
      }
      if (out.has(entry)) continue
      if (!entry.paths.length) continue
      search: for (const tok of seg.tokens) {
        const word = redirectTarget(tok)
        if (!word || !looksLikePath(word)) continue
        if (word.startsWith('/')) {
          const rel = relToRoot(root, word)
          if (rel !== null && rel !== '' && matchAny(entry.paths, rel) !== null) { out.set(entry, rel); break search }
          continue
        }
        if (cwds === null) {
          if (tailMatch(entry.paths, word)) { out.set(entry, word); break search }
          continue
        }
        for (const cwd of cwds) {
          const rel = relToRoot(root, `${cwd}/${word}`)
          if (rel !== null && rel !== '' && matchAny(entry.paths, rel) !== null) { out.set(entry, rel); break search }
        }
      }
    }
    if (seg.tokens[0] === 'cd' && cwds !== null) {
      const args = seg.tokens[1] === '--' ? seg.tokens.slice(2) : seg.tokens.slice(1)
      const dir = args[0]
      const isResolvable = args.length === 1 && dir !== undefined && dir !== '-' && !dir.startsWith('~') && !dir.includes('$')
      if (isResolvable) {
        const moved = [...cwds].map((c) => (dir.startsWith('/') ? dir : `${c}/${dir}`))
        const next: Set<string> = isCertain && seg.op === '&&' ? new Set(moved) : new Set([...cwds, ...moved])
        cwds = next.size > MAX_CWDS ? null : next
      }
    }
    if (seg.op && seg.op !== '&&') isCertain = false
  }
  return [...out].map(([entry, via]) => ({ entry, via, isAimed: aimed.has(entry) }))
}

const clip = (s: string): string => (s.length > MAX_LINE ? `${s.slice(0, MAX_LINE)}…` : s)

function render(lang: Lang, shown: Hit[], more: number): string {
  const lines: string[] = []
  let isLead = false
  for (const { entry, via } of shown) {
    if (entry.confidence !== 'confirmed') isLead = true
    lines.push(
      M(lang, {
        en: `flightwake TRAPS: \`${entry.name}\` [${entry.confidence}] matches ${via}`,
        'zh-TW': `flightwake TRAPS:\`${entry.name}\` [${entry.confidence}] 命中 ${via}`,
        'zh-CN': `flightwake TRAPS:\`${entry.name}\` [${entry.confidence}] 命中 ${via}`,
        ja: `flightwake TRAPS: \`${entry.name}\` [${entry.confidence}] が ${via} に該当`,
      }),
    )
    const detail = [entry.labelled[1], entry.labelled[2]].filter((l): l is string => !!l)
    if (detail.length) for (const l of detail) lines.push(`  ${clip(l)}`)
    else if (entry.body) lines.push(`  ${clip(entry.body.replace(/\s+/g, ' '))}`)
  }
  if (more > 0) {
    lines.push(M(lang, { en: `+${more} more`, 'zh-TW': `另有 ${more} 條`, 'zh-CN': `另有 ${more} 条`, ja: `ほか ${more} 件` }))
  }
  lines.push(M(lang, {
    en: 'This note arrives after this call ran: it cannot stop this one; it is for the next time you touch this.',
    'zh-TW': '這則提示在本次呼叫執行之後才出現:它擋不了這一次,是提醒你下一次碰到這裡時注意。',
    'zh-CN': '这则提示在本次调用执行之后才出现:它拦不住这一次,是提醒你下一次碰到这里时注意。',
    ja: 'この注意は今回の呼び出しが実行された後に届きます。今回は防げません。次にここに触れるときのためのものです。',
  }))
  lines.push(M(lang, { en: `Full entry: ${TRAPS_REL}`, 'zh-TW': `完整條目:${TRAPS_REL}`, 'zh-CN': `完整条目:${TRAPS_REL}`, ja: `全文: ${TRAPS_REL}` }))
  if (isLead) {
    lines.push(
      M(lang, {
        en: 'Note: probable/suspected/unknown entries are leads, not settled facts. Verify before relying on them, and never use one to argue that something is safe.',
        'zh-TW': '注意:probable/suspected/unknown 的條目是線索,不是定論。採信前先驗證,也不可拿它來論證某件事是安全的。',
        'zh-CN': '注意:probable/suspected/unknown 的条目是线索,不是定论。采信前先验证,也不可拿它来论证某件事是安全的。',
        ja: '注意: probable/suspected/unknown のエントリは手がかりであり確定事項ではありません。依拠する前に検証し、安全性の根拠には使わないでください。',
      }),
    )
  }
  return lines.join('\n')
}

/**
 * Record the aimed hits' (repo, name) pairs the first time each is seen this session; a pair already there costs
 * one $.state read and nothing else. Never throws: a trip that cannot be kept never costs the hint.
 */
async function recordTrips($: EngineInterface, sessionId: string, repo: string, hits: readonly Hit[]): Promise<void> {
  try {
    const names = hits.filter((h) => h.isAimed).map((h) => h.entry.name)
    if (names.length === 0) return
    const cur = await read($, tripped)
    if (cur !== null && cur.sessionId === sessionId && names.every((n) => hasTrip(cur.trips, repo, n))) return
    let ms = Date.now()
    try { const t = await $.clock.now(); if (typeof t === 'number' && Number.isFinite(t)) ms = t } catch {}
    const iso = new Date(ms).toISOString()
    await update($, tripped, (c) => addTrips(c, sessionId, repo, names, iso) ?? c)
  } catch {
    // a trip that cannot be kept never costs the hint
  }
}

/** tool_use_ids a settings PreToolUse hook or the auto-mode classifier refused, until their tool.call settles. */
const refusedIds = new Set<string>()
const REFUSED_CAP = 256
const noteRefused = (id: unknown): void => {
  if (typeof id !== 'string' || id === '') return
  if (refusedIds.size >= REFUSED_CAP) refusedIds.clear()
  refusedIds.add(id)
}

/** The hint to append for this call, or null. May take `$` because it is declared in this file. */
async function hintFor($: EngineInterface, e: Record<string, unknown>, mayRecord: boolean): Promise<string | null> {
  const tool = e.tool
  const isFile = tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit'
  if (!isFile && tool !== 'Bash') return null
  const target = isFile ? (str(e.file_path) ?? str(e.notebook_path)) : str(e.command)
  if (target === null) return null

  const io = ioOf($)
  const ctx = await fwContext(io)
  if (ctx === null) return null
  const text = await readRel(io, ctx.root, TRAPS_REL)
  if (text === null) return null
  const entries = parseTraps(text).filter((t) => isActive(t) && hasMatchers(t))
  if (!entries.length) return null

  let cwd0 = ctx.root
  if (!isFile) {
    try { cwd0 = (await $.session.cwd()).replace(/\/+$/, '') || ctx.root } catch {}
  }
  const hits = isFile ? matchFile(entries, ctx.root, target) : matchBash(entries, ctx.root, cwd0, target)
  if (!hits.length) return null

  const sessionId = await io.sessionId()
  // recorded before the dedup below: a trap not hinted again is still tripped (in this repo, if new here)
  if (mayRecord) await recordTrips($, sessionId, ctx.root, hits)
  const key = (h: Hit) => `${h.entry.name}@${h.entry.version}`
  let shown: Hit[] = []
  let more = 0
  await update($, hinted, (cur) => {
    const seen = cur && cur.sessionId === sessionId ? cur.keys : []
    const fresh = hits.filter((h) => !seen.includes(key(h)))
    shown = fresh.slice(0, MAX_ENTRIES)
    more = fresh.length - shown.length
    return { sessionId, keys: [...seen, ...shown.map(key)] }
  })
  if (!shown.length) return null
  return render(ctx.lang, shown, more)
}

export type TripwireSwitches = { trips: boolean }

export function registerTripwire(on: On, sw: TripwireSwitches): void {
  on('tool.call', {}, async ($, e, next) => {
    const id = e.tool_use_id
    let r: Awaited<ReturnType<typeof next>>
    try {
      r = await next(e)
    } catch (err) {
      if (typeof id === 'string') refusedIds.delete(id)
      throw err
    }
    const wasRefused = typeof id === 'string' && refusedIds.delete(id)
    if (r.deny !== undefined) return r
    try {
      // a call that did not run trips nothing; its hint is unchanged (it never depended on the outcome)
      const isRefusal = r.isError === true && (wasRefused || REFUSAL_RE.test(typeof r.text === 'string' ? r.text : ''))
      const hint = await hintFor($, e as Record<string, unknown>, sw.trips && !isRefusal)
      if (hint !== null) return { ...r, context: [...(r.context ?? []), hint] }
    } catch {
      // a failing tripwire never touches the person's work
    }
    return r
  })

  if (!sw.trips) return
  // A settings PreToolUse hook's deny reaches tool.call as an error result carrying only its own reason: noted here,
  // beneath every plugin's tool.call and above the settings hooks, by the call's id.
  on('classic.PreToolUse', {}, async ($, e, next) => {
    const r = await next(e)
    try { if (r !== undefined && r !== null && r.deny !== undefined) noteRefused(e.tool_use_id) } catch {}
    return r
  })
  // the auto-mode classifier's deny (its text is caught by REFUSAL_RE as well)
  on('classic.PermissionDenied', {}, async ($, e, next) => {
    const r = await next(e)
    try { noteRefused(e.tool_use_id) } catch {}
    return r
  })
}
