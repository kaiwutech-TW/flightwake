#!/usr/bin/env node
/**
 * flightwake CLI — `npx flightwake init [--force]`(或 `npx github:kaiwutech-TW/flightwake init`)
 * 在目標 repo 根目錄執行:安裝 .flightwake/ 模板 + 4 個 skill + Stop hook,
 * 並把觸發義務表貼進偵測到的 agent 指令檔(CLAUDE.md/AGENTS.md/GEMINI.md;--agents 可指定)。
 * 純檔案複製,跨平台(Node ≥18)。使用者資料(STATE/DECISIONS/TRAPS)永不覆蓋;
 * 框架擁有的檔案(skills/hook/TEMPLATE/CLAUDE.md 片段)預設不覆蓋,--force 才更新。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const FW_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.cwd();
const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('-')) ?? 'init';
const FORCE = args.includes('--force');
const PRIVATE = args.includes('--private');
const VERSION = JSON.parse(readFileSync(join(FW_SRC, 'package.json'), 'utf8')).version;

const log = (s) => console.log(s);
const noJunk = (src) => !/(^|[\\/])\.(DS_Store|AppleDouble)$/.test(src);

if (cmd !== 'init' || args.includes('--help') || args.includes('-h')) {
  log('flightwake — 用法: npx flightwake init [--force] [--private] [--agents=claude,codex,gemini]\n  在目標 repo 根目錄執行;--force 更新既有 skill/hook/片段;--private 紀錄只留本機不進 git(.git/info/exclude + settings.local.json);--agents 指定要貼觸發義務表的平台指令檔(預設自動偵測)');
  process.exit(cmd === 'init' || cmd === 'help' ? 0 : 1);
}

// .git 用 existsSync:worktree/submodule 的 .git 是檔案不是目錄
if (!existsSync(join(TARGET, '.git'))) {
  log(`⚠️  目前目錄不是 git repo(${TARGET})— flightwake 依賴 git 作為記錄底層。先 git init。`);
  process.exit(1);
}

// git 只在 --private 需要(exclude 路徑解析 + 追蹤判定);預設路徑維持純檔案複製
const git = (...a) => execFileSync('git', a, { cwd: TARGET, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const isTracked = (rel) => { try { return git('ls-files', '--', rel) !== ''; } catch { return false; } };
// --private 模式收集要寫進 .git/info/exclude 的條目(相對 repo 根);null = 非 private
const privateExcludes = PRIVATE ? ['.flightwake/'] : null;

log(`flightwake init v${VERSION}${PRIVATE ? '(--private)' : ''} → ${TARGET}\n`);

// 1. .flightwake/ 模板 — STATE/DECISIONS/TRAPS 是使用者資料,永不覆蓋(含 --force)
mkdirSync(join(TARGET, '.flightwake', 'records'), { recursive: true });
mkdirSync(join(TARGET, '.flightwake', 'hooks'), { recursive: true });
for (const f of ['STATE.md', 'DECISIONS.md', 'TRAPS.md']) {
  const dst = join(TARGET, '.flightwake', f);
  if (existsSync(dst)) log(`  skip .flightwake/${f}(已存在,使用者資料不覆蓋)`);
  else { copyFileSync(join(FW_SRC, 'templates', f), dst); log(`  add  .flightwake/${f}`); }
}

// 2. 框架擁有的檔案:record 模板 + Stop hook(--force 可更新)
for (const [src, rel] of [
  [join(FW_SRC, 'templates', 'TEMPLATE-record.md'), join('.flightwake', 'TEMPLATE-record.md')],
  [join(FW_SRC, 'hooks', 'state-check.mjs'), join('.flightwake', 'hooks', 'state-check.mjs')],
]) {
  const dst = join(TARGET, rel);
  const existed = existsSync(dst);
  if (existed && !FORCE) { log(`  skip ${rel}(已存在,--force 可更新)`); continue; }
  copyFileSync(src, dst);
  log(`  ${existed ? 'update' : 'add '} ${rel}`);
}

// 3. 四個 skill → .claude/skills/(只取目錄,過濾 .DS_Store 類垃圾;--force 可更新)
mkdirSync(join(TARGET, '.claude', 'skills'), { recursive: true });
for (const s of readdirSync(join(FW_SRC, 'skills'))) {
  if (!statSync(join(FW_SRC, 'skills', s)).isDirectory()) continue;
  privateExcludes?.push(`.claude/skills/${s}/`);
  const dst = join(TARGET, '.claude', 'skills', s);
  const existed = existsSync(dst);
  if (existed && !FORCE) { log(`  skip .claude/skills/${s}(已存在,--force 可更新)`); continue; }
  cpSync(join(FW_SRC, 'skills', s), dst, { recursive: true, force: true, filter: noJunk });
  log(`  ${existed ? 'update' : 'add '} .claude/skills/${s}`);
}

// 4. Stop hook 併入 .claude/settings.json(--private → settings.local.json,不進 repo)
{
  const settingsRel = PRIVATE ? '.claude/settings.local.json' : '.claude/settings.json';
  const settingsPath = join(TARGET, ...settingsRel.split('/'));
  privateExcludes?.push(settingsRel);
  const HOOK_CMD = 'node "$CLAUDE_PROJECT_DIR/.flightwake/hooks/state-check.mjs"';
  let settings = {};
  let parseOk = true;
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); }
    catch { parseOk = false; log(`  ⚠️  ${settingsRel} 不是有效 JSON,略過 hook 安裝 — 請手動在 hooks.Stop 加:${HOOK_CMD}`); }
  }
  if (parseOk) {
    settings.hooks ??= {};
    settings.hooks.Stop ??= [];
    if (JSON.stringify(settings.hooks.Stop).includes('state-check.mjs')) {
      log(`  skip ${settingsRel} Stop hook(已設定)`);
    } else {
      settings.hooks.Stop.push({ hooks: [{ type: 'command', command: HOOK_CMD }] });
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      log(`  add  ${settingsRel} ← Stop hook(STATE 過期檢查)`);
    }
  }
}

// 5. 觸發義務片段 → 各 agent 指令檔。預設偵測既有檔(CLAUDE.md/AGENTS.md/GEMINI.md,有哪個貼哪個);
//    --agents=claude,codex,gemini 指定平台(檔案不存在則建檔);全無指令檔且未指定 → 建 AGENTS.md(相容面最廣)。
{
  const BEGIN = '<!-- flightwake:begin';
  const END = '<!-- flightwake:end -->';
  const LEGACY = 'flightwake 工作紀律';
  const body = readFileSync(join(FW_SRC, 'snippets', 'CLAUDE-md-snippet.md'), 'utf8').replace(/^<!--[\s\S]*?-->\n?/, '');
  const block = `${BEGIN} v${VERSION} -->\n${body.trimEnd()}\n${END}\n`;
  // 平台群組:同群組的候選檔視為同一份(裝進第一個存在的;任一已有標記即不重複)。
  // 群組最後一個候選是 --agents 指定但檔案不存在時的建檔目標。
  const GROUPS = {
    claude: ['.claude/CLAUDE.md', 'CLAUDE.md'],
    codex: ['AGENTS.md'],
    gemini: ['GEMINI.md'],
  };
  const agentsArg = args.find((a) => a.startsWith('--agents='));
  const wanted = agentsArg ? agentsArg.slice('--agents='.length).split(',').map((s) => s.trim()).filter(Boolean) : null;
  if (wanted) {
    const bad = wanted.filter((w) => !GROUPS[w]);
    if (bad.length) { log(`⚠️  --agents 不認得:${bad.join(', ')}(可用:${Object.keys(GROUPS).join(', ')})`); process.exit(1); }
  }
  const anyInstructionFile = Object.values(GROUPS).flat().some((rel) => existsSync(join(TARGET, ...rel.split('/'))));
  for (const [name, rels] of Object.entries(GROUPS)) {
    const files = rels.map((rel) => ({ rel, path: join(TARGET, ...rel.split('/')) }));
    const existing = files.filter((f) => existsSync(f.path));
    // 預設模式只裝進「已有指令檔」的平台;全無指令檔時 fallback 到 codex 群組建 AGENTS.md
    const fallback = !wanted && !anyInstructionFile && name === 'codex';
    if (wanted ? !wanted.includes(name) : (!existing.length && !fallback)) continue;
    // --private:受 git 追蹤的檔案寫了必留痕跡(exclude 對已追蹤檔無效)。
    // claude 有本地等價檔 CLAUDE.local.md → 偵測仍看原候選、寫入改到本地檔;其他平台無等價物 → 遇追蹤檔跳過。
    const writeFiles = (PRIVATE && name === 'claude')
      ? [{ rel: 'CLAUDE.local.md', path: join(TARGET, 'CLAUDE.local.md') }]
      : files;
    const scan = [...existing, ...writeFiles.filter((f) => existsSync(f.path) && !existing.includes(f))];
    const withMarker = scan.find((f) => readFileSync(f.path, 'utf8').includes(BEGIN));
    const withLegacy = scan.find((f) => readFileSync(f.path, 'utf8').includes(LEGACY));
    if (withMarker) {
      if (privateExcludes && !isTracked(withMarker.rel)) privateExcludes.push(withMarker.rel);
      if (FORCE) {
        const updated = readFileSync(withMarker.path, 'utf8').replace(/<!-- flightwake:begin[\s\S]*?<!-- flightwake:end -->\n?/, block);
        writeFileSync(withMarker.path, updated);
        log(`  update ${withMarker.rel} 片段`);
      } else {
        log(`  skip ${withMarker.rel} 片段(已安裝,--force 可更新)`);
      }
    } else if (withLegacy) {
      log(`  skip ${withLegacy.rel} 片段(偵測到 v0.1 無標記版本 — 手動刪除該段後重跑即可升級)`);
    } else {
      const writeExisting = writeFiles.filter((f) => existsSync(f.path));
      const dst = writeExisting[0] ?? writeFiles[writeFiles.length - 1];
      if (PRIVATE && existsSync(dst.path) && isTracked(dst.rel)) {
        log(`  ⚠️  --private:${dst.rel} 受 git 追蹤,寫入會留下痕跡 — 跳過;觸發義務表請自行放到不進 git 的位置`);
        continue;
      }
      appendFileSync(dst.path, (existsSync(dst.path) ? '\n' : '') + block);
      privateExcludes?.push(dst.rel);
      log(`  add  ${dst.rel} ← 觸發義務表`);
    }
  }
}

// 6. --private:條目寫進 .git/info/exclude(純本地,不進 repo;worktree 靠 git 解析真實路徑)
if (privateExcludes) {
  const entries = [...new Set(privateExcludes)];
  const exBlock = `# flightwake:begin v${VERSION}\n${entries.join('\n')}\n# flightwake:end\n`;
  try {
    let p;
    try { p = git('rev-parse', '--git-path', 'info/exclude'); } catch { p = join('.git', 'info', 'exclude'); }
    const excludePath = isAbsolute(p) ? p : join(TARGET, p);
    mkdirSync(dirname(excludePath), { recursive: true });
    const cur = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
    const next = cur.includes('# flightwake:begin')
      ? cur.replace(/# flightwake:begin[\s\S]*?# flightwake:end\n?/, exBlock)
      : cur + (cur && !cur.endsWith('\n') ? '\n' : '') + exBlock;
    writeFileSync(excludePath, next);
    log(`  add  .git/info/exclude ← ${entries.length} 條(本地忽略)`);
  } catch {
    log(`  ⚠️  寫入 .git/info/exclude 失敗 — 隱私未生效!請手動加入以下條目:\n     ${entries.join('\n     ')}`);
  }
  if (isTracked('.flightwake')) {
    log('  ⚠️  .flightwake 已被 git 追蹤,exclude 對已追蹤檔案不生效 — 想轉私有需 git rm -r --cached .flightwake(歷史紀錄請自行處理)');
  }
}

log(PRIVATE ? `
✅ done(--private)。紀錄只留本機,git 不追蹤。代價與注意:
   - 紀錄不隨 repo 共享:隊友與其他機器看不到 STATE/records(放棄 flightwake 的共享價值)
   - .git/info/exclude 純本地:重新 clone 後需重跑 init --private
   - 想改回共享:刪除 .git/info/exclude 的 flightwake 區塊,再 git add .flightwake .claude
   下一步:編輯 .flightwake/STATE.md 填入現況(或讓 Claude 用 /fw-record 初始化)` : `
✅ done。下一步:
   1. 編輯 .flightwake/STATE.md 填入現況(或讓 Claude 用 /fw-record 初始化)
   2. git add .flightwake .claude CLAUDE.md && git commit`);
