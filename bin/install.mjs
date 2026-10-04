/**
 * flightwake installer core — the one install path shared by `init`, `update` and `setup`.
 * `install()` takes resolved options (never asks anything) and routes every write through a small facade, so
 * `dry: true` runs the exact same logic and returns the paths it *would* write — that list is what setup shows
 * before its final confirmation, instead of a hand-maintained copy that drifts from the code.
 * Zero dependencies: node built-ins + `git` (no shell).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, lstatSync, realpathSync, rmSync, renameSync, openSync, writeSync, fchmodSync, closeSync } from 'node:fs';
import { join, dirname, basename, isAbsolute, relative, sep, delimiter } from 'node:path';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { refreshRolesSkill } from './roles.mjs';

export const LANGS = ['en', 'zh-TW', 'zh-CN', 'ja'];
export const PROFILES = ['code', 'notes'];
export const INSTRUCTION_CANDIDATES = ['.claude/CLAUDE.md', 'CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', 'GEMINI.md'];
// Platform groups: an agent's instruction-file candidates count as the same file (installed into the first
// that exists; a marker in any of them means no duplicate). The group's last candidate is the creation target
// for --agents. Default mode targets platforms that already have an instruction file; with none anywhere →
// codex (AGENTS.md, the widest-compatibility standard). The active set also decides where skills and hooks go.
export const GROUPS = {
  claude: ['.claude/CLAUDE.md', 'CLAUDE.md'],
  codex: ['AGENTS.md'],
  gemini: ['GEMINI.md'],
};
// Own-property check: a plain `GROUPS[x]` lookup accepts inherited names like constructor / toString / __proto__
export const isAgentName = (x) => Object.hasOwn(GROUPS, x);
export const HOOK_CMD = 'node "$CLAUDE_PROJECT_DIR/.flightwake/hooks/state-check.mjs"';
export const HOOK_CMD_GIT = 'node "$(git rev-parse --show-toplevel)/.flightwake/hooks/state-check.mjs"';
export const SL_CMD = 'node "$CLAUDE_PROJECT_DIR/.flightwake/hooks/statusline.mjs"';
export const ORCA_BEGIN = '<!-- flightwake-orca:begin';
export const ORCA_END = '<!-- flightwake-orca:end -->';
export const ORCA_BLOCK_RE = /\n?<!-- flightwake-orca:begin[\s\S]*?<!-- flightwake-orca:end -->\n?/;
// flightwake-mod (opt-in, Claude Code only): installed as a plugin folder Claude Code loads by itself from the
// project's .claude/skills/ (as flightwake-mod@skills-dir). Only what the loader reads ships into a repo — the manifest,
// the hooks modules and the $.state contract its manifest names; the mod's tests/ and scripts/ are development-only.
export const MOD_REL = '.claude/skills/flightwake-mod';
export const MOD_MIN_CLAUDE = '2.1.287';
export const modShips = (rel) => rel === '.claude-plugin/plugin.json' || rel.startsWith('hooks/') || rel.startsWith('types/');
export const modSrc = (fwSrc) => join(fwSrc, 'mods', 'flightwake');
/** The shipped files, relative to the mod folder (sorted). */
export function modShipList(fwSrc) {
  const out = [];
  const walk = (dir, rel) => {
    for (const f of readdirSync(dir)) {
      if (!noJunk(f)) continue;
      const r = rel ? `${rel}/${f}` : f;
      if (statSync(join(dir, f)).isDirectory()) walk(join(dir, f), r);
      else if (modShips(r)) out.push(r);
    }
  };
  walk(modSrc(fwSrc), '');
  return out.sort();
}
const BEGIN = '<!-- flightwake:begin';
const END = '<!-- flightwake:end -->';

export const noJunk = (src) => !/(^|[\\/])\.(DS_Store|AppleDouble)$/.test(src);
// M(): localized CLI output, keyed by language. Keyed rather than positional — with four languages, positional
// args silently swap on edit. A missing key falls back to English rather than printing undefined.
export const makeM = (lang) => (m) => m[lang] ?? m.en;

// ── git ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const gitIn = (target) => (...a) => execFileSync('git', a, { cwd: target, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
export const gitAvailable = () => { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } };
/** root = .git here (a file in worktrees/submodules, hence existsSync); sub = inside another repo; none = no repo */
export function repoState(target) {
  if (existsSync(join(target, '.git'))) return { kind: 'root', root: target };
  try { return { kind: 'sub', root: gitIn(target)('rev-parse', '--show-toplevel') }; } catch { return { kind: 'none', root: null }; }
}
export const excludePath = (target) => {
  let p;
  try { p = gitIn(target)('rev-parse', '--git-path', 'info/exclude'); } catch { p = join('.git', 'info', 'exclude'); }
  return isAbsolute(p) ? p : join(target, p);
};
const EXCLUDE_RE = /# flightwake:begin[^\n]*\n[\s\S]*?# flightwake:end\n?/;
/** Append entries to an existing flightwake exclude block (add-ons installed after a --private init). true = written. */
export function addPrivateExcludes(target, entries, W) {
  try {
    const ep = excludePath(target);
    if (!existsSync(ep)) return false;
    const cur = readFileSync(ep, 'utf8');
    const m = EXCLUDE_RE.exec(cur);
    if (!m) return false;
    const lines = m[0].split('\n');
    const missing = entries.filter((e) => !lines.includes(e));
    if (!missing.length) return false;
    const endAt = m.index + m[0].lastIndexOf('# flightwake:end');
    return W.write(ep, cur.slice(0, endAt) + missing.map((e) => `${e}\n`).join('') + cur.slice(endAt), false);
  } catch { return false; }
}

export const gitMissingMessage = (M) => M({
  en: `⚠️  git is not installed (or not on PATH) — flightwake uses git as its recording substrate.
    Install it, then rerun:
      macOS    xcode-select --install   (or: brew install git)
      Windows  winget install --id Git.Git -e   (or https://git-scm.com/download/win)
      Linux    sudo apt install git  /  sudo dnf install git
    More: https://git-scm.com/downloads`,
  'zh-TW': `⚠️  找不到 git(未安裝或不在 PATH)— flightwake 以 git 作為紀錄基礎。
    請先安裝再重跑:
      macOS    xcode-select --install(或 brew install git)
      Windows  winget install --id Git.Git -e(或 https://git-scm.com/download/win)
      Linux    sudo apt install git / sudo dnf install git
    更多:https://git-scm.com/downloads`,
  'zh-CN': `⚠️  找不到 git(未安装或不在 PATH)— flightwake 以 git 作为记录基础。
    请先安装再重跑:
      macOS    xcode-select --install(或 brew install git)
      Windows  winget install --id Git.Git -e(或 https://git-scm.com/download/win)
      Linux    sudo apt install git / sudo dnf install git
    更多:https://git-scm.com/downloads`,
  ja: `⚠️  git が見つかりません(未インストールか PATH にない)— flightwake は git を記録の土台にしています。
    インストールしてから再実行してください:
      macOS    xcode-select --install(または brew install git)
      Windows  winget install --id Git.Git -e(または https://git-scm.com/download/win)
      Linux    sudo apt install git / sudo dnf install git
    詳細:https://git-scm.com/downloads`,
});
export const monorepoMessage = (M, root) => M({
  en: `⚠️  flightwake policy: one install per repo, at the git root.\n    Run this in ${root} (a submodule has its own .git and counts as its own repo).`,
  'zh-TW': `⚠️  flightwake 政策:一個 repo 一份安裝,裝在 git root。\n    請在 ${root} 執行(submodule 有自己的 .git,算獨立 repo)。`,
  'zh-CN': `⚠️  flightwake 政策:一个 repo 一份安装,装在 git root。\n    请在 ${root} 执行(submodule 有自己的 .git,算独立 repo)。`,
  ja: `⚠️  flightwake の方針:1 repo に 1 つ、git root にインストール。\n    ${root} で実行してください(submodule は独自の .git を持つ別 repo 扱い)。`,
});
export const notRepoMessage = (M, target) => M({
  en: `⚠️  Not a git repo (${target}) — flightwake relies on git as its recording substrate.\n    Run git init first, or pass --git-init to have init create the repo.`,
  'zh-TW': `⚠️  不是 git repo(${target})— flightwake 以 git 作為紀錄基礎。\n    請先 git init,或加 --git-init 讓 init 幫你建立。`,
  'zh-CN': `⚠️  不是 git repo(${target})— flightwake 以 git 作为记录基础。\n    请先 git init,或加 --git-init 让 init 帮你建立。`,
  ja: `⚠️  git repo ではありません(${target})— flightwake は git を記録の土台にしています。\n    先に git init するか、--git-init を付けて init に作らせてください。`,
});

