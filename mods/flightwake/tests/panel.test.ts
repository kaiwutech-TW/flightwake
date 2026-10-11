// F8 side panel: /fw-panel toggles a pane, the choice is kept in $.store and reopens the pane in a later session,
// the drawing gathers STATE / this session / cost / other sessions from the features' $.state values.
import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { panelVerb, plainItem, stateDigest } from '../hooks/lib/panel'
import { otherRows } from '../hooks/lib/fleet'
import { gitBehind, installWorld, MARKER, sessionRec, STATE_FILLED, STATE_TEMPLATE } from './world'

const PANE = { plugin: 'flightwake-mod', component: 'Pane', requestId: 'flightwake' } as const
const PROPS = { title: 'flightwake', isFocused: false, bodyColumns: 60, placement: 'dock' } as never
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const COMPOSER = { kind: 'composer' } as never
const DONE = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'complete' } as never

type Knobs = {
  store: Map<string, unknown>
  open: Set<string>
  opens: { id: string; title?: string }[]
  closes: string[]
  registered: string[]
  isPlaced: boolean
  percent?: number
}

/** The engine beneath the plugin: store, panes, commands, usage. */
function engine(on: On, knobs: Partial<Knobs> = {}): Knobs {
  const k: Knobs = { store: new Map(), open: new Set(), opens: [], closes: [], registered: [], isPlaced: true, ...knobs }
  on('store.get', (_$, e) => ({ value: k.store.get(e.key) }))
  on('store.set', (_$, e) => { k.store.set(e.key, e.value); return { value: undefined } })
  on('ui.open', (_$, e) => {
    k.opens.push({ id: e.id, title: e.title })
    k.open.add(e.id)
    return { value: k.isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'the terminal is 90 columns; 110 seats it' } }
  })
  on('ui.close', (_$, e) => { k.closes.push(e.id); k.open.delete(e.id); return { value: undefined } })
  on('ui.panes', () => ({ value: [...k.open].map((id) => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }) as never)
  on('command.register', (_$, e) => { k.registered.push(e.name); return { value: { command: e.name } } })
  on('command.run', () => ({ text: 'engine: unknown command' }))
  on('session.start', () => ({ cwd: '/repo' }))
  on('turn.complete', () => ({ text: '' }))
  on('session.turns', () => ({ value: 2 }))
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { window: 200000, ...(k.percent === undefined ? {} : { percent: k.percent }) } } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine-pane'] }) as never)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }) as never)
  return k
}

const repoFiles = (state = STATE_FILLED, lang = 'en') => ({ '.flightwake/STATE.md': state, 'CLAUDE.md': MARKER(lang) })
const panel = async ($: any, args = ''): Promise<string> => (await $.command.run({ command: 'fw-panel', args, origin: COMPOSER })).text ?? ''

describe('panel: pure helpers', () => {
  test('stateDigest reads the two sections in every template language and strips markup', async () => {
    const d = stateDigest(STATE_FILLED)
    expect(d.updated).toBe('2026-10-01')
    expect(d.inProgress).toEqual(['migrate the billing table'])
    expect(d.next).toEqual(['finish billing → src/billing.ts'])
    const zh = '---\nupdated: 2026-10-11\nhealth: green\n---\n# 現在在哪\n\n- 不算\n\n# 進行中(未完成勿刪)\n\n- **F7 真機驗證**:見 [[261011-x]]\n  續行不算\n- `spend` 待查\n\n# 下一步入口\n\n0. Kai 決定\n0a. 網站維護\n1. [update](https://x) 常用 repo\n\n# 常備事實\n\n- 不算\n'
    const z = stateDigest(zh)
    expect(z.inProgress).toEqual(['F7 真機驗證:見 261011-x', 'spend 待查'])
    expect(z.next).toEqual(['Kai 決定', '網站維護', 'update 常用 repo'])
    const ja = '# 進行中(終わるまで消さない)\n\n- a\n\n# 次の入口\n\n1. b\n'
    expect(stateDigest(ja)).toMatchObject({ inProgress: ['a'], next: ['b'], updated: null })
  })

  test('stateDigest caps each section and counts the rest; fenced code is not read', async () => {
    const many = `# In progress\n\n${Array.from({ length: 9 }, (_, i) => `- p${i}`).join('\n')}\n\n# Next entry points\n\n\`\`\`\n# Next\n- not an item\n\`\`\`\n1. n\n`
    const d = stateDigest(many)
    expect(d.inProgress.length).toBe(5)
    expect(d.moreInProgress).toBe(4)
    expect(d.next).toEqual(['n'])
    expect(d.moreNext).toBe(0)
  })

  test('plainItem and panelVerb', async () => {
    expect(plainItem('[ ] **a** `b` [[c|d]] [e](f)')).toBe('a b d e')
    expect(Array.from(plainItem('x'.repeat(500))).length).toBe(240)
    expect(panelVerb('')).toBe('toggle')
    expect(panelVerb(' ON ')).toBe('on')
    expect(panelVerb('close')).toBe('off')
  })

  test('otherRows: live others only, blocked first, no self', async () => {
    const now = 1_700_000_000_000
    const recs = [
      sessionRec({ sessionId: 'me', state: 'working', heartbeatAt: now }),
      sessionRec({ sessionId: 'a', state: 'idle', heartbeatAt: now, stateSince: now - 60000, root: '/r/alpha' }),
      sessionRec({ sessionId: 'b', state: 'blocked', heartbeatAt: now, stateSince: now - 5000, root: '/r/beta', blocked: { kind: 'permission', tool: 'Bash', target: null, agent: false, since: now - 5000 } }),
      sessionRec({ sessionId: 'c', state: 'ended', heartbeatAt: now, root: '/r/gone', ended: { reason: 'exit', at: now, stateAtEnd: 'idle' } }),
    ]
    const rows = otherRows(recs as never, 'me', now)
    expect(rows.map((r) => r.label)).toEqual(['beta', 'alpha'])
    expect(rows[0]).toMatchObject({ display: 'blocked', blockedKind: 'permission', ageMs: 5000 })
  })
})

