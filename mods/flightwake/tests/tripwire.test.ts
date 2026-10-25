// F4 tripwire: hints appended to tool results from TRAPS paths/commands matches; never blocks.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { MockClock } from 'claude-code/testing'

import { addTrips, codeCell, isOursTripsText, mergeTrips, tripsOfFile } from '../hooks/lib/fleet'
import { REFUSAL_RE } from '../hooks/lib/traps'
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

// ── trip file: each trap tripped this session, once per repo, written to <base>/trips/<id>.json outside the repo ──
const NOW = 1_760_000_000_000
const TRIPS = `${HOME_OUT}/.flightwake/trips`
const MINE = `${TRIPS}/session-1.json`
const iso = (ms: number) => new Date(ms).toISOString()
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
/** The fleet's own session file is not under test here: `fleet` off keeps its writes out of the way, `trips` on. */
const ONLY_F4 = { options: { fleet: false, trips: true } } as const
/** The trips folder as `init --mod` / `update --mod` leave it: there, and private. */
const PRIVATE: Partial<World> = { dirs: [TRIPS], modes: { [TRIPS]: '700' } }

type Trip = { w: World; clock: MockClock }

/** A world with a home outside the repo, a private trips folder, a clock and an interactive session start. */
async function tripWorld($: any, on: On, t: string, init: Partial<World> = {}, opts: { env?: Record<string, string>; start?: object; answer?: () => Record<string, unknown>; beneath?: (on: On) => void } = {}): Promise<Trip> {
  const w = installWorld(on, { files: FILES(t), ...PRIVATE, ...init })
  if (opts.beneath) opts.beneath(on)
  else engine(on, opts.answer)
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
const v2 = (trips: Record<string, Record<string, string>>, updated: string, sessionId = 'session-1') =>
  `${JSON.stringify({ v: 2, sessionId, updated, trips }, null, 2)}\n`

const TWO = () => traps(entry('sql', { paths: '["db/**"]' }), entry('pub', { commands: '["npm publish"]' }))
const edit = (path: string) => ({ tool: 'Edit', file_path: path, old_string: 'a', new_string: 'b' }) as never

describe('tripwire: trip file', () => {
  test('once per session per repo: the first match of each trap is recorded, repeats write nothing; the v2 shape is exact', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    expect(await hit($, k, edit('/repo/db/a.sql'))).toContain('`sql`')
    await k.clock.advance(1000)
    expect(await hit($, k, write('/repo/db/b.sql'))).toBe('')
    await k.clock.advance(1000)
    expect(await hit($, k, bash('npm publish --tag next'))).toContain('`pub`')
    await k.clock.advance(1000)
    expect(await hit($, k, bash('cd pkg && npm publish'))).toBe('')
    const text = k.w.outside[MINE]!
    expect(text).toBe(v2({ '/repo': { pub: iso(NOW + 2000), sql: iso(NOW) } }, iso(NOW + 2000)))
    expect(Object.keys(JSON.parse(text))).toEqual(['v', 'sessionId', 'updated', 'trips'])
    expect(k.w.tripWrites).toEqual([MINE, MINE])
    expect(k.w.writes).toEqual([])
  })

  test('Bash: path-like words hint as before but record nothing; only a command prefix records', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, traps(entry('sql', { paths: '["db/**"]' }), entry('both', { paths: '["web/**"]', commands: '["npm publish"]' })))
    expect(await hit($, k, bash('cat db/x.sql'))).toContain('flightwake TRAPS: `sql` [confirmed] matches db/x.sql')
    expect(await hit($, k, bash('grep -n x db/y.sql web/z.ts'))).toContain('flightwake TRAPS: `both` [confirmed] matches web/z.ts')
    expect(await hit($, k, bash('git diff -- db/'))).toBe('')
    expect(k.w.tripWriteAttempts).toEqual([])
    expect(tripFile(k.w)).toBeNull()
    // a path word first and the entry's command later in the same call: the hint still names the path word (as
    // before), and the command records it
    await k.clock.advance(1000)
    expect(await hit($, k, bash('cat web/a.ts; npm publish'))).toBe('') // `both` was hinted above
    expect(tripFile(k.w)?.trips).toEqual({ '/repo': { both: iso(NOW + 1000) } })
    // the file tools record by their own target
    await hit($, k, edit('/repo/db/x.sql'))
    expect(tripFile(k.w)?.trips).toEqual({ '/repo': { both: iso(NOW + 1000), sql: iso(NOW + 1000) } })
  })

  test('a subagent call in the same session records too (once-per-session makes it harmless)', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    await hit($, k, { ...(bash('npm publish') as object), agentId: 'a1' } as never)
    expect(tripFile(k.w)?.trips).toEqual({ '/repo': { pub: iso(NOW) } })
  })

  test('a call matching no entry neither records nor writes; one call matching two entries records each', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, traps(entry('sql', { paths: '["*.sql"]' }), entry('db', { paths: '["db/**"]' })))
    await hit($, k, write('/repo/src/a.ts'))
    expect(k.w.tripWriteAttempts).toEqual([])
    await hit($, k, write('/repo/db/a.sql'))
    await hit($, k, write('/repo/src/b.ts'))
    expect(tripFile(k.w)?.trips).toEqual({ '/repo': { db: iso(NOW), sql: iso(NOW) } })
    expect(k.w.tripWrites).toEqual([MINE])
  })

  test('nothing new: no file system work outside the repo, no stat — one $.state read is all a call costs', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    await hit($, k, write('/repo/db/a.sql'))
    const outside = () => k.w.reads.filter((p) => p.startsWith(HOME_OUT))
    const [reads, stats] = [outside().length, k.w.statCalls.length]
    expect(stats).toBe(1)
    await hit($, k, write('/repo/db/b.sql'))
    await hit($, k, bash('ls'))
    await hit($, k, { tool: 'Read', file_path: '/repo/db/a.sql' } as never)
    expect([outside().length, k.w.statCalls.length]).toEqual([reads, stats])
    expect(k.w.tripWriteAttempts).toEqual([MINE])
  })

  test('a call that did not run records nothing; its hint is unchanged', ONLY_F4, async ($, on) => {
    let answer: Record<string, unknown> = { result: 'ok', text: 'ok' }
    const k = await tripWorld($, on, TWO(), {}, { answer: () => answer })
    // the permission prompt's "no", a deny rule, the auto-mode classifier: an error result in Claude Code's words
    for (const text of [
      "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.",
      'Permission to use Bash with command npm publish has been denied.',
      'Permission for this action was denied by the Claude Code auto mode classifier. Reason: risky',
    ]) {
      answer = { isError: true, result: text, text }
      await hit($, k, bash('npm publish'))
    }
    answer = { isError: true, result: 'x', text: 'Permission for this tool use was denied. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). Try a different approach or report the limitation to complete your task.' }
    expect(await hit($, k, write('/repo/db/a.sql'))).toContain('`sql`')
    expect(k.w.tripWriteAttempts).toEqual([])
    // a command that ran and failed did trip the trap
    answer = { isError: true, result: 'Exit code 1', text: 'Exit code 1\nnpm ERR! 403' }
    await hit($, k, bash('npm publish'))
    expect(tripFile(k.w)?.trips).toEqual({ '/repo': { pub: iso(NOW) } })
  })

  test("a settings PreToolUse hook's deny (an error result in its own words) records nothing; the hint is unchanged", ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), {}, { beneath: (o) => { o('classic.PreToolUse', () => ({ deny: 'not on this branch' }) as never); engine(o) } })
    const r = await $.tool.call(bash('npm publish'))
    await k.clock.settle()
    expect(r.isError).toBe(true)
    expect(ctx(r)).toContain('`pub`')
    expect(k.w.tripWriteAttempts).toEqual([])
  })

  test("the auto-mode classifier's deny, noted by id (PermissionDenied), records nothing", ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), {}, {
      beneath: (o) => {
        o('classic.PermissionDenied', () => ({}) as never)
        o('tool.call', async (_$, e) => {
          await $.classic.PermissionDenied({ session_id: 'session-1', transcript_path: '', cwd: '/repo', hook_event_name: 'PermissionDenied', tool_name: e.tool, tool_input: {}, tool_use_id: e.tool_use_id, reason: 'classifier' } as never)
          // in words REFUSAL_RE does not know: only the id says it was refused
          return { isError: true, result: 'x', text: 'blocked' } as never
        })
      },
    })
    expect(await hit($, k, bash('npm publish'))).toContain('`pub`')
    expect(k.w.tripWriteAttempts).toEqual([])
  })

  test('a denied call is not recorded', ONLY_F4, async ($, on) => {
    const w = installWorld(on, { files: FILES(TWO()), ...PRIVATE })
    on('tool.call', () => ({ deny: 'blocked elsewhere' }))
    const clock = mock.clock(on, { now: NOW })
    mock.env(on, { HOME: HOME_OUT })
    on('session.start', () => ({ cwd: w.root }))
    await $.session.start(START)
    await $.tool.call(write('/repo/db/a.sql'))
    await clock.settle()
    expect(w.tripWriteAttempts).toEqual([])
  })

  test('after a root change (/cd, EnterWorktree) a match is filed under the root it happened in', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    await hit($, k, edit('/repo/db/a.sql'))
    await k.clock.advance(1000)
    k.w.root = '/wt/feat'
    expect(await hit($, k, edit('/wt/feat/db/a.sql'))).toBe('') // hinted once per session already
    await hit($, k, bash('npm publish'))
    expect(tripFile(k.w)?.trips).toEqual({ '/repo': { sql: iso(NOW) }, '/wt/feat': { pub: iso(NOW + 1000), sql: iso(NOW + 1000) } })
  })

  test('merge: the file on disk for this id (an earlier process, --resume) is kept, the earliest time per pair', ONLY_F4, async ($, on) => {
    const disk = v2({ '/old': { pub: iso(NOW - 9000) }, '/repo': { sql: iso(NOW - 5000), x: iso(NOW - 4000) } }, iso(NOW - 4000))
    const k = await tripWorld($, on, TWO(), { outside: { [MINE]: disk } })
    // every pair here is already on disk, at an earlier time: nothing to write
    await hit($, k, edit('/repo/db/a.sql'))
    expect(k.w.tripWriteAttempts).toEqual([])
    expect(k.w.outside[MINE]).toBe(disk)
    // a new pair: the union is written, nothing on disk dropped
    await k.clock.advance(1000)
    await hit($, k, bash('npm publish'))
    expect(tripFile(k.w)).toEqual({
      v: 2, sessionId: 'session-1', updated: iso(NOW + 1000),
      trips: { '/old': { pub: iso(NOW - 9000) }, '/repo': { pub: iso(NOW + 1000), sql: iso(NOW - 5000), x: iso(NOW - 4000) } },
    })
  })

  test('merge: a time on disk later than this process saw (a clock that moved) gives way to the earlier one', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), { outside: { [MINE]: v2({ '/repo': { sql: iso(NOW + 60000) } }, iso(NOW + 60000)) } })
    await hit($, k, edit('/repo/db/a.sql'))
    expect(tripFile(k.w)?.trips).toEqual({ '/repo': { sql: iso(NOW) } })
  })

  test('a v1 file of ours (same id) is converted: each trip under its repo at its first time, even with nothing new', ONLY_F4, async ($, on) => {
    const v1 = JSON.stringify({ v: 1, sessionId: 'session-1', repo: '/old', updated: iso(NOW - 1000), trips: { sql: { n: 3, first: iso(NOW - 8000), last: iso(NOW - 1000) }, pub: { n: 1, first: iso(NOW - 7000), last: iso(NOW - 7000) } } }, null, 2)
    const k = await tripWorld($, on, TWO(), { outside: { [MINE]: `${v1}\n` } })
    await hit($, k, edit('/repo/db/a.sql'))
    expect(k.w.outside[MINE]).toBe(v2({ '/old': { pub: iso(NOW - 7000), sql: iso(NOW - 8000) }, '/repo': { sql: iso(NOW) } }, iso(NOW)))
  })

  test('/resume away and back in one process: the first id\'s pairs stay in its file', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    await hit($, k, edit('/repo/db/a.sql'))
    k.w.sessionId = 'session-2'
    await k.clock.advance(1000)
    await hit($, k, bash('npm publish'))
    expect(tripFile(k.w, `${TRIPS}/session-2.json`)?.trips).toEqual({ '/repo': { pub: iso(NOW + 1000) } })
    k.w.sessionId = 'session-1'
    await k.clock.advance(1000)
    await hit($, k, bash('npm publish'))
    expect(tripFile(k.w)?.trips).toEqual({ '/repo': { pub: iso(NOW + 2000), sql: iso(NOW) } })
  })

  test('/clear (a new session id) starts a new file; the old one keeps its pairs', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    await hit($, k, write('/repo/db/a.sql'))
    k.w.sessionId = 'session-2'
    expect(await hit($, k, write('/repo/db/a.sql'))).toContain('`sql`')
    expect(tripFile(k.w)?.trips).toEqual({ '/repo': { sql: iso(NOW) } })
    expect(tripFile(k.w, `${TRIPS}/session-2.json`)).toEqual({ v: 2, sessionId: 'session-2', updated: iso(NOW), trips: { '/repo': { sql: iso(NOW) } } })
  })

  test('a file at our path that is not ours (another version, another id, another tool) is left untouched', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    let i = 0
    for (const foreign of ['{"v":3,"sessionId":"session-1","trips":{}}', '{"v":2,"sessionId":"session-9","trips":{}}', '{"v":1,"sessionId":"session-9","trips":{}}', 'not json', '[1]']) {
      k.w.outside[MINE] = foreign
      k.w.sessionId = i % 2 === 0 ? 'session-1' : 'session-1' // the same id each time; a new trap each time
      await hit($, k, bash(`npm publish ${i}`))
      await hit($, k, write(`/repo/db/a${i++}.sql`))
      expect(k.w.outside[MINE]).toBe(foreign)
    }
    expect(k.w.tripWriteAttempts).toEqual([])
  })

  test('a torn write of ours (unparseable, our prefix) is overwritten with what this process has', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), { outside: { [MINE]: '{\n  "v": 2,\n  "sessionId": "session-1",\n  "upd' } })
    await hit($, k, write('/repo/db/a.sql'))
    expect(tripFile(k.w)?.trips).toEqual({ '/repo': { sql: iso(NOW) } })
  })

  test('the trips folder: missing, or open to group / others, or its mode unreadable → nothing written, the hint still shown', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), { dirs: [], modes: {} })
    expect(await hit($, k, write('/repo/db/a.sql'))).toContain('`sql`')
    expect(k.w.tripWriteAttempts).toEqual([])
    expect(k.w.statCalls).toEqual([]) // a missing folder is not even stat-ed
    k.w.dirs.push(TRIPS)
    for (const mode of ['755', '750', '701', '0770']) {
      k.w.modes[TRIPS] = mode
      await hit($, k, bash(`npm publish --tag ${mode}`)) // pub is new once; then nothing new
    }
    expect(k.w.tripWriteAttempts).toEqual([])
    delete k.w.modes[TRIPS] // no `stat` answers (Windows, a refusal)
    await hit($, k, edit('/repo/web/../db/b.sql'))
    expect(k.w.tripWriteAttempts).toEqual([])
  })

  test('a private folder by either stat (BSD -f %Lp, GNU -c %a) is written to', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), { statForm: 'gnu', modes: { [TRIPS]: '700' } })
    await hit($, k, write('/repo/db/a.sql'))
    expect(k.w.statCalls).toEqual([`-f %Lp ${TRIPS}`, `-c %a ${TRIPS}`])
    expect(tripFile(k.w)?.trips).toEqual({ '/repo': { sql: iso(NOW) } })
  })

  test('the base inside the repo → nothing written, the hint still shown', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), { dirs: ['/repo/.fwhome/trips'], modes: { '/repo/.fwhome/trips': '700' } }, { env: { FLIGHTWAKE_HOME: '/repo/.fwhome', HOME: HOME_OUT } })
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
    await hit($, k, bash('npm publish'))
    expect(k.w.tripWriteAttempts).toEqual([])
  })

  test('a symlinked trips folder → never written through', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), { links: [TRIPS] })
    expect(await hit($, k, write('/repo/db/a.sql'))).toContain('`sql`')
    expect(k.w.tripWriteAttempts).toEqual([])
  })

  test('tripwire off → nothing recorded, nothing written', { options: { tripwire: false, fleet: false, trips: true } }, async ($, on) => {
    const k = await tripWorld($, on, TWO())
    expect(await hit($, k, write('/repo/db/a.sql'))).toBe('')
    expect(await hit($, k, bash('npm publish'))).toBe('')
    expect(k.w.tripWriteAttempts).toEqual([])
    expect(k.w.writes).toEqual([])
  })

  // `trips` unset follows `fleet`; set, it wins; the hints never depend on it
  const SWITCH: [string, Record<string, boolean>, boolean][] = [
    ['unset with fleet on (the defaults)', {}, true],
    ['unset with fleet off', { fleet: false }, false],
    ['on with fleet off', { fleet: false, trips: true }, true],
    ['off with fleet on', { trips: false }, false],
  ]
  for (const [name, options, isWritten] of SWITCH) {
    test(`trips ${name} → ${isWritten ? 'written' : 'no trip file'}; the hint is the same`, { options }, async ($, on) => {
      const k = await tripWorld($, on, TWO())
      expect(await hit($, k, write('/repo/db/a.sql'))).toContain('flightwake TRAPS: `sql` [confirmed] matches db/a.sql')
      expect(k.w.tripWrites).toEqual(isWritten ? [MINE] : [])
      expect(k.w.writes).toEqual([])
    })
  }

  test('a -p / SDK run (not interactive) writes nothing; the hint is unchanged', ONLY_F4, async ($, on) => {
    const k = await tripWorld($, on, TWO(), {}, { start: { cwd: '/repo', surface: null, isInteractive: false } })
    expect(await hit($, k, write('/repo/db/a.sql'))).toContain('`sql`')
    expect(k.w.tripWriteAttempts).toEqual([])
  })

  test('a failing or throwing write never touches the result or the hint, and is tried again with the next new trap', ONLY_F4, async ($, on) => {
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
    await hit($, k, write('/repo/db/b.sql')) // nothing new: not tried
    expect(k.w.tripWriteAttempts.length).toBe(2)
    k.w.root = '/wt/b'
    await hit($, k, write('/wt/b/db/b.sql'))
    expect(tripFile(k.w)?.trips).toEqual({ '/repo': { pub: iso(NOW), sql: iso(NOW) }, '/wt/b': { sql: iso(NOW) } })
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

describe('trip file helpers (pure)', () => {
  test('addTrips: only new pairs; another id starts over; a name like __proto__ stays an own key', () => {
    const a = addTrips(null, 's', '/r', ['x', 'x', '__proto__'], 'T1')!
    expect(a).toEqual({ sessionId: 's', trips: { '/r': { x: 'T1', ['__proto__']: 'T1' } }, n: 2 })
    expect(Object.prototype.hasOwnProperty.call(a.trips['/r'], '__proto__')).toBe(true)
    expect(addTrips(a, 's', '/r', ['x'], 'T2')).toBeNull()
    expect(addTrips(a, 's', '/q', ['x'], 'T2')?.n).toBe(3)
    expect(addTrips(a, 's2', '/r', ['x'], 'T2')).toEqual({ sessionId: 's2', trips: { '/r': { x: 'T2' } }, n: 1 })
  })

  test('tripsOfFile / mergeTrips / isOursTripsText', () => {
    expect(tripsOfFile('{"v":2,"sessionId":"s","updated":"u","trips":{"/r":{"a":"T","b":3}}}', 's')).toEqual({ v: 2, trips: { '/r': { a: 'T' } } })
    expect(tripsOfFile('{"v":2,"sessionId":"t","trips":{}}', 's')).toBeNull()
    expect(tripsOfFile('{"v":3,"sessionId":"s","trips":{}}', 's')).toBeNull()
    expect(tripsOfFile('nope', 's')).toBeNull()
    expect(tripsOfFile('{"v":1,"sessionId":"s","repo":"/o","trips":{"a":{"n":2,"first":"F","last":"L"}}}', 's')).toEqual({ v: 1, trips: { '/o': { a: 'F' } } })
    const t1 = '2026-01-01T00:00:00.000Z'
    const t2 = '2026-01-02T00:00:00.000Z'
    expect(JSON.stringify(mergeTrips({ '/b': { y: t2 }, '/a': { x: t2 } }, { '/a': { x: t1, w: t2 } }))).toBe(JSON.stringify({ '/a': { w: t2, x: t1 }, '/b': { y: t2 } }))
    expect(isOursTripsText('{"v":2,"sessionId":"s"}', 's')).toBe(true)
    expect(isOursTripsText('{"v":1,"sessionId":"s"}', 's')).toBe(true)
    expect(isOursTripsText('{ "v": 2, "sessionId": "s", "upd', 's')).toBe(true)
    expect(isOursTripsText('{"v":2,"sessionId":"t"}', 's')).toBe(false)
    expect(isOursTripsText('{"v":3,"sessionId":"s"}', 's')).toBe(false)
  })

  test('REFUSAL_RE: Claude Code refusals, not a failed command', () => {
    for (const t of [
      "The user doesn't want to proceed with this tool use. The tool use was rejected",
      'Permission to use Bash has been denied.',
      'Permission to use Bash with command rm -rf x has been denied.',
      'Permission for this tool use was denied. The tool use was rejected',
      'Permission for this action has been denied. Reason: x',
      '<tool_use_error>Permission to use Write has been denied because Claude Code is running in don\'t ask mode.',
    ]) expect(REFUSAL_RE.test(t)).toBe(true)
    for (const t of ['Exit code 1\nPermission to use Bash has been denied.', 'String to replace not found in file.', 'npm ERR! 403 Forbidden']) expect(REFUSAL_RE.test(t)).toBe(false)
  })

  test('codeCell: exact shell text, | escaped for the table, a longer fence around backticks', () => {
    expect(codeCell("cd '/repo/it'\\''s' && claude --resume x")).toBe("`cd '/repo/it'\\''s' && claude --resume x`")
    expect(codeCell("cd '/a|b' && x")).toBe("`cd '/a\\|b' && x`")
    expect(codeCell("cd '/a`b' && x")).toBe("``cd '/a`b' && x``")
    expect(codeCell('`x`')).toBe('`` `x` ``')
  })
})
