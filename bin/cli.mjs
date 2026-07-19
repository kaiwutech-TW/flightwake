#!/usr/bin/env node
/**
 * flightwake CLI — `npx flightwake init [--force] [--lang=en|zh-TW]` (or `npx github:kaiwutech-TW/flightwake init`)
 * Run at the target repo root: installs .flightwake/ templates + 4 skills + Stop hook,
 * and appends the trigger-obligation table to detected agent instruction files
 * (CLAUDE.md/AGENTS.md/GEMINI.md; override with --agents).
 * Pure file copying, cross-platform (Node ≥18). User data (STATE/DECISIONS/TRAPS) is never overwritten;
 * framework-owned files (skills/hooks/TEMPLATE/CLAUDE.md snippet) are not overwritten by default — --force updates them.
 * `update` = re-detect the existing install's options (lang/statusline/private) and force-refresh framework files.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync, rmSync, rmdirSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const FW_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.cwd();
const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('-')) ?? 'init';
const IS_UPDATE = cmd === 'update';
const FORCE = args.includes('--force') || IS_UPDATE;
const PRIVATE_FLAG = args.includes('--private');
const STATUSLINE_FLAG = args.includes('--statusline');
const VERSION = JSON.parse(readFileSync(join(FW_SRC, 'package.json'), 'utf8')).version;
const LANGS = ['en', 'zh-TW'];

const log = (s) => console.log(s);
const noJunk = (src) => !/(^|[\\/])\.(DS_Store|AppleDouble)$/.test(src);

if (!['init', 'update', 'uninstall'].includes(cmd) || args.includes('--help') || args.includes('-h')) {
  log(`flightwake — usage: npx flightwake init [--force] [--lang=en|zh-TW] [--private] [--statusline] [--agents=claude,codex,gemini] | update | uninstall [--purge]
  Run at the target repo root.
  init        install; --force updates existing skills/hooks/snippets; --lang picks the language of installed content
              and CLI output (default en); --private keeps records local, out of git (.git/info/exclude + settings.local.json);
              --statusline installs the bottom gauge (health / STATE lag / context usage; never overwrites an existing statusline);
              --agents picks which platform instruction files get the obligation table (auto-detected by default)
  update      re-install with the options detected from the existing install (lang / statusline / private) — the in-place upgrade
  uninstall   reverse-remove framework files and marker blocks; keeps .flightwake/ user data unless --purge`);
  process.exit(['init', 'update', 'uninstall', 'help'].includes(cmd) ? 0 : 1);
}

const git = (...a) => execFileSync('git', a, { cwd: TARGET, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const isTracked = (rel) => { try { return git('ls-files', '--', rel) !== ''; } catch { return false; } };

// .git checked with existsSync: in worktrees/submodules .git is a file, not a directory
if (!existsSync(join(TARGET, '.git'))) {
  let root = null;
  try { root = git('rev-parse', '--show-toplevel'); } catch {}
  if (root) {
    // Monorepo policy: one install per repo, at the git root — sessions cross directories, so records follow the session, not the directory
    log(`⚠️  flightwake policy: one install per repo, at the git root.\n    Run this in ${root} (a submodule has its own .git and counts as its own repo).`);
  } else {
    log(`⚠️  Not a git repo (${TARGET}) — flightwake relies on git as its recording substrate. Run git init first.`);
  }
  process.exit(1);
}
const excludePath = () => {
  let p;
  try { p = git('rev-parse', '--git-path', 'info/exclude'); } catch { p = join('.git', 'info', 'exclude'); }
  return isAbsolute(p) ? p : join(TARGET, p);
};

// ── Detect the existing install (marker version/lang, statusline, private) — drives `update` and lang defaults ──
const INSTRUCTION_CANDIDATES = ['.claude/CLAUDE.md', 'CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', 'GEMINI.md'];
const detectMarker = () => {
  for (const rel of INSTRUCTION_CANDIDATES) {
    const p = join(TARGET, ...rel.split('/'));
    if (!existsSync(p)) continue;
    const m = /<!-- flightwake:begin v(\d+\.\d+\.\d+[^\s]*)(?:\s+lang=([\w-]+))?\s*-->/.exec(readFileSync(p, 'utf8'));
    // Pre-0.9 markers carry no lang attribute — every install back then was zh-TW
    if (m) return { version: m[1], lang: m[2] ?? 'zh-TW' };
  }
  return null;
};
const detectStatusline = () => {
  for (const rel of ['.claude/settings.json', '.claude/settings.local.json']) {
    const p = join(TARGET, ...rel.split('/'));
    try { if (existsSync(p) && JSON.stringify(JSON.parse(readFileSync(p, 'utf8')).statusLine ?? null).includes('statusline.mjs')) return true; } catch {}
  }
  return false;
};
const detectPrivate = () => {
  try { const ep = excludePath(); return existsSync(ep) && readFileSync(ep, 'utf8').includes('# flightwake:begin'); } catch { return false; }
};

const marker = detectMarker();
const langArg = args.find((a) => a.startsWith('--lang='))?.slice('--lang='.length);
if (langArg && !LANGS.includes(langArg)) {
  log(`⚠️  --lang not recognized: ${langArg} (available: ${LANGS.join(', ')})`);
  process.exit(1);
}
// Language: explicit flag > existing install's language > English
const LANG = langArg ?? marker?.lang ?? 'en';
const PRIVATE = PRIVATE_FLAG || (IS_UPDATE && detectPrivate());
const STATUSLINE = STATUSLINE_FLAG || (IS_UPDATE && detectStatusline());
// M(): bilingual CLI output — English default, zh-TW when the install (or --lang) says so
const M = (en, zh) => (LANG === 'zh-TW' ? zh : en);

if (IS_UPDATE && !marker && !existsSync(join(TARGET, '.flightwake'))) {
  log(M(
    '⚠️  No flightwake install detected here — run `npx flightwake init` first.',
    '⚠️  這裡偵測不到 flightwake 安裝 — 請先跑 `npx flightwake init`。',
  ));
  process.exit(1);
}

// ── uninstall: reverse-remove init's fixed write set; .flightwake/ user data kept unless --purge ──
if (cmd === 'uninstall') {
  const PURGE = args.includes('--purge');
  log(`flightwake uninstall v${VERSION}${PURGE ? ' (--purge)' : ''} → ${TARGET}\n`);
  const rm = (rel) => {
    const p = join(TARGET, ...rel.split('/'));
    if (!existsSync(p)) return;
    rmSync(p, { recursive: true });
    log(`  rm   ${rel}`);
  };
  // 1. Skills + framework files inside .flightwake/ (hooks/ removed once emptied; anything the user put there stays)
  for (const s of readdirSync(join(FW_SRC, 'skills', 'en'))) {
    if (statSync(join(FW_SRC, 'skills', 'en', s)).isDirectory()) rm(`.claude/skills/${s}`);
  }
  rm('.flightwake/TEMPLATE-record.md');
  rm('.flightwake/hooks/state-check.mjs');
  rm('.flightwake/hooks/statusline.mjs');
  try { rmdirSync(join(TARGET, '.flightwake', 'hooks')); } catch {}
  // 2. Settings: pluck only flightwake's Stop hook and statusLine, keep everything else; delete the file only if empty after
  for (const rel of ['.claude/settings.json', '.claude/settings.local.json']) {
    const p = join(TARGET, ...rel.split('/'));
    if (!existsSync(p)) continue;
    let s;
    try { s = JSON.parse(readFileSync(p, 'utf8')); }
    catch { log(`  ⚠️  ${rel} is not valid JSON — remove the state-check.mjs Stop hook and statusline.mjs statusLine manually`); continue; }
    let changed = false;
    const stop = s.hooks?.Stop;
    if (Array.isArray(stop) && JSON.stringify(stop).includes('state-check.mjs')) {
      const cleaned = stop
        .map((e) => ({ ...e, hooks: (e.hooks ?? []).filter((h) => !String(h.command ?? '').includes('state-check.mjs')) }))
        .filter((e) => e.hooks.length);
      if (cleaned.length) s.hooks.Stop = cleaned; else delete s.hooks.Stop;
      if (s.hooks && !Object.keys(s.hooks).length) delete s.hooks;
      changed = true;
    }
    if (JSON.stringify(s.statusLine ?? null).includes('statusline.mjs')) { delete s.statusLine; changed = true; }
    if (!changed) continue;
    if (!Object.keys(s).length) { rmSync(p); log(`  rm   ${rel} (empty after removal)`); }
    else { writeFileSync(p, JSON.stringify(s, null, 2) + '\n'); log(`  edit ${rel} ← flightwake settings removed`); }
  }
  // 3. Marker blocks in instruction files; delete the file only if empty after (= flightwake created it)
  for (const rel of INSTRUCTION_CANDIDATES) {
    const p = join(TARGET, ...rel.split('/'));
    if (!existsSync(p)) continue;
    const cur = readFileSync(p, 'utf8');
    if (!cur.includes('<!-- flightwake:begin')) {
      if (cur.includes('flightwake 工作紀律')) log(`  ⚠️  ${rel} has a v0.1 unmarked snippet that can't be removed automatically — delete that section by hand`);
      continue;
    }
    const updated = cur.replace(/\n?<!-- flightwake:begin[\s\S]*?<!-- flightwake:end -->\n?/, '\n').replace(/^\n+/, '');
    if (!updated.trim()) { rmSync(p); log(`  rm   ${rel} (empty after snippet removal)`); }
    else { writeFileSync(p, updated); log(`  edit ${rel} ← snippet removed`); }
  }
  // 4. Marker block in .git/info/exclude (trace of a --private install)
  try {
    const ep = excludePath();
    if (existsSync(ep) && readFileSync(ep, 'utf8').includes('# flightwake:begin')) {
      writeFileSync(ep, readFileSync(ep, 'utf8').replace(/# flightwake:begin[\s\S]*?# flightwake:end\n?/, ''));
      log('  edit .git/info/exclude ← flightwake block removed');
    }
  } catch {}
  // 5. Remove now-empty directories (non-empty = user has their own things there; rmdir fails silently, which is the point)
  try { rmdirSync(join(TARGET, '.claude', 'skills')); } catch {}
  try { rmdirSync(join(TARGET, '.claude')); } catch {}
  // 6. User data
  if (PURGE) {
    rm('.flightwake');
    log('\n✅ uninstall done (--purge). User data (STATE/DECISIONS/TRAPS/records) deleted too; anything ever committed is still recoverable from git history.');
  } else {
    log('\n✅ uninstall done. .flightwake/ (STATE/DECISIONS/TRAPS/records) is user data and was kept — use uninstall --purge or delete it yourself if you are sure.');
  }
  process.exit(0);
}

// --private collects entries for .git/info/exclude (relative to repo root); null = not private
const privateExcludes = PRIVATE ? ['.flightwake/'] : null;

if (IS_UPDATE) {
  log(`flightwake update v${marker?.version ?? '?'} → v${VERSION} (lang=${LANG}${STATUSLINE ? ', statusline' : ''}${PRIVATE ? ', private' : ''}) → ${TARGET}\n`);
} else {
  log(`flightwake init v${VERSION}${PRIVATE ? ' (--private)' : ''} (lang=${LANG}) → ${TARGET}\n`);
}

// 1. .flightwake/ templates — STATE/DECISIONS/TRAPS are user data, never overwritten (even with --force)
mkdirSync(join(TARGET, '.flightwake', 'records'), { recursive: true });
mkdirSync(join(TARGET, '.flightwake', 'hooks'), { recursive: true });
for (const f of ['STATE.md', 'DECISIONS.md', 'TRAPS.md']) {
  const dst = join(TARGET, '.flightwake', f);
  if (existsSync(dst)) log(`  skip .flightwake/${f}${M(' (exists — user data, never overwritten)', '(已存在,使用者資料不覆蓋)')}`);
  else { writeFileSync(dst, readFileSync(join(FW_SRC, 'templates', LANG, f), 'utf8')); log(`  add  .flightwake/${f}`); }
}

// 2. Framework-owned files: record template + hooks (--force updates them).
//    Hooks are stamped at copy time: LANG picks their message language, FW_VERSION feeds the statusline update check.
const stamp = (src) => readFileSync(src, 'utf8')
  .replace(/^const LANG = '[^']*';$/m, `const LANG = '${LANG}';`)
  .replace(/^const FW_VERSION = '[^']*';$/m, `const FW_VERSION = '${VERSION}';`);
for (const [read, rel] of [
  [() => readFileSync(join(FW_SRC, 'templates', LANG, 'TEMPLATE-record.md'), 'utf8'), join('.flightwake', 'TEMPLATE-record.md')],
  [() => stamp(join(FW_SRC, 'hooks', 'state-check.mjs')), join('.flightwake', 'hooks', 'state-check.mjs')],
  [() => stamp(join(FW_SRC, 'hooks', 'statusline.mjs')), join('.flightwake', 'hooks', 'statusline.mjs')],
]) {
  const dst = join(TARGET, rel);
  const existed = existsSync(dst);
  if (existed && !FORCE) { log(`  skip ${rel}${M(' (exists — --force to update)', '(已存在,--force 可更新)')}`); continue; }
  writeFileSync(dst, read());
  log(`  ${existed ? 'update' : 'add '} ${rel}`);
}

// 3. The four skills → .claude/skills/ (directories only, junk filtered; --force updates)
mkdirSync(join(TARGET, '.claude', 'skills'), { recursive: true });
for (const s of readdirSync(join(FW_SRC, 'skills', LANG))) {
  if (!statSync(join(FW_SRC, 'skills', LANG, s)).isDirectory()) continue;
  privateExcludes?.push(`.claude/skills/${s}/`);
  const dst = join(TARGET, '.claude', 'skills', s);
  const existed = existsSync(dst);
  if (existed && !FORCE) { log(`  skip .claude/skills/${s}${M(' (exists — --force to update)', '(已存在,--force 可更新)')}`); continue; }
  cpSync(join(FW_SRC, 'skills', LANG, s), dst, { recursive: true, force: true, filter: noJunk });
  log(`  ${existed ? 'update' : 'add '} .claude/skills/${s}`);
}

// 4. Stop hook merged into .claude/settings.json (--private → settings.local.json, stays out of the repo)
{
  const settingsRel = PRIVATE ? '.claude/settings.local.json' : '.claude/settings.json';
  const settingsPath = join(TARGET, ...settingsRel.split('/'));
  privateExcludes?.push(settingsRel);
  const HOOK_CMD = 'node "$CLAUDE_PROJECT_DIR/.flightwake/hooks/state-check.mjs"';
  // The two settings files recognize each other: if the other mode already installed the hook, don't duplicate
  // (Claude Code merges settings.json with local — a duplicate means the Stop reminder fires twice)
  const otherRel = PRIVATE ? '.claude/settings.json' : '.claude/settings.local.json';
  const otherPath = join(TARGET, ...otherRel.split('/'));
  const inOther = (() => { try { return existsSync(otherPath) && readFileSync(otherPath, 'utf8').includes('state-check.mjs'); } catch { return false; } })();
  let settings = {};
  let parseOk = true;
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); }
    catch { parseOk = false; log(`  ⚠️  ${settingsRel} is not valid JSON — skipping hook install; add to hooks.Stop manually: ${HOOK_CMD}`); }
  }
  if (parseOk) {
    settings.hooks ??= {};
    settings.hooks.Stop ??= [];
    if (inOther) {
      log(`  skip Stop hook${M(` (already set in ${otherRel} — the other mode's install still applies)`, `(${otherRel} 已設定 — 另一模式的安裝仍生效)`)}`);
    } else if (JSON.stringify(settings.hooks.Stop).includes('state-check.mjs')) {
      log(`  skip ${settingsRel} Stop hook${M(' (already set)', '(已設定)')}`);
    } else {
      settings.hooks.Stop.push({ hooks: [{ type: 'command', command: HOOK_CMD }] });
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      log(`  add  ${settingsRel} ← Stop hook${M(' (STATE staleness check)', '(STATE 過期檢查)')}`);
    }
    // --statusline: the bottom gauge (opt-in). statusLine is a single-value setting — never overwrite someone else's
    if (STATUSLINE) {
      const SL_CMD = 'node "$CLAUDE_PROJECT_DIR/.flightwake/hooks/statusline.mjs"';
      const slInOther = (() => {
        try { return existsSync(otherPath) && JSON.stringify(JSON.parse(readFileSync(otherPath, 'utf8')).statusLine ?? null).includes('statusline.mjs'); }
        catch { return false; }
      })();
      if (slInOther) {
        log(`  skip statusLine${M(` (already set in ${otherRel} — the other mode's install still applies)`, `(${otherRel} 已設定 — 另一模式的安裝仍生效)`)}`);
      } else if (settings.statusLine && !JSON.stringify(settings.statusLine).includes('statusline.mjs')) {
        log(`  ⚠️  ${settingsRel}${M(` already has another statusLine — not overwriting; to switch, set command to: ${SL_CMD}`, ` 已有其他 statusLine,不覆蓋 — 要換請手動設 command 為:${SL_CMD}`)}`);
      } else if (settings.statusLine) {
        log(`  skip ${settingsRel} statusLine${M(' (already set)', '(已設定)')}`);
      } else {
        if (Array.isArray(settings.hooks?.Stop) && !settings.hooks.Stop.length) {
          delete settings.hooks.Stop;
          if (!Object.keys(settings.hooks).length) delete settings.hooks;
        }
        settings.statusLine = { type: 'command', command: SL_CMD };
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        log(`  add  ${settingsRel} ← statusLine${M(' (flightwake gauge)', '(flightwake 儀表)')}`);
      }
    }
  }
}

// 5. Trigger-obligation snippet → each agent instruction file. Default: detect existing files
//    (CLAUDE.md/AGENTS.md/GEMINI.md — whichever exists gets it); --agents=claude,codex,gemini targets platforms
//    (creating missing files); no instruction file at all and nothing specified → create AGENTS.md (widest compatibility).
{
  const BEGIN = '<!-- flightwake:begin';
  const END = '<!-- flightwake:end -->';
  const LEGACY = 'flightwake 工作紀律';
  const body = readFileSync(join(FW_SRC, 'snippets', LANG, 'CLAUDE-md-snippet.md'), 'utf8').replace(/^<!--[\s\S]*?-->\n?/, '');
  const block = `${BEGIN} v${VERSION} lang=${LANG} -->\n${body.trimEnd()}\n${END}\n`;
  // Platform groups: candidates in a group count as the same file (installed into the first that exists;
  // a marker in any of them means no duplicate). The group's last candidate is the creation target for --agents.
  const GROUPS = {
    claude: ['.claude/CLAUDE.md', 'CLAUDE.md'],
    codex: ['AGENTS.md'],
    gemini: ['GEMINI.md'],
  };
  const agentsArg = args.find((a) => a.startsWith('--agents='));
  const wanted = agentsArg ? agentsArg.slice('--agents='.length).split(',').map((s) => s.trim()).filter(Boolean) : null;
  if (wanted) {
    const bad = wanted.filter((w) => !GROUPS[w]);
    if (bad.length) { log(`⚠️  --agents not recognized: ${bad.join(', ')} (available: ${Object.keys(GROUPS).join(', ')})`); process.exit(1); }
  }
  const anyInstructionFile = Object.values(GROUPS).flat().some((rel) => existsSync(join(TARGET, ...rel.split('/'))));
  for (const [name, rels] of Object.entries(GROUPS)) {
    const files = rels.map((rel) => ({ rel, path: join(TARGET, ...rel.split('/')) }));
    const existing = files.filter((f) => existsSync(f.path));
    // Default mode only installs into platforms that already have an instruction file;
    // with none anywhere, fall back to the codex group and create AGENTS.md
    const fallback = !wanted && !anyInstructionFile && name === 'codex';
    if (wanted ? !wanted.includes(name) : (!existing.length && !fallback)) continue;
    // --private: writing to a git-tracked file always leaves a trace (exclude has no effect on tracked files).
    // claude has a local equivalent, CLAUDE.local.md → detection still scans the originals, writes go to the local file;
    // other platforms have no equivalent → skip tracked files.
    const localFile = { rel: 'CLAUDE.local.md', path: join(TARGET, 'CLAUDE.local.md') };
    const writeFiles = (PRIVATE && name === 'claude') ? [localFile] : files;
    // Marker scanning recognizes both modes (the claude group always includes CLAUDE.local.md):
    // a --private install followed by a default init must not paste the snippet twice
    const scan = (name === 'claude' ? [...files, localFile] : files).filter((f) => existsSync(f.path));
    const withMarker = scan.find((f) => readFileSync(f.path, 'utf8').includes(BEGIN));
    const withLegacy = scan.find((f) => readFileSync(f.path, 'utf8').includes(LEGACY));
    if (withMarker) {
      if (privateExcludes && !isTracked(withMarker.rel)) privateExcludes.push(withMarker.rel);
      if (FORCE) {
        const updated = readFileSync(withMarker.path, 'utf8').replace(/<!-- flightwake:begin[\s\S]*?<!-- flightwake:end -->\n?/, block);
        writeFileSync(withMarker.path, updated);
        log(`  update ${withMarker.rel}${M(' snippet', ' 片段')}`);
      } else {
        log(`  skip ${withMarker.rel}${M(' snippet (installed — --force to update)', ' 片段(已安裝,--force 可更新)')}`);
      }
    } else if (withLegacy) {
      log(`  skip ${withLegacy.rel}${M(' snippet (v0.1 unmarked version detected — delete that section by hand and rerun to upgrade)', ' 片段(偵測到 v0.1 無標記版本 — 手動刪除該段後重跑即可升級)')}`);
    } else {
      const writeExisting = writeFiles.filter((f) => existsSync(f.path));
      const dst = writeExisting[0] ?? writeFiles[writeFiles.length - 1];
      if (PRIVATE && existsSync(dst.path) && isTracked(dst.rel)) {
        log(`  ⚠️  --private: ${dst.rel}${M(' is git-tracked, writing would leave a trace — skipped; put the obligation table somewhere untracked yourself', ' 受 git 追蹤,寫入會留下痕跡 — 跳過;觸發義務表請自行放到不進 git 的位置')}`);
        continue;
      }
      appendFileSync(dst.path, (existsSync(dst.path) ? '\n' : '') + block);
      privateExcludes?.push(dst.rel);
      log(`  add  ${dst.rel} ← ${M('obligation table', '觸發義務表')}`);
    }
  }
}

// 6. --private: entries written to .git/info/exclude (purely local, never in the repo; worktrees resolved via git)
if (privateExcludes) {
  const entries = [...new Set(privateExcludes)];
  const exBlock = `# flightwake:begin v${VERSION}\n${entries.join('\n')}\n# flightwake:end\n`;
  try {
    const ep = excludePath();
    mkdirSync(dirname(ep), { recursive: true });
    const cur = existsSync(ep) ? readFileSync(ep, 'utf8') : '';
    const next = cur.includes('# flightwake:begin')
      ? cur.replace(/# flightwake:begin[\s\S]*?# flightwake:end\n?/, exBlock)
      : cur + (cur && !cur.endsWith('\n') ? '\n' : '') + exBlock;
    writeFileSync(ep, next);
    log(`  add  .git/info/exclude ← ${entries.length}${M(' entries (local ignore)', ' 條(本地忽略)')}`);
  } catch {
    log(`  ⚠️  ${M('Failed to write .git/info/exclude — privacy NOT in effect! Add these entries manually:', '寫入 .git/info/exclude 失敗 — 隱私未生效!請手動加入以下條目:')}\n     ${entries.join('\n     ')}`);
  }
  if (isTracked('.flightwake')) {
    log(M(
      '  ⚠️  .flightwake is already git-tracked; exclude has no effect on tracked files — going private needs git rm -r --cached .flightwake (history is yours to handle)',
      '  ⚠️  .flightwake 已被 git 追蹤,exclude 對已追蹤檔案不生效 — 想轉私有需 git rm -r --cached .flightwake(歷史紀錄請自行處理)',
    ));
  }
}

if (IS_UPDATE) {
  log(M(`\n✅ updated to v${VERSION}.`, `\n✅ 已更新到 v${VERSION}。`));
} else {
  log(PRIVATE ? M(`
✅ done (--private). Records stay local; git does not track them. Costs and caveats:
   - Records aren't shared with the repo: teammates and other machines can't see STATE/records (you give up flightwake's sharing value)
   - .git/info/exclude is purely local: after a fresh clone, rerun init --private
   - To go shared again: delete the flightwake block from .git/info/exclude, then git add .flightwake .claude
   Next: edit .flightwake/STATE.md with the current situation (or have Claude initialize it with /fw-record)`, `
✅ done(--private)。紀錄只留本機,git 不追蹤。代價與注意:
   - 紀錄不隨 repo 共享:隊友與其他機器看不到 STATE/records(放棄 flightwake 的共享價值)
   - .git/info/exclude 純本地:重新 clone 後需重跑 init --private
   - 想改回共享:刪除 .git/info/exclude 的 flightwake 區塊,再 git add .flightwake .claude
   下一步:編輯 .flightwake/STATE.md 填入現況(或讓 Claude 用 /fw-record 初始化)`) : M(`
✅ done. Next:
   1. Edit .flightwake/STATE.md with the current situation (or have Claude initialize it with /fw-record)
   2. git add .flightwake .claude CLAUDE.md && git commit`, `
✅ done。下一步:
   1. 編輯 .flightwake/STATE.md 填入現況(或讓 Claude 用 /fw-record 初始化)
   2. git add .flightwake .claude CLAUDE.md && git commit`));
  if (!STATUSLINE) log(M(
    '   ℹ️  Bottom gauge not installed (opt-in) — if you want it: npx flightwake init --statusline (health / STATE lag / context usage)',
    '   ℹ️  底部儀表未裝(選配)— 要的話:npx flightwake init --statusline(health/STATE 落後/context 用量)',
  ));
}
