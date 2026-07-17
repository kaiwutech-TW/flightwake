#!/usr/bin/env node
/**
 * flightwake Stop hook — STATE 過期檢查。
 * STATE.md 落後 HEAD ≥3 commits 且無未 commit 修改時,block 一次並提醒收尾。
 * 任何錯誤(非 git repo、git 不在 PATH…)一律靜默放行,絕不擋 session。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const THRESHOLD = 3;
const STATE = '.flightwake/STATE.md';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch {}
if (input.stop_hook_active) process.exit(0); // 已在 hook 觸發的續跑中,避免循環

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  process.chdir(git('rev-parse', '--show-toplevel'));
  if (!existsSync(STATE)) process.exit(0);
  if (git('status', '--porcelain', '--', STATE)) process.exit(0); // 剛更新未 commit → 視為新鮮
  const last = git('log', '-1', '--format=%H', '--', STATE);
  if (!last) process.exit(0); // STATE 從未 commit(剛 init)→ 不吵
  const behind = Number(git('rev-list', '--count', `${last}..HEAD`));
  if (behind >= THRESHOLD) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: `flightwake:${STATE} 已落後 ${behind} 個 commit。請跑 /fw-record 收尾(寫飛行紀錄 + 更新 STATE 的現況與 health),或至少讓 STATE 反映真實現況再結束。`,
    }));
  }
} catch {}
process.exit(0);
