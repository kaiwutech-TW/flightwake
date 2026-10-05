/**
 * Removing a tree flightwake shipped (uninstall, roles remove): the four skills, fw-roles and the Claude Code mod.
 * Only the files flightwake ships are removed, one by one through the guarded writer (so preflight, symlink and
 * outside-the-repo refusals apply), then the directories that leaves empty, deepest first. Whatever is still there —
 * files the person added, files Claude Code wrote, or a directory sitting where flightwake shipped a file — is kept and
 * named: uninstall never deletes what it did not write, and a type mismatch is never "fixed" by a recursive delete.
 * Kept separate from install.mjs because roles.mjs and install.mjs already import each other.
 */
import { existsSync, readdirSync, statSync, lstatSync, rmdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const isJunk = (name) => /^\.(DS_Store|AppleDouble)$/.test(name);
const lstat = (p) => { try { return lstatSync(p); } catch { return null; } };

/** Relative paths of the files in `srcDirs` (union), filtered. */
function shippedFiles(srcDirs, filter) {
  const out = new Set();
  const walk = (dir, rel) => {
    for (const f of readdirSync(dir)) {
      if (isJunk(f)) continue;
      const r = rel ? `${rel}/${f}` : f;
      if (statSync(join(dir, f)).isDirectory()) walk(join(dir, f), r);
      else if (!filter || filter(r)) out.add(r);
    }
  };
  for (const d of srcDirs) if (existsSync(d)) walk(d, '');
  return [...out].sort();
}

/**
 * target: repo root; baseRel: the installed tree ('.claude/skills/fw-record'); srcDirs: where its shipped files come from
 * (every language, so a tree installed in another language is still recognised); W: the guarded writer (W.isDry in a
 * preflight); out: logger; M: localizer.
 */
export function removeShippedTree({ target, baseRel, srcDirs, filter = null, W, out = () => {}, M = (m) => m.en }) {
  const base = join(target, ...baseRel.split('/'));
  const baseStat = lstat(base);
  if (!baseStat) return;
  const shipped = shippedFiles(srcDirs, filter);
  const mismatched = [];
  let removed = 0;
  for (const f of shipped) {
    const p = join(base, ...f.split('/'));
    const st = lstat(p);
    if (!st) continue;
    if (st.isDirectory()) { mismatched.push(f); continue; } // a directory where a file was shipped: not ours to delete
    if (W.rm(p)) removed++;
  }
  if (W.isDry || baseStat.isSymbolicLink()) return;
  const dirs = new Set();
  for (const f of shipped) for (let d = dirname(f); d !== '.'; d = dirname(d)) dirs.add(d);
  for (const d of [...dirs].sort((a, b) => b.split('/').length - a.split('/').length)) {
    const p = join(base, ...d.split('/'));
    const st = lstat(p);
    if (st && st.isDirectory() && !st.isSymbolicLink() && !mismatched.some((m) => m === d || m.startsWith(`${d}/`) || d.startsWith(`${m}/`))) { try { rmdirSync(p); } catch {} }
  }
  try { rmdirSync(base); } catch {}
  if (!existsSync(base)) { if (removed) out(`  rm   ${baseRel}`); return; }
  if (removed) out(`  rm   ${baseRel}/ ${M({ en: `(${removed} shipped file(s))`, 'zh-TW': `(${removed} 個發行檔)`, 'zh-CN': `(${removed} 个发行文件)`, ja: `(配布ファイル ${removed} 件)` })}`);
  const left = [];
  const walk = (dir, rel) => {
    for (const f of readdirSync(dir)) {
      const r = rel ? `${rel}/${f}` : f;
      if (mismatched.includes(r)) continue;
      const st = lstat(join(dir, f));
      if (st && st.isDirectory()) walk(join(dir, f), r); else left.push(r);
    }
  };
  try { walk(base, ''); } catch {}
  const parts = [
    ...left,
    ...mismatched.map((m) => `${m} ${M({ en: '(a directory where flightwake shipped a file — left as is)', 'zh-TW': '(flightwake 發行的是檔案,這裡卻是目錄——原樣保留)', 'zh-CN': '(flightwake 发行的是文件,这里却是目录——原样保留)', ja: '(flightwake はファイルを配布したがディレクトリになっている——そのまま残す)' })}`),
  ];
  out(`  ${M({
    en: `kept ${baseRel}/ — not shipped by flightwake (or not what it shipped), so left in place: ${parts.join(', ')}`,
    'zh-TW': `保留 ${baseRel}/ — 以下不是 flightwake 發行的(或與發行的型別不同),原樣留下:${parts.join(', ')}`,
    'zh-CN': `保留 ${baseRel}/ — 以下不是 flightwake 发行的(或与发行的类型不同),原样留下:${parts.join(', ')}`,
    ja: `${baseRel}/ を残す — flightwake が配布したものではない(または型が違う)ためそのまま:${parts.join(', ')}`,
  })}`);
}
