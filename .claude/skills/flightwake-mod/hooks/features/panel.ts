/**
 * F8 side panel — one pane beside the transcript gathering what the other features already know: STATE (health,
 * lag, context, the "In progress" and "Next entry points" items), this session's flight log and spend, and the
 * other live sessions from the fleet heartbeat. 2026-10-11 field feedback: the band hides itself under the bottom
 * gauge, so with both installed nothing of the mod was on screen.
 *
 * Opened only by the person: `/fw-panel` toggles it and its answer is kept in $.store (`panelOpen`), so a later
 * session reopens it unasked — which the engine places beside the transcript from 110 columns and otherwise keeps
 * waiting undrawn. Closing it by hand (its close mark, ctrl+x x) or `/fw-panel off` turns that off again.
 *
 * The digest is computed outside rendering (session.start, turn.complete, a commit); the render hook only reads
 * $.state values, so a feature's write redraws the panel. It never runs git while drawing and writes nothing but
 * the one $.store key.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement } from 'claude-code'

import { fwContext, healthOf, isUninitializedState, joinPath, STATE_REL, stateLag } from '../lib/core'
import type { Io, Lang } from '../lib/core'
import { fmtAge, T as FLEET_T } from '../lib/fleet'
import { PANE_ID, panelVerb, stateDigest, STORE_KEY, T } from '../lib/panel'
import type { FwBandView, FwFleet, FwFlightLog, FwPanelDigest, FwSpend } from '../../types/index'
import { lagText } from './band'
import { spendLine } from './spend'

const panelDigest = atom({ plugin: 'flightwake-mod', key: 'panelDigest' } as const, null)
const bandRef = atom({ plugin: 'flightwake-mod', key: 'bandView' } as const, null)
const spendRef = atom({ plugin: 'flightwake-mod', key: 'spend' } as const, null)
const logRef = atom({ plugin: 'flightwake-mod', key: 'flightLog' } as const, null)
const fleetRef = atom({ plugin: 'flightwake-mod', key: 'fleet' } as const, null)

export type PanelSwitches = { band: boolean; recorder: boolean; spend: boolean; fleet: boolean }

// The Io closure over this file's `$` (IO_OF_TEMPLATE in hooks/lib/core.ts; `$` may not cross an import).
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

/** Reads STATE (and, with the band off, the lag) into the digest; null when flightwake is not set up here. */
async function compute($: EngineInterface, sw: PanelSwitches): Promise<FwPanelDigest | null> {
  const io = ioOf($)
  const ctx = await fwContext(io)
  if (ctx === null) return null
  const text = await io.read(joinPath(ctx.root, STATE_REL))
  if (text === null) return null
  const isUninitialized = isUninitializedState(text)
  const d = stateDigest(text)
  // With the band on, its view already holds the lag (same git calls); measuring again would double them per turn
  let lag: FwPanelDigest['lag'] = null
  if (!sw.band && !isUninitialized) {
    const l = await stateLag(io, ctx.root)
    lag = l === null ? { kind: 'none', behind: null } : { kind: l.kind, behind: l.kind === 'behind' ? l.behind : null }
  }
  let contextPercent: number | null = null
  try {
    const p = (await $.session.usage()).context.percent
    contextPercent = typeof p === 'number' && Number.isFinite(p) ? p : null
  } catch { contextPercent = null }
  return {
    sessionId: await io.sessionId(),
    lang: ctx.lang,
    health: isUninitialized ? 'unknown' : healthOf(text),
    updated: isUninitialized ? null : d.updated,
    isUninitialized,
    inProgress: isUninitialized ? [] : d.inProgress,
    next: isUninitialized ? [] : d.next,
    moreInProgress: isUninitialized ? 0 : d.moreInProgress,
    moreNext: isUninitialized ? 0 : d.moreNext,
    lag,
    contextPercent,
  }
}

async function refresh($: EngineInterface, sw: PanelSwitches): Promise<FwPanelDigest | null> {
  try {
    const d = await compute($, sw)
    await update($, panelDigest, () => d)
    return d
  } catch {
    return null
  }
}

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  try { return (await $.ui.panes()).some((p) => p.id === PANE_ID) } catch { return false }
}

