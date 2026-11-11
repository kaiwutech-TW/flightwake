# 收窄與上線計畫(narrow-and-launch)

- 規劃:Claude Code(Fable 5.2),2026-11-10。實作:預定由 Opus 5.5 接手。
- 依據:`reports/flightwake 與跨 agent 記憶方案比較.md`、`reports/flightwake 採用差距與宣傳策略.md`(兩份都未進版控,細節與來源連結在裡面;本檔只寫要做什麼)。
- 順序是使用者指定的:**A 程式端 → B 線上資訊 → C 推廣(由 Kai 本人做)**。
- 方向一句話:守住 Markdown 核心與 TRAPS,凍結機隊外掛,補上 agy,把入口修到陌生人看得懂,再去有人的地方說。

## 給實作者的規則

1. 開工先跑 `/fw-coldstart`。STATE 目前是 `health: yellow`,A1 是回綠的必經項,不要跳過它先做別的。
2. 完成的定義照 CLAUDE.md:`bash test/smoke.sh` 全過、`claude plugin test mods/flightwake` 的結果有定案、`tsc` 乾淨。smoke 需要 Python 3.11 以上在 PATH 前面(TRAPS `smoke-needs-python-311`)。
3. 廠商行為不要憑記憶寫。Claude Code 的 plugin 市集與 hook、Codex 的 hook、Antigravity 的 hook 與 rules,動手前先讀當前官方文件;本檔標「未驗」的地方都要先做真機探針再寫程式。探針結果比照 `docs/plans/roles-v2.codex-probe.md` 存成檔。
4. 每個工作項做完一個 commit;關掉其他選項的決定寫進 `.flightwake/DECISIONS.md`;踩到坑當下 `/fw-trap`;每 3 個 commit 或動到發版就 `/fw-record`。
5. 文件與 skill 目前是四語同步(en / zh-TW / zh-CN / ja)。在 Kai 決定 D3 之前照舊四語都改。
6. 要 Kai 本人做或確認的事,本檔都標了 **[Kai]**。碰到就停下來問,其餘繼續做。對外動作(npm 發版、網站部署、`gh repo edit`)一律先確認。
7. 這份計畫的範圍是收窄。不要順手替 fleet、面板、spend、roles 加功能。

## 開工前要 Kai 拍板的決定

| 編號 | 決定 | 建議的預設 | 影響 |
|---|---|---|---|
| D1 | 凍結 fleet、面板、spend、role-guard、CLI `roles` / `fleet` | 凍結:只修相容性,不加功能 | A10 的文件標示;之後的範圍 |
| D2 | agy 成為第三家預設,gemini 降級保留 | 是 | A2 |
| D3 | zh-CN、ja 是否繼續同步 | 停在現版並標示;en 與 zh-TW 繼續維護 | A 與 B 每一項的工作量差一倍 |
| D4 | 唯讀指令提到路徑時,絆線還要不要提示 | 不提示(只認 Edit/Write 的路徑與指令開頭) | A5 的設計 |
| D5 | `reports/` 與 `research_notes/` 要不要進版控 | 不進(repo 是公開的,裡面有流量與帳號分析);加進 `.git/info/exclude` | 本檔引用的兩份報告只在本機 |

**已決定(2026-11-10)**:D1–D5 全照建議的預設,見 `.flightwake/DECISIONS.md` 同日五條。因 D3,下文所有「四語」改為只同步 en 與 zh-TW。

## 對先前簡報的一項更正

第一份簡報寫「STATE 有 10.6K 字元、超過 6,000 的注入門檻」。那是 `DECISIONS.md:76` 在 10 月 5 日記下的舊數字。2026-11-10 實測 `wc -m .flightwake/STATE.md` 是 **4,805 字元**,在門檻內(門檻在 `mods/flightwake/hooks/features/state-inject.ts:15`)。所以「把 STATE 壓回門檻內」不是待辦,只剩 A4 的小整理。

---

## A. 程式端

分兩批。第一批讓 health 回綠並發 0.18.0;第二批是需要先過設計關的較大改動。

### 第一批(目標:0.18.0)

#### A1. 替 25 個失敗的 mod 測試定案

