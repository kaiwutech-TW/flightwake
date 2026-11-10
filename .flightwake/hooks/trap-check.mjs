#!/usr/bin/env node
/**
 * flightwake trap check — a PreToolUse hook for Claude Code and Codex (A5, docs/plans/tripwire-hook.md).
 * When a call aims at something an active TRAPS entry is anchored to — an edited file matching `paths`, a shell command
 * starting with one of `commands`, or a path the command writes — the entry's gist goes back to the agent as
 * `hookSpecificOutput.additionalContext`. Both hosts hand that text to the model next to the tool result, so the agent
 * reads it right after this call ran: it is for the next step, not a gate on this one (docs/plans/tripwire-hook.probe.md).
 * It NEVER blocks and never prints anything but that one JSON object; any error exits 0 silently.
 *
 *   node "<repo>/.flightwake/hooks/trap-check.mjs" claude   (.claude/settings.json, matcher Edit|Write|NotebookEdit|Bash)
 *   node "<repo>/.flightwake/hooks/trap-check.mjs" codex    (.codex/hooks.json, matcher ^(Bash|apply_patch)$)
 *
 * Matching is the shared TRAPS core (traps-core.mjs, copied next to this file): the same code as the Claude Code mod and
 * the CLI. The repo is the one this file lives in (`<repo>/.flightwake/hooks/`), never guessed from the session's cwd.
 *
 * Once per session: a hint record `<base>/hints/<host>-<session id>.json` (base = FLIGHTWAKE_HOME, else ~/.flightwake;
 * the same rule as fleet and trips) keeps which `name@version` this session was already shown, per repo, and the
 * tool_use_id it was shown for (the mod reads that to skip its own copy of the same hint). Best effort, never a promise:
 * the folder must already exist and be private (init/update create it 0700), files are 0600, nothing but keys is stored
 * (no command, patch or hint text), and every failure — no session id, a folder inside a repo, a link, a file that is
 * not ours, bad JSON — still prints the hint. Two calls at once may both hint. FLIGHTWAKE_HINTS=off writes no record.
 * `--plugin` (the Claude Code plugin, hooks/hooks.json): the repo is the session's project (CLAUDE_PROJECT_DIR, else the
 * cwd, walked up to the folder holding .flightwake/STATE.md), and the hook stays quiet when that repo registers its own
 * trap-check.mjs in .claude/settings(.local).json — a repo with both installs is hinted once.
 * Off switches: FLIGHTWAKE_TRIPWIRE=off; in Claude Code also the mod's own `"tripwire": false` (user settings).
 * LANG is stamped by the installer (`npx flightwake init --lang=…`).
 */
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LANG = 'zh-TW';
const M = (m) => m[LANG] ?? m.en;

const HOST = process.argv[2] === 'codex' ? 'codex' : 'claude';
const PLUGIN = process.argv.includes('--plugin');
const MAX_ENTRIES = 5;
const MAX_LINE = 300;
const TRAPS_REL = '.flightwake/TRAPS.md';
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const off = (v) => /^(?:0|off|false|no)$/i.test(String(v ?? '').trim());

const real = (p) => { try { return realpathSync(p); } catch { return p; } };
/** A file path with its folder resolved to the real path when the folder exists (macOS /tmp → /private/tmp). */
const realFile = (p) => { try { return join(realpathSync(dirname(p)), basename(p)); } catch { return p; } };

async function loadCore() {
  // Installed: traps-core.mjs sits next to this file. In the flightwake source tree it lives under the mod.
  try { return await import('./traps-core.mjs'); } catch {}
  return import('../mods/flightwake/hooks/lib/traps-core.mjs');
}

/** The mod's own off switch, read from the user settings the mod reads (plugin options are never in project settings). */
function modTripwireOff(env) {
  const home = env.HOME || env.USERPROFILE || '';
  if (!home) return false;
  try {
    const s = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
    const cfg = s?.pluginConfigs ?? {};
    return Object.keys(cfg).some((k) => k.startsWith('flightwake-mod@') && cfg[k]?.options?.tripwire === false);
  } catch { return false; }
}

const clip = (s) => (s.length > MAX_LINE ? `${s.slice(0, MAX_LINE)}…` : s);

