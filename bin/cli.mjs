#!/usr/bin/env node
/**
 * flightwake CLI — `npx flightwake setup` (guided, interactive) or `npx flightwake init [flags]` (non-interactive;
 * also what a bare `npx flightwake` runs). Run at the target repo root: installs .flightwake/ templates + 4 skills
 * + Stop hook, and appends the trigger-obligation table to detected agent instruction files
 * (CLAUDE.md/AGENTS.md/GEMINI.md; override with --agents). Each detected platform gets the skills and the
 * wrap-up hook in its own dialect: Claude Code → .claude/skills + .claude/settings.json (`/fw-…`);
 * Codex → .agents/skills + .codex/hooks.json (`$fw-…`); Gemini CLI → .agents/skills + .gemini/settings.json.
 * Pure file copying, cross-platform (Node ≥18). User data (STATE/DECISIONS/TRAPS) is never overwritten;
 * framework-owned files (skills/hooks/TEMPLATE/CLAUDE.md snippet) are not overwritten by default — --force updates them.
 * `update` = re-detect the existing install's options (lang/statusline/private/profile) and force-refresh framework files.
 * The install itself lives in install.mjs (one code path for init, update and setup); setup.mjs only resolves
 * options by asking; doctor.mjs is read-only.
 */
import { existsSync, readFileSync, readdirSync, statSync, rmdirSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runRoles, removeRoleArtifacts } from './roles.mjs';
import {
  LANGS, PROFILES, GROUPS, isAgentName, INSTRUCTION_CANDIDATES, ORCA_BLOCK_RE, MOD_REL, modShipList, noJunk, makeM, gitAvailable, repoState, excludePath,
  addPrivateExcludes, gitMissingMessage, monorepoMessage, notRepoMessage, detectInstall, resolveOptions, install,
  printNext, unregisterRepo, createWriter, refusalReport, incompleteReport,
} from './install.mjs';
import { runDoctor, stateUnfilled } from './doctor.mjs';
import { runSetup, readlineIO, realContext } from './setup.mjs';

const FW_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.cwd();
const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('-')) ?? 'init';
const VERSION = JSON.parse(readFileSync(join(FW_SRC, 'package.json'), 'utf8')).version;
const COMMANDS = ['init', 'update', 'uninstall', 'roles', 'doctor', 'setup'];

const log = (s) => console.log(s);

if (!COMMANDS.includes(cmd) || args.includes('--help') || args.includes('-h')) {
  log(`flightwake — usage:
  npx flightwake setup [flags]     guided install: asks a few questions, shows every path it will write, then installs
  npx flightwake init [flags]      non-interactive install (a bare \`npx flightwake\` does the same; never asks anything)
  npx flightwake update | doctor | uninstall [--purge] | roles [install|apply [--dry-run]|card <id>|assign <repo>:<vendor> <id> [--add] [--dry-run]|remove]
  Run at the target repo root.
  setup       interactive (needs a terminal); flags given on the command line answer their question; --private is flag-only
  init        flags: --force updates existing skills/hooks/snippets; --lang=en|zh-TW|zh-CN|ja picks the language of installed
              content and CLI output (default en); --private keeps records local, out of git (.git/info/exclude + settings.local.json);
              --statusline installs the bottom gauge (health / STATE lag / context usage; never overwrites an existing statusline);
              --agents=claude,codex,gemini picks which platform instruction files get the obligation table (auto-detected by default);
              --profile=code|notes picks the obligation table (notes drops the tests/typecheck and schema/prod duties; default code);
              --orca adds the Orca collaboration block (opt-in add-on); --git-init creates the git repo first when there is none;
              --mod installs the Claude Code mod into .claude/skills/flightwake-mod (opt-in; needs Claude Code 2.1.287+; skipped without claude)
  update      re-install with the options detected from the existing install (lang / statusline / private / profile) — the in-place upgrade;
              add-ons (roles, Orca, the mod) are refreshed only where already installed
  doctor      read-only check of the install structure (git, STATE, markers, skills, hooks, private excludes, add-ons); exit 1 on any failure
  uninstall   reverse-remove framework files and marker blocks; keeps .flightwake/ user data unless --purge
  roles       opt-in add-on: install the fw-roles skill; apply renders .flightwake/ROLES.md — seats into CLAUDE.md/AGENTS.md/GEMINI.md,
              on-call (unseated) roles into native agents (.claude/agents, .codex/agents); card prints a dispatch card; assign changes a seat;
              remove strips this repo's role output (ROLES.md kept). Roles are guidance, not permissions`);
  process.exit([...COMMANDS, 'help'].includes(cmd) ? 0 : 1);
}