describe('panel: open, remember, close', () => {
  test('never opens unasked the first time; /fw-panel opens it and remembers', async ($, on) => {
    const w = installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    const k = engine(on)
    await $.session.start(START)
    expect(k.registered).toContain('fw-panel')
    expect(k.opens).toEqual([])
    const text = await panel($)
    expect(text).toContain('panel opened')
    expect(k.opens.map((o) => o.id)).toEqual(['flightwake'])
    expect(k.store.get('panelOpen')).toBe(true)
    expect(w.writes).toEqual([])
  })

  test('a later session with the preference on reopens it at start; a non-interactive one does not', async ($, on) => {
    installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    const k = engine(on, { store: new Map([['panelOpen', true]]) })
    await $.session.start({ ...START, isInteractive: false })
    expect(k.opens).toEqual([])
    await $.session.start(START)
    expect(k.opens.map((o) => o.id)).toEqual(['flightwake'])
  })

  test('/fw-panel again closes it and forgets; /fw-panel off on a closed pane only forgets', async ($, on) => {
    installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    const k = engine(on)
    await $.session.start(START)
    await panel($)
    expect(await panel($)).toContain('panel closed')
    expect(k.closes).toEqual(['flightwake'])
    expect(k.store.get('panelOpen')).toBe(false)
    expect(await panel($, 'off')).toContain('panel closed')
    expect(k.closes).toEqual(['flightwake'])
    expect(await panel($, 'on')).toContain('panel opened')
    expect(await panel($, 'on')).toContain('panel opened')
    expect(k.store.get('panelOpen')).toBe(true)
  })

  test('a narrow terminal: open says why it waits, the preference is still kept', async ($, on) => {
    installWorld(on, { files: repoFiles(STATE_FILLED, 'zh-TW'), git: gitBehind(0) })
    const k = engine(on, { isPlaced: false })
    await $.session.start(START)
    expect(await panel($)).toContain('110 seats it')
    expect(await panel($, 'on')).toContain('面板已開啟但尚未顯示')
    expect(k.store.get('panelOpen')).toBe(true)
  })

  // The person's own close (ui.close, origin person → preference off) cannot be raised from the test kit (its ui noun
  // has no close); it is checked in a real session.

  test('no flightwake here: no command, no pane, no store write', async ($, on) => {
    installWorld(on, { files: {}, git: null })
    const k = engine(on, { store: new Map([['panelOpen', true]]) })
    await $.session.start(START)
    expect(k.registered).not.toContain('fw-panel')
    expect(k.opens).toEqual([])
  })

  test('switched off: nothing registered, nothing opened', { options: { panel: false } }, async ($, on) => {
    installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    const k = engine(on, { store: new Map([['panelOpen', true]]) })
    await $.session.start(START)
    expect(k.registered).not.toContain('fw-panel')
    expect(k.opens).toEqual([])
  })
})

describe('panel: drawing', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`draws STATE, this session, cost and the fleet sections (${surface})`, async ($, on) => {
      installWorld(on, { files: repoFiles(), git: gitBehind(4) })
      engine(on, { percent: 63 })
      await $.session.start(START)
      await $.turn.complete(DONE)
      const ui = await $.ui.mount({ ...PANE, surface, props: PROPS })
      expect(await ui.find({ type: 'Text', text: /✈ flightwake/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /●green/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /STATE 4c behind/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /context 63%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /STATE updated 2026-10-01/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /• migrate the billing table/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /› finish billing/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^This session$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /0 file\(s\)/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^Other sessions$/ })).toBeDefined()
      await ui.unmount()
    })
  }

  test('band off: the panel measures the lag itself', { options: { band: false } }, async ($, on) => {
    const w = installWorld(on, { files: repoFiles(), git: gitBehind(2) })
    engine(on)
    await $.session.start(START)
    expect(w.gitCalls.some((c) => c.includes('rev-list'))).toBe(true)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /STATE 2c behind/ })).toBeDefined()
    await ui.unmount()
  })

  test('uninitialized STATE: the coldstart line, no sections', async ($, on) => {
    installWorld(on, { files: repoFiles(STATE_TEMPLATE), git: gitBehind(0) })
    engine(on)
    await $.session.start(START)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /run \/fw-coldstart/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^In progress$/ })).toBeUndefined()
    await ui.unmount()
  })

  test('zh-TW headings', async ($, on) => {
    installWorld(on, { files: repoFiles(STATE_FILLED, 'zh-TW'), git: gitBehind(0) })
    engine(on)
    await $.session.start(START)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    for (const t of [/^進行中$/, /^下一步$/, /^本 session$/, /^其他 session$/]) expect(await ui.find({ type: 'Text', text: t })).toBeDefined()
    await ui.unmount()
  })

  test('recorder and fleet off: each section says so', { options: { recorder: false, fleet: false } }, async ($, on) => {
    installWorld(on, { files: repoFiles(), git: gitBehind(0) })
    engine(on)
    await $.session.start(START)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /session flight log is off/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /session fleet is off/ })).toBeDefined()
    await ui.unmount()
  })
})
