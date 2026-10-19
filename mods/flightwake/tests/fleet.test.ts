// F7 fleet: this session reports working / blocked / idle / ended to `<base>/sessions/<id>.json` outside the repo,
// read back by /fw-fleet, /fw-mod and the resume hint. Permission, ask and ToolProgress events are raised from the
// TEST's engine `$` (captured in the bottom tool.call hook's closure): the engine's `tool.check` carries tool_use_id,
// a plugin's own `$.tool.check` query cannot. `w.writes` (forbidden writes) stays [] in every case; the only writes
// allowed land in `w.fleetWrites`, under the sessions folder, outside the root.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { MockClock } from 'claude-code/testing'

import { MOD_VERSION } from '../hooks/lib/core'
import type { Lang } from '../hooks/lib/core'
import {
  displayOf, fleetBase, fmtAge, isSafeId, pickHint, resumableOf, shq, staleAfter, T, targetOf, uncleanOf,
} from '../hooks/lib/fleet'
import type { SessionRec } from '../hooks/lib/fleet'
import { FLEET_DIR, fleetFile, gitBehind, HOME_OUT, installWorld, MARKER, sessionRec, STATE_FILLED } from './world'
import type { World } from './world'

const NOW = 1_760_000_000_000
const DAY = 86_400_000
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const RUN = (command: string, args = '') => ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } }) as never
const BAND = { plugin: 'flightwake-mod', component: 'AbovePrompt', surface: 'terminal', props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 120 } } as never
const LANGS: readonly Lang[] = ['en', 'zh-TW', 'zh-CN', 'ja']
const MY = `${FLEET_DIR}/s1.json`
/** The §3 key list, in the order written (spelled out here, not imported, so a drift in lib/fleet.ts shows). */
const SPEC_KEYS = [
  'schema', 'mod', 'sessionId', 'instance', 'state', 'why', 'stateSince', 'seq', 'heartbeatAt', 'heartbeatMs',
  'startedAt', 'root', 'repoRoot', 'launchCwd', 'lang', 'surface', 'blocked', 'activity', 'inFlight', 'turns',
  'lastTurn', 'ended', 'resume', 'transcript', 'parent', 'contested', 'host', 'context', 'role', 'fwVersion',
]

type Held = { id: string; tool: string; release: () => void }
type Knobs = {
  w: World
  clock: MockClock
  state: Map<string, { value: unknown; version: number }>
  registered: string[]
  toasts: string[]
  /** Tools whose bottom call asks the mode's decider (engine `tool.check`) and, on `ask`, raises PermissionRequest. */
  dialog: Set<string>
  /** The engine tool.check bottom's verdict. */
  verdict: 'ask' | 'allow'
  /** A settings hook beneath PermissionRequest answers it (no dialog). */
  isAnswered: boolean
  /** The bottom's check goes without a tool_use_id (as a plugin's own $.tool.check query would). */
  isNoId: boolean
  /** The bottom asks the decider but raises no PermissionRequest (the mode answered the ask itself). */
  isAskOnly: boolean
  /** The bottom raises PermissionDenied after the dialog. */
  isDenied: boolean
  /** The bottom waits this long (on the mock clock) before it puts the call to the decider. */
  dialogDelayMs: number
  /** `$.clock.after(0, …)` is refused beneath (its callback never runs). */
  isAfter0Refused: boolean
  /** Calls wait in the bottom until the test releases them. */
  isHolding: boolean
  /** The bottom throws once released. */
  isThrowing: boolean
  held: Held[]
  ids: string[]
  turns: number
  /** What the bottom session.end hook saw: the record on disk and the read count at that moment. */
  atEnd: { rec: Record<string, any> | null; reads: number }[]
}

/** The world beneath the mod, with a clock, the env, and the engine pieces F7 (and the other default features) ask. */
function boot($: any, on: On, init: Partial<World> = {}, opts: { env?: Record<string, string>; lang?: Lang; now?: number } = {}): Knobs {
  const w = installWorld(on, {
    files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER(opts.lang ?? 'en') },
    git: gitBehind(0),
    sessionId: 's1',
    ...init,
  })
  // the mock clock's own clock.after hook, wrapped so a test can refuse after(0) (a test may register an event once)
  const onClock = ((name: string, ...rest: unknown[]) => {
    const h = rest[rest.length - 1] as (...a: unknown[]) => unknown
    if (name !== 'clock.after' || typeof h !== 'function') return (on as (...a: unknown[]) => unknown)(name, ...rest)
    const wrapped = (...a: unknown[]) => (k.isAfter0Refused && (a[1] as { ms?: unknown } | undefined)?.ms === 0 ? { deny: 'refused' } : h(...a))
    return (on as (...a: unknown[]) => unknown)(name, ...rest.slice(0, -1), wrapped)
  }) as unknown as On
  const clock = mock.clock(onClock, { now: opts.now ?? NOW })
  w.now = () => clock.now()
  mock.env(on, opts.env ?? { HOME: HOME_OUT })
  const k: Knobs = {
    w, clock, state: new Map(), registered: [], toasts: [], dialog: new Set(), verdict: 'ask', isAnswered: false, isNoId: false,
    isAskOnly: false, isDenied: false, dialogDelayMs: 0, isAfter0Refused: false, isHolding: false, isThrowing: false, held: [], ids: [], turns: 0, atEnd: [],
  }
  on('state.get', (_$, e) => ({ value: k.state.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', (_$, e) => {
    const cur = k.state.get(e.key) ?? { value: undefined, version: 0 }
    if (e.ifVersion !== undefined && e.ifVersion !== cur.version) return { value: { isSet: false as const, version: cur.version } }
    k.state.set(e.key, { value: e.value, version: cur.version + 1 })
    return { value: { isSet: true as const, version: cur.version + 1 } }
  })
  on('command.register', (_$, e) => { k.registered.push(e.name); return { value: { command: e.name } } })
  on('command.run', () => ({ text: 'engine: unknown command' }))
  on('ui.toast', (_$, e) => { k.toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine'] }) as never)
  on('session.start', () => ({ cwd: w.root }))
  on('session.end', (_$, e) => {
    k.atEnd.push({ rec: fleetFile(w, e.sessionId), reads: w.reads.length })
    return { sessionId: e.sessionId } as never
  })
  on('session.turns', () => ({ value: k.turns }))
  on('session.repo', () => ({ value: { root: '/repo', remote: null, internal: false, name: null } }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { window: 200000, percent: 12 }, cost: { usd: 1.5 } } }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.measure', () => ({ changed: [] }) as never)
  on('session.compact', async (_$, e) => {
    if (k.isHolding) await new Promise<void>((release) => { k.held.push({ id: 'compact', tool: 'compact', release }) })
    return { messages: e.messages } as never
  })
  on('prompt.compose', () => ({ sections: [] }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.check', () => ({ decision: k.verdict }) as never)
  on('classic.SessionStart', () => ({}) as never)
  on('classic.PermissionRequest', () => (k.isAnswered ? { decision: { behavior: 'allow' } } : {}) as never)
  on('classic.PermissionDenied', () => ({}) as never)
  on('tool.call', async (_$, e) => {
    const id = e.tool_use_id
    k.ids.push(id)
    const { tool, tool_use_id: _id, agentId, ...input } = e as unknown as Record<string, unknown> & { tool: string; tool_use_id: string; agentId?: string }
    if (k.dialog.has(tool)) {
      if (k.dialogDelayMs > 0) await clock.sleep(k.dialogDelayMs)
      const r = await $.tool.check(k.isNoId ? { tool, input } : { tool, input, tool_use_id: id })
      if (r?.decision === 'ask' && !k.isAskOnly) {
        const base = { session_id: w.sessionId, transcript_path: '', cwd: w.root, ...(agentId ? { agent_id: agentId } : {}) }
        await $.classic.PermissionRequest({ ...base, hook_event_name: 'PermissionRequest', tool_name: tool, tool_input: input } as never)
        if (k.isDenied) await $.classic.PermissionDenied({ ...base, hook_event_name: 'PermissionDenied', tool_name: tool, tool_input: {}, tool_use_id: id, reason: 'user' } as never)
      }
    }
    if (k.isHolding) await new Promise<void>((release) => { k.held.push({ id, tool, release }) })
    if (k.isThrowing) throw new Error('bottom failed')
    return { result: { stdout: '', stderr: '', interrupted: false } } as never
  })
  return k
}

const settle = (k: Knobs) => k.clock.settle()
const rec = (k: Knobs, id = 's1') => fleetFile(k.w, id)
const start = async ($: any, k: Knobs, s: object = START) => { await $.session.start(s); await settle(k) }
const turnStart = async ($: any, k: Knobs, text = '') => { await $.turn.start({ text, turnId: 't1' }); await settle(k) }
const turnDone = async ($: any, k: Knobs, reason: string, extra: object = {}) => {
  await $.turn.complete({ answer: '', durationMs: 41000, isAborted: reason === 'aborted', turnId: 't1', reason, ...extra } as never)
  await settle(k)
}
const end = async ($: any, k: Knobs, reason: string, id = 's1', resumeId = id) => {
  await $.session.end({ reason, sessionId: id, resume: { id: resumeId } } as never)
  await settle(k)
}
/** Starts a call unawaited (it may wait in the bottom); settles so its hooks have run. `done` resolves when it ends. */
const call = async ($: any, k: Knobs, input: object): Promise<{ done: Promise<unknown> }> => {
  const done = ($.tool.call(input) as Promise<unknown>).catch((err: unknown) => err)
  await settle(k)
  return { done }
}
const release = async (k: Knobs, i = 0) => { k.held.splice(i, 1)[0]!.release(); await settle(k) }
const fwFleet = async ($: any, args = '') => (await $.command.run(RUN('fw-fleet', args))).text as string
const fwMod = async ($: any) => (await $.command.run(RUN('fw-mod'))).text as string
const modLine = async ($: any) => (await fwMod($)).split('\n').find((l) => l.includes('(`fleet`)')) ?? ''
const seed = (k: Knobs, r: Record<string, unknown>, mtime = NOW - 1000, name = `${String(r.sessionId)}.json`) => {
  k.w.outside[`${FLEET_DIR}/${name}`] = JSON.stringify(r)
  k.w.mtimes[`${FLEET_DIR}/${name}`] = mtime
}
const TRANSCRIPT = (id: string, cwd = '-repo') => `${HOME_OUT}/.claude/projects/${cwd}/${id}.jsonl`
/** A record that stopped uncleanly 10 minutes ago in /repo (stale while working), resumable, transcript present. */
const staleRec = (over: Record<string, unknown> = {}) => sessionRec({
  sessionId: 'old1', instance: 'dead', state: 'working', why: 'turn.start', stateSince: NOW - 700000, heartbeatAt: NOW - 600000,
  startedAt: NOW - 900000, turns: 3, resume: { id: 'old1', resumable: true }, transcript: TRANSCRIPT('old1'), ...over,
})

describe('fleet: lifecycle', () => {
  test('start writes the whole record: idle, session.start, this mod version, seq 1', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    expect(k.registered).toContain('fw-fleet')
    const r = rec(k)!
    expect(Object.keys(r)).toEqual(SPEC_KEYS)
    expect(r).toMatchObject({
      schema: 'flightwake.session/1', mod: MOD_VERSION, sessionId: 's1', state: 'idle', why: 'session.start', seq: 1, stateSince: NOW,
      heartbeatAt: NOW, heartbeatMs: 30000, startedAt: NOW, root: '/repo', repoRoot: '/repo', launchCwd: '/repo', lang: 'en',
      surface: 'terminal', blocked: null, activity: null, inFlight: 0, turns: 0, lastTurn: null, ended: null,
      resume: { id: 's1', resumable: false }, transcript: TRANSCRIPT('s1'), parent: null, contested: false, host: {},
      context: null, role: null, fwVersion: '0.14.0',
    })
    expect(typeof r.instance).toBe('string')
    expect(k.w.fleetWrites).toEqual([MY])
    expect(k.w.writes).toEqual([])
    expect(k.w.outside[MY]!.endsWith('}\n')).toBe(true)
  })

  test('turn.start → working (turns counted); turn.complete answer / aborted / error → idle with lastTurn', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    for (const reason of ['answer', 'aborted', 'error']) {
      await k.clock.advance(1000)
      await turnStart($, k)
      expect(rec(k)).toMatchObject({ state: 'working', why: 'turn.start', stateSince: k.clock.now() })
      await k.clock.advance(2000)
      await turnDone($, k, reason)
      expect(rec(k)).toMatchObject({ state: 'idle', why: `turn.complete:${reason}`, lastTurn: { reason, at: k.clock.now(), durationMs: 41000 } })
    }
    expect(rec(k)).toMatchObject({ turns: 3, resume: { id: 's1', resumable: true } })
  })

  test('a subagent turn.complete leaves the main turn working', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    await turnStart($, k)
    const n = k.w.fleetWrites.length
    await turnDone($, k, 'answer', { agentId: 'agent-1' })
    expect(rec(k)).toMatchObject({ state: 'working', lastTurn: null })
    expect(k.w.fleetWrites.length).toBe(n)
  })

  test('an unknown plain-word reason ("complete", 2.1.294) is stored raw; anything else as "answer"', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    await turnStart($, k)
    await turnDone($, k, 'complete')
    expect(rec(k)).toMatchObject({ why: 'turn.complete:complete', lastTurn: { reason: 'complete' } })
    await turnStart($, k)
    await turnDone($, k, 'Not A Word!')
    expect(rec(k)).toMatchObject({ why: 'turn.complete:answer', lastTurn: { reason: 'answer' } })
  })

  test('P1: a prompt submitted while idle with a turn still open resyncs to idle (the prompt text is never read into the file)', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    await turnStart($, k)
    await $.prompt.submit({ text: 'SECRET-P', wait: false, origin: { kind: 'composer' } } as never)
    await settle(k)
    expect(rec(k)).toMatchObject({ state: 'idle', why: 'resync:prompt-while-idle' })
    // submitted mid-turn (turnId set): no resync
    await turnStart($, k)
    await $.prompt.submit({ text: 'SECRET-P', wait: false, turnId: 't1', origin: { kind: 'composer' } } as never)
    await settle(k)
    expect(rec(k)).toMatchObject({ state: 'working' })
    expect(k.w.outside[MY]).not.toContain('SECRET-P')
  })
})