// ── Detect the existing install — drives `update`, language defaults, setup's "already installed" branch ──
// Marker attributes are parsed generically so newer attributes (profile=…) never break older readers' intent:
// `lang` (pre-0.9 markers carry none — every install back then was zh-TW) and `profile` (absent = code).
const MARKER_RE = /<!-- flightwake:begin v(\d+\.\d+\.\d+[^\s>]*)((?:\s+[\w-]+=[^\s>]*)*)\s*-->/;
export function parseMarker(text) {
  const m = MARKER_RE.exec(text);
  if (!m) return null;
  const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)=([^\s>]*)/g)].map((a) => [a[1], a[2]]));
  return { version: m[1], lang: attrs.lang ?? 'zh-TW', profile: attrs.profile ?? 'code', attrs };
}
export function readMarkers(target) {
  const out = [];
  for (const rel of INSTRUCTION_CANDIDATES) {
    const p = join(target, ...rel.split('/'));
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    const m = parseMarker(text);
    if (m) out.push({ rel, ...m, orca: text.includes(ORCA_BEGIN) });
    else if (text.includes(ORCA_BEGIN)) out.push({ rel, orphanOrca: true });
  }
  return out;
}
const readExcludeHeader = (target) => {
  try {
    const ep = excludePath(target);
    if (!existsSync(ep)) return null;
    const line = /# flightwake:begin([^\n]*)/.exec(readFileSync(ep, 'utf8'));
    return line ? { profile: /profile=([\w-]+)/.exec(line[1])?.[1] ?? null } : null;
  } catch { return null; }
};
export function detectInstall(target) {
  const markers = readMarkers(target).filter((m) => !m.orphanOrca);
  const marker = markers[0] ?? null; // first in INSTRUCTION_CANDIDATES order wins when markers disagree (doctor flags it)
  const exclude = readExcludeHeader(target);
  let statusline = false;
  for (const rel of ['.claude/settings.json', '.claude/settings.local.json']) {
    const p = join(target, ...rel.split('/'));
    try { if (existsSync(p) && JSON.stringify(JSON.parse(readFileSync(p, 'utf8')).statusLine ?? null).includes('statusline.mjs')) statusline = true; } catch {}
  }
  return {
    marker,
    markers,
    statusline,
    private: !!exclude,
    // Profile lives in the marker; a --private install can end up with no marker at all (every instruction
    // file tracked → skipped), so the exclude block's header carries it too
    profile: marker ? marker.profile : (exclude?.profile ?? 'code'),
    orca: readMarkers(target).some((m) => m.orca || m.orphanOrca),
    roles: ['.claude/skills', '.agents/skills'].some((b) => existsSync(join(target, ...b.split('/'), 'fw-roles'))),
    mod: existsSync(join(target, ...MOD_REL.split('/'))),
    installed: !!marker || !!exclude,
  };
}
/** Platforms that already have an instruction file here (may be empty). A CLAUDE.local.md carrying the flightwake
 *  marker counts for claude: a --private install puts Claude's table there, and without it `update` would fall back
 *  to codex — creating AGENTS.md and dropping CLAUDE.local.md from the exclude block. */
export function detectedAgents(target) {
  const hasFile = (rel) => existsSync(join(target, ...rel.split('/')));
  const localMarker = () => { try { return readFileSync(join(target, 'CLAUDE.local.md'), 'utf8').includes(BEGIN); } catch { return false; } };
  return Object.keys(GROUPS).filter((name) => GROUPS[name].some(hasFile) || (name === 'claude' && localMarker()));
}
/** Which platforms a default (no --agents) install would target: the detected ones, or codex when none. */
export function defaultAgents(target) {
  const found = detectedAgents(target);
  return found.length ? found : ['codex'];
}
/** Orca present = its CLI is on PATH or the environment Orca exports to its terminals is set. Never executes it. */
export function detectOrca(env = process.env) {
  if (['ORCA_APP_VERSION', 'ORCA_TERMINAL_HANDLE', 'ORCA_WORKSPACE_ID'].some((k) => env[k])) return true;
  const names = process.platform === 'win32' ? ['orca.exe', 'orca.cmd', 'orca.bat'] : ['orca'];
  return (env.PATH ?? '').split(delimiter).filter(Boolean).some((d) => names.some((n) => existsSync(join(d, n))));
}

/**
 * Resolve install options for init/update from flags + the detected install. Explicit flag > existing install >
 * default. update keeps lang/statusline/private/profile; orca, roles and the mod are refreshed only where already installed.
 */
export function resolveOptions({ update, flags, det }) {
  return {
    update,
    force: flags.force || update,
    lang: flags.lang ?? det.marker?.lang ?? 'en',
    private: flags.private || (update && det.private),
    statusline: flags.statusline || (update && det.statusline),
    agents: flags.agents ?? null,
    profile: flags.profile ?? det.profile ?? 'code',
    orca: !!flags.orca,
    mod: !!flags.mod,
  };
}

// ── Cross-repo registry (~/.flightwake/registry.json) — read-only query layers discover installed repos through
// it. Best-effort by contract: a registry problem must never fail an install, and a corrupt registry is left in
// place for inspection rather than clobbered.
export const registryPath = () => join(process.env.FLIGHTWAKE_HOME ?? join(homedir(), '.flightwake'), 'registry.json');
const readRegistry = () => {
  const REGISTRY = registryPath();
  if (!existsSync(REGISTRY)) return { version: 1, repos: {} };
  const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  if (!reg || typeof reg.repos !== 'object' || Array.isArray(reg.repos)) throw new Error('unexpected shape');
  return reg;
};
export function unregisterRepo(target, log, dry = false) {
  try {
    const REGISTRY = registryPath();
    if (lstatSync(REGISTRY).isSymbolicLink()) return; // best-effort: never write through a symlink
    const reg = readRegistry();
    if (!(target in reg.repos)) return;
    delete reg.repos[target];
    if (dry) return;
    const { W } = createWriter({ target: dirname(REGISTRY) });
    if (W.write(REGISTRY, JSON.stringify(reg, null, 2) + '\n', false)) log(`  edit ${REGISTRY} ← entry removed`);
  } catch {}
}

