/**
 * F3's judgment of a test command (pure). Positive proof, not a blacklist (acceptance round 2, 2026-10-05):
 *
 * - RECORDED: any command that calls a known runner / typechecker, a package script with a test-ish name, or a command
 *   STATE declares as verification — also when it is wrapped (`sh -c`, `eval`, `xargs`, `env`, `time` …), piped or
 *   compound. Recording never depends on recognising every flag.
 * - PROVEN (the only rows that may say pass/fail): the command is ONE direct call — no wrapper, no pipe, no compound,
 *   no substitution — of a runner from RUNNERS whose every flag sits in that runner's own safe tables; through a
 *   package script, the script body (plus any extra arguments) must pass the same test, recursively. A command STATE
 *   or package.json declares gets no exemption from the tables; its one extra allowance is running a script file
 *   directly (`bash test/smoke.sh`, `node scripts/test.js`), because then the repo itself names that file as its test.
 * Everything else is recorded as unknown, with the reason; the caller keeps the exit code and the command.
 */
import { parseCommand, type ParsedCommand, type Segment } from './shell'

export type RunKind = 'runner' | 'package-script' | 'state-declared' | 'typecheck'

type FlagTable = {
  /** Flags that change nothing about whether tests run (`-q`, `--ci`). `--flag=value` forms are matched by name. */
  safe: readonly string[]
  /** Flags that take a value, as the next word or after `=` (`-k expr`, `--reporter=dot`). */
  valued: readonly string[]
  /** Flags meaning no test runs (help, version, list, collect, compile-only, watch, skip). */
  noRun: readonly string[]
  /** Flag prefixes that are safe whatever follows (`--allow-` for deno). */
  safePrefixes?: readonly string[]
}

type RunnerSpec = FlagTable & {
  name: string
  kind: 'runner' | 'typecheck'
  heads: readonly (readonly string[])[]
  /** Positional words: any (paths, filters), or only these (goals/tasks). */
  positional: true | readonly string[]
  /** With a positional set: at least one of these must be present, or nothing test-running was asked for. */
  needsOneOf?: readonly string[]
  /** Maven-style `-Dkey=value`: keys that are safe / that skip tests. Any other key is unproven. */
  defines?: { safe: readonly string[]; noRun: readonly string[] }
  /** Flags after a `--` (cargo test's test-binary flags). Without it, a `--` makes the call unproven. */
  afterDoubleDash?: FlagTable & { positional: true }
}

const H = (...heads: string[]): string[][] => heads.map((h) => h.split(' '))