describe('fleet: permission', () => {
  test('an ask alone (the mode decided: classifier, headless — no PermissionRequest raised) is not blocked', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isAskOnly = true
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const n = k.w.fleetWrites.length
    const p = await call($, k, { tool: 'Bash', command: 'echo SECRET-C' })
    expect(rec(k)).toMatchObject({ state: 'working', blocked: null })
    await release(k)
    await p.done
    expect(rec(k)!.state).toBe('working')
    expect(k.w.fleetWrites.length).toBe(n)
  })

  test('ask + an unanswered PermissionRequest → blocked(permission, Bash); the call settling → working', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    await k.clock.advance(500)
    const p = await call($, k, { tool: 'Bash', command: 'echo SECRET-C' })
    expect(rec(k)).toMatchObject({
      state: 'blocked', why: 'permission-dialog', stateSince: k.clock.now(), inFlight: 1,
      blocked: { kind: 'permission', tool: 'Bash', target: null, agent: false, since: k.clock.now() },
      activity: { tool: 'Bash', target: null, agent: false },
    })
    await release(k)
    await p.done
    expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:tool-done', blocked: null })
    expect(k.w.writes).toEqual([])
  })

  test('a settings hook beneath answers the PermissionRequest → never blocked', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isAnswered = true
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const n = k.w.fleetWrites.length
    const p = await call($, k, { tool: 'Bash', command: 'ls' })
    expect(rec(k)!.state).toBe('working')
    await release(k)
    await p.done
    expect(rec(k)!.state).toBe('working')
    expect(k.w.fleetWrites.length).toBe(n) // nothing changed, nothing written
  })

  test('isInteractive false (-p / SDK): no file at all, nothing written; /fw-fleet still answers', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    await start($, k, { ...START, isInteractive: false })
    await turnStart($, k)
    await (await call($, k, { tool: 'Bash', command: 'ls' })).done
    await turnDone($, k, 'answer')
    await k.clock.advance(60000)
    await end($, k, 'other')
    expect(k.w.fleetWrites).toEqual([])
    expect(k.w.writes).toEqual([])
    expect(Object.keys(k.w.outside)).toEqual([])
    expect(k.registered).toContain('fw-fleet')
    expect(await fwFleet($)).toContain('This session is not reporting: a -p / SDK run: nothing to report')
  })

  test('a query without tool_use_id is not recorded: the dialog stays unpaired (ToolProgress for the call cannot clear it), and the call settling still clears it', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isNoId = true
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const p = await call($, k, { tool: 'Bash', command: 'sleep 9' })
    expect(rec(k)).toMatchObject({ state: 'blocked', blocked: { kind: 'permission', tool: 'Bash' } })
    const ui = await $.ui.mount({ plugin: 'flightwake-mod', component: 'ToolProgress', surface: 'terminal', props: { tool_use_id: k.ids[0], kind: 'background_hint', hint: 'x' } } as never)
    await settle(k)
    expect(rec(k)!.state).toBe('blocked')
    await ui.unmount()
    await release(k)
    await p.done
    expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:tool-done' })
  })

  test('a PermissionRequest for no running call (it settled while the hooks beneath ran) never blocks', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    await turnStart($, k)
    const n = k.w.fleetWrites.length
    await $.classic.PermissionRequest({ session_id: 's1', transcript_path: '', cwd: '/repo', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: {} } as never)
    await settle(k)
    expect(rec(k)).toMatchObject({ state: 'working', blocked: null })
    await k.clock.advance(30000)
    expect(rec(k)).toMatchObject({ state: 'working', blocked: null })
    expect(k.w.fleetWrites.length).toBe(n + 1) // the heartbeat only
  })

  test("PermissionDenied for another call (the classifier denied it; it had no dialog) leaves the open dialog blocked", async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const p = await call($, k, { tool: 'Bash', command: 'a' })
    expect(rec(k)).toMatchObject({ state: 'blocked', blocked: { kind: 'permission', tool: 'Bash' } })
    await $.classic.PermissionDenied({ session_id: 's1', transcript_path: '', cwd: '/repo', hook_event_name: 'PermissionDenied', tool_name: 'Bash', tool_input: {}, tool_use_id: 'another-call', reason: 'classifier' } as never)
    await settle(k)
    expect(rec(k)).toMatchObject({ state: 'blocked', why: 'permission-dialog', blocked: { kind: 'permission', tool: 'Bash' } })
    await release(k)
    await p.done
    expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:tool-done' })
  })

  test('PermissionDenied clears the permission evidence → unblocked:denied', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isDenied = true
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const p = await call($, k, { tool: 'Bash', command: 'rm -rf x' })
    expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:denied', blocked: null })
    await release(k)
    await p.done
  })

  test('ToolProgress for a paired id → working unblocked:running, written via after(0) (no $.state.set inside the render)', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const p = await call($, k, { tool: 'Bash', command: 'sleep 9' })
    expect(rec(k)!.state).toBe('blocked')
    const sets = () => [...k.state.values()].reduce((n, v) => n + v.version, 0)
    const before = sets()
    const ui = await $.ui.mount({ plugin: 'flightwake-mod', component: 'ToolProgress', surface: 'terminal', props: { tool_use_id: k.ids[0], kind: 'background_hint', hint: 'x' } } as never)
    expect(sets()).toBe(before)
    await settle(k)
    expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:running', blocked: null })
    expect(sets()).toBeGreaterThan(before)
    await ui.unmount()
    await release(k)
    await p.done
  })

  test('a ToolProgress clear whose after(0) is refused: the call settling (or the next heartbeat) still re-derives; later clears are not held back', async ($, on) => {
    const k = boot($, on)
    k.isAfter0Refused = true
    k.dialog.add('Bash')
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const mountPill = (id: string) => $.ui.mount({ plugin: 'flightwake-mod', component: 'ToolProgress', surface: 'terminal', props: { tool_use_id: id, kind: 'background_hint', hint: 'x' } } as never)
    const p = await call($, k, { tool: 'Bash', command: 'a' })
    expect(rec(k)!.state).toBe('blocked')
    const ui = await mountPill(k.ids[0]!)
    await settle(k)
    await ui.unmount()
    // the heartbeat never writes blocked without its evidence
    await k.clock.advance(30000)
    expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:running', blocked: null })
    await release(k)
    await p.done
    expect(rec(k)).toMatchObject({ state: 'working', blocked: null })
    // a second clear, with after(0) answered again, goes through at once
    k.isAfter0Refused = false
    const q = await call($, k, { tool: 'Bash', command: 'b' })
    expect(rec(k)!.state).toBe('blocked')
    const ui2 = await mountPill(k.ids[1]!)
    await settle(k)
    expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:running', blocked: null })
    await ui2.unmount()
    await release(k)
    await q.done
  })

  test('a ToolProgress clear whose after(0) is refused, then the call settles before any heartbeat → working (unblocked:tool-done)', async ($, on) => {
    const k = boot($, on)
    k.isAfter0Refused = true
    k.dialog.add('Bash')
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const p = await call($, k, { tool: 'Bash', command: 'a' })
    const ui = await $.ui.mount({ plugin: 'flightwake-mod', component: 'ToolProgress', surface: 'terminal', props: { tool_use_id: k.ids[0], kind: 'background_hint', hint: 'x' } } as never)
    await settle(k)
    await ui.unmount()
    await release(k)
    await p.done
    expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:tool-done', blocked: null })
  })

  test('an Edit inside root names its repo-relative target; one outside root never does', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Edit')
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const p = await call($, k, { tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' })
    expect(rec(k)).toMatchObject({ blocked: { kind: 'permission', tool: 'Edit', target: 'src/a.ts' }, activity: { tool: 'Edit', target: 'src/a.ts' } })
    await release(k)
    await p.done
    const q = await call($, k, { tool: 'Edit', file_path: '/etc/SECRET-PATH', old_string: 'a', new_string: 'b' })
    expect(rec(k)).toMatchObject({ blocked: { tool: 'Edit', target: null }, activity: { tool: 'Edit', target: null } })
    expect(k.w.outside[MY]).not.toContain('SECRET-PATH')
    await release(k)
    await q.done
  })

  test("a subagent's permission dialog counts, marked agent: true", async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const p = await call($, k, { tool: 'Bash', command: 'ls', agentId: 'agent-7' })
    expect(rec(k)).toMatchObject({ state: 'blocked', blocked: { kind: 'permission', agent: true }, activity: { agent: true } })
    await release(k)
    await p.done
    expect(rec(k)!.state).toBe('working')
  })

  test("a subagent's dialog held across the main turn.complete stays blocked (agent: true) until its call settles", async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const p = await call($, k, { tool: 'Bash', command: 'ls', agentId: 'agent-7' })
    await turnDone($, k, 'answer')
    expect(rec(k)).toMatchObject({ state: 'blocked', inFlight: 1, blocked: { kind: 'permission', tool: 'Bash', agent: true } })
    await turnStart($, k) // the person starts another turn: still the subagent's dialog
    expect(rec(k)).toMatchObject({ state: 'blocked', blocked: { agent: true } })
    await release(k)
    await p.done
    expect(rec(k)).toMatchObject({ state: 'working', blocked: null })
  })

  test('an ask a settings hook answered, then a dialog on a second call of the same tool and input: that call settling → working', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isHolding = true
    k.isAnswered = true
    await start($, k)
    await turnStart($, k)
    const p1 = await call($, k, { tool: 'Bash', command: 'sleep 9' })
    expect(rec(k)!.state).toBe('working')
    k.isAnswered = false
    const p2 = await call($, k, { tool: 'Bash', command: 'sleep 9' })
    expect(rec(k)).toMatchObject({ state: 'blocked', blocked: { kind: 'permission', tool: 'Bash' } })
    await release(k, 1)
    await p2.done
    expect(rec(k)).toMatchObject({ state: 'working', blocked: null, inFlight: 1 })
    await release(k)
    await p1.done
  })

  test("an ask the mode settled (no dialog), then another call's dialog: the first call's pill does not clear it", async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isHolding = true
    k.isAskOnly = true
    await start($, k)
    await turnStart($, k)
    const p1 = await call($, k, { tool: 'Bash', command: 'make a' })
    k.isAskOnly = false
    const p2 = await call($, k, { tool: 'Bash', command: 'make b' })
    expect(rec(k)!.state).toBe('blocked')
    // call 1 is the one running, so it draws the pill: its id holds no evidence, the dialog of call 2 stays
    const ui = await $.ui.mount({ plugin: 'flightwake-mod', component: 'ToolProgress', surface: 'terminal', props: { tool_use_id: k.ids[0], kind: 'background_hint', hint: 'x' } } as never)
    await settle(k)
    expect(rec(k)).toMatchObject({ state: 'blocked', blocked: { kind: 'permission', tool: 'Bash' } })
    await ui.unmount()
    await release(k, 1)
    await p2.done
    expect(rec(k)).toMatchObject({ state: 'working', blocked: null })
    await release(k)
    await p1.done
  })
})

