/**
 * `npx flightwake fleet` — read-only list of the Claude Code sessions that report to `<base>/sessions/<id>.json`
 * (written by flightwake-mod's F7 `fleet` feature; base = absolute FLIGHTWAKE_HOME, else $HOME/.flightwake).
 * Blocked first, then working, idle, stale, ended. `--json` for tools (Orca), `--prune` is the only delete path in
 * the whole design: it removes ended/stale (and old unreadable) files, never a file written in the last 120 s.
 * Zero dependencies: Node built-ins only. Never creates the folder, never writes anything except `--prune`'s deletes.
 *
 * The base-dir rules (§2) and the display constants (§8) MIRROR mods/flightwake/hooks/lib/fleet.ts and
 * hooks/statusline.mjs — change all three together (test/smoke.sh greps the constants in each).
 */
import { readdirSync, lstatSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

// ── §8 constants (mirrors hooks/lib/fleet.ts and hooks/statusline.mjs) ──
export const HEARTBEAT_MS = 30000;
export const STALE_FACTOR = 4;
export const STALE_FLOOR_MS = 90000;
export const CLOCK_SKEW_MS = 60000;
export const BLOCKED_ALERT_MS = 2000;
const DAY_MS = 86400000;
const LIST_WINDOW_MS = 7 * DAY_MS;
const LIST_WINDOW_ALL_MS = 30 * DAY_MS;
const LIST_CAP = 200;
const LIST_CAP_ALL = 500;
const ENDED_CAP = 10;
const LIVE_WRITER_MS = 120000; // prune never touches a file modified this recently
const TIP_OVER = 500;

// ── §2 base dir and path rules (mirrors hooks/lib/fleet.ts and hooks/statusline.mjs) ──
export const isAbs = (p) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
const stripSlash = (p) => (p.length > 1 ? p.replace(/[\\/]+$/, '') : p) || p;
/**
 * `||`, not `??`: an empty FLIGHTWAKE_HOME / HOME counts as unset, exactly like the mod. A relative FLIGHTWAKE_HOME is
 * ignored; a relative home gives null (it would resolve against the working directory, which is the repo).
 */
export function fleetBase(env) {
  const fh = env.FLIGHTWAKE_HOME || '';
  if (fh && isAbs(fh)) return stripSlash(fh);
  const h = env.HOME || env.USERPROFILE || '';
  if (h && isAbs(h)) return stripSlash(h) + '/.flightwake';
  return null;
}
/** p is root itself or lies under it (by path; `..cache` is a child, `../x` is not). */
export const isWithin = (root, p) => {
  const rel = relative(root, p);
  return rel === '' || !(rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel));
};
/** The real path of p, or of its deepest existing folder with the rest of p appended (p need not exist). */
export function realish(p) {
  let d = p;
  const rest = [];
  for (;;) {
    try { return join(realpathSync(d), ...rest.reverse()); } catch {}
    const up = dirname(d);
    if (up === d) return p;
    rest.push(basename(d));
    d = up;
  }
}
/**
 * Whether `<base>/sessions` would sit inside a repo: inside `target` (by spelling or by real path), or the base is a
 * flightwake records folder (`<base>/STATE.md`) or lies in any git repo or flightwake root (`.git` or
 * `.flightwake/STATE.md` on the base or a folder above it).
 * The same rule as the mod's guard (hooks/lib/fleet.ts repoMarkersOf); init --mod never creates the folder there.
 */
export function fleetDirInRepo(target, base) {
  if (!base) return false;
  const sdir = `${base}/sessions`;
  if (isWithin(target, sdir) || isWithin(realish(target), realish(sdir))) return true;
  for (const b of new Set([base, realish(base)])) {
    if (existsSync(join(b, 'STATE.md'))) return true;
    for (let d = b; ; d = dirname(d)) {
      // a git repo, or a flightwake root with no git (reached through a link or a case alias too: existsSync follows)
      if (existsSync(join(d, '.git')) || existsSync(join(d, '.flightwake', 'STATE.md'))) return true;
      if (dirname(d) === d) break;
    }
  }
  return false;
}
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/;
/**
 * The record's transcript path, only when it is that session's own Claude transcript under this home
 * (`<home>/.claude/projects/<key>/<sessionId>.jsonl`); a record is another process's file, so any other path it names
 * is never looked at. Mirrors hooks/lib/fleet.ts transcriptOf.
 */