// ── Guarded writer ─────────────────────────────────────────────────────────────────────────────────────────
// One write path for the core install, the add-ons, uninstall and every roles subcommand, real or dry.
// - Never write or delete *through* a symlink, never land outside the boundary repo, and treat a dangling symlink on
//   the way the same way; every existing ancestor must be a directory and a file destination must not be a directory.
//   (A framework file symlinked to ../STATE.md would otherwise be overwritten with hook code, breaking "user data is
//   never overwritten".)
// - Files are replaced, never rewritten in place: write a temp file next to the destination, then rename it over.
//   A destination that is a *hardlink* to STATE keeps STATE's inode untouched — only the directory entry changes.
// - In a dry run nothing is written and refusals are only collected; callers use that as the preflight, so a refused
//   path stops the whole operation before the first write.
// target = the protection boundary: the repo being written (cross-repo roles get one writer per target repo).
export function createWriter({ target, dry = false, log = () => {}, M = makeM('en') }) {
  const writes = [];
  const refused = []; // { path, why: 'symlink' | 'outside' | 'dangling' | 'notdir' | 'isdir' | 'tracked' | 'error', detail? }
  const relOf = (abs) => { const r = relative(target, abs); return (r.startsWith('..') || isAbsolute(r)) ? abs : r.split(sep).join('/'); };
  const REAL = (() => { try { return realpathSync(target); } catch { return target; } })();
  const isLink = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
  const lexists = (p) => { try { lstatSync(p); return true; } catch { return false; } };
  const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
  // Where would p really land? The nearest path that exists (a dangling symlink counts as existing) must resolve,
  // be a directory (unless it is p itself), and — for in-repo paths — sit inside the boundary repo.
  const placement = (p, inRepo) => {
    let d = p;
    while (!lexists(d) && dirname(d) !== d) d = dirname(d);
    let r;
    try { r = realpathSync(d); } catch { return { why: 'dangling', at: d }; }
    if (d !== p && !isDir(d)) return { why: 'notdir', at: d };
    if (inRepo && !(r === REAL || r.startsWith(REAL + sep))) return { why: 'outside', at: d };
    return null;
  };
  const linkInside = (dir) => { // any symlink inside an existing directory we are about to replace or delete
    try {
      for (const f of readdirSync(dir)) {
        const q = join(dir, f);
        if (isLink(q)) return q;
        if (statSync(q).isDirectory()) { const hit = linkInside(q); if (hit) return hit; }
      }
    } catch {}
    return null;
  };
  const refuse = (p, why, detail) => {
    if (!refused.some((r) => r.path === relOf(p))) refused.push({ path: relOf(p), why, detail });
    log(`  ⚠️  ${relOf(p)}${refusalReason(M, why, detail)}`);
    return false;
  };
  // kind: 'file' (a file will be written here) | 'dir' (a directory will be created / replaced / deleted here)
  // inRepo: false for paths that live outside the repo by design (git's exclude file)
  const check = (p, inRepo = true, kind = 'file') => {
    if (isLink(p)) return refuse(p, existsSync(p) ? 'symlink' : 'dangling');
    const where = placement(p, inRepo);
    if (where) return refuse(where.why === 'notdir' ? where.at : p, where.why);
    if (lexists(p) && kind === 'file' && isDir(p)) return refuse(p, 'isdir');
    if (lexists(p) && kind === 'dir' && !isDir(p)) return refuse(p, 'notdir');
    return true;
  };
  // Atomic replace: temp file in the same directory, then rename over the destination (never an in-place overwrite).
  // The destination's existing mode carries over, and the temp file is never looser than it at any moment: it is
  // created with that mode (umask can only tighten it), then set exactly before rename. No destination → default mode.
  const replaceFile = (p, data) => {
    let mode = null;
    try { mode = statSync(p).mode & 0o7777; } catch {}
    const tmp = join(dirname(p), `.${basename(p)}.fw-${process.pid}-${Date.now()}.tmp`);
    try {
      const fd = openSync(tmp, 'wx', mode ?? 0o666);
      try { writeSync(fd, data); if (mode !== null) fchmodSync(fd, mode); }
      finally { closeSync(fd); }
      renameSync(tmp, p);
    } catch (e) { try { rmSync(tmp, { force: true }); } catch {} throw e; }
  };
  // filter(rel) picks which files of src are copied (rel is relative to src, '/'-separated); default: all
  const copyTree = (src, dst, filter, rel = '') => {
    mkdirSync(dst, { recursive: true });
    for (const f of readdirSync(src)) {
      if (!noJunk(f)) continue;
      const s2 = join(src, f);
      const d2 = join(dst, f);
      const r = rel ? `${rel}/${f}` : f;
      if (statSync(s2).isDirectory()) { if (!filter || hasWanted(s2, filter, r)) copyTree(s2, d2, filter, r); }
      else if (!filter || filter(r)) replaceFile(d2, readFileSync(s2));
    }
  };
  const treeFiles = (src, filter, rel = '') => readdirSync(src).flatMap((f) => {
    if (!noJunk(f)) return [];
    const r = rel ? `${rel}/${f}` : f;
    if (statSync(join(src, f)).isDirectory()) return treeFiles(join(src, f), filter, r);
    return !filter || filter(r) ? [r] : [];
  });
  const hasWanted = (dir, filter, rel) => readdirSync(dir).some((f) => {
    const r = `${rel}/${f}`;
    return statSync(join(dir, f)).isDirectory() ? hasWanted(join(dir, f), filter, r) : filter(r);
  });
  const W = {
    check,
    refuse,
    write: (p, data, inRepo = true) => {
      if (!check(p, inRepo)) return false;
      writes.push(relOf(p));
      if (!dry) { mkdirSync(dirname(p), { recursive: true }); replaceFile(p, data); }
      return true;
    },
    append: (p, data) => {
      if (!check(p)) return false;
      writes.push(relOf(p));
      if (!dry) { const cur = existsSync(p) ? readFileSync(p, 'utf8') : ''; replaceFile(p, cur + data); }
      return true;
    },
    // Copy a directory tree file by file (each file replaced atomically; files the user added are kept).
    // replace: remove the existing directory first (stale files go) — after checking nothing inside it is a symlink.
    // filter: only the files it accepts are copied (see copyTree).
    cp: (src, dst, { replace = false, filter = null } = {}) => {
      if (!check(dst, true, 'dir')) return false;
      const inner = existsSync(dst) ? linkInside(dst) : null;
      if (inner) return refuse(inner, 'symlink');
      // Every file this copy will write is checked like a single write: a directory where a shipped file goes, or a
      // regular file where one of its directories must be, would otherwise fail half-way (EISDIR / ENOTDIR) after
      // other files were written. A replace removes the old tree first, so only its root matters there.
      if (!replace) for (const rel of treeFiles(src, filter)) if (!check(join(dst, ...rel.split('/')))) return false;
      writes.push(`${relOf(dst)}/`);
      if (!dry) {
        if (replace && existsSync(dst)) rmSync(dst, { recursive: true });
        copyTree(src, dst, filter);
      }
      return true;
    },
    // Delete a file or a directory tree inside the boundary; a symlink anywhere on the way (or inside) is refused
    rm: (p) => {
      if (!lexists(p)) return true;
      if (!check(p, true, isDir(p) ? 'dir' : 'file')) return false;
      const inner = isDir(p) ? linkInside(p) : null;
      if (inner) return refuse(inner, 'symlink');
      writes.push(relOf(p));
      if (!dry) rmSync(p, { recursive: true });
      return true;
    },
    mkdir: (p, listed, inRepo = true) => {
      if (isLink(p) && !existsSync(p)) return false; // the write that needs it reports the refusal
      if (placement(p, inRepo) || (lexists(p) && !isDir(p))) return false;
      if (listed && !existsSync(p)) writes.push(`${relOf(p)}/`);
      if (!dry) mkdirSync(p, { recursive: true });
      return true;
    },
  };
  return { W, writes, refused, isLink, relOf };
}
const refusalReason = (M, why, detail) => M(why === 'outside' ? {
  en: ' resolves outside this repo — not written (flightwake only writes inside the repo; fix the symlink and rerun)',
  'zh-TW': ' 的實際落點在 repo 之外 — 不寫入(flightwake 只寫 repo 內;修正 symlink 後重跑)',
  'zh-CN': ' 的实际落点在 repo 之外 — 不写入(flightwake 只写 repo 内;修正 symlink 后重跑)',
  ja: ' の実体が repo の外にある — 書き込まない(flightwake は repo 内にしか書かない。symlink を直して再実行)',
} : why === 'dangling' ? {
  en: ' goes through a dangling symlink (it points to something that does not exist) — not written; fix or remove the symlink and rerun',
  'zh-TW': ' 經過一個懸空的 symlink(指向不存在的位置)— 不寫入;修正或移除該 symlink 後重跑',
  'zh-CN': ' 经过一个悬空的 symlink(指向不存在的位置)— 不写入;修正或移除该 symlink 后重跑',
  ja: ' は宙に浮いた symlink(存在しない場所を指す)を経由する — 書き込まない。symlink を直すか消して再実行',
} : why === 'notdir' ? {
  en: ' is not a directory (a regular file is in the way) — nothing written there; move it aside and rerun',
  'zh-TW': ' 不是目錄(一般檔案擋在路上,not a directory)— 不寫入;移開後重跑',
  'zh-CN': ' 不是目录(一般文件挡在路上,not a directory)— 不写入;移开后重跑',
  ja: ' はディレクトリではない(通常ファイルが邪魔をしている、not a directory)— 書き込まない。どかして再実行',
} : why === 'isdir' ? {
  en: ' is a directory where a file is expected — not written; move it aside and rerun',
  'zh-TW': ' 應該是檔案卻是目錄 — 不寫入;移開後重跑',
  'zh-CN': ' 应该是文件却是目录 — 不写入;移开后重跑',
  ja: ' はファイルのはずがディレクトリ — 書き込まない。どかして再実行',
} : why === 'tracked' ? {
  en: ` is already tracked by git — --private cannot take effect (exclude does not apply to tracked files); untrack it first: git rm -r --cached ${detail} (history is yours to handle), then rerun`,
  'zh-TW': ` 已被 git 追蹤 — --private 無法生效(exclude 對已追蹤檔不起作用);請先解除追蹤:git rm -r --cached ${detail}(歷史紀錄請自行處理),再重跑`,
  'zh-CN': ` 已被 git 追踪 — --private 无法生效(exclude 对已追踪文件不起作用);请先解除追踪:git rm -r --cached ${detail}(历史记录请自行处理),再重跑`,
  ja: ` は既に git 管理下 — --private は効かない(exclude は追跡済ファイルに効かない)。先に追跡を外す:git rm -r --cached ${detail}(履歴の扱いはご自身で)、それから再実行`,
} : why === 'error' ? {
  en: ` could not be written: ${detail}`,
  'zh-TW': ` 寫入失敗:${detail}`,
  'zh-CN': ` 写入失败:${detail}`,
  ja: ` 書き込みに失敗:${detail}`,
} : {
  en: ' is a symlink — not written through it (it could overwrite whatever it points to, e.g. your STATE); replace it with a regular file and rerun',
  'zh-TW': ' 是 symlink — 不經由它寫入(可能覆蓋它指向的檔,例如你的 STATE);改成一般檔案後重跑',
  'zh-CN': ' 是 symlink — 不经由它写入(可能覆盖它指向的档,例如你的 STATE);改成一般文件后重跑',
  ja: ' は symlink — それ越しには書き込まない(指す先、例えば STATE を上書きしうる)。通常のファイルに置き換えて再実行',
});
/** Preflight verdict: every refused path with its reason, and that nothing was written. */
export const refusalReport = (M, refused) => `${M({
  en: `\n✗ Stopped before writing anything: ${refused.length} path(s) cannot be written safely. Nothing was written.`,
  'zh-TW': `\n✗ 寫入前就中止:有 ${refused.length} 個路徑無法安全寫入。什麼都沒寫(nothing was written)。`,
  'zh-CN': `\n✗ 写入前就中止:有 ${refused.length} 个路径无法安全写入。什么都没写(nothing was written)。`,
  ja: `\n✗ 書き込む前に中止:安全に書けないパスが ${refused.length} 個。何も書き込んでいない(nothing was written)。`,
})}\n${refused.map((r) => `    ${r.path}${refusalReason(M, r.why, r.detail)}`).join('\n')}`;
/** A real run that still ended part-way (refusal that preflight could not foresee, or an I/O error). */
export const incompleteReport = (M, detail) => M({
  en: `\n✗ Install NOT complete — it stopped part-way: ${detail}\n  Fix the cause and rerun; files already written are framework files (your STATE/DECISIONS/TRAPS/records are never overwritten).`,
  'zh-TW': `\n✗ 安裝未完成 — 中途停止:${detail}\n  排除原因後重跑;已寫入的都是框架檔(你的 STATE/DECISIONS/TRAPS/records 不會被覆蓋)。`,
  'zh-CN': `\n✗ 安装未完成 — 中途停止:${detail}\n  排除原因后重跑;已写入的都是框架档(你的 STATE/DECISIONS/TRAPS/records 不会被覆盖)。`,
  ja: `\n✗ インストールは未完了 — 途中で止まった:${detail}\n  原因を直して再実行。書き込み済みはフレームワークファイルのみ(STATE/DECISIONS/TRAPS/records は上書きしない)。`,
});

