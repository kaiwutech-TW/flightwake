/**
 * `npx flightwake traps similar|stats|forget` — views of `.flightwake/TRAPS.md` that slow registry bloat, and the
 * clean-up of this repo's trip entries:
 * - similar: before /fw-trap writes an entry, score every existing entry against the new one (deterministic, local, no
 *   embeddings) so the writer picks update-in-place / supersede / record-new on purpose instead of adding a near-copy.
 *   The text comes from --text= or, without it, from stdin (a quoted heredoc: the shell runs nothing in it).
 * - stats: how many sessions tripped each active entry, from `<base>/trips/<sessionId>.json` (written by flightwake-mod's
 *   tripwire; base = fleetBase), so a compaction proposal starts from data. Only Claude Code sessions with the mod record trips.
 * - forget: remove this repo's key from every trip file of ours (`uninstall --purge` runs the same forgetTrips); `fleet
 *   --prune` deletes old trip files through pruneTrips. Both refuse a trip folder inside a repo and never follow links.
 * Zero dependencies: Node built-ins only. similar / stats never write.
 */
import { readdirSync, lstatSync, readFileSync, existsSync, writeFileSync, chmodSync, renameSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fleetBase, fleetDirInRepo, realish, isAbs, FILE_RE } from './fleet.mjs';

export const TRAPS_REL = '.flightwake/TRAPS.md';
const DAY_MS = 86400000;
const LANGS = ['en', 'zh-TW', 'zh-CN', 'ja'];

// ── TRAPS.md parser: MIRRORS mods/flightwake/hooks/lib/traps.ts parseTraps (+ parseFlatYaml / parseInlineList /
//    contentHash from hooks/lib/core.ts). Change both together. Adds `tags` and `discovered`, which the mod does not read.
const ENTRY_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n([\s\S]*?)(?=^---[ \t]*\r?\n[A-Za-z_][\w-]*:|(?![\s\S]))/gm;

/** `key: value` lines → record; `# comment` tails and surrounding quotes removed; nested/continuation lines ignored. */
export function parseFlatYaml(block) {
  const out = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = (m[2] ?? '').replace(/\s+#.*$/, '').trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
/** An inline YAML list (`[a, "b c", 'd']`) or a single scalar → items; empty input → []. */
export function parseInlineList(v) {
  if (!v) return [];
  const s = v.trim();
  const body = s.startsWith('[') && s.endsWith(']') ? s.slice(1, -1) : s;
  const items = [];
  const re = /\s*("([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|([^,]+))\s*(?:,|$)/g;
  let m;
  while ((m = re.exec(body)) !== null && m[0] !== '') {
    const item = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (item) items.push(item);
  }
  return items;
}
const contentHash = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};
/** Entries in file order. Missing `status` → active; missing/unknown `confidence` → unknown; `{{…}}` residue skipped. */
export function parseTraps(text) {
  const out = [];
  // Drop HTML comments first (the shipped header documents the format with example frontmatter-like lines); repeat
  // until nothing changes: one pass can join the text around a removed comment into a new `<!--`.
  let clean = text;
  for (let prev = ''; prev !== clean;) { prev = clean; clean = clean.replace(/<!--[\s\S]*?-->/g, ''); }
  ENTRY_RE.lastIndex = 0;
  let m;
  while ((m = ENTRY_RE.exec(clean)) !== null) {
    const fmText = m[1] ?? '';
    const body = (m[2] ?? '').trim();
    const fm = parseFlatYaml(fmText);
    const name = fm.name ?? '';
    if (!name) continue;
    if (/\{\{[^}\n]*\}\}/.test(fmText) || /\{\{[^}\n]*\}\}/.test(body)) continue;
    const conf = (fm.confidence ?? '').toLowerCase();
    out.push({
      name,
      status: (fm.status ?? 'active').toLowerCase() || 'active',
      confidence: conf === 'confirmed' || conf === 'probable' || conf === 'suspected' ? conf : 'unknown',
      type: fm.type ?? '',
      tags: parseInlineList(fm.tags),
      discovered: fm.discovered ?? '',
      paths: parseInlineList(fm.paths),
      commands: parseInlineList(fm.commands),
      labelled: body.split(/\r?\n/).filter((l) => /^\*\*[^*]+\*\*/.test(l.trim())).map((l) => l.trim()),
      body,
      version: contentHash(`${fmText}\n${body}`),
    });
  }
  return out;
}
export const isActive = (e) => e.status !== 'superseded';
export const hasMatchers = (e) => e.paths.length > 0 || e.commands.length > 0;