describe('fleet: question and plan', () => {
  for (const [tool, kind, why] of [['AskUserQuestion', 'question', 'question'], ['ExitPlanMode', 'plan', 'plan-approval']] as const) {
    test(`${tool} on the main loop → blocked(${kind}) until the call settles`, async ($, on) => {
      const k = boot($, on)
      k.isHolding = true
      await start($, k)
      await turnStart($, k)
      const p = await call($, k, { tool, questions: [{ question: 'SECRET-Q', options: [{ label: 'SECRET-Q' }] }], plan: 'SECRET-Q' })
      expect(rec(k)).toMatchObject({ state: 'blocked', why, blocked: { kind, tool, target: null, agent: false } })
      await release(k)
      await p.done
      expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:tool-done' })
      expect(k.w.outside[MY]).not.toContain('SECRET-Q')
    })
  }

  // In the engine both reach the person through the permission path too (their check is `ask`, so the ask pairs
  // with the call and classic.PermissionRequest fires): the question / plan evidence stays, kind and since unchanged
  for (const [tool, kind, why] of [['AskUserQuestion', 'question', 'question'], ['ExitPlanMode', 'plan', 'plan-approval']] as const) {
    test(`${tool} through the permission dialog as well → still blocked(${kind}), its since unchanged`, async ($, on) => {
      const k = boot($, on)
      k.dialog.add(tool)
      k.dialogDelayMs = 1000
      k.isHolding = true
      await start($, k)
      await turnStart($, k)
      const t0 = k.clock.now()
      const p = await call($, k, { tool, questions: [], plan: 'x' })
      expect(rec(k)).toMatchObject({ state: 'blocked', why, blocked: { kind, tool, since: t0 } })
      const n = k.w.fleetWrites.length
      await k.clock.advance(1000) // the dialog
      expect(k.held).toHaveLength(1)
      expect(rec(k)).toMatchObject({ state: 'blocked', why, stateSince: t0, blocked: { kind, tool, target: null, agent: false, since: t0 } })
      expect(k.w.fleetWrites.length).toBe(n) // nothing changed for a reader
      await release(k)
      await p.done
      expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:tool-done', blocked: null })
    })
  }

  test("a subagent's AskUserQuestion is not the person's dialog: not blocked", async ($, on) => {
    const k = boot($, on)
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const p = await call($, k, { tool: 'AskUserQuestion', questions: [], agentId: 'agent-2' })
    expect(rec(k)!.state).toBe('working')
    await release(k)
    await p.done
  })

  test('a bottom that throws still clears', async ($, on) => {
    const k = boot($, on)
    k.isHolding = true
    k.isThrowing = true
    await start($, k)
    await turnStart($, k)
    const p = await call($, k, { tool: 'AskUserQuestion', questions: [] })
    expect(rec(k)!.state).toBe('blocked')
    await release(k)
    expect(await p.done).toBeInstanceOf(Error)
    expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:tool-done', inFlight: 0 })
  })
})

describe('fleet: parallel, ESC, write volume, ordering', () => {
  test('two dialogs: one settling leaves it blocked on the other (the oldest shown); both → working', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const t1 = k.clock.now()
    const p1 = await call($, k, { tool: 'Bash', command: 'a' })
    await k.clock.advance(1000)
    const t2 = k.clock.now()
    const p2 = await call($, k, { tool: 'Bash', command: 'b' })
    // the second dialog changes neither the state nor the oldest evidence shown: no write (inFlight only rides along)
    expect(k.held).toHaveLength(2)
    expect(rec(k)).toMatchObject({ state: 'blocked', inFlight: 1, blocked: { since: t1 } })
    await release(k, 0)
    await p1.done
    expect(rec(k)).toMatchObject({ state: 'blocked', inFlight: 1, blocked: { since: t2 } })
    await release(k, 0)
    await p2.done
    expect(rec(k)).toMatchObject({ state: 'working', blocked: null, inFlight: 0 })
  })

  test('ESC: turn.complete aborted while the dialog is up → idle; the later release writes nothing and does not revert', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    const p = await call($, k, { tool: 'Bash', command: 'x' })
    expect(rec(k)!.state).toBe('blocked')
    await turnDone($, k, 'aborted')
    expect(rec(k)).toMatchObject({ state: 'idle', why: 'turn.complete:aborted', blocked: null })
    const n = k.w.fleetWrites.length
    await release(k)
    await p.done
    expect(k.w.fleetWrites.length).toBe(n)
    expect(rec(k)!.state).toBe('idle')
  })

  test('5 plain tool calls in one turn add no write beyond turn.start and turn.complete', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    expect(k.w.fleetWrites.length).toBe(1)
    await turnStart($, k)
    for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: `echo ${i}` })
    await settle(k)
    expect(k.w.fleetWrites.length).toBe(2)
    await turnDone($, k, 'answer')
    expect(k.w.fleetWrites.length).toBe(3)
    expect(rec(k)).toMatchObject({ seq: 3, activity: { tool: 'Bash' }, inFlight: 0 })
  })

  test('single flight, with writes landing late and newest first: one write at a time, and the file ends at working', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isHolding = true
    await start($, k)
    await turnStart($, k)
    k.w.isFleetWriteHeld = true
    const p = await call($, k, { tool: 'Bash', command: 'x' }) // the blocked write is held
    await release(k) // the call settles: working, queued behind the held write
    await p.done
    const landed: { seq: number; state: string }[] = []
    for (let round = 0; round < 10 && k.w.heldWrites.length > 0; round++) {
      for (const land of k.w.heldWrites.splice(0).reverse()) {
        land()
        await settle(k)
        landed.push({ seq: rec(k)!.seq, state: rec(k)!.state })
      }
    }
    expect(k.w.heldWrites).toEqual([])
    expect(k.w.maxFleetWritesInFlight).toBe(1)
    expect(landed.map((x) => x.state)).toEqual(['blocked', 'working'])
    expect(landed.map((x) => x.seq)).toEqual([...landed.map((x) => x.seq)].sort((a, b) => a - b))
    expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:tool-done', blocked: null })
  })

  test('single flight: a rapid blocked → working settles with the file at working, seq rising once per write', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    await start($, k)
    await turnStart($, k)
    await $.tool.call({ tool: 'Bash', command: 'x' }) // dialog raised and the call settled in one dispatch
    await settle(k)
    expect(rec(k)).toMatchObject({ state: 'working', why: 'unblocked:tool-done', blocked: null })
    expect(rec(k)!.seq).toBe(k.w.fleetWrites.length)
  })
})