- **現況**:`claude plugin test mods/flightwake` 在 Claude Code 2.1.310 是 521 過 / 25 敗,全在 fleet;clean HEAD 同一組。推測是測試環境對沒人回答的權限請求改判拒絕(TRAPS `plugin-test-kit-denies-unanswered-permission-request`,把握度 probable)。
- **步驟**
  1. `claude --version`,在目前版本重跑,記下通過與失敗數。子代理查到 10-26 之後又出了到 2.1.321 的版本,其中 2.1.318 改了 mod 在 `prompt.submit` 附加內容的位置、2.1.321 改了巢狀 skill 的載入規則,兩者都可能影響 mod,要一併看。
  2. 讀當前版本的 plugin testing 文件,確認測試環境對未回答的權限請求的行為。
  3. **[Kai]** 真機驗一次 F7:開一個互動 session,觸發權限對話框,確認 `~/.flightwake/sessions/<id>.json` 寫成 `blocked`,回答後回到 `working`。實作者準備好逐步清單再請 Kai 做。
  4. 真引擎沒退化:改測試(在測試裡明確回答權限請求),目標 0 失敗。真引擎有退化:修不動就把受影響的功能在 `docs/mod.md` 標成已知問題,測試標記略過並寫明原因。
  5. 把 TRAPS 那條依結果升級成 confirmed 或改寫。
- **驗收**:mod 測試 0 失敗,或每個略過都有寫明的原因;STATE 的 health 註解據此更新。
- **順帶驗掉 STATE 上的舊待驗**:v2 觸發紀錄在真 session 的寫入(`~/.flightwake/trips/` 是否為 v2、`node bin/cli.mjs traps stats` 的 sessions 欄有值)。

#### A2. 支援 Antigravity(`agy`),Gemini 降級

- **已知**:Kai 實測 agy 能跑 `fw-coldstart`,代表它讀得到 `.agents/skills/fw-*`。
- **未驗**:agy 是否依 `AGENTS.md` 的義務表行動;hook 的載入位置、事件名稱、stdin 與輸出格式。研究筆記引 Antigravity 官方文件說 hook 在 `.agents/hooks.json`、有 `Stop` 事件、`PreToolUse` 沒有 context 注入,但沒人在真機上試過。
- **步驟**
  1. 讀 Antigravity 官方的 hooks、skills、rules 文件,寫探針檔 `docs/plans/agy.probe.md`:要驗哪幾件事、怎麼驗、預期看到什麼。
  2. **[Kai]** 依探針檔在 agy 上跑一輪,把結果填回去。至少要有:四個 skill 各跑一次、`AGENTS.md` 義務表有沒有被遵守、一個最小的 Stop hook 有沒有被呼叫與它收到的 stdin。
  3. 依探針結果改程式:
     - `bin/install.mjs:24-25` 的平台表加 `agy`(指令檔用 `AGENTS.md`)。
     - `bin/install.mjs:245-248` 的自動偵測:加上 agy 的判斷依據(探針時確認 repo 裡哪個檔或資料夾能代表「這個 repo 有人用 agy」)。
     - `bin/install.mjs:693-694`:`.agents/skills` 的條件加上 agy。
     - `bin/install.mjs:795-799`:hook 安裝迴圈加 agy。寫入 `.agents/hooks.json` 時要合併既有內容,不能覆蓋使用者自己的 hook;`--private` 的處理比照 codex 那段的註解。
     - `bin/install.mjs:841-853`:四語的安裝後說明加 agy 一段;gemini 那段補一句「只適用企業授權或付費 API key,hook 未經真機驗證」。
     - `bin/install.mjs:1134-1135` 與 `bin/remove.mjs`:移除清單加 agy 寫過的檔。
     - `hooks/state-check.mjs:35-37`:目前用 `hook_event_name === 'AfterAgent'` 分辨 Gemini 並輸出 `deny`。依探針看到的 agy stdin 加一個分支。
     - `bin/doctor.mjs`、`bin/setup.mjs`、`bin/cli.mjs` 的說明文字:認得 agy。`bin/roles.mjs` 屬於凍結範圍,只確認不會因為新平台名稱而壞。
  4. `--agents=gemini` 繼續可用。已安裝 gemini 的 repo 跑 `update` 不能出錯,也不要自動改成 agy。
  5. `test/smoke.sh` 加一節:`init --agents=agy` 寫出預期的檔、與既有 `.agents/hooks.json` 合併不丟內容、`uninstall` 還原、`update` 對舊的 gemini 安裝不變。
  6. 文件:`docs/multi-agent.md` 與 README 的平台表加 agy。