export const RUNNERS: readonly RunnerSpec[] = [
  { name: 'pytest', kind: 'runner', heads: H('pytest', 'py.test', 'python -m pytest', 'python3 -m pytest'), positional: true,
    safe: ['-q', '-qq', '-v', '-vv', '-vvv', '-x', '-s', '-l', '-ra', '-rA', '--lf', '--ff', '--sw', '--exitfirst', '--strict-markers', '--no-header', '--showlocals', '--last-failed', '--failed-first'],
    valued: ['-k', '-m', '-n', '--maxfail', '--tb', '--durations', '-W', '--color', '-p', '--rootdir', '-c', '--junitxml', '--basetemp', '--timeout', '--cov', '--cov-report', '-o'],
    noRun: ['--help', '-h', '--version', '-V', '--collect-only', '--co', '--fixtures', '--markers', '--setup-plan', '--setup-only', '--fixtures-per-test'] },
  { name: 'jest', kind: 'runner', heads: H('jest'), positional: true,
    safe: ['--ci', '--runInBand', '-i', '--verbose', '--silent', '--coverage', '--bail', '--detectOpenHandles', '--forceExit', '--no-cache', '--colors'],
    valued: ['-t', '--testNamePattern', '--maxWorkers', '-w', '--config', '-c', '--testPathPattern', '--selectProjects', '--shard', '--reporters', '--testTimeout'],
    noRun: ['--listTests', '--help', '-h', '--version', '-v', '--showConfig', '--watch', '--watchAll', '--init', '--clearCache'] },
  { name: 'vitest', kind: 'runner', heads: H('vitest run'), positional: true,
    safe: ['--run', '--silent', '--coverage', '--no-color'],
    valued: ['--reporter', '-t', '--testNamePattern', '--config', '-c', '--project', '--bail', '--shard', '--maxWorkers', '--pool', '--environment'],
    noRun: ['--help', '-h', '--version', '-v', '--watch', '-w'] },
  { name: 'mocha', kind: 'runner', heads: H('mocha'), positional: true,
    safe: ['--recursive', '--bail', '-b', '--exit', '--forbid-only', '--parallel', '-p'],
    valued: ['-R', '--reporter', '--timeout', '-t', '--grep', '-g', '--require', '-r', '--spec', '--config'],
    noRun: ['--help', '-h', '--version', '-V', '--list-files', '--list-reporters', '--list-interfaces', '--watch', '-w', '--dry-run'] },
  { name: 'go test', kind: 'runner', heads: H('go test'), positional: true,
    safe: ['-v', '-race', '-short', '-cover', '-failfast', '-json'],
    valued: ['-count', '-run', '-timeout', '-p', '-tags', '-coverprofile', '-covermode', '-cpu', '-parallel', '-skip', '-bench'],
    noRun: ['-list', '-c', '-h', '-help', '-n'] },
  { name: 'cargo test', kind: 'runner', heads: H('cargo test'), positional: true,
    safe: ['--release', '--all-features', '--workspace', '--all', '--lib', '--bins', '--tests', '--doc', '-q', '--quiet', '--locked', '--frozen', '--offline', '--no-default-features', '--all-targets', '--verbose', '-v'],
    valued: ['--features', '-F', '-p', '--package', '--test', '--bin', '--example', '-j', '--jobs', '--target', '--profile', '--manifest-path', '--exclude'],
    noRun: ['--no-run', '--help', '-h', '-V', '--version'],
    afterDoubleDash: { positional: true, safe: ['--nocapture', '--include-ignored', '--ignored', '--exact', '-q', '--quiet', '--show-output'], valued: ['--test-threads', '--skip', '--format', '--color'], noRun: ['--list', '--help', '-h'] } },
  { name: 'mvn', kind: 'runner', heads: H('mvn', './mvnw', 'mvnw'),
    positional: ['clean', 'compile', 'test-compile', 'test', 'verify', 'integration-test', 'package', 'install'],
    needsOneOf: ['test', 'verify', 'integration-test', 'package', 'install'],
    safe: ['-V', '--show-version', '-B', '--batch-mode', '-q', '--quiet', '-e', '--errors', '-U', '--update-snapshots', '-o', '--offline', '-am', '--also-make', '-ntp', '--no-transfer-progress', '-fae', '--fail-at-end', '-ff', '--fail-fast'],
    valued: ['-T', '--threads', '-pl', '--projects', '-P', '--activate-profiles', '-f', '--file', '-s', '--settings'],
    noRun: ['-h', '--help', '-v', '--version'],
    defines: { safe: ['test', 'it.test', 'groups', 'excludedGroups'], noRun: ['skipTests', 'maven.test.skip', 'skip'] } },
  { name: 'gradle', kind: 'runner', heads: H('gradle', './gradlew', 'gradlew'),
    positional: ['clean', 'test', 'check', 'build'], needsOneOf: ['test', 'check', 'build'],
    safe: ['--info', '-i', '--stacktrace', '-q', '--quiet', '--no-daemon', '--build-cache', '--offline', '--continue', '--rerun-tasks'],
    valued: ['--tests', '--console'],
    noRun: ['--dry-run', '-m', '--help', '-h', '-v', '--version'] },
  { name: 'dotnet test', kind: 'runner', heads: H('dotnet test'), positional: true,
    safe: ['--no-build', '--no-restore', '--nologo', '--blame'],
    valued: ['-c', '--configuration', '--filter', '-v', '--verbosity', '--logger', '-l', '-f', '--framework', '-r', '--results-directory', '-s', '--settings'],
    noRun: ['--list-tests', '-t', '--help', '-h'] },
  { name: 'node --test', kind: 'runner', heads: H('node --test'), positional: true,
    safe: ['--experimental-test-coverage'],
    valued: ['--test-reporter', '--test-name-pattern', '--test-reporter-destination', '--test-concurrency', '--test-timeout'],
    noRun: ['--help', '-h', '--version', '-v'] },
  { name: 'bun test', kind: 'runner', heads: H('bun test'), positional: true,
    safe: ['--bail', '--coverage'], valued: ['--timeout', '-t', '--test-name-pattern', '--preload', '--rerun-each'], noRun: ['--help', '-h', '--watch'] },
  { name: 'deno test', kind: 'runner', heads: H('deno test'), positional: true,
    safe: ['-A', '--allow-all', '--no-check', '--parallel', '--fail-fast'], safePrefixes: ['--allow-'],
    valued: ['--filter', '--reporter', '--config', '-c'], noRun: ['--help', '-h', '--watch', '--no-run'] },
  { name: 'rspec', kind: 'runner', heads: H('rspec', 'bundle exec rspec'), positional: true,
    safe: ['--fail-fast', '--color', '--no-color', '-b', '--backtrace'],
    valued: ['-f', '--format', '--tag', '-t', '-e', '--example', '--seed', '--order', '-o', '--out', '-r', '--require'],
    noRun: ['--dry-run', '--help', '-h', '--version', '-v', '--init'] },
  { name: 'phpunit', kind: 'runner', heads: H('phpunit', 'vendor/bin/phpunit', './vendor/bin/phpunit'), positional: true,
    safe: ['--stop-on-failure', '--colors', '--testdox', '--no-coverage'],
    valued: ['--filter', '--testsuite', '-c', '--configuration', '--group', '--exclude-group'],
    noRun: ['--list-tests', '--list-suites', '--list-groups', '--help', '-h', '--version'] },
  { name: 'mix test', kind: 'runner', heads: H('mix test'), positional: true,
    safe: ['--trace', '--stale', '--failed', '--cover', '--warnings-as-errors'],
    valued: ['--only', '--exclude', '--include', '--seed', '--max-failures', '--timeout', '--max-cases'], noRun: ['--help'] },
  { name: 'make', kind: 'runner', heads: H('make test', 'make check'), positional: [],
    safe: ['-s', '--silent', '-k', '--keep-going'], valued: ['-j'], noRun: ['-n', '--dry-run', '--just-print', '-q', '--question', '-h', '--help'] },
  { name: 'claude plugin test', kind: 'runner', heads: H('claude plugin test'), positional: true, safe: [], valued: [], noRun: ['--help', '-h'] },
  { name: 'playwright test', kind: 'runner', heads: H('playwright test'), positional: true,
    safe: ['-x', '--headed', '--quiet', '--fully-parallel'],
    valued: ['--project', '--workers', '-j', '--grep', '-g', '--grep-invert', '--reporter', '--retries', '--timeout', '--config', '-c', '--shard', '--max-failures'],
    noRun: ['--list', '--help', '-h', '--ui', '--debug'] },
  { name: 'ava', kind: 'runner', heads: H('ava'), positional: true,
    safe: ['--verbose', '-v', '--serial', '-s', '--fail-fast', '--tap', '-t'], valued: ['--match', '-m', '--timeout', '-T', '--concurrency', '-c'],
    noRun: ['--help', '-h', '--version', '--watch', '-w'] },
  { name: 'tap', kind: 'runner', heads: H('tap'), positional: true,
    safe: [], valued: ['-R', '--reporter', '-j', '--jobs', '--timeout', '-t'], noRun: ['--help', '-h', '--version', '--watch', '-w'] },
  { name: 'tsc', kind: 'typecheck', heads: H('tsc', 'vue-tsc'), positional: true,
    safe: ['--noEmit', '-b', '--build', '--incremental', '--strict', '--pretty', '--listFiles'], valued: ['-p', '--project'],
    noRun: ['--help', '-h', '--version', '-v', '--init', '--showConfig', '--watch', '-w'] },
  { name: 'mypy', kind: 'typecheck', heads: H('mypy', 'python -m mypy', 'python3 -m mypy'), positional: true,
    safe: ['--strict', '--ignore-missing-imports', '--no-error-summary', '--pretty'], valued: ['--config-file', '-p', '--package', '-m', '--module', '--python-version'],
    noRun: ['--help', '-h', '--version', '-V'] },
  { name: 'pyright', kind: 'typecheck', heads: H('pyright'), positional: true,
    safe: ['--outputjson', '--warnings'], valued: ['-p', '--project', '--pythonversion', '--level'], noRun: ['--help', '-h', '--version', '--watch', '-w'] },
]

