// Acceptance review round 2 (docs/plans/mods.diff-review-astra-2.md). Astra's 12 failing neighbour cases, then the
// designer's change of method: F3 records pass/fail only on positive proof (a single direct call of a known runner
// whose every flag is in that runner's safe set); everything else is still recorded, as unknown, with the exit code
// and the command kept. F5 keeps "release all" apart from a literal `*` rule. F4 over-hints when the cwd is uncertain.
import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { gitBehind, installWorld, MARKER, STATE_FILLED, type World } from './world'

const ALL_ON = { options: { stateInject: true, band: true, recorder: true, tripwire: true, roleGuard: true } }
const COMPOSER = { kind: 'composer' as const }

function engineBelow(on: On, w: World, exitCodeOf: (command: string) => number = () => 0): void {
  on('session.start', () => ({ cwd: w.root }))
  on('prompt.compose', () => ({ sections: [] }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({ text: 'engine: unknown command' }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('tool.call', (_$, e) => {
    const code = e.tool === 'Bash' ? exitCodeOf(String((e as { command?: string }).command)) : 0
    return (code === 0
      ? { result: { stdout: '', stderr: '', interrupted: false } }
      : { isError: true, result: `Exit code ${code}\nboom`, text: `Exit code ${code}\nboom` }) as never
  })
}

const start = ($: any, w: World) => $.session.start({ cwd: w.root, surface: null, isInteractive: true })
const bash = ($: any, command: string) => $.tool.call({ tool: 'Bash', command })
const write = ($: any, file_path: string) => $.tool.call({ tool: 'Write', file_path, content: 'x' })
const fwLog = async ($: any): Promise<string> => (await $.command.run({ command: 'fw-log', args: '', origin: COMPOSER })).text ?? ''
const release = ($: any, args: string) => $.command.run({ command: 'fw-role-release', args, origin: COMPOSER })
const hintOf = (r: { context?: readonly string[] }) => (r.context ?? []).join('\n')

/** The /fw-log table row of `command` (the first one), split into cells; undefined when it isn't recorded. */
function rowOf(log: string, command: string): string[] | undefined {
  const line = log.split('\n').find((l) => l.startsWith(`| \`${command.replace(/\|/g, '\\|')}\` |`))
  return line?.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim())
}
const resultOf = (log: string, command: string) => rowOf(log, command)?.[2] // command | kind | result | exit | …
const exitOf = (log: string, command: string) => rowOf(log, command)?.[3]

async function runIn($: any, on: On, opts: { scripts?: Record<string, string>; state?: string; exit?: (c: string) => number }, command: string): Promise<string> {
  const files: Record<string, string> = { '.flightwake/STATE.md': opts.state ?? STATE_FILLED, 'CLAUDE.md': MARKER('en') }
  if (opts.scripts) files['package.json'] = JSON.stringify({ scripts: opts.scripts })
  const w = installWorld(on, { files, git: gitBehind(0) })
  engineBelow(on, w, opts.exit)
  await start($, w)
  await bash($, command)
  return fwLog($)
}

describe('Astra round 2 — F3 cases that were recorded as pass', () => {
  test('script sh -c "pytest || true" is not a pass', async ($, on) => {
    const log = await runIn($, on, { scripts: { test: 'sh -c "pytest || true"' } }, 'npm test')
    expect(resultOf(log, 'npm test')).toBe('unknown')
  })
  test('script bash -c "pytest; exit 0" is not a pass', async ($, on) => {
    const log = await runIn($, on, { scripts: { test: 'bash -c "pytest; exit 0"' } }, 'npm test')
    expect(resultOf(log, 'npm test')).toBe('unknown')
  })
  test('cargo test --no-run is not a pass', async ($, on) => {
    expect(resultOf(await runIn($, on, {}, 'cargo test --no-run'), 'cargo test --no-run')).toBe('unknown')
  })
  test('jest --listTests=true is not a pass', async ($, on) => {
    expect(resultOf(await runIn($, on, {}, 'jest --listTests=true'), 'jest --listTests=true')).toBe('unknown')
  })
  test('mvn test -DskipTests is not a pass', async ($, on) => {
    expect(resultOf(await runIn($, on, {}, 'mvn test -DskipTests'), 'mvn test -DskipTests')).toBe('unknown')
  })
  test('pytest --help declared in STATE is not a pass (declaration is no back door)', async ($, on) => {
    const state = STATE_FILLED.replace('verify with `bash test/smoke.sh`', 'verify with `pytest --help`')
    expect(resultOf(await runIn($, on, { state }, 'pytest --help'), 'pytest --help')).toBe('unknown')
  })
  test('mvn test -V is recorded (regression: it vanished) and is a pass — -V prints the version and goes on', async ($, on) => {
    expect(resultOf(await runIn($, on, {}, 'mvn test -V'), 'mvn test -V')).toBe('pass')
  })
})

describe('Astra round 2 — F5 literal * rule vs release all', () => {
  test('rules ["*","src/**","src/private/**"]: releasing rule 1 releases only *', ALL_ON, async ($, on) => {
    const seat = '<!-- flightwake-roles:begin v0.14.0 lang=en src=R -->\n# Your role: pm — PM (the Claude Code in this folder)\n\ndeny-write: ["*", "src/**", "src/private/**"]\n<!-- flightwake-roles:end -->\n'
    const w = installWorld(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER('en') + seat }, git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    await release($, '1')
    expect((await write($, '/repo/README')).deny).toBeUndefined() // only * applied: released
    const r = await write($, '/repo/src/private/x.ts')
    expect(r.deny).toContain('src/**')
    expect(r.deny).toContain('src/private/**')
    await release($, 'src/**')
    await release($, 'src/private/**')
    expect((await write($, '/repo/src/private/x.ts')).deny).toBeUndefined()
    await release($, 'revoke')
    expect((await write($, '/repo/README')).deny).toBeDefined()
  })
})

const trapFile = (paths: string) => `# Trap Registry

---
name: t1
status: active
confidence: confirmed
paths: ${paths}
---

**Symptom**: s
**Root cause**: r
**Fix/workaround**: f
`

async function hintIn($: any, on: On, paths: string, command: string): Promise<string> {
  const w = installWorld(on, { files: { '.flightwake/STATE.md': STATE_FILLED, '.flightwake/TRAPS.md': trapFile(paths), 'CLAUDE.md': MARKER('en') }, git: gitBehind(0) })
  engineBelow(on, w)
  await start($, w)
  return hintOf(await bash($, command))
}

describe('Astra round 2 — F4 uncertain cwd and subshells', () => {
  test('cd pkg || rm src/a.ts: rm runs only if cd failed → src/a.ts hits src/**', async ($, on) => {
    expect(await hintIn($, on, '["src/**"]', 'cd pkg || rm src/a.ts')).toContain('t1')
  })
  test('cd pkg & rm src/a.ts: a background cd does not move this shell → src/a.ts hits src/**', async ($, on) => {
    expect(await hintIn($, on, '["src/**"]', 'cd pkg & rm src/a.ts')).toContain('t1')
  })
  test('(cd pkg && rm src/a.ts) hits pkg/src/**', async ($, on) => {
    expect(await hintIn($, on, '["pkg/src/**"]', '(cd pkg && rm src/a.ts)')).toContain('t1')
  })
  test('nested subshells: (cd pkg && (cd sub && rm a.ts)) hits pkg/sub/**', async ($, on) => {
    expect(await hintIn($, on, '["pkg/sub/**"]', '(cd pkg && (cd sub && rm a.ts))')).toContain('t1')
  })
})

describe('positive proof: everything is recorded; only proven runs are pass/fail', () => {
  const cases: Array<[string, Record<string, string> | undefined, string]> = [
    // [command, package scripts, expected result when the call exits 0]
    ['pytest -q -k fast tests/', undefined, 'pass'],
    ['pytest --frobnicate', undefined, 'unknown'], // a flag outside pytest's safe set
    ['npx vitest run --reporter=dot', undefined, 'pass'],
    ['vitest', undefined, 'unknown'], // bare vitest may watch
    ['go test -v -run TestX ./...', undefined, 'pass'],
    ['go test -c ./...', undefined, 'unknown'], // compiles only
    ['cargo test -- --nocapture', undefined, 'pass'],
    ['cargo test -- --list', undefined, 'unknown'],
    ['mvn -B clean test', undefined, 'pass'],
    ['mvn install -Dmaven.test.skip=true', undefined, 'unknown'],
    ['./gradlew test -x test', undefined, 'unknown'],
    ['sh -c "pytest"', undefined, 'unknown'], // wrapper
    ['xargs pytest < files.txt', undefined, 'unknown'],
    ['env CI=1 pytest', undefined, 'unknown'],
    ['CI=1 pytest', undefined, 'pass'], // a plain assignment prefix is not a wrapper
    ['eval pytest', undefined, 'unknown'],
    ['time pytest', undefined, 'unknown'],
    ['npm test', { test: 'jest --ci' }, 'pass'],
    ['npm test', { test: 'jest --listTests' }, 'unknown'],
    ['npm test -- --watch', { test: 'jest' }, 'unknown'], // extra args join the body and are judged too
    ['npm test', { test: 'node scripts/run-tests.js' }, 'pass'], // a declared script file, run directly
    ['npm test', { test: 'node -e "process.exit(0)"' }, 'unknown'], // inline code is not a script file
    ['npm run test:unit', { 'test:unit': 'npm test', test: 'vitest run' }, 'pass'], // nested script, judged through
  ]
  for (const [command, scripts, expected] of cases) {
    test(`${command}${scripts ? ` (scripts ${JSON.stringify(scripts)})` : ''} → recorded, ${expected}`, async ($, on) => {
      const log = await runIn($, on, scripts ? { scripts } : {}, command)
      expect(rowOf(log, command)).toBeDefined()
      expect(resultOf(log, command)).toBe(expected)
    })
  }
  test('an unproven run keeps its exit code and command', async ($, on) => {
    const log = await runIn($, on, { exit: () => 3 }, 'pytest --frobnicate')
    expect(resultOf(log, 'pytest --frobnicate')).toBe('unknown')
    expect(exitOf(log, 'pytest --frobnicate')).toBe('3')
  })
  test('a proven run that fails is a fail with its exit code', async ($, on) => {
    const log = await runIn($, on, { exit: () => 1 }, 'pytest -q')
    expect(resultOf(log, 'pytest -q')).toBe('fail')
    expect(exitOf(log, 'pytest -q')).toBe('1')
  })
  test('STATE-declared bash test/smoke.sh is a declared script file: proven', async ($, on) => {
    expect(resultOf(await runIn($, on, {}, 'bash test/smoke.sh'), 'bash test/smoke.sh')).toBe('pass')
  })
  test('cd prefix: exit 0 proves the run; a non-zero exit may be the cd → unknown, code kept', async ($, on) => {
    const log = await runIn($, on, { exit: () => 1 }, 'cd pkg && pytest -q')
    expect(resultOf(log, 'cd pkg && pytest -q')).toBe('unknown')
    expect(exitOf(log, 'cd pkg && pytest -q')).toBe('1')
  })
})