- **退路**:如果 agy 的 hook 接不起來,就只出 skill 加 `AGENTS.md`,文件寫明「agy 上沒有自動催收尾」。
- **對外說法**:hook 驗過之前只能寫「skill 可在 agy 使用」,不能寫「支援 Antigravity」。
- **驗收**:smoke 全過;真機上一個落後 3 個 commit 的 repo,agy 結束回合時被提醒收尾(或已走退路並寫明)。

#### A3. TRAPS 壓回 20 條內,處理 13 條無錨點

- **現況**(`node bin/cli.mjs traps stats`,2026-11-10):32 條 active,19 條有錨點,13 條沒有。STATE 寫 31 條,少算一條。
- **沒有錨點的 13 條**:`orca-send-sgr-mouse-leaks-into-claude-composer`、`unquoted-heredoc-runs-backticks`、`project-skills-dir-mod-needs-trust`、`codex-project-trust-exact-path`、`codex-agent-toml-unknown-field-drops-role`、`orca-worker-start-writes-codex-trust`、`codex-custom-agent-sandbox-not-enforced`、`codex-exec-project-hooks-not-loaded`、`macos-mktemp-symlink-cwd-mismatch`、`gh-active-account-drift`、`hook-stdin-tty-block`、`dogfood-dual-copy-drift`、`codex-exec-stdin-hang`。
- **步驟**
  1. 逐條產出處置提案,格式照 `fw-coldstart` 的紅線:先診斷,再列每一條要怎麼處理和原因。處置只有四種:補 `paths` / `commands` 錨點;合併進另一條;標 `superseded`(已被新版修掉或不再成立);改落成測試或移到 `AGENTS.md`。
  2. 廠商怪癖類的條目,先在目前版本上重驗一次再判斷是否仍成立。不能驗的照原樣留著,不要猜。
  3. **[Kai]** 逐條放行。確認前不動 TRAPS.md。
  4. 壓實永不刪行,只改 status 與整併。
- **驗收**:active ≤ 20;留下來的無錨點條目每一條都有「為什麼無法錨定」的一句話;`traps stats` 的摘要與 STATE 一致。

#### A4. STATE 小整理

- 更正過時的事實:TRAPS 條數;「宣傳三稿在桌面」那一行(檔案已不存在,文案要重寫);`DECISIONS.md:76` 提到的 10.6K 不用改(那是當時的事實)。
- 「現在在哪」裡 0.16.0、0.17.0 的內容說明各有 record,縮成一行加連結。
- 「下一步入口」指向本檔。
- 這項併在 A 批收尾的 `/fw-record` 裡做,不單獨 commit。

#### A7. `/fw-trap` 加入選門檻

- **做什麼**:寫入前多問兩題。這條消失後,下一個人是否仍可能重蹈覆轍;它能不能改寫成測試或 lint。能就不登記成文字坑。另加一個選填欄位 `retire_when`(什麼情況下這條可以退場)。
- **檔案**:`skills/<lang>/fw-trap/SKILL.md`(四語)、`templates/` 裡的 TRAPS 範本、兩份解析器(`bin/traps.mjs` 與 `mods/flightwake/hooks/lib/traps.ts`)要容忍新欄位。兩份解析器沒有同步檢查,改一邊要記得另一邊。
- **驗收**:smoke 加一例含 `retire_when` 的條目,`traps similar` 與 `traps stats` 都讀得過;舊條目不受影響(讀取端容忍,DECISIONS 2026-07-18)。

#### A8. 套件中繼資料

