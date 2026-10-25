// F4 tripwire: hints appended to tool results from TRAPS paths/commands matches; never blocks.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { MockClock } from 'claude-code/testing'

import { HOME_OUT, installWorld, MARKER, STATE_FILLED, STATE_TEMPLATE } from './world'
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

// ── trip file: every match counted per entry, written to <base>/trips/<id>.json outside the repo ───────────────
const NOW = 1_760_000_000_000
const TRIPS = `${HOME_OUT}/.flightwake/trips`
const MINE = `${TRIPS}/session-1.json`
const iso = (ms: number) => new Date(ms).toISOString()
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
/** The fleet's own session file is not under test here: `fleet` off keeps its writes out of the way. */
const ONLY_F4 = { options: { fleet: false } } as const

type Trip = { w: World; clock: MockClock }

/** A world with a home outside the repo, a clock and an interactive session start, so the trip file can be written. */
async function tripWorld($: any, on: On, t: string, init: Partial<World> = {}, opts: { env?: Record<string, string>; start?: object } = {}): Promise<Trip> {
  const w = setup(on, t, init)
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, opts.env ?? { HOME: HOME_OUT })
  on('session.start', () => ({ cwd: w.root }))
  await $.session.start(opts.start ?? START)
  await clock.settle()
  return { w, clock }
}

/** One tool call, then let the queued trip write run. */
async function hit($: any, k: Trip, input: never): Promise<string> {
  const r = await $.tool.call(input)
  await k.clock.settle()
  return ctx(r)
}

const tripFile = (w: World, path = MINE): Record<string, any> | null => {
  const t = w.outside[path]
  if (t === undefined) return null
  try { return JSON.parse(t) as Record<string, any> } catch { return null }
}

const TWO = () => traps(entry('sql', { paths: '["db/**"]' }), entry('pub', { commands: '["npm publish"]' }))