export function transcriptOf(rec, home) {
  const t = rec?.transcript;
  const id = rec?.sessionId;
  if (!home || typeof t !== 'string' || typeof id !== 'string' || !ID_RE.test(id)) return null;
  const pre = `${String(home).replace(/[\\/]+$/, '')}/.claude/projects/`;
  if (!t.startsWith(pre)) return null;
  const m = /^[A-Za-z0-9-]+\/([^/\\]+)\.jsonl$/.exec(t.slice(pre.length));
  return m && m[1] === id ? t : null;
}

const STATES = ['working', 'blocked', 'idle', 'ended'];
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const schemaMajor = (rec) => {
  const m = /^flightwake\.session\/(\d+)(?:\.\d+)*$/.exec(typeof rec?.schema === 'string' ? rec.schema : '');
  return m ? Number(m[1]) : null;
};
export const staleAfter = (rec) => Math.max(STALE_FACTOR * clamp(num(rec?.heartbeatMs) ?? HEARTBEAT_MS, 5000, 600000), STALE_FLOOR_MS);
/** 'working' | 'blocked' | 'idle' | 'stale' | 'ended' | 'unknown' — a stale file is never shown as working or blocked. */
export function displayOf(rec, now) {
  if (schemaMajor(rec) !== 1 || !STATES.includes(rec.state) || rec.contested === true) return 'unknown';
  const hb = num(rec.heartbeatAt);
  if (hb === null || hb > now + CLOCK_SKEW_MS) return 'unknown';
  if (rec.state === 'ended') return 'ended';
  if (now - hb > staleAfter(rec)) return 'stale';
  return rec.state;
}
export const unknownWhy = (rec) => (schemaMajor(rec) === 1 && rec.contested === true ? 'contested'
  : schemaMajor(rec) === 1 && num(rec.heartbeatAt) !== null && STATES.includes(rec.state) ? 'clock' : 'format');
export function resumableOf(rec, display) {
  if (display !== 'ended' && display !== 'stale') return false;
  if (rec?.resume?.resumable !== true || typeof rec.resume.id !== 'string' || !ID_RE.test(rec.resume.id)) return false;
  return !(display === 'ended' && ['clear', 'resume'].includes(rec.ended?.reason));
}
/** POSIX single-quote; the id is never quoted because it must match ID_RE to be offered at all. */
export const shq = (s) => "'" + String(s).replaceAll("'", "'\\''") + "'";
const base = (p) => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(p);
const cut = (s, n) => { const a = [...s]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : s; };
// Terminal width: CJK, full-width forms and ⛔ take two columns, so the text columns still line up in zh/ja
const wide = (c) => /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u26D4]/.test(c);
const wpad = (s, n) => s + ' '.repeat(Math.max(1, n - [...s].reduce((w, c) => w + (wide(c) ? 2 : 1), 0)));
export function repoLabel(rec) {
  const root = typeof rec?.root === 'string' && rec.root ? rec.root : null;
  if (!root) return '?';
  const rr = typeof rec.repoRoot === 'string' && rec.repoRoot ? rec.repoRoot : null;
  return cut(rr && rr !== root ? `${base(rr)} ⎇ ${base(root)}` : base(root), 24);
}
export const fmtAge = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 48 * 3600) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};
/** When the row's display started: blocked.since / stateSince / heartbeatAt (stale, unknown) / ended.at (lib ageOf). */
const since = (rec, d) => (d === 'blocked' ? num(rec.blocked?.since) ?? num(rec.stateSince)
  : d === 'working' || d === 'idle' ? num(rec.stateSince)
    : d === 'ended' ? num(rec.ended?.at) ?? num(rec.heartbeatAt)
      : num(rec.heartbeatAt));
