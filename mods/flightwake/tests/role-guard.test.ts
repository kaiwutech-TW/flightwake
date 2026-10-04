// F5 role guard: seat/card rules, main-loop-only deny, person-only release, lifecycle, degrade, off.
import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { installWorld, MARKER, STATE_FILLED, type World } from './world'

const SEAT = (denyLine = 'deny-write: ["src/**", "lib/**"]', id = 'pm') =>
  `<!-- flightwake-roles:begin v0.14.0 lang=en src=../team/.flightwake/ROLES.md -->
# Your role: ${id} — Project manager (the Claude Code in this folder)

Coordinates.
${denyLine}

**Never**
- Write or edit product code yourself.
<!-- flightwake-roles:end -->
`

const CARD = (denyLine = 'deny-write: ["docs/**"]', id = 'writer') =>
  `# Role card: ${id} — Doc writer\n\nBody.\n${denyLine}\n`

const base = (extra: Record<string, string> = {}): Partial<World> => ({
  files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER() + SEAT(), ...extra },
})

type Probe = { statuses: (string | undefined)[]; registered: string[] }

/** Answers every event the guard's hooks pass on or call; the guard itself is the plugin under test. */
function engineBelow(on: On): Probe {
  const p: Probe = { statuses: [], registered: [] }
  on('session.start', () => ({ cwd: '/repo' }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} as never }))
  on('command.run', () => ({ text: 'bottom' }))
  on('command.register', (_$, e) => {
    p.registered.push(e.name)
    return { value: undefined } as never
  })
  on('ui.status', (_$, e) => {
    p.statuses.push(e.text)
    return { value: undefined } as never
  })
  // Not answered on purpose: the harness has no core beneath session.append, so the plugin's own transcript trace
  // throws there and must be swallowed (its row shape is therefore not verified by these tests).
  return p
}

const ON = { options: { roleGuard: true } }
const start = ($: any) => $.session.start({ cwd: '/repo', surface: null, isInteractive: true })
const write = ($: any, file_path: string, extra: object = {}) => $.tool.call({ tool: 'Write', file_path, content: 'x', ...extra })
const release = ($: any, args: string) => $.command.run({ command: 'fw-role-release', args })

describe('guard on the main session', () => {
  test('seat with deny-write blocks Write into src, allows docs and paths outside root', ON, async ($, on) => {
    installWorld(on, base())
    engineBelow(on)
    await start($)
    const r = await write($, '/repo/src/x.ts')
    expect(r.deny).toBeDefined()
    expect(r.deny).toContain('pm')
    expect(r.deny).toContain('seat')
    expect(r.deny).toContain('src/**')
    expect(r.deny).toContain('src/x.ts')
    expect(r.deny).toContain('npx flightwake roles card')
    expect(r.deny).toContain('/fw-role-release src/**')
    expect(r.deny).toContain('not a security boundary')
    expect((await write($, '/repo/docs/x.md')).deny).toBeUndefined()
    expect((await write($, '/elsewhere/src/x.ts')).deny).toBeUndefined()
    expect((await $.tool.call({ tool: 'Edit', file_path: '/repo/lib/a.ts', old_string: 'a', new_string: 'b' })).deny).toBeDefined()
    expect((await $.tool.call({ tool: 'NotebookEdit', notebook_path: '/repo/src/n.ipynb', new_source: 'x' })).deny).toBeDefined()
  })

  test('Bash and Read are never denied', ON, async ($, on) => {
    installWorld(on, base())
    engineBelow(on)
    await start($)
    expect((await $.tool.call({ tool: 'Bash', command: 'echo hi > src/x.ts' })).deny).toBeUndefined()
    expect((await $.tool.call({ tool: 'Read', file_path: '/repo/src/x.ts' })).deny).toBeUndefined()
  })

  test('subagent (agentId set) is allowed', ON, async ($, on) => {
    installWorld(on, base())
    engineBelow(on)
    await start($)
    const r = await write($, '/repo/src/x.ts', { agentId: 'agent-1' })
    expect(r.deny).toBeUndefined()
  })

  test('.claude/CLAUDE.md wins over CLAUDE.md', ON, async ($, on) => {
    installWorld(on, base({ '.claude/CLAUDE.md': MARKER() + SEAT('deny-write: ["docs/**"]', 'writer') }))
    engineBelow(on)
    await start($)
    expect((await write($, '/repo/docs/a.md')).deny).toContain('writer')
    expect((await write($, '/repo/src/a.ts')).deny).toBeUndefined()
  })

  test('lazy snapshot on the first tool call (no session.start, as after /clear)', ON, async ($, on) => {
    installWorld(on, base())
    engineBelow(on)
    expect((await write($, '/repo/src/x.ts')).deny).toBeDefined()
  })
})