/** Calls that are recognised as test runs but can never be proven (bare `vitest` may start watch mode). */
const RECOGNISE_ONLY: readonly (readonly string[])[] = H('vitest', 'playwright')

/** Prefix launchers that call the next word directly (no shell): `npx [-y] vitest run`. */
const EXEC_PREFIXES: readonly (readonly string[])[] = H('npx', 'bunx', 'pnpm exec', 'yarn exec', 'pnpm dlx')
const EXEC_PREFIX_FLAGS = new Set(['-y', '--yes', '--no-install', '--no'])

/** Wrappers: whatever they run, the exit code is not plainly the runner's (or the call is not plainly readable). */
const WRAPPERS = new Set(['sh', 'bash', 'zsh', 'dash', 'eval', 'xargs', 'env', 'time', 'timeout', 'nice', 'nohup', 'sudo', 'exec', 'command', 'watch', 'entr', 'stdbuf'])

/** Package managers and how their test-script invocations look. */
const SCRIPT_NAME_RE = /^(test|check|verify|typecheck|lint)([:._-].*)?$/
const PM_SAFE_FLAGS = new Set(['--silent', '-s', '--ignore-scripts', '--loglevel=silent', '-q', '--quiet'])
const PM_WORKSPACE_FLAGS = ['--prefix', '--workspace', '-w', '--workspaces', '--filter', '-F', '-C', '--cwd', '--dir', '--recursive', '-r', '--if-present']
/** Workspace flags that take a value as the next word (`pnpm --filter web test`). */
const PM_VALUED_FLAGS = new Set(['--prefix', '--workspace', '-w', '--filter', '-F', '-C', '--cwd', '--dir'])

