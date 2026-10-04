// F2 band + context toast. The test's hooks stand for the engine beneath the plugin (session.usage / turns / toast / tool.call).
import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { gitBehind, installWorld, MARKER, STATE_FILLED, STATE_TEMPLATE } from './world'
import type { World } from './world'

const BAND = { plugin: 'flightwake-mod', component: 'AbovePrompt' } as const
const PROPS = { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 100 } as never

type Knobs = { percent?: number; turns: number; toasts: string[]; commit: boolean; usageThrows?: boolean; state: Map<string, { value: unknown; version: number }> }

/** The engine beneath the plugin: usage, turns, toasts and a Bash result. */
function engine(on: On, knobs: Partial<Knobs> = {}): Knobs {
  const k: Knobs = { turns: 3, toasts: [], commit: false, state: new Map(), ...knobs }
  on('state.get', (_$, e) => {
    const cur = k.state.get(`${e.plugin}/${e.key}`)
    return { value: cur ?? { value: undefined, version: 0 } }
  })
  on('state.set', (_$, e) => {
    const id = `${e.plugin}/${e.key}`
    const cur = k.state.get(id)
    const version = cur?.version ?? 0
    if (e.ifVersion !== undefined && e.ifVersion !== version) return { value: { isSet: false, version } }
    k.state.set(id, { value: e.value, version: version + 1 })
    return { value: { isSet: true, version: version + 1 } }
  })
  on('session.start', () => ({ cwd: '/repo' }))
  on('turn.complete', () => ({ text: '' }))
  on('session.turns', () => ({ value: k.turns }))
  on('session.usage', () => {
    if (k.usageThrows) throw new Error('boom')
    return {
    value: { startedAt: 0, rateLimits: [], context: { window: 200000, ...(k.percent === undefined ? {} : { percent: k.percent }) } },
    }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine-band'] }) as never)
  on('ui.toast', (_$, e) => {
    k.toasts.push(e.text)
    return { value: undefined } as never
  })
  on('tool.call', () => ({
    result: { stdout: '', stderr: '', interrupted: false, ...(k.commit ? { gitOperation: { commit: { sha: 'abc', kind: 'committed' } } } : {}) },
    text: '',
  }) as never)
  return k
}

const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const DONE = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'complete' } as never

const repoFiles = (state = STATE_FILLED, lang = 'en') => ({ '.flightwake/STATE.md': state, 'CLAUDE.md': MARKER(lang) })
const withHealth = (h: string) => STATE_FILLED.replace('health: green', `health: ${h}`)

const view = async (k: Knobs) => k.state.get('flightwake-mod/bandView')?.value as
  | { isLegacyGaugeActive: boolean; isQuiet: boolean; hint: string | null; lagKind: string; behind: number | null; health: string; contextPercent: number | null }
  | null
  | undefined

describe('band: view and render', () => {
  test('healthy and in sync → quiet, render falls through', async ($, on) => {
    const w = installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    const k = engine(on)
    await $.session.start(START)
    expect((await view(k))?.isQuiet).toBe(true)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface, props: PROPS })
      expect(await ui.find({ type: 'Text', text: /flightwake/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /engine-band/ })).toBeDefined()
      await ui.unmount()
    }
    expect(w.writes).toEqual([])
  })

  test('behind 4 with 2 bot commits excluded → shows lag and /fw-record hint on both surfaces', async ($, on) => {
    installWorld(on, { files: repoFiles(), git: gitBehind(4, 2) })
    const k = engine(on)
    await $.session.start(START)
    const v = await view(k)
    expect(v?.isQuiet).toBe(false)
    expect(v?.behind).toBe(4)
    expect(v?.hint).toContain('/fw-record')
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface, props: PROPS })
      expect(await ui.find({ type: 'Text', text: /flightwake/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /STATE 4c behind/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\/fw-record to wrap up/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('behind 2 (human) stays quiet', async ($, on) => {
    installWorld(on, { files: repoFiles(), git: gitBehind(2) })
    const k = engine(on)
    await $.session.start(START)
    expect((await view(k))?.isQuiet).toBe(true)
  })

  test('yellow health shows with the unverified-items hint', async ($, on) => {
    installWorld(on, { files: repoFiles(withHealth('yellow')), git: gitBehind(0) })
    const k = engine(on)
    await $.session.start(START)
    const v = await view(k)
    expect(v?.isQuiet).toBe(false)
    expect(v?.health).toBe('yellow')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /●yellow/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /unverified/ })).toBeDefined()
    await ui.unmount()
  })

  test('dirty STATE reads "updating", not a lag count', async ($, on) => {
    installWorld(on, {
      files: repoFiles(withHealth('red')),
      git: { 'status --porcelain -- .flightwake/STATE.md': ' M .flightwake/STATE.md' },
    })
    const k = engine(on)
    await $.session.start(START)
    expect((await view(k))?.lagKind).toBe('dirty')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /STATE updating/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /behind/ })).toBeUndefined()
    await ui.unmount()
  })

  for (const [lang, wording] of [['en', /in sync/], ['zh-TW', /同步/], ['zh-CN', /同步/], ['ja', /同期済/]] as const) {
    test(`lag error shows "?" and never reads as in sync (${lang})`, async ($, on) => {
      installWorld(on, {
        files: repoFiles(withHealth('yellow'), lang),
        git: { 'status --porcelain -- .flightwake/STATE.md': '', 'log -1 --format=%H -- .flightwake/STATE.md': null },
      })
      const k = engine(on)
      await $.session.start(START)
      expect((await view(k))?.lagKind).toBe('error')
      const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
      const shown = (await ui.findAll({ type: 'Text' })).map((r) => r.text).join('')
      expect(shown).toContain('?')
      expect(wording.test(shown)).toBe(false)
      await ui.unmount()
    })
  }

  test('lag error alone does not wake the band', async ($, on) => {
    installWorld(on, {
      files: repoFiles(),
      git: { 'status --porcelain -- .flightwake/STATE.md': '', 'log -1 --format=%H -- .flightwake/STATE.md': null },
    })
    const k = engine(on)
    await $.session.start(START)
    const v = await view(k)
    expect(v?.lagKind).toBe('error')
    expect(v?.isQuiet).toBe(true)
  })

  test('context 60%+ shows the percentage; 85% adds the record → clear → coldstart hint', async ($, on) => {
    installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    const k = engine(on, { percent: 65 })
    await $.session.start(START)
    expect((await view(k))?.isQuiet).toBe(false)
    const ui1 = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
    expect(await ui1.find({ type: 'Text', text: /65%/ })).toBeDefined()
    await ui1.unmount()
    k.percent = 85
    await $.turn.complete(DONE)
    expect((await view(k))?.hint).toContain('/fw-coldstart')
    const ui2 = await $.ui.mount({ ...BAND, surface: 'desktop', props: PROPS })
    expect(await ui2.find({ type: 'Text', text: /85%/ })).toBeDefined()
    await ui2.unmount()
  })

  test('just opened (0 turns) with STATE present hints /fw-coldstart; later turns drop it', async ($, on) => {
    installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    const k = engine(on, { turns: 0 })
    await $.session.start(START)
    expect((await view(k))?.hint).toContain('/fw-coldstart')
    expect((await view(k))?.isQuiet).toBe(false)
    k.turns = 1
    await $.turn.complete(DONE)
    expect((await view(k))?.isQuiet).toBe(true)
  })

  test('a survey holding the band → falls through', async ($, on) => {
    installWorld(on, { files: repoFiles(withHealth('red')), git: gitBehind(0) })
    const k = engine(on)
    await $.session.start(START)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { hasSurvey: true, isWorking: false, maxRows: 5, bodyColumns: 100 } as never })
    expect(await ui.find({ type: 'Text', text: /flightwake/ })).toBeUndefined()
    await ui.unmount()
  })

  test('the draw never runs git', async ($, on) => {
    const w = installWorld(on, { files: repoFiles(withHealth('red')), git: gitBehind(0) })
    const k = engine(on)
    await $.session.start(START)
    const before = w.gitCalls.length
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
    await ui.unmount()
    expect(w.gitCalls.length).toBe(before)
  })

  test('recomputes after a Bash commit, untouched result returned', async ($, on) => {
    const w: World = installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    const k = engine(on)
    await $.session.start(START)
    expect((await view(k))?.isQuiet).toBe(true)
    w.git = gitBehind(5)
    k.commit = true
    const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)
    expect((r as { result?: { gitOperation?: unknown } }).result?.gitOperation).toBeDefined()
    const v = await view(k)
    expect(v?.behind).toBe(5)
    expect(v?.isQuiet).toBe(false)
  })

  test('a Bash call without a git operation does not recompute', async ($, on) => {
    const w = installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    const k = engine(on)
    await $.session.start(START)
    const n = w.gitCalls.length
    await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
    expect(w.gitCalls.length).toBe(n)
  })
})

