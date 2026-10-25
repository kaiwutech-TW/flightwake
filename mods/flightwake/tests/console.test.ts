// F8 fleet console: inside Orca the side panel lists every agent terminal Orca has (Claude and Codex), by repo, with
// "go" and a confirmed "wrap up" per agent. The test's `orca` answers stand for Orca's CLI.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cleanTitle, composerOf, contextBar, draftOf, groupByRepo, parseTerminalList, SUBMIT_CHECK_MS, termState, wrapUpCommand } from '../hooks/lib/orca'
import type { OrcaTerm } from '../hooks/lib/orca'
import { gitBehind, installWorld, MARKER, STATE_FILLED } from './world'
import type { World } from './world'

const NOW = 1_800_000_000_000
const BIN = '/Applications/Orca.app/Contents/Resources/bin'
const PANE = { plugin: 'flightwake-mod', component: 'Pane', requestId: 'flightwake' } as const
const PROPS = { title: 'flightwake', isFocused: false, bodyColumns: 70, placement: 'dock' } as never
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const COMPOSER = { kind: 'composer' } as never

const term = (handle: string, agent: string | null, title: string, path: string, ago: number | null) => ({
  handle, ptyId: `p-${handle}`, worktreePath: path, title, connected: true, writable: true, orphaned: false,
  ...(ago === null ? {} : { lastOutputAt: NOW - ago }), ...(agent === null ? {} : { agentIdentity: agent }),
})
const LIST = [
  term('term_self', 'claude', '◐ me', '/repo', 100),
  term('term_a', 'claude', '✳ Review docs', '/repo', 60000),
  term('term_b', 'codex', '[ . ] Action Required | Run $fw-coldstart | other', '/work/other', 1000),
  term('term_c', 'codex', 'Ship the app | other', '/work/other', 120000),
  term('term_sh', null, 'Terminal 1', '/repo', 5000),
]
const listJson = (terms: unknown[]) => JSON.stringify({ id: 'x', ok: true, result: { terminals: terms } })

type Knobs = { store: Map<string, unknown>; open: Set<string> }

function engine(on: On): Knobs {
  const k: Knobs = { store: new Map(), open: new Set() }
  on('store.get', (_$, e) => ({ value: k.store.get(e.key) }))
  on('store.set', (_$, e) => { k.store.set(e.key, e.value); return { value: undefined } })
  on('ui.open', (_$, e) => { k.open.add(e.id); return { value: { isPlaced: true } } })
  on('ui.close', (_$, e) => { k.open.delete(e.id); return { value: undefined } })
  on('ui.panes', () => ({ value: [...k.open].map((id) => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }) as never)
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({ text: 'engine: unknown command' }))
  on('session.start', () => ({ cwd: '/repo' }))
  on('turn.complete', () => ({ text: '' }))
  on('session.turns', () => ({ value: 2 }))
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { window: 200000, percent: 30 } } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine-pane'] }) as never)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }) as never)
  return k
}

/** A repo with flightwake, inside Orca, whose `orca` answers `list` (and records switch / send). */
function orcaWorld(on: On, list: unknown[] = LIST, extra: Partial<World> = {}): World {
  const w = installWorld(on, {
    files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER('en') },
    git: gitBehind(0),
    outside: {
      '/work/other/.flightwake/STATE.md': STATE_FILLED.replace('health: green', 'health: yellow'),
      '/work/other/AGENTS.md': '<!-- flightwake:begin v0.15.0 lang=en -->\nx\n<!-- flightwake:end -->\n',
    },
    ...extra,
  })
  w.orca = (args) => {
    const a = args.join(' ')
    if (a === 'terminal list --json') return { exitCode: 0, stdout: listJson(list) }
    if (a.startsWith('terminal switch') || a.startsWith('terminal send')) return { exitCode: 0, stdout: '{"ok":true}' }
    const read = /^terminal read --terminal (\S+) --screen --json$/.exec(a)
    if (read) return { exitCode: 0, stdout: readJson(drafts[read[1] as string]) }
    return { exitCode: 1, stdout: '' }
  }
  return w
}

/** What each terminal's composer holds after the wrap-up send (Codex's skill picker keeps `$fw-record` there). */
const drafts: Record<string, string | undefined> = { term_c: '$fw-record' }
const readJson = (draft?: string) => JSON.stringify({ id: 'x', ok: true, result: { terminal: { tail: ['›'], ...(draft === undefined ? {} : { draft }) } } })

