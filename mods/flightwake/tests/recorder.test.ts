// F3 recorder: session flight log + /fw-log.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { declaredCommands, masksExit, redact } from '../hooks/features/recorder'
import { installWorld, MARKER, STATE_FILLED, STATE_TEMPLATE } from './world'
import type { World } from './world'

const T0 = 1_700_000_000_000
type Held = { value: unknown; version: number }
let held: Held = { value: undefined, version: 0 }
/** The log as the host would hold it: `state.get` / `state.set` have no engine beneath the test, so the test is the host. */
const getLog = (): import('../types').FwFlightLog | null | undefined => (held.value ?? null) as never

const OK = { result: { stdout: '', stderr: '', interrupted: false }, text: '' }
const gitClean = { 'rev-parse HEAD': 'abcdef1234567890', 'status --porcelain': '' }

/** The world + the engine-side answers every test needs; `answer` decides what the Bash/Edit tools return. */
function boot(on: On, init: Partial<World> = {}, answer: (e: any) => any = () => OK) {
  const w = installWorld(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER('en') }, git: gitClean, ...init })
  const clock = mock.clock(on, { now: T0 })
  const registered: string[] = []
  held = { value: undefined, version: 0 }
  // Only the recorder's own key is held here; the other features' keys (the whole plugin loads) get their own cells.
  const others = new Map<string, Held>()
  on('state.get', (_$, e) => {
    const h = e.key === 'flightLog' ? held : (others.get(e.key) ?? { value: undefined, version: 0 })
    return { value: { value: h.value, version: h.version } }
  })
  on('state.set', (_$, e) => {
    const h = e.key === 'flightLog' ? held : (others.get(e.key) ?? { value: undefined, version: 0 })
    if (e.ifVersion !== undefined && e.ifVersion !== h.version) return { value: { isSet: false as const, version: h.version } }
    const next = { value: e.value, version: h.version + 1 }
    if (e.key === 'flightLog') held = next
    else others.set(e.key, next)
    return { value: { isSet: true as const, version: next.version } }
  })
  on('session.start', () => ({ cwd: w.root }))
  on('command.register', (_$, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('tool.call', (_$, e) => answer(e))
  return { w, clock, registered }
}

const startArgs = { cwd: '/repo', surface: null, isInteractive: true } as const
const fail = (code: number) => ({ isError: true as const, result: `Exit code ${code}\nboom`, text: `Exit code ${code}\nboom` })

describe('recorder: tests', () => {
  test('a recognised runner that exits 0 is pass, with cwd, revision and dirty state', async ($, on) => {
    const { w } = boot(on, { git: { ...gitClean, 'status --porcelain': ' M a.ts' } })
    await $.tool.call({ tool: 'Bash', command: 'vitest run' })
    const log = getLog()
    expect(log?.tests.length).toBe(1)
    expect(log?.tests[0]).toEqual({
      command: 'vitest run', kind: 'runner', cwd: '.', startedAt: T0, finishedAt: T0, revision: 'abcdef1234567890', isDirty: true,
      result: 'pass', exitCode: 0,
    })
    expect(w.writes).toEqual([])
  })

  test('a failing run records the exit code', async ($, on) => {
    boot(on, {}, () => fail(2))
    await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
    const t = getLog()?.tests[0]
    expect(t?.result).toBe('fail')
    expect(t?.exitCode).toBe(2)
  })

  test('a failure without an exit code is unknown', async ($, on) => {
    boot(on, {}, () => ({ isError: true, result: 'Tool failed', text: 'Tool failed' }))
    await $.tool.call({ tool: 'Bash', command: 'go test ./...' })
    const t = getLog()?.tests[0]
    expect([t?.result, t?.reason, t?.exitCode]).toEqual(['unknown', 'no-exit-code', null])
  })

  test('typecheck is its own kind; runner list spot checks', async ($, on) => {
    boot(on)
    for (const c of ['npx tsc --noEmit', 'cargo test', 'node --test', 'python3 -m pytest', 'npx playwright test', 'bundle exec rspec', './gradlew test', 'make check', 'claude plugin test mods/x']) {
      await $.tool.call({ tool: 'Bash', command: c })
    }
    const kinds = getLog()?.tests.map((t) => t.kind)
    expect(kinds).toEqual(['typecheck', 'runner', 'runner', 'runner', 'runner', 'runner', 'runner', 'runner', 'runner'])
  })

  test('compound with || true is unknown (never pass from the overall exit)', async ($, on) => {
    boot(on)
    await $.tool.call({ tool: 'Bash', command: 'npm run build && vitest run || true' })
    const t = getLog()?.tests
    expect(t?.length).toBe(1)
    expect([t?.[0]?.result, t?.[0]?.reason]).toEqual(['unknown', 'compound'])
  })

  test('a pipe is unknown even when the exit is 0, and a failed compound is not "fail"', async ($, on) => {
    let n = 0
    boot(on, {}, () => (n++ === 0 ? OK : fail(1)))
    await $.tool.call({ tool: 'Bash', command: 'pytest | tail -5' })
    await $.tool.call({ tool: 'Bash', command: 'jest; echo done' })
    const t = getLog()?.tests
    expect(t?.map((x) => [x.result, x.reason, x.exitCode])).toEqual([['unknown', 'compound', null], ['unknown', 'compound', null]])
  })

  test('plain trailing redirections are not compound', async ($, on) => {
    boot(on)
    await $.tool.call({ tool: 'Bash', command: 'cargo test 2>&1' })
    await $.tool.call({ tool: 'Bash', command: 'go test ./... > /tmp/out.txt 2>/dev/null' })
    const t = getLog()?.tests
    expect(t?.map((x) => x.result)).toEqual(['pass', 'pass'])
  })

  test('leading cd moves the cwd (repo-relative); the rest is still a single command', async ($, on) => {
    boot(on, { git: { ...gitClean }, files: { '.flightwake/STATE.md': STATE_FILLED, 'pkg/a/package.json': '{}' } })
    await $.tool.call({ tool: 'Bash', command: 'cd pkg/a && cd .. && cd a && cargo test' })
    const t = getLog()?.tests[0]
    expect([t?.cwd, t?.result]).toEqual(['pkg/a', 'pass'])
  })

  test('cd to something unresolvable records nothing', async ($, on) => {
    boot(on)
    await $.tool.call({ tool: 'Bash', command: 'cd - && cargo test' })
    await $.tool.call({ tool: 'Bash', command: 'cd $HOME/x && cargo test' })
    expect(getLog()).toBe(null)
  })

  test('npm test with a real script is a package-script; the body is stored', async ($, on) => {
    boot(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'package.json': JSON.stringify({ scripts: { test: 'node --test test/' } }) } })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    const t = getLog()?.tests[0]
    expect([t?.kind, t?.script, t?.result]).toEqual(['package-script', 'node --test test/', 'pass'])
  })

  test('npm placeholder, missing script and non-test run names are not recorded', async ($, on) => {
    boot(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1', build: 'tsc', empty: '' } }) } })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await $.tool.call({ tool: 'Bash', command: 'npm run build' })
    await $.tool.call({ tool: 'Bash', command: 'pnpm run empty' })
    await $.tool.call({ tool: 'Bash', command: 'yarn lint' }) // lint is a counted name but the script is absent
    expect(getLog()).toBe(null)
  })

  test('npm run check / pnpm test resolve their scripts', async ($, on) => {
    boot(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'package.json': JSON.stringify({ scripts: { 'check:types': 'tsc -p .', test: 'vitest run' } }) } })
    await $.tool.call({ tool: 'Bash', command: 'npm run check:types' })
    await $.tool.call({ tool: 'Bash', command: 'pnpm test' })
    const t = getLog()?.tests
    expect(t?.map((x) => [x.kind, x.script])).toEqual([['package-script', 'tsc -p .'], ['package-script', 'vitest run']])
  })

  test('a script that masks failures is unknown (script-masks-exit)', async ($, on) => {
    boot(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'package.json': JSON.stringify({ scripts: { test: 'vitest run || true' } }) } })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    const t = getLog()?.tests[0]
    expect([t?.result, t?.reason]).toEqual(['unknown', 'script-masks-exit'])
  })

  test('workspace flags make package scripts unrecognisable (wrong package.json)', async ($, on) => {
    boot(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'package.json': JSON.stringify({ scripts: { test: 'vitest' } }) } })
    await $.tool.call({ tool: 'Bash', command: 'npm test --workspace=web' })
    await $.tool.call({ tool: 'Bash', command: 'pnpm --filter web test' })
    expect(getLog()).toBe(null)
  })

  test('a command STATE.md declares as verification is recognised', async ($, on) => {
    boot(on)
    await $.tool.call({ tool: 'Bash', command: 'bash   test/smoke.sh' })
    const t = getLog()?.tests[0]
    expect([t?.kind, t?.result]).toEqual(['state-declared', 'pass'])
  })

  test('unrecognised commands are not recorded', async ($, on) => {
    boot(on)
    for (const c of ['ls -la', 'git status', 'bash scripts/deploy.sh', 'node build.js', 'npm install', 'echo vitest']) {
      await $.tool.call({ tool: 'Bash', command: c })
    }
    expect(getLog()).toBe(null)
  })

  test('background, interrupted and timeout are unknown', async ($, on) => {
    const answers = [
      { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' }, text: '' },
      { result: { stdout: '', stderr: '', interrupted: true }, text: '' },
      { result: { stdout: '', stderr: '', interrupted: false, timedOutAfterMs: 120000 }, text: '' },
      OK,
    ]
    let i = 0
    boot(on, {}, () => answers[i++])
    await $.tool.call({ tool: 'Bash', command: 'jest' })
    await $.tool.call({ tool: 'Bash', command: 'jest' })
    await $.tool.call({ tool: 'Bash', command: 'jest' })
    await $.tool.call({ tool: 'Bash', command: 'jest', run_in_background: true })
    const t = getLog()?.tests
    expect(t?.map((x) => [x.result, x.reason])).toEqual([['unknown', 'background'], ['unknown', 'interrupted'], ['unknown', 'timeout'], ['unknown', 'background']])
  })

  test('a denied call is not recorded', async ($, on) => {
    boot(on, {}, () => ({ deny: 'no' }))
    await $.tool.call({ tool: 'Bash', command: 'jest' }).catch(() => undefined)
    expect(getLog()).toBe(null)
  })

  test('unreadable git leaves revision and dirty null; not a repo still records', async ($, on) => {
    boot(on, { git: null })
    await $.tool.call({ tool: 'Bash', command: 'jest' })
    const t = getLog()?.tests[0]
    expect([t?.revision, t?.isDirty, t?.result]).toEqual([null, null, 'pass'])
  })

  test('secrets are redacted before storing; the rest of the command stays', async ($, on) => {
    boot(on)
    await $.tool.call({ tool: 'Bash', command: 'API_TOKEN=abc123 pytest --password hunter2 --db https://user:pw@db.example/x -k fast' })
    const t = getLog()?.tests[0]
    expect(t?.command).toBe('API_TOKEN=*** pytest --password *** --db https://***@db.example/x -k fast')
  })

  test('redact(): flags, Bearer, long runs, cap', () => {
    expect(redact('curl --api-key=zzz -H "Authorization: Bearer abc.def"')).toBe('curl --api-key=*** -H "Authorization: Bearer ***"')
    expect(redact(`x ${'a1'.repeat(20)} y`)).toBe('x *** y')
    expect(redact('a b '.repeat(100)).length).toBe(300)
    expect(redact('vitest run --reporter dot')).toBe('vitest run --reporter dot')
    // absolute paths and long plain words are evidence, not secrets
    expect(redact('claude plugin test /Users/someone/orca/workspaces/flightwake/mods/mods/flightwake')).toBe('claude plugin test /Users/someone/orca/workspaces/flightwake/mods/mods/flightwake')
    expect(redact('pytest tests/integration/test_very_long_module_name_here')).toBe('pytest tests/integration/test_very_long_module_name_here')
  })

  test('pure helpers: masksExit, declaredCommands', () => {
    expect(masksExit('vitest || true')).toBe(true)
    expect(masksExit('vitest || exit 0')).toBe(true)
    expect(masksExit('vitest; true')).toBe(true)
    expect(masksExit('vitest && tsc')).toBe(false)
    expect(declaredCommands('- verify with `bash test/smoke.sh`\n- run `rm -rf x` never\n- 驗證:`npm  run  smoke`\n- check `{{cmd}}`')).toEqual(['bash test/smoke.sh', 'npm run smoke'])
  })

  test('a subagent run carries its agentId', async ($, on) => {
    boot(on)
    await $.tool.call({ tool: 'Bash', command: 'jest', agentId: 'agent-7' } as never)
    expect(getLog()?.tests[0]?.agentId).toBe('agent-7')
  })

  test('tests cap at 200; overflow counts as dropped', async ($, on) => {
    boot(on)
    for (let i = 0; i < 203; i++) await $.tool.call({ tool: 'Bash', command: 'jest' })
    const log = getLog()
    expect([log?.tests.length, log?.dropped]).toEqual([200, 3])
  })
})