- `package.json` 的 `keywords`(現在是 `claude-code`、`ai-agent`、`workflow`、`flight-recorder`、`gsd`):加 `codex`、`antigravity`、`agents-md`、`agent-skills`、`ai-memory`、`handoff`、`pitfalls`。
- `description` 改成 B1 定下來的那一句痛點,兩處同一句。
- npm 上的關鍵字要等 A12 發版才生效。

#### A10. 凍結標示與安裝提問瘦身

- `docs/mod.md`(四語)與 README:fleet、面板、spend、role-guard、roles 標成「維護模式:只修相容性」。
- `bin/setup.mjs`:新安裝時附加元件那一題現在一次列四個。**[Kai]** 決定是否改成預設不問、要加的人用旗標或在問題裡選「看附加元件」。這會改到 smoke 的 setup 段落與 `docs/plans/setup.md` 記下的行為。
- 需要 D1 的答案。

#### A12. 發 0.18.0

- **2026-11-10 已發**:v0.18.0(mod 0.4.0),證據見 record `261110-release-018`。

- CHANGELOG 把 `[Unreleased]` 分出 `[0.18.0]`;mod 版號從 0.3.0 往上推(`mods/flightwake/.claude-plugin/plugin.json`)。
- 內容:10-19 的兩個修正、10-26 的 traps 功能與 review 修正、A1、A2、A7、A8、A10。
- **[Kai]** 發版是對外動作,先確認。發完把 release run 與 provenance 的證據寫進 record。
- 發版後刷新本 repo 的 dogfood 副本(TRAPS `dogfood-dual-copy-drift`)。

### 第二批(先過設計關,各自一份 `docs/plans/<主題>.md`)

#### A5. 絆線改成一般 hook,執行前提示,Codex 也能用

- **為什麼**:現在的絆線只在 Claude Code 加 mod 生效,而且是工具跑完才提示。B1 想主打「換一個 agent 改到同一個檔之前會先看到」,目前做不到。
- **2026-11-10 審查結果**:「執行前」在 Claude Code 上依官方文件不成立,A5 的範圍與承諾見 `tripwire-hook.md` 的「審查後的修訂」;做不做、做多少待 Kai 決定。
- **2026-11-11 已實作(未發版)**:Kai 選照修訂範圍做。探針 `tripwire-hook.probe.md`:Codex 也是工具跑完才讀到提示,所以兩家都只能說「下一步就會看到」。共用核心 `traps-core.mjs`、一般 hook `trap-check.mjs`、hints 去重、安裝/移除/doctor、smoke 第 50 節;延遲中位數約 80 ms。
- **方向**:新增一支獨立的 `hooks/trap-check.mjs`,掛在 Claude Code 與 Codex 的 `PreToolUse`,比對 TRAPS 的 `paths` / `commands`,用 hook 的附加 context 欄位在執行前提示。永不擋。
- **設計關要回答的問題**
  1. Codex 的 `PreToolUse` 能不能注入 context、matcher 只比對工具名時怎麼拿到路徑與指令、專案 hook 的信任流程(TRAPS `codex-exec-project-hooks-not-loaded`、`codex-project-trust-exact-path`)。先做探針。
  2. 解析器已經有兩份。hook 是整支複製進使用者 repo 的 `.flightwake/hooks/`,必須能獨立執行。要決定是第三份、還是把 `bin/traps.mjs` 的解析抽成一個會一起複製的模組,並加上一致性測試。
  3. 同一個 session 重複提示怎麼去重(hook 是無狀態的行程)。可以沿用 `<base>/trips/` 的私有資料夾規則另存一份提示紀錄。
  4. 和 mod 絆線並存時不能提示兩次。建議:裝了一般 hook 就由它提示,mod 只留觸發紀錄。
  5. D4:唯讀指令提到路徑時不再提示。
  6. 每次工具呼叫多跑一個 node 行程的延遲,量一次。
- **審查**:這項動到每一次工具呼叫,設計檔寫完先請另一個 agent 在可見的 Orca 分頁審(CLAUDE.md 的 Orca 協作規則),回覆原文存成 `docs/plans/tripwire-hook.review-<審查者>.md`。
- agy 的 `PreToolUse` 據文件沒有注入管道,這項不含 agy,由 A6 補。

#### A6. 由 TRAPS 錨點產生 agy 的路徑規則

