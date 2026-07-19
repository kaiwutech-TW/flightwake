#!/usr/bin/env node
/**
 * flightwake STATE staleness check — one rev-list rule, two modes:
 * - Stop hook (default): when STATE lags ≥ threshold, emit Claude Code's block JSON; always exit 0, never hard-block the session
 * - `--ci`: print a human-readable message and exit 1 when lagging (brings the wrap-up discipline outside Claude Code; CI needs fetch-depth: 0)
 *   `--threshold=N` tunes the threshold (default 3)
 * Any error (not a git repo, git missing from PATH, …) passes silently in both modes —
 * this is a discipline reminder, not a security gate; under-reporting beats false blocking.
 * LANG is stamped by the installer (`npx flightwake init --lang=…`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const LANG = 'zh-TW';
const M = (en, zh) => (LANG === 'zh-TW' ? zh : en);

const argv = process.argv.slice(2);
const CI = argv.includes('--ci');
const t = Number(argv.find((a) => a.startsWith('--threshold='))?.slice('--threshold='.length));
const THRESHOLD = Number.isFinite(t) && t > 0 ? t : 3; // invalid values fall back to the default — never silently become "never fires"
const STATE = '.flightwake/STATE.md';

let input = {};
// Read stdin only in hook mode and when it isn't a TTY (Claude Code pipes JSON in) — run by hand,
// readFileSync(0) blocks forever because a TTY stdin never closes (field-verified 2026-07-17: 2-minute timeout)
if (!CI && !process.stdin.isTTY) {
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch {}
}
if (input.stop_hook_active) process.exit(0); // already inside a hook-triggered continuation — avoid loops

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  process.chdir(git('rev-parse', '--show-toplevel'));
  if (!existsSync(STATE)) process.exit(0);
  if (git('status', '--porcelain', '--', STATE)) process.exit(0); // freshly updated, not yet committed → counts as fresh
  const last = git('log', '-1', '--format=%H', '--', STATE);
  if (!last) process.exit(0); // STATE never committed (just initialized) → stay quiet
  const behind = Number(git('rev-list', '--count', `${last}..HEAD`));
  if (behind >= THRESHOLD) {
    if (CI) {
      console.error(M(
        `❌ flightwake: ${STATE} lags ${behind} commits behind (threshold ${THRESHOLD}). Wrap up with /fw-record (flight record + STATE update), or at least make STATE reflect reality before pushing.`,
        `❌ flightwake:${STATE} 已落後 ${behind} 個 commit(門檻 ${THRESHOLD})。請補 /fw-record 收尾(寫飛行紀錄 + 更新 STATE),或至少讓 STATE 反映真實現況再推。`,
      ));
      process.exit(1);
    }
    console.log(JSON.stringify({
      decision: 'block',
      reason: M(
        `flightwake: ${STATE} lags ${behind} commits behind. Run /fw-record to wrap up (flight record + update STATE's situation and health), or at least make STATE reflect reality before ending.`,
        `flightwake:${STATE} 已落後 ${behind} 個 commit。請跑 /fw-record 收尾(寫飛行紀錄 + 更新 STATE 的現況與 health),或至少讓 STATE 反映真實現況再結束。`,
      ),
    }));
  } else if (CI) {
    console.log(M(
      `✅ flightwake: STATE fresh (${behind} behind < threshold ${THRESHOLD})`,
      `✅ flightwake:STATE 新鮮(落後 ${behind} < 門檻 ${THRESHOLD})`,
    ));
  }
} catch {}
process.exit(0);
