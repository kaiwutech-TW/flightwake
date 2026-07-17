#!/usr/bin/env node
/**
 * flightwake CLI — `npx flightwake [init]`（或 `npx github:kaiwutech-TW/flightwake init`）
 * 在目標 repo 根目錄執行:安裝 .flightwake/ 模板 + 4 個 skill + CLAUDE.md 觸發義務表。
 * 純檔案複製、不覆蓋既有、可與 GSD .planning/ 並存。跨平台(Node ≥18,無 bash 依賴)。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, appendFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FW_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.cwd();
const cmd = process.argv[2] ?? 'init';

const log = (s) => console.log(s);

if (cmd !== 'init') {
  log(`flightwake — 用法: npx flightwake [init]（在目標 repo 根目錄執行）`);
  process.exit(cmd === 'help' || cmd === '--help' ? 0 : 1);
}

if (!existsSync(join(TARGET, '.git'))) {
  log(`⚠️  目前目錄不是 git repo(${TARGET})— flightwake 依賴 git 作為記錄底層。先 git init。`);
  process.exit(1);
}

log(`flightwake init → ${TARGET}\n`);

// 1. .flightwake/ 模板(不覆蓋既有)
mkdirSync(join(TARGET, '.flightwake', 'records'), { recursive: true });
for (const f of ['STATE.md', 'DECISIONS.md', 'TRAPS.md']) {
  const dst = join(TARGET, '.flightwake', f);
  if (existsSync(dst)) log(`  skip .flightwake/${f}(已存在)`);
  else { copyFileSync(join(FW_SRC, 'templates', f), dst); log(`  add  .flightwake/${f}`); }
}
{
  const dst = join(TARGET, '.flightwake', 'records', 'TEMPLATE-record.md');
  if (existsSync(dst)) log('  skip records/TEMPLATE-record.md(已存在)');
  else { copyFileSync(join(FW_SRC, 'templates', 'records', 'TEMPLATE-record.md'), dst); log('  add  .flightwake/records/TEMPLATE-record.md'); }
}

// 2. 四個 skill → .claude/skills/
mkdirSync(join(TARGET, '.claude', 'skills'), { recursive: true });
for (const s of readdirSync(join(FW_SRC, 'skills'))) {
  const dst = join(TARGET, '.claude', 'skills', s);
  if (existsSync(dst)) log(`  skip .claude/skills/${s}(已存在)`);
  else { cpSync(join(FW_SRC, 'skills', s), dst, { recursive: true }); log(`  add  .claude/skills/${s}`); }
}

// 3. CLAUDE.md 片段(找到就附加;已含標記則跳過)
const snippet = readFileSync(join(FW_SRC, 'snippets', 'CLAUDE-md-snippet.md'), 'utf8');
const candidates = [join(TARGET, '.claude', 'CLAUDE.md'), join(TARGET, 'CLAUDE.md')];
const cmdFile = candidates.find((p) => existsSync(p));
if (!cmdFile) {
  log('  ⚠️  找不到 CLAUDE.md — 請手動把 snippets/CLAUDE-md-snippet.md 貼進你的 CLAUDE.md');
} else if (readFileSync(cmdFile, 'utf8').includes('flightwake 工作紀律')) {
  log('  skip CLAUDE.md 片段(已安裝)');
} else {
  appendFileSync(cmdFile, '\n' + snippet);
  log(`  append CLAUDE.md ← 觸發義務表(${cmdFile})`);
}

log(`
✅ done。下一步:
   1. 編輯 .flightwake/STATE.md 填入現況(或讓 Claude 用 /fw-record 初始化)
   2. git add .flightwake .claude/skills CLAUDE.md && git commit`);