const inOrca = (on: On) => mock.env(on, { ORCA_TERMINAL_HANDLE: 'term_self', ORCA_CLI_BIN_DIR: BIN })
const panel = async ($: any, args = ''): Promise<string> => (await $.command.run({ command: 'fw-panel', args, origin: COMPOSER })).text ?? ''

describe('console: pure helpers', () => {
  test('parseTerminalList keeps agent terminals only; bad JSON is null', async () => {
    const t = parseTerminalList(listJson(LIST))
    expect(t?.map((x) => x.handle)).toEqual(['term_self', 'term_a', 'term_b', 'term_c'])
    expect(parseTerminalList('not json')).toBeNull()
    expect(parseTerminalList(listJson([{ ...term('bad handle', 'claude', 'x', '/r', 1) }]))).toEqual([])
  })

  test('termState and cleanTitle read the agents own marks', async () => {
    const t = parseTerminalList(listJson(LIST)) as OrcaTerm[]
    const [self, a, b, c] = t as [OrcaTerm, OrcaTerm, OrcaTerm, OrcaTerm]
    expect([termState(self, NOW), termState(a, NOW), termState(b, NOW), termState(c, NOW)]).toEqual(['working', 'idle', 'blocked', 'idle'])
    expect([cleanTitle(a), cleanTitle(b), cleanTitle(c)]).toEqual(['Review docs', 'Run $fw-coldstart', 'Ship the app'])
    expect(termState({ ...c, lastOutputAt: NOW - 2000 }, NOW)).toBe('working')
  })

  test('wrapUpCommand, contextBar, groupByRepo', async () => {
    expect([wrapUpCommand('claude'), wrapUpCommand('codex'), wrapUpCommand('pi')]).toEqual(['/fw-record', '$fw-record', null])
    expect([draftOf(readJson(' $fw-record ')), draftOf(readJson()), draftOf(readJson('  ')), draftOf('nope'), draftOf(null)]).toEqual(['$fw-record', null, null, null, null])
    // an empty composer ('') is an answer; no draft field, no JSON, no output are not
    expect([composerOf(readJson(' $fw-record ')), composerOf(readJson('  ')), composerOf(readJson()), composerOf('nope'), composerOf(null)]).toEqual(['$fw-record', '', null, null, null])
    expect(contextBar(85, 10)).toEqual({ filled: '█'.repeat(9), empty: '░', color: 'red' })
    expect(contextBar(30, 10).color).toBe('green')
    const t = parseTerminalList(listJson(LIST)) as OrcaTerm[]
    const g = groupByRepo(t.map((x) => ({ term: x, state: termState(x, NOW) })))
    expect(g.map((x) => x.path)).toEqual(['/work/other', '/repo'])
    expect(g[0]?.rows.map((r) => r.term.handle)).toEqual(['term_b', 'term_c'])
  })
})

