/**
 * flightwake setup — the guided, interactive install. It only *resolves options* by asking; the install itself is
 * install.mjs, the same path `init`/`update` take. Before the final confirmation nothing is written — not even
 * `git init`, which is remembered and run only after the user confirms the full list of paths (that list comes
 * from a dry run of the real install, not from a hand-written copy).
 *
 * Flow on a fresh repo: git → language (preselected from the terminal locale, LC_ALL → LC_MESSAGES → LANG, Intl only
 * when all three are empty; the note under the question says where the guess came from) → agents → add-ons as ONE
 * list with fixed numbers (1 gauge, 2 mod, 3 roles, 4 Orca; rows that don't apply are not listed) answered as an
 * exact set (Enter = the * ones, numbers/names = exactly those, 0 = none) → repo type → a plan line
 * (lang · agents · add-ons · profile) and every path → Proceed. On an installed repo: when some add-on that applies
 * here is missing, upgrade in place / upgrade and add add-ons (the update path with that add-on's flag; only adds) /
 * leave (exit 0); when nothing is missing, today's upgrade-only flow. Flags answer their question; --private is flag-only.
 *
 * Testability: runSetup({ io, flags, ctx }) takes injected I/O (io.ask(prompt) → line | null on EOF, rejecting
 * with INTERRUPT on Ctrl-C; io.out(text)) and an injected context (detection, preview, execute). The CLI wires a
 * readline io and realContext(); tests feed answers directly. No hidden environment switch bypasses the TTY check.
 */
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import {
  LANGS, GROUPS, MOD_MIN_CLAUDE, isAgentName, makeM, gitAvailable, repoState, detectInstall, detectedAgents, defaultAgents,
  detectOrcaSource, detectLocale, userStatusline, claudeVersion, addonStatus, addonShortName, joinNames, ADDON_KEYS, ADDON_FLAG,
  missingAddons, resolveOptions, install, printNext, printModNotes, addPrivateExcludes, gitMissingMessage, monorepoMessage,
  createWriter, refusalReport, incompleteReport,
} from './install.mjs';
import { installRolesSkill } from './roles.mjs';
import { runDoctor, stateUnfilled } from './doctor.mjs';

export const INTERRUPT = Symbol('interrupt');
class Abort { constructor(code) { this.code = code; } }

/**
 * readline-backed io. Lines are queued, so input that arrives before a question is asked is never lost.
 * terminal: false even on a TTY: the tty stays in cooked mode, the terminal driver echoes what is typed, and setup
 * writes plain prompt text. readline's terminal mode redraws every prompt with cursor-column and erase-below sequences
 * (ESC[1G ESC[0J … ESC[<n>G); in Orca's terminal the line holding a typed answer then reads back blank, so the person
 * can't see what they answered (2026-10-05 field report). Setup needs no line editing beyond what the tty driver gives.
 * Ctrl-C therefore arrives as a real SIGINT, handled here exactly as readline's SIGINT event was.
 */
export function readlineIO({ input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, output, terminal: false });
  const queue = [];
  const waiters = [];
  let closed = false;
  let interrupted = false;
  rl.on('line', (l) => { const w = waiters.shift(); if (w) w.resolve(l); else queue.push(l); });
  rl.on('close', () => { closed = true; while (waiters.length) waiters.shift().resolve(null); });
  const onInterrupt = () => { interrupted = true; while (waiters.length) waiters.shift().reject(INTERRUPT); };
  rl.on('SIGINT', onInterrupt);
  process.on('SIGINT', onInterrupt);
  return {
    ask(prompt) {
      return new Promise((resolve, reject) => {
        if (interrupted) return reject(INTERRUPT);
        rl.setPrompt(prompt);
        rl.prompt();
        if (queue.length) return resolve(queue.shift());
        if (closed) return resolve(null);
        waiters.push({ resolve, reject });
      });
    },
    out: (s) => output.write(`${s}\n`),
    close: () => { process.off('SIGINT', onInterrupt); rl.close(); },
  };
}

