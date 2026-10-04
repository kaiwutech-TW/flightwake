// Cross-feature lifecycle (plan r2 "測試"): the whole plugin loaded with every switch on, driven through /clear,
// reload, resume, compaction (same id), a working-directory switch, subagents, external changes, and one capability
// failing. Each feature's own file covers its details; this file checks they keep working side by side.
import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { gitBehind, installWorld, MARKER, STATE_FILLED, type World } from './world'

const ALL_ON = { options: { stateInject: true, band: true, recorder: true, tripwire: true, roleGuard: true } }

const SEAT = `<!-- flightwake-roles:begin v0.14.0 lang=en src=ROLES.md -->
# Your role: pm — Project manager (the Claude Code in this folder)

deny-write: ["src/**"]
<!-- flightwake-roles:end -->
`

const TRAPS = `# Trap Registry

---
name: smoke-needs-py311
type: gotcha
status: active
confidence: confirmed
commands: ["bash test/smoke.sh"]
---

**Symptom**: tomllib missing
**Root cause**: system python is 3.9
**Fix/workaround**: put python 3.11+ first on PATH
`

const files = (state = STATE_FILLED): Record<string, string> => ({
  '.flightwake/STATE.md': state,
  '.flightwake/TRAPS.md': TRAPS,
  'CLAUDE.md': MARKER('en') + SEAT,
})

type Probe = { registered: string[]; toasts: string[]; statuses: (string | undefined)[] }

/** The engine beneath the plugin: answers what every feature passes on with next() or asks of $. */
function engineBelow(on: On, w: World): Probe {
  const p: Probe = { registered: [], toasts: [], statuses: [] }
  on('session.start', () => ({ cwd: w.root }))
  on('session.end', () => ({ sessionId: w.sessionId }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'engine', scope: 'shared' as const }] }))
  on('turn.complete', () => ({}) as never)
  on('session.turns', () => ({ value: 1 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 10 }, rateLimits: [] } }) as never)
  on('command.register', (_$, e) => {
    p.registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.toast', (_$, e) => {
    p.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    p.statuses.push(e.text)
    return { value: undefined }
  })
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('tool.call', (_$, e) => {
    if (e.tool === 'Bash' && String((e as { command?: string }).command).includes('fails')) {
      return { isError: true, result: 'Exit code 1\nboom', text: 'Exit code 1\nboom' } as never
    }
    return { result: { stdout: '', stderr: '', interrupted: false } } as never
  })
  return p
}

const start = ($: any, w: World) => $.session.start({ cwd: w.root, surface: null, isInteractive: true })
const compose = async ($: any): Promise<string | undefined> => {
  const r = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
  return r.sections.find((s: { id: string }) => s.id === 'flightwake-mod:state')?.text
}
const bash = ($: any, command: string, extra: object = {}) => $.tool.call({ tool: 'Bash', command, ...extra })
const write = ($: any, file_path: string, extra: object = {}) => $.tool.call({ tool: 'Write', file_path, content: 'x', ...extra })
const log = async ($: any): Promise<string> => (await $.command.run({ command: 'fw-log', args: '' })).text ?? ''
const hintOf = (r: { context?: readonly string[] }) => (r.context ?? []).join('\n')

const SMOKE_STATE = STATE_FILLED // declares `bash test/smoke.sh` on a verification line

