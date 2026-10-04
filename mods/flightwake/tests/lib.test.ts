// Shared-module tests (lib/*): pure parsers directly, world-backed helpers through the fake world.
import { describe, expect, test } from 'claude-code/testing'

import { matchGlob } from '../hooks/lib/glob'
import { parseCommand, startsWithTokens } from '../hooks/lib/shell'
import { parseTraps } from '../hooks/lib/traps'
import { parseCard, parseSeatBlock } from '../hooks/lib/roles'
import { detectLang, fwContext, isUninitializedState, legacyStatuslineActive, parseInlineList, relToRoot, stateLag } from '../hooks/lib/core'
import { fakeIo, gitBehind, MARKER, newWorld, STATE_FILLED, STATE_TEMPLATE } from './world'

describe('glob', () => {
  test('basename patterns match at any depth; slashed patterns are anchored', () => {
    expect(matchGlob('*.sql', 'db/migrations/1.sql')).toBe(true)
    expect(matchGlob('hooks/**', 'hooks/a/b.ts')).toBe(true)
    expect(matchGlob('hooks/**', 'src/hooks/a.ts')).toBe(false)
    expect(matchGlob('src/', 'src/x/y.ts')).toBe(true)
    expect(matchGlob('**/*.test.ts', 'a/b/c.test.ts')).toBe(true)
    expect(matchGlob('**/*.test.ts', 'c.test.ts')).toBe(true)
    expect(matchGlob('a?.md', 'ab.md')).toBe(true)
    expect(matchGlob('', 'x')).toBe(false)
  })
})

describe('core', () => {
  test('inline lists', () => {
    expect(parseInlineList('["hooks/**", \'*.sql\', git push]')).toEqual(['hooks/**', '*.sql', 'git push'])
    expect(parseInlineList(undefined)).toEqual([])
  })
  test('relToRoot', () => {
    expect(relToRoot('/repo', '/repo/src/a.ts')).toBe('src/a.ts')
    expect(relToRoot('/repo', '/repo/../etc/x')).toBe(null)
    expect(relToRoot('/repo', '/elsewhere/a')).toBe(null)
  })
  test('template STATE is detected', () => {
    expect(isUninitializedState(STATE_TEMPLATE)).toBe(true)
    expect(isUninitializedState(STATE_FILLED)).toBe(false)
  })
})

describe('traps', () => {
  const TRAPS = `<!-- header
---
name: example
---
-->
# Trap Registry

---
name: {{kebab-case-slug}}
type: trap
status: active
---

**Symptom**: {{x}}

---
name: pg-pool
type: trap
status: active
confidence: probable
paths: ["db/**", "*.sql"]
commands: ["psql", "npm run migrate"]
---

**Symptom**: hangs
**Root cause**: pool exhausted
**Fix/workaround**: raise max

---
name: old-one
status: superseded
paths: ["db/**"]
---

**Symptom**: gone

---
name: no-meta
---

**Symptom**: plain
`
  test('parses entries, skips template residue and header examples, applies defaults', () => {
    const es = parseTraps(TRAPS)
    expect(es.map((e) => e.name)).toEqual(['pg-pool', 'old-one', 'no-meta'])
    const pg = es[0]!
    expect(pg.paths).toEqual(['db/**', '*.sql'])
    expect(pg.commands).toEqual(['psql', 'npm run migrate'])
    expect(pg.confidence).toBe('probable')
    expect(pg.labelled[1]).toContain('pool exhausted')
    expect(es[2]!.status).toBe('active')
    expect(es[2]!.confidence).toBe('unknown')
  })
  test('content version changes when the entry changes', () => {
    const a = parseTraps(TRAPS)[0]!.version
    const b = parseTraps(TRAPS.replace('raise max', 'raise max to 50'))[0]!.version
    expect(a).not.toBe(b)
  })
})

describe('roles', () => {
  const BLOCK = `<!-- flightwake-roles:begin v0.14.0 lang=en src=../team/.flightwake/ROLES.md -->
# Your role: pm — Project manager (the Claude Code in this folder)

body
deny-write: ["src/**", "lib/**"]

**Never**
- Write or edit product code yourself.
<!-- flightwake-roles:end -->
rest of CLAUDE.md`
  test('seat block', () => {
    expect(parseSeatBlock(BLOCK)).toEqual({ id: 'pm', title: 'Project manager', denyWrite: ['src/**', 'lib/**'] })
    expect(parseSeatBlock('no block here')).toBe(null)
  })
  test('zh-TW seat block without deny-write → no rules', () => {
    const zh = `<!-- flightwake-roles:begin v0.14.0 lang=zh-TW src=x -->\n# 你的角色:coder — 實作者(本資料夾的 Claude Code)\n\n**禁止**\n- 不寫產品程式碼\n<!-- flightwake-roles:end -->`
    expect(parseSeatBlock(zh)).toEqual({ id: 'coder', title: '實作者', denyWrite: [] })
  })
  test('card only at the start of a prompt', () => {
    expect(parseCard('# Role card: security — Security reviewer\n\ndeny-write: ["src/**"]\n')?.id).toBe('security')
    expect(parseCard('  \n# 角色卡:qa — 測試\n')?.id).toBe('qa')
    expect(parseCard('please look at this:\n# Role card: qa — QA')).toBe(null)
  })
})