/** Interpreters a declared command may run a script file with, directly (`bash test/smoke.sh`). */
const SCRIPT_INTERPRETERS = new Set(['bash', 'sh', 'zsh', 'node', 'python', 'python3', 'ruby', 'perl'])

const MAX_DEPTH = 3

export type Judgment = {
  kind: RunKind
  isProven: boolean
  /** Why the run is not proven (absent when proven). */
  reason?: string
  /** The package script body that was judged, when one was. */
  script?: string
}

export type JudgeContext = {
  /** package.json scripts of the directory the command runs in; null when there is none. */
  scripts: Record<string, string> | null
  /** Commands STATE.md declares as verification (normalised whitespace). */
  declared: readonly string[]
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** Drops redirections (`> f`, `2>/dev/null`, `2>&1`, `&>f`, `< in`) — words, not arguments. */
export function stripRedirects(tokens: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as string
    const m = /^(?:\d*|&)(>>?|<)(.*)$/.exec(t)
    if (m) {
      if ((m[2] ?? '') === '') i++
      continue
    }
    out.push(t)
  }
  return out
}

const startsWith = (t: readonly string[], head: readonly string[]): boolean => head.length <= t.length && head.every((h, i) => t[i] === h)

/** Removes an `npx [flags]` / `pnpm exec` launcher; the launcher itself is not a wrapper (it execs the binary). */
function unlaunch(t: readonly string[]): string[] {
  for (const p of EXEC_PREFIXES) {
    if (!startsWith(t, p)) continue
    let rest = t.slice(p.length)
    while (rest.length && EXEC_PREFIX_FLAGS.has(rest[0] as string)) rest = rest.slice(1)
    return rest
  }
  return [...t]
}