// ── install ────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * o: { target, fwSrc, version, lang, force, update, private, statusline, agents, profile, orca, mod, marker, dry, log }
 * Returns { writes, refused, active, agentsSkills, mod, gauge }. With dry: nothing is written and nothing is logged.
 * mod: 'added' | 'refreshed' | null (this run); gauge: the bottom gauge is set after this run.
 */
export function install(o) {
  const { target: TARGET, fwSrc: FW_SRC, version: VERSION, lang: LANG, force: FORCE, update: IS_UPDATE, dry } = o;
  const PRIVATE = !!o.private;
  const STATUSLINE = !!o.statusline;
  const NOTES = o.profile === 'notes';
  const log = dry ? () => {} : o.log;
  const M = makeM(LANG);
  const git = gitIn(TARGET);
  const isTracked = (rel) => { try { return git('ls-files', '--', rel) !== ''; } catch { return false; } };
  const marker = o.marker ?? null;

  // Every write (core, add-ons, roles refresh) goes through one guarded writer — see createWriter
  const { W, writes, refused, isLink } = createWriter({ target: TARGET, dry, log, M });

  // --private collects entries for .git/info/exclude (relative to repo root); null = not private
  const privateExcludes = PRIVATE ? ['.flightwake/'] : null;

  if (IS_UPDATE) {
    log(`flightwake update v${marker?.version ?? '?'} → v${VERSION} (lang=${LANG}${NOTES ? ', profile=notes' : ''}${STATUSLINE ? ', statusline' : ''}${PRIVATE ? ', private' : ''}) → ${TARGET}\n`);
  } else {
    log(`flightwake init v${VERSION}${PRIVATE ? ' (--private)' : ''} (lang=${LANG}${NOTES ? ', profile=notes' : ''}) → ${TARGET}\n`);
  }

  // 1. .flightwake/ templates — STATE/DECISIONS/TRAPS are user data, never overwritten (even with --force)
  W.mkdir(join(TARGET, '.flightwake', 'records'), true);
  W.mkdir(join(TARGET, '.flightwake', 'hooks'));
  for (const f of ['STATE.md', 'DECISIONS.md', 'TRAPS.md']) {
    const dst = join(TARGET, '.flightwake', f);
    if (existsSync(dst)) log(`  skip .flightwake/${f}${M({
      en: ' (exists — user data, never overwritten)',
      'zh-TW': '(已存在,使用者資料不覆蓋)',
      'zh-CN': '(已存在,用户资料不覆盖)',
      ja: '(既存 — ユーザーデータは上書きしない)',
    })}`);
    else if (W.write(dst, readFileSync(join(FW_SRC, 'templates', LANG, f), 'utf8'))) log(`  add  .flightwake/${f}`);
  }

  // Local-modification guard. Framework-owned files are overwritten by --force/update, by design — but silently
  // losing someone's hand-edits (most often a hand-translated skill) is what makes that design feel like a bug.
  // Only claim a local edit when the install is already at this exact version *and* language: then the shipped
  // bytes should match exactly, so any difference is the user's. Across a version or language change content
  // legitimately differs, so say nothing rather than cry wolf.
  const SAME_SPEC = !!marker && marker.version === VERSION && marker.lang === LANG;
  const clobbered = [];
  const noteClobber = (dst, rel, next) => {
    if (!SAME_SPEC || !existsSync(dst)) return;
    try { if (readFileSync(dst, 'utf8') !== next) clobbered.push(rel); } catch {}
  };
  const noteClobberDir = (srcDir, dstDir, relBase, filter = null, rel = '') => {
    if (!SAME_SPEC || !existsSync(dstDir)) return;
    for (const f of readdirSync(srcDir)) {
      if (!noJunk(f)) continue;
      const s = join(srcDir, f);
      const d = join(dstDir, f);
      const r = rel ? `${rel}/${f}` : f;
      if (statSync(s).isDirectory()) { noteClobberDir(s, d, `${relBase}/${f}`, filter, r); continue; }
      if (filter && !filter(r)) continue;
      try { if (!existsSync(d) || readFileSync(d, 'utf8') !== readFileSync(s, 'utf8')) clobbered.push(`${relBase}/${f}`); } catch {}
    }
  };

  // 2. Framework-owned files: record template + hooks (--force updates them).
  //    Hooks are stamped at copy time: LANG picks their message language, FW_VERSION feeds the statusline update check.
  const stamp = (src) => readFileSync(src, 'utf8')
    .replace(/^const LANG = '[^']*';$/m, `const LANG = '${LANG}';`)
    .replace(/^const FW_VERSION = '[^']*';$/m, `const FW_VERSION = '${VERSION}';`);
  for (const [read, rel] of [
    [() => readFileSync(join(FW_SRC, 'templates', LANG, 'TEMPLATE-record.md'), 'utf8'), join('.flightwake', 'TEMPLATE-record.md')],
    [() => stamp(join(FW_SRC, 'hooks', 'state-check.mjs')), join('.flightwake', 'hooks', 'state-check.mjs')],
    [() => stamp(join(FW_SRC, 'hooks', 'statusline.mjs')), join('.flightwake', 'hooks', 'statusline.mjs')],
  ]) {
    const dst = join(TARGET, rel);
    const existed = existsSync(dst);
    if (existed && !FORCE) { log(`  skip ${rel}${M({
      en: ' (exists — --force to update)',
      'zh-TW': '(已存在,--force 可更新)',
      'zh-CN': '(已存在,--force 可更新)',
      ja: '(既存 — --force で更新)',
    })}`); continue; }
    const next = read();
    noteClobber(dst, rel, next);
    if (W.write(dst, next)) log(`  ${existed ? 'update' : 'add '} ${rel}`);
  }

  const wanted = o.agents ?? null;
  const ACTIVE = new Set(wanted ?? defaultAgents(TARGET));
  // Codex and Gemini CLI both read `.agents/skills/` (Gemini treats it as an alias of .gemini/skills)
  const AGENTS_SKILLS = ACTIVE.has('codex') || ACTIVE.has('gemini');

  // 3. The four skills → .claude/skills/ always, plus .agents/skills/ when Codex/Gemini is in play
  //    (directories only, junk filtered; --force updates; other skills already in those trees are never touched)
  const installSkills = (baseRel) => {
    W.mkdir(join(TARGET, ...baseRel.split('/')));
    for (const s of readdirSync(join(FW_SRC, 'skills', LANG))) {
      if (!statSync(join(FW_SRC, 'skills', LANG, s)).isDirectory()) continue;
      privateExcludes?.push(`${baseRel}/${s}/`);
      const dst = join(TARGET, ...baseRel.split('/'), s);
      const existed = existsSync(dst);
      if (existed && !FORCE) { log(`  skip ${baseRel}/${s}${M({
        en: ' (exists — --force to update)',
        'zh-TW': '(已存在,--force 可更新)',
        'zh-CN': '(已存在,--force 可更新)',
        ja: '(既存 — --force で更新)',
      })}`); continue; }
      noteClobberDir(join(FW_SRC, 'skills', LANG, s), dst, `${baseRel}/${s}`);
      if (W.cp(join(FW_SRC, 'skills', LANG, s), dst)) log(`  ${existed ? 'update' : 'add '} ${baseRel}/${s}`);
    }
    // roles add-on installed earlier: keep it inside the exclude block on every private rerun
    if (existsSync(join(TARGET, ...baseRel.split('/'), 'fw-roles'))) privateExcludes?.push(`${baseRel}/fw-roles/`);
  };
  installSkills('.claude/skills');
  if (AGENTS_SKILLS) installSkills('.agents/skills');
  // roles add-on: refreshed on update only where the user already installed it (opt-in, never added here)
  if (IS_UPDATE) refreshRolesSkill({ target: TARGET, fwSrc: FW_SRC, lang: LANG, log, W });

  // 4. Stop hook merged into .claude/settings.json (--private → settings.local.json, stays out of the repo)
  {
    const settingsRel = PRIVATE ? '.claude/settings.local.json' : '.claude/settings.json';
    const settingsPath = join(TARGET, ...settingsRel.split('/'));
    privateExcludes?.push(settingsRel);
    // The two settings files recognize each other: if the other mode already installed the hook, don't duplicate
    // (Claude Code merges settings.json with local — a duplicate means the Stop reminder fires twice)
    const otherRel = PRIVATE ? '.claude/settings.json' : '.claude/settings.local.json';
    const otherPath = join(TARGET, ...otherRel.split('/'));
    const inOther = (() => { try { return existsSync(otherPath) && readFileSync(otherPath, 'utf8').includes('state-check.mjs'); } catch { return false; } })();
    let settings = {};
    let parseOk = true;
    if (existsSync(settingsPath)) {
      try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); }
      catch { parseOk = false; log(`  ⚠️  ${settingsRel} is not valid JSON — skipping hook install; add to hooks.Stop manually: ${HOOK_CMD}`); }
    }
    if (parseOk) {
      settings.hooks ??= {};
      settings.hooks.Stop ??= [];
      if (inOther) {
        log(`  skip Stop hook${M({
          en: ` (already set in ${otherRel} — the other mode's install still applies)`,
          'zh-TW': `(${otherRel} 已設定 — 另一模式的安裝仍生效)`,
          'zh-CN': `(${otherRel} 已设定 — 另一模式的安装仍生效)`,
          ja: `(${otherRel} に設定済 — もう一方のモードのインストールが有効)`,
        })}`);
      } else if (JSON.stringify(settings.hooks.Stop).includes('state-check.mjs')) {
        log(`  skip ${settingsRel} Stop hook${M({ en: ' (already set)', 'zh-TW': '(已設定)', 'zh-CN': '(已设定)', ja: '(設定済)' })}`);
      } else {
        settings.hooks.Stop.push({ hooks: [{ type: 'command', command: HOOK_CMD }] });
        W.mkdir(dirname(settingsPath));
        if (W.write(settingsPath, JSON.stringify(settings, null, 2) + '\n')) log(`  add  ${settingsRel} ← Stop hook${M({
          en: ' (STATE staleness check)',
          'zh-TW': '(STATE 過期檢查)',
          'zh-CN': '(STATE 过期检查)',
          ja: '(STATE 遅れチェック)',
        })}`);
      }
      // --statusline: the bottom gauge (opt-in). statusLine is a single-value setting — never overwrite someone else's
      if (STATUSLINE) {
        const slInOther = (() => {
          try { return existsSync(otherPath) && JSON.stringify(JSON.parse(readFileSync(otherPath, 'utf8')).statusLine ?? null).includes('statusline.mjs'); }
          catch { return false; }
        })();
        if (slInOther) {
          log(`  skip statusLine${M({
            en: ` (already set in ${otherRel} — the other mode's install still applies)`,
            'zh-TW': `(${otherRel} 已設定 — 另一模式的安裝仍生效)`,
            'zh-CN': `(${otherRel} 已设定 — 另一模式的安装仍生效)`,
            ja: `(${otherRel} に設定済 — もう一方のモードのインストールが有効)`,
          })}`);
        } else if (settings.statusLine && !JSON.stringify(settings.statusLine).includes('statusline.mjs')) {
          log(`  ⚠️  ${settingsRel}${M({
            en: ` already has another statusLine — not overwriting; to switch, set command to: ${SL_CMD}`,
            'zh-TW': ` 已有其他 statusLine,不覆蓋 — 要換請手動設 command 為:${SL_CMD}`,
            'zh-CN': ` 已有其他 statusLine,不覆盖 — 要换请手动设 command 为:${SL_CMD}`,
            ja: ` に別の statusLine が設定済 — 上書きしません。切り替えるには command を次に設定:${SL_CMD}`,
          })}`);
        } else if (settings.statusLine) {
          log(`  skip ${settingsRel} statusLine${M({ en: ' (already set)', 'zh-TW': '(已設定)', 'zh-CN': '(已设定)', ja: '(設定済)' })}`);
        } else {
          if (Array.isArray(settings.hooks?.Stop) && !settings.hooks.Stop.length) {
            delete settings.hooks.Stop;
            if (!Object.keys(settings.hooks).length) delete settings.hooks;
          }
          settings.statusLine = { type: 'command', command: SL_CMD };
          W.mkdir(dirname(settingsPath));
          if (W.write(settingsPath, JSON.stringify(settings, null, 2) + '\n')) log(`  add  ${settingsRel} ← statusLine${M({ en: ' (flightwake gauge)', 'zh-TW': '(flightwake 儀表)', 'zh-CN': '(flightwake 仪表)', ja: '(flightwake ゲージ)' })}`);
        }
      }
    }
  }

  // 4b. Codex (.codex/hooks.json, Stop) and Gemini CLI (.gemini/settings.json, AfterAgent) get the same check.
  //     Neither sets $CLAUDE_PROJECT_DIR; both run hooks with the session cwd, so the repo root comes from git.
  //     --private: these files have no local-only twin (Codex's ~/.codex/hooks.json is per-user, not per-repo) —
  //     write only when the file is untracked and exclude it; a tracked file would carry the trace, so skip and warn.
  for (const [name, rel, event] of [['codex', '.codex/hooks.json', 'Stop'], ['gemini', '.gemini/settings.json', 'AfterAgent']]) {
    if (!ACTIVE.has(name)) continue;
    const p = join(TARGET, ...rel.split('/'));
    if (PRIVATE && existsSync(p) && isTracked(rel)) {
      log(`  ⚠️  --private: ${rel}${M({
        en: ` is git-tracked, writing would leave a trace — skipped; add the ${event} hook yourself: ${HOOK_CMD_GIT}`,
        'zh-TW': ` 受 git 追蹤,寫入會留下痕跡 — 跳過;${event} hook 請自行加:${HOOK_CMD_GIT}`,
        'zh-CN': ` 受 git 追踪,写入会留下痕迹 — 跳过;${event} hook 请自行加:${HOOK_CMD_GIT}`,
        ja: ` は git 管理下のため、書き込むと痕跡が残る — スキップ。${event} hook はご自分で追加:${HOOK_CMD_GIT}`,
      })}`);
      continue;
    }
    let s = {};
    if (existsSync(p)) {
      try { s = JSON.parse(readFileSync(p, 'utf8')); }
      catch { log(`  ⚠️  ${rel} is not valid JSON — skipping hook install; add to hooks.${event} manually: ${HOOK_CMD_GIT}`); continue; }
    }
    s.hooks ??= {};
    s.hooks[event] ??= [];
    if (JSON.stringify(s.hooks[event]).includes('state-check.mjs')) {
      log(`  skip ${rel} ${event} hook${M({ en: ' (already set)', 'zh-TW': '(已設定)', 'zh-CN': '(已设定)', ja: '(設定済)' })}`);
    } else {
      s.hooks[event].push({ hooks: [{ type: 'command', command: HOOK_CMD_GIT }] });
      W.mkdir(dirname(p));
      if (W.write(p, JSON.stringify(s, null, 2) + '\n')) log(`  add  ${rel} ← ${event} hook${M({
        en: ' (STATE staleness check)',
        'zh-TW': '(STATE 過期檢查)',
        'zh-CN': '(STATE 过期检查)',
        ja: '(STATE 遅れチェック)',
      })}`);
    }
    privateExcludes?.push(rel);
  }

  // 5. Trigger-obligation snippet → each active platform's instruction file, in that platform's dialect:
  //    Claude Code invokes skills as `/fw-…`, Codex as `$fw-…`, Gemini CLI activates them by name.
  //    One snippet source per language and profile (notes = the trimmed table); invocation form rewritten per platform.
  //    snippetFile[name] remembers where each platform's block lives, for add-on blocks that follow it (5b).
  const snippetFile = {};
  {
    const LEGACY = 'flightwake 工作紀律';
    const body = readFileSync(join(FW_SRC, 'snippets', LANG, `CLAUDE-md-snippet${NOTES ? '.notes' : ''}.md`), 'utf8').replace(/^<!--[\s\S]*?-->\n?/, '');
    const INVOKE = { claude: (s) => `\`/${s}\``, codex: (s) => `\`$${s}\``, gemini: (s) => `\`${s}\`` };
    const NOTE = {
      codex: M({
        en: 'Codex: the four skills live in `.agents/skills/fw-*` (mention one with `$fw-…`); the wrap-up reminder is the Stop hook in `.codex/hooks.json` — Codex asks you to trust it once.',
        'zh-TW': 'Codex:四個 skill 在 `.agents/skills/fw-*`(用 `$fw-…` 點名);收尾提醒是 `.codex/hooks.json` 的 Stop hook——Codex 首次會要你信任它一次。',
        'zh-CN': 'Codex:四个 skill 在 `.agents/skills/fw-*`(用 `$fw-…` 点名);收尾提醒是 `.codex/hooks.json` 的 Stop hook——Codex 首次会要你信任它一次。',
        ja: 'Codex:4 つの skill は `.agents/skills/fw-*` にある(`$fw-…` で指名);締めのリマインドは `.codex/hooks.json` の Stop hook——初回に Codex が信頼確認を求める。',
      }),
      gemini: M({
        en: 'Gemini CLI: the four skills live in `.agents/skills/fw-*` (activated by name); the wrap-up reminder is the AfterAgent hook in `.gemini/settings.json`.',
        'zh-TW': 'Gemini CLI:四個 skill 在 `.agents/skills/fw-*`(用名字啟用);收尾提醒是 `.gemini/settings.json` 的 AfterAgent hook。',
        'zh-CN': 'Gemini CLI:四个 skill 在 `.agents/skills/fw-*`(用名字启用);收尾提醒是 `.gemini/settings.json` 的 AfterAgent hook。',
        ja: 'Gemini CLI:4 つの skill は `.agents/skills/fw-*` にある(名前で起動);締めのリマインドは `.gemini/settings.json` の AfterAgent hook。',
      }),
    };
    const blockFor = (name) => {
      const dialect = body.replace(/`\/(fw-[a-z]+)`/g, (_, s) => INVOKE[name](s)).trimEnd();
      return `${BEGIN} v${VERSION} lang=${LANG}${NOTES ? ' profile=notes' : ''} -->\n${dialect}${NOTE[name] ? `\n${NOTE[name]}` : ''}\n${END}\n`;
    };
    for (const [name, rels] of Object.entries(GROUPS)) {
      if (!ACTIVE.has(name)) continue;
      const block = blockFor(name);
      const files = rels.map((rel) => ({ rel, path: join(TARGET, ...rel.split('/')) }));
      // --private: writing to a git-tracked file always leaves a trace (exclude has no effect on tracked files).
      // claude has a local equivalent, CLAUDE.local.md → detection still scans the originals, writes go to the local file;
      // other platforms have no equivalent → skip tracked files.
      const localFile = { rel: 'CLAUDE.local.md', path: join(TARGET, 'CLAUDE.local.md') };
      const writeFiles = (PRIVATE && name === 'claude') ? [localFile] : files;
      // Marker scanning recognizes both modes (the claude group always includes CLAUDE.local.md):
      // a --private install followed by a default init must not paste the snippet twice
      const scan = (name === 'claude' ? [...files, localFile] : files).filter((f) => existsSync(f.path));
      const withMarker = scan.find((f) => readFileSync(f.path, 'utf8').includes(BEGIN));
      const withLegacy = scan.find((f) => readFileSync(f.path, 'utf8').includes(LEGACY));
      if (withMarker) {
        snippetFile[name] = withMarker;
        if (privateExcludes && !isTracked(withMarker.rel)) privateExcludes.push(withMarker.rel);
        if (FORCE) {
          const updated = readFileSync(withMarker.path, 'utf8').replace(/<!-- flightwake:begin[\s\S]*?<!-- flightwake:end -->\n?/, block);
          if (W.write(withMarker.path, updated)) log(`  update ${withMarker.rel}${M({ en: ' snippet', 'zh-TW': ' 片段', 'zh-CN': ' 片段', ja: ' スニペット' })}`);
        } else {
          log(`  skip ${withMarker.rel}${M({
            en: ' snippet (installed — --force to update)',
            'zh-TW': ' 片段(已安裝,--force 可更新)',
            'zh-CN': ' 片段(已安装,--force 可更新)',
            ja: ' スニペット(インストール済 — --force で更新)',
          })}`);
        }
      } else if (withLegacy) {
        log(`  skip ${withLegacy.rel}${M({
          en: ' snippet (v0.1 unmarked version detected — delete that section by hand and rerun to upgrade)',
          'zh-TW': ' 片段(偵測到 v0.1 無標記版本 — 手動刪除該段後重跑即可升級)',
          'zh-CN': ' 片段(检测到 v0.1 无标记版本 — 手动删除该段后重跑即可升级)',
          ja: ' スニペット(マーカー無しの v0.1 を検出 — その節を手で消して再実行すれば更新されます)',
        })}`);
      } else {
        const writeExisting = writeFiles.filter((f) => existsSync(f.path));
        const dst = writeExisting[0] ?? writeFiles[writeFiles.length - 1];
        if (PRIVATE && existsSync(dst.path) && isTracked(dst.rel)) {
          log(`  ⚠️  --private: ${dst.rel}${M({
            en: ' is git-tracked, writing would leave a trace — skipped; put the obligation table somewhere untracked yourself',
            'zh-TW': ' 受 git 追蹤,寫入會留下痕跡 — 跳過;觸發義務表請自行放到不進 git 的位置',
            'zh-CN': ' 受 git 追踪,写入会留下痕迹 — 跳过;触发义务表请自行放到不进 git 的位置',
            ja: ' は git 管理下のため、書き込むと痕跡が残る — スキップ。義務表は git に入らない場所へご自分で置いてください',
          })}`);
          continue;
        }
        if (dirname(dst.rel) !== '.') W.mkdir(dirname(dst.path));
        if (!W.append(dst.path, (existsSync(dst.path) ? '\n' : '') + block)) continue;
        snippetFile[name] = dst;
        privateExcludes?.push(dst.rel);
        log(`  add  ${dst.rel} ← ${M({ en: 'obligation table', 'zh-TW': '觸發義務表', 'zh-CN': '触发义务表', ja: '義務表' })}`);
      }
    }
  }

  // 5b. Orca collaboration add-on (opt-in): a marked block next to each platform's obligation table.
  //     --orca adds it where missing; --force/update refreshes blocks that already exist (update never adds).
  {
    const src = join(FW_SRC, 'addons', 'orca', LANG, 'orca-snippet.md');
    const block = `${ORCA_BEGIN} v${VERSION} lang=${LANG} -->\n${readFileSync(src, 'utf8').replace(/^<!--[\s\S]*?-->\n?/, '').trimEnd()}\n${ORCA_END}\n`;
    for (const name of Object.keys(GROUPS)) {
      let f = snippetFile[name];
      if (!f) continue;
      // --private: same rule as every other private write — a git-tracked file would carry the trace.
      // claude has a local twin (CLAUDE.local.md); other platforms have none → skip and say so.
      // The redirect target is checked again: a tracked CLAUDE.local.md is just as visible as a tracked CLAUDE.md.
      if (PRIVATE && name === 'claude' && isTracked(f.rel)) f = { rel: 'CLAUDE.local.md', path: join(TARGET, 'CLAUDE.local.md') };
      if (PRIVATE && isTracked(f.rel)) {
        if (o.orca || readFileSync(f.path, 'utf8').includes(ORCA_BEGIN)) log(`  ⚠️  --private: ${f.rel}${M({
          en: ' is git-tracked, writing would leave a trace — Orca collaboration block skipped',
          'zh-TW': ' 受 git 追蹤,寫入會留下痕跡 — 跳過 Orca 協作區塊',
          'zh-CN': ' 受 git 追踪,写入会留下痕迹 — 跳过 Orca 协作区块',
          ja: ' は git 管理下のため、書き込むと痕跡が残る — Orca 連携ブロックはスキップ',
        })}`);
        continue;
      }
      if (PRIVATE && f.rel === 'CLAUDE.local.md') privateExcludes?.push(f.rel);
      const cur = existsSync(f.path) ? readFileSync(f.path, 'utf8') : '';
      if (cur.includes(ORCA_BEGIN)) {
        if (!FORCE) continue;
        if (W.write(f.path, cur.replace(/<!-- flightwake-orca:begin[\s\S]*?<!-- flightwake-orca:end -->\n?/, block))) log(`  update ${f.rel}${M({ en: ' Orca collaboration block', 'zh-TW': ' Orca 協作區塊', 'zh-CN': ' Orca 协作区块', ja: ' Orca 連携ブロック' })}`);
      } else if (o.orca) {
        if (W.append(f.path, (cur ? '\n' : '') + block)) log(`  add  ${f.rel} ← ${M({ en: 'Orca collaboration block', 'zh-TW': 'Orca 協作區塊', 'zh-CN': 'Orca 协作区块', ja: 'Orca 連携ブロック' })}`);
      }
    }
  }

  // 5c. flightwake-mod (opt-in, Claude Code only). --mod adds it when Claude Code is among the active agents (otherwise
  //     it says so and skips — not an error); --force/update refresh a mod folder that already exists (update never
  //     adds). Shipped files are replaced one by one, so files the user (or the engine) added in that folder stay.
  let modResult = null;
  {
    const dst = join(TARGET, ...MOD_REL.split('/'));
    const existed = existsSync(dst) || isLink(dst);
    if (o.mod && !existed && !ACTIVE.has('claude')) {
      log(`  skip flightwake-mod${M({
        en: ' (the mod is for Claude Code only, and Claude Code is not among the agents set up here — add --agents=claude to use it)',
        'zh-TW': '(mod 只用於 Claude Code,而這次設定的 agent 不含 Claude Code — 要用請加 --agents=claude)',
        'zh-CN': '(mod 只用于 Claude Code,而这次设定的 agent 不含 Claude Code — 要用请加 --agents=claude)',
        ja: '(mod は Claude Code 専用で、今回設定する agent に Claude Code が含まれない — 使うなら --agents=claude を追加)',
      })}`);
    } else if (existed && !FORCE) {
      if (o.mod) log(`  skip ${MOD_REL}${M({ en: ' (exists — --force to update)', 'zh-TW': '(已存在,--force 可更新)', 'zh-CN': '(已存在,--force 可更新)', ja: '(既存 — --force で更新)' })}`);
    } else if (existed || o.mod) {
      noteClobberDir(modSrc(FW_SRC), dst, MOD_REL, modShips);
      if (W.cp(modSrc(FW_SRC), dst, { filter: modShips })) {
        modResult = existed ? 'refreshed' : 'added';
        log(`  ${existed ? 'update' : 'add '} ${MOD_REL}${M({ en: ' (Claude Code mod)', 'zh-TW': '(Claude Code mod)', 'zh-CN': '(Claude Code mod)', ja: '(Claude Code mod)' })}`);
      }
    }
    // Private: the mod folder joins the exclude block like every other artifact (a tracked one is refused in step 6).
    // A plain run on an install that is already private (init --mod after init --private) adds it to that block too.
    if (existed || modResult) {
      if (privateExcludes) privateExcludes.push(`${MOD_REL}/`);
      else if (modResult === 'added') addPrivateExcludes(TARGET, [`${MOD_REL}/`], W);
    }
  }

  // 6. --private: entries written to .git/info/exclude (purely local, never in the repo; worktrees resolved via git).
  //    The header carries profile=notes so a private install with no marker anywhere still remembers its profile.
  if (privateExcludes) {
    const entries = [...new Set(privateExcludes)];
    // Privacy is the point of --private, so its requirements are refusals, not warnings: a tracked artifact can't be
    // excluded, and an exclude file that can't be written (a directory, a symlink, an unreadable path) means no privacy.
    for (const e of entries) {
      const rel = e.replace(/\/$/, '');
      if (isTracked(rel)) W.refuse(join(TARGET, ...rel.split('/')), 'tracked', rel);
    }
    const exBlock = `# flightwake:begin v${VERSION}${NOTES ? ' profile=notes' : ''}\n${entries.join('\n')}\n# flightwake:end\n`;
    const ep = excludePath(TARGET);
    if (W.check(ep, false, 'file')) {
      try {
        W.mkdir(dirname(ep), false, false);
        const cur = existsSync(ep) ? readFileSync(ep, 'utf8') : '';
        const next = cur.includes('# flightwake:begin')
          ? cur.replace(/# flightwake:begin[\s\S]*?# flightwake:end\n?/, exBlock)
          : cur + (cur && !cur.endsWith('\n') ? '\n' : '') + exBlock;
        if (W.write(ep, next, false)) log(`  add  .git/info/exclude ← ${entries.length}${M({ en: ' entries (local ignore)', 'zh-TW': ' 條(本地忽略)', 'zh-CN': ' 条(本地忽略)', ja: ' 件(ローカル ignore)' })}`);
      } catch (e) {
        W.refuse(ep, 'error', `${e.message} — ${M({ en: 'privacy NOT in effect', 'zh-TW': '隱私未生效', 'zh-CN': '隐私未生效', ja: 'プライバシーは無効' })}`);
      }
    }
  }

  // Local edits to framework files were just replaced — name them, so nobody discovers it three versions later.
  if (clobbered.length) {
    log(`\n  ⚠️  ${M({
      en: `${clobbered.length} framework file(s) had local edits and were overwritten (framework files are flightwake-owned; your STATE/DECISIONS/TRAPS/records were untouched). Recover with git diff if you need them:`,
      'zh-TW': `${clobbered.length} 個框架檔有本地修改、已被覆蓋(框架檔歸 flightwake 所有;你的 STATE/DECISIONS/TRAPS/records 未被動)。需要救回請看 git diff:`,
      'zh-CN': `${clobbered.length} 个框架档有本地修改、已被覆盖(框架档归 flightwake 所有;你的 STATE/DECISIONS/TRAPS/records 未被动)。需要救回请看 git diff:`,
      ja: `${clobbered.length} 個のフレームワークファイルにローカルの変更があり、上書きしました(フレームワークファイルは flightwake の管理下。STATE/DECISIONS/TRAPS/records には触れていません)。戻したい場合は git diff を:`,
    })}\n     ${clobbered.join('\n     ')}`);
    log(`     ${M({
      en: 'Want a different language? Reinstall with --lang instead of hand-editing: npx flightwake init --lang=<lang> --force',
      'zh-TW': '想換語言的話,用 --lang 重裝而不是手改:npx flightwake init --lang=<語言> --force',
      'zh-CN': '想换语言的话,用 --lang 重装而不是手改:npx flightwake init --lang=<语言> --force',
      ja: '言語を変えたい場合は手で書き換えず --lang で入れ直す:npx flightwake init --lang=<言語> --force',
    })}`);
  }

  // 7. Cross-repo registry: init and update both register (existing installs enroll on their next update)
  {
    const REGISTRY = registryPath();
    try {
      // Best-effort contract: a registry problem (here, a symlinked registry.json) is a notice, never an install failure,
      // and never a reason to write through the symlink
      if (isLink(REGISTRY)) throw new Error('symlink');
      const reg = readRegistry();
      const today = new Date().toISOString().slice(0, 10);
      reg.repos[TARGET] = { ...(reg.repos[TARGET] ?? { registered: today }), fw_version: VERSION };
      W.mkdir(dirname(REGISTRY), false, false);
      if (W.write(REGISTRY, JSON.stringify(reg, null, 2) + '\n', false)) log(`  reg  ${REGISTRY}${M({ en: ' ← repo registered (cross-repo index)', 'zh-TW': ' ← 已登記(跨 repo 索引)', 'zh-CN': ' ← 已登记(跨 repo 索引)', ja: ' ← 登録済(クロス repo インデックス)' })}`);
    } catch { log(`  ⚠️  ${REGISTRY} could not be updated — skipped (cross-repo tools won't see this repo)`); }
  }

  const gauge = STATUSLINE || (!dry && detectInstall(TARGET).statusline);
  return { writes: [...new Set(writes)], refused: [...new Set(refused)], active: ACTIVE, agentsSkills: AGENTS_SKILLS, mod: modResult, gauge };
}

