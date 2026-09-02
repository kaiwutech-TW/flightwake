---
record_id: 260902-codex-gemini-native
session: Claude(Fable 5.1)
date: 2026-09-02
repos: [flightwake]
tests: bash test/smoke.sh 28/28 全過(新增 Codex/Gemini 方言、.agents/skills、.codex/.gemini hook、uninstall 對稱、hook 三宿主 stdin 測項);本 repo dogfood `node bin/cli.mjs update` 正常;Codex 0.147.0 真機:`codex exec` 列出 fw-coldstart/fw-record/fw-trap/fw-handoff 四個 skill,落後 3 commits 的 repo 收到 Stop hook 的 flightwake reason 作為 hook_prompt 續跑(證據見「驗證證據」)
prod_changes: npm v0.13.0 發佈(PR #9 merge commit 8924786 → GitHub Release v0.13.0 → release.yml trusted publishing;發佈後驗證見「驗證證據」)
---

# Codex / Gemini CLI 原生支援:同一套 skill 與 hook,裝進各平台的位置與方言

**TL;DR**:使用者在 Codex 裡發現義務表叫它跑 `/fw-coldstart`,但 Codex 沒這指令、也讀不到
`.claude/skills/`——「多平台安裝」其實只是把同一張 Claude 表貼進 AGENTS.md。使用者要的是
多 agent 共享;資料層 `.flightwake/` 本來就在 git 裡共享,缺的是動詞層。本批補齊:偵測到
Codex/Gemini 時,skill 複製到 `.agents/skills/fw-*`(兩家共讀)、STATE 檢查裝成 `.codex/hooks.json`
的 Stop hook 與 `.gemini/settings.json` 的 AfterAgent hook(同一份腳本)、義務表按平台改寫
呼叫語法(`/fw-`→`$fw-`/裸名)並附一行「skill 與 hook 在哪」;uninstall 反向對稱。
決策一行見 DECISIONS 2026-09-02。

## 關鍵發現(重要性排序)

1. **三個宿主的 hook 協定幾乎相容,差在一個字**:Claude Code 與 Codex 的 Stop 都吃
   `{"decision":"block","reason"}`;Gemini CLI 的 AfterAgent 把同一件事拼成 `"deny"`。三家 stdin
   都帶 `hook_event_name`、`transcript_path`、`cwd`、`stop_hook_active`,所以一份腳本靠
   `hook_event_name === 'AfterAgent'` 切字即可,防循環的 `stop_hook_active` 判斷原樣通用。
2. **Codex/Gemini 不設 `$CLAUDE_PROJECT_DIR`**:hook 以 session cwd 執行。改用
   `node "$(git rev-parse --show-toplevel)/.flightwake/hooks/state-check.mjs"`(git 本來就是允許依賴);
   Claude 那份 command 維持不動,避免既有安裝的去重判斷受影響。
3. **Codex repo 級 hook 需人工信任一次**(`~/.codex/config.toml` 的 `[hooks.state]` 按定義雜湊記
   `trusted_hash`,改了就再問);非互動 `codex exec` 要 `--dangerously-bypass-hook-trust` 才會跑。
   這點寫進義務表尾行與 README,無法由安裝器代做。
4. **Codex 與 Gemini CLI 都讀 `.agents/skills/`**(Gemini 視為 `.gemini/skills/` 的別名且優先),
   所以一個目錄服務兩家;Codex 用 `$skill-name` 點名、Gemini 只能靠描述自動觸發或叫名字。
   機隊裡 kaiwuweb 已有自己的 `.agents/skills/*`,安裝與 uninstall 都只碰 `fw-*` 四個子目錄。
5. **Codex 真機兩個坑**:①從 agent 的 Bash 跑 `codex exec` 沒接 `</dev/null` 會等 stdin EOF 永久卡住
   (9 分鐘 0% CPU 才發現;已登 TRAPS [[codex-exec-stdin-hang]],confirmed)。②`-s read-only` 沙盒下
   Stop hook 顯示「Completed」但沒有續跑,連 `touch` + `echo` 的最小 hook 也一樣;改 `-s workspace-write`
   兩者都正常——**confidence: probable**(兩次觀察、沒單獨隔離原因),互動 Codex 預設就是 workspace-write,
   所以先不當 trap 登,只記在這。
6. **測試自己踩的坑**:`grep '/fw-'` 想抓斜線指令,結果被 `.agents/skills/fw-*` 路徑命中——要抓
   指令形式得連反引號一起比對(`` `/fw- ``)。

## 本批變更

- `bin/cli.mjs`:平台偵測(GROUPS/ACTIVE)提前到 skill 安裝之前、`--agents` 非法值改為寫檔前就退出;
  `installSkills()` 抽函式,`.agents/skills` 在 codex/gemini 啟用時多裝一份;新增 4b 節裝
  `.codex/hooks.json`(Stop)/`.gemini/settings.json`(AfterAgent),`--private` 下受追蹤即跳過警告、
  未追蹤則寫入並 exclude;義務表 `blockFor(platform)` 改寫 `` `/fw-x` `` 為各平台語法並附平台註記;
  uninstall 對 `.agents/skills/fw-*`、兩個 hook 檔、空目錄反向清除;完成提示的 `git add` 路徑依
  啟用平台動態列出、`/fw-record` 改為平台中立
- `hooks/state-check.mjs`:`DECISION` 依 `hook_event_name` 切 block/deny;訊息 `/fw-record`→`fw-record`
- `test/smoke.sh`:測項 7 加三宿主 stdin;測項 8/9 驗方言、`.agents/skills`、hook 檔與「未偵測到就不裝」;
  新增 11b(uninstall 對 Codex/Gemini 對稱、使用者自己的 skill/hook/GEMINI.md 不動、空目錄清掉)
- 四語 README(安裝段、目錄樹、糖衣句、CI 段、寫入範圍、信任句、多 agent 手冊入口)、CHANGELOG Unreleased
  (本批 + 補記 registry)、docs/workflow 兩語言加一行語法對照、DECISIONS 一行、TRAPS 一條
- **新增 docs/multi-agent.md + docs/multi-agent.zh-TW.md**(使用者 session 中追加的需求):三個模型怎麼共用同一個
  資料夾的 flightwake 記憶——共享的是 `.flightwake/`(git),各平台差的只是呼叫語法與 hook 位置;
  切換模型的日常循環(換手前 record、換手後 coldstart)、什麼不共享(各家自己的 memory/transcript)、
  同機同 worktree 不用 commit 也共享但跨機要 push、兩個 agent 同時開同一 repo 的規矩
- 本 repo dogfood:`update` 刷新了 `.flightwake/hooks/state-check.mjs` 與 CLAUDE.md 片段(本 repo 只有
  CLAUDE.md,所以沒裝 Codex/Gemini 檔——屬預期)

## 驗證證據

- `bash test/smoke.sh`:28/28 全過(`✅ smoke 全過`)
- 暫存 repo 實跑 `init`(無指令檔):AGENTS.md 義務表為 `$fw-coldstart` 等四處、尾行平台註記;
  `.agents/skills/` 四個 skill;`.codex/hooks.json` Stop hook command 為 git toplevel 形式
- hook 腳本三宿主 stdin:`{}`/Codex 形狀 → `"decision":"block"`;`{"hook_event_name":"AfterAgent"}` →
  `"decision":"deny"`;`stop_hook_active:true` → 靜默
- **Codex 0.147.0 真機**(暫存 repo,STATE 已 commit 後再 3 個 commit,`codex exec --json
  --dangerously-bypass-hook-trust -s workspace-write … </dev/null`):
  - skill 發現:模型回「skills seen: … fw-coldstart, fw-handoff, fw-record, fw-trap …」(從 `.agents/skills/` 讀到)
  - Stop hook:第一則 agent_message `READY.`,第二則為
    `<hook_prompt hook_run_id="stop:8:…/.codex/hooks.json">flightwake: .flightwake/STATE.md lags 3 commits behind. Run fw-record to wrap up …</hook_prompt>`
    ——hook 的 reason 確實成為續跑 prompt;git status 乾淨(模型沒亂寫)
  - 對照組:最小 hook(`echo '{"decision":"block","reason":"reply BANANA"}'`)→ `APPLE` 後續跑回 `BANANA`
- **npm 發佈驗證(2026-09-02 同 session)**:PR #9 CI 全綠(smoke macos/ubuntu、state-fresh、CodeQL)→
  `gh pr merge --merge`(8924786)→ `gh release create v0.13.0` → release run 33589488156 success(18 秒)→
  `npm view flightwake version` 第 5 次輪詢(約 60 秒後)實回 `0.13.0`,tarball `flightwake-0.13.0.tgz`,
  `time.modified` 2026-09-02T04:06:58Z(trusted publishing 第九次零失誤)

## 未完 / 交接

- **Gemini CLI hook 未真機驗證**:`.gemini/settings.json` 的 hooks 結構與 AfterAgent `deny` 語意來自
  官方 reference(geminicli.com/docs/hooks/reference),本機有 gemini 0.46 但未實跑;機隊目前零個
  GEMINI.md,風險面小。第一個真的用 Gemini 的 repo 要驗:hook 是否觸發、`deny` 的 reason 是否成為下一則
  prompt
- `--private` 對 Codex/Gemini 只做「未追蹤才寫 + exclude」,沒有 Claude 那種 local 等價檔(Codex 的
  `~/.codex/hooks.json` 是使用者級不是 repo 級);smoke 未加 private+codex 測項
- ~~發版~~ 已發 0.13.0(見驗證證據)。剩:常用 repo `npx flightwake update`——有 AGENTS.md 的 16 個機隊
  repo 會在 update 時自動長出 `.agents/skills` 與 `.codex/hooks.json`,**每個 repo 首次開 Codex 都會被問
  一次信任 hook**(已向使用者說明)
- gh 活躍帳號本 session 切到 kaiwutech-TW 後未切回(見 [[gh-active-account-drift]])