describe('console: inside Orca', () => {
  test('lists every agent by repo, reads the other repo read-only, flags its version', async ($, on) => {
    const w = orcaWorld(on)
    engine(on)
    inOrca(on)
    mock.clock(on, { now: NOW })
    await $.session.start(START)
    await panel($)
    expect(w.orcaCalls).toContain(`${BIN}/orca terminal list --json`)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /^Fleet$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Codex · Run \$fw-coldstart · waiting on you/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Codex · Ship the app · idle 2m$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Claude · Review docs · idle 1m$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Claude · this session · working/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Terminal 1/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /v0\.15\.0 ≠ 0\.14\.0/ })).toBeDefined()
    expect(w.writes).toEqual([])
    await ui.unmount()
  })

  test('"go" switches to that tab; no buttons on this session; no wrap-up for a blocked agent', async ($, on) => {
    const w = orcaWorld(on)
    engine(on)
    inOrca(on)
    mock.clock(on, { now: NOW })
    await $.session.start(START)
    await panel($)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    expect(await ui.find({ key: 'go-term_self' } as never)).toBeUndefined()
    expect(await ui.find({ key: 'wrap-term_b' } as never)).toBeUndefined()
    expect(await ui.find({ key: 'go-term_b' } as never)).toBeDefined()
    await ui.press({ key: 'go-term_b' } as never)
    expect(w.orcaCalls).toContain(`${BIN}/orca terminal switch --terminal term_b --json`)
    await ui.unmount()
  })

  test('"wrap up" asks first, then sends the agent its own command (/fw-record, $fw-record)', async ($, on) => {
    const w = orcaWorld(on)
    engine(on)
    inOrca(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(START)
    await panel($)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    const confirm = async (handle: string) => { const p = ui.press({ key: `ok-${handle}` } as never); await clock.advance(SUBMIT_CHECK_MS); await p }
    await ui.press({ key: 'wrap-term_c' } as never)
    expect(w.orcaCalls.some((c) => c.includes('terminal send'))).toBe(false)
    expect(await ui.find({ key: 'ok-term_c' } as never)).toBeDefined()
    await confirm('term_c')
    expect(w.orcaCalls).toContain(`${BIN}/orca terminal send --terminal term_c --text $fw-record --enter --json`)
    // the picker kept the command in Codex's composer: one more Enter, sent bare
    expect(w.orcaCalls).toContain(`${BIN}/orca terminal send --terminal term_c --enter --json`)
    expect(await ui.find({ type: 'Text', text: /sent \$fw-record to Codex · Ship the app/ })).toBeDefined()
    await ui.press({ key: 'wrap-term_a' } as never)
    await ui.press({ key: 'no-term_a' } as never)
    expect(w.orcaCalls.some((c) => c.includes('--terminal term_a --text'))).toBe(false)
    await ui.press({ key: 'wrap-term_a' } as never)
    await confirm('term_a')
    expect(w.orcaCalls).toContain(`${BIN}/orca terminal send --terminal term_a --text /fw-record --enter --json`)
    // Claude Code submits with the Enter it was sent: no read-back of its screen, no extra Enter
    expect(w.orcaCalls.some((c) => c.includes('terminal read'))).toBe(true) // term_c's, above
    expect(w.orcaCalls).not.toContain(`${BIN}/orca terminal read --terminal term_a --screen --json`)
    expect(w.orcaCalls).not.toContain(`${BIN}/orca terminal send --terminal term_a --enter --json`)
    expect(await ui.find({ type: 'Text', text: /sent \/fw-record to Claude · Review docs/ })).toBeDefined()
    await ui.unmount()
  })

  // the read-back cannot tell (Orca refused the read, the answer has no `draft`), or the extra Enter failed: the
  // notice never says plainly "sent"
  const UNSURE: [string, (a: string) => { exitCode: number; stdout: string } | null][] = [
    ['the read fails', (a) => (a.startsWith('terminal read') ? { exitCode: 1, stdout: '' } : null)],
    ['the read has no draft field', (a) => (a.startsWith('terminal read') ? { exitCode: 0, stdout: readJson() } : null)],
    ['the read is not JSON', (a) => (a.startsWith('terminal read') ? { exitCode: 0, stdout: 'garbled' } : null)],
    ['the extra Enter fails', (a) => (a === 'terminal send --terminal term_c --enter --json' ? { exitCode: 1, stdout: '' } : null)],
  ]
  for (const [name, answer] of UNSURE) {
    test(`Codex wrap-up, ${name}: "may not have been submitted — check that tab", never plain "sent"`, async ($, on) => {
      const w = orcaWorld(on)
      const base = w.orca!
      w.orca = (args) => answer(args.join(' ')) ?? base(args)
      engine(on)
      inOrca(on)
      const clock = mock.clock(on, { now: NOW })
      await $.session.start(START)
      await panel($)
      const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
      await ui.press({ key: 'wrap-term_c' } as never)
      const p = ui.press({ key: 'ok-term_c' } as never)
      await clock.advance(SUBMIT_CHECK_MS)
      await p
      expect(w.orcaCalls).toContain(`${BIN}/orca terminal send --terminal term_c --text $fw-record --enter --json`)
      expect(await ui.find({ type: 'Text', text: /^\$fw-record was typed into Codex · Ship the app but may not have been submitted — check that tab$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^sent / })).toBeUndefined()
      await ui.unmount()
    })
  }

  test('an empty composer after the send (it went through): "sent", no extra Enter', async ($, on) => {
    const w = orcaWorld(on)
    const base = w.orca!
    w.orca = (args) => (args.join(' ').startsWith('terminal read') ? { exitCode: 0, stdout: readJson('  ') } : base(args))
    engine(on)
    inOrca(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(START)
    await panel($)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    await ui.press({ key: 'wrap-term_c' } as never)
    const p = ui.press({ key: 'ok-term_c' } as never)
    await clock.advance(SUBMIT_CHECK_MS)
    await p
    expect(w.orcaCalls).not.toContain(`${BIN}/orca terminal send --terminal term_c --enter --json`)
    expect(await ui.find({ type: 'Text', text: /sent \$fw-record to Codex · Ship the app/ })).toBeDefined()
    await ui.unmount()
  })

  test('a second confirm while a wrap-up to that tab is still in flight sends nothing again', async ($, on) => {
    const w = orcaWorld(on)
    engine(on)
    inOrca(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(START)
    await panel($)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    await ui.press({ key: 'wrap-term_c' } as never)
    const first = ui.press({ key: 'ok-term_c' } as never)
    // the confirm is cleared before the wait: the button is gone while the first send is in flight
    expect(await ui.find({ key: 'ok-term_c' } as never)).toBeUndefined()
    // asked again meanwhile (wrap → confirm): refused, nothing typed twice
    await ui.press({ key: 'wrap-term_c' } as never)
    await ui.press({ key: 'ok-term_c' } as never)
    expect(await ui.find({ type: 'Text', text: /still being sent — nothing sent again/ })).toBeDefined()
    await clock.advance(SUBMIT_CHECK_MS)
    await first
    const typed = w.orcaCalls.filter((c) => c === `${BIN}/orca terminal send --terminal term_c --text $fw-record --enter --json`)
    expect(typed).toHaveLength(1)
    expect(w.orcaCalls.filter((c) => c === `${BIN}/orca terminal send --terminal term_c --enter --json`)).toHaveLength(1)
    // once it is done, the tab can be asked again
    await ui.press({ key: 'wrap-term_c' } as never)
    const again = ui.press({ key: 'ok-term_c' } as never)
    await clock.advance(SUBMIT_CHECK_MS)
    await again
    expect(w.orcaCalls.filter((c) => c === `${BIN}/orca terminal send --terminal term_c --text $fw-record --enter --json`)).toHaveLength(2)
    await ui.unmount()
  })

  test('a composer holding anything but the command (the person typing) gets no extra Enter', async ($, on) => {
    const w = orcaWorld(on)
    drafts.term_c = '$fw-record and also fix the tests'
    engine(on)
    inOrca(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(START)
    await panel($)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    await ui.press({ key: 'wrap-term_c' } as never)
    const p = ui.press({ key: 'ok-term_c' } as never)
    await clock.advance(SUBMIT_CHECK_MS)
    await p
    drafts.term_c = '$fw-record'
    expect(w.orcaCalls).toContain(`${BIN}/orca terminal read --terminal term_c --screen --json`)
    expect(w.orcaCalls).not.toContain(`${BIN}/orca terminal send --terminal term_c --enter --json`)
    await ui.unmount()
  })

  test('an agent that started working before the confirmation gets nothing', async ($, on) => {
    const list = [...LIST]
    const w = orcaWorld(on, list)
    engine(on)
    inOrca(on)
    mock.clock(on, { now: NOW })
    await $.session.start(START)
    await panel($)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    await ui.press({ key: 'wrap-term_a' } as never)
    list[1] = term('term_a', 'claude', '◐ Review docs', '/repo', 10)
    await ui.press({ key: 'ok-term_a' } as never)
    expect(w.orcaCalls.some((c) => c.includes('terminal send'))).toBe(false)
    expect(await ui.find({ type: 'Text', text: /not idle any more — nothing sent/ })).toBeDefined()
    await ui.unmount()
  })

  test('Orca not answering: says so and falls back to the fleet reports', async ($, on) => {
    const w = orcaWorld(on)
    w.orca = () => ({ exitCode: 1, stdout: '' })
    engine(on)
    inOrca(on)
    mock.clock(on, { now: NOW })
    await $.session.start(START)
    await panel($)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /Orca did not answer/ })).toBeDefined()
    await ui.unmount()
  })

  test('polls every 10 s while open, and not after the pane is closed', async ($, on) => {
    const w = orcaWorld(on)
    engine(on)
    inOrca(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(START)
    await panel($)
    const lists = () => w.orcaCalls.filter((c) => c.endsWith('terminal list --json')).length
    const first = lists()
    await clock.advance(10000)
    expect(lists()).toBe(first + 1)
    await panel($, 'off')
    await clock.advance(30000)
    expect(lists()).toBe(first + 1)
  })
})

describe('console: a later session', () => {
  test('the remembered pane reopens at session start and the console polls', async ($, on) => {
    const w = orcaWorld(on)
    const k = engine(on)
    k.store.set('panelOpen', true)
    inOrca(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(START)
    expect(k.open.has('flightwake')).toBe(true)
    await clock.advance(10000)
    expect(w.orcaCalls.filter((c) => c.endsWith('terminal list --json')).length).toBeGreaterThanOrEqual(1)
  })
})

describe('console: outside Orca', () => {
  test('no orca call at all; the fleet reports alone, said so', async ($, on) => {
    const w = orcaWorld(on)
    engine(on)
    mock.clock(on, { now: NOW })
    await $.session.start(START)
    await panel($)
    expect(w.orcaCalls).toEqual([])
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /outside Orca/ })).toBeDefined()
    await ui.unmount()
  })
})