- **方向**:`npx flightwake traps export-rules`(名稱待定)把 active 且有 `paths` 的條目寫成 `.agents/rules/` 下的規則檔,用 Antigravity 的 glob 觸發。內容是和絆線提示一樣的精簡版(根因與繞法各一行),檔頭標明「由 TRAPS.md 產生,勿手改」。`update` 與 `/fw-trap` 寫入後重新產生,已不存在的條目對應的檔要清掉。
- **只做 agy**:Claude Code 與 Codex 有 A5 的 hook,再產生 `.claude/rules/` 會同一條提示兩次。
- **設計關要回答的問題**:Antigravity 規則檔的 frontmatter 格式(先讀文件並做探針);這違反「同一事實只寫一處」到什麼程度、如何保證 TRAPS.md 是唯一正本(寫進 DECISIONS);`--private` 安裝時這些檔進不進 git。
- **驗收**:真機上 agy 改到有錨點的檔時讀得到對應的坑。
- **2026-11-11 已實作(未發版)**:探針顯示 agy CLI 的 `glob` 規則讀檔、改檔都不載入,改用 `model_decision`;agy 在沒有提示的改檔前就先讀了規則(`agy-rules.md`)。`npx flightwake traps rules`,init/update 重產,smoke 第 51 節。

#### A9. 包裝成 Claude Code plugin,從自架市集安裝

- **為什麼**:目前只能用 `npx`。研究裡成長最陡的工具都走 plugin 目錄或 skill 排行榜;自架市集不需要審核。
- **方向**:repo 根目錄加市集描述檔,列一個只含核心的 plugin(四個 skill、Stop hook),不含 mod 的機隊功能。
- **設計關要回答的問題**
  1. 讀當前的 plugin 與市集文件,確認描述檔格式、plugin 內 skill 與 hook 的路徑規則。
  2. skill 依賴 `.flightwake/` 範本。plugin 安裝後第一次使用時由誰建立它:讓 `fw-coldstart` 在找不到 `.flightwake/` 時引導跑 `npx flightwake init`,或 plugin 自帶範本。
  3. plugin 的 skill 只能一種語言,先出 en。
  4. 同一個 repo 同時有 npx 安裝與 plugin 安裝時,skill 與 hook 會不會重複。`doctor` 要能看出來。
- **2026-11-11 已實作(未發版)**:Kai 決定做。設計與探針 `plugin-marketplace.md`;smoke 第 52 節;`--plugin-dir` 真機跑過 `/fw-coldstart` 與坑提示。
- **不在這一批**:把陷阱登記拆成可單獨安裝的 skill 上 skills.sh。第二份報告建議等第一輪推廣後看反應再決定。

---

## B. 線上資訊

A 的第一批發版之後做。B 裡的每一句對外宣稱都要對得上當時已發佈的功能;A5、A6 沒做完之前,不寫「改到之前先提醒」「支援 Antigravity」。

#### B1. 重寫 README 第一個畫面

- **現況**:`README.md:4` 以比喻開場;第 12 行才有描述句,還把對象限縮在 "Claude Fable 5 generation and beyond";痛點在第 106 行;安裝段落(18–59 行)有 1,097 字的旗標細節;時間宣稱四種(第 14 行約 30 秒、75 行約 1 分鐘、119 行 2 分鐘、90 行 5 分鐘)。
- **第一個畫面只留四樣**:一句痛點、一行安裝指令、一段英文示範、一個證據連結。
- **兩個主打,依證據強度排**
  1. 把專案交給別人或另一個 session 時,對方從 repo 就看得懂怎麼做出來的、解過什麼問題、做過哪些決定。這是 Kai 的親身使用經驗,現在就成立。
  2. 踩過的坑記在 repo 裡,所有 agent 都讀得到。「改到之前先提醒」等 A5、A6 完成才能加上。
     - 2026-11-10 更正:Claude Code 的 PreToolUse 提示隨工具結果送達,一般 hook 也做不到「改到之前」(DECISIONS 同日、`tripwire-hook.md` 審查後的修訂)。這一句只能寫成「改到有坑的檔時,下一步就會看到」,Codex 待探針。
