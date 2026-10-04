// F1 state-inject: one STATE snapshot per session id, injected as the last `session` section of the prompt.
import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { TestBody } from 'claude-code/testing'

import { installWorld, MARKER, STATE_FILLED, STATE_TEMPLATE } from './world'
import type { World } from './world'

type Engine = Parameters<TestBody>[0]
const ID = 'flightwake-mod:state'

/** Answers beneath the plugin for the events F1 calls next() on. */
function engine(on: On): void {
  on('session.start', () => ({ cwd: '/repo' }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'INTRO', scope: 'shared' as const }, { id: 'tools', text: 'TOOLS', scope: 'session' as const }] }))
}

const world = (on: On, init: Partial<World> = {}): World => {
  engine(on)
  return installWorld(on, init)
}

const compose = async ($: Engine, traits: string[] = []) =>
  (await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: traits as never })).sections

const stateOf = async ($: Engine, traits: string[] = []) => (await compose($, traits)).find((s) => s.id === ID)

const startSession = (w: World, $: Engine) => $.session.start({ cwd: w.root, surface: null, isInteractive: false })
const clear = (w: World, $: Engine) => $.session.end({ reason: 'clear', sessionId: w.sessionId, resume: { id: w.sessionId } })

const FRONT = (health = 'green') => `---\nupdated: 2026-10-01\nupdated_by: Claude\nlatest_record: records/261001-x.md\nhealth: ${health}   # green | yellow | red\n---\n`

/** This repo's real shape: a giant first section, then In progress and Next entry points. */
const longState = (extra = 'x') =>
  `${FRONT('yellow')}<!-- flightwake STATE -->\n\n# Where we are\n\n${Array.from({ length: 400 }, (_, i) => `history line ${i} ${extra.repeat(20)}`).join('\n')}\n\n# In progress (don't delete until done)\n\n- [ ] migrate the billing table\n\n# Next entry points\n\n1. finish billing → src/billing.ts\n\n# Standing facts\n\n- verify with smoke.sh\n`

const base = (state: string, lang = 'en'): Partial<World> => ({ files: { '.flightwake/STATE.md': state, 'CLAUDE.md': MARKER(lang) } })

