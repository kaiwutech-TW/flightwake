// Acceptance review 2026-10-05 (docs/plans/mods.diff-review-astra.md): one describe per adopted item, each case
// written to fail on 1faec87 before its fix. Items: (1) F3 never records an unproven pass, (2) F5 overlapping rules,
// (3) uninstalled folders stay silent + F5 snapshot bound to root, (4) zero writes (git --no-optional-locks),
// (5) F4 resolves paths against the real cwd / cd and the parser keeps lines after a comment, (6) F1 template
// detection and marker attributes, (7) /fw-role-release requires the composer origin; plus lifecycle cases.
import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { detectLang, isUninitializedState, tableCell } from '../hooks/lib/core'
import { parseCommand } from '../hooks/lib/shell'
import { fakeIo, gitBehind, installWorld, MARKER, newWorld, STATE_FILLED, type World } from './world'

const ALL_ON = { options: { stateInject: true, band: true, recorder: true, tripwire: true, roleGuard: true } }

const seat = (deny: string) => `<!-- flightwake-roles:begin v0.14.0 lang=en src=ROLES.md -->
# Your role: pm — Project manager (the Claude Code in this folder)

deny-write: ${deny}
<!-- flightwake-roles:end -->
`

const trap = (field: string) => `# Trap Registry

---
name: pkg-src-trap
status: active
confidence: confirmed
${field}
---

**Symptom**: s
**Root cause**: TRAP-ROOT
**Fix/workaround**: f
`

type Probe = { registered: string[] }

function engineBelow(on: On, w: World, opts: { isUsageFailing?: boolean } = {}): Probe {
  const p: Probe = { registered: [] }
  on('session.start', () => ({ cwd: w.root }))
  on('session.end', () => ({ sessionId: w.sessionId }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'engine', scope: 'shared' as const }] }))
  on('turn.complete', () => ({}) as never)
  on('session.turns', () => ({ value: 1 }))
  on('session.usage', () => (opts.isUsageFailing ? { deny: 'usage unavailable' } : { value: { startedAt: 0, context: { window: 200000, percent: 10 }, rateLimits: [] } }) as never)
  on('command.register', (_$, e) => {
    p.registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('command.run', () => ({ text: 'engine: unknown command' }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }) as never)
  return p
}

const COMPOSER = { kind: 'composer' as const }
const start = ($: any, w: World) => $.session.start({ cwd: w.root, surface: null, isInteractive: true })
const compose = async ($: any): Promise<string | undefined> => {
  const r = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
  return r.sections.find((s: { id: string }) => s.id === 'flightwake-mod:state')?.text
}
const bash = ($: any, command: string, extra: object = {}) => $.tool.call({ tool: 'Bash', command, ...extra })
const write = ($: any, file_path: string, extra: object = {}) => $.tool.call({ tool: 'Write', file_path, content: 'x', ...extra })
const fwLog = async ($: any): Promise<string> => (await $.command.run({ command: 'fw-log', args: '', origin: COMPOSER })).text ?? ''
/** `origin: null` sends no origin at all (an unstamped run). */
const release = ($: any, args: string, origin: object | null = COMPOSER) =>
  $.command.run(origin ? { command: 'fw-role-release', args, origin } : { command: 'fw-role-release', args })