describe('off and degrade', () => {
  test('feature off: no deny even with rules, no command registered', { options: { roleGuard: false } }, async ($, on) => {
    installWorld(on, base())
    const p = engineBelow(on)
    await start($)
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
    expect(p.registered).toEqual([])
  })

  test('default (no options) is off', async ($, on) => {
    installWorld(on, base())
    engineBelow(on)
    await start($)
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
  })

  test('no roles block: nothing guarded, release says nothing to release', ON, async ($, on) => {
    installWorld(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER() } })
    engineBelow(on)
    await start($)
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
    expect((await release($, '')).text).toContain('nothing to release')
  })

  test('seat without deny-write: nothing guarded', ON, async ($, on) => {
    installWorld(on, base({ 'CLAUDE.md': MARKER() + SEAT('') }))
    engineBelow(on)
    await start($)
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
    expect((await release($, 'all')).text).toContain('nothing to release')
  })

  test('no .flightwake/, not a git repo, no files at all: silent', ON, async ($, on) => {
    installWorld(on, { files: {}, git: null })
    const p = engineBelow(on)
    await start($)
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
    expect(p.statuses).toEqual([])
  })

  test('seat in a repo without STATE.md still guards (roles do not need STATE)', ON, async ($, on) => {
    installWorld(on, { files: { 'CLAUDE.md': SEAT() }, git: null })
    engineBelow(on)
    await start($)
    expect((await write($, '/repo/src/x.ts')).deny).toBeDefined()
  })

  test('zh-TW install language localizes the denial', ON, async ($, on) => {
    installWorld(on, base({ 'CLAUDE.md': MARKER('zh-TW') + SEAT() }))
    engineBelow(on)
    await start($)
    expect((await write($, '/repo/src/x.ts')).deny).toContain('角色守門')
  })
})

describe('dispatch card', () => {
  const submit = ($: any, text: string) => $.prompt.submit({ text })

  test('card without deny-write overrides a seat that has rules', ON, async ($, on) => {
    installWorld(on, base())
    engineBelow(on)
    await start($)
    expect((await submit($, CARD(''))).text).toContain('Role card')
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
  })

  test('card with other rules: those apply, the seat rules do not', ON, async ($, on) => {
    installWorld(on, base())
    engineBelow(on)
    await start($)
    await submit($, CARD())
    const r = await write($, '/repo/docs/a.md')
    expect(r.deny).toBeDefined()
    expect(r.deny).toContain('writer')
    expect(r.deny).toContain('dispatch card')
    expect((await write($, '/repo/src/a.ts')).deny).toBeUndefined()
  })

  test('a card quoted further down a prompt is not an assignment', ON, async ($, on) => {
    installWorld(on, base())
    engineBelow(on)
    await start($)
    await submit($, `look at this:\n${CARD()}`)
    expect((await write($, '/repo/src/a.ts')).deny).toBeDefined()
  })

  test('the prompt always passes through unchanged', ON, async ($, on) => {
    installWorld(on, base())
    engineBelow(on)
    await start($)
    expect((await submit($, 'hello')).text).toBe('hello')
    expect((await submit($, CARD())).text).toBe(CARD())
  })
})

