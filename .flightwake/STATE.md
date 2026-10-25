---
updated: 2026-10-26
updated_by: Claude Code (Opus 5.5)
latest_record: records/261026-traps-similar-and-trips.md
health: yellow  # traps similar/stats 與 mod 觸發計數已完成(smoke 47 節全過);仍黃:mod 測試在 Claude Code 2.1.310 有 25 個 fleet 失敗(clean HEAD 同樣失敗,測試環境改變)、觸發計數未真機驗、修正未發版、TRAPS active 31 條超過紅線
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

flightwake **v0.17.0 已發佈(2026-10-11,npm latest,provenance;release run 38139683264;證據見 [[261011-fleet-console]] 發佈補記)**:mod 0.3.0 側邊面板與機隊中控台。前版 v0.16.0(同日,[[261011-fleet-and-setup-flow]]):mod 0.2.0(spend + fleet)、語系預選與附加元件多選的 setup、update 的附加元件提示。前版 v0.15.0(2026-10-05):引導式 `setup`、`doctor`、`--profile=notes`、Orca 協作、roles v2、mod 0.1.0。
歷史里程碑(開源 2026-07-18、i18n、tower/registry、Codex/Gemini 原生、OKF export、roles)各有 record,從 `records/` 依日期讀。

**0.16.0 的內容(2026-10-09 → 10-11,commit 3048dc6 起四個 + c6c486b,詳見 [[261011-fleet-and-setup-flow]])**:
- **mod 0.2.0**:F6 `spend`(`/fw-cost`、band 與儀表費用欄)+ F7 `fleet`(每個互動 session 寫 repo 外 `<base>/sessions/<id>.json`:working/blocked/idle/ended;`/fw-fleet`、`npx flightwake fleet [--json|--prune]`、儀表 `⛔` 欄、意外中斷後一次性 `claude --resume` 提示)。
- **安裝流程升級**:setup 依終端機語系(LC_ALL > LC_MESSAGES > LANG)預選語言、附加元件一次多選(精確集合;儀表/mod 預勾有條件、roles 不勾、Orca 只認 `ORCA_*`)、已安裝 repo 三選一、`update` 結尾點名未裝的附加元件並要 agent 先問人、init 偵測到語系差異提示 `update --lang=X`;`registryPath` 改與 `fleetBase` 同規則;private 安裝的語言寫進排除標頭。
- 關卡(2026-10-11 主導者重跑):smoke 46 節全過、plugin test 465/465、validate 過、tsc clean、readonly 三項 ok、doctor 0/0;本 repo dogfood 副本已刷新。設計規格在 session scratchpad,不入版控。

**0.17.0 的內容:mod 0.3.0(2026-10-11,b4376a8..9777586,詳見 [[261011-mod-side-panel]]、[[261011-fleet-console]])**:F8 側邊面板 `/fw-panel`(開過就記住、手動關即撤銷),卡片式:本 repo(health、context 長條、費用、`!` 注意事項)、**機隊中控台**(Orca 裡讀 `orca terminal list` 列所有 Claude/Codex 分頁,依 repo 分卡,跨 repo 唯讀讀 health/版本;按鈕「跳過去」與兩段確認的「收尾」)、STATE 進行中/下一步、本 session;fleet 狀態檔多 `context` / `role` / `fwVersion`。CHANGELOG 已分出 `[0.17.0]`。

**2026-10-19 真機驗證(詳見 [[261019-console-realmachine]])**:中控台的跳過去、兩段確認收尾、Codex 狀態、手動關閉,以及 F7 的 blocked、`/clear`、`/exit`、`kill -9` 接回,都在 Orca 實測通過。修了兩個 bug:Codex 收尾不送出、接回 toast 被截斷(ac9031e,在 `[Unreleased]`,尚未發版)。TRAPS 依實測壓實。

**2026-10-26 TRAPS 寫前查重與觸發次數(詳見 [[261026-traps-similar-and-trips]])**:參考 dsh-plugin.org 的記憶插件,新增 `npx flightwake traps similar`(`/fw-trap` 寫入前查重、三選一)與 `npx flightwake traps stats`(各條有無錨點、被絆線比對幾次;`/fw-coldstart` 壓實提案從它出發);mod 絆線把次數寫到 repo 外 `<base>/trips/<id>.json`(DECISIONS 2026-10-26)。都在 `[Unreleased]`。

