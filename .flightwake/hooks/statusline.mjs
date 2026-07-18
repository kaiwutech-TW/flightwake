#!/usr/bin/env node
/**
 * flightwake statusline(選配)— Claude Code 底部常駐儀表:
 * health 顏色 · STATE 落後 · context 用量,並依狀態直接提示下一個指令
 * (剛開場 → /fw-coldstart;落後 ≥3 → /fw-record;context 快滿 → record→clear→coldstart)。
 * stdin 收 Claude Code 的 session JSON;任何錯誤都靜默降級,絕不讓儀表變噪音。
 * 安裝:`npx flightwake init --statusline`(偵測到其他 statusline 時不覆蓋)。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let j = {};
try { j = JSON.parse(readFileSync(0, 'utf8')); } catch {}
const dir = j.workspace?.project_dir ?? process.cwd();
const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

let health = null; // null = 沒有 .flightwake
let behindN = null;
let stateDirty = false;
let pct = null;
let msgs = 0;

// health(STATE frontmatter)+ 落後量(與 state-check.mjs 同一套 rev-list 判斷)
try {
  const state = join(dir, '.flightwake', 'STATE.md');
  if (existsSync(state)) {
    health = /^health:\s*(\S+)/m.exec(readFileSync(state, 'utf8'))?.[1] ?? '?';
    try {
      if (git('status', '--porcelain', '--', '.flightwake/STATE.md')) {
        stateDirty = true;
      } else {
        const last = git('log', '-1', '--format=%H', '--', '.flightwake/STATE.md');
        if (last) behindN = Number(git('rev-list', '--count', `${last}..HEAD`));
      }
    } catch {}
  }
} catch {}

// context 用量:優先用 Claude Code stdin 的 context_window(帶真實視窗大小,1M 模型不會高估);
// 舊版無此欄位時退回解析 transcript 最後一筆 usage(視窗保守以 200k 計)。訊息量照數(判斷剛開場)。
try {
  const cw = j.context_window;
  if (typeof cw?.used_percentage === 'number') {
    pct = Math.min(99, Math.round(cw.used_percentage));
  } else if (cw?.current_usage && cw?.context_window_size > 0) {
    const u = cw.current_usage;
    const used = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    pct = Math.min(99, Math.round((used / cw.context_window_size) * 100));
  }
} catch {}
try {
  const t = j.transcript_path;
  if (t && existsSync(t)) {
    const lines = readFileSync(t, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      let u;
      try { u = JSON.parse(lines[i]).message?.usage; } catch { continue; }
      if (!u) continue;
      msgs++;
      if (pct === null) {
        const used = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        pct = Math.min(99, Math.round((used / 200000) * 100));
      }
    }
  }
} catch {}

const parts = ['✈️ flightwake'];
if (health !== null) {
  const color = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' }[health] ?? '';
  const lag = stateDirty ? ' · STATE 更新中' : behindN === null ? '' : behindN > 0 ? ` · STATE 落後 ${behindN}c` : ' · STATE 同步';
  parts.push(`${color}●${health}\x1b[0m${lag}`);
}
if (pct !== null) {
  const color = pct >= 80 ? '\x1b[31m' : pct >= 60 ? '\x1b[33m' : '\x1b[32m';
  const filled = Math.round(pct / 10);
  parts.push(`${color}${'▓'.repeat(filled)}${'░'.repeat(10 - filled)} ${pct}%\x1b[0m`);
}

// 下一步指令提示:單一則、依優先序;一切正常時安靜
let hint = '';
if (health === 'yellow' || health === 'red') hint = '先處理未驗證項再疊新工作(讀 STATE)';
else if (pct !== null && pct >= 80) hint = '/fw-record 收尾 → /clear → /fw-coldstart 接手';
else if (behindN !== null && behindN >= 3) hint = '/fw-record 收尾';
else if (health !== null && msgs <= 2) hint = '開工先 /fw-coldstart';
if (hint) parts.push(`\x1b[36m→ ${hint}\x1b[0m`);

console.log(parts.join(' │ '));