describe('band: legacy gauge', () => {
  test('effective statusLine is statusline.mjs → band quiet even when behind and red; toast still fires once at 85%', async ($, on) => {
    installWorld(on, {
      files: repoFiles(withHealth('red')),
      git: gitBehind(6),
      settings: { statusLine: { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.flightwake/statusline.mjs"' } },
    })
    const k = engine(on, { percent: 85 })
    await $.session.start(START)
    const v = await view(k)
    expect(v?.isLegacyGaugeActive).toBe(true)
    expect(v?.isQuiet).toBe(true)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /flightwake/ })).toBeUndefined()
    await ui.unmount()
    await $.turn.complete(DONE)
    expect(k.toasts.length).toBe(1)
  })

  test('a settings file merely mentioning statusline.mjs elsewhere does not count', async ($, on) => {
    installWorld(on, {
      files: repoFiles(withHealth('red')),
      git: gitBehind(0),
      settings: { statusLine: { type: 'command', command: 'my-own-line' }, note: 'statusline.mjs' },
    })
    const k = engine(on)
    await $.session.start(START)
    expect((await view(k))?.isLegacyGaugeActive).toBe(false)
    expect((await view(k))?.isQuiet).toBe(false)
  })
})

describe('band: toast', () => {
  test('once per session id, again for a new id', async ($, on) => {
    const w = installWorld(on, { files: repoFiles(), git: gitBehind(0), sessionId: 's1' })
    const k = engine(on, { percent: 85 })
    await $.session.start(START)
    await $.turn.complete(DONE)
    await $.turn.complete(DONE)
    expect(k.toasts.length).toBe(1)
    expect(k.toasts[0]).toContain('/fw-record')
    expect(k.state.get('flightwake-mod/bandToastSession')?.value).toBe('s1')
    w.sessionId = 's2' // /clear
    await $.session.start(START)
    await $.turn.complete(DONE)
    expect(k.toasts.length).toBe(2)
  })

  test('below 80% no toast', async ($, on) => {
    installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    const k = engine(on, { percent: 79 })
    await $.session.start(START)
    await $.turn.complete(DONE)
    expect(k.toasts).toEqual([])
  })

  test('toast is localized', async ($, on) => {
    installWorld(on, { files: repoFiles(STATE_FILLED, 'ja'), git: gitBehind(0) })
    const k = engine(on, { percent: 90 })
    await $.turn.complete(DONE)
    expect(k.toasts[0]).toContain('逼迫')
  })

  test('usage without a percent → null, no toast', async ($, on) => {
    installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    const k = engine(on)
    await $.session.start(START)
    expect((await view(k))?.contextPercent).toBeNull()
    expect(k.toasts).toEqual([])
  })
})

