// F4 tripwire: hints appended to tool results from TRAPS paths/commands matches; never blocks.
import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { installWorld, MARKER, STATE_FILLED, STATE_TEMPLATE } from './world'
import type { World } from './world'

type Fields = { paths?: string; commands?: string; status?: string; confidence?: string | null; note?: string }

const entry = (name: string, f: Fields = {}): string =>
  [
    '---',
    `name: ${name}`,
    'type: trap',
    `status: ${f.status ?? 'active'}`,
    ...(f.confidence === null ? [] : [`confidence: ${f.confidence ?? 'confirmed'}`]),
    ...(f.paths ? [`paths: ${f.paths}`] : []),
    ...(f.commands ? [`commands: ${f.commands}`] : []),
    '---',
    '',
    `**Symptom**: symptom of ${name}`,
    `**Root cause**: cause of ${name}${f.note ?? ''}`,
    `**Fix**: fix of ${name}`,
    '',
  ].join('\n')

const traps = (...entries: string[]): string => `# Trap Registry\n\n${entries.join('\n')}`

const FILES = (t: string | null, extra: Record<string, string> = {}): Record<string, string> => ({
  '.flightwake/STATE.md': STATE_FILLED,
  ...(t === null ? {} : { '.flightwake/TRAPS.md': t }),
  ...extra,
})

/** The test hook beneath the plugin stands for the engine: it answers the tool. */
function engine(on: On, answer: () => Record<string, unknown> = () => ({ result: 'ok', text: 'ok' })): void {
  on('tool.call', () => answer() as never)
}

const write = (path: string) => ({ tool: 'Write', file_path: path, content: 'x' }) as never
const bash = (command: string) => ({ tool: 'Bash', command }) as never
const ctx = (r: { context?: readonly string[] }): string => (r.context ?? []).join('\n')

function setup(on: On, t: string | null, init: Partial<World> = {}): World {
  const w = installWorld(on, { files: FILES(t), ...init })
  engine(on)
  return w
}

describe('tripwire: silent degrade', () => {
  test('feature off → no effect', { options: { tripwire: false } }, async ($, on) => {
    setup(on, traps(entry('sql', { paths: '["*.sql"]' })))
    const r = await $.tool.call(write('/repo/db/a.sql'))
    expect(r.context).toBeUndefined()
  })

  test('no .flightwake/ → nothing', async ($, on) => {
    const w = installWorld(on, { files: {} })
    engine(on)
    const r = await $.tool.call(write('/repo/db/a.sql'))
    expect(r.context).toBeUndefined()
    expect(w.writes).toEqual([])
  })

  test('STATE template → nothing visible beyond hint rules (still reads TRAPS only when installed)', async ($, on) => {
    installWorld(on, { files: { '.flightwake/STATE.md': STATE_TEMPLATE } })
    engine(on)
    const r = await $.tool.call(write('/repo/db/a.sql'))
    expect(r.context).toBeUndefined()
  })

  test('no TRAPS file', async ($, on) => {
    setup(on, null)
    const r = await $.tool.call(write('/repo/db/a.sql'))
    expect(r.context).toBeUndefined()
  })

  test('empty TRAPS', async ($, on) => {
    setup(on, '')
    expect((await $.tool.call(write('/repo/a.sql'))).context).toBeUndefined()
  })

  test('template-only TRAPS', async ($, on) => {
    setup(
      on,
      '# Trap Registry\n\n---\nname: {{kebab-case-slug}}\ntype: trap\nstatus: active\npaths: ["*.sql"]\n---\n\n**Symptom**: {{x}}\n',
    )
    expect((await $.tool.call(write('/repo/a.sql'))).context).toBeUndefined()
  })

  test('not a git repo and no roles do not matter', async ($, on) => {
    setup(on, traps(entry('sql', { paths: '["*.sql"]' })), { git: null })
    expect(ctx(await $.tool.call(write('/repo/a.sql')))).toContain('`sql`')
  })

  test('entry without matchers is ignored', async ($, on) => {
    setup(on, traps(entry('plain')))
    expect((await $.tool.call(write('/repo/anything.ts'))).context).toBeUndefined()
    expect((await $.tool.call(bash('git push'))).context).toBeUndefined()
  })
})