describe('tripwire: trip file', () => {
  test('every matching call counts, including repeats not hinted again; the file shape is exact', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    expect(await hit($, k, { tool: 'Edit', file_path: '/repo/db/a.sql', old_string: 'a', new_string: 'b' } as never)).toContain('`sql`')
    await k.clock.advance(1000)
    expect(await hit($, k, write('/repo/db/b.sql'))).toBe('')
    await k.clock.advance(1000)
    expect(await hit($, k, bash('npm publish --tag next'))).toContain('`pub`')
    await k.clock.advance(1000)
    expect(await hit($, k, bash('sed -i s/a/b/ db/c.sql'))).toBe('')
    await k.clock.advance(1000)
    expect(await hit($, k, bash('cd pkg && npm publish'))).toBe('')
    const text = k.w.outside[MINE]!
    expect(text.endsWith('}\n')).toBe(true)
    const f = JSON.parse(text) as Record<string, unknown>
    expect(Object.keys(f)).toEqual(['v', 'sessionId', 'repo', 'updated', 'trips'])
    expect(f).toEqual({
      v: 1, sessionId: 'session-1', repo: '/repo', updated: iso(NOW + 4000),
      trips: {
        sql: { n: 3, first: iso(NOW), last: iso(NOW + 3000) },
        pub: { n: 2, first: iso(NOW + 2000), last: iso(NOW + 4000) },
      },
    })
    expect(text).toBe(`${JSON.stringify(f, null, 2)}\n`)
    expect(k.w.tripWrites).toEqual([MINE, MINE, MINE, MINE, MINE])
    expect(k.w.writes).toEqual([])
  })

  test('a call matching no entry neither counts nor writes; one call matching two entries counts each once', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, traps(entry('sql', { paths: '["*.sql"]' }), entry('db', { paths: '["db/**"]' })))
    await hit($, k, write('/repo/src/a.ts'))
    expect(k.w.tripWriteAttempts).toEqual([])
    await hit($, k, write('/repo/db/a.sql'))
    await hit($, k, write('/repo/src/b.ts'))
    expect(tripFile(k.w)?.trips).toEqual({ sql: { n: 1, first: iso(NOW), last: iso(NOW) }, db: { n: 1, first: iso(NOW), last: iso(NOW) } })
    expect(k.w.tripWrites).toEqual([MINE])
  })

  test('the base inside the repo → nothing written, the hint still shown', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), {}, { env: { FLIGHTWAKE_HOME: '/repo/.fwhome', HOME: HOME_OUT } })
    expect(await hit($, k, write('/repo/db/a.sql'))).toContain('`sql`')
    expect(k.w.tripWriteAttempts).toEqual([])
    expect(k.w.writes).toEqual([])
  })

  test('a link above the base that lands in the repo → nothing written (real path)', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), { links: ['/home/u/lnk'], aliases: { '/home/u/lnk': '/repo' } }, { env: { FLIGHTWAKE_HOME: '/home/u/lnk/fw', HOME: HOME_OUT } })
    expect(await hit($, k, write('/repo/db/a.sql'))).toContain('`sql`')
    expect(k.w.tripWriteAttempts).toEqual([])
    expect(k.w.writes).toEqual([])
  })

  test('a base that is a records folder or lies in a git repo → nothing written', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), { outside: { '/home/u/.git/HEAD': 'ref' } })
    expect(await hit($, k, write('/repo/db/a.sql'))).toContain('`sql`')
    k.w.outside['/home/u/.flightwake/STATE.md'] = 'x'
    delete k.w.outside['/home/u/.git/HEAD']
    await hit($, k, write('/repo/db/b.sql'))
    expect(k.w.tripWriteAttempts).toEqual([])
  })

  test('a symlinked trips folder → never written through', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), { links: [TRIPS] })
    expect(await hit($, k, write('/repo/db/a.sql'))).toContain('`sql`')
    expect(k.w.tripWriteAttempts).toEqual([])
  })

  test('a file at our path that is not ours (another version, another id, another tool) is left untouched', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    let i = 0
    for (const foreign of ['{"v":2,"sessionId":"session-1","trips":{}}', '{"v":1,"sessionId":"session-9","trips":{}}', 'not json', '[1]']) {
      k.w.outside[MINE] = foreign
      await hit($, k, write(`/repo/db/a${i++}.sql`))
      expect(k.w.outside[MINE]).toBe(foreign)
    }
    expect(k.w.tripWriteAttempts).toEqual([])
  })

  test('our own file (or a torn write of it) from earlier in this session is overwritten', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), { outside: { [MINE]: '{\n  "v": 1,\n  "sessionId": "session-1",\n  "repo": "/re' } })
    await hit($, k, write('/repo/db/a.sql'))
    expect(tripFile(k.w)?.trips.sql.n).toBe(1)
  })

  test('tripwire off → nothing counted, nothing written', { options: { tripwire: false, fleet: false } }, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    expect(await hit($, k, write('/repo/db/a.sql'))).toBe('')
    expect(await hit($, k, bash('npm publish'))).toBe('')
    expect(k.w.tripWriteAttempts).toEqual([])
    expect(k.w.writes).toEqual([])
  })

  test('a -p / SDK run (not interactive) writes nothing; the hint is unchanged', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), {}, { start: { cwd: '/repo', surface: null, isInteractive: false } })
    expect(await hit($, k, write('/repo/db/a.sql'))).toContain('`sql`')
    expect(k.w.tripWriteAttempts).toEqual([])
  })

  test('a denied call is not counted', ONLY_F4, async ($, on) => {
    const w = installWorld(on, { files: FILES(TWO()) })
    on('tool.call', () => ({ deny: 'blocked elsewhere' }))
    const clock = mock.clock(on, { now: NOW })
    mock.env(on, { HOME: HOME_OUT })
    on('session.start', () => ({ cwd: w.root }))
    await $.session.start(START)
    await $.tool.call(write('/repo/db/a.sql'))
    await clock.settle()
    expect(w.tripWriteAttempts).toEqual([])
  })

  test('/clear (a new session id) starts a new file from zero; the old one keeps its count', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    await hit($, k, write('/repo/db/a.sql'))
    await hit($, k, write('/repo/db/a.sql'))
    k.w.sessionId = 'session-2'
    expect(await hit($, k, write('/repo/db/a.sql'))).toContain('`sql`')
    expect(tripFile(k.w)?.trips.sql.n).toBe(2)
    expect(tripFile(k.w, `${TRIPS}/session-2.json`)).toMatchObject({ v: 1, sessionId: 'session-2', trips: { sql: { n: 1 } } })
  })

  test('a failing or throwing write never touches the result or the hint, and is tried again on the next count', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    k.w.isFleetWriteFailing = true
    const r = await $.tool.call(write('/repo/db/a.sql'))
    await k.clock.settle()
    expect(r.text).toBe('ok')
    expect(ctx(r)).toContain('`sql`')
    expect(k.w.tripWrites).toEqual([])
    k.w.isFleetWriteFailing = false
    k.w.isFleetWriteThrowing = true
    expect((await $.tool.call(bash('npm publish'))).text).toBe('ok')
    await k.clock.settle()
    k.w.isFleetWriteThrowing = false
    await hit($, k, write('/repo/db/b.sql'))
    expect(tripFile(k.w)?.trips).toMatchObject({ sql: { n: 2 }, pub: { n: 1 } })
    expect(k.w.tripWriteAttempts.length).toBe(3)
  })

  test('the hints themselves are exactly as without a home (dedup unchanged)', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    const seen = [
      await hit($, k, write('/repo/db/a.sql')), await hit($, k, write('/repo/db/a.sql')),
      await hit($, k, bash('npm publish')), await hit($, k, bash('npm publish')),
    ]
    expect(seen.map((c) => c.includes('flightwake TRAPS'))).toEqual([true, false, true, false])
  })
})