describe('fleet: heartbeat', () => {
  test('every 30 s: seq + 1 and heartbeatAt moves; stateSince and why stay', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    const r0 = rec(k)!
    await k.clock.advance(30000)
    const r1 = rec(k)!
    expect(r1).toMatchObject({ seq: r0.seq + 1, heartbeatAt: NOW + 30000, stateSince: r0.stateSince, why: r0.why, state: 'idle' })
    await k.clock.advance(30000)
    expect(rec(k)).toMatchObject({ seq: r0.seq + 2, heartbeatAt: NOW + 60000 })
  })

  test('after prompt_input_exit the timer is cancelled: no more writes', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    await end($, k, 'prompt_input_exit')
    expect(rec(k)).toMatchObject({ state: 'ended', ended: { reason: 'prompt_input_exit', at: NOW, stateAtEnd: 'idle' } })
    const n = k.w.fleetWrites.length
    await k.clock.advance(120000)
    expect(k.w.fleetWrites.length).toBe(n)
    expect(rec(k)!.heartbeatAt).toBe(NOW)
  })

  test('after clear the timer keeps running: with no classic event the next tick adopts the new id (id-changed)', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    await end($, k, 'clear')
    k.w.sessionId = 's2'
    await k.clock.advance(30000)
    expect(rec(k)!.ended).toMatchObject({ reason: 'clear' }) // already ended: not re-ended as id-changed
    expect(rec(k, 's2')).toMatchObject({ state: 'idle', why: 'adopt:id-changed', parent: { sessionId: 's1', via: 'id-changed' }, ended: null })
  })
})

describe('fleet: /clear, end, resume, reload', () => {
  test('/clear: s1 ended {clear}; classic.SessionStart clear adopts s2 at once, parent set', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    await turnStart($, k)
    await turnDone($, k, 'answer')
    await end($, k, 'clear', 's1', 's1')
    expect(rec(k)).toMatchObject({ state: 'ended', why: 'session.end:clear', ended: { reason: 'clear', stateAtEnd: 'idle' }, resume: { id: 's1' } })
    k.w.sessionId = 's2'
    await $.classic.SessionStart({ session_id: 's2', transcript_path: '', cwd: '/repo', hook_event_name: 'SessionStart', source: 'clear' } as never)
    await settle(k)
    expect(rec(k, 's2')).toMatchObject({ state: 'idle', why: 'adopt:clear', parent: { sessionId: 's1', via: 'clear' }, ended: null, launchCwd: '/repo', lastTurn: null })
    expect(rec(k)!.ended).toMatchObject({ reason: 'clear' })
    expect(rec(k, 's2')!.instance).toBe(rec(k)!.instance)
    expect(k.w.fleetWrites.every((p) => p === MY || p === `${FLEET_DIR}/s2.json`)).toBe(true)
    // the idle detail says so
    expect(await fwFleet($)).toMatch(/○ idle \| `s2` \(this session\) \| repo \| \d+s \| after \/clear \|/)
  })

  test('session.end is written from memory: the bottom sees the file ended, and nothing is read during session.end', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    await turnStart($, k)
    const before = k.w.reads.length
    await end($, k, 'other')
    expect(k.atEnd).toHaveLength(1)
    expect(k.atEnd[0]!.rec).toMatchObject({ state: 'ended', ended: { reason: 'other', stateAtEnd: 'working' } })
    expect(k.atEnd[0]!.reads).toBe(before)
    expect(k.w.reads.length).toBe(before)
  })

  test('claude --resume <id> in a new process: a stale blocked file is taken over as idle (no inherited blocked)', async ($, on) => {
    const k = boot($, on)
    seed(k, sessionRec({
      sessionId: 's1', instance: 'old-proc', state: 'blocked', seq: 40, heartbeatAt: NOW - 600000, stateSince: NOW - 700000,
      blocked: { kind: 'permission', tool: 'Bash', target: null, agent: false, since: NOW - 700000 },
    }))
    await start($, k)
    expect(rec(k)).toMatchObject({ state: 'idle', why: 'session.start', blocked: null, ended: null, contested: false, seq: 41 })
    expect(rec(k)!.instance).not.toBe('old-proc')
  })

  test('in-process /resume back to an ended file: it comes back live idle', async ($, on) => {
    const k = boot($, on)
    seed(k, sessionRec({ sessionId: 's0', state: 'ended', seq: 7, heartbeatAt: NOW - DAY, ended: { reason: 'prompt_input_exit', at: NOW - DAY, stateAtEnd: 'idle' } }))
    await start($, k)
    await end($, k, 'resume', 's1', 's1')
    expect(rec(k)!.ended).toMatchObject({ reason: 'resume' })
    k.w.sessionId = 's0'
    await $.classic.SessionStart({ session_id: 's0', transcript_path: '', cwd: '/repo', hook_event_name: 'SessionStart', source: 'resume' } as never)
    await settle(k)
    expect(rec(k, 's0')).toMatchObject({ state: 'idle', why: 'adopt:resume', ended: null, parent: { sessionId: 's1', via: 'resume' }, seq: 8 })
  })

  test('reload (session.start again, $.state kept): same instance, not contested; a blocked record becomes working (reload:evidence-lost)', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.isHolding = true
    await start($, k)
    const inst = rec(k)!.instance
    await start($, k)
    expect(rec(k)).toMatchObject({ instance: inst, contested: false, state: 'idle' })
    await turnStart($, k)
    const p = await call($, k, { tool: 'Bash', command: 'sleep 9' })
    expect(rec(k)!.state).toBe('blocked')
    await start($, k)
    expect(rec(k)).toMatchObject({ state: 'working', why: 'reload:evidence-lost', instance: inst, contested: false, blocked: null })
    await release(k)
    await p.done
  })
})

describe('fleet: contested', () => {
  test('a fresh live record of another instance on our id → our start writes contested: true; /fw-fleet shows it as unknown', async ($, on) => {
    const k = boot($, on)
    seed(k, sessionRec({ sessionId: 's1', instance: 'sibling', state: 'working', heartbeatAt: NOW - 5000 }))
    await start($, k)
    expect(rec(k)).toMatchObject({ contested: true, state: 'idle' })
    expect(rec(k)!.instance).not.toBe('sibling')
    expect(await fwFleet($)).toMatch(/\| \? unknown \| `s1` \(this session\) \| repo \| .* \| two processes on one session \|/)
  })

  test('the tick sets contested when another process wrote our id since our last write, and clears it once the file is ours again', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    expect(rec(k)!.contested).toBe(false)
    await k.clock.advance(10000)
    k.w.outside[MY] = JSON.stringify(sessionRec({ sessionId: 's1', instance: 'sibling', state: 'working', heartbeatAt: k.clock.now() }))
    await k.clock.advance(20000) // the tick at +30 s
    expect(rec(k)).toMatchObject({ contested: true })
    expect(rec(k)!.instance).not.toBe('sibling')
    await k.clock.advance(30000) // the file is ours again
    expect(rec(k)).toMatchObject({ contested: false })
  })
})

describe('fleet: compact', () => {
  const MSGS = [{ role: 'user', text: 'x', toolUses: [], toolResults: [] }]
  test('a manual /compact while idle shows working, then idle again', async ($, on) => {
    const k = boot($, on)
    k.isHolding = true
    await start($, k)
    const done = ($.session.compact({ trigger: 'manual', messages: MSGS } as never) as Promise<unknown>)
    await settle(k)
    expect(rec(k)).toMatchObject({ state: 'working', why: 'compact' })
    await release(k)
    await done
    await settle(k)
    expect(rec(k)).toMatchObject({ state: 'idle', why: 'compact-done' })
  })

  test('a reload during a held manual /compact: the compaction is dropped, and the next turn ends idle', async ($, on) => {
    const k = boot($, on)
    k.isHolding = true
    await start($, k)
    const done = ($.session.compact({ trigger: 'manual', messages: MSGS } as never) as Promise<unknown>)
    await settle(k)
    expect(rec(k)).toMatchObject({ state: 'working', why: 'compact' })
    await start($, k) // the reload path
    await release(k)
    await done
    await settle(k)
    await turnStart($, k)
    await turnDone($, k, 'answer')
    expect(rec(k)).toMatchObject({ state: 'idle', why: 'turn.complete:answer' })
  })

  test('a compaction inside a working turn writes nothing extra', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    await turnStart($, k)
    const n = k.w.fleetWrites.length
    await $.session.compact({ trigger: 'auto', messages: MSGS } as never)
    await settle(k)
    expect(k.w.fleetWrites.length).toBe(n)
    expect(rec(k)).toMatchObject({ state: 'working', why: 'turn.start' })
  })

  test('precompute and subagent compactions write nothing', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    const n = k.w.fleetWrites.length
    await $.session.compact({ trigger: 'precompute', messages: MSGS } as never)
    await $.session.compact({ trigger: 'auto', agentId: 'agent-1', messages: MSGS } as never)
    await settle(k)
    expect(k.w.fleetWrites.length).toBe(n)
    expect(rec(k)!.state).toBe('idle')
  })
})

describe('fleet: privacy', () => {
  test('no prompt, command, question, tool_input, URL or outside path text ever reaches a file outside the repo', async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    k.dialog.add('WebFetch')
    k.isHolding = true
    const seen: string[] = []
    const snap = () => { for (const t of Object.values(k.w.outside)) seen.push(t) }
    await start($, k)
    await $.prompt.submit({ text: 'SECRET-P', wait: false, origin: { kind: 'composer' } } as never)
    await turnStart($, k, 'SECRET-P')
    snap()
    for (const input of [
      { tool: 'Bash', command: 'echo SECRET-C', description: 'SECRET-I' },
      { tool: 'AskUserQuestion', questions: [{ question: 'SECRET-Q', header: 'SECRET-Q', options: [] }] },
      { tool: 'WebFetch', url: 'https://SECRET-U', prompt: 'SECRET-P' },
      { tool: 'Edit', file_path: '/etc/SECRET-PATH', old_string: 'SECRET-C', new_string: 'SECRET-C' },
    ]) {
      const p = await call($, k, input)
      snap()
      await release(k)
      await p.done
      snap()
      await k.clock.advance(30000)
      snap()
    }
    await turnDone($, k, 'answer')
    await end($, k, 'other')
    snap()
    expect(seen.length).toBeGreaterThan(5)
    for (const t of seen) for (const s of ['SECRET-P', 'SECRET-C', 'SECRET-Q', 'SECRET-I', 'SECRET-U', 'SECRET-PATH']) expect(t).not.toContain(s)
    expect(k.w.writes).toEqual([])
  })
})