**展示網站**:四語 Astro 網站已推 main 並部署 Cloudflare Pages Direct Upload;目前包含飛行記錄器 Logo、語言偏好、匿名多 agent 案例、0.17.0 側邊面板匿名示意與 `/fw-mod` 0.3.0 實測輸出。自訂網域四語/SEO 路由 HTTPS 200;網站已標示 npm 0.17.0,最新部署證據見 [[261011-mod-017-site]]。後續更新須重建並手動部署(指令見 `website/README.md`)。

# 進行中(未完成勿刪)

- **mod 測試在 Claude Code 2.1.310 有 25 個 fleet 失敗**:clean HEAD 同一組,是測試環境對沒人回答的權限請求改判拒絕(TRAPS `plugin-test-kit-denies-unanswered-permission-request`,probable)。要修得找 2.1.310 的 testing 文件;另需真機確認互動 session 的 F7 blocked 仍正常。
- **觸發計數未真機驗**:dogfood 副本已刷新,mod 在刷新那一輪結束後才重載;下一輪碰到有錨點的 trap 後看 `~/.flightwake/trips/` 與 `node bin/cli.mjs traps stats`。子代理的兩個選擇待確認:只記互動 session、一檔一個 repo 欄位。
- **待發版**:ac9031e 的兩個修正與 10-26 的 traps 功能都在 CHANGELOG `[Unreleased]`,下次 release 時 mod 版號從 0.3.0 往上推。
- **兩處小 bug 待決定修不修**:面板「本 session」列寫死工作中(`features/panel.ts` 的 `isSelf ? 'working'`);`/fw-fleet` 表格把 code span 裡的反斜線加倍,路徑含單引號時指令抄出來是錯的。
- **仍未驗**:`/fw-fleet` 四語輸出;真引擎 PermissionRequest 的 `tool_input` 是否等於 `tool.check` 的 input;Codex hook trust 的 bypass 對照重跑。
- **spend 熱重載後「token 不明」但費用有值**:待查(record 未完節)。
- 慣例演進採讀取端容忍(DECISIONS 2026-07-18),容忍不了時再議遷移工具;zh-CN/ja 安裝內容待 issue 需求再擴。

# 下一步入口

0. **Kai 決定**:①TRAPS active 31 條超過 20:現在可先跑 `traps stats` 看錨點分布(13 條沒錨點)再決定壓實或調門檻;②上面兩處小 bug 修不修、何時發版;③舊待決:roles 座位設計對只有 AGENTS.md 的 repo 的影響、`~/.claude/projects` 下的 scratch session 資料夾是否刪除。
0a. 網站維護:未來改版依 `website/README.md` 執行 Direct Upload。
1. 常用 repo `npx flightwake update`(npm latest 0.17.0;有 AGENTS.md 的 16 個機隊 repo 會長出 `.agents/skills` 與 `.codex/hooks.json`,每個 repo 首次開 Codex 會被問一次信任 hook);觀察下游 `/clear` 後角色派工。
2. Orca 側:讀 `<base>/sessions/*.json`(契約見 `docs/mod.md`「Fleet file contract」)做 blocked 通知與 `--until blocked` 等待——herdr 分析的最後一塊。
3. 未驗證平台:Windows(含 Intl 語系)、Linux Intl、Gemini CLI hook 真機(AfterAgent 是否觸發,見 [[260902-codex-gemini-native]])、真正的 resume/compact 體驗。
4. 宣傳:三稿最終版在使用者桌面 `~/Desktop/flightwake-launch-copy.md`,截圖三張在使用者手上;HN 作者留言仍 auto-flag 待 hn@ 回覆;之後盯 issues(含徵求日文/簡中母語校對)。
5. 低優先:SCOPE+ 格式向使用者確認(機隊零筆)、向使用者要「最近重複踩到的 trap」驗證 confidence 三型、GSD 側對照實測(benchmarks 公平性)、範例 repo。
