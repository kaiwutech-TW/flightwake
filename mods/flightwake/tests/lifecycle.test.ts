// Cross-feature lifecycle (plan r2 "測試"): the whole plugin loaded with every switch on. What the test kit can do is
// raise events by hand, so these SIMULATE a /clear (session.end + new id) and a module reload (session.start again,
// same id); a real reload, resume or compaction is not reproduced here — see the record for what was seen live and
// what remains unverified. Also: a working-directory switch, subagents, external changes, a capability failing.
// Where HOME is mocked (outside the root), F7 writes its one session file; `w.writes` (forbidden writes) stays [].
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { FLEET_DIR, fleetFile, gitBehind, HOME_OUT, installWorld, MARKER, sessionRec, STATE_FILLED, type World } from './world'

const ALL_ON = { options: { stateInject: true, band: true, recorder: true, tripwire: true, roleGuard: true, fleet: true } }

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
    expect(p.registered).toEqual(expect.arrayContaining(['fw-log', 'fw-role-release', 'fw-fleet']))
    expect(w.writes).toEqual([])
    expect(w.fleetWrites).toEqual([]) // HOME is not set here: F7 has no home to write to
  })

  test('simulated /clear (session.end reason clear + a new session id; no real /clear in the kit): snapshot retaken, log fresh, trap hinted again, guard re-read', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(), git: gitBehind(0) })
    mock.env(on, { HOME: HOME_OUT })
    engineBelow(on, w)
    await start($, w)
    expect(fleetFile(w, 'session-1')).toMatchObject({ state: 'idle', why: 'session.start' })
    expect(await compose($)).not.toContain('AFTER-CLEAR')
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toContain('smoke-needs-py311')
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toBe('') // once per session

    w.files['.flightwake/STATE.md'] = STATE_FILLED.replace('migrate the billing table', 'AFTER-CLEAR item')
    await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } } as never)
    expect(fleetFile(w, 'session-1')).toMatchObject({ state: 'ended', ended: { reason: 'clear', stateAtEnd: 'idle' } })
    w.sessionId = 'session-2' // a /clear starts a new id; no session.start follows
    expect(await compose($)).toContain('AFTER-CLEAR')
    expect(await log($)).not.toContain('bash test/smoke.sh')
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toContain('smoke-needs-py311')
    expect((await write($, '/repo/src/a.ts')).deny).toBeDefined()
    // F7: no classic.SessionStart was raised, so the first hook on the new id adopts it (A3)
    expect(fleetFile(w, 'session-2')).toMatchObject({ state: 'idle', why: 'adopt:id-changed', parent: { sessionId: 'session-1', via: 'id-changed' } })
    expect(fleetFile(w, 'session-1')!.ended).toMatchObject({ reason: 'clear' })
    expect(w.fleetWrites.every((f) => f === `${FLEET_DIR}/session-1.json` || f === `${FLEET_DIR}/session-2.json`)).toBe(true)
    expect(w.writes).toEqual([])
  })

  test('session.start raised again with the same session id (what a module reload does; real reload/resume/compact are NOT reproduced here): snapshot, log and releases are kept', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(), git: gitBehind(0) })
    mock.env(on, { HOME: HOME_OUT })
    engineBelow(on, w)
    await start($, w)
    const inst = fleetFile(w, 'session-1')!.instance
    const first = await compose($)
    await bash($, 'bash test/smoke.sh')
    await ($ as any).command.run({ command: 'fw-role-release', args: 'all', origin: { kind: 'composer' } })
    w.files['.flightwake/STATE.md'] = STATE_FILLED.replace('migrate', 'CHANGED')
    await start($, w) // a module reload fires session.start again with the same id
    expect(await compose($)).toBe(first) // stable: no mid-session rewrite of the system prompt
    expect(await log($)).toContain('bash test/smoke.sh')
    expect((await write($, '/repo/src/a.ts')).deny).toBeUndefined() // release survives the reload
    // F7: the reload keeps this process's writer (same instance), not a second process on the id
    expect(fleetFile(w, 'session-1')).toMatchObject({ instance: inst, contested: false, ended: null })
    expect(w.writes).toEqual([])
  })

  test('working-directory switch: the STATE snapshot stays; tripwires and the guard follow the new root', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    const before = await compose($)
    w.root = '/elsewhere' // /cd or a worktree move: same session, other root…
    w.files = {} // …that has no .flightwake/ (the fake world resolves files against the current root)
    expect(await compose($)).toBe(before)
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toBe('')
    // acceptance 2026-10-05: the role snapshot is per (session, root); a root without flightwake guards nothing
    expect((await write($, '/elsewhere/src/a.ts')).deny).toBeUndefined()
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

  test('one capability failing (git and settings refuse; the F7 session file cannot be written) does not take the other features down', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(), git: null, isFleetWriteFailing: true })
    mock.env(on, { HOME: HOME_OUT })
    engineBelow(on, w)
    await start($, w)
    expect(await compose($)).toContain('migrate the billing table')
    expect((await write($, '/repo/src/a.ts')).deny).toBeDefined()
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toContain('smoke-needs-py311')
    const r = await bash($, 'npm run fails')
    expect(r.isError).toBe(true) // the tool's own error reaches the model unchanged
    expect(await log($)).toContain('bash test/smoke.sh')
    expect(w.fleetWriteAttempts.length).toBeGreaterThan(0) // F7 did try: the failure is what was absorbed
    expect(w.fleetWriteAttempts.every((p) => p === `${FLEET_DIR}/session-1.json`)).toBe(true)
    expect(w.fleetWrites).toEqual([])
    expect(w.writes).toEqual([])
  })

  test('F7\'s own capabilities throwing (fs.write / fs.list / fs.stat outside the repo blow up) takes no other feature down', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(), git: gitBehind(0), isFleetIoThrowing: true })
    mock.env(on, { HOME: HOME_OUT })
    const p = engineBelow(on, w)
    await start($, w)
    expect(p.registered).toEqual(expect.arrayContaining(['fw-log', 'fw-role-release', 'fw-fleet']))
    expect(await compose($)).toContain('migrate the billing table')
    expect((await write($, '/repo/src/a.ts')).deny).toBeDefined()
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toContain('smoke-needs-py311')
    expect(await log($)).toContain('bash test/smoke.sh')
    const fleet = (await $.command.run({ command: 'fw-fleet', args: '' } as never)).text as string
    expect(fleet).toContain('## /fw-fleet')
    await $.session.end({ reason: 'other', sessionId: 'session-1', resume: { id: 'session-1' } } as never)
    // a stat that blows up cannot place the folder or rule out a link: F7 refuses to write at all (fail closed)
    expect(w.fleetWriteAttempts).toEqual([])
    expect(w.fleetWrites).toEqual([])
    expect(w.writes).toEqual([])
  })

  test('F7\'s fs.write alone throwing (the guards answered, so the write is tried) takes no other feature down', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: files(), git: gitBehind(0), isFleetWriteThrowing: true })
    mock.env(on, { HOME: HOME_OUT })
    const p = engineBelow(on, w)
    await start($, w)
    expect(p.registered).toEqual(expect.arrayContaining(['fw-log', 'fw-role-release', 'fw-fleet']))
    expect(await compose($)).toContain('migrate the billing table')
    expect((await write($, '/repo/src/a.ts')).deny).toBeDefined()
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toContain('smoke-needs-py311')
    expect(await log($)).toContain('bash test/smoke.sh')
    await $.session.end({ reason: 'other', sessionId: 'session-1', resume: { id: 'session-1' } } as never)
    expect(w.fleetWriteAttempts.length).toBeGreaterThan(0) // F7 did try: the failure is what was absorbed
    expect(w.fleetWrites).toEqual([])
    expect(w.writes).toEqual([])
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

  test('every switch off: the plugin changes nothing', { options: { stateInject: false, band: false, recorder: false, tripwire: false, roleGuard: false, spend: false, fleet: false } }, async ($, on) => {
    const w = installWorld(on, { files: files(), git: gitBehind(5) })
    mock.env(on, { HOME: HOME_OUT }) // a home F7 could write to, if it were on
    const p = engineBelow(on, w)
    await start($, w)
    expect(await compose($)).toBeUndefined()
    const r = await write($, '/repo/src/a.ts')
    expect(r.deny).toBeUndefined()
    expect(hintOf(await bash($, 'bash test/smoke.sh'))).toBe('')
    expect(p.registered).toEqual(['fw-mod']) // only the read-only status command: it is how the switches are seen
    expect(p.toasts).toEqual([])
    expect(w.writes).toEqual([])
    expect(w.fleetWrites).toEqual([])
  })

  test('read scope: only .flightwake/, the instruction-file markers, package.json, the sessions folder, transcripts under ~/.claude/projects (existence only), the "is the base someone\'s repo" probes (<base>/STATE.md, <each folder up>/.git and /.flightwake/STATE.md) and where the root and the folder really land are read', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: { ...files(), 'package.json': '{"scripts":{"test":"vitest"}}', 'AGENTS.md': MARKER('ja') }, git: gitBehind(0) })
    mock.env(on, { HOME: HOME_OUT })
    // another session that stopped uncleanly: /fw-fleet checks that its transcript exists before offering it
    const transcript = `${HOME_OUT}/.claude/projects/-repo/old1.jsonl`
    w.outside[`${FLEET_DIR}/old1.json`] = JSON.stringify(sessionRec({ sessionId: 'old1', state: 'working', heartbeatAt: 1_700_000_000_000 - 600000, resume: { id: 'old1', resumable: true }, transcript }))
    w.mtimes[`${FLEET_DIR}/old1.json`] = 1_700_000_000_000 - 600000
    w.outside[transcript] = '{}'
    w.outside['/home/u/secret.txt'] = 'not for the mod'
    engineBelow(on, w)
    await start($, w)
    await compose($)
    await write($, '/repo/docs/a.md')
    await bash($, 'npm test')
    await bash($, 'bash test/smoke.sh')
    await log($)
    const fleet = (await $.command.run({ command: 'fw-fleet', args: 'all' } as never)).text as string
    expect(fleet).toContain('claude --resume old1')
    await $.session.end({ reason: 'other', sessionId: 'session-1', resume: { id: 'session-1' } } as never)
    expect(w.reads).toContain(`${FLEET_DIR}/old1.json`)
    expect(w.reads).toContain(transcript)
    expect(w.contentReads).not.toContain(transcript) // another session's transcript: whether it exists, never what it says
    // the root itself and the folders above the base: stat { resolve } only (where they really land)
    const allowed = /^\/repo$|^\/repo\/(\.flightwake\/|CLAUDE\.md$|\.claude\/CLAUDE\.md$|CLAUDE\.local\.md$|AGENTS\.md$|GEMINI\.md$|package\.json$)|^\/home\/u\/\.flightwake$|^\/home\/u\/\.flightwake\/sessions(\/|$)|^\/home\/u\/\.claude\/projects\/|^\/home\/u\/\.flightwake\/STATE\.md$|^(\/home\/u\/\.flightwake|\/home\/u|\/home|)\/(\.git|\.flightwake\/STATE\.md)$|^(\/home\/u|\/home|\/)$/
    expect(w.reads.filter((p) => !allowed.test(p))).toEqual([])
    expect(w.fleetWrites.every((p) => p === `${FLEET_DIR}/session-1.json`)).toBe(true)
    expect(w.writes).toEqual([])
  })
})