/** The hint text. Same wording as the mod's tripwire (mods/flightwake/hooks/features/tripwire.ts render). */
function render(shown, more) {
  const lines = [];
  let isLead = false;
  for (const { entry, via } of shown) {
    if (entry.confidence !== 'confirmed') isLead = true;
    lines.push(M({
      en: `flightwake TRAPS: \`${entry.name}\` [${entry.confidence}] matches ${via}`,
      'zh-TW': `flightwake TRAPS:\`${entry.name}\` [${entry.confidence}] 命中 ${via}`,
      'zh-CN': `flightwake TRAPS:\`${entry.name}\` [${entry.confidence}] 命中 ${via}`,
      ja: `flightwake TRAPS: \`${entry.name}\` [${entry.confidence}] が ${via} に該当`,
    }));
    const detail = [entry.labelled[1], entry.labelled[2]].filter(Boolean);
    if (detail.length) for (const l of detail) lines.push(`  ${clip(l)}`);
    else if (entry.body) lines.push(`  ${clip(entry.body.replace(/\s+/g, ' '))}`);
  }
  if (more > 0) lines.push(M({ en: `+${more} more`, 'zh-TW': `另有 ${more} 條`, 'zh-CN': `另有 ${more} 条`, ja: `ほか ${more} 件` }));
  lines.push(M({
    en: 'This note arrives after this call ran: it cannot stop this one; it is for the next time you touch this.',
    'zh-TW': '這則提示在本次呼叫執行之後才出現:它擋不了這一次,是提醒你下一次碰到這裡時注意。',
    'zh-CN': '这则提示在本次调用执行之后才出现:它拦不住这一次,是提醒你下一次碰到这里时注意。',
    ja: 'この注意は今回の呼び出しが実行された後に届きます。今回は防げません。次にここに触れるときのためのものです。',
  }));
  lines.push(M({ en: `Full entry: ${TRAPS_REL}`, 'zh-TW': `完整條目:${TRAPS_REL}`, 'zh-CN': `完整条目:${TRAPS_REL}`, ja: `全文: ${TRAPS_REL}` }));
  if (isLead) {
    lines.push(M({
      en: 'Note: probable/suspected/unknown entries are leads, not settled facts. Verify before relying on them, and never use one to argue that something is safe.',
      'zh-TW': '注意:probable/suspected/unknown 的條目是線索,不是定論。採信前先驗證,也不可拿它來論證某件事是安全的。',
      'zh-CN': '注意:probable/suspected/unknown 的条目是线索,不是定论。采信前先验证,也不可拿它来论证某件事是安全的。',
      ja: '注意: probable/suspected/unknown のエントリは手がかりであり確定事項ではありません。依拠する前に検証し、安全性の根拠には使わないでください。',
    }));
  }
  return lines.join('\n');
}

// ── Hint record (best-effort dedup) ──────────────────────────────────────────────────────────────────────────────────

const isAbs = (p) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
/** The fleet base: FLIGHTWAKE_HOME (absolute), else <home>/.flightwake; null when neither is usable. */
function hintsBase(env) {
  const fh = env.FLIGHTWAKE_HOME || '';
  if (fh && isAbs(fh)) return fh.replace(/[\\/]+$/, '') || fh;
  const h = env.HOME || env.USERPROFILE || '';
  if (h && isAbs(h)) return `${h.replace(/[\\/]+$/, '')}/.flightwake`;
  return null;
}
const within = (root, p) => p === root || p.startsWith(`${root.replace(/\/+$/, '')}/`);
/** The hint folder, or null when it may not be used: missing, a link, not private, inside this repo or any repo. */
function hintsDir(env, root) {
  const base = hintsBase(env);
  if (!base) return null;
  const dir = `${base}/hints`;
  try {
    const st = lstatSync(dir);
    if (!st.isDirectory() || (st.mode & 0o077) !== 0) return null;
  } catch { return null; }
  const rdir = real(dir);
  if (within(root, dir) || within(root, rdir)) return null;
  for (const b of new Set([base, real(base)])) {
    if (existsSync(join(b, 'STATE.md'))) return null;
    for (let d = b; ; d = dirname(d)) {
      if (existsSync(join(d, '.git')) || existsSync(join(d, '.flightwake', 'STATE.md'))) return null;
      if (dirname(d) === d) break;
    }
  }
  return rdir;
}

