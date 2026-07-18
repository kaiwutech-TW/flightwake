#!/usr/bin/env node
/**
 * flightwake CLI — `npx flightwake init [--force]`(或 `npx github:kaiwutech-TW/flightwake init`)
 * 在目標 repo 根目錄執行:安裝 .flightwake/ 模板 + 4 個 skill + Stop hook,
 * 並把觸發義務表貼進偵測到的 agent 指令檔(CLAUDE.md/AGENTS.md/GEMINI.md;--agents 可指定)。
 * 純檔案複製,跨平台(Node ≥18)。使用者資料(STATE/DECISIONS/TRAPS)永不覆蓋;
 * 框架擁有的檔案(skills/hook/TEMPLATE/CLAUDE.md 片段)預設不覆蓋,--force 才更新。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FW_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.cwd();
const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('-')) ?? 'init';
const FORCE = args.includes('--force');
const VERSION = JSON.parse(readFileSync(join(FW_SRC, 'package.json'), 'utf8')).version;

const log = (s) => console.log(s);
const noJunk = (src) => !/(^|[\\/])\.(DS_Store|AppleDouble)$/.test(src);

if (cmd !== 'init' || args.includes('--help') || args.includes('-h')) {
  log('flightwake — 用法: npx flightwake init [--force] [--agents=claude,codex,gemini]\n  在目標 repo 根目錄執行;--force 更新既有 skill/hook/片段;--agents 指定要貼觸發義務表的平台指令檔(預設自動偵測)');
  process.exit(cmd === 'init' || cmd === 'help' ? 0 : 1);
}

// .git 用 existsSync:worktree/submodule 的 .git 是檔案不是目錄
if (!existsSync(join(TARGET, '.git'))) {
  log(`⚠️  目前目錄不是 git repo(${TARGET})— flightwake 依賴 git 作為記錄底層。先 git init。`);
  process.exit(1);
}

log(`flightwake init v${VERSION} → ${TARGET}\n`);

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
  const dst = join(TARGET, '.claude', 'skills', s);
  const existed = existsSync(dst);
  if (existed && !FORCE) { log(`  skip .claude/skills/${s}(已存在,--force 可更新)`); continue; }
  cpSync(join(FW_SRC, 'skills', s), dst, { recursive: true, force: true, filter: noJunk });
  log(`  ${existed ? 'update' : 'add '} .claude/skills/${s}`);
}

// 4. Stop hook 併入 .claude/settings.json
{
  const settingsPath = join(TARGET, '.claude', 'settings.json');
  const HOOK_CMD = 'node "$CLAUDE_PROJECT_DIR/.flightwake/hooks/state-check.mjs"';
  let settings = {};
  let parseOk = true;
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); }
    catch { parseOk = false; log(`  ⚠️  .claude/settings.json 不是有效 JSON,略過 hook 安裝 — 請手動在 hooks.Stop 加:${HOOK_CMD}`); }
  }
  if (parseOk) {
    settings.hooks ??= {};
    settings.hooks.Stop ??= [];
    if (JSON.stringify(settings.hooks.Stop).includes('state-check.mjs')) {
      log('  skip .claude/settings.json Stop hook(已設定)');
    } else {
      settings.hooks.Stop.push({ hooks: [{ type: 'command', command: HOOK_CMD }] });
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      log('  add  .claude/settings.json ← Stop hook(STATE 過期檢查)');
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
    const withMarker = existing.find((f) => readFileSync(f.path, 'utf8').includes(BEGIN));
    const withLegacy = existing.find((f) => readFileSync(f.path, 'utf8').includes(LEGACY));
    if (withMarker) {
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
      const dst = existing[0] ?? files[files.length - 1];
      appendFileSync(dst.path, (existsSync(dst.path) ? '\n' : '') + block);
      log(`  add  ${dst.rel} ← 觸發義務表`);
    }
  }
}

log(`
✅ done。下一步:
   1. 編輯 .flightwake/STATE.md 填入現況(或讓 Claude 用 /fw-record 初始化)
   2. git add .flightwake .claude CLAUDE.md && git commit`);
