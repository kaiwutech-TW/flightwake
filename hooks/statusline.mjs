#!/usr/bin/env node
/**
 * flightwake statusline(選配)— Claude Code 底部常駐儀表:
 * health 顏色 · STATE 落後 commits · context 用量 bar(快滿 = 該收尾/交接的訊號)。
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

const parts = ['✈️ flightwake'];

// health(STATE frontmatter)+ 落後量(與 state-check.mjs 同一套 rev-list 判斷)
try {
  const state = join(dir, '.flightwake', 'STATE.md');
  if (existsSync(state)) {
    const health = /^health:\s*(\S+)/m.exec(readFileSync(state, 'utf8'))?.[1] ?? '?';
    const color = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' }[health] ?? '';
    let lag = '';
    try {
      if (git('status', '--porcelain', '--', '.flightwake/STATE.md')) {
        lag = ' · STATE 更新中';
      } else {
        const last = git('log', '-1', '--format=%H', '--', '.flightwake/STATE.md');
        if (last) {
          const n = Number(git('rev-list', '--count', `${last}..HEAD`));
          lag = n > 0 ? ` · STATE 落後 ${n}c` : ' · STATE 同步';
        }
      }
    } catch {}
    parts.push(`${color}●${health}\x1b[0m${lag}`);
  }
} catch {}

// context 用量:transcript 最後一筆 usage ≈ 目前 prompt 大小(視窗以 200k 計)
try {
  const t = j.transcript_path;
  if (t && existsSync(t)) {
    const lines = readFileSync(t, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      let u;
      try { u = JSON.parse(lines[i]).message?.usage; } catch { continue; }
      if (!u) continue;
      const used = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      const pct = Math.min(99, Math.round((used / 200000) * 100));
      const color = pct >= 80 ? '\x1b[31m' : pct >= 60 ? '\x1b[33m' : '\x1b[32m';
      const filled = Math.round(pct / 10);
      parts.push(`${color}${'▓'.repeat(filled)}${'░'.repeat(10 - filled)} ${pct}%\x1b[0m${pct >= 80 ? ' → 該收尾/交接' : ''}`);
      break;
    }
  }
} catch {}

console.log(parts.join(' │ '));