describe('band: degrade and switches', () => {
  test('not a git repo → health shown, no lag text', async ($, on) => {
    installWorld(on, { files: repoFiles(withHealth('yellow')), git: null })
    const k = engine(on)
    await $.session.start(START)
    const v = await view(k)
    expect(v?.lagKind).toBe('none')
    expect(v?.isQuiet).toBe(false)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /●yellow/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /STATE (\d|lag|updating)|in sync/ })).toBeUndefined()
    await ui.unmount()
  })

  test('no .flightwake → nothing, not even a toast', async ($, on) => {
    installWorld(on, { files: {}, git: gitBehind(9) })
    const k = engine(on, { percent: 95 })
    await $.session.start(START)
    await $.turn.complete(DONE)
    expect(await view(k)).toBeNull()
    expect(k.toasts).toEqual([])
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /flightwake/ })).toBeUndefined()
    await ui.unmount()
  })

  test('STATE still the template → nothing', async ($, on) => {
    installWorld(on, { files: repoFiles(STATE_TEMPLATE), git: gitBehind(9) })
    const k = engine(on, { percent: 95 })
    await $.session.start(START)
    expect(await view(k)).toBeNull()
  })

  test('external edit then a new turn picks up the change (lifecycle: file changed by another program)', async ($, on) => {
    const w = installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    const k = engine(on)
    await $.session.start(START)
    expect((await view(k))?.health).toBe('green')
    w.files['.flightwake/STATE.md'] = withHealth('red')
    await $.turn.complete(DONE)
    expect((await view(k))?.health).toBe('red')
  })

  test('a changed working root is followed at the next refresh', async ($, on) => {
    const w = installWorld(on, { files: repoFiles(), git: gitBehind(0), root: '/a' })
    const k = engine(on)
    await $.session.start(START)
    expect((await view(k))?.health).toBe('green')
    w.root = '/b' // /cd into a folder with no flightwake
    w.files = {}
    await $.turn.complete(DONE)
    expect(await view(k)).toBeNull()
  })

  test('a throwing usage call degrades to no percent, hooks still pass through', async ($, on) => {
    installWorld(on, { files: repoFiles(withHealth('yellow')), git: gitBehind(0) })
    const k = engine(on, { usageThrows: true })
    const r = await $.session.start(START)
    expect(r).toEqual({ cwd: '/repo' })
    expect((await view(k))?.contextPercent).toBeNull()
  })

  test('the mod never writes files', async ($, on) => {
    const w = installWorld(on, { files: repoFiles(withHealth('red')), git: gitBehind(5) })
    const k = engine(on, { percent: 90 })
    await $.session.start(START)
    await $.turn.complete(DONE)
    expect(w.writes).toEqual([])
  })

  test('off → no effect: no view, no toast, render falls through', { options: { band: false } }, async ($, on) => {
    installWorld(on, { files: repoFiles(withHealth('red')), git: gitBehind(9) })
    const k = engine(on, { percent: 95 })
    await $.session.start(START)
    await $.turn.complete(DONE)
    expect(await view(k)).toBeUndefined()
    expect(k.toasts).toEqual([])
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /flightwake/ })).toBeUndefined()
    await ui.unmount()
  })
})