let isCommandRegistered = false
async function ensureCommand($: EngineInterface, lang: Lang): Promise<void> {
  if (isCommandRegistered) return
  isCommandRegistered = true
  try {
    await $.command.register({ name: 'fw-panel', description: T.description[lang], argumentHint: '[on|off]' })
  } catch {
    isCommandRegistered = false
  }
}

const HOT = 80
const WARM = 60
const RECENT_FILES = 4
const RECENT_TESTS = 3

export function registerPanel(on: On, sw: PanelSwitches): void {
  on('session.start', {}, async ($, e, next) => {
    const r = await next(e)
    const d = await refresh($, sw)
    if (d === null) return r
    await ensureCommand($, d.lang)
    try {
      // Unasked: the engine seats it from 110 columns for a pane the person opened before, else it waits undrawn
      if (e.isInteractive && (await $.store.get(STORE_KEY)) === true && !(await isPaneOpen($))) {
        void $.ui.open({ id: PANE_ID, title: T.title[d.lang] }).catch(() => {})
      }
    } catch {}
    return r
  })

  on('turn.complete', {}, async ($, e, next) => {
    const r = await next(e)
    await refresh($, sw)
    return r
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    try {
      if (ran.deny === undefined && ran.isError === undefined) {
        const op = (ran.result as { gitOperation?: { commit?: unknown; branch?: unknown } } | undefined)?.gitOperation
        if (op && (op.commit || op.branch)) await refresh($, sw)
      }
    } catch {}
    return ran
  })

  on('command.run', { command: 'fw-panel' }, async ($, e) => {
    const d = await refresh($, sw)
    const lang: Lang = d?.lang ?? 'en'
    const verb = panelVerb(e.args)
    const isOpen = await isPaneOpen($)
    if (verb === 'off' || (verb === 'toggle' && isOpen)) {
      try { await $.store.set(STORE_KEY, false) } catch {}
      if (isOpen) { try { await $.ui.close({ id: PANE_ID }) } catch {} }
      return { text: T.closed[lang] }
    }
    try { await $.store.set(STORE_KEY, true) } catch {}
    try {
      const opened = await $.ui.open({ id: PANE_ID, title: T.title[lang] })
      return { text: opened.isPlaced ? T.opened[lang] : T.waiting[lang](opened.reason) }
    } catch {
      return { text: T.failed[lang] }
    }
  })

  // The person's own close is their answer for later sessions too (the engine stops seating it unasked as well)
  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    if (e.origin.kind === 'person') { try { await $.store.set(STORE_KEY, false) } catch {} }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e, next) => {
    try {
      const d = await read($, panelDigest)
      if (!d) return next(e)
      const lang = d.lang
      const { Box, Text } = $.ui.resolve(e)
      const line = (props: Record<string, unknown>, text: string) => h(Text, { wrap: 'truncate-end', ...props }, text)
      const rows: unknown[] = []

      // ── header: health · lag · context ──
      const band = (await read($, bandRef)) as FwBandView | null
      const lagSrc = d.lag !== null ? { lagKind: d.lag.kind, behind: d.lag.behind } : band ? { lagKind: band.lagKind, behind: band.behind } : null
      const lag = lagSrc === null ? '' : lagText(lang, lagSrc)
      const pct = d.contextPercent
      const color = d.health === 'green' ? 'green' : d.health === 'yellow' ? 'yellow' : d.health === 'red' ? 'red' : undefined
      rows.push(h(Box, { flexDirection: 'row', overflow: 'hidden' },
        h(Text, { bold: true, wrap: 'truncate' }, '✈ flightwake'),
        h(Text, { color, wrap: 'truncate' }, ` ●${d.health === 'unknown' ? '?' : d.health}`),
        ...(lag ? [h(Text, { wrap: 'truncate' }, ` · ${lag}`)] : []),
        ...(pct !== null ? [h(Text, { color: pct >= HOT ? 'red' : pct >= WARM ? 'yellow' : undefined, wrap: 'truncate' }, ` · ${T.context[lang](Math.round(pct))}`)] : []),
      ))
      const spend = sw.spend ? ((await read($, spendRef)) as FwSpend | null) : null
      const sl = spend !== null && spend.sessionId === d.sessionId ? spendLine(spend) : ''
      const sub = [d.updated ? T.updated[lang](d.updated) : '', sl || (sw.spend ? T.spendNone[lang] : '')].filter(Boolean).join(' · ')
      if (sub) rows.push(line({ dimColor: true }, sub))

      if (d.isUninitialized) {
        rows.push(h(Box, { marginTop: 1 }, line({ color: 'yellow' }, T.uninitialized[lang])))
      } else {
        // ── STATE sections ──
        const section = (title: string, items: string[], more: number, mark: (i: number) => string) => {
          rows.push(h(Box, { marginTop: 1 }, line({ bold: true }, title)))
          if (items.length === 0) rows.push(line({ dimColor: true }, `  ${T.none[lang]}`))
          items.forEach((it, i) => rows.push(line({}, `${mark(i)} ${it}`)))
          if (more > 0) rows.push(line({ dimColor: true }, `  ${T.more[lang](more)}`))
        }
        section(T.inProgress[lang], d.inProgress, d.moreInProgress, () => '•')
        section(T.next[lang], d.next, d.moreNext, () => '›')
      }

      // ── this session ──
      rows.push(h(Box, { marginTop: 1 }, line({ bold: true }, T.session[lang])))
      if (!sw.recorder) rows.push(line({ dimColor: true }, `  ${T.recorderOff[lang]}`))
      else {
        const raw = (await read($, logRef)) as FwFlightLog | null
        const log = raw !== null && raw.sessionId === d.sessionId ? raw : null
        const tests = log?.tests ?? []
        rows.push(line({}, T.counts[lang]({
          files: log?.files.length ?? 0, shell: log?.shellFiles?.length ?? 0, tests: tests.length,
          pass: tests.filter((t) => t.result === 'pass').length, fail: tests.filter((t) => t.result === 'fail').length,
          commits: log?.commits.length ?? 0,
        })))
        for (const t of tests.slice(-RECENT_TESTS).reverse()) {
          const ok = t.result === 'pass'
          rows.push(line({ color: ok ? 'green' : t.result === 'fail' ? 'red' : undefined, dimColor: t.result === 'unknown' }, `  ${ok ? '✓' : t.result === 'fail' ? '✗' : '?'} ${t.command}`))
        }
        const seen = new Set<string>()
        const recent: string[] = []
        for (const f of [...(log?.files ?? [])].reverse()) {
          if (seen.has(f.path)) continue
          seen.add(f.path)
          recent.push(f.path)
          if (recent.length >= RECENT_FILES) break
        }
        for (const p of recent) rows.push(line({ dimColor: true }, `  ✎ ${p}`))
      }

      // ── other sessions ──
      rows.push(h(Box, { marginTop: 1 }, line({ bold: true }, T.others[lang])))
      if (!sw.fleet) rows.push(line({ dimColor: true }, `  ${T.fleetOff[lang]}`))
      else {
        const f = (await read($, fleetRef)) as FwFleet | null
        if (f === null || f.status !== 'active') rows.push(line({ dimColor: true }, `  ${T.fleetNotReporting[lang]}`))
        else if (f.othersList === undefined || f.othersList === null) rows.push(line({ dimColor: true }, `  ${T.fleetWaiting[lang]}`))
        else if (f.othersList.length === 0) rows.push(line({ dimColor: true }, `  ${T.none[lang]}`))
        else {
          const word = FLEET_T.word[lang]
          for (const o of f.othersList) {
            const mark = o.display === 'blocked' ? '⛔' : o.display === 'working' ? '●' : '○'
            const kind = o.blockedKind ? `(${FLEET_T.kind[lang][o.blockedKind]})` : ''
            rows.push(line({ color: o.display === 'blocked' ? 'red' : undefined, dimColor: o.display === 'idle' },
              `${mark} ${o.label} · ${word[o.display]}${kind} ${fmtAge(o.ageMs)}`))
          }
        }
      }

      const tree = h(Box, { width: e.props.bodyColumns, flexDirection: 'column', overflow: 'hidden' }, ...rows)
      return tree && typeof tree !== 'string' ? (tree as RenderElement) : next(e)
    } catch {
      return next(e)
    }
  })
}