describe('recorder: files and commits', () => {
  test('Edit/Write/NotebookEdit record repo-relative paths, deduped keeping the latest', async ($, on) => {
    const { clock } = boot(on)
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/src/b.ts', content: 'x' })
    await clock.advance(1000)
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'b', new_string: 'c' })
    await $.tool.call({ tool: 'NotebookEdit', notebook_path: '/repo/nb/x.ipynb', new_source: 's' } as never)
    await $.tool.call({ tool: 'Write', file_path: '/elsewhere/note.md', content: 'x' })
    const files = getLog()?.files
    expect(files?.map((f) => [f.path, f.tool])).toEqual([['src/b.ts', 'Write'], ['src/a.ts', 'Edit'], ['nb/x.ipynb', 'NotebookEdit'], ['/elsewhere/note.md', 'Write']])
    expect(files?.[1]?.at).toBe(T0 + 1000)
  })

  test('a failed or denied edit is not recorded', async ($, on) => {
    let n = 0
    boot(on, {}, () => (n++ === 0 ? { isError: true, result: 'File not found', text: 'File not found' } : { deny: 'no' }))
    await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/b.ts', content: 'x' }).catch(() => undefined)
    expect(getLog()).toBe(null)
  })

  test('files cap at 500; overflow counts as dropped, re-edits of kept files still update', async ($, on) => {
    boot(on)
    for (let i = 0; i < 502; i++) await $.tool.call({ tool: 'Write', file_path: `/repo/f${i}.txt`, content: 'x' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/f0.txt', content: 'y' })
    const log = getLog()
    expect([log?.files.length, log?.dropped, log?.files[499]?.path]).toEqual([500, 2, 'f0.txt'])
  })

  test('external changes (git status moves, no tool call) are never in the log', async ($, on) => {
    const { w } = boot(on)
    w.git = { ...gitClean, 'status --porcelain': ' M external.ts\n?? new.ts', 'rev-parse HEAD': 'ffff0000ffff0000' }
    await $.session.start(startArgs)
    expect(getLog()).toBe(null)
    const r = await $.command.run({ command: 'fw-log', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
    expect(r.text).toContain('Nothing observed')
    expect(r.text).not.toContain('external.ts')
  })

  test('a commit reported by the Bash result is logged once per sha', async ($, on) => {
    const commit = { result: { stdout: '', stderr: '', interrupted: false, gitOperation: { commit: { sha: 'cafe1234cafe1234', kind: 'committed' } } }, text: '' }
    boot(on, {}, () => commit)
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x', agentId: 'ag1' } as never)
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
    const log = getLog()
    expect(log?.commits).toEqual([{ sha: 'cafe1234cafe1234', kind: 'committed', at: T0, agentId: 'ag1' }])
    expect(log?.tests).toEqual([])
  })
})

describe('recorder: sessions', () => {
  test('a new session id starts a fresh log; the same id keeps it', async ($, on) => {
    const { w } = boot(on)
    await $.tool.call({ tool: 'Write', file_path: '/repo/a.ts', content: 'x' })
    await $.session.start(startArgs) // same id (reload / restart of hooks): kept
    expect(getLog()?.files.length).toBe(1)
    w.sessionId = 'session-2' // /clear
    const r = await $.command.run({ command: 'fw-log', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
    expect(r.text).toContain('Nothing observed')
    await $.tool.call({ tool: 'Write', file_path: '/repo/b.ts', content: 'x' })
    const log = getLog()
    expect([log?.sessionId, log?.files.map((f) => f.path)]).toEqual(['session-2', ['b.ts']])
  })

  test('a throwing step does not break the tool call', async ($, on) => {
    boot(on, { files: { '.flightwake/STATE.md': STATE_FILLED } })
    // process.run failing for git is swallowed by the Io closure; the call still returns the tool result
    const r = await $.tool.call({ tool: 'Bash', command: 'jest' })
    expect(r.result).toBeDefined()
  })
})

describe('recorder: /fw-log', () => {
  const run = ($: any) => $.command.run({ command: 'fw-log', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

  test('registered at session start with a localized description', async ($, on) => {
    const { registered } = boot(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER('zh-TW') } })
    await $.session.start(startArgs)
    expect(registered).toEqual(['fw-log'])
  })

  test('summary: files, a runs table, commits, and the footer', async ($, on) => {
    const answers: any[] = [OK, OK, fail(1), { result: { stdout: '', stderr: '', interrupted: false, gitOperation: { commit: { sha: 'cafe1234cafe1234', kind: 'committed' } } }, text: '' }]
    let i = 0
    boot(on, { git: { ...gitClean, 'status --porcelain': ' M x' } }, () => answers[i++])
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' })
    await $.tool.call({ tool: 'Bash', command: 'vitest run | tail' })
    await $.tool.call({ tool: 'Bash', command: 'cargo test' })
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
    const r = await run($)
    const text = r.text as string
    expect(text).toContain('`src/a.ts`')
    expect(text).toContain('| `vitest run \\| tail` | runner | unknown | - | 2023-11-14 22:13:20 UTC | abcdef1* | `.` | compound |')
    expect(text).toContain('| `cargo test` | runner | fail | 1 |')
    expect(text).toContain('`cafe123` committed')
    expect(text).toContain('verbatim')
    expect(text).toContain('not evidence of passing')
    expect(text).toContain('this session only')
  })

  test('localized in the install language', async ($, on) => {
    boot(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER('ja') } }, () => OK)
    await $.tool.call({ tool: 'Write', file_path: '/repo/a.ts', content: 'x' })
    expect((await run($)).text).toContain('セッション')
  })

  test('works without .flightwake/, and says so', async ($, on) => {
    boot(on, { files: {} })
    await $.tool.call({ tool: 'Write', file_path: '/repo/a.ts', content: 'x' })
    const text = (await run($)).text as string
    expect(text).toContain('`a.ts`')
    expect(text).toContain("flightwake isn't set up")
  })

  test('STATE template, not a git repo, no marker: still fine', async ($, on) => {
    boot(on, { files: { '.flightwake/STATE.md': STATE_TEMPLATE }, git: null })
    await $.tool.call({ tool: 'Bash', command: 'pytest' })
    const text = (await run($)).text as string
    expect(text).toContain('| `pytest` | runner | pass | 0 |')
    expect(text).toContain('| ? |')
  })
})

describe('recorder: off (options)', () => {
  test('recorder: false → no /fw-log, nothing recorded', { options: { recorder: false } }, async ($, on) => {
    const { registered } = boot(on)
    await $.session.start(startArgs)
    await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' })
    await $.tool.call({ tool: 'Bash', command: 'jest' })
    expect(registered).toEqual([])
    expect(getLog()).toBe(null)
  })
})