const flagValue = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const langArg = flagValue('lang');
if (langArg && !LANGS.includes(langArg)) {
  log(`⚠️  --lang not recognized: ${langArg} (available: ${LANGS.join(', ')})`);
  process.exit(1);
}
const profileArg = flagValue('profile');
if (profileArg && !PROFILES.includes(profileArg)) {
  log(`⚠️  --profile not recognized: ${profileArg} (available: ${PROFILES.join(', ')})`);
  process.exit(1);
}
const agentsArg = flagValue('agents');
const wanted = agentsArg !== undefined ? agentsArg.split(',').map((s) => s.trim()).filter(Boolean) : null;
if (wanted) {
  const bad = wanted.filter((w) => !isAgentName(w));
  if (bad.length) { log(`⚠️  --agents not recognized: ${bad.join(', ')} (available: ${Object.keys(GROUPS).join(', ')})`); process.exit(1); }
}
const flags = {
  force: args.includes('--force'),
  private: args.includes('--private'),
  statusline: args.includes('--statusline'),
  orca: args.includes('--orca'),
  mod: args.includes('--mod'),
  gitInit: args.includes('--git-init'),
  lang: langArg,
  profile: profileArg,
  agents: wanted,
};

// Reading the existing install needs no git (files only; the exclude lookup falls back to .git/info/exclude)
const det = detectInstall(TARGET);
// Language: explicit flag > existing install's language > English
const LANG = langArg ?? det.marker?.lang ?? 'en';
const M = makeM(LANG);

// ── setup: interactive only. No TTY → explain and fail, never guess answers (agents/CI use init + flags) ──
if (cmd === 'setup') {
  if (!process.stdin.isTTY) {
    log(M({
      en: '⚠️  setup is interactive and needs a terminal (stdin is not a TTY).\n    For scripts, agents and CI use the non-interactive form, e.g.: npx flightwake init --lang=en --statusline',
      'zh-TW': '⚠️  setup 是互動式,需要終端機(stdin 不是 TTY)。\n    腳本、agent 與 CI 請改用非互動的 init 加旗標,例如:npx flightwake init --lang=zh-TW --statusline',
      'zh-CN': '⚠️  setup 是交互式,需要终端(stdin 不是 TTY)。\n    脚本、agent 与 CI 请改用非交互的 init 加旗标,例如:npx flightwake init --lang=zh-CN --statusline',
      ja: '⚠️  setup は対話式で、端末が必要です(stdin が TTY ではありません)。\n    スクリプト・agent・CI では非対話の init とフラグを使ってください。例:npx flightwake init --lang=ja --statusline',
    }));
    process.exit(1);
  }
  const io = readlineIO();
  const code = await runSetup({ io, flags, ctx: realContext({ target: TARGET, fwSrc: FW_SRC, version: VERSION }) });
  io.close();
  process.exit(code);
}

// ── doctor: read-only; reports git/repo problems as findings instead of bailing out ──
if (cmd === 'doctor') process.exit(runDoctor({ target: TARGET, fwSrc: FW_SRC, version: VERSION, lang: LANG, log }));