- **[Kai]** 那一句痛點由 Kai 定稿。實作者給三個候選,不要自己選。**2026-11-10 Kai 選第 1 句(交接)**,README 雙語與 package.json description 已改(f455208);GitHub 描述在 B5。
  - 候選(2026-11-10,實作者擬):
    1. "Hand this repo to another person or another agent, and they can see how it was built: what was done, why each choice was made, and which traps were found."(主打交接,現在就成立)
    2. "Your agents forget between sessions. flightwake writes down what happened, what was decided and what bit you, in the repo, where Claude Code, Codex and Antigravity all read it."(主打跨 agent;Antigravity 要等 agy 探針)
    3. "A flight recorder for AI coding agents: a short state file, a decision log and a list of known traps, kept in git and read by every agent at the start of a session."(主打機制,保留原比喻)
  - 量測(2026-11-10):乾淨暫存 repo 裡 `node bin/cli.mjs init --agents=claude,codex` 三次各約 0.1 秒;`npx` 下載套件(約 1.1 MB、119 個檔)另計,沒量。真正的好處(新 session 冷啟動接手)要在 agent 裡量,沒量。
- 旗標、附加元件、語系變數等細節搬到 `docs/install.md`(四語或依 D3)。
- 時間宣稱:在乾淨的暫存 repo 量一次安裝到第一次冷啟動回報的時間,全文只用這一個數字,並寫明量測條件。「5 分鐘」是品質指標的門檻,不是宣稱,保留但改寫清楚。
- 其他語言版本依 D3 同步或標示。
- **驗收**:README 的前 40 行內出現痛點、安裝指令、示範、證據;全文時間宣稱一致。

#### B2. 英文示範

- `docs/demo.gif` 是繁中安裝畫面,英文 README 在用。先查原檔是怎麼錄的(repo 裡找錄製腳本或 record),用同一個方法以 `--lang=en` 重錄。
- 加第二段:新 session 在有紀錄的 repo 接手,接著改到有坑的檔案時出現提示。用 flightwake 自己的 repo 錄。
- **[Kai]** 需要真實終端機畫面的部分由 Kai 錄,實作者準備腳本與逐步清單。
- **2026-11-11**:Kai 改成「Kai 錄旁白、實作者抓畫面」;約 65 秒、前 10 秒講痛點。旁白稿與畫面清單在 `demo-video.md`。

#### B3. 把手上的證據變成英文讀得到的頁面

- `docs/evidence.md`(名稱待定):這個 repo 自己的 `.flightwake/` 就是範例。寫明目前有幾份 record、幾條決策、幾條 trap(數字用指令現算,不要抄報告裡的),各連到三個具代表性的檔,並用英文說明每個檔在講什麼。
- 106 條坑、24 條誤診(22%)的稽核:來源是 `.flightwake/records/260803-trap-confidence.md`。寫成一段英文的自我揭露,明講原始資料在私有 repo、外人無法覆核。不要包裝成 benchmark。
- `docs/benchmarks.md`:在開頭寫明樣本只有 n=2、對照組沒有實跑。不要在 README 引用它當對外比較。

#### B4. 網站

- `website/src/components/Landing.astro` 與 `website/src/content.ts`:首屏加安裝指令;「匿名重建」的示意改用 B2 的真實畫面或明確標示;英文標題加入 Claude Code、Codex、memory 等搜尋詞;平台列表加 agy;版本號更新。
- 根路徑 `/` 目前對爬蟲是繁中。確認 `x-default` 與根路徑的語言策略,英文應該是預設。
- `llms.txt` 同步。
- 流量統計:目前完全沒有。網站在 Cloudflare Pages,**[Kai]** 決定是否啟用 Cloudflare Web Analytics(不用 cookie),需要 Kai 在後台開啟並提供 token。
- 部署照 `website/README.md` 的 Direct Upload。**[Kai]** 部署前確認;部署後把四語路由的 HTTP 狀態寫進 record。
- **2026-11-11 已部署**(Kai 確認):0.18.0、首屏交接句與安裝指令、平台加 agy、`/` 改英文(DECISIONS 同日)、`llms.txt`;流量統計未開(要 Kai 在 Cloudflare 後台決定)。**2026-11-11 已開**:Pages 專案的 Web Analytics 開關，部署時自動插入 beacon,不需 token。

