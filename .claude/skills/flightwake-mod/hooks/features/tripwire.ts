/**
 * F4 TRAPS tripwires: when an Edit/Write/NotebookEdit or Bash call matches an active TRAPS entry's `paths` or
 * `commands`, a compact hint is appended to the tool result's `context` (what the model reads after the result).
 * It NEVER blocks: a denied call passes through untouched, and every failure falls through to the plain result.
 * With `trips` on, a trap is also recorded in $.state `trapsTripped` — at most once per session per repo, hinted or
 * not: the evidence a TRAPS compaction reads. Hint and record follow one rule (DECISIONS 2026-11-10): what the call
 * itself aims at — an Edit / Write / NotebookEdit whose file matches `paths`, a Bash command whose prefix matches
 * `commands`, or a path a Bash command writes (redirect, cp/mv/tee/rm, sed -i) that matches `paths`. A path a
 * command only reads or mentions (`cat db/x.sql`, `git diff -- db/`) does neither.
 * A call that did not run records nothing: a deny, or an error result that is a refusal (a settings PreToolUse hook's
 * deny, the auto-mode classifier's, or the permission prompt's — REFUSAL_RE). This file only records;
 * hooks/features/fleet.ts (registerTripLog, outside this hook) writes `<base>/trips/<id>.json`, the mod's only writer.
 * Contract: docs/plans/mods.md (revised) and the header of hooks/lib/core.ts. Read scope: .flightwake/TRAPS.md only.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { M, fwContext, readRel, TRAPS_REL } from '../lib/core'
import type { Io, Lang } from '../lib/core'
import { addTrips, fleetBase, hasTrip } from '../lib/fleet'
import { matchBash, matchFile } from '../lib/traps-core.mjs'
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

/** `isAimed`: the call itself aimed at the entry (its file, a command prefix, or a path a command writes). Every hit
 *  is aimed since 2026-11-10 (a mere mention no longer matches); the field stays for recordTrips' filter. */
type Hit = { entry: TrapEntry; via: string; isAimed: boolean }

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

// Matching (which entries a call aims at, the cwd tracking for Bash) is the shared TRAPS core: traps-core.mjs matchFile /
// matchBash, the same code the plain trap-check hook and the CLI run (A5, docs/plans/tripwire-hook.md).
const aimed = (hits: ReadonlyArray<{ entry: TrapEntry; via: string }>): Hit[] => hits.map((h) => ({ ...h, isAimed: true }))

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

/**
 * The `name@version` keys the plain trap-check hook (.flightwake/hooks/trap-check.mjs, A5) already showed for this very
 * call: its hint record `<base>/hints/claude-<session id>.json` names the tool_use_id each key was shown for. A settings
 * PreToolUse hook runs inside next(e), so its record is there by the time this hook reads it. Best effort: anything
 * unreadable answers "none", and the mod hints as before (a duplicate beats a miss).
 */
async function shownByHook($: EngineInterface, sessionId: string, toolUseId: unknown): Promise<Set<string>> {
  const out = new Set<string>()
  if (typeof toolUseId !== 'string' || toolUseId === '' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(sessionId)) return out
  try {
    let FLIGHTWAKE_HOME: string | undefined
    let HOME: string | undefined
    let USERPROFILE: string | undefined
    try { FLIGHTWAKE_HOME = await $.env.get('FLIGHTWAKE_HOME') } catch {}
    try { HOME = await $.env.get('HOME') } catch {}
    try { USERPROFILE = await $.env.get('USERPROFILE') } catch {}
    const base = fleetBase({ FLIGHTWAKE_HOME, HOME, USERPROFILE })
    if (base === null) return out
    const file = `${base}/hints/claude-${sessionId}.json`
    if (!(await $.fs.exists(file))) return out
    const text = await $.fs.read(file)
    const d: unknown = typeof text === 'string' ? JSON.parse(text) : null
    if (!d || typeof d !== 'object') return out
    const rec = d as { v?: unknown; host?: unknown; sessionId?: unknown; repos?: unknown }
    if (rec.v !== 1 || rec.host !== 'claude' || rec.sessionId !== sessionId || !rec.repos || typeof rec.repos !== 'object') return out
    for (const repo of Object.values(rec.repos as Record<string, unknown>)) {
      if (!repo || typeof repo !== 'object') continue
      for (const [k, v] of Object.entries(repo as Record<string, unknown>)) {
        if (v && typeof v === 'object' && (v as { toolUseId?: unknown }).toolUseId === toolUseId) out.add(k)
      }
    }
  } catch {
    // unreadable: the mod hints as before
  }
  return out
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
  const hits = aimed(isFile ? matchFile(entries, ctx.root, target) : matchBash(entries, ctx.root, cwd0, target))
  if (!hits.length) return null

  const sessionId = await io.sessionId()
  // recorded before the dedup below: a trap not hinted again is still tripped (in this repo, if new here)
  if (mayRecord) await recordTrips($, sessionId, ctx.root, hits)
  const key = (h: Hit) => `${h.entry.name}@${h.entry.version}`
  // what the plain hook already showed for this call counts as shown here too (never printed twice); its record is read
  // only when something here is new this session, so a repeat costs nothing outside the repo
  const prior = await read($, hinted)
  const priorSeen = prior && prior.sessionId === sessionId ? prior.keys : []
  if (hits.every((h) => priorSeen.includes(key(h)))) return null
  const byHook = await shownByHook($, sessionId, e.tool_use_id)
  let shown: Hit[] = []
  let more = 0
  await update($, hinted, (cur) => {
    const seen = cur && cur.sessionId === sessionId ? cur.keys : []
    const fresh = hits.filter((h) => !seen.includes(key(h)))
    const mine = fresh.filter((h) => !byHook.has(key(h)))
    shown = mine.slice(0, MAX_ENTRIES)
    more = mine.length - shown.length
    return { sessionId, keys: [...seen, ...fresh.filter((h) => byHook.has(key(h))).map(key), ...shown.map(key)] }
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