// ── Glob overlap: the compile rules MIRROR mods/flightwake/hooks/lib/glob.ts (`**` any segments, `*` within one,
//    `?` one char; no `/` = any depth; trailing `/` = everything under it). Two globs overlap when they are identical
//    after normalizing, or one of them matches the other's literal prefix (the text before its first `*` / `?`; a
//    glob without wildcards is its own prefix). An empty literal prefix (`**`, `*.sql`) is never tested, and a catch-all
//    glob (only `*` and `/`: `**`, `*`, `**/*`) overlaps only an identical one, so it does not overlap everything.
//    Deliberately coarse: a hint for a human choice, not a proof.
const normGlob = (g) => { let p = g.trim().replace(/^\.\//, '').replace(/^\/+/, ''); if (p.endsWith('/')) p += '**'; return p; };
function globRe(pattern) {
  const p = normGlob(pattern);
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        if (p[i + 2] === '/') { re += '(?:[^/]+/)*'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(!p.includes('/') ? `^(?:.*/)?${re}$` : `^${re}$`);
}
const literalPrefix = (g) => { const p = normGlob(g); const i = p.search(/[*?]/); return i < 0 ? p : p.slice(0, i); };
const isCatchAll = (p) => /^[*/]+$/.test(p);
export function globsOverlap(a, b) {
  const na = normGlob(a), nb = normGlob(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (isCatchAll(na) || isCatchAll(nb)) return false;
  const pa = literalPrefix(a), pb = literalPrefix(b);
  return (pb !== '' && globRe(a).test(pb)) || (pa !== '' && globRe(b).test(pa));
}
/** Commands overlap when one is a word-by-word prefix of the other (the tripwire's own matching rule). */
const words = (c) => c.trim().split(/\s+/).filter(Boolean);
export function commandsOverlap(a, b) {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.every((t, i) => l[i] === t);
}

// ── Text tokens: Latin-script words (lowercased; dotted versions like 3.11 kept whole) and CJK character bigrams.
//    Bold labels (`**症狀**:` / `**Symptom**:`) are dropped before tokenizing; a short stopword list removes glue words.
//    Everything else is weighted by IDF over the registry itself, so words every entry uses (flightwake, claude, mod…)
//    count for little and rare ones (tomllib, wrangler…) for a lot.
const STOP = new Set(`a an and are as at be been but by can could did do does done for from had has have how if in into is
it its just may might more most no not of on once only or our out so such than that the their them then there these
they this those to too up use used uses using via was we were what when where which while who why will with would you
your yet also any all each every same other another one two first after before again still even like via per see e g
i.e eg etc md`.split(/\s+/).filter(Boolean));
const CJK_STOP = new Set(['這個', '一個', '沒有', '不是', '可以', '時候', '就是', '什麼', '還是', '所以', '因為', '如果', '但是', '已經',
  '这个', '一个', '没有', '时候', '什么', '还是', '因为', '但是', '已经', 'する', 'して', 'した', 'ない', 'ある', 'いる', 'こと', 'もの', 'これ', 'それ']);
const CJK_RUN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
export function textTokens(text) {
  const out = new Set();
  const s = String(text ?? '').split(/\r?\n/).map((l) => l.trim().replace(/^\*\*[^*]+\*\*\s*[::]?\s*/, '')).join('\n');
  for (const w of s.toLowerCase().match(/\d+(?:\.\d+)+|[a-z][a-z0-9]*|\d+/g) ?? []) {
    if (w.length < 2 || STOP.has(w) || /^\d{1,2}$/.test(w)) continue;
    out.add(w);
  }
  for (const run of s.match(CJK_RUN) ?? []) {
    for (let i = 0; i + 1 < run.length; i++) { const bg = run.slice(i, i + 2); if (!CJK_STOP.has(bg)) out.add(bg); }
  }
  return out;
}
/** Name tokens: split on `-` / `_` and on letter↔digit boundaries (python311 → python, 311). */
export const nameTokens = (name) => new Set(String(name).toLowerCase().split(/[-_\s]+/)
  .flatMap((t) => t.match(/[a-z]+|\d+/g) ?? []).filter(Boolean));
const lower = (xs) => xs.map((x) => String(x).trim().toLowerCase()).filter(Boolean);

/** IDF over the entries for one field: ln(1 + N / (1 + df)); a token no entry has gets the maximum. */
function idfOf(docs) {
  const df = new Map();
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  return (t) => Math.log(1 + n / (1 + (df.get(t) ?? 0)));
}
const wsum = (xs, idf) => [...xs].reduce((s, t) => s + idf(t), 0);

// Weights of the signals and the candidate threshold. The text signal weighs double because it carries the root cause.
// A signal the query does not give is left out of the average; paths / commands are also left out when the entry has
// none (an unanchored old entry must still be findable). Threshold: see SIMILAR_THRESHOLD's note.
const W = { name: 1, tags: 1, paths: 1, commands: 1, text: 2 };
/**
 * Calibrated on this repo's real registry (33 entries, 2026-10-26) by querying every entry with its own name, tags,
 * paths, commands and symptom + root-cause lines against all the others (1,056 directed pairs): the known duplicate
 * pair scores 0.79 (smoke-needs-python-311 → smoke-needs-python311-tomllib) and 0.55 the other way; the highest
 * unrelated pair is 0.37 (the mods/** cluster: broad shared globs + the common claude-code/mods tags), and no
 * unrelated pair reaches 0.40. 0.40 = the lowest value with zero false hits there, so looser duplicates than that
 * near-copy still surface; the test fixture in test/smoke.sh pins both sides.
 */
export const SIMILAR_THRESHOLD = 0.4;
export const MAX_CANDIDATES = 5;

/**
 * Score every entry against the query { name, tags, paths, commands, text }. Returns all scored entries (score 0–1,
 * sameName, reasons), not yet filtered. Pure and deterministic.
 */
export function scoreAll(entries, q) {
  const nameDocs = entries.map((e) => nameTokens(e.name));
  const tagDocs = entries.map((e) => new Set(lower(e.tags)));
  const textDocs = entries.map((e) => textTokens(e.body));
  const idfName = idfOf(nameDocs), idfTag = idfOf(tagDocs), idfText = idfOf(textDocs);
  const qName = nameTokens(q.name);
  const qTags = new Set(lower(q.tags ?? []));
  const qText = textTokens(q.text ?? '');
  const qPaths = (q.paths ?? []).filter((p) => p.trim());
  const qCmds = (q.commands ?? []).filter((c) => c.trim());
  return entries.map((e, i) => {
    const sameName = e.name.trim().toLowerCase() === String(q.name).trim().toLowerCase();
    const parts = [];
    const reasons = { name: [], tags: [], paths: [], commands: [], words: [] };
    // name: IDF-weighted Jaccard of the name tokens
    const nShared = [...qName].filter((t) => nameDocs[i].has(t));
    const nUnion = new Set([...qName, ...nameDocs[i]]);
    const nameSim = sameName ? 1 : (nUnion.size ? wsum(nShared, idfName) / wsum(nUnion, idfName) : 0);
    parts.push([W.name, nameSim]);
    if (!sameName) reasons.name = nShared;
    // tags: share of the query's tag weight the entry also carries
    if (qTags.size) {
      const shared = [...qTags].filter((t) => tagDocs[i].has(t));
      parts.push([W.tags, wsum(shared, idfTag) / wsum(qTags, idfTag)]);
      reasons.tags = shared;
    }
    if (qPaths.length && e.paths.length) {
      const hits = [];
      for (const p of qPaths) { const o = e.paths.find((x) => globsOverlap(p, x)); if (o !== undefined) hits.push(p === o ? p : `${p} ~ ${o}`); }
      parts.push([W.paths, hits.length / qPaths.length]);
      reasons.paths = hits;
    }
    if (qCmds.length && e.commands.length) {
      const hits = [];
      for (const c of qCmds) { const o = e.commands.find((x) => commandsOverlap(c, x)); if (o !== undefined) hits.push(c === o ? c : `${c} ~ ${o}`); }
      parts.push([W.commands, hits.length / qCmds.length]);
      reasons.commands = hits;
    }
    // text: share of the query's word weight found in the entry's body (containment, not Jaccard: the query is short)
    if (qText.size) {
      const shared = [...qText].filter((t) => textDocs[i].has(t));
      parts.push([W.text, wsum(shared, idfText) / wsum(qText, idfText)]);
      reasons.words = shared.sort((a, b) => idfText(b) - idfText(a) || (a < b ? -1 : 1)).slice(0, 8);
    }
    const wTotal = parts.reduce((s, [w]) => s + w, 0);
    const score = wTotal ? parts.reduce((s, [w, v]) => s + w * v, 0) / wTotal : 0;
    return { entry: e, score: Math.round(score * 1000) / 1000, sameName, reasons };
  });
}
/**
 * Candidates: same name always, others at or above the threshold; active first, same name first, then score. At most
 * `max`, but a same-name entry is never cut (a superseded one sorts after the active candidates): it takes the slot of
 * the lowest-ranked other candidate, so the writer always learns the name is taken.
 */
export function findSimilar(entries, q, { threshold = SIMILAR_THRESHOLD, max = MAX_CANDIDATES } = {}) {
  const order = (a, b) => (isActive(b.entry) - isActive(a.entry)) || (b.sameName - a.sameName) || (b.score - a.score) || (a.entry.name < b.entry.name ? -1 : 1);
  const all = scoreAll(entries, q).filter((r) => r.sameName || r.score >= threshold).sort(order);
  const same = all.filter((r) => r.sameName);
  const others = all.filter((r) => !r.sameName).slice(0, Math.max(0, max - same.length));
  return [...same, ...others].sort(order);
}

// ── Trip files: `<base>/trips/<sessionId>.json` (contract with the mod's tripwire; base = fleetBase):
//    v2 = { v: 2, sessionId, updated, trips: { <absolute repo root>: { <trap name>: <ISO time of its first match in that
//    session> } } } — a trap counts at most once per session per repo, and only Edit/Write paths and Bash command
//    prefixes count. v1 (the first mod build) = { v: 1, sessionId, repo, updated, trips: { <name>: { n, first, last } } },
//    read as one session of `repo` (time = first, else last). A file is OURS only when it is valid JSON, v 1 or 2, and
//    its sessionId equals the file name; anything else is skipped silently and never touched. Only regular files whose
//    name matches FILE_RE, directly in a real (not linked) folder. Names are kept in Maps (`__proto__` is a valid name).
const LIVE_WRITER_MS = 120000; // fleet.mjs's rule: never delete or rewrite a file modified this recently by a writer
export const tripsDir = (env) => { const b = fleetBase(env); return b === null ? null : `${b}/trips`; };
const isIso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
/** A trip file's text → { v, sessionId, updated, repos: Map<repo, Map<name, iso>>, rec } when it is ours (see above), else null. */
export function parseTripText(text, id) {
  let rec;
  try { rec = JSON.parse(text); } catch { return null; }
  if (!isObj(rec) || (rec.v !== 1 && rec.v !== 2) || typeof rec.sessionId !== 'string' || rec.sessionId !== id || !isObj(rec.trips)) return null;
  const repos = new Map();
  if (rec.v === 1) {
    if (typeof rec.repo !== 'string' || !isAbs(rec.repo)) return null;
    const m = new Map();
    for (const [name, t] of Object.entries(rec.trips)) {
      if (!isObj(t)) continue;
      const at = isIso(t.first) ? t.first : isIso(t.last) ? t.last : null;
      if (at !== null) m.set(name, at);
    }
    repos.set(rec.repo, m);
  } else {
    for (const [repo, names] of Object.entries(rec.trips)) {
      if (!isAbs(repo) || !isObj(names)) continue;
      const m = new Map();
      for (const [name, at] of Object.entries(names)) if (isIso(at)) m.set(name, at);
      repos.set(repo, m);
    }
  }
  return { v: rec.v, sessionId: rec.sessionId, updated: isIso(rec.updated) ? rec.updated : null, repos, rec };
}
/** The direct regular files of a real folder whose name matches FILE_RE: [{ name, id, path, mtimeMs }]; link / missing → []. */
function tripListing(dir) {
  if (!dir) return [];
  try { const st = lstatSync(dir); if (!st.isDirectory() || st.isSymbolicLink()) return []; } catch { return []; }
  let names = [];
  try { names = readdirSync(dir).sort(); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (!FILE_RE.test(name)) continue;
    const p = `${dir}/${name}`;
    try { const st = lstatSync(p); if (!st.isFile() || st.isSymbolicLink()) continue; out.push({ name, id: name.slice(0, -5), path: p, mtimeMs: st.mtimeMs }); } catch {}
  }
  return out;
}
const readOurs = (f) => { try { return parseTripText(readFileSync(f.path, 'utf8'), f.id); } catch { return null; } };
/** The repo keys of a parsed file that are this repo (real path on both sides: a link or a trailing `/` still matches). */
const keysFor = (t, want) => [...t.repos.keys()].filter((k) => realish(k) === want);
/**
 * This repo's sessions: [{ name, path, sessionId, trips: Map<name, iso> }] — one per file that has this repo's key(s)
 * (several keys spelling this repo are merged; the earliest time per name wins).
 */
export function tripFilesFor(dir, repoRoot) {
  const want = realish(repoRoot);
  const out = [];
  for (const f of tripListing(dir)) {
    const t = readOurs(f);
    if (t === null) continue;
    const keys = keysFor(t, want);
    if (!keys.length) continue;
    const trips = new Map();
    for (const k of keys) for (const [name, at] of t.repos.get(k)) if (!trips.has(name) || Date.parse(at) < Date.parse(trips.get(name))) trips.set(name, at);
    out.push({ name: f.name, path: f.path, sessionId: t.sessionId, trips });
  }
  return out;
}
const isLinkPath = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
/**
 * Whether the trip folder may be changed at all (forget, uninstall --purge, fleet --prune): 'no-home' (no base),
 * 'link' (the base or the folder is a symbolic link — never followed), 'in-repo' (fleet.mjs fleetDirInRepo: inside
 * `cwd`, a records folder or any repo — the mod never writes there, so nothing there is ours to delete), 'missing', 'ok'.
 */
export function tripsDirState(base, cwd) {
  if (base === null) return 'no-home';
  const dir = `${base}/trips`;
  try { lstatSync(dir); } catch { return 'missing'; }
  if (isLinkPath(base) || isLinkPath(dir)) return 'link';
  if (fleetDirInRepo(cwd, base, 'trips')) return 'in-repo';
  try { if (!lstatSync(dir).isDirectory()) return 'missing'; } catch { return 'missing'; }
  return 'ok';
}
/** Write `text` over `path` through a temp file + rename in the same folder, keeping the file's mode (never wider). */
function replaceFile(path, text, mode) {
  const tmp = `${dirname(path)}/.${basename(path)}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text, { flag: 'wx', mode });
    chmodSync(tmp, mode);
    renameSync(tmp, path);
  } catch (e) { try { rmSync(tmp, { force: true }); } catch {} throw e; }
}

/**
 * Remove this repo's entries from every trip file of ours: a file left with no repo is deleted, any other is rewritten
 * without this repo's key(s) (other repos' entries kept). Prints its lines with `log` (who = the command, for the
 * refusal line; nothing is printed when there is nothing to change) and returns { state, dir, files, removed, rewritten }. dry = say what would change and change nothing.
 */
export function forgetTrips({ base, cwd, dry = false, log, M, who = 'traps forget' }) {
  const dir = base === null ? null : `${base}/trips`;
  const state = tripsDirState(base, cwd);
  const res = { state, dir, files: 0, removed: 0, rewritten: 0 };
  if (state === 'in-repo') { log(M(T.forgetInRepo(who, dir))); return res; }
  if (state === 'link') { log(M(T.forgetLink(who, dir))); return res; }
  if (state !== 'ok') return res;
  const want = realish(cwd);
  for (const f of tripListing(dir)) {
    let text, st;
    try { st = lstatSync(f.path); if (!st.isFile() || st.isSymbolicLink()) continue; text = readFileSync(f.path, 'utf8'); } catch { continue; }
    const t = parseTripText(text, f.id);
    if (t === null) continue;
    const keys = keysFor(t, want);
    if (!keys.length) continue;
    res.files++;
    const rest = t.v === 1 ? [] : [...t.repos.keys()].filter((k) => !keys.includes(k));
    // a v2 file can also hold keys we could not read (not absolute / not an object): they are kept as they are
    const others = t.v === 1 ? [] : Object.keys(t.rec.trips).filter((k) => !keys.includes(k));
    const drop = rest.length === 0 && others.length === 0;
    if (dry) { log(M(drop ? T.fWouldRemove(f.name) : T.fWouldRewrite(f.name))); drop ? res.removed++ : res.rewritten++; continue; }
    try {
      // re-checked right before the change: still the same regular file (not a link, not rewritten meanwhile)
      const now = lstatSync(f.path);
      if (!now.isFile() || now.isSymbolicLink() || now.mtimeMs !== st.mtimeMs) continue;
      if (drop) { rmSync(f.path); res.removed++; log(M(T.fRemoved(f.name))); continue; }
      const out = JSON.parse(text);
      for (const k of keys) delete out.trips[k];
      replaceFile(f.path, `${JSON.stringify(out, null, 2)}\n`, st.mode & 0o777);
      res.rewritten++;
      log(M(T.fRewrote(f.name)));
    } catch {}
  }
  if (res.files) log(M(T.forgetDone(res, dry)));
  return res;
}

const parses = (text) => { try { JSON.parse(text); return true; } catch { return false; } };
/** Our torn write: text that starts like a trip file of this session (the mod writes `v` then `sessionId`). */
const tornOurs = (text, id) => new RegExp(`^\\s*\\{\\s*"v"\\s*:\\s*[12]\\s*,\\s*"sessionId"\\s*:\\s*"${id.replace(/[.]/g, '\\.')}"`).test(text);
/**
 * fleet --prune's part for trip files: files of ours whose `updated` (else mtime) is older than `days`, and a torn
 * write of ours by mtime; never a file modified in the last 120 s, never a link, never another tool's file, never the
 * folder. The refusal (folder inside a repo) is checked by the caller with the sessions folder; a linked base or
 * folder is skipped here. Prints nothing when there is no trip folder.
 */
export function pruneTrips({ base, now = Date.now(), days, dry = false, log, M }) {
  const dir = `${base}/trips`;
  if (isLinkPath(base) || isLinkPath(dir)) { log(M(T.pruneTripsLink(dir))); return 0; }
  const files = tripListing(dir);
  try { if (!lstatSync(dir).isDirectory()) return 0; } catch { return 0; }
  const cutoff = now - days * DAY_MS;
  const isLive = (m) => m > now - LIVE_WRITER_MS || m > Date.now() - LIVE_WRITER_MS;
  let n = 0;
  for (const f of files) {
    if (isLive(f.mtimeMs)) continue;
    let text;
    try { text = readFileSync(f.path, 'utf8'); } catch { continue; }
    const t = parseTripText(text, f.id);
    let del;
    if (t !== null) del = (t.updated !== null ? Date.parse(t.updated) : f.mtimeMs) < cutoff;
    else del = f.mtimeMs < cutoff && tornOurs(text, f.id) && !parses(text);
    if (!del) continue;
    if (dry) { log(M(T.pWouldRemove(f.name))); n++; continue; }
    try {
      const st = lstatSync(f.path);
      if (!st.isFile() || st.isSymbolicLink() || isLive(st.mtimeMs)) continue;
      rmSync(f.path);
      log(M(T.pRemoved(f.name)));
      n++;
    } catch {}
  }
  log(M(T.prunedTrips(n, files.length, days, dir, dry)));
  return 0;
}

// ── strings ──
const T = {
  usage: {
    en: "usage: npx flightwake traps similar --name='<slug>' [--tags='a,b'] [--paths='g1,g2'] [--commands='git push,npm publish'] [--json] <<'EOF'\n         <symptom + root cause>\n       EOF\n       (the text comes from stdin when --text= is not given; single quotes / a quoted heredoc keep the shell from running backticks and $(…) in it)\n       npx flightwake traps stats [--json] [--days=N]\n       npx flightwake traps forget [--dry-run]   remove this repo's entries from <base>/trips (other repos' entries kept)\n  Run at the repo root; similar / stats read .flightwake/TRAPS.md and write nothing.",
    'zh-TW': "用法:npx flightwake traps similar --name='<slug>' [--tags='a,b'] [--paths='g1,g2'] [--commands='git push,npm publish'] [--json] <<'EOF'\n        <症狀 + 根因>\n      EOF\n      (沒給 --text= 時從 stdin 讀內文;單引號 / 加引號的 heredoc 讓 shell 不會執行內文裡的反引號與 $(…))\n      npx flightwake traps stats [--json] [--days=N]\n      npx flightwake traps forget [--dry-run]   從 <base>/trips 移除本 repo 的紀錄(其他 repo 的不動)\n  在 repo 根目錄執行;similar / stats 讀 .flightwake/TRAPS.md,什麼都不寫。",
    'zh-CN': "用法:npx flightwake traps similar --name='<slug>' [--tags='a,b'] [--paths='g1,g2'] [--commands='git push,npm publish'] [--json] <<'EOF'\n        <症状 + 根因>\n      EOF\n      (没给 --text= 时从 stdin 读正文;单引号 / 加引号的 heredoc 让 shell 不会执行正文里的反引号与 $(…))\n      npx flightwake traps stats [--json] [--days=N]\n      npx flightwake traps forget [--dry-run]   从 <base>/trips 移除本 repo 的记录(其他 repo 的不动)\n  在 repo 根目录执行;similar / stats 读 .flightwake/TRAPS.md,什么都不写。",
    ja: "使い方:npx flightwake traps similar --name='<slug>' [--tags='a,b'] [--paths='g1,g2'] [--commands='git push,npm publish'] [--json] <<'EOF'\n          <症状 + 根本原因>\n        EOF\n        (--text= がなければ本文は stdin から読む。シングルクォートと引用符付き heredoc なら、本文中のバッククォートや $(…) をシェルが実行しない)\n        npx flightwake traps stats [--json] [--days=N]\n        npx flightwake traps forget [--dry-run]   <base>/trips からこの repo の記録を削除(他の repo の記録はそのまま)\n  repo のルートで実行。similar / stats は .flightwake/TRAPS.md を読むだけで何も書かない。",
  },
  badFlag: (f, sub) => ({
    en: `⚠️  traps ${sub}: flag not recognized: ${f}`,
    'zh-TW': `⚠️  traps ${sub}:不認得的旗標 ${f}`,
    'zh-CN': `⚠️  traps ${sub}:不认得的旗标 ${f}`,
    ja: `⚠️  traps ${sub}:認識できないフラグ ${f}`,
  }),
  needName: {
    en: '⚠️  traps similar: --name=<slug> is required (the kebab-case name the new entry would get)',
    'zh-TW': '⚠️  traps similar:必須給 --name=<slug>(新條目打算用的 kebab-case 名稱)',
    'zh-CN': '⚠️  traps similar:必须给 --name=<slug>(新条目打算用的 kebab-case 名称)',
    ja: '⚠️  traps similar:--name=<slug> が必要(新しい項目に付ける kebab-case の名前)',
  },
  badDays: (v) => ({
    en: `⚠️  traps stats: --days must be a whole number ≥ 1 (got: ${v})`,
    'zh-TW': `⚠️  traps stats:--days 必須是 ≥ 1 的整數(收到:${v})`,
    'zh-CN': `⚠️  traps stats:--days 必须是 ≥ 1 的整数(收到:${v})`,
    ja: `⚠️  traps stats:--days は 1 以上の整数(指定値:${v})`,
  }),
  noTraps: (p) => ({
    en: `⚠️  traps: ${p} not found — run this at the root of a repo with flightwake installed (npx flightwake init)`,
    'zh-TW': `⚠️  traps:找不到 ${p}——請在裝了 flightwake 的 repo 根目錄執行(npx flightwake init)`,
    'zh-CN': `⚠️  traps:找不到 ${p}——请在装了 flightwake 的 repo 根目录执行(npx flightwake init)`,
    ja: `⚠️  traps:${p} が見つかりません——flightwake をインストールした repo のルートで実行してください(npx flightwake init)`,
  }),
  simHead: (n, name, thr, checked) => ({
    en: `flightwake traps similar — ${n} candidate(s) for "${name}" (score ≥ ${thr} or same name; ${checked} entries checked)`,
    'zh-TW': `flightwake traps similar — 「${name}」有 ${n} 個相似候選(分數 ≥ ${thr} 或同名;共比對 ${checked} 條)`,
    'zh-CN': `flightwake traps similar — 「${name}」有 ${n} 个相似候选(分数 ≥ ${thr} 或同名;共比对 ${checked} 条)`,
    ja: `flightwake traps similar — 「${name}」に似た候補 ${n} 件(スコア ≥ ${thr} または同名。${checked} 項目と比較)`,
  }),
  simNone: (name, thr, checked) => ({
    en: `flightwake traps similar — no similar entry for "${name}" (score ≥ ${thr}; ${checked} entries checked). Record it as a new entry.`,
    'zh-TW': `flightwake traps similar — 「${name}」沒有相似條目(分數 ≥ ${thr};共比對 ${checked} 條)。照常登記新條目。`,
    'zh-CN': `flightwake traps similar — 「${name}」没有相似条目(分数 ≥ ${thr};共比对 ${checked} 条)。照常登记新条目。`,
    ja: `flightwake traps similar — 「${name}」に似た項目はありません(スコア ≥ ${thr}。${checked} 項目と比較)。新しい項目として記録してください。`,
  }),
  sameName: { en: 'same name (a new entry would need another name)', 'zh-TW': '同名(若另立新條目要換名稱)', 'zh-CN': '同名(若另立新条目要换名称)', ja: '同名(新しい項目にするなら別の名前が必要)' },
  superseded: { en: 'superseded — history only', 'zh-TW': 'superseded——只是歷史', 'zh-CN': 'superseded——只是历史', ja: 'superseded——履歴のみ' },
  rs: {
    name: { en: 'name', 'zh-TW': '名稱', 'zh-CN': '名称', ja: '名前' },
    tags: { en: 'tags', 'zh-TW': '標籤', 'zh-CN': '标签', ja: 'タグ' },
    paths: { en: 'paths', 'zh-TW': '路徑', 'zh-CN': '路径', ja: 'パス' },
    commands: { en: 'commands', 'zh-TW': '指令', 'zh-CN': '命令', ja: 'コマンド' },
    words: { en: 'words', 'zh-TW': '字詞', 'zh-CN': '字词', ja: '語' },
  },
  choose: {
    en: 'Before writing, choose one (fw-trap):\n  (a) update the existing entry in place — same root cause: more evidence, a confidence upgrade, wider paths/commands\n  (b) supersede it — the root cause changed: set the old entry\'s status: superseded and point its body at the new [[name]]\n  (c) record a new entry anyway — a different root cause: write one line saying why it is not the same as the candidates above',
    'zh-TW': '寫入前先選一個(fw-trap):\n  (a) 就地更新既有條目——同一個根因:補佐證、升級把握度、補 paths/commands\n  (b) supersede——根因換了:舊條目 status 改 superseded,內文指向新的 [[名稱]]\n  (c) 仍另立新條目——根因不同:用一行寫出為什麼跟上面的候選不是同一件事',
    'zh-CN': '写入前先选一个(fw-trap):\n  (a) 就地更新既有条目——同一个根因:补佐证、升级把握度、补 paths/commands\n  (b) supersede——根因换了:旧条目 status 改 superseded,正文指向新的 [[名称]]\n  (c) 仍另立新条目——根因不同:用一行写出为什么跟上面的候选不是同一件事',
    ja: '書く前にどれか 1 つを選ぶ(fw-trap):\n  (a) 既存項目をその場で更新——根本原因が同じ:根拠の追加、確度の引き上げ、paths/commands の追加\n  (b) supersede——根本原因が変わった:古い項目の status を superseded にし、本文で新しい [[名前]] を指す\n  (c) それでも新しい項目を記録——根本原因が違う:上の候補と同じでない理由を 1 行で書く',
  },
  statsHead: (file, n) => ({
    en: `flightwake traps stats — ${file} · ${n} active entr${n === 1 ? 'y' : 'ies'}`,
    'zh-TW': `flightwake traps stats — ${file} · ${n} 條 active`,
    'zh-CN': `flightwake traps stats — ${file} · ${n} 条 active`,
    ja: `flightwake traps stats — ${file} · active ${n} 項目`,
  }),
  col: {
    name: { en: 'name', 'zh-TW': '名稱', 'zh-CN': '名称', ja: '名前' },
    conf: { en: 'confidence', 'zh-TW': '把握度', 'zh-CN': '把握度', ja: '確度' },
    disc: { en: 'discovered', 'zh-TW': '發現日', 'zh-CN': '发现日', ja: '発見日' },
    anchor: { en: 'anchor', 'zh-TW': '錨點', 'zh-CN': '锚点', ja: 'アンカー' },
    sessions: { en: 'sessions', 'zh-TW': 'session 數', 'zh-CN': 'session 数', ja: 'セッション' },
    last: { en: 'last trip', 'zh-TW': '最後觸發', 'zh-CN': '最后触发', ja: '最終発火' },
  },
  summary: (c, days) => {
    const nt = c.anchoredNeverTripped;
    return {
      en: `Summary: ${c.active} active · ${c.anchored} anchored · ${c.unanchored} unanchored${nt === null ? '' : ` · ${nt} anchored but ${days ? `not tripped in the last ${days} day(s)` : 'never tripped'}`}`,
      'zh-TW': `摘要:${c.active} 條 active · ${c.anchored} 條有錨點 · ${c.unanchored} 條無錨點${nt === null ? '' : ` · ${nt} 條有錨點但${days ? `近 ${days} 天沒觸發` : '從未觸發'}`}`,
      'zh-CN': `摘要:${c.active} 条 active · ${c.anchored} 条有锚点 · ${c.unanchored} 条无锚点${nt === null ? '' : ` · ${nt} 条有锚点但${days ? `近 ${days} 天没触发` : '从未触发'}`}`,
      ja: `概要:active ${c.active} · アンカーあり ${c.anchored} · アンカーなし ${c.unanchored}${nt === null ? '' : ` · アンカーありで${days ? `直近 ${days} 日に発火なし` : '一度も発火なし'} ${nt}`}`,
    };
  },
  range: (s, from, to, days) => ({
    en: `Trip data: ${s} session(s), ${from} → ${to}${days ? ` (last ${days} day(s))` : ''} — "never tripped" means within this range only`,
    'zh-TW': `觸發資料:${s} 個 session,${from} → ${to}${days ? `(近 ${days} 天)` : ''}——「從未觸發」只指這段期間`,
    'zh-CN': `触发数据:${s} 个 session,${from} → ${to}${days ? `(近 ${days} 天)` : ''}——「从未触发」只指这段期间`,
    ja: `発火データ:${s} セッション、${from} → ${to}${days ? `(直近 ${days} 日)` : ''}——「一度も発火なし」はこの期間内だけの話`,
  }),
  rangeEmpty: (s, days) => ({
    en: `Trip data: ${s} session file(s) for this repo, but no trip${days ? ` in the last ${days} day(s)` : ' in them'}`,
    'zh-TW': `觸發資料:本 repo 有 ${s} 個 session 檔,但${days ? `近 ${days} 天` : '裡面'}沒有任何觸發`,
    'zh-CN': `触发数据:本 repo 有 ${s} 个 session 文件,但${days ? `近 ${days} 天` : '里面'}没有任何触发`,
    ja: `発火データ:この repo のセッションファイルは ${s} 件あるが、${days ? `直近 ${days} 日の` : 'その中に'}発火はなし`,
  }),
  noData: (dir) => ({
    en: `No trip data for this repo${dir ? ` (${dir})` : ''} — the mod is not installed here, or nothing has been recorded yet. Showing only the anchored / unanchored split; nothing is claimed about which entries are used.`,
    'zh-TW': `本 repo 沒有觸發資料${dir ? `(${dir})` : ''}——這裡沒裝 mod,或還沒記到任何東西。只列有無錨點;不對哪條有沒有用下任何結論。`,
    'zh-CN': `本 repo 没有触发数据${dir ? `(${dir})` : ''}——这里没装 mod,或还没记到任何东西。只列有无锚点;不对哪条有没有用下任何结论。`,
    ja: `この repo の発火データはありません${dir ? `(${dir})` : ''}——ここに mod が入っていないか、まだ何も記録されていない。アンカーの有無だけを示し、どの項目が使われているかについては何も主張しない。`,
  }),
  noteSource: {
    en: '  · sessions = how many sessions tripped the entry (once per session, whatever the repeats); only Edit/Write paths and Bash command prefixes count — read-only shell mentions do not. Trip data comes only from Claude Code sessions with the flightwake mod installed and its tripwire on; Codex / Gemini sessions never record trips.',
    'zh-TW': '  · session 數 = 有幾個 session 觸發過這條(同一個 session 重複觸發只算一次);只有 Edit/Write 的路徑與 Bash 指令前綴算數——唯讀的 shell 提及不算。觸發資料只來自裝了 flightwake mod 且絆線開著的 Claude Code session;Codex / Gemini 的 session 永遠不會記錄觸發。',
    'zh-CN': '  · session 数 = 有几个 session 触发过这条(同一个 session 重复触发只算一次);只有 Edit/Write 的路径与 Bash 命令前缀算数——只读的 shell 提及不算。触发数据只来自装了 flightwake mod 且绊线开着的 Claude Code session;Codex / Gemini 的 session 永远不会记录触发。',
    ja: '  · セッション = その項目を発火させたセッションの数(同じセッション内の繰り返しは 1 回)。数えるのは Edit/Write のパスと Bash コマンドの前方一致だけ——読み取りだけのシェルでの言及は数えない。発火データは flightwake mod を入れて検知線をオンにした Claude Code セッションからだけ来る。Codex / Gemini のセッションは発火を記録しない。',
  },
  noteUnanchored: {
    en: '  · An unanchored entry (no paths / commands) can never trip by design — it is not counted as unused; add an anchor if it belongs to a place.',
    'zh-TW': '  · 無錨點的條目(沒有 paths / commands)設計上永遠不會觸發——不算「沒用」;若它其實綁在某個位置,補上錨點。',
    'zh-CN': '  · 无锚点的条目(没有 paths / commands)设计上永远不会触发——不算「没用」;若它其实绑在某个位置,补上锚点。',
    ja: '  · アンカーのない項目(paths / commands なし)は設計上発火しない——「使われていない」には数えない。特定の場所に結びつくならアンカーを足す。',
  },
  forgetInRepo: (who, dir) => ({
    en: `⚠️  ${who}: ${dir} lies inside a repo or a flightwake records folder — the mod never writes there, so nothing there is ours; trip entries untouched`,
    'zh-TW': `⚠️  ${who}:${dir} 在某個 repo 或 flightwake 紀錄資料夾裡——mod 從不寫那裡,那裡沒有我們的檔;觸發紀錄沒動`,
    'zh-CN': `⚠️  ${who}:${dir} 在某个 repo 或 flightwake 记录文件夹里——mod 从不写那里,那里没有我们的文件;触发记录没动`,
    ja: `⚠️  ${who}:${dir} はリポジトリか flightwake の記録フォルダの中にある——mod はそこに書かないので、そこに私たちのファイルはない。発火記録はそのまま`,
  }),
  forgetLink: (who, dir) => ({
    en: `⚠️  ${who}: ${dir} (or the folder holding it) is a symbolic link — never followed; trip entries untouched`,
    'zh-TW': `⚠️  ${who}:${dir}(或它所在的資料夾)是符號連結——不跟隨;觸發紀錄沒動`,
    'zh-CN': `⚠️  ${who}:${dir}(或它所在的文件夹)是符号链接——不跟随;触发记录没动`,
    ja: `⚠️  ${who}:${dir}(またはその親フォルダ)はシンボリックリンク——たどらない。発火記録はそのまま`,
  }),
  fRemoved: (n) => ({ en: `  removed  ${n}`, 'zh-TW': `  已刪除  ${n}`, 'zh-CN': `  已删除  ${n}`, ja: `  削除  ${n}` }),
  fWouldRemove: (n) => ({ en: `  would remove  ${n}`, 'zh-TW': `  將刪除  ${n}`, 'zh-CN': `  将删除  ${n}`, ja: `  削除予定  ${n}` }),
  fRewrote: (n) => ({
    en: `  rewrote  ${n} (other repos' entries kept)`, 'zh-TW': `  已改寫  ${n}(其他 repo 的紀錄保留)`,
    'zh-CN': `  已改写  ${n}(其他 repo 的记录保留)`, ja: `  書き換え  ${n}(他の repo の記録は残す)`,
  }),
  fWouldRewrite: (n) => ({
    en: `  would rewrite  ${n} (other repos' entries kept)`, 'zh-TW': `  將改寫  ${n}(其他 repo 的紀錄保留)`,
    'zh-CN': `  将改写  ${n}(其他 repo 的记录保留)`, ja: `  書き換え予定  ${n}(他の repo の記録は残す)`,
  }),
  forgetDone: (r, dry) => ({
    en: `${dry ? 'would forget' : 'forgot'} this repo's trip entries in ${r.files} file(s) of ${r.dir}: ${r.removed} ${dry ? 'to remove' : 'removed'}, ${r.rewritten} ${dry ? 'to rewrite' : 'rewritten'}${dry ? ' (dry run — nothing changed)' : ''}; other repos' entries kept`,
    'zh-TW': `${dry ? '將清除' : '已清除'} ${r.dir} 裡 ${r.files} 個檔中本 repo 的觸發紀錄:刪 ${r.removed} 個、改寫 ${r.rewritten} 個${dry ? '(試跑——什麼都沒改)' : ''};其他 repo 的紀錄保留`,
    'zh-CN': `${dry ? '将清除' : '已清除'} ${r.dir} 里 ${r.files} 个文件中本 repo 的触发记录:删 ${r.removed} 个、改写 ${r.rewritten} 个${dry ? '(试跑——什么都没改)' : ''};其他 repo 的记录保留`,
    ja: `${r.dir} の ${r.files} ファイルにあるこの repo の発火記録を${dry ? '消去予定' : '消去'}:削除 ${r.removed}、書き換え ${r.rewritten}${dry ? '(試行——何も変えていない)' : ''}。他の repo の記録は残す`,
  }),
  forgetNone: (dir) => ({
    en: `no trip entries for this repo in ${dir ?? '(no trips folder)'} — nothing to forget`,
    'zh-TW': `${dir ?? '(沒有 trips 資料夾)'} 裡沒有本 repo 的觸發紀錄——沒有要清的`,
    'zh-CN': `${dir ?? '(没有 trips 文件夹)'} 里没有本 repo 的触发记录——没有要清的`,
    ja: `${dir ?? '(trips フォルダなし)'} にこの repo の発火記録はない——消すものなし`,
  }),
  pRemoved: (n) => ({ en: `  removed  trips/${n}`, 'zh-TW': `  已刪除  trips/${n}`, 'zh-CN': `  已删除  trips/${n}`, ja: `  削除  trips/${n}` }),
  pWouldRemove: (n) => ({ en: `  would remove  trips/${n}`, 'zh-TW': `  將刪除  trips/${n}`, 'zh-CN': `  将删除  trips/${n}`, ja: `  削除予定  trips/${n}` }),
  prunedTrips: (n, total, days, dir, dry) => ({
    en: `${dry ? 'would prune' : 'pruned'} ${n} of ${total} trip file(s) not updated in ${days} day(s) (${dir}); files written in the last 2 minutes untouched`,
    'zh-TW': `${dry ? '將刪' : '已刪'} ${n}/${total} 個超過 ${days} 天沒更新的觸發紀錄檔(${dir});近 2 分鐘寫過的沒動`,
    'zh-CN': `${dry ? '将删' : '已删'} ${n}/${total} 个超过 ${days} 天没更新的触发记录文件(${dir});近 2 分钟写过的没动`,
    ja: `${days} 日更新のない発火記録ファイル ${total} 件中 ${n} 件を${dry ? '削除予定' : '削除'}(${dir})。直近 2 分に書かれたものはそのまま`,
  }),
  pruneTripsLink: (dir) => ({
    en: `⚠️  fleet --prune: ${dir} (or the folder holding it) is a symbolic link — never followed; trip files untouched`,
    'zh-TW': `⚠️  fleet --prune:${dir}(或它所在的資料夾)是符號連結——不跟隨;觸發紀錄檔沒動`,
    'zh-CN': `⚠️  fleet --prune:${dir}(或它所在的文件夹)是符号链接——不跟随;触发记录文件没动`,
    ja: `⚠️  fleet --prune:${dir}(またはその親フォルダ)はシンボリックリンク——たどらない。発火記録ファイルはそのまま`,
  }),
  noHome: {
    en: '⚠️  traps forget: cannot locate the trips folder (HOME / USERPROFILE unset or not absolute); nothing changed',
    'zh-TW': '⚠️  traps forget:找不到 trips 資料夾(HOME / USERPROFILE 都沒設或不是絕對路徑);什麼都沒改',
    'zh-CN': '⚠️  traps forget:找不到 trips 文件夹(HOME / USERPROFILE 都没设或不是绝对路径);什么都没改',
    ja: '⚠️  traps forget:trips フォルダが見つからない(HOME / USERPROFILE 未設定または絶対パスでない)。何も変えていない',
  },
  stdinWait: {
    en: '⚠️  traps similar: no --text= and nothing arrived on stdin within 2 s — scoring without the text (pass it with a quoted heredoc: <<\'EOF\')',
    'zh-TW': '⚠️  traps similar:沒給 --text=,stdin 2 秒內也沒有內容——不含內文照常比對(請用加引號的 heredoc 傳入:<<\'EOF\')',
    'zh-CN': '⚠️  traps similar:没给 --text=,stdin 2 秒内也没有内容——不含正文照常比对(请用加引号的 heredoc 传入:<<\'EOF\')',
    ja: '⚠️  traps similar:--text= がなく、stdin にも 2 秒以内に何も来なかった——本文なしで比較する(引用符付き heredoc <<\'EOF\' で渡す)',
  },
};

function parseArgs(args) {
  const o = { sub: null, json: false, lang: null, name: null, tags: [], paths: [], commands: [], text: null, days: null, dry: false, bad: null, badDays: null };
  const pos = [];
  const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
  for (const a of args) {
    if (!a.startsWith('-')) { pos.push(a); continue; }
    if (a === '--json') o.json = true;
    else if (a === '--dry-run') o.dry = true;
    else if (a.startsWith('--lang=')) o.lang = a.slice(7);
    else if (a.startsWith('--name=')) o.name = a.slice(7).trim();
    else if (a.startsWith('--tags=')) o.tags = list(a.slice(7));
    else if (a.startsWith('--paths=')) o.paths = list(a.slice(8));
    else if (a.startsWith('--commands=')) o.commands = list(a.slice(11));
    else if (a.startsWith('--text=')) o.text = a.slice(7);
    else if (a.startsWith('--days=')) { const v = a.slice(7); if (/^\d+$/.test(v) && Number(v) >= 1) o.days = Number(v); else o.badDays = v; }
    else if (o.bad === null) o.bad = a;
  }
  // positional: ['traps', '<sub>'] (cli.mjs passes the whole argv); anything after the subcommand is bad usage
  const rest = pos[0] === 'traps' ? pos.slice(1) : pos;
  o.sub = rest[0] ?? null;
  if (rest.length > 1 && o.bad === null) o.bad = rest[1];
  return o;
}
const FLAGS = {
  similar: ['--json', '--lang=', '--name=', '--tags=', '--paths=', '--commands=', '--text='],
  stats: ['--json', '--lang=', '--days='],
  forget: ['--lang=', '--dry-run'],
};

/**
 * The text when --text= is absent: stdin, when it is not a terminal (a quoted heredoc / a pipe). An agent's shell may
 * hand over a pipe that never closes (TRAPS codex-exec-stdin-hang), so when nothing at all arrives within `waitMs` the
 * text is left empty (null) instead of hanging; once the first byte arrives it reads to EOF. /dev/null → '' at once.
 */
export function readStdinText({ stdin = process.stdin, waitMs = 2000 } = {}) {
  if (!stdin || stdin.isTTY) return Promise.resolve(null);
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdin.removeListener('data', onData); stdin.removeListener('end', onEnd); stdin.removeListener('error', onErr);
      try { stdin.pause(); if (v === null) stdin.destroy(); } catch {}
      resolve(v);
    };
    const onData = (c) => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))); clearTimeout(timer); };
    const onEnd = () => finish(Buffer.concat(chunks).toString('utf8'));
    const onErr = () => finish(chunks.length ? Buffer.concat(chunks).toString('utf8') : null);
    const timer = setTimeout(() => finish(null), waitMs);
    stdin.on('data', onData); stdin.once('end', onEnd); stdin.once('error', onErr);
    stdin.resume();
  });
}

