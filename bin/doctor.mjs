/**
 * flightwake doctor — read-only check of the install structure. Writes nothing, never touches the network, runs
 * only read-only git plumbing (rev-parse / ls-files / check-ignore; not `git status`, which may refresh the index),
 * plus `claude --version` when the Claude Code mod is installed (to compare with the version the mod needs).
 * It can say "the install is structurally right"; it cannot say a hook actually fires at runtime — Codex in
 * particular only loads project hooks for exactly-trusted paths, which no file inspection can confirm
 * (TRAPS codex-project-trust-exact-path), so that is printed as a hint, neither pass nor fail.
 * Output: one line per check, ok / warn / fail. Exit 1 on any fail, 0 otherwise.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  LANGS, GROUPS, INSTRUCTION_CANDIDATES, HOOK_CMD, HOOK_CMD_GIT, SL_CMD, MOD_REL, MOD_MIN_CLAUDE, makeM, gitIn, gitAvailable,
  repoState, readMarkers, detectInstall, modShipList, modSrc,
} from './install.mjs';

/** Placeholder lines of the shipped STATE templates (every language). Only these count as "unfilled" — user
 *  content may legitimately contain {{…}} examples. Matched as whole trimmed lines. */
export function templatePlaceholderLines(fwSrc) {
  const set = new Set();
  for (const l of LANGS) {
    const p = join(fwSrc, 'templates', l, 'STATE.md');
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) if (line.includes('{{')) set.add(line.trim());
  }
  return set;
}