const ageMsOf = (rec, d, now) => { const f = since(rec, d); return f === null ? 0 : Math.max(0, now - f); };
const ORDER = ['blocked', 'working', 'idle', 'stale', 'ended', 'unknown'];
/** §8 order: blocked (longest waiting first) → working (newest) → idle (oldest) → stale (newest) → ended (newest) → unknown. */
export function sortFleet(rows) {
  const key = ({ rec: x, display: d }) => (d === 'blocked' ? num(x.blocked?.since) ?? num(x.stateSince) ?? 0
    : d === 'working' ? -(num(x.stateSince) ?? 0)
      : d === 'idle' ? num(x.stateSince) ?? 0
        : d === 'ended' ? -(num(x.ended?.at) ?? 0)
          : -(num(x.heartbeatAt) ?? 0));
  return [...rows].sort((a, b) => ORDER.indexOf(a.display) - ORDER.indexOf(b.display) || key(a) - key(b));
}

// ── strings (the §9.1 tables, duplicated from hooks/lib/fleet.ts; CLI-only lines from §9.2) ──
const T = {
  st: {
    blocked: { en: '⛔ blocked', 'zh-TW': '⛔ 等你回覆', 'zh-CN': '⛔ 等你回复', ja: '⛔ 応答待ち' },
    working: { en: '● working', 'zh-TW': '● 工作中', 'zh-CN': '● 工作中', ja: '● 作業中' },
    idle: { en: '○ idle', 'zh-TW': '○ 閒置', 'zh-CN': '○ 闲置', ja: '○ 待機' },
    stale: { en: '◌ stale', 'zh-TW': '◌ 失聯', 'zh-CN': '◌ 失联', ja: '◌ 応答なし' },
    ended: { en: '– ended', 'zh-TW': '– 已結束', 'zh-CN': '– 已结束', ja: '– 終了' },
    unknown: { en: '? unknown', 'zh-TW': '? 不明', 'zh-CN': '? 不明', ja: '? 不明' },
  },
  kind: {
    permission: { en: 'permission', 'zh-TW': '權限確認', 'zh-CN': '权限确认', ja: '許可確認' },
    question: { en: 'question', 'zh-TW': '提問', 'zh-CN': '提问', ja: '質問' },
    plan: { en: 'plan approval', 'zh-TW': '計畫待核准', 'zh-CN': '计划待批准', ja: 'プラン承認' },
  },
  sub: { en: ' (subagent)', 'zh-TW': '(子 agent)', 'zh-CN': '(子 agent)', ja: '(サブエージェント)' },
  work: {
    turn: { en: 'running a turn', 'zh-TW': '執行中', 'zh-CN': '执行中', ja: 'ターン実行中' },
    compact: { en: 'compacting', 'zh-TW': '壓縮中', 'zh-CN': '压缩中', ja: '圧縮中' },
  },
  idle: {
    answer: { en: 'answered', 'zh-TW': '已回覆', 'zh-CN': '已回复', ja: '回答済み' },
    aborted: { en: 'interrupted', 'zh-TW': '被中斷', 'zh-CN': '被中断', ja: '中断' },
    error: { en: 'stopped on an error', 'zh-TW': '因錯誤停止', 'zh-CN': '因错误停止', ja: 'エラーで停止' },
    refusal: { en: 'refused', 'zh-TW': '拒答', 'zh-CN': '拒答', ja: '拒否' },
    start: { en: 'just started', 'zh-TW': '剛開始', 'zh-CN': '刚开始', ja: '開始直後' },
    clear: { en: 'after /clear', 'zh-TW': '/clear 之後', 'zh-CN': '/clear 之后', ja: '/clear 後' },
  },
  stale: (s) => ({
    en: `no heartbeat (was ${s.en}) — crashed or asleep?`,
    'zh-TW': `沒有心跳(原本${s['zh-TW']})——當掉或睡眠中?`,
    'zh-CN': `没有心跳(原本${s['zh-CN']})——崩溃或睡眠中?`,
    ja: `ハートビートなし(${s.ja}だった)——クラッシュかスリープ?`,
  }),
  word: {
    working: { en: 'working', 'zh-TW': '工作中', 'zh-CN': '工作中', ja: '作業中' },
    blocked: { en: 'blocked', 'zh-TW': '等你回覆', 'zh-CN': '等你回复', ja: '応答待ち' },
    idle: { en: 'idle', 'zh-TW': '閒置', 'zh-CN': '闲置', ja: '待機' },
    unknown: { en: 'unknown', 'zh-TW': '不明', 'zh-CN': '不明', ja: '不明' },
  },
  end: {
    prompt_input_exit: { en: 'exited', 'zh-TW': '已退出', 'zh-CN': '已退出', ja: '終了' },
    clear: { en: '/clear', 'zh-TW': '/clear', 'zh-CN': '/clear', ja: '/clear' },
    resume: { en: 'switched (/resume)', 'zh-TW': '切到別的 session', 'zh-CN': '切到别的 session', ja: '別セッションへ切替' },
    logout: { en: 'logout', 'zh-TW': '登出', 'zh-CN': '登出', ja: 'ログアウト' },
    other: { en: 'closed or killed', 'zh-TW': '被關閉或終止', 'zh-CN': '被关闭或终止', ja: '閉じられたか強制終了' },
    'id-changed': { en: 'id changed', 'zh-TW': 'id 已變更', 'zh-CN': 'id 已变更', ja: 'ID 変更' },
  },
  unk: {
    contested: { en: 'two processes on one session', 'zh-TW': '兩個程序共用同一個 session', 'zh-CN': '两个进程共用同一个 session', ja: '1 つのセッションを 2 つのプロセスが使用中' },
    format: { en: 'unknown format', 'zh-TW': '格式不明', 'zh-CN': '格式不明', ja: '不明な形式' },
    clock: { en: 'clock ahead', 'zh-TW': '時鐘超前', 'zh-CN': '时钟超前', ja: '時計が進んでいる' },
  },
  summary: (live, b, r, dir, days) => {
    const j = (xs) => xs.filter(Boolean).join(' · ');
    return {
      en: `${j([`${live} live`, b && `⛔ ${b} blocked`, r && `${r} resumable`])} — ${dir} (last ${days} days)`,
      'zh-TW': `${j([`${live} 個進行中`, b && `⛔ ${b} 個等你回覆`, r && `${r} 個可接回`])} — ${dir}(近 ${days} 天)`,
      'zh-CN': `${j([`${live} 个进行中`, b && `⛔ ${b} 个等你回复`, r && `${r} 个可接回`])} — ${dir}(近 ${days} 天)`,
      ja: `${j([`稼働 ${live}`, b && `⛔ 応答待ち ${b}`, r && `再開可能 ${r}`])} — ${dir}(直近 ${days} 日)`,
    };
  },
  hidden: (n) => ({
    en: `  (${n} older ended file(s) hidden — --all shows 30 days; --prune removes them)`,
    'zh-TW': `  (另有 ${n} 個較舊的已結束檔未列出——--all 顯示 30 天;--prune 會刪掉)`,
    'zh-CN': `  (另有 ${n} 个较旧的已结束文件未列出——--all 显示 30 天;--prune 会删掉)`,
    ja: `  (古い終了済み ${n} 件は非表示——--all で 30 日分;--prune で削除)`,
  }),
  unreadable: (n) => ({
    en: `${n} file(s) could not be read (being written, or damaged).`,
    'zh-TW': `${n} 個檔讀不了(正在寫入或已損壞)。`,
    'zh-CN': `${n} 个文件读不了(正在写入或已损坏)。`,
    ja: `${n} 件のファイルを読めませんでした(書き込み中か破損)。`,
  }),
  missing: (dir) => ({
    en: `flightwake fleet — no session has reported yet (${dir})`,
    'zh-TW': `flightwake fleet — 還沒有 session 回報(${dir})`,
    'zh-CN': `flightwake fleet — 还没有 session 上报(${dir})`,
    ja: `flightwake fleet — まだ報告したセッションはありません(${dir})`,
  }),
  nohome: {
    en: 'flightwake fleet — cannot locate the sessions folder (HOME / USERPROFILE unset or not absolute).',
    'zh-TW': 'flightwake fleet — 找不到 session 資料夾(HOME / USERPROFILE 都沒設或不是絕對路徑)。',
    'zh-CN': 'flightwake fleet — 找不到 session 文件夹(HOME / USERPROFILE 都没设或不是绝对路径)。',
    ja: 'flightwake fleet — セッションフォルダが見つかりません(HOME / USERPROFILE 未設定または絶対パスでない)。',
  },
  tip: { en: 'tip: npx flightwake fleet --prune', 'zh-TW': '提示:npx flightwake fleet --prune', 'zh-CN': '提示:npx flightwake fleet --prune', ja: 'ヒント:npx flightwake fleet --prune' },
  removed: (name) => ({ en: `  removed  ${name}`, 'zh-TW': `  已刪除  ${name}`, 'zh-CN': `  已删除  ${name}`, ja: `  削除  ${name}` }),
  wouldRemove: (name) => ({ en: `  would remove  ${name}`, 'zh-TW': `  將刪除  ${name}`, 'zh-CN': `  将删除  ${name}`, ja: `  削除予定  ${name}` }),
  pruneInRepo: (dir) => ({
    en: `⚠️  fleet --prune: ${dir} lies inside a repo or a flightwake records folder; nothing deleted`,
    'zh-TW': `⚠️  fleet --prune:${dir} 在某個 repo 或 flightwake 紀錄資料夾裡;什麼都沒刪`,
    'zh-CN': `⚠️  fleet --prune:${dir} 在某个 repo 或 flightwake 记录文件夹里;什么都没删`,
    ja: `⚠️  fleet --prune:${dir} はリポジトリか flightwake の記録フォルダの中にあります。何も削除していません`,
  }),
  pruned: (n, total, days) => ({
    en: `pruned ${n} of ${total} file(s) older than ${days} day(s); live sessions untouched`,
    'zh-TW': `已刪 ${n}/${total} 個超過 ${days} 天的檔;進行中的 session 沒動`,
    'zh-CN': `已删 ${n}/${total} 个超过 ${days} 天的文件;进行中的 session 没动`,
    ja: `${days} 日より古いファイル ${total} 件中 ${n} 件を削除。稼働中のセッションはそのまま`,
  }),
  badFlag: (f) => ({
    en: `⚠️  fleet: flag not recognized: ${f} (available: --json --all --root=<abs path> --lang= --prune --days=N --dry-run)`,
    'zh-TW': `⚠️  fleet:不認得的旗標 ${f}(可用:--json --all --root=<絕對路徑> --lang= --prune --days=N --dry-run)`,
    'zh-CN': `⚠️  fleet:不认得的旗标 ${f}(可用:--json --all --root=<绝对路径> --lang= --prune --days=N --dry-run)`,
    ja: `⚠️  fleet:認識できないフラグ ${f}(使用可:--json --all --root=<絶対パス> --lang= --prune --days=N --dry-run)`,
  }),
  badDays: (v) => ({
    en: `⚠️  fleet: --days must be a whole number ≥ 0 (got: ${v})`,
    'zh-TW': `⚠️  fleet:--days 必須是 ≥ 0 的整數(收到:${v})`,
    'zh-CN': `⚠️  fleet:--days 必须是 ≥ 0 的整数(收到:${v})`,
    ja: `⚠️  fleet:--days は 0 以上の整数(指定値:${v})`,
  }),
  badRoot: (v) => ({
    en: `⚠️  fleet: --root needs an absolute path (got: ${v})`,
    'zh-TW': `⚠️  fleet:--root 需要絕對路徑(收到:${v})`,
    'zh-CN': `⚠️  fleet:--root 需要绝对路径(收到:${v})`,
    ja: `⚠️  fleet:--root には絶対パスが必要(指定値:${v})`,
  }),
};