function findRunner(t: readonly string[]): { spec: RunnerSpec; rest: string[] } | null {
  let best: { spec: RunnerSpec; rest: string[]; len: number } | null = null
  for (const spec of RUNNERS) {
    for (const head of spec.heads) {
      if (startsWith(t, head) && (!best || head.length > best.len)) best = { spec, rest: t.slice(head.length), len: head.length }
    }
  }
  return best ? { spec: best.spec, rest: best.rest } : null
}

type FlagVerdict = { ok: true } | { ok: false; reason: 'not-a-test-run' | 'unproven-flags' | 'unproven-args' }

function judgeArgs(spec: RunnerSpec, args: readonly string[]): FlagVerdict {
  let table: FlagTable = spec
  let positional: true | readonly string[] = spec.positional
  const goals = new Set<string>()
  for (let i = 0; i < args.length; i++) {
    const tok = args[i] as string
    if (tok === '--') {
      if (!spec.afterDoubleDash || table === spec.afterDoubleDash) return { ok: false, reason: 'unproven-args' }
      table = spec.afterDoubleDash
      positional = spec.afterDoubleDash.positional
      continue
    }
    if (tok.startsWith('-') && tok !== '-') {
      const name = tok.includes('=') ? tok.slice(0, tok.indexOf('=')) : tok
      if (table.noRun.includes(name)) return { ok: false, reason: 'not-a-test-run' }
      if (spec.defines && table === spec && /^-D./.test(tok)) {
        const key = tok.slice(2).split('=')[0] as string
        if (spec.defines.noRun.includes(key)) return { ok: false, reason: 'not-a-test-run' }
        if (spec.defines.safe.includes(key)) continue
        return { ok: false, reason: 'unproven-flags' }
      }
      if (table.safe.includes(name)) continue
      if (table.valued.includes(name)) {
        if (!tok.includes('=')) i++ // the value is the next word
        continue
      }
      if (table.safePrefixes?.some((p) => tok.startsWith(p))) continue
      return { ok: false, reason: 'unproven-flags' }
    }
    if (positional !== true) {
      if (!positional.includes(tok)) return { ok: false, reason: 'unproven-args' }
      goals.add(tok)
    }
  }
  if (spec.needsOneOf && !spec.needsOneOf.some((g) => goals.has(g))) return { ok: false, reason: 'not-a-test-run' }
  return { ok: true }
}

type PmCall = { script: string; extra: string[]; isWorkspace: boolean; hasUnknownFlag: boolean }

/** `npm test`, `npm run test:unit -- -x`, `pnpm test`, `yarn lint`, `bun run check` → the script and extra args. */
function pmCall(t: readonly string[]): PmCall | null {
  const pm = t[0]
  if (pm !== 'npm' && pm !== 'pnpm' && pm !== 'yarn' && pm !== 'bun') return null
  let i = 1
  const pre: string[] = []
  while (i < t.length && (t[i] as string).startsWith('-')) {
    const f = t[i++] as string
    pre.push(f)
    if (PM_VALUED_FLAGS.has(f) && i < t.length) pre.push(t[i++] as string) // its value, not the subcommand
  }
  const sub = t[i]
  if (sub === undefined) return null
  let script: string | null = null
  if ((sub === 'test' || ((sub === 't' || sub === 'tst') && pm === 'npm')) && pm !== 'bun') script = 'test'
  else if (sub === 'run' || sub === 'run-script') {
    const name = t[i + 1]
    if (name !== undefined && SCRIPT_NAME_RE.test(name)) { script = name; i++ }
  } else if ((pm === 'pnpm' || pm === 'yarn') && SCRIPT_NAME_RE.test(sub)) script = sub
  if (script === null) return null
  const rest = t.slice(i + 1)
  const extra: string[] = []
  let hasUnknownFlag = false
  for (let k = 0; k < rest.length; k++) {
    const x = rest[k] as string
    if (x === '--') { extra.push(...rest.slice(k + 1)); break }
    if (PM_SAFE_FLAGS.has(x)) continue
    extra.push(x)
  }
  const all = [...pre, ...rest]
  const isWorkspace = all.some((x) => PM_WORKSPACE_FLAGS.some((f) => x === f || x.startsWith(`${f}=`)))
  for (const x of pre) if (x.startsWith('-') && !PM_SAFE_FLAGS.has(x) && !PM_WORKSPACE_FLAGS.some((f) => x === f || x.startsWith(`${f}=`))) hasUnknownFlag = true
  return { script, extra, isWorkspace, hasUnknownFlag }
}

