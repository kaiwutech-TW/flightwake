#!/usr/bin/env node
/**
 * flightwake statusline (opt-in) — a persistent gauge at the bottom of Claude Code:
 * health color · STATE lag · context usage, plus the next command for the current state
 * (session just opened → /fw-coldstart; lag ≥3 → /fw-record; context running hot → record→clear→coldstart;
 * a newer flightwake on npm → npx flightwake update, shown only when nothing more urgent is up).
 * stdin receives Claude Code's session JSON; every error degrades silently — the gauge must never become noise.
 * Install: `npx flightwake init --statusline` (never overwrites an existing statusline).
 * LANG and FW_VERSION are stamped by the installer.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const LANG = 'zh-TW';
const FW_VERSION = '0.10.1';
const M = (en, zh) => (LANG === 'zh-TW' ? zh : en);

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

// health (STATE frontmatter) + lag (same rev-list rule as state-check.mjs)
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
if (health !== null) {
  const color = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' }[health] ?? '';
  const lag = stateDirty
    ? M(' · STATE updating', ' · STATE 更新中')
    : behindN === null ? '' : behindN > 0 ? M(` · STATE ${behindN}c behind`, ` · STATE 落後 ${behindN}c`) : M(' · STATE in sync', ' · STATE 同步');
  parts.push(`${color}●${health}\x1b[0m${lag}`);
}
if (pct !== null) {
  const color = pct >= 80 ? '\x1b[31m' : pct >= 60 ? '\x1b[33m' : '\x1b[32m';
  const filled = Math.round(pct / 10);
  parts.push(`${color}${'▓'.repeat(filled)}${'░'.repeat(10 - filled)} ${pct}%\x1b[0m`);
}

// Next-command hint: a single one, by priority; silence when everything is fine
let hint = '';
if (health === 'yellow' || health === 'red') hint = M('handle unverified items before stacking new work (read STATE)', '先處理未驗證項再疊新工作(讀 STATE)');
else if (pct !== null && pct >= 80) hint = M('/fw-record → /clear → /fw-coldstart', '/fw-record 收尾 → /clear → /fw-coldstart 接手');
else if (behindN !== null && behindN >= 3) hint = M('/fw-record to wrap up', '/fw-record 收尾');
else if (health !== null && msgs <= 2) hint = M('start with /fw-coldstart', '開工先 /fw-coldstart');
else if (updateTo) hint = M(`v${updateTo} available: npx flightwake update`, `可更新 v${updateTo}:npx flightwake update`);
if (hint) parts.push(`\x1b[36m→ ${hint}\x1b[0m`);

console.log(parts.join(' │ '));