const LANGS = ['en', 'zh-TW', 'zh-CN', 'ja'];
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };
/** A parse failure is transient (a torn write): retried once after 50 ms. Returns { rec } or { error }. */
function readRec(p) {
  for (let i = 0; i < 2; i++) {
    let text;
    try { text = readFileSync(p, 'utf8'); } catch { return { error: 'read' }; }
    try {
      const rec = JSON.parse(text);
      if (rec && typeof rec === 'object' && !Array.isArray(rec)) return { rec };
      return { error: 'shape' };
    } catch { if (i === 0) sleepSync(50); }
  }
  return { error: 'parse' };
}
/** The direct regular files matching FILE_RE (links, directories and other names skipped), with their mtime. */
function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!FILE_RE.test(name)) continue;
    let st;
    try { st = lstatSync(dir + '/' + name); } catch { continue; }
    if (!st.isFile() || st.isSymbolicLink()) continue;
    out.push({ name, path: dir + '/' + name, mtimeMs: st.mtimeMs });
  }
  return out;
}

function parseArgs(args) {
  const o = { json: false, all: false, root: null, lang: null, prune: false, days: 7, dry: false, bad: null, badDays: null, badRoot: null };
  for (const a of args) {
    if (a === 'fleet') continue;
    if (a === '--json') o.json = true;
    else if (a === '--all') o.all = true;
    else if (a === '--prune') o.prune = true;
    else if (a === '--dry-run') o.dry = true;
    else if (a.startsWith('--lang=')) o.lang = a.slice(7);
    else if (a.startsWith('--days=')) { const v = a.slice(7); if (/^\d+$/.test(v)) o.days = Number(v); else o.badDays = v; }
    else if (a.startsWith('--root=')) { const v = a.slice(7); if (v && isAbs(v)) o.root = stripSlash(v) || '/'; else o.badRoot = v; }
    else { o.bad = a; break; }
  }
  return o;
}

