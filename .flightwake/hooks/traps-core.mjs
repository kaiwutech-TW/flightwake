/**
 * The one TRAPS core, shared by three callers (A5, docs/plans/tripwire-hook.md):
 *   1. the Claude Code mod (hooks/lib/*.ts import this file; types in traps-core.d.mts),
 *   2. the CLI (`bin/traps.mjs` imports it from the package),
 *   3. the plain hook `.flightwake/hooks/trap-check.mjs`, next to which the installer copies this file.
 * Pure functions only: no fs, no process, no `$`, no imports — it must run as a lone file copied into a repo.
 * What it holds: TRAPS.md parsing, repo-relative globs, a small shell-command reader, lexical paths, apply_patch headers,
 * and the matching rule itself (DECISIONS 2026-11-10: only what a call aims at — an edited file, a command prefix, a path
 * a command writes; a path a command only reads or mentions never matches).
 * What it leaves to callers: reading files, settings, language, rendering, dedup, trip records.
 */

// ── TRAPS.md ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// An entry is a frontmatter block (`---` … `---`) followed by its body, up to the next entry's opening `---`. Entries
// without frontmatter (pre-OKF registries) are not entries here — they simply never match.
// Matching fields (both optional; an entry with neither never takes part, and never errors):
//   paths:    ["hooks/**", "*.sql"]      repo-relative globs, checked against the files a call writes
//   commands: ["git push", "npm publish"] command-token prefixes, checked against shell commands
// No regex is ever taken from user data. Missing `status` → active; missing `confidence` → unknown (a lead); an entry
// whose text still holds a `{{…}}` placeholder is template residue and skipped. Unknown fields (`retire_when`, …) are
// ignored, so older readers tolerate newer entries (DECISIONS 2026-07-18).

const ENTRY_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n([\s\S]*?)(?=^---[ \t]*\r?\n[A-Za-z_][\w-]*:|(?![\s\S]))/gm;

/** `key: value` lines → record; `# comment` tails and surrounding quotes removed; nested/continuation lines ignored. */
export function parseFlatYaml(block) {
  const out = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m || m[1] === undefined) continue;
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