describe('world-backed core helpers', () => {
  test('lag: behind excludes bots', async () => {
    const w = newWorld({ git: gitBehind(4, 2) })
    expect(await stateLag(fakeIo(w), '/repo')).toEqual({ kind: 'behind', behind: 4 })
  })
  test('lag: dirty STATE counts as updating', async () => {
    const w = newWorld({ git: { ...gitBehind(4), 'status --porcelain -- .flightwake/STATE.md': ' M .flightwake/STATE.md' } })
    expect(await stateLag(fakeIo(w), '/repo')).toEqual({ kind: 'dirty' })
  })
  test('lag: never-committed STATE is not measured', async () => {
    const w = newWorld({ git: { ...gitBehind(4), 'log -1 --format=%H -- .flightwake/STATE.md': '' } })
    expect(await stateLag(fakeIo(w), '/repo')).toEqual({ kind: 'no-baseline' })
  })
  test('lag: a failing git call midway is an error, never "in sync"', async () => {
    const g = gitBehind(0)
    delete g['rev-list --count --author=\\[bot\\] abc123..HEAD']
    expect(await stateLag(fakeIo(newWorld({ git: g })), '/repo')).toEqual({ kind: 'error' })
  })
  test('lag: not a git repo → null', async () => {
    expect(await stateLag(fakeIo(newWorld({ git: null })), '/repo')).toBe(null)
  })
  test('lang from the Claude marker, else AGENTS.md (acceptance 2026-10-05); pre-0.9 marker is zh-TW', async () => {
    expect(await detectLang(fakeIo(newWorld({ files: { 'CLAUDE.md': MARKER('ja') } })), '/repo')).toBe('ja')
    expect(await detectLang(fakeIo(newWorld({ files: { 'AGENTS.md': MARKER('ja') } })), '/repo')).toBe('ja')
    expect(await detectLang(fakeIo(newWorld({ files: { 'CLAUDE.local.md': '<!-- flightwake:begin v0.8.0 -->' } })), '/repo')).toBe('zh-TW')
  })
  test('legacy gauge: effective setting, not a file', async () => {
    expect(await legacyStatuslineActive(fakeIo(newWorld({ settings: { statusLine: { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.flightwake/hooks/statusline.mjs"' } } })))).toBe(true)
    expect(await legacyStatuslineActive(fakeIo(newWorld({ settings: {}, files: { '.flightwake/hooks/statusline.mjs': '' } })))).toBe(false)
  })
  test('no .flightwake → no context', async () => {
    expect(await fwContext(fakeIo(newWorld()))).toBe(null)
    expect(await fwContext(fakeIo(newWorld({ files: { '.flightwake/STATE.md': STATE_FILLED } })))).toEqual({ root: '/repo', lang: 'en' })
  })
})

describe('shell', () => {
  test('segments, env, operators, quotes', () => {
    const a = parseCommand('cd pkg && NODE_ENV=test npm test -- --grep "a b" || true')
    expect(a.isComplex).toBe(false)
    expect(a.segments.map((s) => s.tokens)).toEqual([['cd', 'pkg'], ['npm', 'test', '--', '--grep', 'a b'], ['true']])
    expect(a.segments.map((s) => s.op)).toEqual(['&&', '||', ''])
    expect(a.segments[1]!.env).toEqual(['NODE_ENV=test'])
    expect(parseCommand('npm test | tail -5').segments.map((s) => s.op)).toEqual(['|', ''])
    expect(parseCommand('echo $(git rev-parse HEAD)').isComplex).toBe(true)
    expect(parseCommand("echo 'unterminated").isComplex).toBe(true)
    expect(parseCommand('git push origin main').segments).toHaveLength(1)
    // fd redirections are words, not the background operator
    expect(parseCommand('npm test 2>&1').segments.map((s) => s.tokens)).toEqual([['npm', 'test', '2>&1']])
    expect(parseCommand('npm test &>out.log').segments).toHaveLength(1)
    expect(parseCommand('echo hi >&2').segments).toHaveLength(1)
    expect(parseCommand('sleep 1 & npm test').segments.map((s) => s.op)).toEqual(['&', ''])
  })
  test('token prefixes', () => {
    expect(startsWithTokens(['git', 'push', 'origin'], 'git push')).toBe(true)
    expect(startsWithTokens(['git', 'pushx'], 'git push')).toBe(false)
    expect(startsWithTokens(['git'], 'git push')).toBe(false)
    expect(startsWithTokens(['git'], '  ')).toBe(false)
  })
})