/**
 * args: argv after the binary (may include 'fleet'); env/now/log injectable for tests; lang: the cwd's install language
 * (`--lang=` in args wins). Returns the exit code.
 */
export async function runFleet({ args = [], env = process.env, now = Date.now(), log = console.log, lang = 'en', isTTY = !!process.stdout.isTTY, cwd = process.cwd() } = {}) {
  const o = parseArgs(args);
  const L = o.lang && LANGS.includes(o.lang) ? o.lang : (LANGS.includes(lang) ? lang : 'en');
  const M = (m) => m[L] ?? m.en;
  if (o.lang !== null && !LANGS.includes(o.lang)) { log(`⚠️  --lang not recognized: ${o.lang} (available: ${LANGS.join(', ')})`); return 1; }
  if (o.bad !== null) { log(M(T.badFlag(o.bad))); return 1; }
  if (o.badDays !== null) { log(M(T.badDays(o.badDays))); return 1; }
  if (o.badRoot !== null) { log(M(T.badRoot(o.badRoot))); return 1; }

  const b = fleetBase(env);
  if (b === null) {
    if (o.json) log(JSON.stringify({ version: 1, generatedAt: now, dir: null, error: 'no-home' }));
    else log(M(T.nohome));
    return 1;
  }
  const dir = b + '/sessions';
  let isDir = false;
  try { const st = lstatSync(dir); isDir = st.isDirectory() && !st.isSymbolicLink(); } catch {}
  const constants = { heartbeatMs: HEARTBEAT_MS, staleFloorMs: STALE_FLOOR_MS, staleFactor: STALE_FACTOR, blockedAlertMs: BLOCKED_ALERT_MS };
  const zero = { blocked: 0, working: 0, idle: 0, stale: 0, ended: 0, unknown: 0 };
  if (!isDir) {
    if (o.json) log(JSON.stringify({ version: 1, generatedAt: now, dir, constants, counts: zero, sessions: [], unreadable: [], hidden: 0 }));
    else log(M(T.missing(dir)));
    return 0;
  }
  let files;
  try { files = listFiles(dir); } catch { files = []; }

  if (o.prune) {
    // the only delete path: never inside a repo or a records folder (the mod's write guard, applied to deletes)
    if (fleetDirInRepo(cwd, b)) { log(M(T.pruneInRepo(dir))); return 1; }
    return prune({ files, now, days: o.days, dry: o.dry, log, M });
  }

  // ── list ──
  const window = o.all ? LIST_WINDOW_ALL_MS : LIST_WINDOW_MS;
  const cap = o.all ? LIST_CAP_ALL : LIST_CAP;
  const recent = files.filter((f) => f.mtimeMs >= now - window).sort((x, y) => y.mtimeMs - x.mtimeMs);
  let hidden = files.length - recent.length + Math.max(0, recent.length - cap);
  const rows = [];
  const unreadable = [];
  for (const f of recent.slice(0, cap)) {
    const r = readRec(f.path);
    if (r.error) { unreadable.push({ file: f.name, error: r.error }); continue; }
    rows.push({ rec: r.rec, file: f.path, name: f.name, display: displayOf(r.rec, now) });
  }
  let sorted = sortFleet(rows);
  if (o.root !== null) sorted = sorted.filter((x) => stripSlash(String(x.rec.root ?? '')) === o.root || stripSlash(String(x.rec.repoRoot ?? '')) === o.root);
  if (!o.all) {
    const ended = sorted.filter((x) => x.display === 'ended');
    if (ended.length > ENDED_CAP) {
      const drop = new Set(ended.slice(ENDED_CAP));
      hidden += drop.size;
      sorted = sorted.filter((x) => !drop.has(x));
    }
  }
  const counts = { ...zero };
  for (const x of sorted) {
    counts[x.display]++;
    x.resumable = resumableOf(x.rec, x.display);
    const id = x.rec.resume?.id;
    const cwd = typeof x.rec.launchCwd === 'string' && x.rec.launchCwd ? x.rec.launchCwd : null;
    const tr = transcriptOf(x.rec, env.HOME || env.USERPROFILE || '');
    // the CLI always prefixes the cd (lib resumeCmd with no own launchCwd); the id is safe (resumableOf checks ID_RE)
    x.resumeCommand = x.resumable && tr !== null && existsSync(tr)
      ? `${cwd ? `cd ${shq(cwd)} && ` : ''}claude --resume ${id}` : null;
  }
  const live = counts.working + counts.blocked + counts.idle;
  const resumableN = sorted.filter((x) => x.resumeCommand).length;
  const days = Math.round(window / DAY_MS);

  if (o.json) {
    log(JSON.stringify({
      version: 1, generatedAt: now, dir, constants, counts,
      sessions: sorted.map((x) => ({
        ...x.rec,
        display: x.display,
        ageMs: ageMsOf(x.rec, x.display, now),
        heartbeatAgeMs: num(x.rec.heartbeatAt) === null ? null : now - x.rec.heartbeatAt,
        staleAfterMs: staleAfter(x.rec),
        resumable: x.resumable,
        resumeCommand: x.resumeCommand,
        file: x.file,
      })),
      unreadable, hidden,
    }));
    return 0;
  }

  const color = isTTY && !env.NO_COLOR;
  const paint = (d, s) => (!color ? s : `${{ blocked: '\x1b[31m', working: '\x1b[32m', stale: '\x1b[33m', ended: '\x1b[2m', unknown: '\x1b[2m' }[d] ?? ''}${s}${d === 'idle' ? '' : '\x1b[0m'}`);
  log(`flightwake fleet — ${M(T.summary(live, counts.blocked, resumableN, dir, days))}`);
  for (const x of sorted) {
    const rec = x.rec;
    const sid = typeof rec.sessionId === 'string' && rec.sessionId ? rec.sessionId : x.name.replace(/\.json$/, '');
    const st = M(T.st[x.display]);
    const age = fmtAge(ageMsOf(rec, x.display, now));
    let detail = detailOf(rec, x.display, now, M);
    if (x.resumeCommand) detail += `  → ${x.resumeCommand}`;
    log(`${paint(x.display, wpad(st, 12))}${wpad(repoLabel(rec), 24)} ${cut(sid, 8).padEnd(10)}${age.padStart(5)}  ${detail}`);
  }
  if (hidden > 0 && !o.all) log(M(T.hidden(hidden)));
  if (unreadable.length) log(M(T.unreadable(unreadable.length)));
  if (files.length > TIP_OVER) log(M(T.tip));
  return 0;
}