describe('fleet: safety', () => {
  test('HOME inside the repo: nothing written at all; /fw-mod says inside-repo', async ($, on) => {
    const k = boot($, on, {}, { env: { HOME: '/repo/home' } })
    await start($, k)
    await turnStart($, k)
    await k.clock.advance(60000)
    await end($, k, 'other')
    expect(k.w.fleetWrites).toEqual([])
    expect(k.w.writes).toEqual([])
    expect(await modLine($)).toContain('/repo/home/.flightwake is inside this repo, so nothing is written')
  })

  for (const [label, env] of [
    ['a relative FLIGHTWAKE_HOME', { FLIGHTWAKE_HOME: 'x', HOME: HOME_OUT }],
    ['an empty FLIGHTWAKE_HOME', { FLIGHTWAKE_HOME: '', HOME: HOME_OUT }],
    ['USERPROFILE (no HOME)', { USERPROFILE: HOME_OUT }],
  ] as const) {
    test(`${label} → the home folder is used`, async ($, on) => {
      const k = boot($, on, {}, { env })
      await start($, k)
      expect(k.w.fleetWrites).toEqual([MY])
      expect(k.w.writes).toEqual([])
    })
  }

  test('an absolute FLIGHTWAKE_HOME is used', async ($, on) => {
    const k = boot($, on, { fleetHome: '/fw' }, { env: { FLIGHTWAKE_HOME: '/fw/', HOME: HOME_OUT } })
    await start($, k)
    expect(k.w.fleetWrites).toEqual(['/fw/sessions/s1.json'])
    expect(fleetFile(k.w, 's1', '/fw/sessions')).toMatchObject({ state: 'idle' })
    expect(k.w.writes).toEqual([])
  })

  for (const [label, marker] of [
    ['the base is a flightwake records folder (a repo installed at $HOME)', '/home/u/.flightwake/STATE.md'],
    ['$HOME is a git repo', '/home/u/.git/HEAD'],
    ['a folder above $HOME is a git repo', '/home/.git/HEAD'],
  ] as const) {
    test(`${label} → other-repo, nothing written`, async ($, on) => {
      const k = boot($, on, { outside: { [marker]: 'x' } })
      await start($, k)
      await turnStart($, k)
      await k.clock.advance(60000)
      expect(k.w.fleetWrites).toEqual([])
      expect(k.w.writes).toEqual([])
      expect(await modLine($)).toContain('/home/u/.flightwake is a flightwake records folder or lies in a git repo, so nothing is written')
    })
  }

  test('FLIGHTWAKE_HOME pointing at a repo\'s .flightwake → other-repo, nothing written', async ($, on) => {
    const k = boot($, on, { fleetHome: '/code/other/.flightwake', outside: { '/code/other/.flightwake/STATE.md': 'x', '/code/other/.git/HEAD': 'x' } }, { env: { FLIGHTWAKE_HOME: '/code/other/.flightwake', HOME: HOME_OUT } })
    await start($, k)
    await k.clock.advance(30000)
    expect(k.w.fleetWrites).toEqual([])
    expect(k.w.outside['/code/other/.flightwake/sessions/s1.json']).toBeUndefined()
  })

  test('a /cd that puts the base inside the root: the next heartbeat writes nothing, /fw-mod says inside-repo', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    const n = k.w.fleetWrites.length
    k.w.root = '/home' // `/cd ~/..`: the root is now a parent of the base
    await turnStart($, k) // a change before any heartbeat: already refused
    await k.clock.advance(60000)
    expect(k.w.fleetWrites.length).toBe(n)
    expect(k.w.writes).toEqual([])
    expect(await modLine($)).toContain('/home/u/.flightwake is inside this repo, so nothing is written')
  })

  test('the sessions folder replaced by a link after start: the next heartbeat writes nothing through it', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    const n = k.w.fleetWrites.length
    k.w.links.push(FLEET_DIR)
    await k.clock.advance(30000)
    await turnStart($, k)
    expect(k.w.fleetWrites.length).toBe(n)
    expect(await modLine($)).toContain(`${FLEET_DIR} is a symbolic link; nothing is written through it`)
  })

  test('a symlinked sessions folder → symlink, nothing written', async ($, on) => {
    const k = boot($, on, { links: [FLEET_DIR] })
    await start($, k)
    expect(k.w.fleetWrites).toEqual([])
    expect(await modLine($)).toContain(`${FLEET_DIR} is a symbolic link; nothing is written through it`)
  })

  test('a link above the base that lands inside the root (seen by real path, not by spelling) → inside-repo, nothing written', async ($, on) => {
    const k = boot($, on, { links: ['/home/u/lnk'], aliases: { '/home/u/lnk': '/repo' } }, { env: { FLIGHTWAKE_HOME: '/home/u/lnk/fw', HOME: HOME_OUT } })
    await start($, k)
    await turnStart($, k)
    await k.clock.advance(60000)
    expect(k.w.fleetWrites).toEqual([])
    expect(k.w.writes).toEqual([])
    expect(await modLine($)).toContain('/home/u/lnk/fw is inside this repo, so nothing is written')
  })

  test('a flightwake root with no git above the base (a case alias or a link reaches it too) → other-repo', async ($, on) => {
    const k = boot($, on, { outside: { '/notes/.flightwake/STATE.md': 'x' } }, { env: { FLIGHTWAKE_HOME: '/notes/fw', HOME: HOME_OUT } })
    await start($, k)
    await k.clock.advance(30000)
    expect(k.w.fleetWrites).toEqual([])
    expect(k.w.writes).toEqual([])
    expect(await modLine($)).toContain('/notes/fw is a flightwake records folder or lies in a git repo, so nothing is written')
  })

  test('a relative HOME (and no FLIGHTWAKE_HOME) → no-home, nothing written', async ($, on) => {
    const k = boot($, on, {}, { env: { HOME: '../x' } })
    await start($, k)
    expect(k.w.fleetWrites).toEqual([])
    expect(k.w.writes).toEqual([])
    expect(await modLine($)).toContain('no home folder to write to (HOME / USERPROFILE unset or not absolute)')
  })

  test("the root's real path cannot be had (its stat refused) → inside-repo, nothing written (fail closed)", async ($, on) => {
    const a = boot($, on, { statDenied: ['/repo'] })
    await start($, a)
    expect(a.w.fleetWrites).toEqual([])
    expect(a.w.writes).toEqual([])
    expect(await modLine($)).toContain('/home/u/.flightwake is inside this repo, so nothing is written')
  })

  test('a marker probe that is refused counts as a repo → other-repo, nothing written', async ($, on) => {
    const k = boot($, on, { existsDenied: ['/home/.git'] })
    await start($, k)
    expect(k.w.fleetWrites).toEqual([])
    expect(await modLine($)).toContain('/home/u/.flightwake is a flightwake records folder or lies in a git repo, so nothing is written')
  })

  test('fs.stat of our file refused with EACCES: a link cannot be ruled out → symlink, the file untouched', async ($, on) => {
    const k = boot($, on, { statDenied: [MY] })
    const ours = JSON.stringify(sessionRec({ sessionId: 's1', state: 'ended', heartbeatAt: NOW - DAY, ended: { reason: 'other', at: NOW - DAY, stateAtEnd: 'idle' } }))
    k.w.outside[MY] = ours
    await start($, k)
    await k.clock.advance(30000)
    expect(k.w.fleetWrites).toEqual([])
    expect(k.w.outside[MY]).toBe(ours)
    expect(await modLine($)).toContain(`${MY} is a symbolic link; nothing is written through it`)
  })

  test('a foreign file put at our path after start: the next heartbeat leaves it untouched → foreign-file', async ($, on) => {
    const k = boot($, on)
    await start($, k)
    const n = k.w.fleetWrites.length
    k.w.outside[MY] = '{"name":"my fixture"}'
    await k.clock.advance(30000)
    await turnStart($, k)
    await k.clock.advance(60000)
    expect(k.w.fleetWrites.length).toBe(n)
    expect(k.w.outside[MY]).toBe('{"name":"my fixture"}')
    expect(await modLine($)).toContain(`${MY} is not a flightwake session file; left untouched`)
  })

  test('a foreign file at our path is left untouched → foreign-file', async ($, on) => {
    const k = boot($, on)
    k.w.outside[MY] = '{"hello":"mine"}'
    await start($, k)
    await turnStart($, k)
    await k.clock.advance(60000)
    expect(k.w.fleetWrites).toEqual([])
    expect(k.w.outside[MY]).toBe('{"hello":"mine"}')
    expect(await modLine($)).toContain(`${MY} is not a flightwake session file; left untouched`)
  })

  test('an id that cannot be a file name (../x) → bad-id, nothing written', async ($, on) => {
    const k = boot($, on, { sessionId: '../x' })
    await start($, k)
    expect(k.w.fleetWrites).toEqual([])
    expect(k.w.writes).toEqual([])
    expect(await modLine($)).toContain('this session id cannot be a file name')
  })

  test('a failing write never throws: /fw-mod shows write-failed; /fw-cost and the band are the same as without the failure', async ($, on) => {
    const k = boot($, on, { isFleetWriteFailing: true })
    await start($, k)
    await turnStart($, k)
    await turnDone($, k, 'answer')
    expect(k.w.fleetWrites).toEqual([])
    expect(await modLine($)).toMatch(/idle — the last write failed \(.+\); retried on the next change — nothing else is affected/)
    const cost = (await $.command.run(RUN('fw-cost'))).text as string
    const ui = await $.ui.mount(BAND)
    const band = (await ui.findAll({ type: 'Text' })).map((r: { text: string }) => r.text).join('')
    await ui.unmount()
    k.w.isFleetWriteFailing = false
    await k.clock.advance(30000) // the heartbeat retries and succeeds
    expect(k.w.fleetWrites).toEqual([MY])
    expect(await modLine($)).toMatch(/on — this session is reported as idle/)
    expect((await $.command.run(RUN('fw-cost'))).text).toBe(cost)
    const ui2 = await $.ui.mount(BAND)
    expect((await ui2.findAll({ type: 'Text' })).map((r: { text: string }) => r.text).join('')).toBe(band)
    await ui2.unmount()
    expect(k.w.writes).toEqual([])
  })
})

