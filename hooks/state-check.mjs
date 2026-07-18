#!/usr/bin/env node
/**
 * flightwake STATE 過期檢查 — 同一份 rev-list 邏輯,兩種模式:
 * - Stop hook(預設):落後 ≥門檻 時輸出 Claude Code 的 block JSON,永遠 exit 0,絕不擋 session
 * - `--ci`:落後時印人類可讀訊息並 exit 1(把收尾紀律帶到 Claude Code 之外;CI 需 fetch-depth: 0)
 *   `--threshold=N` 可調門檻(預設 3)
 * 任何錯誤(非 git repo、git 不在 PATH…)兩種模式都靜默放行——這是紀律提醒,不是安全閘門,寧可漏報不可誤擋。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const CI = argv.includes('--ci');
const t = Number(argv.find((a) => a.startsWith('--threshold='))?.slice('--threshold='.length));
const THRESHOLD = Number.isFinite(t) && t > 0 ? t : 3; // 非法值退回預設,不得靜默變成永不觸發
const STATE = '.flightwake/STATE.md';

let input = {};
// stdin 只在 hook 模式且非 TTY(Claude Code pipe JSON 進來)才讀 — 手動執行時
// readFileSync(0) 會因 stdin 不關閉而永久阻塞(2026-07-17 dashboard 手測 2 分鐘 timeout 坐實)
if (!CI && !process.stdin.isTTY) {
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch {}
}
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
    if (CI) {
      console.error(`❌ flightwake:${STATE} 已落後 ${behind} 個 commit(門檻 ${THRESHOLD})。請補 /fw-record 收尾(寫飛行紀錄 + 更新 STATE),或至少讓 STATE 反映真實現況再推。`);
      process.exit(1);
    }
    console.log(JSON.stringify({
      decision: 'block',
      reason: `flightwake:${STATE} 已落後 ${behind} 個 commit。請跑 /fw-record 收尾(寫飛行紀錄 + 更新 STATE 的現況與 health),或至少讓 STATE 反映真實現況再結束。`,
    }));
  } else if (CI) {
    console.log(`✅ flightwake:STATE 新鮮(落後 ${behind} < 門檻 ${THRESHOLD})`);
  }
} catch {}
process.exit(0);