/** A script file run directly by an interpreter, or by path: allowed only for a declared command. */
function isScriptFile(t: readonly string[]): boolean {
  if (t.length === 1) return /^\.{0,2}\/\S+$/.test(t[0] as string) || /^[\w.-]+\/[\w./-]+$/.test(t[0] as string)
  if (t.length === 2 && SCRIPT_INTERPRETERS.has(t[0] as string)) {
    const f = t[1] as string
    return !f.startsWith('-') && /[./]/.test(f)
  }
  return false
}

/** Unwraps `sh -c "<body>"`, `env X=1 cmd`, `time cmd`, `xargs cmd` … for RECOGNITION only. */
function unwrapForRecognition(t: readonly string[], depth: number): string[][] {
  const w = t[0]
  if (w === undefined || !WRAPPERS.has(w)) return [[...t]]
  if (w === 'sh' || w === 'bash' || w === 'zsh' || w === 'dash') {
    const ci = t.indexOf('-c')
    if (ci >= 0 && t[ci + 1] !== undefined && depth < MAX_DEPTH) {
      return parseCommand(t[ci + 1] as string).segments.flatMap((s) => unwrapForRecognition(stripRedirects(s.tokens), depth + 1))
    }
    return [t.slice(1)]
  }
  if (w === 'eval') return depth < MAX_DEPTH ? parseCommand(t.slice(1).join(' ')).segments.flatMap((s) => unwrapForRecognition(stripRedirects(s.tokens), depth + 1)) : []
  let rest = t.slice(1)
  if (w === 'timeout') rest = rest.filter((x, i) => !(i === 0 && /^\d/.test(x)))
  while (rest.length && ((rest[0] as string).startsWith('-') || /^[A-Za-z_]\w*=/.test(rest[0] as string))) rest = rest.slice(1)
  return unwrapForRecognition(rest, depth + 1)
}

type Recognised = { kind: RunKind; script?: string }

/** Whether a simple command (already unwrapped and unlaunched) is a test-ish call; never a verdict. */
function recogniseSimple(t0: readonly string[], ctx: JudgeContext): Recognised | null {
  const t = unlaunch(t0)
  if (t.length === 0) return null
  const r = findRunner(t)
  if (r) return { kind: r.spec.kind }
  if (RECOGNISE_ONLY.some((h) => startsWith(t, h))) return { kind: 'runner' }
  const pm = pmCall(t)
  if (pm) {
    if (pm.isWorkspace) return { kind: 'package-script' } // another package.json than the one we read: recorded, unjudgeable
    const body = ctx.scripts?.[pm.script]
    if (body === undefined || body.trim() === '') return null
    if (pm.script === 'test' && /no test specified/i.test(body)) return null // npm's placeholder runs no test
    return { kind: 'package-script', script: body }
  }
  return null
}

