/**
 * flightwake setup — the guided, interactive install. It only *resolves options* by asking; the install itself is
 * install.mjs, the same path `init`/`update` take. Before the final confirmation nothing is written — not even
 * `git init`, which is remembered and run only after the user confirms the full list of paths (that list comes
 * from a dry run of the real install, not from a hand-written copy).
 *
 * Testability: runSetup({ io, flags, ctx }) takes injected I/O (io.ask(prompt) → line | null on EOF, rejecting
 * with INTERRUPT on Ctrl-C; io.out(text)) and an injected context (detection, preview, execute). The CLI wires a
 * readline io and realContext(); tests feed answers directly. No hidden environment switch bypasses the TTY check.
 */
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import {
  LANGS, GROUPS, MOD_MIN_CLAUDE, isAgentName, makeM, gitAvailable, repoState, detectInstall, detectedAgents, detectOrca, resolveOptions, install,
  printNext, addPrivateExcludes, gitMissingMessage, monorepoMessage, createWriter, refusalReport, incompleteReport,
} from './install.mjs';
import { installRolesSkill } from './roles.mjs';
import { runDoctor } from './doctor.mjs';

export const INTERRUPT = Symbol('interrupt');
class Abort { constructor(code) { this.code = code; } }

/** readline-backed io. Lines are queued, so input that arrives before a question is asked is never lost. */
export function readlineIO({ input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, output, terminal: !!input.isTTY });
  const queue = [];
  const waiters = [];
  let closed = false;
  let interrupted = false;
  rl.on('line', (l) => { const w = waiters.shift(); if (w) w.resolve(l); else queue.push(l); });
  rl.on('close', () => { closed = true; while (waiters.length) waiters.shift().resolve(null); });
  rl.on('SIGINT', () => { interrupted = true; while (waiters.length) waiters.shift().reject(INTERRUPT); });
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
    close: () => rl.close(),
  };
}

/** The real side effects, kept out of runSetup so tests can drive the questions against a real repo. */
export function realContext({ target, fwSrc, version, log = (s) => console.log(s), env = process.env }) {
  const rolesBases = (r) => ['.claude/skills', ...(r.agentsSkills ? ['.agents/skills'] : [])];
  return {
    gitAvailable,
    repoState: () => repoState(target),
    detect: () => detectInstall(target),
    detectedAgents: () => detectedAgents(target),
    orcaDetected: () => detectOrca(env),
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
      return { paths: [...new Set(paths)], refused };
    },
    execute(plan) {
      const M = makeM(plan.opts.lang);
      let r;
      const refused = [];
      try {
        if (plan.gitInit) { execFileSync('git', ['init'], { cwd: target, stdio: 'ignore' }); log(`  git init ${target}`); }
        r = install({ ...plan.opts, target, fwSrc, version, marker: detectInstall(target).marker, log });
        refused.push(...r.refused);
        // Add-ons after the core, through the same guarded writer
        if (plan.roles) {
          const rw = createWriter({ target, log, M });
          installRolesSkill({ target, fwSrc, lang: plan.opts.lang, bases: rolesBases(r), log, addExcludes: (e, W) => addPrivateExcludes(target, e, W), W: rw.W });
          refused.push(...rw.refused);
        }
      } catch (e) {
        log(incompleteReport(M, e?.message ?? String(e)));
        return 1;
      }
      if (refused.length) { log(incompleteReport(M, refused.map((x) => x.path).join(', '))); return 1; }
      log('');
      // Success is only claimed when doctor agrees
      if (runDoctor({ target, fwSrc, version, lang: plan.opts.lang, log })) {
        log(M({
          en: '\n✗ Files were written, but doctor found problems (the ✗ lines above) — setup is NOT complete. Fix them and run `npx flightwake doctor` again.',
          'zh-TW': '\n✗ 檔案已寫入,但 doctor found problems(見上方 ✗ 行)— setup 未完成。修正後再跑 `npx flightwake doctor`。',
          'zh-CN': '\n✗ 文件已写入,但 doctor found problems(见上方 ✗ 行)— setup 未完成。修正后再跑 `npx flightwake doctor`。',
          ja: '\n✗ ファイルは書き込んだが doctor found problems(上の ✗ 行)— setup は未完了。直してから `npx flightwake doctor` を再実行。',
        }));
        return 1;
      }
      if (plan.mode === 'update') {
        log(M({ en: `\n✅ updated to v${version}.`, 'zh-TW': `\n✅ 已更新到 v${version}。`, 'zh-CN': `\n✅ 已更新到 v${version}。`, ja: `\n✅ v${version} に更新しました。` }));
      } else {
        printNext({ ...plan.opts, langExplicit: true, marker: detectInstall(target).marker, log }, r);
      }
      if (plan.roles) log(M({
        en: '   ℹ️  Roles: ask your agent to "run fw-roles" — it scans the project, recommends a team and previews it before anything is applied',
        'zh-TW': '   ℹ️  角色:對 agent 說「跑 fw-roles」— 它會掃描專案、推薦角色組合,套用前先讓你預覽',
        'zh-CN': '   ℹ️  角色:对 agent 说「跑 fw-roles」— 它会扫描项目、推荐角色组合,套用前先让你预览',
        ja: '   ℹ️  ロール:agent に「fw-roles を実行して」と頼む — プロジェクトを調べてチームを提案し、適用前にプレビューする',
      }));
      return 0;
    },
  };
}

