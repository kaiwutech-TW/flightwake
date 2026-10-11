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
import type { EngineInterface, On, RenderElement, Timer } from 'claude-code'

import { detectVersion, FW_DIR, fwContext, git, healthOf, isUninitializedState, joinPath, MOD_VERSION, parseFrontmatter, readRel, STATE_REL, stateLag, TRAPS_REL } from '../lib/core'
import type { Io, Lang } from '../lib/core'
import { fmtAge, T as FLEET_T } from '../lib/fleet'
import { CONTEXT_HOT, healthWhy, PANE_ID, panelVerb, recordUnfinished, stateDigest, STORE_KEY, T, TRAPS_COMPACT_AT } from '../lib/panel'
import { isActive, parseTraps } from '../lib/traps'
import { agentName, baseName, cleanTitle, contextBar, groupByRepo, parseTerminalList, POLL_MS, REPO_CAP, stateWord, T as OT, termState, wrapUpCommand } from '../lib/orca'
import type { TermState } from '../lib/orca'
import type { FwBandView, FwConsole, FwConsoleRepo, FwFleet, FwFleetOther, FwFlightLog, FwPanelDigest, FwPanelUi, FwSpend } from '../../types/index'
import { lagText } from './band'
import { spendLine } from './spend'

const panelDigest = atom({ plugin: 'flightwake-mod', key: 'panelDigest' } as const, null)
const bandRef = atom({ plugin: 'flightwake-mod', key: 'bandView' } as const, null)
const spendRef = atom({ plugin: 'flightwake-mod', key: 'spend' } as const, null)
const logRef = atom({ plugin: 'flightwake-mod', key: 'flightLog' } as const, null)
const fleetRef = atom({ plugin: 'flightwake-mod', key: 'fleet' } as const, null)
const consoleRef = atom({ plugin: 'flightwake-mod', key: 'console' } as const, null)
const uiRef = atom({ plugin: 'flightwake-mod', key: 'panelUi' } as const, null)

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
    fwVersion: await detectVersion(io, ctx.root),
    selfHandle: await selfHandleOf($),
    attention: await attentionOf(io, ctx.root, text, isUninitialized),
  }
}

/** This session's Orca terminal handle, or null outside Orca. */
async function selfHandleOf($: EngineInterface): Promise<string | null> {
  try { const v = await $.env.get('ORCA_TERMINAL_HANDLE'); return typeof v === 'string' && /^term_[A-Za-z0-9-]{1,80}$/.test(v) ? v : null } catch { return null }
}