/** The real side effects, kept out of runSetup so tests can drive the questions against a real repo. */
export function realContext({ target, fwSrc, version, log = (s) => console.log(s), env = process.env }) {
  const rolesBases = (r) => ['.claude/skills', ...(r.agentsSkills ? ['.agents/skills'] : [])];
  const ctx = {
    version,
    gitAvailable,
    repoState: () => repoState(target),
    detect: () => detectInstall(target),
    detectedAgents: () => detectedAgents(target),
    defaultAgents: () => defaultAgents(target),
    detectLocale: () => detectLocale(env),
    orcaSource: () => detectOrcaSource(env),
    userStatusline: () => userStatusline(env),
    // `claude --version` may hang or be missing: install.mjs spawns it with a timeout; memoized so it runs at most once
    claudeVersion: (() => { let v; return () => (v === undefined ? (v = claudeVersion()) : v); })(),
    // Preflight + summary: the real install and the roles add-on, both dry, through the same guarded writer.
    // Returns the paths that would be written and any destination the guard refuses (setup then stops before writing).
    preview(plan) {
      const r = install({ ...plan.opts, target, fwSrc, version, marker: detectInstall(target).marker, dry: true });
      const paths = [...(plan.gitInit ? ['.git/  (git init)'] : []), ...r.writes];
      const refused = [...r.refused];
      if (plan.roles) {
        const rw = createWriter({ target, dry: true });
        installRolesSkill({ target, fwSrc, lang: plan.opts.lang, bases: rolesBases(r), log: () => {}, addExcludes: (e, W) => addPrivateExcludes(target, e, W), W: rw.W });
        paths.push(...rw.writes);
        refused.push(...rw.refused);
        if (plan.opts.private) paths.push('.git/info/exclude');
      }
      return { paths: [...new Set(paths)], refused, active: [...r.active] };
    },
    execute(plan) {
      const lang = plan.opts.lang;
      const M = makeM(lang);
      let r;
      const refused = [];
      try {
        if (plan.gitInit) { execFileSync('git', ['init'], { cwd: target, stdio: 'ignore' }); log(`  git init ${target}`); }
        r = install({ ...plan.opts, target, fwSrc, version, marker: detectInstall(target).marker, log });
        refused.push(...r.refused);
        // Add-ons after the core, through the same guarded writer
        if (plan.roles) {
          const rw = createWriter({ target, log, M });
          installRolesSkill({ target, fwSrc, lang, bases: rolesBases(r), log, addExcludes: (e, W) => addPrivateExcludes(target, e, W), W: rw.W });
          refused.push(...rw.refused);
        }
      } catch (e) {
        log(incompleteReport(M, e?.message ?? String(e)));
        return 1;
      }
      if (refused.length) { log(incompleteReport(M, refused.map((x) => x.path).join(', '))); return 1; }
      log('');
      // Success is only claimed when doctor agrees
      // doctor reads the Claude Code version through ctx, so a test that pins it never spawns the real claude
      if (runDoctor({ target, fwSrc, version, lang, log, claudeVersion: () => ctx.claudeVersion() })) {
        log(M({
          en: '\n✗ Files were written, but doctor found problems (the ✗ lines above) — setup is NOT complete. Fix them and run `npx flightwake doctor` again.',
          'zh-TW': '\n✗ 檔案已寫入,但 doctor found problems(見上方 ✗ 行)— setup 未完成。修正後再跑 `npx flightwake doctor`。',
          'zh-CN': '\n✗ 文件已写入,但 doctor found problems(见上方 ✗ 行)— setup 未完成。修正后再跑 `npx flightwake doctor`。',
          ja: '\n✗ ファイルは書き込んだが doctor found problems(上の ✗ 行)— setup は未完了。直してから `npx flightwake doctor` を再実行。',
        }));
        return 1;
      }
      // Only what this run actually installed counts as "added", read back from the files: install skips some flagged
      // add-ons (a --mod without Claude Code, which it says; --orca on a markerless private install, which has no block)
      const after = detectInstall(target);
      const did = { gauge: after.statusline, mod: r.mod === 'added', roles: after.roles, orca: after.orca };
      const added = (plan.added ?? []).filter((k) => did[k]);
      if (plan.mode === 'update' || plan.mode === 'add') {
        if (added.length) {
          const names = joinNames(lang, added.map((k) => addonShortName(lang, k)));
          log(M({ en: `\n✅ updated to v${version}; added: ${names}.`, 'zh-TW': `\n✅ 已更新到 v${version},並加裝:${names}。`, 'zh-CN': `\n✅ 已更新到 v${version},并加装:${names}。`, ja: `\n✅ v${version} に更新し、追加しました:${names}。` }));
        } else {
          log(M({ en: `\n✅ updated to v${version}.`, 'zh-TW': `\n✅ 已更新到 v${version}。`, 'zh-CN': `\n✅ 已更新到 v${version}。`, ja: `\n✅ v${version} に更新しました。` }));
        }
        if (r.mod === 'added') printModNotes({ lang, gauge: r.gauge, log });
      } else {
        // setup never prints the add-on notice or init's locale hint: it has just asked about both
        printNext({ ...plan.opts, langExplicit: true, marker: detectInstall(target).marker, fresh: stateUnfilled(target, fwSrc), log, locale: null, addons: null }, r);
      }
      if (plan.roles) log(M({
        en: '   ℹ️  Roles: ask your agent to "run fw-roles" — it scans the project, recommends a team and previews it before anything is applied',
        'zh-TW': '   ℹ️  角色:對 agent 說「跑 fw-roles」— 它會掃描專案、推薦角色組合,套用前先讓你預覽',
        'zh-CN': '   ℹ️  角色:对 agent 说「跑 fw-roles」— 它会扫描项目、推荐角色组合,套用前先让你预览',
        ja: '   ℹ️  ロール:agent に「fw-roles を実行して」と頼む — プロジェクトを調べてチームを提案し、適用前にプレビューする',
      }));
      if (plan.mode === 'add' && added.length && !plan.opts.private) log(M({
        en: '   Next: check `git status` and commit the new files so teammates get them too.',
        'zh-TW': '   下一步:看一下 `git status`,把新檔 commit,隊友 pull 後也會有。',
        'zh-CN': '   下一步:看一下 `git status`,把新文件 commit,队友 pull 后也会有。',
        ja: '   次:`git status` を確認して新しいファイルを commit — チームメイトも pull で使えるようになります。',
      }));
      return 0;
    },
  };
  return ctx;
}

const LANG_LABELS = { en: 'English', 'zh-TW': '繁體中文', 'zh-CN': '简体中文', ja: '日本語' };