/** { file, data } for this session, or null when the record cannot be used (then nothing is written). */
function openRecord(env, root, sessionId) {
  if (off(env.FLIGHTWAKE_HINTS) || typeof sessionId !== 'string' || !ID_RE.test(sessionId)) return null;
  const dir = hintsDir(env, root);
  if (!dir) return null;
  const file = join(dir, `${HOST}-${sessionId}.json`);
  const fresh = { v: 1, host: HOST, sessionId, updated: '', repos: {} };
  try {
    const st = lstatSync(file);
    if (!st.isFile()) return null; // a link or anything else: not ours
    const d = JSON.parse(readFileSync(file, 'utf8'));
    const isOurs = d && d.v === 1 && d.host === HOST && d.sessionId === sessionId && d.repos && typeof d.repos === 'object' && !Array.isArray(d.repos);
    return isOurs ? { file, data: d } : null;
  } catch (e) {
    return e && e.code === 'ENOENT' ? { file, data: fresh } : null;
  }
}

function saveRecord(rec) {
  try {
    rec.data.updated = new Date().toISOString();
    const tmp = `${rec.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(rec.data) + '\n', { mode: 0o600, flag: 'wx' });
    renameSync(tmp, rec.file);
  } catch {
    // a record that cannot be kept never costs the hint
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const env = process.env;
  if (off(env.FLIGHTWAKE_TRIPWIRE)) return;
  if (process.stdin.isTTY) return; // run by hand: a TTY stdin never closes
  let input;
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { return; }
  if (!input || typeof input !== 'object') return;
  if (HOST === 'claude' && modTripwireOff(env)) return;

  const tool = input.tool_name;
  const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  const isFileTool = tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit' || tool === 'MultiEdit';
  const isPatch = tool === 'apply_patch';
  const isShell = tool === 'Bash';
  if (!isFileTool && !isPatch && !isShell) return;

  const here = dirname(fileURLToPath(import.meta.url));
  let root = real(dirname(dirname(here))); // <repo>/.flightwake/hooks → <repo>
  if (PLUGIN) {
    const start = [env.CLAUDE_PROJECT_DIR, input.cwd].find((p) => typeof p === 'string' && isAbs(p));
    if (!start) return;
    root = '';
    for (let d = real(start); ; d = dirname(d)) {
      if (existsSync(join(d, '.flightwake', 'STATE.md'))) { root = d; break; }
      if (dirname(d) === d) break;
    }
    if (!root) return;
    const registered = ['.claude/settings.json', '.claude/settings.local.json'].some((f) => {
      try { return readFileSync(join(root, f), 'utf8').includes('.flightwake/hooks/trap-check.mjs'); } catch { return false; }
    });
    if (registered) return; // the repo's own copy answers this call
  }
  if (!existsSync(join(root, '.flightwake', 'STATE.md'))) return;
  let text;
  try { text = readFileSync(join(root, TRAPS_REL), 'utf8'); } catch { return; }

  const core = await loadCore();
  const entries = core.parseTraps(text).filter((t) => core.isActive(t) && core.hasMatchers(t));
  if (!entries.length) return;

  const cwd = typeof input.cwd === 'string' && isAbs(input.cwd) ? real(input.cwd) : root;
  let hits = [];
  if (isFileTool) {
    const p = typeof ti.file_path === 'string' && ti.file_path ? ti.file_path : typeof ti.notebook_path === 'string' ? ti.notebook_path : '';
    if (!p) return;
    hits = core.matchFile(entries, root, realFile(isAbs(p) ? p : `${cwd}/${p}`));
  } else if (isPatch) {
    const patch = typeof ti.command === 'string' ? ti.command : typeof ti.patch === 'string' ? ti.patch : typeof ti.input === 'string' ? ti.input : '';
    if (!patch) return;
    hits = core.matchFiles(entries, root, cwd, core.patchPaths(patch).map((p) => (isAbs(p) ? realFile(p) : p)));
  } else {
    if (typeof ti.command !== 'string' || !ti.command) return;
    hits = core.matchBash(entries, root, cwd, ti.command);
  }
  if (!hits.length) return;

  const key = (h) => `${h.entry.name}@${h.entry.version}`;
  const rec = openRecord(env, root, input.session_id);
  const seen = rec ? (rec.data.repos[root] ?? {}) : {};
  const fresh = hits.filter((h) => !Object.hasOwn(seen, key(h)));
  const shown = fresh.slice(0, MAX_ENTRIES);
  if (!shown.length) return;
  const more = fresh.length - shown.length;

  if (rec) {
    const at = new Date().toISOString();
    const toolUseId = typeof input.tool_use_id === 'string' ? input.tool_use_id.slice(0, 128) : '';
    rec.data.repos[root] = { ...seen };
    for (const h of shown) rec.data.repos[root][key(h)] = { at, toolUseId };
    saveRecord(rec);
  }
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: render(shown, more) } }));
}

try { await main(); } catch { /* a failing trap check never touches the person's work */ }
process.exit(0);
