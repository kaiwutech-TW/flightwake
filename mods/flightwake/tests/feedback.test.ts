// Field feedback (2026-10-05, a real Claude Code session): shell-inferred file changes in /fw-log, local time,
// a one-time hint for chained test runs, the band always shown without the bottom gauge, and /fw-mod.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { shellWriteTargets } from '../hooks/lib/shell'
import { gitBehind, installWorld, MARKER, STATE_FILLED, STATE_TEMPLATE } from './world'
import type { World } from './world'

const T0 = Date.UTC(2026, 9, 4, 19, 32, 10) // 2026-10-04 19:32:10 UTC = 2026-10-05 03:32:10 at +0800
const OK = { result: { stdout: '', stderr: '', interrupted: false }, text: '' }
const gitClean = { 'rev-parse HEAD': 'abcdef1234567890', 'status --porcelain': '' }
const RUN = (command: string) => ({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } }) as never
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const GAUGE = { statusLine: { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.flightwake/hooks/statusline.mjs"' } }

/** World + a host for every $.state key + command registry + a scripted tool result. */
function boot(on: On, init: Partial<World> = {}, answer: (e: any) => any = () => OK) {
  const w = installWorld(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': MARKER('en'), 'package.json': '{"scripts":{"test":"vitest run"}}' }, git: { ...gitClean, ...gitBehind(0) }, ...init })
  mock.clock(on, { now: T0 })
  const state = new Map<string, { value: unknown; version: number }>()
  on('state.get', (_$, e) => ({ value: state.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', (_$, e) => {
    const cur = state.get(e.key) ?? { value: undefined, version: 0 }
    if (e.ifVersion !== undefined && e.ifVersion !== cur.version) return { value: { isSet: false as const, version: cur.version } }
    state.set(e.key, { value: e.value, version: cur.version + 1 })
    return { value: { isSet: true as const, version: cur.version + 1 } }
  })
  const registered: string[] = []
  on('command.register', (_$, e) => { registered.push(e.name); return { value: { command: e.name } } })
  on('session.start', () => ({ cwd: w.root }))
  on('session.turns', () => ({ value: 3 }))
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { window: 200000, percent: 12 } } }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine-band'] }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('prompt.compose', () => ({ sections: [] }) as never)
  on('tool.call', (_$, e) => answer(e))
  return { w, state, registered }
}
const logOf = (s: Map<string, { value: unknown }>) => s.get('flightLog')?.value as any

describe('shellWriteTargets: what a command writes, as far as the words say', () => {
  test('redirections, cp, mv, rm, tee, sed -i; fd duplications and /dev/null are not files', () => {
    const t = (c: string) => shellWriteTargets(c).map((x) => `${x.path}<${x.via}`)
    expect(t(`echo '-- touched' >> db/schema.sql`)).toEqual(['db/schema.sql<>>'])
    expect(t('echo x >out.txt 2>&1')).toEqual(['out.txt<>'])
    expect(t('npm test 2>&1 >/dev/null')).toEqual([])
    expect(t('cp -r a.sql db/b.sql')).toEqual(['db/b.sql<cp'])
    expect(t('mv old.ts new.ts')).toEqual(['old.ts<mv', 'new.ts<mv'])
    expect(t('rm -f x.ts y.ts')).toEqual(['x.ts<rm', 'y.ts<rm'])
    expect(t('ls | tee -a out.log')).toEqual(['out.log<tee'])
    expect(t(`sed -i '' 's/a/b/' f.txt`)).toEqual(['f.txt<sed -i'])
    expect(t('sed -i.bak s/a/b/ g.txt h.txt')).toEqual(['g.txt<sed -i', 'h.txt<sed -i'])
    expect(t('sed s/a/b/ f.txt')).toEqual([])
    expect(t('cat a > "$OUT"')).toEqual([])
  })
})

describe('recorder: files changed through shell commands', () => {
  test('listed apart from tool edits, resolved against the cwd, and labelled as inferred in /fw-log', async ($, on) => {
    const { state } = boot(on)
    await $.session.start(START)
    await $.tool.call({ tool: 'Write', file_path: '/repo/src/a.ts', content: 'x' } as never)
    await $.tool.call({ tool: 'Bash', command: `echo '-- touched' >> db/schema.sql && cp db/schema.sql db/backup.sql && echo x > /tmp/elsewhere` })
    const log = logOf(state)
    expect(log.files.map((f: any) => f.path)).toEqual(['src/a.ts'])
    expect(log.shellFiles.map((f: any) => `${f.path}<${f.via}`)).toEqual(['db/schema.sql<>>', 'db/backup.sql<cp'])
    const out = (await $.command.run(RUN('fw-log'))).text as string
    expect(out).toContain('src/a.ts')
    expect(out).toMatch(/inferred from the commands.*may be incomplete/i)
    expect(out.indexOf('db/schema.sql')).toBeGreaterThan(out.indexOf('inferred from the commands'))
  })

  test('a denied or failed command still lists nothing it did not get to run (denied → nothing)', async ($, on) => {
    const { state } = boot(on, {}, (e) => (e.tool === 'Bash' ? { deny: 'no' } : OK))
    await $.session.start(START)
    await $.tool.call({ tool: 'Bash', command: 'rm -f important.sql' })
    expect(logOf(state)?.shellFiles ?? []).toEqual([])
  })
})

describe('recorder: local time in /fw-log', () => {
  test('finished time shows local time with its offset, and UTC', async ($, on) => {
    const { w } = boot(on)
    w.tzOffset = '+0800'
    await $.session.start(START)
    await $.tool.call({ tool: 'Bash', command: 'vitest run' })
    const out = (await $.command.run(RUN('fw-log'))).text as string
    expect(out).toContain('2026-10-05 03:32:10 +0800')
    expect(out).toContain('19:32:10 UTC')
  })

  test('offset unreadable → UTC only, labelled', async ($, on) => {
    boot(on)
    await $.session.start(START)
    await $.tool.call({ tool: 'Bash', command: 'vitest run' })
    const out = (await $.command.run(RUN('fw-log'))).text as string
    expect(out).toContain('2026-10-04 19:32:10 UTC')
  })
})

describe('recorder: one hint per session for a test run chained with other commands', () => {
  const chained = `echo "== tests" && npm test 2>&1; echo exit=$?`
  test('first chained run gets the hint in the tool result context; the second does not; a plain run never does', async ($, on) => {
    const { state } = boot(on)
    await $.session.start(START)
    const r1 = await $.tool.call({ tool: 'Bash', command: chained })
    expect(logOf(state).tests[0].reason).toBe('compound')
    expect((r1.context ?? []).join('\n')).toMatch(/chained with other commands.*run the test command on its own/is)
    const r2 = await $.tool.call({ tool: 'Bash', command: chained })
    expect((r2.context ?? []).join('\n')).not.toMatch(/chained with other commands/i)
    const r3 = await $.tool.call({ tool: 'Bash', command: 'vitest run' })
    expect((r3.context ?? []).join('\n')).not.toMatch(/chained/i)
    expect(r1.deny).toBeUndefined()
  })
})

describe('band: always shown without the bottom gauge', () => {
  test('healthy, in sync, 12% context and no gauge → the band shows, with the context percent', async ($, on) => {
    const { state } = boot(on)
    await $.session.start(START)
    expect((state.get('bandView')?.value as any)?.isQuiet).toBe(false)
    const ui = await $.ui.mount({ plugin: 'flightwake-mod', component: 'AbovePrompt', surface: 'terminal', props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 100 } as never })
    expect(await ui.find({ type: 'Text', text: /flightwake/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /12%/ })).toBeDefined()
    await ui.unmount()
  })

  test('with the bottom gauge as the effective status line → quiet, as before', async ($, on) => {
    const { state } = boot(on, { settings: GAUGE })
    await $.session.start(START)
    expect((state.get('bandView')?.value as any)?.isQuiet).toBe(true)
  })
})

describe('/fw-mod: what each feature is doing and why', () => {
  test('default switches: version, language, profile and a line per feature', async ($, on) => {
    const { registered } = boot(on, { files: { '.flightwake/STATE.md': STATE_FILLED, 'CLAUDE.md': '<!-- flightwake:begin v0.14.0 lang=en profile=notes -->\nx\n<!-- flightwake:end -->\n', '.flightwake/TRAPS.md': '# Trap Registry\n' } })
    await $.session.start(START)
    expect(registered).toContain('fw-mod')
    const out = (await $.command.run(RUN('fw-mod'))).text as string
    expect(out).toMatch(/flightwake-mod v\d+\.\d+\.\d+/)
    expect(out).toMatch(/language: en/)
    expect(out).toMatch(/profile: notes/)
    expect(out).toMatch(/STATE.*on.*injected/i)
    expect(out).toMatch(/band.*on.*shown above the prompt/i)
    expect(out).toMatch(/flight log.*on/i)
    expect(out).toMatch(/tripwire.*idle.*no active TRAPS entry has paths or commands/i)
    expect(out).toMatch(/role guard.*off/i)
    expect(out).toContain('flightwake-mod@skills-dir')
  })

  test('gauge present → band reported hidden because of the gauge; STATE template → only the hint was injected', async ($, on) => {
    boot(on, { settings: GAUGE, files: { '.flightwake/STATE.md': STATE_TEMPLATE, 'CLAUDE.md': MARKER('en') } })
    await $.session.start(START)
    const out = (await $.command.run(RUN('fw-mod'))).text as string
    expect(out).toMatch(/band.*on.*hid.*bottom gauge/i)
    expect(out).toMatch(/STATE.*not initialized/i)
  })

  test('role guard on but the seat has no role → idle with the reason', { options: { roleGuard: true } }, async ($, on) => {
    boot(on)
    await $.session.start(START)
    const out = (await $.command.run(RUN('fw-mod'))).text as string
    expect(out).toMatch(/role guard.*idle.*no role/i)
  })

  test('switch off → says how to turn it on', { options: { tripwire: false } }, async ($, on) => {
    boot(on)
    await $.session.start(START)
    const out = (await $.command.run(RUN('fw-mod'))).text as string
    expect(out).toMatch(/tripwire.*off.*"tripwire": true/i)
  })

  test('read-only: no writes, and not registered where flightwake is not installed', async ($, on) => {
    const { w, registered } = boot(on, { files: {} })
    await $.session.start(START)
    expect(registered).not.toContain('fw-mod')
    expect(w.writes).toEqual([])
  })
})