/** FNV-1a 32-bit, hex — a cheap content version for dedup keys (not a security hash). */
export function contentHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Entries in file order. `version` hashes frontmatter + body, so an edited entry counts as new for dedup. */
export function parseTraps(text) {
  const out = [];
  // Drop HTML comments first: the shipped header documents the format with example frontmatter-like lines.
  // Repeat until nothing changes: one pass can join the text around a removed comment into a new `<!--`.
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

// ── Globs ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Repo-relative glob matching for TRAPS `paths:` and roles `deny-write:`. `**` any number of path segments, `*` within
// one segment, `?` one character; everything else literal. A pattern with no `/` matches the basename at any depth
// (gitignore-style: `*.sql` hits `db/x.sql`); a trailing `/` means "this directory and everything under it". A leading
// `./` or `/` on the pattern is dropped (patterns are always repo-relative).

/** A pattern as matched: trimmed, leading `./` and `/` dropped, a trailing `/` turned into `/**`. */
export const normGlob = (g) => { let p = g.trim().replace(/^\.\//, '').replace(/^\/+/, ''); if (p.endsWith('/')) p += '**'; return p; };

const globCache = new Map();
/** The RegExp a glob compiles to (cached). */
export function globRegExp(pattern) {
  const hit = globCache.get(pattern);
  if (hit) return hit;
  const p = normGlob(pattern);
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        // `**/` → zero or more segments; a bare `**` → anything
        if (p[i + 2] === '/') { re += '(?:[^/]+/)*'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const out = new RegExp(!p.includes('/') ? `^(?:.*/)?${re}$` : `^${re}$`);
  globCache.set(pattern, out);
  return out;
}

/** Whether repo-relative `path` matches `pattern`. An empty pattern never matches. */
export function matchGlob(pattern, path) {
  if (!pattern.trim()) return false;
  return globRegExp(pattern).test(path.replace(/^\.\//, ''));
}

/** The first pattern that matches, or null. */
export const matchAny = (patterns, path) => patterns.find((p) => matchGlob(p, path)) ?? null;

// ── Paths ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `abs` relative to `root` with forward slashes, or null when it lies outside root. A relative `abs` is taken from
 * `root`. Purely lexical: collapses `.`/`..` segments; does not resolve links.
 */
export function relToRoot(root, abs) {
  const norm = (p) => {
    const out = [];
    for (const seg of p.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') out.pop();
      else out.push(seg);
    }
    return out;
  };
  const r = norm(root);
  const a = norm(abs.startsWith('/') ? abs : `${root}/${abs}`);
  if (a.length < r.length || r.some((s, i) => a[i] !== s)) return null;
  return a.slice(r.length).join('/');
}

// ── Shell ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A deliberately small shell-command reader. It is NOT a shell parser: it splits on top-level control operators outside
// quotes and tokenizes each simple command. Anything it can't read plainly is flagged (`isComplex`) so callers can stay
// conservative.

const OPS = ['&&', '||', ';;', '|&', ';', '|', '&', '\n'];

/** Segments (one per simple command, with the operator that ended it) and whether anything was not plainly readable. */
export function parseCommand(command) {
  const segments = [];
  let isComplex = false;
  let tokens = [];
  let cur = '';
  let hasCur = false;
  let quote = '';
  const pushWord = () => {
    if (hasCur) tokens.push(cur);
    cur = '';
    hasCur = false;
  };
  const endSegment = (op) => {
    pushWord();
    const env = [];
    while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) env.push(tokens.shift());
    if (tokens.length || env.length) segments.push({ tokens, env, op });
    else if (segments.length && op) segments[segments.length - 1].op = op;
    tokens = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = '';
      else if (c === '\\' && quote === '"' && i + 1 < command.length) cur += command[++i];
      else {
        if (quote === '"' && (c === '`' || (c === '$' && command[i + 1] === '('))) isComplex = true;
        cur += c;
      }
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      hasCur = true;
      continue;
    }
    if (c === '\\' && i + 1 < command.length) {
      if (command[i + 1] === '\n') { i++; continue; } // line continuation
      cur += command[++i];
      hasCur = true;
      continue;
    }
    // `$( … )` and backticks: command substitution stays inside the word (nested parens counted)
    if (c === '$' && command[i + 1] === '(') {
      isComplex = true;
      let depth = 0;
      for (; i < command.length; i++) {
        const d = command[i];
        cur += d;
        if (d === '(') depth++;
        else if (d === ')' && --depth === 0) break;
      }
      hasCur = true;
      continue;
    }
    if (c === '`') {
      isComplex = true;
      const close = command.indexOf('`', i + 1);
      const end = close < 0 ? command.length - 1 : close;
      cur += command.slice(i, end + 1);
      i = end;
      hasCur = true;
      continue;
    }
    // A bare `(` / `)` opens / closes a subshell: an explicit marker segment, so the commands inside stay visible
    if (c === '(' || c === ')') {
      isComplex = true;
      endSegment('');
      segments.push({ tokens: [], env: [], op: '', group: c === '(' ? 'open' : 'close' });
      continue;
    }
    if (c === '<' && command[i + 1] === '<') isComplex = true;
    // `&` inside a redirection (`2>&1`, `>&2`, `<&3`, `&>file`, `&>>file`) is part of the word, not an operator
    const isRedirAmp = c === '&' && (command[i - 1] === '>' || command[i - 1] === '<' || command[i + 1] === '>');
    const op = isRedirAmp ? undefined : OPS.find((o) => command.startsWith(o, i));
    if (op) {
      endSegment(op === '|&' ? '|' : op === ';;' ? ';' : op);
      i += op.length - 1;
      continue;
    }
    if (c === ' ' || c === '\t') {
      pushWord();
      continue;
    }
    if (c === '#' && !hasCur) {
      // a comment runs to the end of its line only; the newline itself still ends the segment
      while (i + 1 < command.length && command[i + 1] !== '\n') i++;
      continue;
    }
    cur += c;
    hasCur = true;
  }
  if (quote) isComplex = true;
  endSegment('');
  return { segments, isComplex };
}

/** True when the tokens start with every token of `prefix` (whitespace-separated), compared exactly. */
export function startsWithTokens(tokens, prefix) {
  const p = prefix.trim().split(/\s+/).filter(Boolean);
  return p.length > 0 && p.length <= tokens.length && p.every((t, i) => tokens[i] === t);
}

/** A word that can only be a path as written: no expansions, no globs, not a device, not a descriptor. */
export const isPathWord = (w) =>
  typeof w === 'string' && w !== '' && !/[$`*?[\]{}~]/.test(w) && !w.startsWith('/dev/') && !w.startsWith('&') && !w.startsWith('-');

/**
 * Splits a command's arguments by its own option grammar: flags that take a value consume it (attached or as the next
 * word), `--` ends options, everything else is an operand. `withValue` lists the short and long options that take a value.
 */
function operands(args, withValue) {
  const out = [];
  const values = {};
  const keep = (k, v) => { (values[k] ??= []).push(v); };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { out.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const [name, eq] = a.includes('=') ? [a.slice(2, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a.slice(2), undefined];
      if (withValue.long.includes(name)) keep(name, eq ?? (args[++i] ?? ''));
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      // a cluster of short flags; the first one that takes a value takes the rest of the word or the next word
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if (withValue.short.includes(f)) { keep(f, j + 1 < a.length ? a.slice(j + 1) : (args[++i] ?? '')); break; }
      }
      continue;
    }
    out.push(a);
  }
  return { operands: out, values };
}

const joinDir = (dir, name) => `${dir.replace(/\/+$/, '')}/${name.replace(/^.*\//, '')}`;

/**
 * The write targets plainly readable from one segment's words: output redirections (`>f`, `>> f`, `2>f`, `&>f`; not
 * fd duplications like `2>&1`, not /dev/*), and the operands of cp/mv (destination, or each source joined to `-t DIR`;
 * mv also its sources), rm, tee and `sed -i`, each read with that command's option grammar so option values (sed
 * -e/-f scripts, -S suffixes, …) never pass for paths. Words with expansions or globs are skipped. `cd` writes nothing.
 */
export function segmentWrites(t) {
  const out = [];
  const add = (path, via, effect = 'write') => { if (isPathWord(path)) out.push({ path, via, effect }); };
  const words = [];
  for (let i = 0; i < t.length; i++) {
    const tok = t[i];
    const m = /^(?:\d*|&)(>>?)(.*)$/.exec(tok);
    if (m) {
      const via = m[1];
      const rest = m[2];
      if (rest === '') add(t[++i], via); // `> file`
      else if (!rest.startsWith('&')) add(rest, via); // `>file`; `>&2` duplicates a descriptor
      continue;
    }
    if (/^\d*<.*/.test(tok)) { if (tok.replace(/^\d*</, '') === '') i++; continue; } // input redirection: skip its word
    words.push(tok);
  }
  const [cmd, ...args] = words;
  if (cmd === 'cp' || cmd === 'mv') {
    const { operands: o, values } = operands(args, { short: 'tS', long: ['target-directory', 'suffix', 'backup'] });
    const into = values.t?.[0] ?? values['target-directory']?.[0];
    if (into !== undefined) {
      if (isPathWord(into)) for (const src of o) { if (cmd === 'mv') add(src, 'mv', 'remove'); if (isPathWord(src)) add(joinDir(into, src), cmd); }
    } else if (o.length >= 2) {
      if (cmd === 'mv') for (const src of o.slice(0, -1)) add(src, 'mv', 'remove');
      add(o[o.length - 1], cmd);
    }
  } else if (cmd === 'rm') {
    for (const a of operands(args, { short: '', long: [] }).operands) add(a, 'rm', 'remove');
  } else if (cmd === 'tee') {
    for (const a of operands(args, { short: '', long: [] }).operands) add(a, 'tee');
  } else if (cmd === 'sed') {
    // -i takes its suffix only when attached (GNU) — except BSD's separate empty word (`-i ''`), which is dropped here
    const hasInPlace = args.some((a) => a === '-i' || /^-i./.test(a) || a === '--in-place' || a.startsWith('--in-place='));
    if (hasInPlace) {
      const cleaned = args.filter((a, i) => !(a === '' && args[i - 1] === '-i'));
      const { operands: o, values } = operands(cleaned.map((a) => (/^-i./.test(a) ? '-i' : a)), { short: 'efl', long: ['expression', 'file', 'line-length'] });
      // with -e/-f the script is an option value, so every operand is a file; otherwise the first operand is the script
      const files = values.e || values.f || values.expression || values.file ? o : o.slice(1);
      for (const f of files) add(f, 'sed -i');
    }
  }
  return out;
}

// ── apply_patch (Codex) ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The files an apply_patch envelope touches, from its headers only: `*** Add File:`, `*** Update File:`,
 * `*** Delete File:` and `*** Move to:` (the destination of a rename). Paths are as written (absolute or relative).
 */
export function patchPaths(patch) {
  const out = [];
  for (const line of String(patch).split(/\r?\n/)) {
    const m = /^\*\*\* (?:Add File|Update File|Delete File|Move to):\s*(.+?)\s*$/.exec(line);
    if (m && m[1] && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

// ── Matching (DECISIONS 2026-11-10) ──────────────────────────────────────────────────────────────────────────────────
// A hit is { entry, via }: `via` is the repo-relative path or the command prefix that matched. Each entry hits at most
// once per call. Callers decide what to do with hits (hint, record, dedup).

/** Entries whose `paths` match a written file (absolute, or relative to `root`). */
export function matchFile(entries, root, filePath) {
  const rel = relToRoot(root, filePath);
  if (rel === null || rel === '') return [];
  const out = [];
  for (const entry of entries) if (entry.paths.length && matchAny(entry.paths, rel) !== null) out.push({ entry, via: rel });
  return out;
}

/** Entries whose `paths` match any of the files (each absolute, or relative to `cwd`). */
export function matchFiles(entries, root, cwd, filePaths) {
  const out = new Map();
  for (const f of filePaths) {
    for (const hit of matchFile(entries, root, f.startsWith('/') ? f : `${cwd}/${f}`)) if (!out.has(hit.entry)) out.set(hit.entry, hit);
  }
  return [...out.values()];
}

/**
 * Coarse match used once the cwd is no longer tracked: does `glob` match the path word itself or any tail of the
 * glob match it (`pkg/src/**` → `src/**` → `**`)? Leans to hinting — once per entry per session.
 */
function tailMatch(globs, word) {
  const w = word.replace(/^\.\//, '');
  for (const g of globs) {
    const segs = g.replace(/^\.?\//, '').split('/');
    for (let k = 0; k < segs.length; k++) {
      const tail = segs.slice(k).join('/');
      if (tail && tail !== '**' && matchAny([tail], w) !== null) return true;
    }
  }
  return false;
}

/** At most this many possible cwds are tracked; past it, matching degrades to glob tails (no cwd at all). */
const MAX_CWDS = 16;

/**
 * A shell command: only what it aims at — a segment's command prefix (`commands`), or a path a segment writes (`paths`):
 * output redirections, cp/mv/tee/rm and `sed -i` (segmentWrites). A path the command only reads or mentions
 * (`cat db/x.sql`, `grep -n x db/`, `git diff -- db/`) never matches. A written path is resolved against every directory
 * the shell could be in; when the cwd is uncertain this leans to matching:
 * - only a plain chain `cd X && …` is a certain move (the set of cwds is replaced);
 * - a `cd` followed by `||`, `&`, `|`, `;` or a newline, or after any such operator, may or may not have moved this
 *   shell: the moved directories are ADDED to the set;
 * - `( … )` subshells are walked: inside, cds apply as above; after the `)`, the set from before the `(` is back;
 * - a `cd` that can't be resolved without guessing (`cd -`, `~`, `$VAR`, bare `cd`) leaves the set as it is;
 * - the set is bounded (MAX_CWDS): past it, matching degrades to glob tails (tailMatch) for the rest.
 */
export function matchBash(entries, root, cwd0, command) {
  const parsed = parseCommand(command);
  const out = new Map();
  let cwds = new Set([cwd0]); // null = degraded: cwd no longer tracked
  let isCertain = true;
  const stack = [];
  for (const seg of parsed.segments) {
    if (seg.group === 'open') {
      stack.push({ cwds: cwds === null ? null : new Set(cwds), isCertain });
      continue;
    }
    if (seg.group === 'close') {
      const saved = stack.pop();
      if (saved) ({ cwds, isCertain } = saved);
      if (seg.op && seg.op !== '&&') isCertain = false;
      continue;
    }
    const writes = segmentWrites(seg.tokens);
    for (const entry of entries) {
      if (out.has(entry)) continue;
      const prefix = entry.commands.find((p) => startsWithTokens(seg.tokens, p));
      if (prefix !== undefined) { out.set(entry, prefix.trim().split(/\s+/).join(' ')); continue; }
      if (!entry.paths.length) continue;
      search: for (const { path: word } of writes) {
        if (word.startsWith('/')) {
          const rel = relToRoot(root, word);
          if (rel !== null && rel !== '' && matchAny(entry.paths, rel) !== null) { out.set(entry, rel); break search; }
          continue;
        }
        if (cwds === null) {
          if (tailMatch(entry.paths, word)) { out.set(entry, word); break search; }
          continue;
        }
        for (const cwd of cwds) {
          const rel = relToRoot(root, `${cwd}/${word}`);
          if (rel !== null && rel !== '' && matchAny(entry.paths, rel) !== null) { out.set(entry, rel); break search; }
        }
      }
    }
    if (seg.tokens[0] === 'cd' && cwds !== null) {
      const args = seg.tokens[1] === '--' ? seg.tokens.slice(2) : seg.tokens.slice(1);
      const dir = args[0];
      const isResolvable = args.length === 1 && dir !== undefined && dir !== '-' && !dir.startsWith('~') && !dir.includes('$');
      if (isResolvable) {
        const moved = [...cwds].map((c) => (dir.startsWith('/') ? dir : `${c}/${dir}`));
        const next = isCertain && seg.op === '&&' ? new Set(moved) : new Set([...cwds, ...moved]);
        cwds = next.size > MAX_CWDS ? null : next;
      }
    }
    if (seg.op && seg.op !== '&&') isCertain = false;
  }
  return [...out].map(([entry, via]) => ({ entry, via }));
}
