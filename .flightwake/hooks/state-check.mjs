#!/usr/bin/env node
/**
 * flightwake STATE checks — two checks, two modes:
 * 1. Staleness (rev-list): STATE lags ≥ threshold *human* commits behind HEAD (bot commits excluded)
 * 2. Evidence: STATE claims health=green but the latest record's `tests:` frontmatter line is empty/missing
 *    (only the *absence* of the line is flagged — no free-text judgement, so no prose-parsing false positives)
 * - Stop hook (default): either check emits Claude Code's block JSON once; always exit 0, never hard-block the session
 * - `--ci`: staleness prints a message and exits 1 (CI needs fetch-depth: 0); evidence is a warning only, never a gate
 *   `--threshold=N` tunes the staleness threshold (default 3)
 * Any error (not a git repo, git missing from PATH, …) passes silently in both modes —
 * this is a discipline reminder, not a security gate; under-reporting beats false blocking.
 * LANG is stamped by the installer (`npx flightwake init --lang=…`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const LANG = 'zh-TW';
// Message table lookup. Keyed rather than positional: with four languages, positional args silently
// swap when one is edited. Any missing key falls back to English rather than printing undefined.
const M = (m) => m[LANG] ?? m.en;

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

  // Check 2 — evidence: health=green is a claim; the latest record's `tests:` line is its evidence.
  // Runs even when STATE is uncommitted (right after a wrap-up is exactly when the gap appears).
  let evidence = '';
  const fm = (f) => readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const sfm = fm(STATE);
  if (/^health:\s*green\b/m.test(sfm)) {
    const rec = sfm.match(/^latest_record:\s*(\S+)/m)?.[1];
    const recPath = rec && `.flightwake/${rec}`;
    if (recPath && existsSync(recPath) && !/^tests:\s*\S/m.test(fm(recPath))) {
      evidence = M({
        en: `flightwake: STATE claims health=green but the latest record (${rec}) carries no test evidence (\`tests:\` frontmatter is empty). Backfill the evidence, or set health honestly.`,
        'zh-TW': `flightwake:STATE 標 health=green,但最新 record(${rec})沒有測試證據(frontmatter 的 tests 欄空白)。請補上證據,或誠實調整 health。`,
        'zh-CN': `flightwake:STATE 标 health=green,但最新 record(${rec})没有测试证据(frontmatter 的 tests 栏空白)。请补上证据,或诚实调整 health。`,
        ja: `flightwake:STATE は health=green と主張しているが、最新の record(${rec})にテスト証拠が無い(frontmatter の tests が空)。証拠を補うか、health を正直に直してください。`,
      });
    }
  }

  // Check 1 — staleness: only measurable once STATE has a committed baseline
  // Bot commits (dependabot[bot], renovate[bot], …) are excluded: a dependency bump never makes STATE
  // wrong, and the bot's own PR can't satisfy the gate — an unsatisfiable check trains everyone to
  // ignore red. Match on the `[bot]` account suffix, not a vendor name, so any bot counts.
  let behind = 0;
  if (!git('status', '--porcelain', '--', STATE)) { // uncommitted update → counts as fresh
    const last = git('log', '-1', '--format=%H', '--', STATE);
    if (last) { // never committed → stay quiet
      const range = `${last}..HEAD`;
      const bots = Number(git('rev-list', '--count', '--author=\\[bot\\]', range));
      behind = Math.max(0, Number(git('rev-list', '--count', range)) - bots);
    }
  }

  if (behind >= THRESHOLD) {
    if (CI) {
      console.error(M({
        en: `❌ flightwake: ${STATE} lags ${behind} commits behind (threshold ${THRESHOLD}). Wrap up with /fw-record (flight record + STATE update), or at least make STATE reflect reality before pushing.`,
        'zh-TW': `❌ flightwake:${STATE} 已落後 ${behind} 個 commit(門檻 ${THRESHOLD})。請補 /fw-record 收尾(寫飛行紀錄 + 更新 STATE),或至少讓 STATE 反映真實現況再推。`,
        'zh-CN': `❌ flightwake:${STATE} 已落后 ${behind} 个 commit(阈值 ${THRESHOLD})。请补 /fw-record 收尾(写飞行记录 + 更新 STATE),或至少让 STATE 反映真实现况再推。`,
        ja: `❌ flightwake:${STATE} が ${behind} コミット遅れています(しきい値 ${THRESHOLD})。/fw-record で締めて(飛行記録 + STATE 更新)ください。少なくとも STATE を現状に合わせてから push を。`,
      }));
      if (evidence) console.error(`⚠️  ${evidence}`);
      process.exit(1);
    }
    console.log(JSON.stringify({
      decision: 'block',
      reason: M({
        en: `flightwake: ${STATE} lags ${behind} commits behind. Run /fw-record to wrap up (flight record + update STATE's situation and health), or at least make STATE reflect reality before ending.`,
        'zh-TW': `flightwake:${STATE} 已落後 ${behind} 個 commit。請跑 /fw-record 收尾(寫飛行紀錄 + 更新 STATE 的現況與 health),或至少讓 STATE 反映真實現況再結束。`,
        'zh-CN': `flightwake:${STATE} 已落后 ${behind} 个 commit。请跑 /fw-record 收尾(写飞行记录 + 更新 STATE 的现况与 health),或至少让 STATE 反映真实现况再结束。`,
        ja: `flightwake:${STATE} が ${behind} コミット遅れています。/fw-record で締めて(飛行記録 + STATE の現状と health を更新)ください。少なくとも STATE を現状に合わせてから終了を。`,
      }) + (evidence ? `\n${evidence}` : ''),
    }));
  } else if (CI) {
    console.log(M({
      en: `✅ flightwake: STATE fresh (${behind} behind < threshold ${THRESHOLD})`,
      'zh-TW': `✅ flightwake:STATE 新鮮(落後 ${behind} < 門檻 ${THRESHOLD})`,
      'zh-CN': `✅ flightwake:STATE 新鲜(落后 ${behind} < 阈值 ${THRESHOLD})`,
      ja: `✅ flightwake:STATE は最新(遅れ ${behind} < しきい値 ${THRESHOLD})`,
    }));
    if (evidence) console.error(`⚠️  ${evidence}`); // warning only — free-frontmatter detection must never gate CI
  } else if (evidence) {
    console.log(JSON.stringify({ decision: 'block', reason: evidence }));
  }
} catch {}
process.exit(0);
