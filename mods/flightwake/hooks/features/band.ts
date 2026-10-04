/**
 * F2 status band above the prompt + one context toast. Contract: docs/plans/mods.md (revised) and hooks/lib/core.ts.
 *
 * The FwBandView ($.state bandView) is computed OUTSIDE rendering (session.start, turn.complete, and after a Bash
 * tool call that reports a commit or branch operation); the ui.render hook only reads it and draws, never runs git.
 * Hints point only at flightwake commands (same wording family as hooks/statusline.mjs); no update check, no network.
 * When the legacy statusline.mjs is the effective statusLine every field would duplicate it, so the band stays
 * quiet and only the one-time context toast remains. The mod never edits settings.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement } from 'claude-code'

import { fwContext, healthOf, isUninitializedState, joinPath, legacyStatuslineActive, M, STATE_REL, stateLag } from '../lib/core'
import type { Io, Lang } from '../lib/core'
import type { FwBandView } from '../../types/index'

const bandView = atom({ plugin: 'flightwake-mod', key: 'bandView' } as const, null)
const bandToastSession = { plugin: 'flightwake-mod', key: 'bandToastSession' } as const

function ioOf($: EngineInterface): Io {
  return {
    root: async () => { try { return (await $.session.root()).replace(/\/+$/, '') } catch { return '' } },
    sessionId: async () => { try { return await $.session.id() } catch { return '' } },
    exists: async (p) => { try { return await $.fs.exists(p) } catch { return false } },
    read: async (p) => {
      try { if (!(await $.fs.exists(p))) return null; const t = await $.fs.read(p); return typeof t === 'string' ? t : null } catch { return null }
    },
    git: async (args, cwd) => {
      try { const r = await $.process.run(['git', ...args], { cwd, timeoutMs: 5000 }); return r.exitCode === 0 ? r.stdout.trim() : null } catch { return null }
    },
    settings: async () => { try { return await $.settings.read({}) } catch { return {} } },
  }
}

const HOT = 80
const WARM = 60
const LAG_HINT = 3

function hintFor(lang: Lang, v: { health: string; contextPercent: number | null; behind: number | null; justOpened: boolean }): string | null {
  if (v.health === 'yellow' || v.health === 'red') return M(lang, {
    en: 'handle unverified items before stacking new work (read STATE)',
    'zh-TW': '先處理未驗證項再疊新工作(讀 STATE)',
    'zh-CN': '先处理未验证项再叠新工作(读 STATE)',
    ja: '未検証の項目を片付けてから新しい作業を積む(STATE を読む)',
  })
  if (v.contextPercent !== null && v.contextPercent >= HOT) return M(lang, {
    en: '/fw-record → /clear → /fw-coldstart',
    'zh-TW': '/fw-record 收尾 → /clear → /fw-coldstart 接手',
    'zh-CN': '/fw-record 收尾 → /clear → /fw-coldstart 接手',
    ja: '/fw-record で締め → /clear → /fw-coldstart で引き継ぎ',
  })
  if (v.behind !== null && v.behind >= LAG_HINT) return M(lang, {
    en: '/fw-record to wrap up',
    'zh-TW': '/fw-record 收尾',
    'zh-CN': '/fw-record 收尾',
    ja: '/fw-record で締める',
  })
  if (v.justOpened) return M(lang, {
    en: 'start with /fw-coldstart',
    'zh-TW': '先跑 /fw-coldstart 接手',
    'zh-CN': '先跑 /fw-coldstart 接手',
    ja: 'まず /fw-coldstart で引き継ぐ',
  })
  return null
}

/** Pure: the view for a set of facts. Language only shapes the hint. */
function viewOf(lang: Lang, f: {
  health: FwBandView['health']
  lag: FwBandView['lagKind']
  behind: number | null
  contextPercent: number | null
  isLegacyGaugeActive: boolean
  justOpened: boolean
}): FwBandView {
  const hint = hintFor(lang, { health: f.health, contextPercent: f.contextPercent, behind: f.behind, justOpened: f.justOpened })
  const isWorthShowing =
    f.health === 'yellow' || f.health === 'red' ||
    (f.lag === 'behind' && (f.behind ?? 0) >= LAG_HINT) ||
    (f.contextPercent !== null && f.contextPercent >= WARM) ||
    hint !== null
  return {
    isLegacyGaugeActive: f.isLegacyGaugeActive,
    health: f.health,
    lagKind: f.lag,
    behind: f.behind,
    contextPercent: f.contextPercent,
    hint,
    isQuiet: f.isLegacyGaugeActive || !isWorthShowing,
  }
}

type Computed = { view: FwBandView; lang: Lang; sessionId: string }