// init (and setup, inside its flow) require a runnable git — with a .git directory but no git binary, the --private
// tracked-file checks would silently read "untracked" and could write into tracked files. Other commands keep
// main's behavior: uninstall/update/roles still work on a repo whose git binary is missing (repo = .git exists).
if (cmd === 'init' && !gitAvailable()) { log(gitMissingMessage(M)); process.exit(1); }
const repo = repoState(TARGET);
if (repo.kind === 'sub') {
  // Monorepo policy: one install per repo, at the git root — sessions cross directories, so records follow the session, not the directory
  log(monorepoMessage(M, repo.root));
  process.exit(1);
}
if (repo.kind === 'none') {
  if (cmd !== 'init' || !flags.gitInit) { log(notRepoMessage(M, TARGET)); process.exit(1); }
}
// --git-init: the one write outside the copy-files scope, only when explicitly asked — run after the preflight below
const doGitInit = repo.kind === 'none';

if (cmd === 'update' && !det.installed && !existsSync(join(TARGET, '.flightwake'))) {
  log(M({
    en: '⚠️  No flightwake install detected here — run `npx flightwake init` first.',
    'zh-TW': '⚠️  這裡偵測不到 flightwake 安裝 — 請先跑 `npx flightwake init`。',
    'zh-CN': '⚠️  这里检测不到 flightwake 安装 — 请先跑 `npx flightwake init`。',
    ja: '⚠️  ここに flightwake のインストールが見つかりません — まず `npx flightwake init` を実行してください。',
  }));
  process.exit(1);
}

// ── roles: opt-in add-on (bin/roles.mjs) — never part of init ──
if (cmd === 'roles') {
  process.exit(runRoles({
    target: TARGET, fwSrc: FW_SRC, version: VERSION, lang: LANG, args, log, M, noJunk,
    addExcludes: (e, W) => addPrivateExcludes(TARGET, e, W),
    writer: {
      // boundary = the repo being written (cross-repo roles pass each target repo)
      make: (dry, boundary = TARGET) => createWriter({ target: boundary, dry, log: dry ? () => {} : log, M }),
      refusalReport: (r) => refusalReport(M, r),
      incompleteReport: (d) => incompleteReport(M, d),
    },
  }));
}

