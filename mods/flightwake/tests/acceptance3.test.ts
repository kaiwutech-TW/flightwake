// Acceptance review round 3 (docs/plans/mods.diff-review-astra-3.md). (1) F3's positive proof takes inline environment
// assignments and flag VALUES into account: an assignment outside a short harmless list, or a value outside the
// runner's known-safe range, leaves the run unknown — Astra ran real pytest/go: these exit 0 without running tests.
// (2) F4's candidate-cwd set is bounded: past the budget it degrades to tail matching instead of doubling per `cd`.
// Plus the cheap ones: --watchAll=false / --run / --disable-warnings, `cd -- dir`, output-redirect targets.
import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { tableCell } from '../hooks/lib/core'
import { gitBehind, installWorld, MARKER, STATE_FILLED, tableCells, type World } from './world'

const COMPOSER = { kind: 'composer' as const }

function engineBelow(on: On, w: World): void {
  on('session.start', () => ({ cwd: w.root }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({ text: 'engine: unknown command' }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }) as never)
}

const start = ($: any, w: World) => $.session.start({ cwd: w.root, surface: null, isInteractive: true })
const bash = ($: any, command: string) => $.tool.call({ tool: 'Bash', command })
const fwLog = async ($: any): Promise<string> => (await $.command.run({ command: 'fw-log', args: '', origin: COMPOSER })).text ?? ''
const hintOf = (r: { context?: readonly string[] }) => (r.context ?? []).join('\n')

function resultOf(log: string, command: string): string | undefined {
  const line = log.split('\n').find((l) => l.startsWith(`| \`${tableCell(command)}\` |`))
  return line === undefined ? undefined : tableCells(line)[2]
}

async function logOf($: any, on: On, command: string, scripts?: Record<string, string>): Promise<string> {
  const files: Record<string, string> = { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER('en') }
  if (scripts) files['package.json'] = JSON.stringify({ scripts })
  const w = installWorld(on, { files, git: gitBehind(0) })
  engineBelow(on, w)
  await start($, w)
  await bash($, command)
  return fwLog($)
}

describe('(1) F3: environment assignments and flag values are part of the proof', () => {
  const unknownCases: Array<[string, Record<string, string>?]> = [
    ['PYTEST_ADDOPTS=--collect-only pytest'],
    ['npm test', { test: 'PYTEST_ADDOPTS=--collect-only pytest' }],
    ['pytest -o addopts=--collect-only'],
    ['go test -count=0 ./...'],
    ['go test -run "^$" ./...'],
    ['go test -run=^$ ./...'],
    ['cargo test some_filter'], // a name filter that matches nothing still exits 0 ("running 0 tests")
    ['jest -t nothing-matches'],
    ['pytest -c other.ini'], // a config file can carry addopts
    ['mvn test -Pskip-everything'], // a profile can set skipTests
    ['npm test', { test: 'go test -count=0 ./...' }],
  ]
  for (const [command, scripts] of unknownCases) {
    test(`${command}${scripts ? ` (script ${JSON.stringify(scripts.test)})` : ''} is not a pass`, async ($, on) => {
      expect(resultOf(await logOf($, on, command, scripts), command)).toBe('unknown')
    })
  }
  const passCases = ['CI=1 pytest', 'NO_COLOR=1 FORCE_COLOR=0 pytest -q', 'go test -count=1 ./...', 'go test -count 2 -v ./...',
    'pytest -k fast -n auto --maxfail=1', 'pytest --disable-warnings', 'jest --watchAll=false', 'npx vitest --run', 'cargo test --release']
  for (const command of passCases) {
    test(`${command} stays a pass`, async ($, on) => {
      expect(resultOf(await logOf($, on, command), command)).toBe('pass')
    })
  }
  test('/fw-log says what pass means — and what it cannot see', async ($, on) => {
    const log = await logOf($, on, 'pytest -q')
    expect(log).toMatch(/directly called runner ran recognisably and returned 0/i)
    expect(log).toMatch(/config files|environment/i)
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

describe('(2) F4: the candidate-cwd set is bounded', () => {
  const manyCds = Array.from({ length: 24 }, (_, i) => `cd d${i}`).join('; ')
  test('24 uncertain cds (2^24 candidates unbounded) finish fast and still hint (degraded to tail matching)', { timeoutMs: 3000 }, async ($, on) => {
    expect(await hintIn($, on, '["src/**"]', `${manyCds}; rm src/a.ts`)).toContain('t1')
  })
  test('degraded matching still finds a deeper glob by its tail: pkg/src/** after many cds', { timeoutMs: 3000 }, async ($, on) => {
    expect(await hintIn($, on, '["pkg/src/**"]', `${manyCds}; rm src/a.ts`)).toContain('t1')
  })
})

describe('cheap F4 coverage additions', () => {
  test('cd -- pkg && rm src/a.ts hits pkg/src/**', async ($, on) => {
    expect(await hintIn($, on, '["pkg/src/**"]', 'cd -- pkg && rm src/a.ts')).toContain('t1')
  })
  test('echo x >pkg/src/a.ts (redirect target) hits pkg/src/**', async ($, on) => {
    expect(await hintIn($, on, '["pkg/src/**"]', 'echo x >pkg/src/a.ts')).toContain('t1')
  })
  test('echo x >> pkg/src/a.ts (separate target word) hits pkg/src/**', async ($, on) => {
    expect(await hintIn($, on, '["pkg/src/**"]', 'echo x >> pkg/src/a.ts')).toContain('t1')
  })
})