describe('lifecycle: all features side by side', () => {
  test('a normal session: section injected, guard denies, test recorded, trap hinted, band quiet', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(SMOKE_STATE), git: gitBehind(0) })
    const p = engineBelow(on, w)
    await start($, w)
    expect(await compose($)).toContain('migrate the billing table')
    expect((await write($, '/repo/src/a.ts')).deny).toContain('pm')
    const r = await bash($, 'bash test/smoke.sh')
    expect(hintOf(r)).toContain('smoke-needs-py311')
    const text = await log($)
    expect(text).toContain('bash test/smoke.sh')
    expect(text).toContain('state-declared')
    expect(p.registered).toEqual(expect.arrayContaining(['fw-log', 'fw-role-release']))
    expect(w.writes).toEqual([])
  })

  test('/clear: snapshot retaken, log fresh, trap hinted again, guard re-read', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    expect(await compose($)).not.toContain('AFTER-CLEAR')
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toContain('smoke-needs-py311')
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toBe('') // once per session

    w.files['.flightwake/STATE.md'] = STATE_FILLED.replace('migrate the billing table', 'AFTER-CLEAR item')
    await $.session.end({ reason: 'clear' } as never)
    w.sessionId = 'session-2' // a /clear starts a new id; no session.start follows
    expect(await compose($)).toContain('AFTER-CLEAR')
    expect(await log($)).not.toContain('bash test/smoke.sh')
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toContain('smoke-needs-py311')
    expect((await write($, '/repo/src/a.ts')).deny).toBeDefined()
  })

  test('reload / compaction / resume keep the session id: snapshot, log and releases are kept', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    const first = await compose($)
    await bash($, 'bash test/smoke.sh')
    await $.command.run({ command: 'fw-role-release', args: 'all' })
    w.files['.flightwake/STATE.md'] = STATE_FILLED.replace('migrate', 'CHANGED')
    await start($, w) // a module reload fires session.start again with the same id
    expect(await compose($)).toBe(first) // stable: no mid-session rewrite of the system prompt
    expect(await log($)).toContain('bash test/smoke.sh')
    expect((await write($, '/repo/src/a.ts')).deny).toBeUndefined() // release survives the reload
  })

  test('working-directory switch: the snapshot stays; tripwires and the guard follow the new root', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    const before = await compose($)
    w.root = '/elsewhere' // /cd or a worktree move: same session, other root…
    w.files = {} // …that has no .flightwake/ (the fake world resolves files against the current root)
    expect(await compose($)).toBe(before)
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toBe('')
    expect((await write($, '/elsewhere/src/a.ts')).deny).toBeDefined() // role snapshot is per session, not per root
  })

  test('subagents: never guarded, still recorded with their id, still hinted', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    expect((await write($, '/repo/src/a.ts', { agentId: 'agent-9' })).deny).toBeUndefined()
    expect(hintOf(await bash($, 'bash test/smoke.sh', { agentId: 'agent-9' }))).toContain('smoke-needs-py311')
    expect(await log($)).toContain('agent-9')
  })

  test('external programs editing files or committing are never attributed to the session', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    w.files['src/edited-outside.ts'] = 'x'
    w.git = { ...gitBehind(2), 'status --porcelain': ' M src/edited-outside.ts' }
    const text = await log($)
    expect(text).not.toContain('edited-outside')
    expect(text).toContain('Nothing observed yet')
  })

  test('one capability failing (git and settings refuse) does not take the other features down', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(), git: null })
    engineBelow(on, w)
    await start($, w)
    expect(await compose($)).toContain('migrate the billing table')
    expect((await write($, '/repo/src/a.ts')).deny).toBeDefined()
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toContain('smoke-needs-py311')
    const r = await bash($, 'npm run fails')
    expect(r.isError).toBe(true) // the tool's own error reaches the model unchanged
    expect(await log($)).toContain('bash test/smoke.sh')
  })

  test('nothing installed: no .flightwake, no roles, not a git repo — every feature silent', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: {}, git: null })
    engineBelow(on, w)
    await start($, w)
    expect(await compose($)).toBeUndefined()
    const r = await write($, '/repo/src/a.ts')
    expect(r.deny).toBeUndefined()
    expect(r.context).toBeUndefined()
    expect(hintOf(await bash($, 'npm test'))).toBe('')
    expect(w.writes).toEqual([])
  })

  test('every switch off: the plugin changes nothing', { options: { stateInject: false, band: false, recorder: false, tripwire: false, roleGuard: false } }, async ($, on) => {
    const w = installWorld(on, { files: files(), git: gitBehind(5) })
    const p = engineBelow(on, w)
    await start($, w)
    expect(await compose($)).toBeUndefined()
    const r = await write($, '/repo/src/a.ts')
    expect(r.deny).toBeUndefined()
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toBe('')
    expect(p.registered).toEqual([])
    expect(p.toasts).toEqual([])
  })

  test('read scope: only .flightwake/, the Claude instruction files and package.json are read', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: { ...files(), 'package.json': '{"scripts":{"test":"vitest"}}', 'AGENTS.md': MARKER('ja') }, git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    await compose($)
    await write($, '/repo/docs/a.md')
    await bash($, 'npm test')
    await bash($, 'bash test/smoke.sh')
    await log($)
    const allowed = /^\/repo\/(\.flightwake\/|CLAUDE\.md$|\.claude\/CLAUDE\.md$|CLAUDE\.local\.md$|package\.json$)/
    expect(w.reads.filter((p) => !allowed.test(p))).toEqual([])
  })
})