const hintOf = (r: { context?: readonly string[] }) => (r.context ?? []).join('\n')
const installed = (extra: Record<string, string> = {}) => ({ '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER('en'), ...extra })

describe('(1) F3 never records an unproven pass', () => {
  for (const script of ['pytest | cat', 'pytest; echo done', 'jest && echo ok || true', 'vitest run $(cat files)']) {
    test(`npm test whose script is "${script}" is not a pass`, async ($, on) => {
      const w = installWorld(on, { files: installed({ 'package.json': JSON.stringify({ scripts: { test: script } }) }), git: gitBehind(0) })
      engineBelow(on, w)
      await start($, w)
      await bash($, 'npm test')
      const log = await fwLog($)
      expect(log).toContain('npm test')
      expect(log).not.toMatch(/\| pass \|/)
      expect(log).toMatch(/\| unknown \|/)
    })
  }
  // Round 2 changed the contract: such runs are recorded (command and exit code kept) as unknown, never dropped.
  for (const cmd of ['pytest --help', 'pytest -h', 'jest --version', 'vitest --version', 'pytest --collect-only', 'jest --listTests',
    'go test -list .', 'cargo test -- --list', 'playwright test --list', 'npm test -- --help', 'jest --watch', 'vitest list']) {
    test(`"${cmd}" runs no tests: recorded as unknown, never pass`, async ($, on) => {
      const w = installWorld(on, { files: installed({ 'package.json': JSON.stringify({ scripts: { test: 'jest' } }) }), git: gitBehind(0) })
      engineBelow(on, w)
      await start($, w)
      await bash($, cmd)
      const log = await fwLog($)
      expect(log).toContain(tableCell(cmd))
      expect(log).not.toMatch(/\| pass \|/)
      expect(log).toMatch(/\| unknown \|/)
    })
  }
  test('npm test whose script only lists tests is recorded as unknown', async ($, on) => {
    const w = installWorld(on, { files: installed({ 'package.json': JSON.stringify({ scripts: { test: 'jest --listTests' } }) }), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    await bash($, 'npm test')
    const log = await fwLog($)
    expect(log).not.toMatch(/\| pass \|/)
    expect(log).toMatch(/\| unknown \|/)
  })
  test('a plain recognised run still records pass (no regression)', async ($, on) => {
    const w = installWorld(on, { files: installed({ 'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }) }), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    await bash($, 'npm test')
    expect(await fwLog($)).toMatch(/\| pass \|/)
  })
})

describe('(2) F5 overlapping rules', () => {
  test('releasing src/** does not release src/private/**', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: installed({ 'CLAUDE.md': MARKER('en') + seat('["src/**", "src/private/**"]') }), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    await release($, 'src/**')
    expect((await write($, '/repo/src/a.ts')).deny).toBeUndefined()
    const r = await write($, '/repo/src/private/x.ts')
    expect(r.deny).toBeDefined()
    expect(r.deny).toContain('src/private/**')
    await release($, 'src/private/**')
    expect((await write($, '/repo/src/private/x.ts')).deny).toBeUndefined()
  })
})

describe('(3) uninstalled folders stay silent; F5 snapshot is bound to the root', () => {
  test('F5: a roles block without .flightwake/STATE.md guards nothing', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: { 'CLAUDE.md': seat('["src/**"]') }, git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    expect((await write($, '/repo/src/a.ts')).deny).toBeUndefined()
  })
  test('F3: nothing is recorded where flightwake is not installed, and /fw-log is not registered', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: { 'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }) }, git: gitBehind(0) })
    const p = engineBelow(on, w)
    await start($, w)
    await bash($, 'npm test')
    await write($, '/repo/src/a.ts')
    expect(p.registered).not.toContain('fw-log')
    w.files['.flightwake/STATE.md'] = STATE_FILLED // installed later in the same session: earlier activity was not kept
    expect(await fwLog($)).toContain('Nothing observed yet')
  })
  test('F5: same session, another root — the old seat does not follow', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: installed({ 'CLAUDE.md': MARKER('en') + seat('["src/**"]') }), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    expect((await write($, '/repo/src/a.ts')).deny).toBeDefined()
    w.root = '/other'
    w.files = installed() // installed, but no seat there
    expect((await write($, '/other/src/a.ts')).deny).toBeUndefined()
    w.files = { 'CLAUDE.md': seat('["src/**"]') } // a seat but no flightwake install
    expect((await write($, '/other/src/a.ts')).deny).toBeUndefined()
  })
})

describe('(4) zero writes: every git call carries --no-optional-locks', () => {
  test('a session touching every feature runs git only with --no-optional-locks', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: installed({ 'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }) }), git: gitBehind(4) })
    engineBelow(on, w)
    await start($, w)
    await compose($)
    await bash($, 'npm test')
    await bash($, 'git commit -m x')
    await write($, '/repo/a.ts')
    await $.turn.complete({} as never).catch(() => undefined)
    expect(w.gitCalls.length).toBeGreaterThan(0)
    expect(w.gitWithoutNoLocks).toEqual([])
    expect(w.writes).toEqual([])
    // scripts/git-readonly-check.sh proves this exact subcommand set leaves a real .git/index byte-identical
    expect([...new Set(w.gitCalls.map((c) => c.split(' ')[0]))].sort()).toEqual(['log', 'rev-list', 'rev-parse', 'status'])
  })
})

describe('(5) F4 resolves relative paths against the real cwd; comments end a line, not the command', () => {
  test('cd pkg && rm src/a.ts hits paths: ["pkg/src/**"]', async ($, on) => {
    const w = installWorld(on, { files: installed({ '.flightwake/TRAPS.md': trap('paths: ["pkg/src/**"]') }), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    expect(hintOf(await bash($, 'cd pkg && rm src/a.ts'))).toContain('pkg-src-trap')
  })
  test('a session whose cwd is /repo/pkg: rm src/a.ts hits pkg/src/**', async ($, on) => {
    const w = installWorld(on, { files: installed({ '.flightwake/TRAPS.md': trap('paths: ["pkg/src/**"]') }), git: gitBehind(0), cwd: '/repo/pkg' })
    engineBelow(on, w)
    await start($, w)
    expect(hintOf(await bash($, 'rm src/a.ts'))).toContain('pkg-src-trap')
  })
  test('cd pkg && rm src/a.ts does NOT hit paths: ["src/**"] (that file is pkg/src/a.ts)', async ($, on) => {
    const w = installWorld(on, { files: installed({ '.flightwake/TRAPS.md': trap('paths: ["src/**"]') }), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    expect(hintOf(await bash($, 'cd pkg && rm src/a.ts'))).toBe('')
  })
  test('a command on the line after a # comment is still matched', async ($, on) => {
    const w = installWorld(on, { files: installed({ '.flightwake/TRAPS.md': trap('commands: ["git push"]') }), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    expect(hintOf(await bash($, 'echo hi # then push\ngit push origin main'))).toContain('pkg-src-trap')
  })
  test('parser: a comment ends its line only', () => {
    expect(parseCommand('echo a # c && rm -rf x\nnpm test').segments.map((s) => s.tokens)).toEqual([['echo', 'a'], ['npm', 'test']])
  })
  test('the hint says it arrives after the call and is for next time', async ($, on) => {
    const w = installWorld(on, { files: installed({ '.flightwake/TRAPS.md': trap('commands: ["git push"]') }), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    expect(hintOf(await bash($, 'git push'))).toMatch(/after this call ran|next time/i)
  })
})

describe('(6) F1 template detection and marker attributes', () => {
  test('a filled STATE that documents {{customer}} / {{order}} placeholders is not a template', async ($, on) => {
    const state = STATE_FILLED.replace('- verify with', '- mail merge fields are `{{customer}}` and `{{order}}`\n- verify with')
    expect(isUninitializedState(state)).toBe(false)
    const w = installWorld(on, { files: installed({ '.flightwake/STATE.md': state }), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    expect(await compose($)).toContain('migrate the billing table')
  })
  test('the shipped template is still detected (frontmatter placeholders)', () => {
    expect(isUninitializedState('---\nupdated: {{DATE}}\nupdated_by: {{SESSION_OR_PERSON}}\nlatest_record: records/{{YYMMDD}}-{{slug}}.md\nhealth: green\n---\n')).toBe(true)
  })
  test('marker with extra attributes keeps its language', async () => {
    const io = fakeIo(newWorld({ files: { 'CLAUDE.md': '<!-- flightwake:begin v0.15.0 lang=zh-TW profile=notes -->\nx\n<!-- flightwake:end -->' } }))
    expect(await detectLang(io, '/repo')).toBe('zh-TW')
    const io2 = fakeIo(newWorld({ files: { 'CLAUDE.md': '<!-- flightwake:begin v0.15.0 profile=notes lang=ja -->' } }))
    expect(await detectLang(io2, '/repo')).toBe('ja')
  })
  test('AGENTS.md / GEMINI.md markers give the language when CLAUDE.md has none', async () => {
    expect(await detectLang(fakeIo(newWorld({ files: { 'AGENTS.md': MARKER('ja') } })), '/repo')).toBe('ja')
    expect(await detectLang(fakeIo(newWorld({ files: { 'GEMINI.md': MARKER('zh-CN') } })), '/repo')).toBe('zh-CN')
    expect(await detectLang(fakeIo(newWorld({ files: { 'CLAUDE.md': MARKER('en'), 'AGENTS.md': MARKER('ja') } })), '/repo')).toBe('en')
  })
})

describe('(7) /fw-role-release requires the composer origin', () => {
  test('no origin is refused; composer is accepted', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: installed({ 'CLAUDE.md': MARKER('en') + seat('["src/**"]') }), git: gitBehind(0) })
    engineBelow(on, w)
    await start($, w)
    const refused = await release($, 'all', null)
    expect(refused.text).toMatch(/only works when you type it yourself/)
    expect((await write($, '/repo/src/a.ts')).deny).toBeDefined()
    await release($, 'all')
    expect((await write($, '/repo/src/a.ts')).deny).toBeUndefined()
  })
})

describe('lifecycle cases the first round missed', () => {
  test('settings.read failing: F1, F3, F4, F5 keep working', ALL_ON, async ($, on) => {
    const w = installWorld(on, {
      files: installed({ 'CLAUDE.md': MARKER('en') + seat('["src/**"]'), '.flightwake/TRAPS.md': trap('commands: ["git push"]'), 'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }) }),
      git: gitBehind(0),
      isSettingsFailing: true,
    })
    engineBelow(on, w)
    await start($, w)
    expect(await compose($)).toContain('migrate the billing table')
    expect((await write($, '/repo/src/a.ts')).deny).toBeDefined()
    expect(hintOf(await bash($, 'git push'))).toContain('pkg-src-trap')
    await bash($, 'npm test')
    expect(await fwLog($)).toMatch(/\| pass \|/)
  })
  test('one feature failing (TRAPS.md unreadable: only F4 reads it) does not affect the others or the tool result', ALL_ON, async ($, on) => {
    const w = installWorld(on, {
      files: installed({ 'CLAUDE.md': MARKER('en') + seat('["src/**"]'), '.flightwake/TRAPS.md': trap('commands: ["vitest"]'), 'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }) }),
      git: gitBehind(0),
      failReads: ['.flightwake/TRAPS.md'],
    })
    engineBelow(on, w)
    await start($, w)
    const r = await bash($, 'vitest run')
    expect(r.result).toEqual({ stdout: '', stderr: '', interrupted: false })
    expect(hintOf(r)).toBe('')
    expect(await fwLog($)).toMatch(/\| pass \|/)
    expect(await compose($)).toContain('migrate the billing table')
    expect((await write($, '/repo/src/a.ts')).deny).toBeDefined()
  })
  test('one feature failing (session.usage refused: only F2 asks) leaves the others intact', ALL_ON, async ($, on) => {
    const w = installWorld(on, { files: installed({ 'CLAUDE.md': MARKER('en') + seat('["src/**"]') }), git: gitBehind(5) })
    engineBelow(on, w, { isUsageFailing: true })
    await start($, w)
    expect(await compose($)).toContain('migrate the billing table')
    expect((await write($, '/repo/src/a.ts')).deny).toBeDefined()
  })
})