/** The closing message of a fresh (non-update) install: what to do next, and the opt-ins not taken. */
export function printNext({ lang, private: PRIVATE, statusline: STATUSLINE, langExplicit, marker, log }, { active, agentsSkills, mod, gauge }) {
  const M = makeM(lang);
  const addPaths = ['.flightwake', '.claude',
    ...(agentsSkills ? ['.agents'] : []),
    ...(active.has('codex') ? ['.codex', 'AGENTS.md'] : []),
    ...(active.has('gemini') ? ['.gemini', 'GEMINI.md'] : []),
    ...(active.has('claude') ? ['CLAUDE.md'] : []),
  ].join(' ');
  log(PRIVATE ? M({
    en: `
✅ done (--private). Records stay local; git does not track them. Costs and caveats:
   - Records aren't shared with the repo: teammates and other machines can't see STATE/records (you give up flightwake's sharing value)
   - .git/info/exclude is purely local: after a fresh clone, rerun init --private
   - To go shared again: delete the flightwake block from .git/info/exclude, then git add .flightwake .claude
   Next: open an agent session in this repo and run fw-coldstart — it writes the first STATE from the repo as it is`,
    'zh-TW': `
✅ done(--private)。紀錄只留本機,git 不追蹤。代價與注意:
   - 紀錄不隨 repo 共享:隊友與其他機器看不到 STATE/records(放棄 flightwake 的共享價值)
   - .git/info/exclude 純本地:重新 clone 後需重跑 init --private
   - 想改回共享:刪除 .git/info/exclude 的 flightwake 區塊,再 git add .flightwake .claude
   下一步:在這個 repo 開一個 agent session 跑 fw-coldstart — 它會依 repo 現況寫出第一版 STATE`,
    'zh-CN': `
✅ done(--private)。记录只留本机,git 不追踪。代价与注意:
   - 记录不随 repo 共享:队友与其他机器看不到 STATE/records(放弃 flightwake 的共享价值)
   - .git/info/exclude 纯本地:重新 clone 后需重跑 init --private
   - 想改回共享:删除 .git/info/exclude 的 flightwake 区块,再 git add .flightwake .claude
   下一步:在这个 repo 开一个 agent session 跑 fw-coldstart — 它会依 repo 现况写出第一版 STATE`,
    ja: `
✅ 完了(--private)。記録はローカルのみ、git は追跡しません。代償と注意:
   - 記録は repo と共有されない:チームメイトや別のマシンから STATE/records が見えない(flightwake の共有価値を手放す)
   - .git/info/exclude は純粋にローカル:clone し直したら init --private を再実行
   - 共有に戻すには:.git/info/exclude の flightwake ブロックを削除し、git add .flightwake .claude
   次:この repo で agent セッションを開いて fw-coldstart を実行 — repo の現状から最初の STATE を書きます`,
  }) : M({
    en: `
✅ done. Next:
   1. Open an agent session in this repo and run fw-coldstart — it writes the first STATE from the repo as it is
   2. git add ${addPaths} && git commit`,
    'zh-TW': `
✅ done。下一步:
   1. 在這個 repo 開一個 agent session 跑 fw-coldstart — 它會依 repo 現況寫出第一版 STATE
   2. git add ${addPaths} && git commit`,
    'zh-CN': `
✅ done。下一步:
   1. 在这个 repo 开一个 agent session 跑 fw-coldstart — 它会依 repo 现况写出第一版 STATE
   2. git add ${addPaths} && git commit`,
    ja: `
✅ 完了。次:
   1. この repo で agent セッションを開いて fw-coldstart を実行 — repo の現状から最初の STATE を書きます
   2. git add ${addPaths} && git commit`,
  }));
  // Language was never chosen — English is the documented default, but the alternatives have to be discoverable.
  // No auto-detection on purpose: terminal LANG and the OS locale routinely disagree, and a confident wrong
  // guess is worse than a stated default (field-verified 2026-07-27: LANG=en_US.UTF-8 on a zh_TW machine).
  if (!langExplicit && !marker) log(`   ℹ️  Installed in English. Other languages: ${LANGS.filter((l) => l !== 'en').join(', ')} — e.g. npx flightwake init --lang=zh-TW${STATUSLINE ? ' --statusline' : ''}
       已安裝英文版,要中文/日文請加 --lang(繁中 zh-TW・简中 zh-CN・日本語 ja);已裝好也能改:同指令加 --force`);
  if (mod === 'added') printModNotes({ lang, gauge, log });
  if (!STATUSLINE) log(M({
    en: '   ℹ️  Bottom gauge not installed (opt-in) — if you want it: npx flightwake init --statusline (health / STATE lag / context usage)',
    'zh-TW': '   ℹ️  底部儀表未裝(選配)— 要的話:npx flightwake init --statusline(health/STATE 落後/context 用量)',
    'zh-CN': '   ℹ️  底部仪表未装(选配)— 要的话:npx flightwake init --statusline(health/STATE 落后/context 用量)',
    ja: '   ℹ️  下部ゲージは未インストール(オプトイン)— 欲しい場合:npx flightwake init --statusline(health / STATE の遅れ / context 使用量)',
  }));
}