export function runDoctor({ target, fwSrc, version, lang, log }) {
  const M = makeM(lang);
  const rows = [];
  const add = (level, text) => rows.push({ level, text });
  const ok = (t) => add('ok', t);
  const warn = (t) => add('warn', t);
  const fail = (t) => add('fail', t);
  const info = (t) => add('info', t);
  const at = (rel) => join(target, ...rel.split('/'));
  const readJson = (rel) => { try { return { ok: true, value: JSON.parse(readFileSync(at(rel), 'utf8')) }; } catch { return { ok: false }; } };

  // ── environment ──
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor >= 18) ok(`Node ${process.versions.node}`);
  else fail(M({ en: `Node ${process.versions.node} — flightwake needs Node ≥18`, 'zh-TW': `Node ${process.versions.node} — flightwake 需要 Node ≥18`, 'zh-CN': `Node ${process.versions.node} — flightwake 需要 Node ≥18`, ja: `Node ${process.versions.node} — flightwake には Node ≥18 が必要` }));
  const hasGit = gitAvailable();
  if (hasGit) ok(M({ en: 'git is installed', 'zh-TW': 'git 已安裝', 'zh-CN': 'git 已安装', ja: 'git はインストール済' }));
  else fail(M({ en: 'git not found on PATH — install git (see `npx flightwake init` for per-platform hints)', 'zh-TW': 'PATH 找不到 git — 請安裝 git(各平台指引見 `npx flightwake init`)', 'zh-CN': 'PATH 找不到 git — 请安装 git(各平台指引见 `npx flightwake init`)', ja: 'PATH に git がない — git をインストールしてください(各 OS の手順は `npx flightwake init` 参照)' }));
  const repo = repoState(target);
  const isRoot = repo.kind === 'root';
  if (isRoot) ok(M({ en: 'current directory is the git root', 'zh-TW': '目前目錄是 git root', 'zh-CN': '当前目录是 git root', ja: '現在のディレクトリは git root' }));
  else if (repo.kind === 'sub') fail(M({ en: `not the git root — run doctor in ${repo.root}`, 'zh-TW': `不是 git root — 請在 ${repo.root} 執行 doctor`, 'zh-CN': `不是 git root — 请在 ${repo.root} 执行 doctor`, ja: `git root ではない — ${repo.root} で doctor を実行` }));
  else fail(M({ en: 'not a git repo', 'zh-TW': '不是 git repo', 'zh-CN': '不是 git repo', ja: 'git repo ではない' }));
  const git = hasGit && isRoot ? gitIn(target) : null;
  const isTracked = (rel) => { try { return !!git && git('ls-files', '--', rel) !== ''; } catch { return false; } };

  // ── .flightwake data ──
  const installed = existsSync(at('.flightwake'));
  if (!installed) {
    fail(M({ en: '.flightwake/ missing — not installed here (npx flightwake setup)', 'zh-TW': '缺 .flightwake/ — 這裡沒有安裝(npx flightwake setup)', 'zh-CN': '缺 .flightwake/ — 这里没有安装(npx flightwake setup)', ja: '.flightwake/ がない — 未インストール(npx flightwake setup)' }));
    return report(rows, log, M);
  }
  ok('.flightwake/');
  const det = detectInstall(target);
  if (!existsSync(at('.flightwake/STATE.md'))) {
    fail(M({ en: '.flightwake/STATE.md missing', 'zh-TW': '缺 .flightwake/STATE.md', 'zh-CN': '缺 .flightwake/STATE.md', ja: '.flightwake/STATE.md がない' }));
  } else {
    const state = readFileSync(at('.flightwake/STATE.md'), 'utf8');
    const placeholders = templatePlaceholderLines(fwSrc);
    const unfilled = state.split('\n').filter((l) => placeholders.has(l.trim())).length;
    if (unfilled) {
      warn(M({
        en: `STATE.md still has ${unfilled} unfilled template field(s) — open an agent session and run fw-coldstart to write the first STATE`,
        'zh-TW': `STATE.md 仍有 ${unfilled} 個未填的範本欄位 — 開 agent session 跑 fw-coldstart 寫出第一版 STATE`,
        'zh-CN': `STATE.md 仍有 ${unfilled} 个未填的模板栏位 — 开 agent session 跑 fw-coldstart 写出第一版 STATE`,
        ja: `STATE.md に未記入のテンプレート欄が ${unfilled} 個 — agent セッションで fw-coldstart を実行し最初の STATE を書く`,
      }));
    } else {
      ok('STATE.md');
      const rec = /^latest_record:\s*(\S+)/m.exec(state)?.[1];
      if (!rec || /^(none|-|~|null)$/i.test(rec)) info(M({ en: 'no record yet (latest_record is empty)', 'zh-TW': '尚無 record(latest_record 為空)', 'zh-CN': '尚无 record(latest_record 为空)', ja: 'record はまだない(latest_record が空)' }));
      else if (existsSync(at(`.flightwake/${rec}`))) ok(`latest_record → ${rec}`);
      else warn(M({ en: `latest_record points to ${rec}, which does not exist`, 'zh-TW': `latest_record 指向的 ${rec} 不存在`, 'zh-CN': `latest_record 指向的 ${rec} 不存在`, ja: `latest_record の指す ${rec} が存在しない` }));
    }
  }

  // ── markers ──
  const markers = readMarkers(target).filter((m) => !m.orphanOrca);
  const platformOf = (rel) => (rel === 'AGENTS.md' ? 'codex' : rel === 'GEMINI.md' ? 'gemini' : 'claude');
  const markerPlatforms = new Set(markers.map((m) => platformOf(m.rel)));
  // Platforms are also derived from what is installed — otherwise deleting a marker would make that platform's
  // broken hook file vanish from the checks. A hook file that mentions state-check, or that no longer parses
  // (can't tell, so check it), counts as evidence; so do .agents/skills/fw-* (Codex or Gemini).
  const rawHas = (rel, needle) => { try { return readFileSync(at(rel), 'utf8').includes(needle); } catch { return false; } };
  const parses = (rel) => !existsSync(at(rel)) || readJson(rel).ok;
  const artifactEvidence = {
    codex: rawHas('.codex/hooks.json', 'state-check.mjs') || !parses('.codex/hooks.json') ? '.codex/hooks.json' : null,
    gemini: rawHas('.gemini/settings.json', 'state-check.mjs') || !parses('.gemini/settings.json') ? '.gemini/settings.json' : null,
  };
  const platforms = new Set([...markerPlatforms, ...Object.keys(artifactEvidence).filter((k) => artifactEvidence[k])]);
  for (const [name, ev] of Object.entries(artifactEvidence)) {
    if (!ev || markerPlatforms.has(name)) continue;
    const file = GROUPS[name][0];
    const tracked = det.private && existsSync(at(file)) && isTracked(file);
    (tracked ? warn : fail)(tracked
      ? M({ en: `${ev} is installed but ${file} has no obligation table (--private skips a git-tracked ${file})`, 'zh-TW': `${ev} 已安裝,但 ${file} 沒有義務表(--private 會跳過受追蹤的 ${file})`, 'zh-CN': `${ev} 已安装,但 ${file} 没有义务表(--private 会跳过受追踪的 ${file})`, ja: `${ev} はインストール済だが ${file} に義務表がない(--private は git 管理下の ${file} を飛ばす)` })
      : M({ en: `inconsistent install: ${ev} is installed but ${file} has no flightwake marker block — npx flightwake init --agents=… --force`, 'zh-TW': `安裝不一致:${ev} 已安裝,但 ${file} 沒有 flightwake 標記區塊 — npx flightwake init --agents=… --force`, 'zh-CN': `安装不一致:${ev} 已安装,但 ${file} 没有 flightwake 标记区块 — npx flightwake init --agents=… --force`, ja: `インストールの不整合:${ev} はあるが ${file} に flightwake のマーカーブロックがない — npx flightwake init --agents=… --force` }));
  }
  const agentsSkillDirs = existsSync(at('.agents/skills')) && readdirSync(at('.agents/skills')).some((d) => d.startsWith('fw-'));
  if (agentsSkillDirs && !platforms.has('codex') && !platforms.has('gemini')) {
    warn(M({ en: 'inconsistent install: .agents/skills/fw-* exists but neither Codex nor Gemini CLI has a marker or hook', 'zh-TW': '安裝不一致:有 .agents/skills/fw-*,但 Codex 與 Gemini CLI 都沒有標記區塊或 hook', 'zh-CN': '安装不一致:有 .agents/skills/fw-*,但 Codex 与 Gemini CLI 都没有标记区块或 hook', ja: 'インストールの不整合:.agents/skills/fw-* があるが Codex にも Gemini CLI にもマーカーや hook がない' }));
  }
  if (!markers.length) {
    if (det.private) warn(M({ en: 'no obligation table in any instruction file (a --private install skips git-tracked files)', 'zh-TW': '所有指令檔都沒有義務表(--private 會跳過受 git 追蹤的檔)', 'zh-CN': '所有指令档都没有义务表(--private 会跳过受 git 追踪的档)', ja: 'どの指示ファイルにも義務表がない(--private は git 管理下のファイルを飛ばす)' }));
    else fail(M({ en: 'no flightwake marker block in CLAUDE.md / AGENTS.md / GEMINI.md — rerun npx flightwake init', 'zh-TW': 'CLAUDE.md / AGENTS.md / GEMINI.md 都沒有 flightwake 標記區塊 — 請重跑 npx flightwake init', 'zh-CN': 'CLAUDE.md / AGENTS.md / GEMINI.md 都没有 flightwake 标记区块 — 请重跑 npx flightwake init', ja: 'CLAUDE.md / AGENTS.md / GEMINI.md に flightwake のマーカーブロックがない — npx flightwake init を再実行' }));
  } else {
    for (const m of markers) ok(`${m.rel}: v${m.version} lang=${m.lang} profile=${m.profile}`);
    const differ = (k) => new Set(markers.map((m) => m[k])).size > 1;
    const diffs = ['version', 'lang', 'profile'].filter(differ);
    if (diffs.length) warn(M({ en: `markers disagree on ${diffs.join('/')} (the first one wins: ${markers[0].rel}) — npx flightwake update`, 'zh-TW': `各標記的 ${diffs.join('/')} 不一致(以第一個為準:${markers[0].rel})— npx flightwake update`, 'zh-CN': `各标记的 ${diffs.join('/')} 不一致(以第一个为准:${markers[0].rel})— npx flightwake update`, ja: `マーカー間で ${diffs.join('/')} が不一致(先頭を採用:${markers[0].rel})— npx flightwake update` }));
    if (markers.some((m) => m.version !== version)) warn(M({ en: `installed v${markers[0].version}, this package is v${version} — npx flightwake update`, 'zh-TW': `已安裝 v${markers[0].version},目前套件 v${version} — npx flightwake update`, 'zh-CN': `已安装 v${markers[0].version},当前套件 v${version} — npx flightwake update`, ja: `インストール済 v${markers[0].version}、このパッケージは v${version} — npx flightwake update` }));
  }

  // ── skills: .claude/skills is installed unconditionally; .agents/skills when Codex/Gemini carries a marker ──
  const skillNames = readdirSync(join(fwSrc, 'skills', 'en')).filter((s) => statSync(join(fwSrc, 'skills', 'en', s)).isDirectory());
  const bases = ['.claude/skills', ...(platforms.has('codex') || platforms.has('gemini') ? ['.agents/skills'] : [])];
  for (const base of bases) {
    const missing = skillNames.filter((s) => !existsSync(at(`${base}/${s}/SKILL.md`)));
    if (missing.length) fail(M({ en: `${base}: missing ${missing.join(', ')} — npx flightwake update`, 'zh-TW': `${base}:缺 ${missing.join(', ')} — npx flightwake update`, 'zh-CN': `${base}:缺 ${missing.join(', ')} — npx flightwake update`, ja: `${base}:${missing.join(', ')} がない — npx flightwake update` }));
    else ok(`${base}: ${skillNames.join(', ')}`);
  }

  // ── hooks: exact command, right event, no duplicates, script present ──
  const hookScript = existsSync(at('.flightwake/hooks/state-check.mjs'));
  if (hookScript) ok('.flightwake/hooks/state-check.mjs');
  else fail(M({ en: '.flightwake/hooks/state-check.mjs missing — npx flightwake update', 'zh-TW': '缺 .flightwake/hooks/state-check.mjs — npx flightwake update', 'zh-CN': '缺 .flightwake/hooks/state-check.mjs — npx flightwake update', ja: '.flightwake/hooks/state-check.mjs がない — npx flightwake update' }));
  // Collect every hook entry mentioning state-check.mjs, per event, from one settings file. Structure problems on
  // the path to our hook are findings, reported one by one — never an exception.
  const hookEntries = (value, rel, wantEvent) => {
    const out = [];
    const problems = [];
    const mentions = (x) => JSON.stringify(x ?? null).includes('state-check.mjs');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return { out, problems: [`${rel}: top level is not a JSON object`] };
    if (value.hooks === undefined) return { out, problems };
    if (value.hooks === null || typeof value.hooks !== 'object' || Array.isArray(value.hooks)) return { out, problems: [`${rel}: "hooks" is not an object`] };
    for (const [event, list] of Object.entries(value.hooks)) {
      if (!Array.isArray(list)) { if (mentions(list) || event === wantEvent) problems.push(`${rel}: hooks.${event} is not an array`); continue; }
      list.forEach((e, i) => {
        if (!e || typeof e !== 'object' || !Array.isArray(e.hooks)) { if (mentions(e) || event === wantEvent) problems.push(`${rel}: hooks.${event}[${i}].hooks is not an array`); return; }
        for (const h of e.hooks) if (h && typeof h === 'object' && String(h.command ?? '').includes('state-check.mjs')) out.push({ event, command: h.command, type: h.type });
      });
    }
    return { out, problems };
  };
  const checkHook = (label, files, wantEvent, wantCmd, { optionalIfTracked = false } = {}) => {
    let found = [];
    let broken = false;
    for (const rel of files) {
      if (!existsSync(at(rel))) continue;
      const j = readJson(rel);
      if (!j.ok) { fail(M({ en: `${rel} is not valid JSON`, 'zh-TW': `${rel} 不是合法 JSON`, 'zh-CN': `${rel} 不是合法 JSON`, ja: `${rel} は不正な JSON` })); broken = true; continue; }
      const { out, problems } = hookEntries(j.value, rel, wantEvent);
      for (const pr of problems) fail(M({ en: `${pr} — cannot read the hook registration`, 'zh-TW': `${pr} — 無法讀取 hook 登記`, 'zh-CN': `${pr} — 无法读取 hook 登记`, ja: `${pr} — hook の登録を読めない` }));
      if (problems.length) broken = true;
      found = found.concat(out.map((h) => ({ ...h, rel })));
    }
    if (broken) return;
    const isExact = (h) => h.event === wantEvent && h.command === wantCmd && h.type === 'command';
    const exact = found.filter(isExact);
    const wrong = found.filter((h) => !isExact(h));
    for (const h of wrong) {
      if (h.event === wantEvent && h.command === wantCmd) {
        fail(M({ en: `${h.rel}: ${wantEvent} hook has type "${h.type}" — expected "command"`, 'zh-TW': `${h.rel}:${wantEvent} hook 的 type 是「${h.type}」— 應為「command」`, 'zh-CN': `${h.rel}:${wantEvent} hook 的 type 是「${h.type}」— 应为「command」`, ja: `${h.rel}:${wantEvent} hook の type が「${h.type}」— 「command」のはず` }));
        continue;
      }
      fail(h.event !== wantEvent
        ? M({ en: `${h.rel}: state-check hook registered under "${h.event}" — ${label} expects "${wantEvent}"`, 'zh-TW': `${h.rel}:state-check hook 登記在「${h.event}」— ${label} 應為「${wantEvent}」`, 'zh-CN': `${h.rel}:state-check hook 登记在「${h.event}」— ${label} 应为「${wantEvent}」`, ja: `${h.rel}:state-check hook が「${h.event}」に登録 — ${label} は「${wantEvent}」のはず` })
        : M({ en: `${h.rel}: ${wantEvent} hook command differs from the expected one: ${wantCmd}`, 'zh-TW': `${h.rel}:${wantEvent} hook 的 command 與預期不符,應為:${wantCmd}`, 'zh-CN': `${h.rel}:${wantEvent} hook 的 command 与预期不符,应为:${wantCmd}`, ja: `${h.rel}:${wantEvent} hook の command が想定と違う。正しくは:${wantCmd}` }));
    }
    if (exact.length > 1) fail(M({ en: `${label}: state-check hook registered ${exact.length} times (${[...new Set(exact.map((h) => h.rel))].join(', ')}) — the reminder would fire repeatedly`, 'zh-TW': `${label}:state-check hook 登記了 ${exact.length} 次(${[...new Set(exact.map((h) => h.rel))].join(', ')})— 提醒會重複觸發`, 'zh-CN': `${label}:state-check hook 登记了 ${exact.length} 次(${[...new Set(exact.map((h) => h.rel))].join(', ')})— 提醒会重复触发`, ja: `${label}:state-check hook が ${exact.length} 回登録(${[...new Set(exact.map((h) => h.rel))].join(', ')})— リマインドが重複する` }));
    else if (exact.length === 1) ok(`${label}: ${exact[0].rel} ${wantEvent} hook`);
    else if (!wrong.length) {
      const tracked = optionalIfTracked && det.private && files.some((rel) => existsSync(at(rel)) && isTracked(rel));
      (tracked ? warn : fail)(tracked
        ? M({ en: `${label}: no ${wantEvent} hook (--private skipped a git-tracked ${files[0]}; add it yourself: ${wantCmd})`, 'zh-TW': `${label}:沒有 ${wantEvent} hook(--private 跳過受追蹤的 ${files[0]};請自行加:${wantCmd})`, 'zh-CN': `${label}:没有 ${wantEvent} hook(--private 跳过受追踪的 ${files[0]};请自行加:${wantCmd})`, ja: `${label}:${wantEvent} hook がない(--private は git 管理下の ${files[0]} を飛ばした。手動で追加:${wantCmd})` })
        : M({ en: `${label}: ${wantEvent} hook not registered — npx flightwake update`, 'zh-TW': `${label}:${wantEvent} hook 未登記 — npx flightwake update`, 'zh-CN': `${label}:${wantEvent} hook 未登记 — npx flightwake update`, ja: `${label}:${wantEvent} hook が未登録 — npx flightwake update` }));
    }
  };
  checkHook('Claude Code', ['.claude/settings.json', '.claude/settings.local.json'], 'Stop', HOOK_CMD);
  if (platforms.has('codex')) {
    checkHook('Codex', ['.codex/hooks.json'], 'Stop', HOOK_CMD_GIT, { optionalIfTracked: true });
    info(M({
      en: 'Codex loads project hooks only for a repo it trusts by its exact path — doctor cannot see that; trigger the Stop hook once in Codex to confirm',
      'zh-TW': 'Codex 只對以精確路徑受信任的 repo 載入專案 hook — doctor 看不到這點;請在 Codex 實際觸發一次 Stop hook 確認',
      'zh-CN': 'Codex 只对以精确路径受信任的 repo 加载项目 hook — doctor 看不到这点;请在 Codex 实际触发一次 Stop hook 确认',
      ja: 'Codex は正確なパスで信頼された repo でのみプロジェクト hook を読む — doctor からは見えない。Codex で一度 Stop hook を発火させて確認を',
    }));
  }
  if (platforms.has('gemini')) checkHook('Gemini CLI', ['.gemini/settings.json'], 'AfterAgent', HOOK_CMD_GIT, { optionalIfTracked: true });

  // ── --private: the paths that must be ignored come from what is installed, not from what is left in the exclude
  //    block (an entry deleted from it would otherwise vanish from the check). Each artifact file must be ignored
  //    by git in effect; a tracked file defeats exclude, and check-ignore does not report tracked files as ignored.
  if (det.private && !git) warn(M({ en: '--private: cannot verify the excludes without git at the repo root', 'zh-TW': '--private:沒有 git(或不在 repo root)無法驗證排除', 'zh-CN': '--private:没有 git(或不在 repo root)无法验证排除', ja: '--private:git が無い(または repo root でない)ため除外を検証できない' }));
  if (det.private && git) {
    const walk = (rel) => {
      const p = at(rel);
      if (!existsSync(p)) return [];
      if (!statSync(p).isDirectory()) return [rel];
      return readdirSync(p).flatMap((f) => walk(`${rel}/${f}`));
    };
    const has = (rel, needle) => { try { return readFileSync(at(rel), 'utf8').includes(needle); } catch { return false; } };
    const groups = []; // [label, files]
    groups.push(['.flightwake/', walk('.flightwake')]);
    for (const base of ['.claude/skills', '.agents/skills']) {
      for (const d of (existsSync(at(base)) ? readdirSync(at(base)) : [])) if (d.startsWith('fw-')) groups.push([`${base}/${d}/`, walk(`${base}/${d}`)]);
    }
    if (existsSync(at(MOD_REL))) groups.push([`${MOD_REL}/`, walk(MOD_REL)]);
    for (const rel of ['.claude/settings.json', '.claude/settings.local.json', '.codex/hooks.json', '.gemini/settings.json']) {
      if (has(rel, 'state-check.mjs') || has(rel, 'statusline.mjs')) groups.push([rel, [rel]]);
    }
    for (const rel of INSTRUCTION_CANDIDATES) {
      if (has(rel, '<!-- flightwake:begin') || has(rel, '<!-- flightwake-orca:begin')) groups.push([rel, [rel]]);
    }
    const files = groups.flatMap(([, f]) => f);
    let ignored = new Set();
    try {
      const outp = execFileSync('git', ['check-ignore', '--stdin'], { cwd: target, input: files.join('\n') + '\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      ignored = new Set(outp.split('\n').filter(Boolean));
    } catch (e) { ignored = new Set(String(e.stdout ?? '').split('\n').filter(Boolean)); } // exit 1 = none ignored
    const broken = groups.filter(([, f]) => f.some((x) => !ignored.has(x))).map(([label, f]) => (f.some((x) => isTracked(x)) ? `${label} (tracked)` : label));
    if (broken.length) fail(M({ en: `--private: not actually ignored by git: ${broken.join(', ')}`, 'zh-TW': `--private:以下沒有真的被 git 忽略:${broken.join(', ')}`, 'zh-CN': `--private:以下没有真的被 git 忽略:${broken.join(', ')}`, ja: `--private:git に実際には無視されていない:${broken.join(', ')}` }));
    else ok(M({ en: `--private: all ${groups.length} installed artifacts are ignored by git`, 'zh-TW': `--private:${groups.length} 項安裝產物都已被 git 忽略`, 'zh-CN': `--private:${groups.length} 项安装产物都已被 git 忽略`, ja: `--private:インストール物 ${groups.length} 件すべて git に無視されている` }));
  }

  // ── optional add-ons: report state only; not installed is never a problem ──
  const settingsSL = ['.claude/settings.json', '.claude/settings.local.json'].map((rel) => (existsSync(at(rel)) ? readJson(rel) : null)).filter((j) => j?.ok && j.value && typeof j.value === 'object').map((j) => j.value.statusLine).filter((v) => v && typeof v === 'object');
  const ours = settingsSL.filter((s) => JSON.stringify(s).includes('statusline.mjs'));
  if (!ours.length) info(M({ en: 'statusline: not installed (optional)', 'zh-TW': '儀表:未安裝(選配)', 'zh-CN': '仪表:未安装(选配)', ja: 'ゲージ:未インストール(オプション)' }));
  else if (ours.some((s) => s.command !== SL_CMD) || !existsSync(at('.flightwake/hooks/statusline.mjs'))) warn(M({ en: 'statusline: installed but its command or script is off — npx flightwake update', 'zh-TW': '儀表:已安裝但 command 或腳本不對 — npx flightwake update', 'zh-CN': '仪表:已安装但 command 或脚本不对 — npx flightwake update', ja: 'ゲージ:インストール済だが command かスクリプトがおかしい — npx flightwake update' }));
  else ok(M({ en: 'statusline: installed', 'zh-TW': '儀表:已安裝', 'zh-CN': '仪表:已安装', ja: 'ゲージ:インストール済' }));
  info(det.roles ? M({ en: 'roles: fw-roles installed', 'zh-TW': '角色:fw-roles 已安裝', 'zh-CN': '角色:fw-roles 已安装', ja: 'ロール:fw-roles インストール済' }) : M({ en: 'roles: not installed (optional)', 'zh-TW': '角色:未安裝(選配)', 'zh-CN': '角色:未安装(选配)', ja: 'ロール:未インストール(オプション)' }));
  info(det.orca ? M({ en: 'Orca collaboration: installed', 'zh-TW': 'Orca 協作:已安裝', 'zh-CN': 'Orca 协作:已安装', ja: 'Orca 連携:インストール済' }) : M({ en: 'Orca collaboration: not installed (optional)', 'zh-TW': 'Orca 協作:未安裝(選配)', 'zh-CN': 'Orca 协作:未安装(选配)', ja: 'Orca 連携:未インストール(オプション)' }));
  checkMod({ fwSrc, at, readJson, ok, warn, fail, info, M });
  info(`profile: ${det.profile}`);
  return report(rows, log, M);
}

/** a.b.c ≥ x.y.z, numerically */
const atLeast = (v, min) => {
  const a = v.split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
};

// ── Claude Code mod (optional): structure, version against this package, Claude Code's version when readable, and
//    the two things that decide whether it loads that no file can show (folder trust, starting at the repo root).
function checkMod({ fwSrc, at, readJson, ok, warn, fail, info, M }) {
  if (!existsSync(at(MOD_REL))) {
    info(M({ en: 'Claude Code mod: not installed (optional)', 'zh-TW': 'Claude Code mod:未安裝(選配)', 'zh-CN': 'Claude Code mod:未安装(选配)', ja: 'Claude Code mod:未インストール(オプション)' }));
    return;
  }
  const L = 'flightwake-mod';
  const ship = modShipList(fwSrc);
  const missing = ship.filter((f) => !existsSync(at(`${MOD_REL}/${f}`)));
  if (missing.length) fail(M({ en: `${L}: missing ${missing.join(', ')} — npx flightwake update`, 'zh-TW': `${L}:缺 ${missing.join(', ')} — npx flightwake update`, 'zh-CN': `${L}:缺 ${missing.join(', ')} — npx flightwake update`, ja: `${L}:${missing.join(', ')} がない — npx flightwake update` }));
  const bad = (f) => fail(M({ en: `${L}: ${f} is not valid JSON — npx flightwake update`, 'zh-TW': `${L}:${f} 不是合法 JSON — npx flightwake update`, 'zh-CN': `${L}:${f} 不是合法 JSON — npx flightwake update`, ja: `${L}:${f} は不正な JSON — npx flightwake update` }));
  const isObj = (j) => j.ok && j.value && typeof j.value === 'object' && !Array.isArray(j.value);
  // the manifest and the hooks module list the loader starts from
  let manifest = null;
  if (existsSync(at(`${MOD_REL}/.claude-plugin/plugin.json`))) {
    const j = readJson(`${MOD_REL}/.claude-plugin/plugin.json`);
    if (isObj(j)) manifest = j.value; else bad('.claude-plugin/plugin.json');
  }
  if (existsSync(at(`${MOD_REL}/hooks/hooks.json`))) {
    const j = readJson(`${MOD_REL}/hooks/hooks.json`);
    if (!isObj(j) || !Array.isArray(j.value.modules)) bad('hooks/hooks.json');
    else {
      const gone = j.value.modules.filter((m) => typeof m !== 'string' || !existsSync(at(`${MOD_REL}/hooks/${m}`)));
      if (gone.length) fail(M({ en: `${L}: hooks module ${gone.join(', ')} (named in hooks/hooks.json) missing — npx flightwake update`, 'zh-TW': `${L}:hooks/hooks.json 指名的模組 ${gone.join(', ')} 不存在 — npx flightwake update`, 'zh-CN': `${L}:hooks/hooks.json 指名的模块 ${gone.join(', ')} 不存在 — npx flightwake update`, ja: `${L}:hooks/hooks.json の指すモジュール ${gone.join(', ')} がない — npx flightwake update` }));
    }
  }
  // installed version vs the one this package ships; at the same version, shipped files that differ
  let shipped = null;
  try { shipped = JSON.parse(readFileSync(join(modSrc(fwSrc), '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch {}
  if (manifest) {
    const v = String(manifest.version ?? '?');
    if (shipped && v !== shipped) {
      warn(M({ en: `${L}: installed v${v}, this package ships v${shipped} — npx flightwake update`, 'zh-TW': `${L}:已安裝 v${v},目前套件是 v${shipped} — npx flightwake update`, 'zh-CN': `${L}:已安装 v${v},当前套件是 v${shipped} — npx flightwake update`, ja: `${L}:インストール済 v${v}、このパッケージは v${shipped} — npx flightwake update` }));
    } else {
      const differ = ship.filter((f) => {
        try { return existsSync(at(`${MOD_REL}/${f}`)) && !readFileSync(at(`${MOD_REL}/${f}`)).equals(readFileSync(join(modSrc(fwSrc), ...f.split('/')))); } catch { return true; }
      });
      if (differ.length) warn(M({ en: `${L}: ${differ.join(', ')} differ from this package (edited by hand?) — npx flightwake update restores them`, 'zh-TW': `${L}:${differ.join(', ')} 與套件內容不同(手動改過?)— npx flightwake update 可還原`, 'zh-CN': `${L}:${differ.join(', ')} 与套件内容不同(手动改过?)— npx flightwake update 可还原`, ja: `${L}:${differ.join(', ')} がパッケージと異なる(手で編集した?)— npx flightwake update で戻る` }));
      else if (!missing.length) ok(`${L} v${v} (${MOD_REL})`);
    }
  }
  // Claude Code's version, read-only and only when the binary answers; anything else is a hint, never a failure
  let cc = null;
  try { cc = /(\d+\.\d+\.\d+)/.exec(execFileSync('claude', ['--version'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }))?.[1] ?? null; } catch {}
  if (!cc) info(M({ en: `could not read the Claude Code version (claude --version) — the mod needs ${MOD_MIN_CLAUDE} or later`, 'zh-TW': `讀不到 Claude Code 版本(claude --version)— mod 需要 ${MOD_MIN_CLAUDE} 以上`, 'zh-CN': `读不到 Claude Code 版本(claude --version)— mod 需要 ${MOD_MIN_CLAUDE} 以上`, ja: `Claude Code のバージョンを読めない(claude --version)— mod には ${MOD_MIN_CLAUDE} 以上が必要` }));
  else if (atLeast(cc, MOD_MIN_CLAUDE)) ok(M({ en: `Claude Code ${cc} (the mod needs ${MOD_MIN_CLAUDE}+)`, 'zh-TW': `Claude Code ${cc}(mod 需要 ${MOD_MIN_CLAUDE} 以上)`, 'zh-CN': `Claude Code ${cc}(mod 需要 ${MOD_MIN_CLAUDE} 以上)`, ja: `Claude Code ${cc}(mod には ${MOD_MIN_CLAUDE} 以上が必要)` }));
  else warn(M({ en: `Claude Code ${cc} is older than ${MOD_MIN_CLAUDE} — the mod will not load until Claude Code is updated`, 'zh-TW': `Claude Code ${cc} 低於 ${MOD_MIN_CLAUDE} — 更新 Claude Code 之前 mod 不會載入`, 'zh-CN': `Claude Code ${cc} 低于 ${MOD_MIN_CLAUDE} — 更新 Claude Code 之前 mod 不会加载`, ja: `Claude Code ${cc} は ${MOD_MIN_CLAUDE} より古い — Claude Code を更新するまで mod は読み込まれない` }));
  info(M({
    en: 'Claude Code mod: doctor cannot see whether Claude Code trusts this folder, or whether sessions start at the repo root — the mod loads only in a trusted folder opened at the repo root. Check in Claude Code that it loaded: /fw-log should be available.',
    'zh-TW': 'Claude Code mod:doctor 看不到 Claude Code 是否已信任(trust)這個資料夾,也看不到 session 是否從 repo 根目錄(repo root)啟動 — mod 只在受信任、從根目錄開啟時載入。請在 Claude Code 裡實際確認有載入:應該能用 /fw-log。',
    'zh-CN': 'Claude Code mod:doctor 看不到 Claude Code 是否已信任(trust)这个文件夹,也看不到 session 是否从 repo 根目录(repo root)启动 — mod 只在受信任、从根目录打开时加载。请在 Claude Code 里实际确认有加载:应该能用 /fw-log。',
    ja: 'Claude Code mod:Claude Code がこのフォルダを信頼(trust)済みか、セッションが repo のルート(repo root)から始まったかは doctor から見えない — mod は信頼済みのフォルダをルートから開いたときだけ読み込まれる。Claude Code で実際に確認を:/fw-log が使えるはず。',
  }));
}

function report(rows, log, M) {
  const icon = { ok: '  ok  ', warn: '  !   ', fail: '  ✗   ', info: '  ·   ' };
  log(M({ en: 'flightwake doctor (read-only)', 'zh-TW': 'flightwake doctor(唯讀)', 'zh-CN': 'flightwake doctor(只读)', ja: 'flightwake doctor(読み取りのみ)' }));
  for (const r of rows) log(`${icon[r.level]}${r.text}`);
  const fails = rows.filter((r) => r.level === 'fail').length;
  const warns = rows.filter((r) => r.level === 'warn').length;
  log(M({
    en: `\n${fails} failed, ${warns} warning(s). Doctor checks the install structure only — not that hooks fire at runtime.`,
    'zh-TW': `\n失敗 ${fails}、提醒 ${warns}。doctor 只檢查安裝結構,不保證 hook 在執行期確實觸發。`,
    'zh-CN': `\n失败 ${fails}、提醒 ${warns}。doctor 只检查安装结构,不保证 hook 在执行期确实触发。`,
    ja: `\n失敗 ${fails}、警告 ${warns}。doctor はインストール構造のみを確認し、hook が実行時に発火することは保証しない。`,
  }));
  return fails ? 1 : 0;
}