// ── uninstall: reverse-remove init's fixed write set; .flightwake/ user data kept unless --purge ──
// Every deletion and edit goes through the guarded writer (install.mjs createWriter) and is preflighted dry first:
// a skills tree symlinked outside the repo, or any other refused path, stops uninstall before it removes anything.
if (cmd === 'uninstall') {
  const PURGE = args.includes('--purge');
  const header = `flightwake uninstall v${VERSION}${PURGE ? ' (--purge)' : ''} → ${TARGET}\n`;
  const isLink = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
  const run = (W, out, dry) => {
    const rm = (rel, note = '') => {
      const p = join(TARGET, ...rel.split('/'));
      if (!existsSync(p) && !isLink(p)) return;
      if (W.rm(p)) out(`  rm   ${rel}${note}`);
    };
    const rmdirQuiet = (rel) => { // only empty, real directories; non-empty = the user's own things (failing is the point)
      const p = join(TARGET, ...rel.split('/'));
      if (dry || isLink(p)) return;
      try { rmdirSync(p); } catch {}
    };
    // 1. Skills (both trees: .claude/skills for Claude Code, .agents/skills for Codex/Gemini) + framework files
    //    inside .flightwake/ (hooks/ removed once emptied; anything the user put there stays)
    for (const sk of readdirSync(join(FW_SRC, 'skills', 'en'))) {
      if (!statSync(join(FW_SRC, 'skills', 'en', sk)).isDirectory()) continue;
      rm(`.claude/skills/${sk}`);
      rm(`.agents/skills/${sk}`);
    }
    rm('.flightwake/TEMPLATE-record.md');
    // Claude Code mod add-on: only the files flightwake ships, then the directories that leaves empty (deepest first).
    // Anything else in the folder — your notes, files the engine wrote — is kept and named: uninstall never deletes
    // what it did not write (and --purge is about .flightwake/ only).
    const modDir = join(TARGET, ...MOD_REL.split('/'));
    if (existsSync(modDir) || isLink(modDir)) {
      const shipped = modShipList(FW_SRC);
      for (const f of shipped) rm(`${MOD_REL}/${f}`);
      const dirs = new Set();
      for (const f of shipped) for (let d = dirname(f); d !== '.'; d = dirname(d)) dirs.add(d);
      for (const d of [...dirs].sort((a, b) => b.split('/').length - a.split('/').length)) rmdirQuiet(`${MOD_REL}/${d}`);
      rmdirQuiet(MOD_REL);
      if (!dry && existsSync(modDir) && !isLink(modDir)) {
        const left = [];
        const walk = (dir, rel) => {
          for (const f of readdirSync(dir)) {
            const r = rel ? `${rel}/${f}` : f;
            let isDirectory = false;
            try { isDirectory = lstatSync(join(dir, f)).isDirectory(); } catch {}
            if (isDirectory) walk(join(dir, f), r); else left.push(r);
          }
        };
        walk(modDir, '');
        if (left.length) out(`  ${M({
          en: `kept ${MOD_REL}/ — not shipped by flightwake, so left in place: ${left.join(', ')}`,
          'zh-TW': `保留 ${MOD_REL}/ — 以下不是 flightwake 發行的檔,原樣留下:${left.join(', ')}`,
          'zh-CN': `保留 ${MOD_REL}/ — 以下不是 flightwake 发行的文件,原样留下:${left.join(', ')}`,
          ja: `${MOD_REL}/ を残す — flightwake が配布したファイルではないためそのまま:${left.join(', ')}`,
        })}`);
      }
    }
    // roles add-on: its skill and role blocks are framework-written too (ROLES.md is user data, kept like STATE)
    removeRoleArtifacts(TARGET, out, W);
    rm('.flightwake/hooks/state-check.mjs');
    rm('.flightwake/hooks/statusline.mjs');
    rmdirQuiet('.flightwake/hooks');
    // 2. Settings: pluck only flightwake's hook (Stop for Claude/Codex, AfterAgent for Gemini) and statusLine,
    //    keep everything else; delete the file only if empty after
    for (const [rel, event] of [
      ['.claude/settings.json', 'Stop'], ['.claude/settings.local.json', 'Stop'],
      ['.codex/hooks.json', 'Stop'], ['.gemini/settings.json', 'AfterAgent'],
    ]) {
      const p = join(TARGET, ...rel.split('/'));
      if (!existsSync(p)) continue;
      let st;
      try { st = JSON.parse(readFileSync(p, 'utf8')); }
      catch { out(`  ⚠️  ${rel} is not valid JSON — remove the state-check.mjs ${event} hook and statusline.mjs statusLine manually`); continue; }
      if (!st || typeof st !== 'object' || Array.isArray(st)) continue;
      let changed = false;
      const stop = st.hooks?.[event];
      if (Array.isArray(stop) && JSON.stringify(stop).includes('state-check.mjs')) {
        const cleaned = stop
          .map((e) => ({ ...e, hooks: (Array.isArray(e?.hooks) ? e.hooks : []).filter((h) => !String(h?.command ?? '').includes('state-check.mjs')) }))
          .filter((e) => e.hooks.length);
        if (cleaned.length) st.hooks[event] = cleaned; else delete st.hooks[event];
        if (st.hooks && !Object.keys(st.hooks).length) delete st.hooks;
        changed = true;
      }
      if (JSON.stringify(st.statusLine ?? null).includes('statusline.mjs')) { delete st.statusLine; changed = true; }
      if (!changed) continue;
      if (!Object.keys(st).length) rm(rel, ' (empty after removal)');
      else if (W.write(p, JSON.stringify(st, null, 2) + '\n')) out(`  edit ${rel} ← flightwake settings removed`);
    }
    // 3. Marker blocks (obligation table + Orca add-on) in instruction files; delete the file only if empty after
    //    (= flightwake created it)
    for (const rel of INSTRUCTION_CANDIDATES) {
      const p = join(TARGET, ...rel.split('/'));
      if (!existsSync(p)) continue;
      const cur = readFileSync(p, 'utf8');
      const hasCore = cur.includes('<!-- flightwake:begin');
      const hasOrca = ORCA_BLOCK_RE.test(cur);
      if (!hasCore && !hasOrca) {
        if (cur.includes('flightwake 工作紀律')) out(`  ⚠️  ${rel} has a v0.1 unmarked snippet that can't be removed automatically — delete that section by hand`);
        continue;
      }
      const updated = cur.replace(ORCA_BLOCK_RE, '\n').replace(/\n?<!-- flightwake:begin[\s\S]*?<!-- flightwake:end -->\n?/, '\n').replace(/^\n+/, '');
      if (!updated.trim()) rm(rel, ' (empty after snippet removal)');
      else if (W.write(p, updated)) out(`  edit ${rel} ← snippet removed`);
    }
    // 4. Marker block in .git/info/exclude (trace of a --private install)
    try {
      const ep = excludePath(TARGET);
      if (existsSync(ep) && readFileSync(ep, 'utf8').includes('# flightwake:begin')) {
        if (W.write(ep, readFileSync(ep, 'utf8').replace(/# flightwake:begin[\s\S]*?# flightwake:end\n?/, ''), false)) out('  edit .git/info/exclude ← flightwake block removed');
      }
    } catch {}
    // 5. Remove now-empty directories
    for (const rel of ['.claude/skills', '.claude', '.agents/skills', '.agents', '.codex', '.gemini']) rmdirQuiet(rel);
    // 6. User data only on --purge
    if (PURGE) rm('.flightwake');
  };
  const pre = createWriter({ target: TARGET, dry: true, M });
  run(pre.W, () => {}, true);
  if (pre.refused.length) { log(header); log(refusalReport(M, pre.refused)); process.exit(1); }
  log(header);
  const real = createWriter({ target: TARGET, log, M });
  try { run(real.W, log, false); } catch (e) { log(incompleteReport(M, e?.message ?? String(e))); process.exit(1); }
  if (real.refused.length) { log(incompleteReport(M, real.refused.map((r) => r.path).join(', '))); process.exit(1); }
  // Cross-repo registry entry (best-effort)
  unregisterRepo(TARGET, log);
  if (PURGE) {
    log('\n✅ uninstall done (--purge). User data (STATE/DECISIONS/TRAPS/records) deleted too; anything ever committed is still recoverable from git history.');
  } else {
    log('\n✅ uninstall done. .flightwake/ (STATE/DECISIONS/TRAPS/records) is user data and was kept — use uninstall --purge or delete it yourself if you are sure.');
  }
  process.exit(0);
}

// ── init / update: one install path (install.mjs) ──
const IS_UPDATE = cmd === 'update';
const opts = resolveOptions({ update: IS_UPDATE, flags, det });
const base = { ...opts, target: TARGET, fwSrc: FW_SRC, version: VERSION, marker: det.marker };
// Preflight: the same install, dry. Any destination the guard refuses (symlink, outside the repo, dangling) stops
// everything here — before the first write, so there is never a half install to explain.
const pre = install({ ...base, dry: true, log });
if (pre.refused.length) { log(refusalReport(M, pre.refused)); process.exit(1); }
let result;
try {
  if (doGitInit) {
    execFileSync('git', ['init'], { cwd: TARGET, stdio: 'ignore' });
    log(`  git init ${TARGET}`);
  }
  result = install({ ...base, log });
} catch (e) {
  log(incompleteReport(M, e?.message ?? String(e)));
  process.exit(1);
}
// Something the preflight could not foresee (the tree changed in between): not done, and the exit code says so
if (result.refused.length) { log(incompleteReport(M, result.refused.map((r) => r.path).join(', '))); process.exit(1); }
if (IS_UPDATE) {
  log(M({
    en: `\n✅ updated to v${VERSION}.`,
    'zh-TW': `\n✅ 已更新到 v${VERSION}。`,
    'zh-CN': `\n✅ 已更新到 v${VERSION}。`,
    ja: `\n✅ v${VERSION} に更新しました。`,
  }));
} else {
  printNext({ ...opts, langExplicit: !!langArg, marker: det.marker, fresh: stateUnfilled(TARGET, FW_SRC), log }, result);
}
