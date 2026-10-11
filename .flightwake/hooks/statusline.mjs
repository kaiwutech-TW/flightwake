#!/usr/bin/env node
/**
 * flightwake statusline (opt-in) — a persistent gauge at the bottom of Claude Code:
 * health color · STATE lag · context usage · tokens so far + API-equivalent cost, plus the next command for the current state
 * (session just opened → /fw-coldstart; lag ≥3 → /fw-record; context running hot → record→clear→coldstart;
 * a newer flightwake on npm → npx flightwake update, shown only when nothing more urgent is up).
 * Session fleet (flightwake-mod F7): another session waiting on you (an unanswered permission dialog, a question or a
 * plan approval for ≥2 s) shows as a red `⛔` field right after the brand, so it survives truncation.
 * stdin receives Claude Code's session JSON; every error degrades silently — the gauge must never become noise.
 * Install: `npx flightwake init --statusline` (never overwrites an existing statusline).
 * LANG and FW_VERSION are stamped by the installer.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const LANG = 'zh-TW';
const FW_VERSION = '0.15.0';
// Message table lookup. Keyed rather than positional: with four languages, positional args silently
// swap when one is edited. Any missing key falls back to English rather than printing undefined.
const M = (m) => m[LANG] ?? m.en;

// Skip stdin when it's a TTY (run by hand without a pipe) — readFileSync(0) blocks forever on an open TTY
let j = {};
if (!process.stdin.isTTY) {
  try { j = JSON.parse(readFileSync(0, 'utf8')); } catch {}
}
const dir = j.workspace?.project_dir ?? process.cwd();
const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

let health = null; // null = no .flightwake here
let behindN = null;
let stateDirty = false;
let pct = null;
let msgs = 0;
// Spend: cost is Claude Code's own ledger on stdin (what /cost shows, API list prices — not a bill on a subscription);
// tokens are summed from the transcript, once per API response (one response spans several lines sharing message.id).
let usd = null;
let tokens = null;
try { const c = j.cost?.total_cost_usd; if (typeof c === 'number' && Number.isFinite(c) && c >= 0) usd = c; } catch {}

// health (STATE frontmatter) + lag (same rev-list rule as state-check.mjs, bot commits excluded)
try {
  const state = join(dir, '.flightwake', 'STATE.md');
  if (existsSync(state)) {
    health = /^health:\s*(\S+)/m.exec(readFileSync(state, 'utf8'))?.[1] ?? '?';
    try {
      if (git('status', '--porcelain', '--', '.flightwake/STATE.md')) {
        stateDirty = true;
      } else {
        const last = git('log', '-1', '--format=%H', '--', '.flightwake/STATE.md');
        if (last) {
          const range = `${last}..HEAD`;
          const bots = Number(git('rev-list', '--count', '--author=\\[bot\\]', range));
          behindN = Math.max(0, Number(git('rev-list', '--count', range)) - bots);
        }
      }
    } catch {}
  }
} catch {}

// Context usage: prefer Claude Code's context_window on stdin (carries the real window size —
// no over-reporting on 1M models); older Claude Code without the field falls back to the transcript's
// last usage entry against a conservative 200k. Message count doubles as the "just opened" signal.
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
    const seen = new Set();
    let sum = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"usage"')) continue;
      let m;
      try { m = JSON.parse(lines[i]).message; } catch { continue; }
      const u = m?.usage;
      if (!u || typeof u !== 'object') continue;
      msgs++;
      if (pct === null) {
        const used = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        pct = Math.min(99, Math.round((used / 200000) * 100));
      }
      const id = typeof m.id === 'string' && m.id ? m.id : `#${i}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const n = (v) => (typeof v === 'number' && v > 0 ? v : 0);
      sum += n(u.input_tokens) + n(u.output_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens);
    }
    tokens = sum;
  }
} catch {}

// Session fleet: other sessions blocked on the person. Read-only, local files only, no network.
// The base-dir rules (§2) and constants (§8) MIRROR mods/flightwake/hooks/lib/fleet.ts and bin/fleet.mjs — change all
// three together (test/smoke.sh greps the constants in each). Only files modified in the last 120 s are parsed.
const HEARTBEAT_MS = 30000;
const STALE_FACTOR = 4;
const STALE_FLOOR_MS = 90000;
const CLOCK_SKEW_MS = 60000;
const BLOCKED_ALERT_MS = 2000;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/;
let fleetBlocked = null; // { n, name } when another session is blocked
try {
  const env = process.env;
  const isAbs = (p) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
  const strip = (p) => (p.length > 1 ? p.replace(/[\\/]+$/, '') : p) || p;
  const fh = env.FLIGHTWAKE_HOME || '';
  const h = env.HOME || env.USERPROFILE || '';
  const base = fh && isAbs(fh) ? strip(fh) : h && isAbs(h) ? strip(h) + '/.flightwake' : null;
  if (base !== null) {
    const sdir = base + '/sessions';
    const now = Date.now();
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const staleAfter = (r) => Math.max(STALE_FACTOR * Math.min(600000, Math.max(5000, num(r.heartbeatMs) ?? HEARTBEAT_MS)), STALE_FLOOR_MS);
    const bn = (p) => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(p);
    const cut = (s, n) => { const a = [...s]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : s; };
    const label = (r) => {
      const root = typeof r.root === 'string' && r.root ? r.root : '?';
      const rr = typeof r.repoRoot === 'string' && r.repoRoot ? r.repoRoot : null;
      return cut(rr && rr !== root ? `${bn(rr)} ⎇ ${bn(root)}` : bn(root), 24);
    };
    const hits = [];
    for (const name of readdirSync(sdir)) {
      try {
        if (!FILE_RE.test(name)) continue;
        const st = lstatSync(sdir + '/' + name);
        if (!st.isFile() || st.isSymbolicLink() || st.mtimeMs < now - 120000) continue;
        const r = JSON.parse(readFileSync(sdir + '/' + name, 'utf8'));
        if (!r || typeof r !== 'object') continue;
        const m = /^flightwake\.session\/(\d+)(?:\.\d+)*$/.exec(typeof r.schema === 'string' ? r.schema : '');
        if (!m || Number(m[1]) !== 1 || r.state !== 'blocked' || r.contested === true) continue;
        if (typeof j.session_id === 'string' && r.sessionId === j.session_id) continue;
        const hb = num(r.heartbeatAt), since = num(r.blocked?.since);
        if (hb === null || since === null || now - hb > staleAfter(r) || hb > now + CLOCK_SKEW_MS) continue;
        if (now - since < BLOCKED_ALERT_MS) continue;
        hits.push(r);
      } catch {}
    }
    if (hits.length) fleetBlocked = { n: hits.length, name: cut(label(hits[0]), 16) };
  }
} catch {}

// Update check (opt out: FLIGHTWAKE_NO_UPDATE_CHECK=1). Rendering never touches the network:
// it reads a tmpdir cache; a cache older than 24h spawns one detached background refresh
// (the cache timestamp is touched first, so concurrent renders don't spawn duplicates).
let updateTo = null;
try {
  if (!process.env.FLIGHTWAKE_NO_UPDATE_CHECK && FW_VERSION !== '0.0.0') {
    const cachePath = join(tmpdir(), 'flightwake-update-check.json');
    let cache = null;
    try { cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch {}
    if (!cache || Date.now() - cache.checked > 24 * 3600 * 1000) {
      try { writeFileSync(cachePath, JSON.stringify({ checked: Date.now(), latest: cache?.latest ?? null })); } catch {}
      const script = `fetch('https://registry.npmjs.org/flightwake/latest').then(r=>r.json()).then(v=>require('node:fs').writeFileSync(${JSON.stringify(cachePath)},JSON.stringify({checked:Date.now(),latest:v.version}))).catch(()=>{})`;
      spawn(process.execPath, ['-e', script], { detached: true, stdio: 'ignore' }).unref();
    }
    const newer = (a, b) => {
      const pa = String(a).split('.').map(Number);
      const pb = String(b).split('.').map(Number);
      for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
      return false;
    };
    if (cache?.latest && newer(cache.latest, FW_VERSION)) updateTo = cache.latest;
  }
} catch {}

const parts = [`✈️ flightwake${FW_VERSION !== '0.0.0' ? ` \x1b[2mv${FW_VERSION}\x1b[0m` : ''}`];
if (fleetBlocked) {
  const { n, name } = fleetBlocked;
  const text = n === 1
    ? M({ en: `⛔ ${name} blocked`, 'zh-TW': `⛔ ${name} 等你回覆`, 'zh-CN': `⛔ ${name} 等你回复`, ja: `⛔ ${name} が応答待ち` })
    : M({ en: `⛔ ${n} blocked`, 'zh-TW': `⛔ ${n} 個 session 等你回覆`, 'zh-CN': `⛔ ${n} 个 session 等你回复`, ja: `⛔ ${n} 件が応答待ち` });
  parts.push(`\x1b[31m${text}\x1b[0m`);
}
if (health !== null) {
  const color = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' }[health] ?? '';
  const lag = stateDirty
    ? M({ en: ' · STATE updating', 'zh-TW': ' · STATE 更新中', 'zh-CN': ' · STATE 更新中', ja: ' · STATE 更新中' })
    : behindN === null ? ''
      : behindN > 0
        ? M({
            en: ` · STATE ${behindN}c behind`,
            'zh-TW': ` · STATE 落後 ${behindN}c`,
            'zh-CN': ` · STATE 落后 ${behindN}c`,
            ja: ` · STATE ${behindN}c 遅れ`,
          })
        : M({ en: ' · STATE in sync', 'zh-TW': ' · STATE 同步', 'zh-CN': ' · STATE 同步', ja: ' · STATE 同期済' });
  parts.push(`${color}●${health}\x1b[0m${lag}`);
}
if (pct !== null) {
  const color = pct >= 80 ? '\x1b[31m' : pct >= 60 ? '\x1b[33m' : '\x1b[32m';
  const filled = Math.round(pct / 10);
  parts.push(`${color}${'▓'.repeat(filled)}${'░'.repeat(10 - filled)} ${pct}%\x1b[0m`);
}

// Spend: "1.2M tok · ≈$4.99" — either half alone when only one is known; nothing when neither is
const fmtTok = (n) => (n < 1000 ? String(Math.round(n)) : n < 1e6 ? `${(n / 1000).toFixed(n < 1e4 ? 2 : 1).replace(/\.?0+$/, '')}k` : `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`);
const fmtUsd = (v) => (v > 0 && v < 0.01 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`);
{
  const spend = [];
  if (tokens !== null) spend.push(`${fmtTok(tokens)} tok`);
  if (usd !== null) spend.push(`≈${fmtUsd(usd)}`);
  if (spend.length) parts.push(`\x1b[2m${spend.join(' · ')}\x1b[0m`);
}

// Next-command hint: a single one, by priority; silence when everything is fine
let hint = '';
if (health === 'yellow' || health === 'red') hint = M({
  en: 'handle unverified items before stacking new work (read STATE)',
  'zh-TW': '先處理未驗證項再疊新工作(讀 STATE)',
  'zh-CN': '先处理未验证项再叠新工作(读 STATE)',
  ja: '未検証の項目を片付けてから新しい作業を積む(STATE を読む)',
});
else if (pct !== null && pct >= 80) hint = M({
  en: '/fw-record → /clear → /fw-coldstart',
  'zh-TW': '/fw-record 收尾 → /clear → /fw-coldstart 接手',
  'zh-CN': '/fw-record 收尾 → /clear → /fw-coldstart 接手',
  ja: '/fw-record で締め → /clear → /fw-coldstart で引き継ぎ',
});
else if (behindN !== null && behindN >= 3) hint = M({
  en: '/fw-record to wrap up',
  'zh-TW': '/fw-record 收尾',
  'zh-CN': '/fw-record 收尾',
  ja: '/fw-record で締める',
});
else if (health !== null && msgs <= 2) hint = M({
  en: 'start with /fw-coldstart',
  'zh-TW': '開工先 /fw-coldstart',
  'zh-CN': '开工先 /fw-coldstart',
  ja: 'まず /fw-coldstart から',
});
else if (updateTo) hint = M({
  en: `v${updateTo} available: npx flightwake update`,
  'zh-TW': `可更新 v${updateTo}:npx flightwake update`,
  'zh-CN': `可更新 v${updateTo}:npx flightwake update`,
  ja: `v${updateTo} が利用可能:npx flightwake update`,
});
if (hint) parts.push(`\x1b[36m→ ${hint}\x1b[0m`);

console.log(parts.join(' │ '));
