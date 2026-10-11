// F6 spend: tokens summed from the transcript (one count per API response), the API-equivalent cost from the engine's
// ledger (session.measure / $.session.usage), the band's trailing field, /fw-mod's line and /fw-cost.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { fmtTokens, fmtUsd, sumTranscriptUsage, totalTokens, transcriptPath } from '../hooks/lib/spend'
import { gitBehind, installWorld, MARKER, STATE_FILLED } from './world'
import type { World } from './world'

const RUN = (command: string) => ({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } }) as never
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const BAND = { plugin: 'flightwake-mod', component: 'AbovePrompt' } as const
const PROPS = { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 120 } as never
const GAUGE = { statusLine: { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.flightwake/hooks/statusline.mjs"' } }

const line = (id: string, u: Record<string, number>) => JSON.stringify({ type: 'assistant', message: { id, usage: u } })
/** Two lines of one response (thinking + text share message.id m1) and one more response. */
const TRANSCRIPT = [
  line('m1', { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 }),
  line('m1', { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 }),
  '{"type":"user","message":{"role":"user","content":"hi"}}',
  'not json',
  line('m2', { input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
].join('\n')

// HOME inside the world's root so the world's fs answers the transcript: /repo/home/.claude/projects/-repo/<sid>.jsonl
// That also puts F7's base (/repo/home/.flightwake) inside the root, so F7 refuses (`inside-repo`): nothing written.
const HOME = '/repo/home'
const TRANSCRIPT_REL = (sid: string) => `home/.claude/projects/-repo/${sid}.jsonl`

type Knobs = { usd?: number; model?: string; usageThrows?: boolean; state: Map<string, { value: unknown; version: number }>; registered: string[] }

function boot(on: On, init: Partial<World> = {}, knobs: Partial<Knobs> = {}): { w: World } & Knobs {
  const sid = init.sessionId ?? 's1'
  const w = installWorld(on, {
    files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER('en'), [TRANSCRIPT_REL(sid)]: TRANSCRIPT },
    git: gitBehind(0),
    sessionId: sid,
    ...init,
  })
  mock.env(on, { HOME })
  const k: Knobs = { state: new Map(), registered: [], ...knobs }
  on('state.get', (_$, e) => ({ value: k.state.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', (_$, e) => {
    const cur = k.state.get(e.key) ?? { value: undefined, version: 0 }
    if (e.ifVersion !== undefined && e.ifVersion !== cur.version) return { value: { isSet: false as const, version: cur.version } }
    k.state.set(e.key, { value: e.value, version: cur.version + 1 })
    return { value: { isSet: true as const, version: cur.version + 1 } }
  })
  on('command.register', (_$, e) => { k.registered.push(e.name); return { value: { command: e.name } } })
  on('session.start', () => ({ cwd: w.root }))
  on('session.turns', () => ({ value: 3 }))
  on('session.model', () => ({ value: k.model ?? 'claude-opus-5-5' }))
  on('session.usage', () => {
    if (k.usageThrows) throw new Error('boom')
    return { value: { startedAt: 0, rateLimits: [], context: { window: 200000, percent: 12 }, ...(k.usd === undefined ? {} : { cost: { usd: k.usd } }) } }
  })
  on('session.measure', () => ({ changed: ['cost'] }) as never)
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine-band'] }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('prompt.compose', () => ({ sections: [] }) as never)
  return { w, ...k }
}
const spendOf = (k: Knobs) => k.state.get('spend')?.value as { usd: number | null; tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; responses: number } | null; model: string | null; sessionId: string } | null | undefined

describe('spend: pure helpers', () => {
  test('sumTranscriptUsage counts one response per message id and skips junk', () => {
    const t = sumTranscriptUsage(TRANSCRIPT)
    expect(t).toEqual({ input: 105, output: 55, cacheRead: 1000, cacheWrite: 200, responses: 2 })
    expect(totalTokens(t)).toBe(1360)
    expect(sumTranscriptUsage('')).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, responses: 0 })
    // a line without an id counts on its own; negative / non-numeric fields read as zero
    expect(sumTranscriptUsage([JSON.stringify({ message: { usage: { input_tokens: 1, output_tokens: 'x', cache_read_input_tokens: -5 } } }), JSON.stringify({ message: { usage: { input_tokens: 2 } } })].join('\n')))
      .toEqual({ input: 3, output: 0, cacheRead: 0, cacheWrite: 0, responses: 2 })
  })
  test('fmtTokens / fmtUsd', () => {
    expect(fmtTokens(950)).toBe('950')
    expect(fmtTokens(1360)).toBe('1.36k')
    expect(fmtTokens(12_345)).toBe('12.3k')
    expect(fmtTokens(1_234_567)).toBe('1.23M')
    expect(fmtTokens(3_000_000)).toBe('3M')
    expect(fmtUsd(0)).toBe('$0.00')
    expect(fmtUsd(4.9957)).toBe('$5.00')
    expect(fmtUsd(0.0042)).toBe('$0.004')
    expect(fmtUsd(-1)).toBe('$?')
  })
  test('transcriptPath follows the CLI layout; empty parts give null', () => {
    expect(transcriptPath('/Users/kai/', '/Users/kai/orca/flightwake', 'abc')).toBe('/Users/kai/.claude/projects/-Users-kai-orca-flightwake/abc.jsonl')
    expect(transcriptPath('', '/repo', 'abc')).toBeNull()
    expect(transcriptPath('/h', '/repo', '')).toBeNull()
  })
})

describe('spend: state from the engine and the transcript', () => {
  test('session.start: usd from $.session.usage, tokens from the transcript, model, and /fw-cost registered', async ($, on) => {
    const k = boot(on, {}, { usd: 1.5 })
    await $.session.start(START)
    expect(k.registered).toContain('fw-cost')
    const s = spendOf(k)
    expect(s?.usd).toBe(1.5)
    expect(s?.tokens).toEqual({ input: 105, output: 55, cacheRead: 1000, cacheWrite: 200, responses: 2 })
    expect(s?.model).toBe('claude-opus-5-5')
    expect(s?.sessionId).toBe('s1')
    expect(k.w.writes).toEqual([])
    // F7 alongside: HOME lies inside the root, so the session file is refused, not written into the repo
    expect([(k.state.get('fleet')?.value as { status?: string } | undefined)?.status, k.w.fleetWrites]).toEqual(['inside-repo', []])
  })
  test('session.measure pushes a newer usd without calling the op', async ($, on) => {
    const k = boot(on, {}, { usd: 1.5 })
    await $.session.start(START)
    k.usageThrows = true // the op would now fail: the figure must come from the event
    await $.session.measure({ context: { window: 200000, percent: 20 }, rateLimits: [], cost: { usd: 2.25 }, changed: ['cost'] } as never)
    expect(spendOf(k)?.usd).toBe(2.25)
  })
  test('no ledger and no transcript → nulls, never zero; /fw-cost says so', async ($, on) => {
    const sid = 's2'
    const k = boot(on, { sessionId: sid, files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER('en') } })
    await $.session.start(START)
    const s = spendOf(k)
    expect(s?.usd).toBeNull()
    expect(s?.tokens).toBeNull()
    const out = (await $.command.run(RUN('fw-cost'))).text as string
    expect(out).toMatch(/cost this session: unknown/i)
    expect(out).toMatch(/Tokens: unknown/)
  })
  test('/fw-cost: the breakdown table, the response count and the ledger caveat (localized)', async ($, on) => {
    const k = boot(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER('zh-TW'), [TRANSCRIPT_REL('s1')]: TRANSCRIPT } }, { usd: 0.0042 })
    await $.session.start(START)
    const out = (await $.command.run(RUN('fw-cost'))).text as string
    expect(out).toContain('≈ $0.004')
    expect(out).toContain('| 輸入(未快取) | 105 |')
    expect(out).toContain('| 讀取快取 | 1,000 |')
    expect(out).toContain('| **合計** | 1,360 |')
    expect(out).toContain('2 次 API 回應')
    expect(out).toContain('/cost')
    expect(k.w.writes).toEqual([])
  })
  test('/fw-mod carries the spend line', async ($, on) => {
    boot(on, {}, { usd: 12.5 })
    await $.session.start(START)
    const out = (await $.command.run(RUN('fw-mod'))).text as string
    expect(out).toMatch(/tokens and cost.*on.*1\.36k tokens.*≈ \$12\.50.*\/fw-cost/i)
  })
  test('switch off: no /fw-cost, nothing stored, /fw-mod says how to turn it on', { options: { spend: false } }, async ($, on) => {
    const k = boot(on, {}, { usd: 12.5 })
    await $.session.start(START)
    expect(k.registered).not.toContain('fw-cost')
    expect(spendOf(k)).toBeUndefined()
    const out = (await $.command.run(RUN('fw-mod'))).text as string
    expect(out).toMatch(/tokens and cost.*off.*"spend": true/i)
  })
  test('not installed here: nothing registered, nothing read beyond the probe', async ($, on) => {
    const k = boot(on, { files: {} })
    await $.session.start(START)
    expect(k.registered).not.toContain('fw-cost')
    expect(spendOf(k)).toBeUndefined()
  })
})

describe('spend: band', () => {
  test('without the gauge the band ends with "1.36k tok · ≈$1.50"', async ($, on) => {
    boot(on, {}, { usd: 1.5 })
    await $.session.start(START)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /1\.36k tok · ≈\$1\.50/ })).toBeDefined()
    await ui.unmount()
  })
  test('with the gauge the band stays quiet (the gauge shows the same field)', async ($, on) => {
    boot(on, { settings: GAUGE }, { usd: 1.5 })
    await $.session.start(START)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /tok/ })).toBeUndefined()
    await ui.unmount()
  })
  test('only the half that is known is drawn', async ($, on) => {
    boot(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER('en') } }, { usd: 0.5 })
    await $.session.start(START)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: / · ≈\$0\.50$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /tok/ })).toBeUndefined()
    await ui.unmount()
  })
})