describe('fleet: resume hint', () => {
  test('a stale working record in this root → one toast with claude --resume', async ($, on) => {
    const k = boot($, on)
    seed(k, staleRec())
    k.w.outside[TRANSCRIPT('old1')] = '{}'
    await start($, k)
    expect(k.toasts).toEqual([])
    await k.clock.advance(1500)
    expect(k.toasts).toEqual(['flightwake: session old1 stopped unexpectedly 10m ago (was working) — /fw-fleet to resume it'])
    await k.clock.advance(60000)
    expect(k.toasts).toHaveLength(1)
  })

  test('an ended "other" record (zh-TW install) → the toast in zh-TW', async ($, on) => {
    const k = boot($, on, {}, { lang: 'zh-TW' })
    seed(k, staleRec({ state: 'ended', heartbeatAt: NOW - 3_600_000, ended: { reason: 'other', at: NOW - 3_600_000, stateAtEnd: 'blocked' } }))
    k.w.outside[TRANSCRIPT('old1')] = '{}'
    await start($, k)
    await k.clock.advance(1500)
    expect(k.toasts).toEqual(['flightwake:session old1 在 1h 前意外中斷(當時等你回覆)——/fw-fleet 有接回指令'])
  })

  test("launched elsewhere: /fw-fleet's command starts with cd '<launchCwd>' &&, a single quote escaped", async ($, on) => {
    const k = boot($, on)
    seed(k, staleRec({ launchCwd: '/repo/sub', transcript: TRANSCRIPT('old1', '-repo-sub') }))
    seed(k, staleRec({ sessionId: 'old2', heartbeatAt: NOW - 1_200_000, launchCwd: "/repo/it's", resume: { id: 'old2', resumable: true }, transcript: TRANSCRIPT('old2', '-repo-it-s') }))
    k.w.outside[TRANSCRIPT('old1', '-repo-sub')] = '{}'
    await start($, k)
    await k.clock.advance(1500)
    expect(k.toasts).toHaveLength(1)
    expect(k.toasts[0]).toContain('session old1 stopped')
    expect(await fwFleet($)).toContain("cd '/repo/sub' && claude --resume old1")
    expect(shq("/repo/it's")).toBe("'/repo/it'\\''s'")
  })

  test("the newest candidate's quoted command, when it is the one with a quote", async ($, on) => {
    const k = boot($, on)
    seed(k, staleRec({ launchCwd: "/repo/it's", transcript: TRANSCRIPT('old1', '-repo-it-s') }))
    k.w.outside[TRANSCRIPT('old1', '-repo-it-s')] = '{}'
    await start($, k)
    await k.clock.advance(1500)
    expect(k.toasts[0]).toContain('session old1 stopped')
    expect(await fwFleet($)).toMatch(/`cd '\/repo\/it'.*' && claude --resume old1`/)
  })

  const NOT_SHOWN: [string, (k: Knobs) => void, object?][] = [
    ['ended prompt_input_exit', (k) => seed(k, staleRec({ state: 'ended', ended: { reason: 'prompt_input_exit', at: NOW - 600000, stateAtEnd: 'idle' } }))],
    ['ended clear', (k) => seed(k, staleRec({ state: 'ended', ended: { reason: 'clear', at: NOW - 600000, stateAtEnd: 'idle' } }))],
    ['ended logout', (k) => seed(k, staleRec({ state: 'ended', ended: { reason: 'logout', at: NOW - 600000, stateAtEnd: 'idle' } }))],
    ['older than 7 days (file touched recently)', (k) => seed(k, staleRec({ heartbeatAt: NOW - 8 * DAY }), NOW - 1000)],
    ['another root', (k) => seed(k, staleRec({ root: '/elsewhere' }))],
    ['transcript missing', (k) => { seed(k, staleRec()); delete k.w.outside[TRANSCRIPT('old1')] }],
    ['resumable: false', (k) => seed(k, staleRec({ resume: { id: 'old1', resumable: false } }))],
    ['a newer sibling started after it was last seen', (k) => {
      seed(k, staleRec())
      seed(k, sessionRec({ sessionId: 'back', state: 'ended', startedAt: NOW - 300000, heartbeatAt: NOW - 200000, ended: { reason: 'prompt_input_exit', at: NOW - 200000, stateAtEnd: 'idle' } }))
    }],
    ['our own id', (k) => seed(k, staleRec({ sessionId: 's1', resume: { id: 's1', resumable: true }, transcript: TRANSCRIPT('s1') }))],
    ['a fresh live record', (k) => seed(k, staleRec({ heartbeatAt: NOW - 5000 }))],
    ['a contested record', (k) => seed(k, staleRec({ contested: true }))],
    ['a non-interactive current session', (k) => seed(k, staleRec()), { ...START, isInteractive: false }],
  ]
  for (const [label, arrange, startArgs] of NOT_SHOWN) {
    test(`no hint: ${label}`, async ($, on) => {
      const k = boot($, on)
      k.w.outside[TRANSCRIPT('old1')] = '{}'
      k.w.outside[TRANSCRIPT('s1')] = '{}'
      arrange(k)
      await start($, k, startArgs ?? START)
      await k.clock.advance(1500)
      expect(k.toasts).toEqual([])
    })
  }

  test('no hint on a reload (a second session.start)', async ($, on) => {
    const k = boot($, on)
    seed(k, staleRec())
    k.w.outside[TRANSCRIPT('old1')] = '{}'
    await start($, k)
    await k.clock.advance(1500)
    expect(k.toasts).toHaveLength(1)
    await start($, k)
    await k.clock.advance(1500)
    expect(k.toasts).toHaveLength(1)
  })
})