describe('release', () => {
  test('list, then release one glob; status shown', ON, async ($, on) => {
    installWorld(on, base())
    const p = engineBelow(on)
    await start($)
    const list = (await release($, '')).text as string
    expect(list).toContain('1. src/**')
    expect(list).toContain('2. lib/**')
    expect((await release($, 'src/**')).text).toContain('released src/**')
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
    expect((await write($, '/repo/lib/x.ts')).deny).toBeDefined()
    expect(p.statuses.at(-1)).toContain('role guard released: src/**')
    expect((await release($, '')).text).toContain('[released]')
  })

  test('release by 1-based index', ON, async ($, on) => {
    installWorld(on, base())
    engineBelow(on)
    await start($)
    await release($, '2')
    expect((await write($, '/repo/lib/x.ts')).deny).toBeUndefined()
    expect((await write($, '/repo/src/x.ts')).deny).toBeDefined()
  })

  test('all releases everything; revoke restores and clears the status line', ON, async ($, on) => {
    installWorld(on, base())
    const p = engineBelow(on)
    await start($)
    await release($, 'all')
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
    expect((await write($, '/repo/lib/x.ts')).deny).toBeUndefined()
    expect(p.statuses.at(-1)).toContain('all rules')
    await release($, 'revoke')
    expect((await write($, '/repo/src/x.ts')).deny).toBeDefined()
    expect(p.statuses.at(-1)).toBeUndefined()
  })

  test('an unknown glob or index changes nothing', ON, async ($, on) => {
    installWorld(on, base())
    const p = engineBelow(on)
    await start($)
    expect((await release($, 'nope/**')).text).toContain('not one of')
    expect((await release($, '9')).text).toContain('not one of')
    expect((await write($, '/repo/src/x.ts')).deny).toBeDefined()
    expect(p.statuses).toEqual([])
  })

  test('a release asked by a plugin (anything the model could cause) is refused and changes nothing', {
    ...ON,
    plugins: [
      {
        name: 'pushy',
        register(on) {
          on('turn.complete', async ($, e, next) => {
            const r = await $.command.run({ command: 'fw-role-release', args: 'all' })
            return next({ ...e, answer: String(r.text) })
          })
        },
      },
    ],
  }, async ($, on) => {
    installWorld(on, base())
    const p = engineBelow(on)
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    await start($)
    const r = await $.turn.complete({ answer: 'go', durationMs: 0, isAborted: false, turnId: 't1', reason: 'answer' })
    expect(r.text).toContain('only works when you type it yourself')
    expect((await write($, '/repo/src/x.ts')).deny).toBeDefined()
    expect(p.statuses).toEqual([])
  })
})

describe('lifecycle', () => {
  test('reload (session.start again, same id) keeps role and releases and re-shows the status', ON, async ($, on) => {
    const w = installWorld(on, base())
    const p = engineBelow(on)
    await start($)
    await release($, 'src/**')
    p.statuses.length = 0
    w.files['CLAUDE.md'] = MARKER() + SEAT('deny-write: ["other/**"]')
    await start($)
    expect(p.statuses.at(-1)).toContain('src/**')
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
    expect((await write($, '/repo/lib/x.ts')).deny).toBeDefined()
    expect((await write($, '/repo/other/x.ts')).deny).toBeUndefined()
  })

  test('a new session id (clear) drops releases and re-reads the role files', ON, async ($, on) => {
    const w = installWorld(on, base())
    engineBelow(on)
    await start($)
    await release($, 'all')
    w.sessionId = 'session-2'
    w.files['CLAUDE.md'] = MARKER() + SEAT('deny-write: ["other/**"]')
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
    expect((await write($, '/repo/other/x.ts')).deny).toBeDefined()
  })

  test('role file edits mid-session do not apply until a new session', ON, async ($, on) => {
    const w = installWorld(on, base())
    engineBelow(on)
    await start($)
    w.files['CLAUDE.md'] = MARKER() + SEAT('')
    expect((await write($, '/repo/src/x.ts')).deny).toBeDefined()
  })

  test('a card from a prior session id does not leak into the next one', ON, async ($, on) => {
    const w = installWorld(on, base())
    engineBelow(on)
    await start($)
    await $.prompt.submit({ text: CARD(''), wait: false, origin: { kind: 'composer' } })
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
    w.sessionId = 'session-2'
    expect((await write($, '/repo/src/x.ts')).deny).toBeDefined()
  })

  test('switching the working directory: the root decides what is outside', ON, async ($, on) => {
    const w = installWorld(on, base())
    engineBelow(on)
    await start($)
    expect((await write($, '/repo/src/x.ts')).deny).toBeDefined()
    w.root = '/repo/sub'
    w.files['sub/.flightwake/STATE.md'] = STATE_FILLED
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
  })

  test('the guard never writes files', ON, async ($, on) => {
    const w = installWorld(on, base())
    engineBelow(on)
    await start($)
    await release($, 'all')
    await write($, '/repo/src/x.ts')
    expect(w.writes).toEqual([])
  })

  test('an append the engine cannot keep still releases and keeps the status line', ON, async ($, on) => {
    installWorld(on, base())
    const p = engineBelow(on)
    await start($)
    expect((await release($, 'all')).text).toContain('released')
    expect(p.statuses.at(-1)).toContain('all rules')
    expect((await write($, '/repo/src/x.ts')).deny).toBeUndefined()
  })
})