/** Proof for one simple command (tokens without env assignments or redirections). `isDeclared` allows a script file. */
function prove(t0: readonly string[], ctx: JudgeContext, isDeclared: boolean, depth: number): { ok: true } | { ok: false; reason: string } {
  if (t0.length === 0) return { ok: false, reason: 'empty' }
  // A declared script file run directly (`bash test/smoke.sh`): exactly interpreter + file, so `bash -c …` never is.
  if (isDeclared && isScriptFile(t0)) return { ok: true }
  if (WRAPPERS.has(t0[0] as string)) return { ok: false, reason: 'wrapper' }
  const t = unlaunch(t0)
  const r = findRunner(t)
  if (r) {
    const v = judgeArgs(r.spec, r.rest)
    return v.ok ? v : { ok: false, reason: v.reason }
  }
  if (RECOGNISE_ONLY.some((h) => startsWith(t, h))) return { ok: false, reason: 'may-watch' }
  const pm = pmCall(t)
  if (pm) {
    if (pm.isWorkspace) return { ok: false, reason: 'workspace-flag' }
    if (pm.hasUnknownFlag) return { ok: false, reason: 'unproven-flags' }
    const body = ctx.scripts?.[pm.script]
    if (body === undefined || body.trim() === '') return { ok: false, reason: 'no-script' }
    if (depth >= MAX_DEPTH) return { ok: false, reason: 'script-depth' }
    const parsed = parseCommand(body.trim())
    if (isCompound(parsed)) return { ok: false, reason: masksExit(body) ? 'script-masks-exit' : 'script-compound' }
    const seg = parsed.segments[0] as Segment
    return prove([...stripRedirects(seg.tokens), ...pm.extra], ctx, true, depth + 1)
  }
  return { ok: false, reason: 'not-a-known-runner' }
}

const isCompound = (p: ParsedCommand): boolean => p.isComplex || p.segments.length !== 1 || p.segments.some((s) => s.op !== '')

/** `… || true`, `… || exit 0`, `…; true`: the body hides its own failures. */
export function masksExit(script: string): boolean {
  return /\|\|\s*(true|exit\s+0|:)(\s|$|;|&|\)|")/.test(script) || /;\s*(true|exit\s+0)(\s|$|;|")/.test(script)
}

/** Backtick spans on STATE lines that talk about testing/verifying — the commands this repo declares as its checks. */
export function declaredCommands(stateText: string): string[] {
  const out: string[] = []
  const talk = /test|verify|smoke|check|驗證|验证|測試|测试|檢查|检查|テスト|検証/i
  for (const line of stateText.split(/\r?\n/)) {
    if (!talk.test(line)) continue
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const span = norm(m[1] ?? '')
      if (span && !span.includes('{{')) out.push(span)
    }
  }
  return out
}

/**
 * Judges the part of a Bash command after any leading `cd <dir> &&` (the caller handles the cd and the cwd).
 * null → not a test-ish command: not recorded.
 */
export function judge(segments: readonly Segment[], isComplex: boolean, ctx: JudgeContext): Judgment | null {
  const parsed: ParsedCommand = { segments: [...segments], isComplex }
  const text = norm(segments.map((s) => [...s.env, ...s.tokens].join(' ') + (s.op && s.op !== '\n' ? ` ${s.op}` : '')).join(' '))
  const isDeclaredText = ctx.declared.includes(text) || ctx.declared.includes(norm(segments.map((s) => s.tokens.join(' ')).join(' ')))

  // Recognition: any segment, unwrapped, that is a test-ish call (or the whole text is declared).
  let rec: Recognised | null = isDeclaredText ? { kind: 'state-declared' } : null
  if (rec === null) {
    for (const seg of segments) {
      for (const t of unwrapForRecognition(stripRedirects(seg.tokens), 0)) {
        rec = recogniseSimple(t, ctx)
        if (rec) break
      }
      if (rec) break
    }
  }
  if (rec === null) return null

  const base: Judgment = rec.script !== undefined ? { kind: rec.kind, isProven: false, script: rec.script } : { kind: rec.kind, isProven: false }
  if (isCompound(parsed)) return { ...base, reason: 'compound' }
  const seg = segments[0] as Segment
  const p = prove(stripRedirects(seg.tokens), ctx, isDeclaredText, 0)
  return p.ok ? { ...base, isProven: true } : { ...base, reason: p.reason }
}