describe('tripwire: matching', () => {
  test('path glob hit on Write; basename pattern at depth', async ($, on) => {
    setup(on, traps(entry('sql', { paths: '["*.sql"]' })))
    const r = await $.tool.call(write('/repo/db/migrations/001.sql'))
    const c = ctx(r)
    expect(c).toContain('flightwake TRAPS: `sql` [confirmed] matches db/migrations/001.sql')
    expect(c).toContain('cause of sql')
    expect(c).toContain('fix of sql')
    expect(c).not.toContain('symptom of sql')
    expect(c).toContain('Full entry: .flightwake/TRAPS.md')
    expect(r.text).toBe('ok')
  })

  test('Edit and NotebookEdit targets', async ($, on) => {
    setup(on, traps(entry('src', { paths: '["src/**"]' })))
    expect(ctx(await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' } as never))).toContain('`src`')
  })

  test('command prefix hit on Bash, also after cd x &&', async ($, on) => {
    const w = setup(on, traps(entry('pub', { commands: '["npm publish"]' })))
    expect(ctx(await $.tool.call(bash('npm publish --tag next')))).toContain('matches npm publish')
    w.sessionId = 'session-2'
    expect(ctx(await $.tool.call(bash('cd pkg && npm publish')))).toContain('`pub`')
  })

  test('non-hit', async ($, on) => {
    setup(on, traps(entry('pub', { commands: '["npm publish"]', paths: '["*.sql"]' })))
    expect((await $.tool.call(bash('npm test'))).context).toBeUndefined()
    expect((await $.tool.call(bash('echo "npm publish"'))).context).toBeUndefined()
    expect((await $.tool.call(write('/repo/a.ts'))).context).toBeUndefined()
  })

  test('relative path token in a Bash command matches paths', async ($, on) => {
    setup(on, traps(entry('sql', { paths: '["db/**"]' })))
    expect(ctx(await $.tool.call(bash('sed -i s/a/b/ db/x.sql')))).toContain('matches db/x.sql')
    expect((await $.tool.call(bash('curl https://example.com/db/x.sql'))).context).toBeUndefined()
  })

  test('superseded entries are ignored; missing status counts as active', async ($, on) => {
    const noStatus = entry('nostatus', { paths: '["*.sql"]' }).replace('status: active\n', '')
    setup(on, traps(entry('old', { paths: '["*.sql"]', status: 'superseded' }), noStatus))
    const c = ctx(await $.tool.call(write('/repo/a.sql')))
    expect(c).not.toContain('`old`')
    expect(c).toContain('`nostatus`')
  })

  test('outside-root path is not matched', async ($, on) => {
    setup(on, traps(entry('sql', { paths: '["*.sql"]' })))
    expect((await $.tool.call(write('/elsewhere/a.sql'))).context).toBeUndefined()
    expect((await $.tool.call(write('/repo/../x/a.sql'))).context).toBeUndefined()
  })
})

describe('tripwire: dedup', () => {
  test('hinted once per session', async ($, on) => {
    setup(on, traps(entry('sql', { paths: '["*.sql"]' })))
    expect(ctx(await $.tool.call(write('/repo/a.sql')))).toContain('`sql`')
    expect((await $.tool.call(write('/repo/b.sql'))).context).toBeUndefined()
    expect((await $.tool.call(write('/repo/a.sql'))).context).toBeUndefined()
  })

  test('a new session id hints again', async ($, on) => {
    const w = setup(on, traps(entry('sql', { paths: '["*.sql"]' })))
    expect(ctx(await $.tool.call(write('/repo/a.sql')))).toContain('`sql`')
    w.sessionId = 'session-2'
    expect(ctx(await $.tool.call(write('/repo/a.sql')))).toContain('`sql`')
    expect((await $.tool.call(write('/repo/a.sql'))).context).toBeUndefined()
  })

  test('an edited entry (new version) hints again; unrelated entries stay deduped', async ($, on) => {
    const w = setup(on, traps(entry('sql', { paths: '["*.sql"]' }), entry('other', { paths: '["*.sql"]' })))
    const first = ctx(await $.tool.call(write('/repo/a.sql')))
    expect(first).toContain('`sql`')
    expect(first).toContain('`other`')
    w.files['.flightwake/TRAPS.md'] = traps(entry('sql', { paths: '["*.sql"]', note: ' (updated)' }), entry('other', { paths: '["*.sql"]' }))
    const again = ctx(await $.tool.call(write('/repo/a.sql')))
    expect(again).toContain('`sql`')
    expect(again).toContain('(updated)')
    expect(again).not.toContain('`other`')
  })

  test('more than 5 matches are summarised; the rest hint on a later call', async ($, on) => {
    const names = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']
    setup(on, traps(...names.map((n) => entry(n, { paths: '["*.sql"]' }))))
    const c = ctx(await $.tool.call(write('/repo/x.sql')))
    expect(names.filter((n) => c.includes(`\`${n}\``)).length).toBe(5)
    expect(c).toContain('+2 more')
    const c2 = ctx(await $.tool.call(write('/repo/y.sql')))
    expect(c2).toContain('`a6`')
    expect(c2).toContain('`a7`')
  })

  test('subagent calls are hinted with the same session dedup', async ($, on) => {
    setup(on, traps(entry('sql', { paths: '["*.sql"]' })))
    expect(ctx(await $.tool.call({ ...(write('/repo/a.sql') as object), agentId: 'agent-1' } as never))).toContain('`sql`')
    expect((await $.tool.call(write('/repo/a.sql'))).context).toBeUndefined()
  })
})

describe('tripwire: caveats and results', () => {
  test('probable / suspected / unknown carry the lead caveat; confirmed does not', async ($, on) => {
    setup(
      on,
      traps(
        entry('c', { paths: '["c/**"]', confidence: 'confirmed' }),
        entry('p', { paths: '["p/**"]', confidence: 'probable' }),
        entry('s', { paths: '["s/**"]', confidence: 'suspected' }),
        entry('u', { paths: '["u/**"]', confidence: null }),
      ),
    )
    expect(ctx(await $.tool.call(write('/repo/c/x')))).not.toContain('leads, not settled')
    const p = ctx(await $.tool.call(write('/repo/p/x')))
    expect(p).toContain('[probable]')
    expect(p).toContain('leads, not settled facts')
    expect(p).toContain('never use one to argue that something is safe')
    expect(ctx(await $.tool.call(write('/repo/s/x')))).toContain('leads, not settled')
    const u = ctx(await $.tool.call(write('/repo/u/x')))
    expect(u).toContain('[unknown]')
    expect(u).toContain('leads, not settled')
  })

  test('hint is localized from the install language', async ($, on) => {
    setup(on, traps(entry('sql', { paths: '["*.sql"]', confidence: 'probable' })), {
      files: FILES(traps(entry('sql', { paths: '["*.sql"]', confidence: 'probable' })), { 'CLAUDE.md': MARKER('ja') }),
    })
    const c = ctx(await $.tool.call(write('/repo/a.sql')))
    expect(c).toContain('に該当')
    expect(c).toContain('手がかり')
  })

  test('a deny passes through untouched (no context, nothing recorded)', async ($, on) => {
    installWorld(on, { files: FILES(traps(entry('sql', { paths: '["*.sql"]' }))) })
    on('tool.call', () => ({ deny: 'blocked elsewhere' }))
    const r = await $.tool.call(write('/repo/a.sql'))
    expect(r.deny).toBe('blocked elsewhere')
    expect(r.context).toBeUndefined()
  })

  test('an errored result still gets the hint', async ($, on) => {
    installWorld(on, { files: FILES(traps(entry('sql', { paths: '["*.sql"]' }))) })
    on('tool.call', () => ({ isError: true, result: 'boom', text: 'boom' }) as never)
    const r = await $.tool.call(write('/repo/a.sql'))
    expect(r.isError).toBe(true)
    expect(ctx(r)).toContain('`sql`')
  })

  test('existing context from the tool is kept, hint appended', async ($, on) => {
    installWorld(on, { files: FILES(traps(entry('sql', { paths: '["*.sql"]' }))) })
    on('tool.call', () => ({ result: 'ok', text: 'ok', context: ['earlier'] }) as never)
    const r = await $.tool.call(write('/repo/a.sql'))
    expect(r.context?.[0]).toBe('earlier')
    expect(r.context?.length).toBe(2)
  })

  test('the mod never writes files', async ($, on) => {
    const w = setup(on, traps(entry('sql', { paths: '["*.sql"]' })))
    await $.tool.call(write('/repo/a.sql'))
    expect(w.writes).toEqual([])
    expect(w.reads.every((p) => p.startsWith('/repo/.flightwake/') || p.startsWith('/repo/CLAUDE') || p.startsWith('/repo/.claude/') || p === '/repo/AGENTS.md' || p === '/repo/GEMINI.md')).toBe(true)
  })
})
