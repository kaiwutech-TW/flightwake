/**
 * `npx flightwake update --all [--dry-run]` — run the in-place `update` in every repo listed in the cross-repo registry
 * (~/.flightwake/registry.json; FLIGHTWAKE_HOME moves it). Runs from any folder, like `fleet`.
 *
 * Each repo is upgraded by a child `node bin/cli.mjs update` with that repo as its working directory, so every repo gets
 * the one install path with its own preflight, refusals and options (lang / private / profile / plugin / add-ons).
 * Nothing new is decided here: this file only picks which repos to run and reports what changed.
 *
 * Skipped: folders that no longer exist, folders without a flightwake marker, repos already on this version (or newer).
 * Uncommitted work does not stop a repo — most working repos have some — but a file that had uncommitted changes before
 * the update and was changed by it is named, so the person reviews it before committing. Never commits, never removes
 * registry entries.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { registryPath, readRegistry, readMarkers } from './install.mjs';

/** -1 / 0 / 1 for dotted numeric versions; anything unparsable sorts as oldest. */
export function cmpVersion(a, b) {
  const pa = String(a ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** path → content fingerprint of every file git reports as changed or untracked (null = git could not read the repo). */
function dirtySnapshot(repo) {
  let out;
  try {
    out = execFileSync('git', ['-C', repo, 'status', '--porcelain', '-z', '--untracked-files=all'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
  const snap = new Map();
  const parts = out.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    const rel = e.slice(3);
    if (e[0] === 'R' || e[0] === 'C') i++; // a rename carries its old path as the next field
    let fp = 'gone';
    try {
      const p = join(repo, rel);
      fp = statSync(p).isFile() ? createHash('sha1').update(readFileSync(p)).digest('hex') : 'dir';
    } catch {}
    snap.set(rel, `${e.slice(0, 2)}:${fp}`);
  }
  return snap;
}

const MSG = {
  header: (v, n, reg, dry) => ({
    en: `flightwake update --all v${v}${dry ? ' (--dry-run: nothing is written)' : ''} — ${n} repo(s) in ${reg}`,
    'zh-TW': `flightwake update --all v${v}${dry ? '(--dry-run:不寫入任何檔)' : ''}— ${reg} 裡有 ${n} 個 repo`,
    'zh-CN': `flightwake update --all v${v}${dry ? '(--dry-run:不写入任何文件)' : ''}— ${reg} 里有 ${n} 个 repo`,
    ja: `flightwake update --all v${v}${dry ? '(--dry-run:何も書き込まない)' : ''}— ${reg} に ${n} 個の repo`,
  }),
  noBase: {
    en: '⚠️  update --all: no absolute HOME or FLIGHTWAKE_HOME, so there is no registry to read. Run `npx flightwake update` in each repo instead.',
    'zh-TW': '⚠️  update --all:沒有絕對路徑的 HOME 或 FLIGHTWAKE_HOME,讀不到 registry。請到各 repo 分別跑 `npx flightwake update`。',
    'zh-CN': '⚠️  update --all:没有绝对路径的 HOME 或 FLIGHTWAKE_HOME,读不到 registry。请到各 repo 分别跑 `npx flightwake update`。',
    ja: '⚠️  update --all:絶対パスの HOME も FLIGHTWAKE_HOME もないため registry を読めません。各 repo で `npx flightwake update` を実行してください。',
  },
  badReg: (reg) => ({
    en: `⚠️  update --all: ${reg} could not be read as a registry — nothing was run. Fix or remove it; \`npx flightwake update\` in a repo registers that repo again.`,
    'zh-TW': `⚠️  update --all:${reg} 無法當成 registry 讀取——什麼都沒執行。請修正或移除它;在 repo 裡跑 \`npx flightwake update\` 會重新登記那個 repo。`,
    'zh-CN': `⚠️  update --all:${reg} 无法当成 registry 读取——什么都没执行。请修正或移除它;在 repo 里跑 \`npx flightwake update\` 会重新登记那个 repo。`,
    ja: `⚠️  update --all:${reg} を registry として読めません——何も実行していません。修正または削除してください。repo で \`npx flightwake update\` を実行するとその repo が再登録されます。`,
  }),
  empty: {
    en: 'No repos are registered yet — `npx flightwake init` / `update` registers the repo it runs in.',
    'zh-TW': '還沒有登記任何 repo——`npx flightwake init` / `update` 會登記它所在的 repo。',
    'zh-CN': '还没有登记任何 repo——`npx flightwake init` / `update` 会登记它所在的 repo。',
    ja: 'まだ repo が登録されていません——`npx flightwake init` / `update` が実行した repo を登録します。',
  },
  updated: (from, to, n) => ({
    en: `${from} → ${to}, ${n ? `${n} file(s) changed — review and commit` : 'no change visible to git (--private install?)'}`,
    'zh-TW': `${from} → ${to},${n ? `改了 ${n} 個檔——看過後再 commit` : 'git 看不到變更(--private 安裝?)'}`,
    'zh-CN': `${from} → ${to},${n ? `改了 ${n} 个文件——看过后再 commit` : 'git 看不到变更(--private 安装?)'}`,
    ja: `${from} → ${to}、${n ? `${n} ファイル変更——確認してから commit` : 'git から見える変更なし(--private インストール?)'}`,
  }),
  would: (from, to) => ({ en: `${from} → ${to}`, 'zh-TW': `${from} → ${to}`, 'zh-CN': `${from} → ${to}`, ja: `${from} → ${to}` }),
  overlap: (files) => ({
    en: `      had uncommitted changes before the update and were changed by it: ${files}`,
    'zh-TW': `      升級前就有未 commit 的變更、又被這次升級改到:${files}`,
    'zh-CN': `      升级前就有未 commit 的变更、又被这次升级改到:${files}`,
    ja: `      更新前から未 commit の変更があり、更新でも変わった:${files}`,
  }),
  failed: (code) => ({
    en: `update exited ${code} — its last lines:`,
    'zh-TW': `update 以 ${code} 結束——最後幾行:`,
    'zh-CN': `update 以 ${code} 结束——最后几行:`,
    ja: `update が ${code} で終了——最後の数行:`,
  }),
  current: { en: 'already on this version', 'zh-TW': '已是這一版', 'zh-CN': '已是这一版', ja: 'すでにこの版' },
  newer: (v) => ({
    en: `installed by a newer flightwake (${v}) — left as is`,
    'zh-TW': `由較新的 flightwake(${v})安裝——不動`,
    'zh-CN': `由较新的 flightwake(${v})安装——不动`,
    ja: `より新しい flightwake(${v})でインストール済——そのまま`,
  }),
  unmarked: {
    en: 'no flightwake marker in CLAUDE.md / AGENTS.md / GEMINI.md (uninstalled, or a v0.1 snippet) — skipped',
    'zh-TW': 'CLAUDE.md / AGENTS.md / GEMINI.md 裡沒有 flightwake 標記(已移除,或是 v0.1 的片段)——略過',
    'zh-CN': 'CLAUDE.md / AGENTS.md / GEMINI.md 里没有 flightwake 标记(已移除,或是 v0.1 的片段)——略过',
    ja: 'CLAUDE.md / AGENTS.md / GEMINI.md に flightwake のマーカーなし(削除済、または v0.1 のスニペット)——スキップ',
  },
  missing: (n) => ({
    en: `${n} registered folder(s) no longer exist (left in the registry; \`npx flightwake fleet\` and other repos are not affected):`,
    'zh-TW': `${n} 個登記過的資料夾已不存在(留在 registry 裡;不影響 \`npx flightwake fleet\` 與其他 repo):`,
    'zh-CN': `${n} 个登记过的文件夹已不存在(留在 registry 里;不影响 \`npx flightwake fleet\` 与其他 repo):`,
    ja: `登録済のフォルダ ${n} 個がもう存在しない(registry には残す。\`npx flightwake fleet\` や他の repo には影響なし):`,
  }),
  summary: (s, dry) => ({
    en: `${dry ? 'Would update' : 'Updated'} ${s.updated}, failed ${s.failed}, already current ${s.current}, skipped ${s.skipped}, missing ${s.missing}.`,
    'zh-TW': `${dry ? '將升級' : '已升級'} ${s.updated}、失敗 ${s.failed}、已是最新 ${s.current}、略過 ${s.skipped}、不存在 ${s.missing}。`,
    'zh-CN': `${dry ? '将升级' : '已升级'} ${s.updated}、失败 ${s.failed}、已是最新 ${s.current}、略过 ${s.skipped}、不存在 ${s.missing}。`,
    ja: `${dry ? '更新予定' : '更新済'} ${s.updated}、失敗 ${s.failed}、最新 ${s.current}、スキップ ${s.skipped}、存在しない ${s.missing}。`,
  }),
  dryNext: {
    en: 'Run it without --dry-run to upgrade them. Each repo keeps its own options; nothing is committed for you.',
    'zh-TW': '拿掉 --dry-run 再跑一次就會升級。每個 repo 沿用自己的選項;不會替你 commit。',
    'zh-CN': '去掉 --dry-run 再跑一次就会升级。每个 repo 沿用自己的选项;不会替你 commit。',
    ja: '--dry-run を外して再実行すると更新します。各 repo は自分のオプションを保ち、commit はしません。',
  },
  doneNext: {
    en: 'Each upgraded repo now has framework changes to commit (`git status` there). Open Codex sessions ask to trust a new hook once.',
    'zh-TW': '升級過的 repo 各自有框架檔的變更待 commit(到該 repo 看 `git status`)。Codex 會對新加的 hook 要你信任一次。',
    'zh-CN': '升级过的 repo 各自有框架文件的变更待 commit(到该 repo 看 `git status`)。Codex 会对新加的 hook 要你信任一次。',
    ja: '更新した各 repo にフレームワークの変更があり commit が必要です(その repo で `git status`)。新しい hook は Codex が一度信頼確認を求めます。',
  },
};

/** Returns the exit code: 1 when the registry cannot be read or any repo's update failed, else 0. */
export function runUpdateAll({ args, cli, version, M, log, env = process.env, home = env.HOME || env.USERPROFILE || '' }) {
  const dry = args.includes('--dry-run');
  const show = (p) => (home && (p === home || p.startsWith(home + '/')) ? '~' + p.slice(home.length) : p);
  const REG = registryPath();
  if (REG === null) { log(M(MSG.noBase)); return 1; }
  let reg;
  try { reg = readRegistry(REG); } catch { log(M(MSG.badReg(show(REG)))); return 1; }
  const repos = Object.keys(reg.repos);
  log(M(MSG.header(version, repos.length, show(REG), dry)));
  if (!repos.length) { log(M(MSG.empty)); return 0; }
  log('');

  const s = { updated: 0, failed: 0, current: 0, skipped: 0, missing: 0 };
  const missing = [];
  const quiet = [];
  for (const repo of repos) {
    if (!existsSync(repo)) { s.missing++; missing.push(repo); continue; }
    const marks = readMarkers(repo).filter((m) => !m.orphanOrca);
    if (!marks.length) { s.skipped++; quiet.push(`  –  ${show(repo)}  ${M(MSG.unmarked)}`); continue; }
    const from = marks.map((m) => m.version).sort(cmpVersion)[0];
    const c = cmpVersion(from, version);
    if (c === 0 && marks.every((m) => m.version === version)) { s.current++; quiet.push(`  =  ${show(repo)}  ${M(MSG.current)}`); continue; }
    if (c > 0) { s.skipped++; quiet.push(`  –  ${show(repo)}  ${M(MSG.newer(from))}`); continue; }
    if (dry) { s.updated++; log(`  ↑  ${show(repo)}  ${M(MSG.would(from, version))}`); continue; }

    const before = dirtySnapshot(repo);
    const r = spawnSync(process.execPath, [cli, 'update'], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status !== 0) {
      s.failed++;
      log(`  ✗  ${show(repo)}  ${M(MSG.failed(r.status ?? r.signal))}`);
      const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd().split('\n').slice(-6);
      for (const l of tail) log(`      ${l}`);
      continue;
    }
    s.updated++;
    const after = dirtySnapshot(repo);
    let changed = [];
    let overlap = [];
    if (before && after) {
      changed = [...after.keys()].filter((k) => after.get(k) !== before.get(k));
      for (const k of before.keys()) if (!after.has(k)) changed.push(k); // the update reverted a change back to HEAD
      overlap = changed.filter((k) => before.has(k));
    }
    log(`  ✓  ${show(repo)}  ${M(MSG.updated(from, version, changed.length))}`);
    if (overlap.length) log(M(MSG.overlap(overlap.join(', '))));
  }
  for (const l of quiet) log(l);
  if (missing.length) {
    log('');
    log(M(MSG.missing(missing.length)));
    for (const p of missing) log(`     ${show(p)}`);
  }
  log('');
  log(M(MSG.summary(s, dry)));
  if (dry && s.updated) log(M(MSG.dryNext));
  if (!dry && s.updated) log(M(MSG.doneNext));
  return s.failed ? 1 : 0;
}