/**
 * After the mod is added: what has to happen in Claude Code before it loads, how to turn the role guard on (plugin
 * options are not read from project settings, so the installer cannot — TRAPS mod-options-not-read-from-project-settings),
 * and, when the bottom gauge is on too, what each of the two shows.
 */
export function printModNotes({ lang, gauge, log }) {
  const M = makeM(lang);
  const key = '"pluginConfigs": { "flightwake-mod@skills-dir": { "options": { "roleGuard": true } } }';
  log(M({
    en: `   ℹ️  Claude Code mod installed in ${MOD_REL}/ — it needs Claude Code ${MOD_MIN_CLAUDE} or later.
       Start Claude Code from the repo root; the first time, it asks you to trust this folder — the mod loads only after you accept.
       Role guard (off by default): the installer cannot switch it on, because plugin options are not read from project settings.
       Turn it on yourself in Claude Code's /config, or in your user settings (~/.claude/settings.json):
         ${key}
       It is not a security boundary: it only stops the main session's Edit/Write into the deny-write paths of your role; Bash and aliases of a path still get through.`,
    'zh-TW': `   ℹ️  Claude Code mod 已安裝在 ${MOD_REL}/ — 需要 Claude Code ${MOD_MIN_CLAUDE} 以上。
       請從 repo 根目錄啟動 Claude Code;第一次會問你是否信任這個資料夾 — 接受之後 mod 才會載入。
       角色守門(預設關閉):安裝器無法替你開啟,因為外掛選項不會從專案設定讀取。
       請自己在 Claude Code 的 /config 開啟,或寫進你的使用者設定(~/.claude/settings.json):
         ${key}
       它不是安全邊界:只擋主 session 用 Edit/Write 寫入你角色的 deny-write 路徑;Bash 與同一路徑的別名仍然寫得進去。`,
    'zh-CN': `   ℹ️  Claude Code mod 已安装在 ${MOD_REL}/ — 需要 Claude Code ${MOD_MIN_CLAUDE} 以上。
       请从 repo 根目录启动 Claude Code;第一次会问你是否信任这个文件夹 — 接受之后 mod 才会加载。
       角色守门(默认关闭):安装器无法替你开启,因为插件选项不会从项目设置读取。
       请自己在 Claude Code 的 /config 开启,或写进你的用户设置(~/.claude/settings.json):
         ${key}
       它不是安全边界:只挡主 session 用 Edit/Write 写入你角色的 deny-write 路径;Bash 与同一路径的别名仍然写得进去。`,
    ja: `   ℹ️  Claude Code mod を ${MOD_REL}/ にインストールしました — Claude Code ${MOD_MIN_CLAUDE} 以上が必要です。
       Claude Code は repo のルートから起動してください。初回はこのフォルダを信頼するか聞かれます — 承認して初めて mod が読み込まれます。
       ロールガード(既定はオフ):プラグインのオプションはプロジェクト設定から読まれないため、インストーラーではオンにできません。
       Claude Code の /config か、ユーザー設定(~/.claude/settings.json)でご自分でオンに:
         ${key}
       これはセキュリティ境界ではありません:メインセッションの Edit/Write によるロールの deny-write パスへの書き込みを止めるだけで、Bash や同じパスの別名からは書けてしまいます。`,
  }));
  if (gauge) log(M({
    en: '   ℹ️  Bottom gauge and mod together: the bottom gauge shows health / STATE lag / context use; the mod\'s band above the prompt hides those same fields while the gauge is on, so it stays quiet and only toasts once when context runs hot.',
    'zh-TW': '   ℹ️  底部儀表與 mod 並存:health/STATE 落後/context 用量由底部儀表顯示;mod 在輸入框上方的橫條偵測到儀表就隱藏這些欄位、保持安靜,只在 context 過熱時跳一次提示。',
    'zh-CN': '   ℹ️  底部仪表与 mod 并存:health/STATE 落后/context 用量由底部仪表显示;mod 在输入框上方的横条检测到仪表就隐藏这些栏位、保持安静,只在 context 过热时弹一次提示。',
    ja: '   ℹ️  下部ゲージと mod の併用:health / STATE の遅れ / context 使用量は下部ゲージが表示。mod の入力欄の上の帯はゲージがあると同じ欄を隠して静かにし、context が逼迫したときに一度だけトーストを出す。',
  }));
}