describe('fleet: /fw-fleet', () => {
  const stateCells = (out: string) => out.split('\n').filter((l) => /^\| [⛔●○◌–?]/.test(l)).map((l) => l.split(' | ')[0]!.slice(2))

  /** One record per group, plus our own idle one. */
  const seedAll = (k: Knobs) => {
    seed(k, sessionRec({ sessionId: 'blk00001', state: 'blocked', root: '/x/api', repoRoot: '/x/api', heartbeatAt: NOW - 4000, stateSince: NOW - 120000, blocked: { kind: 'permission', tool: 'Bash', target: null, agent: false, since: NOW - 120000 } }))
    seed(k, sessionRec({ sessionId: 'wrk00001', state: 'working', root: '/x/orca-feat', repoRoot: '/x/orca', heartbeatAt: NOW - 3000, stateSince: NOW - 12000, activity: { tool: 'Read', target: 'a.md', agent: true, at: NOW - 11000 } }))
    seed(k, sessionRec({ sessionId: 'idl00001', state: 'idle', root: '/x/web', heartbeatAt: NOW - 2000, stateSince: NOW - 300000, startedAt: NOW - 900000, lastTurn: { reason: 'answer', at: NOW - 300000, durationMs: 1 } }))
    seed(k, staleRec({ sessionId: 'stl00001', root: '/x/fw', heartbeatAt: NOW - 7_200_000, resume: { id: 'stl00001', resumable: true }, transcript: TRANSCRIPT('stl00001') }))
    k.w.outside[TRANSCRIPT('stl00001')] = '{}'
    seed(k, sessionRec({ sessionId: 'end00001', state: 'ended', root: '/x/web', heartbeatAt: NOW - DAY, resume: { id: 'end00001', resumable: true }, transcript: TRANSCRIPT('end00001'), ended: { reason: 'prompt_input_exit', at: NOW - DAY, stateAtEnd: 'idle' } }))
    seed(k, sessionRec({ sessionId: 'end00002', state: 'ended', root: '/x/web', heartbeatAt: NOW - 2 * DAY, resume: { id: 'end00002', resumable: true }, transcript: TRANSCRIPT('end00002'), ended: { reason: 'other', at: NOW - 2 * DAY, stateAtEnd: 'working' } }))
    k.w.outside[TRANSCRIPT('end00002')] = '{}'
    seed(k, sessionRec({ sessionId: 'unk00001', schema: 'flightwake.session/2', state: 'idle', heartbeatAt: NOW - 1000 }))
  }

  test('groups in order, the this-session mark, details, and resume cells only for resumable rows with a transcript', async ($, on) => {
    const k = boot($, on)
    seedAll(k)
    await start($, k)
    const out = await fwFleet($)
    expect(stateCells(out)).toEqual(['⛔ blocked', '● working', '○ idle', '○ idle', '◌ stale', '– ended', '– ended', '? unknown'])
    expect(out).toContain('**4 live · ⛔ 1 blocked · 2 resumable** — ~/.flightwake/sessions (last 7 days)')
    expect(out).toContain('| state | session | repo | for | detail |')
    expect(out).toContain('| ⛔ blocked | `blk00001` | api | 2m | permission · Bash |')
    expect(out).toContain('| ● working | `wrk00001` | orca ⎇ orca-feat | 12s | Read a.md (subagent) |')
    expect(out).toContain('| ○ idle | `idl00001` | web | 5m | answered |')
    expect(out).toContain('| ○ idle | `s1` (this session) | repo | 0s | just started |')
    expect(out).toContain("| ◌ stale | `stl00001` | fw | 2h | no heartbeat (was working) — crashed or asleep? · `cd '/x/fw' && claude --resume stl00001` |")
    expect(out).toContain('| – ended | `end00001` | web | 24h | exited |') // resumable, but its transcript is gone
    expect(out).toContain("| – ended | `end00002` | web | 2d | closed or killed · `cd '/x/web' && claude --resume end00002` |")
    expect(out).toContain('| ? unknown | `unk00001` |')
    expect(out).toContain('unknown format')
    expect(out).toContain('Read-only: /fw-fleet changes nothing. `npx flightwake fleet --prune` removes ended/stale files older than 7 days.')
    // other sessions' transcripts: whether they exist, never what they say
    expect(k.w.reads).toContain(TRANSCRIPT('stl00001'))
    expect(k.w.reads).toContain(TRANSCRIPT('end00002'))
    expect(k.w.contentReads.filter((p) => p.startsWith(`${HOME_OUT}/.claude/projects/`) && !p.endsWith('/s1.jsonl'))).toEqual([])
    expect(k.w.writes).toEqual([])
  })

  test('a normal /exit (prompt_input_exit) with its transcript present is offered for resume too (the hint is not)', async ($, on) => {
    const k = boot($, on)
    seed(k, sessionRec({ sessionId: 'exit0001', state: 'ended', root: '/x/web', heartbeatAt: NOW - 3_600_000, turns: 2, resume: { id: 'exit0001', resumable: true }, transcript: TRANSCRIPT('exit0001'), ended: { reason: 'prompt_input_exit', at: NOW - 3_600_000, stateAtEnd: 'idle' } }))
    k.w.outside[TRANSCRIPT('exit0001')] = '{}'
    await start($, k)
    await k.clock.advance(1500)
    expect(k.toasts).toEqual([])
    const out = await fwFleet($)
    expect(out).toContain("| – ended | `exit0001` | web | 1h | exited · `cd '/x/web' && claude --resume exit0001` |")
    expect(out).toContain('1 resumable')
  })

  test("a transcript path that is not this session's Claude transcript is never looked at (hint, resume cell)", async ($, on) => {
    const k = boot($, on)
    seed(k, staleRec({ transcript: '/Users/k/secret/x' }))
    seed(k, staleRec({ sessionId: 'old2', heartbeatAt: NOW - 500000, resume: { id: 'old2', resumable: true }, transcript: TRANSCRIPT('old1') }))
    seed(k, staleRec({ sessionId: 'old3', heartbeatAt: NOW - 400000, resume: { id: 'old3', resumable: true }, transcript: `${HOME_OUT}/.claude/projects/../../../Users/k/old3.jsonl` }))
    k.w.outside['/Users/k/secret/x'] = '{}'
    k.w.outside[TRANSCRIPT('old1')] = '{}'
    await start($, k)
    await k.clock.advance(1500)
    expect(k.toasts).toEqual([])
    const out = await fwFleet($)
    expect(out).not.toContain('claude --resume')
    expect(k.w.reads).not.toContain('/Users/k/secret/x')
    expect(k.w.reads).not.toContain(TRANSCRIPT('old1'))
    expect(k.w.reads.filter((p) => p.endsWith('old3.jsonl'))).toEqual([])
  })

  test('stale boundary: exactly staleAfter is not stale, +1 ms is', async ($, on) => {
    const k = boot($, on)
    seed(k, sessionRec({ sessionId: 'edge0000', state: 'working', heartbeatAt: NOW - 120000 }))
    seed(k, sessionRec({ sessionId: 'edge0001', state: 'blocked', heartbeatAt: NOW - 120001, blocked: { kind: 'question', tool: 'AskUserQuestion', target: null, agent: false, since: NOW - 200000 } }))
    await start($, k)
    const out = await fwFleet($)
    expect(out).toMatch(/\| ● working \| `edge0000` \|/)
    expect(out).toMatch(/\| ◌ stale \| `edge0001` \| .* no heartbeat \(was blocked\)/)
    expect(out).not.toMatch(/⛔ blocked \| `edge0001`/)
  })

  test('torn JSON → the unreadable line; a /2 schema → unknown', async ($, on) => {
    const k = boot($, on)
    seed(k, sessionRec({ sessionId: 'v2000000', schema: 'flightwake.session/2', state: 'working', heartbeatAt: NOW - 1000 }))
    k.w.outside[`${FLEET_DIR}/torn.json`] = '{"schema":"flightwake.session/1","sta'
    k.w.mtimes[`${FLEET_DIR}/torn.json`] = NOW - 1000
    await start($, k)
    const out = await fwFleet($)
    expect(out).toContain('1 file(s) could not be read (being written, or damaged).')
    expect(out).toMatch(/\| \? unknown \| `v2000000` \| repo \| .* \| unknown format \|/)
  })

  test('files older than 7 days are never read; `all` widens to 30 days', async ($, on) => {
    const k = boot($, on)
    const old = `${FLEET_DIR}/old00001.json`
    const ancient = `${FLEET_DIR}/anc00001.json`
    seed(k, sessionRec({ sessionId: 'old00001', state: 'ended', heartbeatAt: NOW - 10 * DAY, ended: { reason: 'prompt_input_exit', at: NOW - 10 * DAY, stateAtEnd: 'idle' } }), NOW - 10 * DAY)
    seed(k, sessionRec({ sessionId: 'anc00001', state: 'ended', heartbeatAt: NOW - 40 * DAY, ended: { reason: 'prompt_input_exit', at: NOW - 40 * DAY, stateAtEnd: 'idle' } }), NOW - 40 * DAY)
    await start($, k)
    const out = await fwFleet($)
    expect(k.w.reads).not.toContain(old)
    expect(k.w.reads).not.toContain(ancient)
    expect(out).not.toContain('old00001')
    expect(out).toContain('2 older ended file(s) hidden — `/fw-fleet all` shows 30 days.')
    const all = await fwFleet($, 'all')
    expect(k.w.reads).toContain(old)
    expect(k.w.reads).not.toContain(ancient)
    expect(all).toContain('`old00001`')
    expect(all).toContain('(last 30 days)')
  })

  test('more than 10 ended rows: the rest are counted as hidden', async ($, on) => {
    const k = boot($, on)
    for (let i = 0; i < 12; i++) {
      seed(k, sessionRec({ sessionId: `e${String(i).padStart(7, '0')}`, state: 'ended', heartbeatAt: NOW - (i + 1) * 60000, ended: { reason: 'prompt_input_exit', at: NOW - (i + 1) * 60000, stateAtEnd: 'idle' } }))
    }
    await start($, k)
    const out = await fwFleet($)
    expect(stateCells(out).filter((s) => s === '– ended')).toHaveLength(10)
    expect(out).toContain('2 older ended file(s) hidden')
    expect(stateCells(await fwFleet($, 'all')).filter((s) => s === '– ended')).toHaveLength(12)
  })

  test('a | in a root is escaped in its cell', async ($, on) => {
    const k = boot($, on)
    seed(k, sessionRec({ sessionId: 'pipe0000', state: 'idle', root: '/x/a|b', repoRoot: null, heartbeatAt: NOW - 1000 }))
    await start($, k)
    expect(await fwFleet($)).toContain('| `pipe0000` | a\\|b |')
  })

  for (const [lang, header, summary] of [
    ['zh-TW', '| 狀態 | session | repo | 持續 | 細節 |', '**2 個進行中 · ⛔ 1 個等你回覆** — ~/.flightwake/sessions(近 7 天)'],
    ['ja', '| 状態 | セッション | repo | 経過 | 詳細 |', '**稼働 2 · ⛔ 応答待ち 1** — ~/.flightwake/sessions(直近 7 日)'],
  ] as const) {
    test(`${lang}: header, summary, state words and the footer`, async ($, on) => {
      const k = boot($, on, {}, { lang })
      seed(k, sessionRec({ sessionId: 'blk00001', state: 'blocked', heartbeatAt: NOW - 1000, blocked: { kind: 'plan', tool: 'ExitPlanMode', target: null, agent: false, since: NOW - 60000 } }))
      await start($, k)
      const out = await fwFleet($)
      expect(out).toContain(header)
      expect(out).toContain(summary)
      expect(out).toContain(`| ${T.st[lang].blocked} | \`blk00001\` | repo | 1m | ${T.kind[lang].plan} · ExitPlanMode |`)
      expect(out).toContain(`\`s1\`${T.this[lang]}`)
      expect(out).toContain(T.footer[lang])
    })
  }

  test('the empty message (nothing reported; this session not reporting)', async ($, on) => {
    const k = boot($, on)
    await start($, k, { ...START, isInteractive: false })
    const out = await fwFleet($)
    expect(out).toContain('No session has reported in the last 7 days. A file appears in ~/.flightwake/sessions when an interactive session with flightwake-mod 0.2.0+ starts.')
    expect(out).toContain('This session is not reporting: a -p / SDK run: nothing to report')
    expect(out).toContain('Read-only: /fw-fleet changes nothing.')
  })

  test('no home at all: cannot locate the folder', async ($, on) => {
    const k = boot($, on, {}, { env: {} })
    await start($, k)
    expect(await fwFleet($)).toContain('/fw-fleet: cannot locate the sessions folder (HOME / USERPROFILE unset or not absolute).')
    expect(k.w.fleetWrites).toEqual([])
  })

  test('not installed here: /fw-fleet is not registered and nothing is written', async ($, on) => {
    const k = boot($, on, { files: {} })
    await start($, k)
    expect(k.registered).not.toContain('fw-fleet')
    await k.clock.advance(60000)
    expect(k.w.fleetWrites).toEqual([])
  })
})

describe('fleet: /fw-mod', () => {
  const ON: Record<Lang, string> = { en: 'on', 'zh-TW': '開啟', 'zh-CN': '开启', ja: 'オン' }
  const OFF: Record<Lang, string> = { en: 'off', 'zh-TW': '關閉', 'zh-CN': '关闭', ja: 'オフ' }
  const OTHERS: Record<Lang, string> = { en: ' · others: 1 live, 1 blocked', 'zh-TW': '· 其他:1 個進行中、1 個等你回覆', 'zh-CN': '· 其他:1 个进行中、1 个等你回复', ja: '· 他:稼働 1、応答待ち 1' }
  for (const lang of LANGS) {
    test(`on (${lang}): label, on, the reported state and file; after a tick the others clause`, async ($, on) => {
      const k = boot($, on, {}, { lang })
      seed(k, sessionRec({ sessionId: 'blk00001', state: 'blocked', heartbeatAt: NOW, blocked: { kind: 'permission', tool: 'Bash', target: null, agent: false, since: NOW } }), NOW)
      await start($, k)
      const head = `- **${T.label[lang]}** (\`fleet\`): ${ON[lang]} — `
      const file = '~/.flightwake/sessions/s1….json'
      const l0 = await modLine($)
      expect(l0).toBe(`${head}${T.modActive[lang]({ st: T.word[lang].idle, file, others: null })}`)
      expect(l0).not.toContain(OTHERS[lang])
      await k.clock.advance(30000)
      const l1 = await modLine($)
      expect(l1).toBe(`${head}${T.modActive[lang]({ st: T.word[lang].idle, file, others: { live: 1, b: 1 } })}`)
      expect(l1).toContain(OTHERS[lang])
    })

    test(`off (${lang}): how to turn it on`, { options: { fleet: false } }, async ($, on) => {
      const k = boot($, on, {}, { lang })
      await start($, k)
      const l = await modLine($)
      expect(l.startsWith(`- **${T.label[lang]}** (\`fleet\`): ${OFF[lang]} — `)).toBe(true)
      expect(l).toContain('"fleet": true')
    })
  }

  test('on: the reported state and file; after a tick, the other sessions', async ($, on) => {
    const k = boot($, on)
    seed(k, sessionRec({ sessionId: 'blk00001', state: 'blocked', heartbeatAt: NOW, blocked: { kind: 'permission', tool: 'Bash', target: null, agent: false, since: NOW } }), NOW)
    await start($, k)
    expect(await modLine($)).toBe('- **session fleet** (`fleet`): on — this session is reported as idle in ~/.flightwake/sessions/s1….json (heartbeat 30 s; never prompt or command text)')
    await k.clock.advance(30000)
    expect(await modLine($)).toBe('- **session fleet** (`fleet`): on — this session is reported as idle in ~/.flightwake/sessions/s1….json (heartbeat 30 s; never prompt or command text) · others: 1 live, 1 blocked — /fw-fleet lists them')
  })

  test('off: how to turn it on', { options: { fleet: false } }, async ($, on) => {
    const k = boot($, on)
    await start($, k)
    expect(await modLine($)).toMatch(/^- \*\*session fleet\*\* \(`fleet`\): off — .*"fleet": true/)
  })

  type Case = { reason: string; init?: Partial<World>; env?: Record<string, string>; startArgs?: object; text: (lang: Lang) => string }
  const CASES: Case[] = [
    { reason: 'no-home', env: {}, text: (l) => T.why[l]['no-home'] },
    { reason: 'not-interactive', startArgs: { ...START, isInteractive: false }, text: (l) => T.why[l]['not-interactive'] },
    { reason: 'inside-repo', env: { HOME: '/repo/home' }, text: (l) => T.why[l]['inside-repo']('/repo/home/.flightwake') },
    { reason: 'other-repo', init: { outside: { '/home/u/.flightwake/STATE.md': 'x' } }, text: (l) => T.why[l]['other-repo']('/home/u/.flightwake') },
    { reason: 'symlink', init: { links: [FLEET_DIR] }, text: (l) => T.why[l].symlink(FLEET_DIR) },
    { reason: 'foreign-file', init: { outside: { [MY]: 'not ours' } }, text: (l) => T.why[l]['foreign-file'](MY) },
    { reason: 'bad-id', init: { sessionId: '../x' }, text: (l) => T.why[l]['bad-id'] },
    { reason: 'write-failed', init: { isFleetWriteFailing: true }, text: () => '' },
  ]
  const IDLE: Record<Lang, string> = { en: 'idle', 'zh-TW': '閒置', 'zh-CN': '闲置', ja: '待機' }
  for (const lang of LANGS) {
    for (const c of CASES) {
      test(`idle reason ${c.reason} (${lang})`, async ($, on) => {
        const k = boot($, on, c.init ?? {}, { lang, ...(c.env ? { env: c.env } : {}) })
        await start($, k, c.startArgs ?? START)
        const lineText = await modLine($)
        expect(lineText.startsWith(`- **${T.label[lang]}** (\`fleet\`): ${IDLE[lang]} — `)).toBe(true)
        if (c.reason === 'write-failed') expect(lineText).toContain(T.why[lang]['write-failed']('').split('()')[0]!)
        else expect(lineText.endsWith(c.text(lang))).toBe(true)
        expect(k.w.fleetWrites).toEqual([])
        expect(k.w.writes).toEqual([])
      })
    }
  }
  test('the literal en and zh-TW wording of two reasons', () => {
    expect(T.why.en['not-interactive']).toBe('a -p / SDK run: nothing to report')
    expect(T.why['zh-TW']['inside-repo']('/r/h')).toBe('/r/h 在這個 repo 裡,所以不寫;請把 FLIGHTWAKE_HOME 設成 repo 外的絕對路徑')
    expect(T.why.ja['write-failed']('EACCES')).toBe('前回の書き込みに失敗(EACCES)。次の変化で再試行——他の機能には影響なし')
    expect(T.why['zh-CN'].symlink('/p')).toBe('/p 是符号链接;不通过它写入')
  })
})