/** What needs attention beyond STATE's items: uncommitted files, why health is not green, the latest record's open ends, TRAPS to compact. */
async function attentionOf(io: Io, root: string, stateText: string, isUninitialized: boolean): Promise<FwPanelDigest['attention']> {
  const status = await git(io, root, ['status', '--porcelain'])
  const dirty = status === null ? null : status === '' ? 0 : status.split('\n').length
  const health = healthOf(stateText)
  let record: string | null = null
  let unfinished: string[] = []
  let moreUnfinished = 0
  const latest = isUninitialized ? undefined : parseFrontmatter(stateText)?.latest_record
  // `records/<name>.md` under .flightwake/ only: never follow a path out of it
  if (latest && /^records\/[^/\\]+\.md$/.test(latest)) {
    const t = await readRel(io, root, `${FW_DIR}/${latest}`)
    if (t !== null) {
      const u = recordUnfinished(t)
      record = latest.slice('records/'.length, -'.md'.length)
      unfinished = u.items
      moreUnfinished = u.more
    }
  }
  const traps = await readRel(io, root, TRAPS_REL)
  const active = traps === null ? 0 : parseTraps(traps).filter(isActive).length
  return {
    dirty,
    healthWhy: health === 'yellow' || health === 'red' ? healthWhy(stateText) : null,
    record,
    unfinished,
    moreUnfinished,
    trapsActive: active > TRAPS_COMPACT_AT ? active : null,
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
const REPO_INFO_MS = 60000

// ── the fleet console: Orca's terminals, joined to the fleet reports ──────────────────────────────────────────────
// Module memory on purpose: a reload starts the poll again from session.start, and nothing here outlives the pane.
let pollTimer: Timer | null = null
let isPolling = false
const repoInfo = new Map<string, { at: number; info: FwConsoleRepo }>()

/** Where Orca put its CLI beside this terminal (an absolute path), or null. */
async function orcaBinDir($: EngineInterface): Promise<string | null> {
  try { const v = await $.env.get('ORCA_CLI_BIN_DIR'); return typeof v === 'string' && v.startsWith('/') ? v : null } catch { return null }
}

/** `orca <args>`: the CLI Orca put beside the terminal (ORCA_CLI_BIN_DIR), else `orca` on PATH. Null on any failure. */
async function runOrca($: EngineInterface, args: readonly string[]): Promise<string | null> {
  try {
    const dir = await orcaBinDir($)
    const bin = dir !== null ? `${dir.replace(/\/+$/, '')}/orca` : 'orca'
    const r = await $.process.run([bin, ...args], { timeoutMs: 5000 })
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

/** A listed worktree's own flightwake files, read-only: is it installed, its health, its marker version. */
async function readRepo(io: Io, path: string, now: number): Promise<FwConsoleRepo> {
  const held = repoInfo.get(path)
  if (held && now - held.at < REPO_INFO_MS) return held.info
  const state = await io.read(joinPath(path, STATE_REL))
  const info: FwConsoleRepo = state === null
    ? { isFlightwake: false, health: 'unknown', fwVersion: null }
    : { isFlightwake: true, health: isUninitializedState(state) ? 'unknown' : healthOf(state), fwVersion: await detectVersion(io, path) }
  repoInfo.set(path, { at: now, info })
  return info
}

async function poll($: EngineInterface): Promise<void> {
  if (isPolling) return
  isPolling = true
  try {
    if (!(await isPaneOpen($))) { stopPolling(); return }
    let now = Date.now()
    try { now = await $.clock.now() } catch {}
    const out = await runOrca($, ['terminal', 'list', '--json'])
    const terms = out === null ? null : parseTerminalList(out)
    if (terms === null) {
      await update($, consoleRef, (cur): FwConsole => ({ at: now, status: 'no-orca', terms: cur?.terms ?? [], repos: cur?.repos ?? {} }))
      return
    }
    const io = ioOf($)
    const repos: Record<string, FwConsoleRepo> = {}
    for (const p of [...new Set(terms.map((t) => t.worktreePath).filter((p) => p.startsWith('/')))].slice(0, REPO_CAP)) {
      repos[p] = await readRepo(io, p, now)
    }
    await update($, consoleRef, (): FwConsole => ({ at: now, status: 'ok', terms, repos }))
  } catch {
  } finally {
    isPolling = false
  }
}

/** Starts the 10 s poll (once) and resolves after its first answer. */
async function startPolling($: EngineInterface): Promise<void> {
  if (pollTimer !== null) return
  try {
    pollTimer = $.clock.every(POLL_MS, () => { void poll($) })
  } catch { pollTimer = null; return }
  await poll($)
}

function stopPolling(): void {
  if (pollTimer === null) return
  try { pollTimer.cancel() } catch {}
  pollTimer = null
}

/** The console runs only inside Orca: this session's own terminal handle says so. */
async function startIfOrca($: EngineInterface): Promise<void> {
  if ((await selfHandleOf($)) !== null) await startPolling($)
}

async function notify($: EngineInterface, text: string, isError: boolean): Promise<void> {
  let at = Date.now()
  try { at = await $.clock.now() } catch {}
  await update($, uiRef, () => ({ confirm: null, notice: { text, isError, at } }))
}

/** "Wrap up" for one agent: only while it is still idle, judged from a fresh list (never from what was drawn). */
async function sendWrapUp($: EngineInterface, lang: Lang, handle: string): Promise<void> {
  const out = await runOrca($, ['terminal', 'list', '--json'])
  const term = (out === null ? null : parseTerminalList(out))?.find((t) => t.handle === handle) ?? null
  if (term === null) { await notify($, OT.failed[lang]('terminal list'), true); return }
  const who = `${agentName(term.agent)} · ${cleanTitle(term)}`
  let now = Date.now()
  try { now = await $.clock.now() } catch {}
  const f = (await read($, fleetRef)) as FwFleet | null
  const reported = f?.othersList?.find((o) => o.orcaTerminal === handle) ?? null
  const state = reported !== null ? reported.display : termState(term, now)
  const cmd = wrapUpCommand(term.agent)
  if (state !== 'idle' || cmd === null) { await notify($, OT.notIdle[lang](who), true); return }
  const sent = await runOrca($, ['terminal', 'send', '--terminal', handle, '--text', cmd, '--enter', '--json'])
  await notify($, sent === null ? OT.failed[lang]('terminal send') : OT.sent[lang](cmd, who), sent === null)
}

export function registerPanel(on: On, sw: PanelSwitches): void {
  on('session.start', {}, async ($, e, next) => {
    const r = await next(e)
    const d = await refresh($, sw)
    if (d === null) return r
    await ensureCommand($, d.lang)
    try {
      // Unasked: the engine seats it from 110 columns for a pane the person opened before, else it waits undrawn
      // (an unasked open resolves at once, placed or waiting, so the poll below finds the pane registered)
      if (e.isInteractive && (await $.store.get(STORE_KEY)) === true && !(await isPaneOpen($))) {
        try { await $.ui.open({ id: PANE_ID, title: T.title[d.lang] }) } catch {}
      }
      // a reload of this module finds the pane still open: the poll starts again
      // in the background: a session start never waits on Orca
      if (e.isInteractive && ((await $.store.get(STORE_KEY)) === true || (await isPaneOpen($)))) void startIfOrca($).catch(() => {})
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
      stopPolling()
      return { text: T.closed[lang] }
    }
    try { await $.store.set(STORE_KEY, true) } catch {}
    try {
      const opened = await $.ui.open({ id: PANE_ID, title: T.title[lang] })
      await startIfOrca($)
      return { text: opened.isPlaced ? T.opened[lang] : T.waiting[lang](opened.reason) }
    } catch {
      return { text: T.failed[lang] }
    }
  })

  // The person's own close is their answer for later sessions too (the engine stops seating it unasked as well)
  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    if (e.origin.kind === 'person') { try { await $.store.set(STORE_KEY, false) } catch {} }
    stopPolling()
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e, next) => {
    try {
      const d = await read($, panelDigest)
      if (!d) return next(e)
      const lang = d.lang
      const { Box, Text, Button } = $.ui.resolve(e)
      // Prose wraps to the pane's width (2026-10-11 field feedback: cut lines hid what they were about); a marked line
      // keeps its mark in a column of its own so the wrapped rows hang under the text. Commands and paths stay one row.
      const line = (props: Record<string, unknown>, text: string) => h(Text, { wrap: 'wrap', ...props }, text)
      const cut = (props: Record<string, unknown>, text: string) => h(Text, { wrap: 'truncate-end', ...props }, text)
      const para = (mark: string, props: Record<string, unknown>, text: string) => h(Box, { flexDirection: 'row' },
        h(Box, { flexShrink: 0 }, h(Text, props, mark)),
        h(Box, { flexGrow: 1, flexShrink: 1 }, h(Text, { wrap: 'wrap', ...props }, text)))
      const card = (color: string | undefined, ...children: unknown[]) =>
        h(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: color, borderDimColor: color === undefined, paddingX: 1, marginTop: 1 }, ...children)
      const bar = (pct: number) => {
        const b = contextBar(pct)
        return h(Text, { wrap: 'truncate' }, h(Text, { color: b.color }, b.filled), h(Text, { dimColor: true }, b.empty), ` ${Math.round(pct)}%`)
      }
      const healthColor = (hl: string) => (hl === 'green' ? 'green' : hl === 'yellow' ? 'yellow' : hl === 'red' ? 'red' : undefined)
      const rows: unknown[] = []

      // ── this repo: health · lag · context bar · cost · versions · watch ──
      const band = (await read($, bandRef)) as FwBandView | null
      const lagSrc = d.lag !== null ? { lagKind: d.lag.kind, behind: d.lag.behind } : band ? { lagKind: band.lagKind, behind: band.behind } : null
      const lag = lagSrc === null ? '' : lagText(lang, lagSrc)
      const pct = d.contextPercent
      const spend = sw.spend ? ((await read($, spendRef)) as FwSpend | null) : null
      const sl = spend !== null && spend.sessionId === d.sessionId ? spendLine(spend) : ''
      const head: unknown[] = [
        h(Text, { wrap: 'wrap' },
          h(Text, { bold: true }, '✈ flightwake'),
          h(Text, { color: healthColor(d.health) }, ` ●${d.health === 'unknown' ? '?' : d.health}`),
          ...(lag ? [` · ${lag}`] : [])),
      ]
      if (pct !== null) head.push(h(Box, { flexDirection: 'row', gap: 1 }, h(Text, { dimColor: true }, 'context'), bar(pct)))
      const sub = [sl || (sw.spend ? T.spendNone[lang] : ''), T.versions[lang](d.fwVersion, MOD_VERSION)].filter(Boolean).join(' · ')
      head.push(line({ dimColor: true }, sub))
      const a = d.attention
      if (pct !== null && pct >= CONTEXT_HOT) head.push(para('! ', { color: 'red' }, T.wrapUp[lang]))
      if (a.healthWhy) head.push(para('! ', { color: d.health === 'red' ? 'red' : 'yellow' }, T.healthWhy[lang](d.health, a.healthWhy)))
      if (a.dirty !== null && a.dirty > 0) head.push(para('! ', { color: 'yellow' }, T.dirty[lang](a.dirty)))
      if (a.record !== null && a.unfinished.length > 0) {
        head.push(para('! ', {}, T.unfinished[lang](a.record)))
        for (const it of a.unfinished) head.push(para('  – ', {}, it))
        if (a.moreUnfinished > 0) head.push(line({ dimColor: true }, `  ${T.more[lang](a.moreUnfinished)}`))
      }
      if (a.trapsActive !== null) head.push(para('! ', { color: 'yellow' }, T.traps[lang](a.trapsActive)))
      rows.push(card(healthColor(d.health), ...head))

      // ── fleet: every agent Orca has, by repo; Claude Code sessions with the mod add their exact state ──
      const ui = ((await read($, uiRef)) as FwPanelUi | null) ?? { confirm: null, notice: null }
      const f = sw.fleet ? ((await read($, fleetRef)) as FwFleet | null) : null
      const reported = new Map<string, FwFleetOther>()
      for (const o of f?.othersList ?? []) if (o.orcaTerminal !== null) reported.set(o.orcaTerminal, o)
      const con = d.selfHandle !== null ? ((await read($, consoleRef)) as FwConsole | null) : null
      rows.push(h(Box, { marginTop: 1 }, line({ bold: true }, OT.fleet[lang])))
      if (d.selfHandle === null || con === null || (con.status === 'no-orca' && con.terms.length === 0)) {
        // outside Orca, before the first answer, or Orca not answering: the fleet reports alone
        rows.push(line({ dimColor: true }, d.selfHandle === null ? OT.outsideOrca[lang] : con === null ? OT.waitingFirst[lang] : OT.noOrca[lang]))
        if (!sw.fleet) rows.push(line({ dimColor: true }, `  ${T.fleetOff[lang]}`))
        else if (f === null || f.status !== 'active') rows.push(line({ dimColor: true }, `  ${T.fleetNotReporting[lang]}`))
        else if (f.othersList === undefined || f.othersList === null) rows.push(line({ dimColor: true }, `  ${T.fleetWaiting[lang]}`))
        else if (f.othersList.length === 0) rows.push(line({ dimColor: true }, `  ${T.none[lang]}`))
        else {
          const word = FLEET_T.word[lang]
          for (const o of f.othersList) {
            const mark = o.display === 'blocked' ? '⛔' : o.display === 'working' ? '●' : '○'
            const kind = o.blockedKind ? `(${FLEET_T.kind[lang][o.blockedKind]})` : ''
            const role = o.role ? ` · ${o.role}` : ''
            rows.push(para(`${mark} `, { color: o.display === 'blocked' ? 'red' : undefined, dimColor: o.display === 'idle' },
              `${o.label}${role} · ${word[o.display]}${kind} ${fmtAge(o.ageMs)}`))
            if (o.contextPercent !== null && o.contextPercent >= CONTEXT_HOT) rows.push(para('  ', { color: 'red' }, `${T.context[lang](o.contextPercent)} · ${T.wrapUp[lang]}`))
            const vers: string[] = []
            if (o.fwVersion !== null && d.fwVersion !== null && o.fwVersion !== d.fwVersion) vers.push(`flightwake ${o.fwVersion}`)
            if (o.mod !== null && o.mod !== MOD_VERSION) vers.push(`mod ${o.mod}`)
            if (vers.length > 0) rows.push(para('  ', { color: 'yellow' }, `${vers.join(' · ')} — ${T.differs[lang]}`))
          }
        }
      } else {
        if (con.status === 'no-orca') rows.push(line({ color: 'yellow' }, OT.noOrca[lang]))
        const listed = con.terms.map((term) => {
          const rep = reported.get(term.handle) ?? null
          const isSelf = term.handle === d.selfHandle
          const state: TermState = isSelf ? 'working' : rep !== null ? rep.display : termState(term, con.at)
          return { term, state, rep, isSelf }
        })
        if (listed.length === 0) rows.push(line({ dimColor: true }, `  ${OT.noAgents[lang]}`))
        for (const g of groupByRepo(listed)) {
          const repo = con.repos[g.path] ?? null
          const items: unknown[] = []
          const vDiffers = repo?.fwVersion != null && d.fwVersion !== null && repo.fwVersion !== d.fwVersion
          items.push(h(Text, { wrap: 'wrap' },
            h(Text, { bold: true }, baseName(g.path) || '?'),
            ...(repo?.isFlightwake ? [h(Text, { color: healthColor(repo.health) }, ` ●${repo.health === 'unknown' ? '?' : repo.health}`)] : []),
            ...(repo?.fwVersion ? [h(Text, { color: vDiffers ? 'yellow' : undefined, dimColor: !vDiffers }, ` v${repo.fwVersion}${vDiffers ? ` ≠ ${d.fwVersion}` : ''}`)] : []),
          ))
          for (const r of g.rows) {
            const mark = r.state === 'blocked' ? '⛔' : r.state === 'working' ? '●' : r.state === 'idle' ? '○' : '?'
            const color = r.state === 'blocked' ? 'red' : r.state === 'working' ? 'green' : undefined
            const role = r.rep?.role ? ` · ${r.rep.role}` : ''
            const age = r.rep !== null ? ` ${fmtAge(r.rep.ageMs)}` : r.term.lastOutputAt !== null ? ` ${fmtAge(Math.max(0, con.at - r.term.lastOutputAt))}` : ''
            const who = r.isSelf ? `${agentName(r.term.agent)} · ${OT.you[lang]}` : `${agentName(r.term.agent)} · ${cleanTitle(r.term)}`
            items.push(para(`${mark} `, { color, dimColor: r.state === 'idle' && !r.isSelf }, `${who}${role} · ${stateWord(lang, r.state)}${age}`))
            const ctx = r.isSelf ? pct : r.rep?.contextPercent ?? null
            const meta: unknown[] = []
            if (ctx !== null) meta.push(bar(ctx))
            if (r.rep !== null && r.rep.mod !== null && r.rep.mod !== MOD_VERSION) meta.push(h(Text, { color: 'yellow' }, `mod ${r.rep.mod}`))
            if (!r.isSelf) {
              const h0 = r.term.handle
              if (ui.confirm === h0) {
                const cmd = wrapUpCommand(r.term.agent) ?? ''
                meta.push(h(Button, { key: `ok-${h0}`, label: OT.confirm[lang](cmd), variant: 'primary', onPress: () => sendWrapUp($, lang, h0) }))
                meta.push(h(Button, { key: `no-${h0}`, label: OT.cancel[lang], onPress: () => update($, uiRef, (u) => ({ confirm: null, notice: u?.notice ?? null })) }))
              } else {
                meta.push(h(Button, {
                  key: `go-${h0}`, label: OT.jump[lang],
                  onPress: async () => { if ((await runOrca($, ['terminal', 'switch', '--terminal', h0, '--json'])) === null) await notify($, OT.failed[lang]('terminal switch'), true) },
                }))
                // wrap-up is offered only to an idle agent flightwake has a command for; it asks again before sending
                if (r.state === 'idle' && wrapUpCommand(r.term.agent) !== null) {
                  meta.push(h(Button, { key: `wrap-${h0}`, label: OT.wrap[lang], onPress: () => update($, uiRef, () => ({ confirm: h0, notice: null })) }))
                }
              }
            }
            if (ctx !== null && ctx >= CONTEXT_HOT && !r.isSelf) items.push(para('  ', { color: 'red' }, T.wrapUp[lang]))
            if (meta.length > 0) items.push(h(Box, { flexDirection: 'row', flexWrap: 'wrap', columnGap: 1, paddingLeft: 2 }, ...meta))
          }
          const worst = g.rows.some((r) => r.state === 'blocked') ? 'red' : undefined
          rows.push(card(worst, ...items))
        }
        rows.push(line({ dimColor: true }, OT.stateHeuristic[lang]))
      }
      if (ui.notice !== null) rows.push(line({ color: ui.notice.isError ? 'red' : 'green' }, ui.notice.text))

      // ── this repo's STATE items ──
      if (d.isUninitialized) {
        rows.push(card('yellow', line({ color: 'yellow' }, T.uninitialized[lang])))
      } else {
        const st: unknown[] = []
        const section = (title: string, items: string[], more: number, mark: string) => {
          st.push(line({ bold: true }, title))
          if (items.length === 0) st.push(line({ dimColor: true }, `  ${T.none[lang]}`))
          for (const it of items) st.push(para(`${mark} `, {}, it))
          if (more > 0) st.push(line({ dimColor: true }, `  ${T.more[lang](more)}`))
        }
        section(T.inProgress[lang], d.inProgress, d.moreInProgress, '•')
        section(T.next[lang], d.next, d.moreNext, '›')
        if (d.updated) st.push(line({ dimColor: true }, T.updated[lang](d.updated)))
        rows.push(card(undefined, ...st))
      }

      // ── this session ──
      const ses: unknown[] = [line({ bold: true }, T.session[lang])]
      if (!sw.recorder) ses.push(line({ dimColor: true }, `  ${T.recorderOff[lang]}`))
      else {
        const raw = (await read($, logRef)) as FwFlightLog | null
        const log = raw !== null && raw.sessionId === d.sessionId ? raw : null
        const tests = log?.tests ?? []
        ses.push(line({}, T.counts[lang]({
          files: log?.files.length ?? 0, shell: log?.shellFiles?.length ?? 0, tests: tests.length,
          pass: tests.filter((t) => t.result === 'pass').length, fail: tests.filter((t) => t.result === 'fail').length,
          commits: log?.commits.length ?? 0,
        })))
        for (const t of tests.slice(-RECENT_TESTS).reverse()) {
          const ok = t.result === 'pass'
          ses.push(cut({ color: ok ? 'green' : t.result === 'fail' ? 'red' : undefined, dimColor: t.result === 'unknown' }, `  ${ok ? '✓' : t.result === 'fail' ? '✗' : '?'} ${t.command}`))
        }
        const seen = new Set<string>()
        const recent: string[] = []
        for (const fl of [...(log?.files ?? [])].reverse()) {
          if (seen.has(fl.path)) continue
          seen.add(fl.path)
          recent.push(fl.path)
          if (recent.length >= RECENT_FILES) break
        }
        for (const p of recent) ses.push(cut({ dimColor: true }, `  ✎ ${p}`))
      }
      rows.push(card(undefined, ...ses))

      const tree = h(Box, { width: e.props.bodyColumns, flexDirection: 'column' }, ...rows)
      return tree && typeof tree !== 'string' ? (tree as RenderElement) : next(e)
    } catch {
      return next(e)
    }
  })
}