const str = (v) => (typeof v === 'string' ? v : '');
/** The detail text — mirrors hooks/lib/fleet.ts detailOf (the resume suffix is added by the caller). */
function detailOf(rec, d, now, M) {
  const sub = (a) => (a === true ? M(T.sub) : '');
  const tgt = (t) => (typeof t === 'string' ? ` ${t}` : '');
  if (d === 'blocked') {
    const bl = rec.blocked;
    const k = bl && Object.hasOwn(T.kind, bl.kind) ? M(T.kind[bl.kind]) : '?';
    if (!bl || typeof bl !== 'object') return k;
    return `${k} · ${typeof bl.tool === 'string' ? bl.tool : '?'}${tgt(bl.target)}${sub(bl.agent)}`;
  }
  if (d === 'working') {
    if (rec.why === 'compact') return M(T.work.compact);
    const a = rec.activity;
    if (a && typeof a.tool === 'string' && (num(rec.stateSince) === null || num(a.at) === null || a.at >= rec.stateSince)) return `${a.tool}${tgt(a.target)}${sub(a.agent)}`;
    return M(T.work.turn);
  }
  if (d === 'idle') {
    const lt = rec.lastTurn;
    if (!lt || (num(rec.startedAt) !== null && num(lt.at) !== null && lt.at < rec.startedAt)) return rec.parent?.via === 'clear' ? M(T.idle.clear) : M(T.idle.start);
    return M(['aborted', 'error', 'refusal'].includes(lt.reason) ? T.idle[lt.reason] : T.idle.answer);
  }
  if (d === 'stale') return M(T.stale(Object.hasOwn(T.word, rec.state) ? T.word[rec.state] : T.word.unknown));
  if (d === 'ended') {
    const r = str(rec.ended?.reason);
    return M(Object.hasOwn(T.end, r) ? T.end[r] : T.end.other);
  }
  return M(T.unk[unknownWhy(rec)]);
}