export async function runSetup({ io, flags = {}, ctx }) {
  const det = ctx.detect();
  let lang = flags.lang ?? det.lang ?? 'en';
  const M = (m) => makeM(lang)(m);
  const say = (s) => io.out(s);
  const cancelled = (code) => {
    say(M({ en: '\nCancelled — nothing was written.', 'zh-TW': '\n已取消 — 沒有寫入任何東西。', 'zh-CN': '\n已取消 — 没有写入任何东西。', ja: '\nキャンセルしました — 何も書き込んでいません。' }));
    return code;
  };
  const ask = async (q) => {
    const a = await io.ask(q);
    if (a === null) throw new Abort(1);
    return a.trim();
  };
  const yesNo = async (q, def = false) => {
    for (;;) {
      const a = (await ask(`${q} ${def ? '[Y/n]' : '[y/N]'} `)).toLowerCase();
      if (!a) return def;
      if (['y', 'yes'].includes(a)) return true;
      if (['n', 'no'].includes(a)) return false;
      say(M({ en: '  Please answer y or n.', 'zh-TW': '  請回答 y 或 n。', 'zh-CN': '  请回答 y 或 n。', ja: '  y か n で答えてください。' }));
    }
  };
  const choose = async (q, labels, def) => {
    for (;;) {
      say(q);
      labels.forEach((l, i) => say(`  ${i + 1}) ${l}`));
      const a = await ask(`[${def + 1}] `);
      if (!a) return def;
      const n = Number(a);
      if (Number.isInteger(n) && n >= 1 && n <= labels.length) return n - 1;
      say(M({ en: `  Please enter 1–${labels.length}.`, 'zh-TW': `  請輸入 1–${labels.length}。`, 'zh-CN': `  请输入 1–${labels.length}。`, ja: `  1–${labels.length} を入力してください。` }));
    }
  };
  // Add-on flags given on the command line (roles has none: its non-interactive path is `roles install`)
  const FLAG_OF = { gauge: 'statusline', mod: 'mod', orca: 'orca' };
  // --orca on a markerless (private) install has no marker to attach its block to — install skips it — so there it is
  // neither offered nor counted as missing
  const orcaNoMarker = det.installed && !det.marker;
  const flagged = new Set(['gauge', 'mod', 'orca'].filter((k) => flags[FLAG_OF[k]] && !(k === 'orca' && orcaNoMarker)));
  const shortName = (k) => addonShortName(lang, k);
  // version = false: the rows are only used to tell what is missing (installed-repo menu), never to preselect
  const rowsFor = (agents, { version = true } = {}) => {
    const claude = agents.includes('claude');
    // `claude --version` is spawned only when its answer can change a preselect
    return addonStatus({ det, claude, orca: ctx.orcaSource(), userStatusline: ctx.userStatusline(),
      claudeVersion: version && claude && !det.mod && !flags.mod ? ctx.claudeVersion() : null });
  };
  // A flag on the command line answers its add-on question, also where the row is not listed: install then adds it
  // or prints its own reason (Claude Code only, another status line) instead of the flag vanishing
  const withFlags = (sel) => ({ statusline: !!flags.statusline || sel.has('gauge'), mod: !!flags.mod || sel.has('mod'), orca: !!flags.orca || sel.has('orca') });

  try {
    say(M({
      en: 'flightwake setup — a few questions, then the full list of what will be written. Nothing is written before you confirm.\n',
      'zh-TW': 'flightwake setup — 問幾個問題,再列出所有會寫入的路徑。你確認之前不會寫入任何東西。\n',
      'zh-CN': 'flightwake setup — 问几个问题,再列出所有会写入的路径。你确认之前不会写入任何东西。\n',
      ja: 'flightwake setup — いくつか質問し、書き込むパスを全部見せます。確認するまで何も書き込みません。\n',
    }));

    // 1. git installed?
    if (!ctx.gitAvailable()) { say(gitMissingMessage(M)); return 1; }

    // 2. a git repo? (subdirectory → monorepo policy; none → offer git init, run only after the final confirmation)
    const repo = ctx.repoState();
    if (repo.kind === 'sub') { say(monorepoMessage(M, repo.root)); return 1; }
    let gitInit = false;
    if (repo.kind === 'none') {
      if (flags.gitInit) gitInit = true;
      else {
        say(M({
          en: 'This folder is not a git repo yet. flightwake keeps its records in git, so it needs one.',
          'zh-TW': '這個資料夾還不是 git repo。flightwake 的紀錄存在 git 裡,所以需要一個。',
          'zh-CN': '这个文件夹还不是 git repo。flightwake 的记录存在 git 里,所以需要一个。',
          ja: 'このフォルダはまだ git repo ではありません。flightwake は記録を git に置くので必要です。',
        }));
        gitInit = await yesNo(M({ en: 'Run git init here?', 'zh-TW': '要在這裡執行 git init 嗎?', 'zh-CN': '要在这里执行 git init 吗?', ja: 'ここで git init を実行しますか?' }), false);
        if (!gitInit) {
          say(M({
            en: 'OK — nothing was written. Run git init yourself (or rerun setup and answer y), then come back.',
            'zh-TW': '好的 — 沒有寫入任何東西。請自行 git init(或重跑 setup 並回答 y)後再來。',
            'zh-CN': '好的 — 没有写入任何东西。请自行 git init(或重跑 setup 并回答 y)后再来。',
            ja: '了解 — 何も書き込んでいません。自分で git init する(または setup を再実行して y)してから戻ってください。',
          }));
          return 1;
        }
      }
      say(M({ en: '  (git init runs only after you confirm the final list)\n', 'zh-TW': '  (git init 會等你確認最後的清單後才執行)\n', 'zh-CN': '  (git init 会等你确认最后的清单后才执行)\n', ja: '  (git init は最後の一覧を確認した後に実行します)\n' }));
    }

    // 3. already installed → upgrade in place (= update); when an add-on that applies here is missing, also
    //    "upgrade and add add-ons" (the update path with that add-on's flag — only adds) or leave (exit 0)
    if (det.installed) {
      const m = det.marker;
      say(M({ en: 'flightwake is already installed here:', 'zh-TW': '這裡已經安裝了 flightwake:', 'zh-CN': '这里已经安装了 flightwake:', ja: 'ここには flightwake がインストール済です:' }));
      say(`  v${m?.version ?? '?'}  lang=${det.lang ?? '?'}  profile=${det.profile}${det.statusline ? '  statusline' : ''}${det.private ? '  private' : ''}${det.roles ? '  roles' : ''}${det.orca ? '  orca' : ''}${det.mod ? '  mod' : ''}`);
      const ag = flags.agents ?? ctx.defaultAgents();
      const rowOf = (rs, k) => rs.find((r) => r.key === k);
      // Missing = what applies here and is not installed, plus a flag that still has something to add (e.g. --orca
      // outside Orca), so a flag never meets "everything is installed"
      const missingIn = (rs) => { const m = new Set([...missingAddons(rs),
        ...[...flagged].filter((k) => !rowOf(rs, k).installed && !rowOf(rs, k).blocked)]); return ADDON_KEYS.filter((k) => m.has(k)); };
      const missing = missingIn(rowsFor(ag, { version: false }));
      // --lang / --profile answer their question here too (resolveOptions takes them over the installed values): when one
      // differs from this install, name the switch instead of saying language and repo type stay as they are
      const switches = [
        ...(flags.lang && flags.lang !== det.lang ? [{ key: 'lang', from: det.lang ?? '?', to: flags.lang }] : []),
        ...(flags.profile && flags.profile !== det.profile ? [{ key: 'profile', from: det.profile, to: flags.profile }] : []),
      ];
      const footnote = () => {
        if (!switches.length) return say(M({
          en: '  Language and repo type stay as they are here — to change them: npx flightwake update --lang=<lang> / --profile=<code|notes>',
          'zh-TW': '  這裡不改語言與 repo 類型 — 要改:npx flightwake update --lang=<語言> / --profile=<code|notes>',
          'zh-CN': '  这里不改语言与 repo 类型 — 要改:npx flightwake update --lang=<语言> / --profile=<code|notes>',
          ja: '  言語と repo の種類はここでは変えません — 変えるには:npx flightwake update --lang=<言語> / --profile=<code|notes>',
        }));
        for (const { key, from, to } of switches) say(M({
          en: `  ${key}: ${from} → ${to} (switched by --${key})`,
          'zh-TW': `  ${key}:${from} → ${to}(由 --${key} 切換)`,
          'zh-CN': `  ${key}:${from} → ${to}(由 --${key} 切换)`,
          ja: `  ${key}:${from} → ${to}(--${key} で切り替え)`,
        }));
      };
      // Option 1 = update with the command-line flags; a flagged add-on that is missing is added there too, so its label
      // names that exact command and the closing line names what was added (mode 'add')
      const flagAdds = missing.filter((k) => flagged.has(k));
      const upgrade = () => confirmAndRun({ mode: flagAdds.length ? 'add' : 'update', gitInit, roles: false, added: flagAdds,
        opts: resolveOptions({ update: true, flags, det }) });
      if (!missing.length) {
        say(M({ en: 'All add-ons that apply here are installed.', 'zh-TW': '這裡適用的附加元件都已安裝。', 'zh-CN': '这里适用的附加组件都已安装。', ja: 'ここで使えるオプションはすべてインストール済です。' }));
        footnote();
        return await upgrade();
      }
      footnote();
      const version = ctx.version;
      const names = joinNames(lang, missing.map(shortName));
      const cmd = `npx flightwake update${switches.map(({ key, to }) => ` --${key}=${to}`).join('')}${flagAdds.map((k) => ` ${ADDON_FLAG[k]}`).join('')}`;
      const pick = await choose(M({ en: '\nWhat would you like to do?', 'zh-TW': '\n要做什麼?', 'zh-CN': '\n要做什么?', ja: '\nどうしますか?' }), [
        switches.length || flagAdds.length ? M({
          en: `Upgrade in place to v${version} with the options given on the command line (same as \`${cmd}\`)`,
          'zh-TW': `照命令列給的選項就地升級到 v${version}(等同 \`${cmd}\`)`,
          'zh-CN': `照命令行给的选项就地升级到 v${version}(等同 \`${cmd}\`)`,
          ja: `コマンドラインで指定したオプションで v${version} にその場で更新(\`${cmd}\` と同じ)`,
        }) : M({
          en: `Upgrade in place to v${version}, keeping these options (same as \`npx flightwake update\`)`,
          'zh-TW': `沿用這些選項就地升級到 v${version}(等同 \`npx flightwake update\`)`,
          'zh-CN': `沿用这些选项就地升级到 v${version}(等同 \`npx flightwake update\`)`,
          ja: `このオプションのまま v${version} にその場で更新(\`npx flightwake update\` と同じ)`,
        }),
        M({
          en: `Upgrade and add add-ons (not installed yet: ${names})`,
          'zh-TW': `升級並加裝附加元件(尚未安裝:${names})`,
          'zh-CN': `升级并加装附加组件(尚未安装:${names})`,
          ja: `更新してアドオンを追加(未インストール:${names})`,
        }),
        M({ en: 'Leave it as it is', 'zh-TW': '維持原狀,不動', 'zh-CN': '维持原状,不动', ja: '何もしないで終了' }),
      ], missing.some((k) => flagged.has(k)) ? 1 : 0);
      if (pick === 2) {
        say(M({ en: 'OK — left as it is; nothing was written.', 'zh-TW': '好的 — 維持原狀,沒有寫入任何東西。', 'zh-CN': '好的 — 维持原状,没有写入任何东西。', ja: '了解 — そのままにしました。何も書き込んでいません。' }));
        return 0;
      }
      if (pick === 0) return await upgrade();
      // Only now can the mod's preselect matter: `claude --version` (up to 5 s) is not spawned for options 1 and 3
      const rows = rowsFor(ag);
      const sel = await pickAddons({ rows, mode: 'add' });
      const added = ADDON_KEYS.filter((k) => sel.has(k) && !rowOf(rows, k).installed);
      const opts = resolveOptions({ update: true, flags: { ...flags, ...withFlags(sel) }, det });
      return await confirmAndRun({ mode: added.length ? 'add' : 'update', gitInit, opts, roles: sel.has('roles') && !det.roles, added });
    }

    // 4. language — preselected from the terminal locale (preselect only: the intro above stays flag > marker > en)
    if (!flags.lang) {
      const loc = ctx.detectLocale();
      const def = LANGS.indexOf(loc.lang);
      let q = 'Language / 語言 / 语言 / 言語';
      if (loc.lang !== 'en') {
        // Written in the detected language: the person who reads it is the one the guess is about
        const intl = loc.source === 'Intl';
        const src = intl ? loc.raw : `${loc.source}=${loc.raw}`;
        const note = {
          'zh-TW': `  (依${intl ? '系統語系' : '終端機語系'} ${src} 預選;這是寫進 repo 的檔案語言,整個團隊共用 — 按 Enter 沿用)`,
          'zh-CN': `  (依${intl ? '系统语系' : '终端语系'} ${src} 预选;这是写进 repo 的文件语言,整个团队共用 — 按 Enter 沿用)`,
          ja: `  (${intl ? 'システムのロケール' : '端末のロケール'} ${src} から既定を選択。repo に書き込むファイルの言語で、チーム全員が共有します — Enter でそのまま)`,
        }[loc.lang];
        if (note) q += `\n${note}`;
      }
      lang = LANGS[await choose(q, LANGS.map((l) => `${LANG_LABELS[l]} (${l})`), def < 0 ? 0 : def)];
    }

    // 5. agents. Instruction files found → offer them (Enter keeps). None found → ask outright, nothing preselected:
    //    init's non-interactive fallback (codex) would otherwise hide the Claude-only add-on rows from Claude users.
    let agents = flags.agents;
    if (!agents) {
      const detected = ctx.detectedAgents();
      const NAMES = Object.keys(GROUPS);
      const LABEL = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI' };
      if (detected.length) {
        say(M({
          en: `\nAgents to set up (detected: ${detected.join(', ')}). Available: ${NAMES.join(', ')}.`,
          'zh-TW': `\n要設定的 agent(偵測到:${detected.join(', ')})。可選:${NAMES.join(', ')}。`,
          'zh-CN': `\n要设定的 agent(检测到:${detected.join(', ')})。可选:${NAMES.join(', ')}。`,
          ja: `\n設定する agent(検出:${detected.join(', ')})。選択肢:${NAMES.join(', ')}。`,
        }));
      } else {
        say(M({
          en: '\nWhich AI coding tools do you use here? Pick one or more:',
          'zh-TW': '\n你在這裡用哪些 AI coding 工具?可複選:',
          'zh-CN': '\n你在这里用哪些 AI coding 工具?可多选:',
          ja: '\nここで使う AI コーディングツールは?複数選択可:',
        }));
        NAMES.forEach((n, i) => say(`  ${i + 1}) ${LABEL[n]} (${n})`));
      }
      const prompt = detected.length
        ? M({ en: 'Press Enter to keep, or type a comma list: ', 'zh-TW': '按 Enter 沿用,或輸入逗號分隔清單:', 'zh-CN': '按 Enter 沿用,或输入逗号分隔清单:', ja: 'Enter でそのまま、またはカンマ区切りで入力:' })
        : M({ en: 'Numbers or names, comma-separated (e.g. 1,2): ', 'zh-TW': '輸入編號或名稱,逗號分隔(例如 1,2):', 'zh-CN': '输入编号或名称,逗号分隔(例如 1,2):', ja: '番号か名前をカンマ区切りで(例:1,2):' });
      for (;;) {
        const a = await ask(prompt);
        // Numbers map to the listed order; names pass through
        const list = (a ? a.split(/[\s,]+/).filter(Boolean) : detected).map((x) => (/^\d+$/.test(x) ? NAMES[Number(x) - 1] ?? x : x));
        const bad = list.filter((x) => !isAgentName(x));
        if (list.length && !bad.length) { agents = [...new Set(list)]; break; }
        say(bad.length
          ? M({ en: `  Not recognized: ${bad.join(', ')}`, 'zh-TW': `  無法辨識:${bad.join(', ')}`, 'zh-CN': `  无法识别:${bad.join(', ')}`, ja: `  認識できない:${bad.join(', ')}` })
          : M({ en: '  Pick at least one.', 'zh-TW': '  請至少選一個。', 'zh-CN': '  请至少选一个。', ja: '  少なくとも 1 つ選んでください。' }));
      }
    }

    // 6. add-ons: the core always installs; the add-ons are one list answered as an exact set (pickAddons)
    const sel = await pickAddons({ rows: rowsFor(agents), mode: 'init' });
    const { statusline, mod, orca } = withFlags(sel), roles = sel.has('roles');

    // 7. repo type
    let profile = flags.profile;
    if (!profile) {
      profile = ['code', 'notes'][await choose(M({ en: '\nWhat kind of repo is this?', 'zh-TW': '\n這是哪種 repo?', 'zh-CN': '\n这是哪种 repo?', ja: '\nどんな repo ですか?' }), [
        M({ en: 'Code project (tests, typecheck, prod evidence apply)', 'zh-TW': '程式專案(適用測試、typecheck、prod 證據)', 'zh-CN': '程序项目(适用测试、typecheck、prod 证据)', ja: 'コードのプロジェクト(テスト・typecheck・prod の証拠が適用)' }),
        M({ en: 'Notes / discussion (no tests or prod duties)', 'zh-TW': '筆記/討論型(沒有測試與 prod 義務)', 'zh-CN': '笔记/讨论型(没有测试与 prod 义务)', ja: 'ノート・議論用(テストや prod の義務なし)' }),
      ], 0)];
    }

    // 8. --private is flag-only (never asked)
    const opts = resolveOptions({ update: false, flags: { ...flags, lang, agents, statusline, orca, mod, profile }, det });
    return await confirmAndRun({ mode: 'init', gitInit, opts, roles, addons: [...sel] });
  } catch (e) {
    if (e === INTERRUPT) return cancelled(130);
    if (e instanceof Abort) return cancelled(e.code);
    throw e;
  }

  /**
   * The add-on list. Numbers are fixed (1 gauge, 2 mod, 3 roles, 4 Orca) and rows that don't apply are not listed.
   * The answer is the exact set wanted (replace, not toggle): with terminal:false nothing redraws, so a toggle could
   * not show its current state. Installed (✓) and flag-given (+) rows are locked; blocked (-) rows can't be picked.
   * Returns a Set of keys in ADDON_KEYS order; skips the question when there is nothing left to choose.
   */
  async function pickAddons({ rows, mode }) {
    const shown = rows.filter((r) => r.applicable || flagged.has(r.key));
    const locked = (r) => r.installed || flagged.has(r.key);
    const selectable = shown.filter((r) => !locked(r) && !r.blocked);
    const pre = selectable.filter((r) => r.recommended);
    const fixed = shown.filter((r) => flagged.has(r.key) && !r.installed && !r.blocked);
    const ordered = (rs) => new Set(ADDON_KEYS.filter((k) => rs.some((r) => r.key === k)));
    if (!selectable.length) return ordered(fixed);
    // The gauge's "committed settings" line is wrong for a private install (it writes settings.local.json)
    const priv = flags.private || (mode === 'add' && det.private);
    say(mode === 'add'
      ? M({ en: '\nAdd-ons — ✓ = already installed (kept as is), * = recommended:', 'zh-TW': '\n附加元件 — ✓ = 已安裝(保持不動),* = 建議:', 'zh-CN': '\n附加组件 — ✓ = 已安装(保持不动),* = 建议:', ja: '\nアドオン — ✓ = インストール済(そのまま)、* = おすすめ:' })
      : M({ en: '\nThe core (records, the four skills, the wrap-up hook) is always installed. Optional add-ons — * = recommended:', 'zh-TW': '\n核心(紀錄、四個 skill、收尾 hook)一律安裝。以下是選配的附加元件 — * = 建議:', 'zh-CN': '\n核心(记录、四个 skill、收尾 hook)一律安装。以下是选配的附加组件 — * = 建议:', ja: '\nコア(記録・4 つの skill・締めの hook)は常にインストールされます。以下はオプション — * = おすすめ:' }));
    const LABEL = {
      gauge: M({ en: 'Bottom gauge in Claude Code (health / STATE lag / context usage)', 'zh-TW': 'Claude Code 底部儀表(health/STATE 落後/context 用量)', 'zh-CN': 'Claude Code 底部仪表(health/STATE 落后/context 用量)', ja: 'Claude Code 下部のゲージ(health / STATE の遅れ / context 使用量)' }),
      mod: M({
        en: 'Claude Code mod — inside Claude Code: a status row above the prompt, STATE loaded when a session starts, a log of this session\'s changes and test runs (/fw-log), a hint when you touch something a known trap mentions, and an optional role guard.',
        'zh-TW': 'Claude Code mod — 在 Claude Code 裡:輸入框上方一列狀態、session 開始時自動帶入 STATE、記下這個 session 改了什麼與跑過的測試(/fw-log)、碰到已知的坑時提醒,以及選用的角色守門。',
        'zh-CN': 'Claude Code mod — 在 Claude Code 里:输入框上方一行状态、session 开始时自动带入 STATE、记下这个 session 改了什么与跑过的测试(/fw-log)、碰到已知的坑时提醒,以及可选的角色守门。',
        ja: 'Claude Code mod — Claude Code の中で:入力欄の上に状態を 1 行、セッション開始時に STATE を読み込み、このセッションの変更とテスト実行の記録(/fw-log)、既知の落とし穴に触れたときのヒント、任意のロールガード。',
      }),
      roles: M({
        en: 'Team roles (installs only the fw-roles skill; your agent recommends roles later, nothing applied yet)',
        'zh-TW': '團隊角色(只安裝 fw-roles skill;之後由 agent 推薦角色,現在不套用任何東西)',
        'zh-CN': '团队角色(只安装 fw-roles skill;之后由 agent 推荐角色,现在不套用任何东西)',
        ja: 'チームロール(fw-roles skill のみ。ロールは後で agent が提案、今は何も適用しない)',
      }),
      orca: M({
        en: 'Orca collaboration (agents ask each other in your visible Orca tabs instead of hidden background runs)',
        'zh-TW': 'Orca 協作(agent 互相討論或審查時走你看得到的 Orca 分頁,而不是看不見的背景程序)',
        'zh-CN': 'Orca 协作(agent 互相讨论或审查时走你看得到的 Orca 分页,而不是看不见的后台进程)',
        ja: 'Orca 連携(agent 同士の相談やレビューを、見えない背景実行ではなく見える Orca タブで行う)',
      }),
    };
    const suffix = (r) => {
      if (r.key === 'gauge' && r.blocked) return M({ en: ' — not available: this repo\'s .claude settings already have another status line (flightwake never replaces it)', 'zh-TW': ' — 無法安裝:這個 repo 的 .claude 設定已有其他 status line(flightwake 不會取代)', 'zh-CN': ' — 无法安装:这个 repo 的 .claude 设置已有其他 status line(flightwake 不会取代)', ja: ' — 不可:この repo の .claude 設定に別の status line がある(flightwake は置き換えない)' });
      if (r.key === 'gauge' && r.userSL) return M({ en: ' — you have your own status line (~/.claude/settings.json); in this repo the gauge would take its place', 'zh-TW': ' — 你已有自己的 status line(~/.claude/settings.json);在這個 repo 裡儀表會取代它', 'zh-CN': ' — 你已有自己的 status line(~/.claude/settings.json);在这个 repo 里仪表会取代它', ja: ' — 自分の status line がある(~/.claude/settings.json)。この repo ではゲージがそれに代わる' });
      if (r.key === 'orca' && r.orcaPathOnly) return M({ en: ' — found an `orca` program on PATH but not running inside Orca; not preselected', 'zh-TW': ' — PATH 上有 `orca` 程式,但不是在 Orca 裡執行;不預選', 'zh-CN': ' — PATH 上有 `orca` 程序,但不是在 Orca 里运行;不预选', ja: ' — PATH に `orca` があるが Orca 内で実行していない。既定では選択しない' });
      return '';
    };
    const extra = (r) => {
      const v = r.oldClaude;
      if (r.key === 'gauge') return !r.blocked && !priv ? [M({ en: 'written to .claude/settings.json, which is committed — in this repo teammates see it instead of their own status line', 'zh-TW': '寫進會 commit 的 .claude/settings.json — 在這個 repo 裡,隊友看到的會是它,而不是自己的 status line', 'zh-CN': '写进会 commit 的 .claude/settings.json — 在这个 repo 里,队友看到的会是它,而不是自己的 status line', ja: 'commit される .claude/settings.json に書き込み — この repo ではチームメイトにも自分の status line の代わりにこれが表示される' })] : [];
      if (r.key === 'mod') return [
        M({
          en: `Needs Claude Code ${MOD_MIN_CLAUDE} or later. It loads in a Claude Code session started from the repo root, after you accept the folder trust prompt — a session that is already open needs a restart.`,
          'zh-TW': `需要 Claude Code ${MOD_MIN_CLAUDE} 以上。從 repo 根目錄啟動的 Claude Code session、接受資料夾信任(trust)後才會載入 — 已經開著的 session 要重開。`,
          'zh-CN': `需要 Claude Code ${MOD_MIN_CLAUDE} 以上。从 repo 根目录启动的 Claude Code session、接受文件夹信任(trust)后才会加载 — 已经开着的 session 要重开。`,
          ja: `Claude Code ${MOD_MIN_CLAUDE} 以上が必要。repo のルートから起動した Claude Code のセッションで、フォルダの信頼(trust)を承認すると読み込まれます — 開いたままのセッションは再起動が必要。`,
        }),
        ...(v ? [M({
          en: `Your Claude Code is ${v} — older than ${MOD_MIN_CLAUDE}, so the mod would not load; not preselected.`,
          'zh-TW': `你的 Claude Code 是 ${v},低於 ${MOD_MIN_CLAUDE},mod 不會載入;因此不預選。`,
          'zh-CN': `你的 Claude Code 是 ${v},低于 ${MOD_MIN_CLAUDE},mod 不会加载;因此不预选。`,
          ja: `お使いの Claude Code は ${v} で ${MOD_MIN_CLAUDE} より古く、mod は読み込まれない — 既定では選択しない。`,
        })] : []),
      ];
      return [];
    };
    const INSTALLED = M({ en: ' (installed)', 'zh-TW': '(已安裝)', 'zh-CN': '(已安装)', ja: '(インストール済)' });
    for (const r of shown) {
      const mark = r.installed ? '✓' : r.blocked ? '-' : flagged.has(r.key) ? '+' : pre.includes(r) ? '*' : ' ';
      if (mark === '✓' || mark === '+') { say(`  [${mark}] ${r.n}) ${shortName(r.key)}${mark === '✓' ? INSTALLED : ` (${ADDON_FLAG[r.key]})`}`); continue; }
      say(`  [${mark}] ${r.n}) ${LABEL[r.key]}${suffix(r)}`);
      for (const x of extra(r)) say(`       ${x}`);
    }
    const EX = selectable.slice(0, 2).map((r) => r.n).join(' ');
    const prompt = pre.length
      ? M({ en: `Enter = the * ones · or type the numbers you want (e.g. ${EX}) · 0 = none: `, 'zh-TW': `Enter = 標 * 的 · 或輸入想要的編號(例如 ${EX})· 0 = 都不要:`, 'zh-CN': `Enter = 标 * 的 · 或输入想要的编号(例如 ${EX})· 0 = 都不要:`, ja: `Enter = * のもの · または欲しい番号を入力(例:${EX})· 0 = なし:` })
      : M({ en: `Enter = none · or type the numbers you want (e.g. ${EX}): `, 'zh-TW': `Enter = 都不要 · 或輸入想要的編號(例如 ${EX}):`, 'zh-CN': `Enter = 都不要 · 或输入想要的编号(例如 ${EX}):`, ja: `Enter = なし · または欲しい番号を入力(例:${EX}):` });
    const NONE = ['0', 'none'];
    let picked;
    for (;;) {
      const toks = (await ask(prompt)).toLowerCase().split(/[\s,]+/).filter(Boolean);
      if (!toks.length) { picked = pre; break; }
      if (toks.length === 1 && NONE.includes(toks[0])) { picked = []; break; }
      const bad = [], unavailable = [], got = [];
      for (const t of toks) {
        const key = t === 'statusline' ? 'gauge' : t;
        const r = NONE.includes(t) ? null : shown.find((x) => (/^\d+$/.test(t) ? x.n === Number(t) : x.key === key));
        if (!r) bad.push(t);
        else if (r.blocked) { if (!unavailable.includes(r)) unavailable.push(r); }
        else if (!locked(r)) got.push(r); // a locked row (installed / flag-given) is already in or kept: ignored
      }
      if (bad.length) {
        const keys = shown.map((r) => r.key).join(' / ');
        say(M({
          en: `  Not an option: ${bad.join(' ')} — type numbers from the list, names (${keys}), Enter for the * ones, or 0 for none.`,
          'zh-TW': `  沒有這個選項:${bad.join(' ')} — 請輸入清單上的編號、名稱(${keys})、Enter 選標 * 的,或 0 都不要。`,
          'zh-CN': `  没有这个选项:${bad.join(' ')} — 请输入清单上的编号、名称(${keys})、Enter 选标 * 的,或 0 都不要。`,
          ja: `  その選択肢はありません:${bad.join(' ')} — 一覧の番号か名前(${keys})を入力、Enter で * のもの、0 でなし。`,
        }));
        continue;
      }
      if (unavailable.length) {
        for (const r of unavailable) say(M({ en: `  Not available here: ${r.n}) ${shortName(r.key)} — see the reason in the list.`, 'zh-TW': `  這裡不能選:${r.n}) ${shortName(r.key)} — 原因見清單。`, 'zh-CN': `  这里不能选:${r.n}) ${shortName(r.key)} — 原因见清单。`, ja: `  ここでは選べない:${r.n}) ${shortName(r.key)} — 理由は一覧を参照。` }));
        continue;
      }
      picked = got;
      break;
    }
    const sel = ordered([...fixed, ...picked]);
    const chosen = [...sel].filter((k) => !shown.find((r) => r.key === k)?.installed);
    if (chosen.length) {
      const names = joinNames(lang, chosen.map(shortName));
      say(M({ en: `  → add-ons: ${names}`, 'zh-TW': `  → 附加元件:${names}`, 'zh-CN': `  → 附加组件:${names}`, ja: `  → オプション:${names}` }));
    } else {
      say(mode === 'add'
        ? M({ en: '  → no add-ons; upgrade only', 'zh-TW': '  → 不加裝,只升級', 'zh-CN': '  → 不加装,只升级', ja: '  → アドオンは追加せず、更新のみ' })
        : M({ en: '  → no add-ons (the core only)', 'zh-TW': '  → 不裝附加元件(只裝核心)', 'zh-CN': '  → 不装附加组件(只装核心)', ja: '  → オプションなし(コアのみ)' }));
    }
    return sel;
  }

  // 9–11. plan line + summary of every path the real install would write → confirm → install (same path as init) → doctor
  async function confirmAndRun(plan) {
    const { paths, refused, active = [] } = ctx.preview(plan);
    // Preflight failed: say which paths and why, and stop before asking — nothing has been written
    if (refused.length) { say(refusalReport(makeM(lang), refused)); return 1; }
    const o = plan.opts;
    // init: the chosen add-ons; update/add: installed ∪ chosen
    // (an --orca on a markerless install is skipped by install: no marker to hold the block)
    const addons = (plan.addons ?? ADDON_KEYS.filter((k) => ({ gauge: o.statusline, mod: o.mod || det.mod, roles: plan.roles || det.roles, orca: det.orca || (o.orca && !orcaNoMarker) })[k]))
      .filter((k) => k !== 'mod' || det.mod || active.includes('claude')); // a --mod without Claude Code is skipped by install
    // Safety net for a wrong locale preselect: the language (and the rest) is restated before the paths
    say(`\n  lang=${o.lang} · agents=${active.join(',')} · add-ons=${addons.join(',') || '-'} · profile=${o.profile}${o.private ? ' · private' : ''}`);
    say(M({ en: '\nThese paths will be written:', 'zh-TW': '\n將寫入以下路徑:', 'zh-CN': '\n将写入以下路径:', ja: '\n以下のパスに書き込みます:' }));
    for (const p of paths) say(`  ${p}`);
    // Default yes: the full list is right above it; n / EOF / Ctrl-C still cancel with zero writes
    if (!await yesNo(M({ en: '\nProceed?', 'zh-TW': '\n確定執行?', 'zh-CN': '\n确定执行?', ja: '\n実行しますか?' }), true)) return cancelled(1);
    say('');
    return ctx.execute(plan);
  }
}