describe('fleet: switch off', () => {
  test('{ fleet: false }: no /fw-fleet, no file, no timer', { options: { fleet: false } }, async ($, on) => {
    const k = boot($, on)
    k.dialog.add('Bash')
    await start($, k)
    await turnStart($, k)
    await $.tool.call({ tool: 'Bash', command: 'x' })
    await k.clock.advance(120000)
    await end($, k, 'other')
    expect(k.registered).not.toContain('fw-fleet')
    expect(k.w.fleetWrites).toEqual([])
    expect(k.w.writes).toEqual([])
    expect(k.state.get('fleet')).toBeUndefined()
    expect(k.w.reads.filter((p) => p.startsWith(FLEET_DIR))).toEqual([])
  })
})

describe('fleet: pure helpers', () => {
  const R = (over: Record<string, unknown>) => sessionRec(over) as unknown as SessionRec

  test('fleetBase: absolute FLIGHTWAKE_HOME, a Windows drive, empty / relative ignored, HOME, USERPROFILE, a relative home, none', () => {
    expect(fleetBase({ FLIGHTWAKE_HOME: '/fw/', HOME: '/h' })).toBe('/fw')
    expect(fleetBase({ FLIGHTWAKE_HOME: 'C:\\fw\\', HOME: '/h' })).toBe('C:\\fw')
    expect(fleetBase({ FLIGHTWAKE_HOME: 'D:/fw' })).toBe('D:/fw')
    expect(fleetBase({ FLIGHTWAKE_HOME: '', HOME: '/h/' })).toBe('/h/.flightwake')
    expect(fleetBase({ FLIGHTWAKE_HOME: 'rel/x', HOME: '/h' })).toBe('/h/.flightwake')
    expect(fleetBase({ HOME: '', USERPROFILE: 'C:\\Users\\k' })).toBe('C:\\Users\\k/.flightwake')
    expect(fleetBase({})).toBeNull()
    expect(fleetBase({ FLIGHTWAKE_HOME: 'x' })).toBeNull()
    expect(fleetBase({ HOME: '../x' })).toBeNull() // a relative home would resolve against the working directory
    expect(fleetBase({ HOME: '', USERPROFILE: 'Users\\k' })).toBeNull()
    expect(fleetBase({ FLIGHTWAKE_HOME: '/fw', HOME: 'rel' })).toBe('/fw')
  })

  test('isSafeId', () => {
    for (const ok of ['s1', '8f3c2a1e-1b2c-4d5e-9f00-112233445566', 'a.b_c-d', 'x'.repeat(128)]) expect(isSafeId(ok)).toBe(true)
    for (const bad of ['', '../x', '.hidden', '-x', 'a/b', 'a b', 'x'.repeat(129), 'a\\b', 7, null]) expect(isSafeId(bad)).toBe(false)
  })

  test('displayOf: stale boundary, clock skew, contested, unknown state and schema', () => {
    expect(staleAfter({ heartbeatMs: 30000 })).toBe(120000)
    expect(staleAfter({ heartbeatMs: 1 })).toBe(90000)
    expect(staleAfter({ heartbeatMs: 10 ** 9 })).toBe(2_400_000)
    expect(staleAfter({})).toBe(120000)
    expect(displayOf(R({ state: 'working', heartbeatAt: NOW - 120000 }), NOW)).toBe('working')
    expect(displayOf(R({ state: 'working', heartbeatAt: NOW - 120001 }), NOW)).toBe('stale')
    expect(displayOf(R({ state: 'blocked', heartbeatAt: NOW - 120001 }), NOW)).toBe('stale')
    expect(displayOf(R({ state: 'idle', heartbeatAt: NOW + 60000 }), NOW)).toBe('idle')
    expect(displayOf(R({ state: 'idle', heartbeatAt: NOW + 60001 }), NOW)).toBe('unknown')
    expect(displayOf(R({ state: 'idle', heartbeatAt: NOW, contested: true }), NOW)).toBe('unknown')
    expect(displayOf(R({ state: 'sleeping', heartbeatAt: NOW }), NOW)).toBe('unknown')
    expect(displayOf(R({ schema: 'flightwake.session/2', state: 'idle', heartbeatAt: NOW }), NOW)).toBe('unknown')
    expect(displayOf(R({ state: 'ended', heartbeatAt: NOW - 30 * DAY, ended: { reason: 'other', at: NOW - 30 * DAY, stateAtEnd: 'idle' } }), NOW)).toBe('ended')
  })

  test('resumableOf / uncleanOf', () => {
    const ended = (reason: string, resumable = true) => R({ state: 'ended', heartbeatAt: NOW - 1000, resume: { id: 'x1', resumable }, ended: { reason, at: NOW - 1000, stateAtEnd: 'idle' } })
    expect(resumableOf(ended('prompt_input_exit'), NOW)).toBe(true)
    expect(resumableOf(ended('other'), NOW)).toBe(true)
    expect(resumableOf(ended('clear'), NOW)).toBe(false)
    expect(resumableOf(ended('resume'), NOW)).toBe(false)
    expect(resumableOf(ended('other', false), NOW)).toBe(false)
    expect(resumableOf(R({ state: 'working', heartbeatAt: NOW - 200000, resume: { id: 'x1', resumable: true } }), NOW)).toBe(true)
    expect(resumableOf(R({ state: 'working', heartbeatAt: NOW - 1000, resume: { id: 'x1', resumable: true } }), NOW)).toBe(false)
    expect(resumableOf(R({ state: 'working', heartbeatAt: NOW - 200000, resume: { id: '$(rm -rf ~)', resumable: true } }), NOW)).toBe(false)
    expect(uncleanOf(ended('other'), NOW)).toBe(true)
    expect(uncleanOf(ended('prompt_input_exit'), NOW)).toBe(false)
    expect(uncleanOf(R({ state: 'idle', heartbeatAt: NOW - 200000 }), NOW)).toBe(true)
    expect(uncleanOf(R({ state: 'idle', heartbeatAt: NOW - 1000 }), NOW)).toBe(false)
  })

  test('pickHint: newest unclean candidate with a transcript; one-time through a newer sibling', () => {
    const me = { id: 'me', root: '/repo' }
    const a = R({ sessionId: 'a', state: 'working', heartbeatAt: NOW - 600000, startedAt: NOW - DAY, resume: { id: 'a', resumable: true }, transcript: '/t/a' })
    const b = R({ sessionId: 'b', state: 'working', heartbeatAt: NOW - 300000, startedAt: NOW - DAY, resume: { id: 'b', resumable: true }, transcript: '/t/b' })
    expect(pickHint([a, b], me, NOW, new Set(['/t/a', '/t/b']))?.sessionId).toBe('b')
    expect(pickHint([a, b], me, NOW, new Set(['/t/a']))?.sessionId).toBe('a')
    expect(pickHint([a, b], me, NOW, new Set())).toBeNull()
    const back = R({ sessionId: 'c', state: 'idle', heartbeatAt: NOW, startedAt: NOW - 100000 })
    expect(pickHint([a, b, back], me, NOW, new Set(['/t/a', '/t/b']))).toBeNull()
    // our own record starting later does not count as "someone came back"
    expect(pickHint([a, R({ sessionId: 'me', state: 'idle', heartbeatAt: NOW, startedAt: NOW })], me, NOW, new Set(['/t/a']))?.sessionId).toBe('a')
  })

  test('fmtAge, shq, targetOf', () => {
    expect([0, 45_000, 60_000, 12 * 60_000, 3 * 3_600_000, 47 * 3_600_000, 48 * 3_600_000, 5 * DAY].map(fmtAge)).toEqual(['0s', '45s', '1m', '12m', '3h', '47h', '2d', '5d'])
    expect(shq('/a b')).toBe("'/a b'")
    expect(shq("it's")).toBe("'it'\\''s'")
    expect(targetOf('Edit', { file_path: '/repo/src/a.ts' }, '/repo')).toBe('src/a.ts')
    expect(targetOf('NotebookEdit', { notebook_path: '/repo/n.ipynb' }, '/repo')).toBe('n.ipynb')
    expect(targetOf('Read', { file_path: '/etc/passwd' }, '/repo')).toBeNull()
    expect(targetOf('Write', { file_path: 'rel/x' }, '/repo')).toBeNull()
    for (const tool of ['Bash', 'WebFetch', 'WebSearch', 'mcp__x__y', 'AskUserQuestion', 'ExitPlanMode', 'Grep']) {
      expect(targetOf(tool, { file_path: '/repo/a', command: '/repo/a', url: '/repo/a' }, '/repo')).toBeNull()
    }
  })

  test('every F7 message table has exactly the four language keys', () => {
    for (const [name, table] of Object.entries(T)) {
      expect([name, Object.keys(table).sort()]).toEqual([name, ['en', 'ja', 'zh-CN', 'zh-TW']])
    }
  })
})