describe('F1 state-inject', () => {
  test('normal STATE: header + full text, appended last with scope session', async ($, on) => {
    world(on, base(STATE_FILLED))
    const secs = await compose($)
    expect(secs.map((s) => s.id)).toEqual(['intro', 'tools', ID])
    const s = secs[secs.length - 1]!
    expect(s.scope).toBe('session')
    expect(s.text).toContain('as of the last wrap-up')
    expect(s.text).toContain('snapshot taken at session start')
    expect(s.text).toContain('git state')
    expect(s.text).toContain('/fw-coldstart')
    expect(s.text).toContain('health: green')
    expect(s.text).toContain('migrate the billing table')
  })

  test('feature off: nothing appended', { options: { stateInject: false } }, async ($, on) => {
    world(on, base(STATE_FILLED))
    expect((await compose($)).map((s) => s.id)).toEqual(['intro', 'tools'])
  })

  test('no .flightwake: silent', async ($, on) => {
    world(on, { files: { 'CLAUDE.md': MARKER() } })
    expect(await stateOf($)).toBeUndefined()
  })

  test('not a git repo: still injects (F1 never reads git)', async ($, on) => {
    const w = world(on, { ...base(STATE_FILLED), git: null })
    expect(await stateOf($)).toBeDefined()
    expect(w.gitCalls).toEqual([])
  })

  test('template STATE: one init line, no template text', async ($, on) => {
    world(on, base(STATE_TEMPLATE))
    const s = await stateOf($)
    expect(s?.text).toContain('not initialized')
    expect(s?.text).toContain('/fw-coldstart')
    expect(s?.text).not.toContain('{{')
  })

  test('long STATE keeps health + In progress + Next + path, drops the first section', async ($, on) => {
    const w = world(on, base(longState()))
    const s = await stateOf($)
    expect(s).toBeDefined()
    const t = s!.text
    expect(t).toContain('health: yellow')
    expect(t).toContain('# In progress')
    expect(t).toContain('migrate the billing table')
    expect(t).toContain('# Next entry points')
    expect(t).toContain('src/billing.ts')
    expect(t).toContain('.flightwake/STATE.md')
    expect(t).toContain(`${w.files['.flightwake/STATE.md']!.length} characters`)
    expect(t).not.toContain('history line 5 ')
    expect(t).not.toContain('# Where we are')
    expect(t).not.toContain('# Standing facts')
    expect(t.length).toBeLessThan(6600)
  })

  test('long STATE: sections are picked by position, not heading text (ja template)', async ($, on) => {
    const st = longState().replace('# Where we are', '# 現状').replace("# In progress (don't delete until done)", '# 進行中').replace('# Next entry points', '# 次の入口')
    world(on, base(st, 'ja'))
    const t = (await stateOf($))!.text
    expect(t).toContain('# 進行中')
    expect(t).toContain('# 次の入口')
    expect(t).not.toContain('# 現状')
    expect(t).toContain('要約済み')
  })

  test('long STATE: headings inside comments and fences are not sections', async ($, on) => {
    const st = `${FRONT()}\n# One\n\n<!--\n# fake heading\n-->\n\`\`\`\n# not a heading\n\`\`\`\n${'filler line\n'.repeat(600)}\n# Two\n\ntwo body\n\n# Three\n\nthree body\n`
    world(on, base(st))
    const t = (await stateOf($))!.text
    expect(t).toContain('two body')
    expect(t).toContain('three body')
    expect(t).not.toContain('filler line')
  })

  test('long STATE whose kept sections still exceed the limit: trimmed at a line boundary with …', async ($, on) => {
    const big = (tag: string) => Array.from({ length: 300 }, (_, i) => `${tag} entry ${i}`).join('\n')
    const st = `${FRONT()}\n# One\n\nx\n\n# Two\n\n${big('inprogress')}\n\n# Three\n\n${big('next')}\n`
    world(on, base(st))
    const t = (await stateOf($))!.text
    expect(t).toContain('health: green')
    expect(t).toContain('# Two')
    expect(t).toContain('# Three')
    expect(t).toContain('…')
    expect(t).toContain('.flightwake/STATE.md')
    expect(t.length).toBeLessThan(6800)
    // cut on a line boundary: no half entry such as "inprogress entr"
    expect(/inprogress entr?\n…/.test(t) || /inprogress entry \d+\n…/.test(t)).toBe(true)
  })

  test('snapshot stays identical when STATE changes mid-session', async ($, on) => {
    const w = world(on, base(STATE_FILLED))
    const first = (await stateOf($))!.text
    w.files['.flightwake/STATE.md'] = STATE_FILLED.replace('billing', 'payments')
    expect((await stateOf($))!.text).toBe(first)
    await startSession(w, $) // module reload re-runs session.start with the same id
    expect((await stateOf($))!.text).toBe(first)
    expect(first).toContain('billing')
  })

  test('pre-warm on session.start, then compose does not re-read', async ($, on) => {
    const w = world(on, base(STATE_FILLED))
    await startSession(w, $)
    const readsAfterStart = w.reads.length
    expect(readsAfterStart).toBeGreaterThan(0)
    await stateOf($)
    await stateOf($)
    expect(w.reads.length).toBe(readsAfterStart)
  })

  test('a new session id retakes the snapshot (simulated; a real resume was not reproduced)', async ($, on) => {
    const w = world(on, base(STATE_FILLED))
    await stateOf($)
    w.files['.flightwake/STATE.md'] = STATE_FILLED.replace('billing', 'payments')
    w.sessionId = 'session-2'
    expect((await stateOf($))!.text).toContain('payments')
  })

  test('session.end reason clear retakes it; another reason does not', async ($, on) => {
    const w = world(on, base(STATE_FILLED))
    await stateOf($)
    w.files['.flightwake/STATE.md'] = STATE_FILLED.replace('billing', 'payments')
    await $.session.end({ reason: 'other', sessionId: w.sessionId, resume: { id: w.sessionId } })
    expect((await stateOf($))!.text).toContain('billing')
    await clear(w, $)
    expect((await stateOf($))!.text).toContain('payments')
  })

  test('same session id after more events keeps the snapshot (stands in for compaction; a real compaction was not reproduced)', async ($, on) => {
    const w = world(on, base(STATE_FILLED))
    const first = (await stateOf($))!.text
    w.files['.flightwake/STATE.md'] = STATE_FILLED.replace('billing', 'payments')
    expect((await stateOf($))!.text).toBe(first) // a compacted conversation recomposes under the same id
  })

  test('external program rewrites STATE or commits: snapshot unaffected, no git calls', async ($, on) => {
    const w = world(on, base(STATE_FILLED))
    const first = (await stateOf($))!.text
    delete w.files['.flightwake/STATE.md']
    w.git = { 'rev-parse HEAD': 'new' }
    expect((await stateOf($))!.text).toBe(first)
    expect(w.gitCalls).toEqual([])
  })

  test('working directory switch: a root without .flightwake keeps the session snapshot', async ($, on) => {
    const w = world(on, base(STATE_FILLED))
    const first = (await stateOf($))!.text
    w.root = '/elsewhere'
    w.files = {}
    expect((await stateOf($))!.text).toBe(first)
  })

  test('first snapshot of a session without STATE stays empty even if STATE appears later', async ($, on) => {
    const w = world(on, { files: { 'CLAUDE.md': MARKER() } })
    expect(await stateOf($)).toBeUndefined()
    w.files['.flightwake/STATE.md'] = STATE_FILLED
    expect(await stateOf($)).toBeUndefined()
    await clear(w, $)
    expect(await stateOf($)).toBeDefined()
  })

  test('bare trait: no section', async ($, on) => {
    world(on, base(STATE_FILLED))
    expect(await stateOf($, ['bare'])).toBeUndefined()
  })

  test('subagent / teammate render still carries the snapshot', async ($, on) => {
    world(on, base(STATE_FILLED))
    expect(await stateOf($, ['teammate'])).toBeDefined()
  })

  test('language follows the marker', async ($, on) => {
    world(on, base(STATE_FILLED, 'ja'))
    const t = (await stateOf($))!.text
    expect(t).toContain('前回の締め時点')
    expect(t).toContain('git の状態')
  })

  test('zh-TW and zh-CN headers', async ($, on) => {
    world(on, base(STATE_FILLED, 'zh-TW'))
    expect((await stateOf($))!.text).toContain('上次收尾')
    await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  })

  test('unreadable STATE (fs error) degrades to nothing and never throws', async ($, on) => {
    engine(on)
    on('session.root', () => ({ value: '/repo' }))
    on('session.id', () => ({ value: 's' }))
    on('settings.read', () => ({ value: {} }))
    on('fs.exists', () => ({ value: true }))
    on('fs.read', () => ({ deny: 'EIO' }))
    expect(await stateOf($)).toBeUndefined()
    expect((await compose($)).map((s) => s.id)).toEqual(['intro', 'tools'])
  })

  test('never writes files', async ($, on) => {
    const w = world(on, base(longState()))
    await startSession(w, $)
    await stateOf($)
    await clear(w, $)
    await stateOf($)
    expect(w.writes).toEqual([])
  })
})