/** Reads the world and builds the view; null when flightwake is not set up here (or STATE is still the template). */
async function compute($: EngineInterface): Promise<Computed | null> {
  const io = ioOf($)
  const ctx = await fwContext(io)
  if (ctx === null) return null
  const text = await io.read(joinPath(ctx.root, STATE_REL))
  if (text === null || isUninitializedState(text)) return null
  const lag = await stateLag(io, ctx.root)
  let contextPercent: number | null = null
  try {
    const p = (await $.session.usage()).context.percent
    contextPercent = typeof p === 'number' && Number.isFinite(p) ? p : null
  } catch { contextPercent = null }
  let turns = 1
  try { turns = await $.session.turns() } catch { turns = 1 }
  const view = viewOf(ctx.lang, {
    health: healthOf(text),
    lag: lag === null ? 'none' : lag.kind,
    behind: lag !== null && lag.kind === 'behind' ? lag.behind : null,
    contextPercent,
    isLegacyGaugeActive: await legacyStatuslineActive(io),
    justOpened: turns === 0,
  })
  return { view, lang: ctx.lang, sessionId: await io.sessionId() }
}

/** Recompute the view, store it, and toast once per session when context runs hot. Never throws. */
async function refresh($: EngineInterface): Promise<void> {
  try {
    const c = await compute($)
    await update($, bandView, () => c === null ? null : c.view)
    if (c === null || c.sessionId === '' || c.view.contextPercent === null || c.view.contextPercent < HOT) return
    const held = await $.state.get(bandToastSession)
    if (held.value === c.sessionId) return
    // ifVersion: of two refreshes racing in one session only the winner of the write toasts.
    const w = await $.state.set(bandToastSession, c.sessionId, { ifVersion: held.version })
    if (!w.isSet) return
    $.ui.toast(M(c.lang, {
      en: 'flightwake: context is running hot — wrap up with /fw-record, then /clear and /fw-coldstart',
      'zh-TW': 'flightwake:context 快滿了——先 /fw-record 收尾,再 /clear 與 /fw-coldstart 接手',
      'zh-CN': 'flightwake:context 快满了——先 /fw-record 收尾,再 /clear 与 /fw-coldstart 接手',
      ja: 'flightwake:コンテキストが逼迫しています。/fw-record で締めてから /clear と /fw-coldstart へ',
    }), { timeoutMs: 8000 })
  } catch {
    try { await update($, bandView, () => null) } catch {}
  }
}

function lagText(lang: Lang, v: FwBandView): string {
  switch (v.lagKind) {
    case 'dirty':
      return M(lang, { en: 'STATE updating', 'zh-TW': 'STATE 更新中', 'zh-CN': 'STATE 更新中', ja: 'STATE 更新中' })
    case 'error':
      return M(lang, { en: 'STATE lag ?', 'zh-TW': 'STATE 落後量未知 ?', 'zh-CN': 'STATE 落后量未知 ?', ja: 'STATE の遅れ不明 ?' })
    case 'behind': {
      const n = v.behind ?? 0
      return n > 0
        ? M(lang, { en: `STATE ${n}c behind`, 'zh-TW': `STATE 落後 ${n}c`, 'zh-CN': `STATE 落后 ${n}c`, ja: `STATE ${n}c 遅れ` })
        : M(lang, { en: 'STATE in sync', 'zh-TW': 'STATE 同步', 'zh-CN': 'STATE 同步', ja: 'STATE 同期済' })
    }
    default:
      return '' // no-baseline / none: not measured, say nothing
  }
}

/** The install language, read at draw time from the instruction-file marker (file reads only; no git). */
async function langOf($: EngineInterface): Promise<Lang> {
  try {
    const c = await fwContext(ioOf($))
    return c === null ? 'en' : c.lang
  } catch { return 'en' }
}

export function registerBand(on: On): void {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await refresh($)
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await refresh($)
    return r
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    try {
      if (ran.deny === undefined && ran.isError === undefined) {
        const op = (ran.result as { gitOperation?: { commit?: unknown; branch?: unknown } } | undefined)?.gitOperation
        if (op && (op.commit || op.branch)) await refresh($)
      }
    } catch {}
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      if (e.props.hasSurvey) return next(e)
      const v = await read($, bandView)
      if (!v || v.isQuiet) return next(e)
      const lang = await langOf($)
      const { Box, Text } = $.ui.resolve(e)
      const color = v.health === 'green' ? 'green' : v.health === 'yellow' ? 'yellow' : v.health === 'red' ? 'red' : undefined
      const lag = lagText(lang, v)
      const pct = v.contextPercent
      const row: unknown[] = [
        h(Text, { bold: true, wrap: 'truncate' }, '✈ flightwake'),
        h(Text, { color, wrap: 'truncate' }, ` · ●${v.health}`),
      ]
      if (lag) row.push(h(Text, { wrap: 'truncate' }, ` · ${lag}`))
      if (pct !== null && pct >= WARM) row.push(h(Text, { color: pct >= HOT ? 'red' : 'yellow', wrap: 'truncate' }, ` · ${Math.round(pct)}%`))
      if (v.hint) row.push(h(Text, { dimColor: true, wrap: 'truncate-end' }, ` → ${v.hint}`))
      const tree = h(Box, { width: e.props.bodyColumns, flexDirection: 'row', overflow: 'hidden' }, ...row)
      return tree && typeof tree !== 'string' ? (tree as RenderElement) : next(e)
    } catch {
      return next(e)
    }
  })
}