/** Our own file: a parsed record whose schema is ours, or (a torn write of ours) text that begins with it (the mod's rule). */
const OURS_PREFIX_RE = /^\s*\{\s*"schema"\s*:\s*"flightwake\.session\//;
const isOursSchema = (rec) => typeof rec?.schema === 'string' && rec.schema.startsWith('flightwake.session/');
const rawText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };

/**
 * The only delete path in the whole design. Regular files matching FILE_RE directly in the folder; never one modified
 * in the last 120 s (a live writer); ended (ended.at < cutoff) or stale (heartbeatAt < cutoff); a torn write of ours or
 * an unknown major of our schema only when its mtime is older than the cutoff. A file that is not ours (another
 * tool's JSON) is never touched. Never the folder itself.
 */
function prune({ files, now, days, dry, log, M }) {
  const cutoff = now - days * DAY_MS;
  // a live writer by the given clock or the wall clock, whichever is later
  const isLive = (mtimeMs) => mtimeMs > now - LIVE_WRITER_MS || mtimeMs > Date.now() - LIVE_WRITER_MS;
  // the file as it is right now: a regular file (not a link) and its mtime, else null
  const fresh = (p) => { try { const st = lstatSync(p); return st.isFile() && !st.isSymbolicLink() ? st.mtimeMs : null; } catch { return null; } };
  let n = 0;
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    if (isLive(f.mtimeMs)) continue;
    const r = readRec(f.path);
    // the listing's mtime is from before the read: a session that woke up meanwhile has rewritten the file
    const mtimeMs = fresh(f.path);
    if (mtimeMs === null || isLive(mtimeMs)) continue;
    let del = false;
    if (r.error) {
      const raw = r.error === 'parse' ? rawText(f.path) : null;
      del = raw !== null && OURS_PREFIX_RE.test(raw) && mtimeMs < cutoff;
    } else if (!isOursSchema(r.rec)) continue; // not ours: never touched
    else if (schemaMajor(r.rec) !== 1) del = mtimeMs < cutoff;
    else {
      const d = displayOf(r.rec, now);
      if (d === 'ended') del = (num(r.rec.ended?.at) ?? num(r.rec.heartbeatAt) ?? 0) < cutoff;
      else if (d === 'stale') del = (num(r.rec.heartbeatAt) ?? 0) < cutoff;
    }
    if (!del) continue;
    if (dry) { log(M(T.wouldRemove(f.name))); n++; continue; }
    try {
      // re-checked right before the delete: still a regular file, not a link, and not written in the last 120 s
      const last = fresh(f.path);
      if (last === null || isLive(last)) continue;
      rmSync(f.path);
      log(M(T.removed(f.name)));
      n++;
    } catch {}
  }
  log(M(T.pruned(n, files.length, days)));
  return 0;
}