// Terminal width: CJK and full-width forms take two columns (same rule as fleet.mjs)
const wide = (c) => /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(c);
const width = (s) => [...s].reduce((w, c) => w + (wide(c) ? 2 : 1), 0);
const wpad = (s, n) => s + ' '.repeat(Math.max(1, n - width(s)));
/** s clipped to at most n terminal columns (by display width, so a CJK name never overflows its column), `…` marking a cut. */
export const clip = (s, n) => {
  if (width(s) <= n) return s;
  let out = '', w = 0;
  for (const c of s) { const cw = wide(c) ? 2 : 1; if (w + cw > n - 1) break; out += c; w += cw; }
  return out + '…';
};
const pad2 = (n) => String(n).padStart(2, '0');
/** YYYY-MM-DD in the local time zone (a trip at 23:30 local is that day, not the UTC one). */
export const localDay = (iso) => {
  if (!iso) return '–';
  const d = new Date(Date.parse(iso));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/**
 * args: argv after the binary (may include 'traps'); lang: the cwd's install language (`--lang=` in args wins);
 * cwd/env/now/log/stdin injectable for tests. Resolves to the exit code: 0 on any answer, 1 on bad usage, no TRAPS.md
 * (similar / stats) or a refused forget.
 */
export async function runTraps({ args = [], lang = 'en', cwd = process.cwd(), env = process.env, now = Date.now(), log = console.log, stdin = process.stdin } = {}) {
  const o = parseArgs(args);
  const L = o.lang && LANGS.includes(o.lang) ? o.lang : (LANGS.includes(lang) ? lang : 'en');
  const M = (m) => m[L] ?? m.en;
  if (o.lang !== null && !LANGS.includes(o.lang)) { log(`⚠️  --lang not recognized: ${o.lang} (available: ${LANGS.join(', ')})`); return 1; }
  if (!Object.hasOwn(FLAGS, o.sub ?? '')) { log(M(T.usage)); return o.sub === null && args.includes('--help') ? 0 : 1; }
  if (o.bad !== null) { log(M(T.badFlag(o.bad, o.sub))); log(M(T.usage)); return 1; }
  const allowed = FLAGS[o.sub];
  const stray = args.find((a) => a.startsWith('-') && !allowed.some((f) => (f.endsWith('=') ? a.startsWith(f) : a === f)));
  if (stray) { log(M(T.badFlag(stray, o.sub))); log(M(T.usage)); return 1; }
  if (o.badDays !== null) { log(M(T.badDays(o.badDays))); return 1; }
  if (o.sub === 'similar' && !o.name) { log(M(T.needName)); return 1; }

  if (o.sub === 'forget') {
    const base = fleetBase(env);
    if (base === null) { log(M(T.noHome)); return 1; }
    const r = forgetTrips({ base, cwd, dry: o.dry, log, M });
    if ((r.state === 'ok' || r.state === 'missing') && r.files === 0) log(M(T.forgetNone(r.dir)));
    return r.state === 'in-repo' || r.state === 'link' ? 1 : 0;
  }

  const file = join(cwd, ...TRAPS_REL.split('/'));
  let text;
  try { text = existsSync(file) ? readFileSync(file, 'utf8') : null; } catch { text = null; }
  if (text === null) {
    if (o.json) log(JSON.stringify({ version: 1, error: 'no-traps', file: TRAPS_REL }));
    else log(M(T.noTraps(TRAPS_REL)));
    return 1;
  }
  const entries = parseTraps(text);
  if (o.sub === 'stats') return stats({ o, entries, M, log, cwd, env, now });
  if (o.text === null) {
    const got = await readStdinText({ stdin });
    if (got === null && stdin && !stdin.isTTY) process.stderr.write(`${M(T.stdinWait)}\n`);
    o.text = got ?? '';
  }
  return similar({ o, entries, M, log });
}

function similar({ o, entries, M, log }) {
  const q = { name: o.name, tags: o.tags, paths: o.paths, commands: o.commands, text: o.text };
  const cands = findSimilar(entries, q);
  if (o.json) {
    log(JSON.stringify({
      version: 1, file: TRAPS_REL, threshold: SIMILAR_THRESHOLD, checked: entries.length, query: q,
      candidates: cands.map((c) => ({
        name: c.entry.name, status: c.entry.status, confidence: c.entry.confidence, score: c.score, sameName: c.sameName, reasons: c.reasons,
      })),
    }));
    return 0;
  }
  if (!cands.length) { log(M(T.simNone(o.name, SIMILAR_THRESHOLD, entries.length))); return 0; }
  log(M(T.simHead(cands.length, o.name, SIMILAR_THRESHOLD, entries.length)));
  for (const c of cands) {
    const e = c.entry;
    const st = isActive(e) ? `${e.status} · ${e.confidence}` : M(T.superseded);
    log(`  ${c.score.toFixed(2)}  ${e.name}  [${st}]`);
    const why = [];
    if (c.sameName) why.push(`⚠️  ${M(T.sameName)}`);
    for (const k of ['name', 'tags', 'paths', 'commands', 'words']) if (c.reasons[k].length) why.push(`${M(T.rs[k])}: ${c.reasons[k].join(', ')}`);
    if (why.length) log(`        ${why.join(' · ')}`);
  }
  log('');
  log(M(T.choose));
  return 0;
}

/**
 * Per active entry: sessions = how many of this repo's sessions tripped it (a session counts once per entry), last
 * trip = the latest of those sessions' first-match times. --days=N admits a (session, entry) pair only when its time
 * lies in the last N days; the printed range spans the admitted times only.
 */
function stats({ o, entries, M, log, cwd, env, now }) {
  const active = entries.filter(isActive);
  const dir = tripsDir(env);
  const files = tripFilesFor(dir, cwd);
  const tripData = files.length > 0;
  const cutoff = o.days === null ? null : now - o.days * DAY_MS;
  const per = new Map(); // name → { sessions, last }
  let from = null, to = null;
  const contributing = new Set();
  for (const f of files) {
    for (const [name, at] of f.trips) {
      const t = Date.parse(at);
      if (cutoff !== null && t < cutoff) continue;
      const cur = per.get(name) ?? { sessions: 0, last: null };
      cur.sessions++;
      if (cur.last === null || t > Date.parse(cur.last)) cur.last = at;
      per.set(name, cur);
      contributing.add(f.name);
      if (from === null || t < Date.parse(from)) from = at;
      if (to === null || t > Date.parse(to)) to = at;
    }
  }
  const rows = active.map((e) => {
    const p = per.get(e.name);
    return {
      name: e.name, confidence: e.confidence, discovered: e.discovered || null, anchored: hasMatchers(e),
      paths: e.paths.length, commands: e.commands.length,
      sessions: tripData ? (p?.sessions ?? 0) : null, lastTrip: p?.last ?? null,
    };
  });
  const anchored = rows.filter((r) => r.anchored).length;
  const counts = {
    active: rows.length, anchored, unanchored: rows.length - anchored,
    anchoredNeverTripped: tripData ? rows.filter((r) => r.anchored && !r.sessions).length : null,
  };
  if (o.json) {
    log(JSON.stringify({
      version: 1, file: TRAPS_REL, repo: cwd, dir, tripData, days: o.days, sessions: contributing.size, sessionFiles: files.length,
      range: from && to ? { from, to } : null, counts, entries: rows,
      notes: ['sessions = sessions that tripped the entry (once per session); only Edit/Write paths and Bash command prefixes count',
        'trip data only from Claude Code sessions with the flightwake mod tripwire on; Codex/Gemini never record trips',
        'unanchored entries can never trip by design'],
    }));
    return 0;
  }
  log(M(T.statsHead(TRAPS_REL, rows.length)));
  const nameW = Math.min(64, Math.max(width(M(T.col.name)), ...rows.map((r) => width(r.name)))) + 2;
  const anchorOf = (r) => (r.paths && r.commands ? 'paths+commands' : r.paths ? 'paths' : r.commands ? 'commands' : '—');
  const head = [wpad(M(T.col.name), nameW), wpad(M(T.col.conf), 12), wpad(M(T.col.disc), 12), wpad(M(T.col.anchor), 16)];
  if (tripData) head.push(wpad(M(T.col.sessions), 12), M(T.col.last));
  log(`  ${head.join('').trimEnd()}`);
  for (const r of rows) {
    const cells = [wpad(clip(r.name, nameW - 2), nameW), wpad(r.confidence, 12), wpad(r.discovered ?? '–', 12), wpad(anchorOf(r), 16)];
    if (tripData) cells.push(wpad(String(r.sessions), 12), localDay(r.lastTrip));
    log(`  ${cells.join('').trimEnd()}`);
  }
  log('');
  log(M(T.summary(counts, o.days)));
  if (!tripData) log(M(T.noData(dir)));
  else if (from && to) log(M(T.range(contributing.size, localDay(from), localDay(to), o.days)));
  else log(M(T.rangeEmpty(files.length, o.days)));
  log(M(T.noteSource));
  log(M(T.noteUnanchored));
  return 0;
}