#### B5. GitHub 與 npm 頁面

- **2026-11-11 已改**(Kai 確認):描述換成交接句,topics 加上下列五個。
- GitHub topics 現在是 `ai-agent`、`claude-code`、`developer-tools`、`flight-recorder`、`workflow`。加 `codex`、`antigravity`、`agents-md`、`agent-skills`、`ai-memory`。描述改成 B1 的那一句。**[Kai]** `gh repo edit` 是對外動作,先確認。
- npm 頁面跟著 A12 或下一次發版更新。README 改完要再發一版 npm 才看得到。

#### B6. 流量基準

- GitHub 流量只保留 14 天。每次 `/fw-record` 時跑一次 `gh api repos/kaiwutech-TW/flightwake/traffic/views` 與 `.../clones`、`.../popular/referrers`,把數字記在 record 裡。
- 2026-11-10 的基準:10 顆星;10-26 到 11-08 共 30 次瀏覽、21 位不重複訪客;npm 上月 511 次下載,其中多數落在發版日。

---

## C. 推廣(Kai 本人)

放在最後。實作者在這一段只準備素材,不代寫對外貼文:Hacker News 明文禁止生成或 AI 編修過的文字,其他社群對 AI 寫的宣傳文也最反感。

| 順序 | 做什麼 | 實作者可以準備的 |
|---|---|---|
| C1 | 請接手過 Kai 專案的人寫兩三句話,講他們從 `.flightwake/` 看懂了什麼 | 無 |
| C2 | 到 claude.tw 的聚會分享(台北、台中、高雄有分享時段;另有約 5,000 人的 LINE 群) | 事實清單:數字、檔案連結、示範腳本 |
| C3 | 寫一篇經驗文:106 條坑裡 22% 是誤診,怎麼發現、怎麼改。先繁中,再自己寫英文版 | 把 `260803-trap-confidence.md` 的時間線與數字整理成大綱 |
| C4 | 有使用者之後投 awesome-claude-code(門檻是 14 天活躍開發或 100 星,要本人填表) | 核對當時的投稿規則 |
| C5 | Reddit 的 Claude Code、Codex 社群貼經驗文,不貼公告 | 發之前讀一次各版的自我宣傳規則(研究只拿到二手整理) |
| C6 | 最後才回 Hacker News:先寫信給 hn@ycombinator.com 處理帳號;內文與留言全部自己寫;內文不能空白 | 無 |

- **成功的定義**:5 到 10 個不是 Kai 本人的使用者,或第一個外部 issue。不追星數。
- **不要做**:代幣、付費星數、互相拉票、為了宣傳再加新功能面。
- **沒有資料的管道**:X、YouTube、電子報、Product Hunt、Threads、PTT、iThome、簡中與日文社群。研究沒查到東西,所以沒有排進順序,不代表沒用。

---

## 會改變這份計畫的事

- A1 發現真引擎的 F7 已經退化且修不動:fleet 直接從凍結改成標示停用。
- A2 的探針顯示 agy 讀不到 `AGENTS.md` 義務表或 hook 接不起來:走退路,A6 的優先度提高。
- A5 的探針顯示 Codex 的 `PreToolUse` 不能注入 context:A5 只做 Claude Code,Codex 改走 A6 式的規則檔,B1 的第二個主打要改寫。
- C 做了一輪仍沒有任何外部使用者:回到第一份報告的「進一步收縮」,只維護核心。

## 建議的執行順序

1. D1–D5 問完,寫進 DECISIONS。
2. A1 → A2 的探針檔(交給 Kai 跑,等待期間做 A3 的提案、A7、A8)。
3. A2 實作 → A3 套用 → A10 → A4 與 `/fw-record` → A12 發 0.18.0。
4. B1 → B3 → B2 → B4 → B5,再發一個修訂版讓 npm 頁面更新。
5. 第二批:A5 的設計與審查 → A5 實作 → A6 → A9;完成後回頭更新 B1 的第二個主打。
6. C 由 Kai 在步驟 4 完成後開始,不必等第二批。