const LANG_LABELS = { en: 'English', 'zh-TW': '繁體中文', 'zh-CN': '简体中文', ja: '日本語' };

export async function runSetup({ io, flags = {}, ctx }) {
  const det = ctx.detect();
  let lang = flags.lang ?? det.marker?.lang ?? 'en';
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

    // 3. already installed → only "upgrade keeping the current options" (= update) or leave
    if (det.installed) {
      const m = det.marker;
      say(M({ en: 'flightwake is already installed here:', 'zh-TW': '這裡已經安裝了 flightwake:', 'zh-CN': '这里已经安装了 flightwake:', ja: 'ここには flightwake がインストール済です:' }));
      say(`  v${m?.version ?? '?'}  lang=${m?.lang ?? '?'}  profile=${det.profile}${det.statusline ? '  statusline' : ''}${det.private ? '  private' : ''}${det.roles ? '  roles' : ''}${det.orca ? '  orca' : ''}${det.mod ? '  mod' : ''}`);
      say(M({
        en: 'setup can upgrade it in place with these options (same as `npx flightwake update`). Changing options is not offered here — use init flags with --force.\n',
        'zh-TW': 'setup 可以沿用這些選項就地升級(等同 `npx flightwake update`)。這裡不提供調整選項 — 要改請用 init 加旗標與 --force。\n',
        'zh-CN': 'setup 可以沿用这些选项就地升级(等同 `npx flightwake update`)。这里不提供调整选项 — 要改请用 init 加旗标与 --force。\n',
        ja: 'setup はこのオプションのままその場で更新できます(`npx flightwake update` と同じ)。オプションの変更はここでは扱いません — init のフラグと --force を使ってください。\n',
      }));
      const opts = resolveOptions({ update: true, flags, det });
      return await confirmAndRun({ mode: 'update', gitInit, opts, roles: false });
    }

    // 4. language
    if (!flags.lang) {
      const def = LANGS.indexOf(lang);
      lang = LANGS[await choose('Language / 語言 / 语言 / 言語', LANGS.map((l) => `${LANG_LABELS[l]} (${l})`), def < 0 ? 0 : def)];
    }

    // 5. agents. Instruction files found → offer them (Enter keeps). None found → ask outright, nothing preselected:
    //    init's non-interactive fallback (codex) would otherwise hide the Claude-only gauge question from Claude users.
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

    // 6. add-ons: the core always installs; each add-on is its own question, default no
    say(M({ en: '\nThe core (records, the four skills, the wrap-up hook) is always installed. Optional add-ons:', 'zh-TW': '\n核心(紀錄、四個 skill、收尾 hook)一律安裝。以下是選配的附加元件:', 'zh-CN': '\n核心(记录、四个 skill、收尾 hook)一律安装。以下是选配的附加组件:', ja: '\nコア(記録・4 つの skill・締めの hook)は常にインストールされます。以下はオプション:' }));
    let statusline = !!flags.statusline;
    if (!statusline && agents.includes('claude')) {
      statusline = await yesNo(M({ en: '  Bottom gauge in Claude Code (health / STATE lag / context usage)?', 'zh-TW': '  Claude Code 底部儀表(health/STATE 落後/context 用量)?', 'zh-CN': '  Claude Code 底部仪表(health/STATE 落后/context 用量)?', ja: '  Claude Code 下部のゲージ(health / STATE の遅れ / context 使用量)?' }));
    }
    // The Claude Code mod: Claude Code only, so asked only when it was picked. Explained in plain words, with the two
    // things that decide whether it loads at all (version, and accepting the folder trust prompt the first time).
    let mod = !!flags.mod;
    if (!mod && agents.includes('claude')) {
      say(M({
        en: `  Claude Code mod — inside Claude Code: a status row above the prompt, STATE loaded when a session starts, a log of this session's changes and test runs (/fw-log), a hint when you touch something a known trap mentions, and an optional role guard.
    Needs Claude Code ${MOD_MIN_CLAUDE} or later; the first time you open this folder, Claude Code asks you to trust it — the mod loads only after you accept.`,
        'zh-TW': `  Claude Code mod — 在 Claude Code 裡:輸入框上方一列狀態、session 開始時自動帶入 STATE、記下這個 session 改了什麼與跑過的測試(/fw-log)、碰到已知的坑時提醒,以及選用的角色守門。
    需要 Claude Code ${MOD_MIN_CLAUDE} 以上;第一次在這個資料夾開 Claude Code 時會問你是否信任它(trust)— 接受後 mod 才會載入。`,
        'zh-CN': `  Claude Code mod — 在 Claude Code 里:输入框上方一行状态、session 开始时自动带入 STATE、记下这个 session 改了什么与跑过的测试(/fw-log)、碰到已知的坑时提醒,以及可选的角色守门。
    需要 Claude Code ${MOD_MIN_CLAUDE} 以上;第一次在这个文件夹开 Claude Code 时会问你是否信任它(trust)— 接受后 mod 才会加载。`,
        ja: `  Claude Code mod — Claude Code の中で:入力欄の上に状態を 1 行、セッション開始時に STATE を読み込み、このセッションの変更とテスト実行の記録(/fw-log)、既知の落とし穴に触れたときのヒント、任意のロールガード。
    Claude Code ${MOD_MIN_CLAUDE} 以上が必要。このフォルダで初めて開くとき Claude Code が信頼(trust)するか聞きます — 承認して初めて mod が読み込まれます。`,
      }));
      mod = await yesNo(M({ en: '  Install the Claude Code mod?', 'zh-TW': '  安裝 Claude Code mod?', 'zh-CN': '  安装 Claude Code mod?', ja: '  Claude Code mod をインストールしますか?' }));
    }
    const roles = await yesNo(M({
      en: '  Team roles (installs only the fw-roles skill; your agent recommends roles later, nothing applied yet)?',
      'zh-TW': '  團隊角色(只安裝 fw-roles skill;之後由 agent 推薦角色,現在不套用任何東西)?',
      'zh-CN': '  团队角色(只安装 fw-roles skill;之后由 agent 推荐角色,现在不套用任何东西)?',
      ja: '  チームロール(fw-roles skill のみ。ロールは後で agent が提案、今は何も適用しない)?',
    }));
    let orca = !!flags.orca;
    if (!orca && ctx.orcaDetected()) {
      orca = await yesNo(M({
        en: '  Orca collaboration (agents ask each other in your visible Orca tabs instead of hidden background runs)?',
        'zh-TW': '  Orca 協作(agent 互相討論或審查時走你看得到的 Orca 分頁,而不是看不見的背景程序)?',
        'zh-CN': '  Orca 协作(agent 互相讨论或审查时走你看得到的 Orca 分页,而不是看不见的后台进程)?',
        ja: '  Orca 連携(agent 同士の相談やレビューを、見えない背景実行ではなく見える Orca タブで行う)?',
      }));
    }

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
    return await confirmAndRun({ mode: 'init', gitInit, opts, roles });
  } catch (e) {
    if (e === INTERRUPT) return cancelled(130);
    if (e instanceof Abort) return cancelled(e.code);
    throw e;
  }

  // 9–11. summary of every path the real install would write → confirm → install (same path as init) → doctor
  async function confirmAndRun(plan) {
    const { paths, refused } = ctx.preview(plan);
    // Preflight failed: say which paths and why, and stop before asking — nothing has been written
    if (refused.length) { say(refusalReport(makeM(lang), refused)); return 1; }
    say(M({ en: '\nThese paths will be written:', 'zh-TW': '\n將寫入以下路徑:', 'zh-CN': '\n将写入以下路径:', ja: '\n以下のパスに書き込みます:' }));
    for (const p of paths) say(`  ${p}`);
    // Default yes: the full list is right above it; n / EOF / Ctrl-C still cancel with zero writes
    if (!await yesNo(M({ en: '\nProceed?', 'zh-TW': '\n確定執行?', 'zh-CN': '\n确定执行?', ja: '\n実行しますか?' }), true)) return cancelled(1);
    say('');
    return ctx.execute(plan);
  }
}
