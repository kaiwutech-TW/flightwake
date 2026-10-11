---
updated: 2026-10-11
updated_by: Codex
latest_record: records/261011-mod-017-site.md
health: yellow  # mod 0.3.0 面板版面已有使用者真機截圖,按鈕/跨 session 行為仍待真機驗證;0.17.0 npm 發佈仍待完成
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

flightwake **v0.16.0 已發佈(2026-10-11,npm latest;直接 push main,release commit c6c486b;證據見 [[261011-fleet-and-setup-flow]] 發佈補記)**:mod 0.2.0(spend + fleet)、語系預選與附加元件多選的 setup、update 的附加元件提示。**0.17.0 發版 commit 9777586 已在 main,CI 綠;本輪核對時 npm latest 仍是 0.16.0、GitHub Release 尚無 v0.17.0**。前版 v0.15.0(2026-10-05):引導式 `setup`、`doctor`、`--profile=notes`、Orca 協作、roles v2、mod 0.1.0。
歷史里程碑(開源 2026-07-18、i18n、tower/registry、Codex/Gemini 原生、OKF export、roles)各有 record,從 `records/` 依日期讀。

**0.16.0 的內容(2026-10-09 → 10-11,commit 3048dc6 起四個 + c6c486b,詳見 [[261011-fleet-and-setup-flow]])**:
- **mod 0.2.0**:F6 `spend`(`/fw-cost`、band 與儀表費用欄)+ F7 `fleet`(每個互動 session 寫 repo 外 `<base>/sessions/<id>.json`:working/blocked/idle/ended;`/fw-fleet`、`npx flightwake fleet [--json|--prune]`、儀表 `⛔` 欄、意外中斷後一次性 `claude --resume` 提示)。
- **安裝流程升級**:setup 依終端機語系(LC_ALL > LC_MESSAGES > LANG)預選語言、附加元件一次多選(精確集合;儀表/mod 預勾有條件、roles 不勾、Orca 只認 `ORCA_*`)、已安裝 repo 三選一、`update` 結尾點名未裝的附加元件並要 agent 先問人、init 偵測到語系差異提示 `update --lang=X`;`registryPath` 改與 `fleetBase` 同規則;private 安裝的語言寫進排除標頭。
- 關卡(2026-10-11 主導者重跑):smoke 46 節全過、plugin test 465/465、validate 過、tsc clean、readonly 三項 ok、doctor 0/0;本 repo dogfood 副本已刷新。設計規格在 session scratchpad,不入版控。

**main 上待 npm 發佈:mod 0.3.0(2026-10-11,b4376a8..9777586,詳見 [[261011-mod-side-panel]]、[[261011-fleet-console]])**:F8 側邊面板 `/fw-panel`(開過就記住、手動關即撤銷),卡片式:本 repo(health、context 長條、費用、`!` 注意事項)、**機隊中控台**(Orca 裡讀 `orca terminal list` 列所有 Claude/Codex 分頁,依 repo 分卡,跨 repo 唯讀讀 health/版本;按鈕「跳過去」與兩段確認的「收尾」)、STATE 進行中/下一步、本 session;fleet 狀態檔多 `context` / `role` / `fwVersion`。CHANGELOG 已分出 `[0.17.0]`。

**展示網站**:四語 Astro 網站已推 main 並部署 Cloudflare Pages Direct Upload;目前包含飛行記錄器 Logo、語言偏好、匿名多 agent 案例、0.17.0 側邊面板匿名示意與 `/fw-mod` 0.3.0 實測輸出。自訂網域四語/SEO 路由 HTTPS 200;最新證據見 [[261011-mod-017-site]]。網站明示 npm 仍為 0.16.0;後續更新須重建並手動部署(指令見 `website/README.md`)。

# 進行中(未完成勿刪)

- **mod 0.3.0 中控台真機驗證**(dogfood 副本已是最新):版面已有使用者截圖;仍需驗跳過去、對不重要的閒置分頁試收尾、Codex 狀態判讀、手動關閉後下次不自動開。清單見 [[261011-fleet-console]] 未完節;驗完 health 回 green。(三語文件已同步,0621cd6)
- **0.17.0 發佈後更新展示站版本狀態**:核對 npm 與 GitHub Release,將四語「原始碼預覽」、FAQ、安裝提示、schema/llms 與 CHANGELOG 連結切到正式版,重建部署;入口 `website/README.md`、[[261011-mod-017-site]]。
- **F7 真機驗證(需一般權限、非 bypass 的 session)**:permission 對話框 → `blocked`/儀表 `⛔`;AskUserQuestion;`/clear`;`/exit` 與 `kill -9` 後的接回 toast;`/fw-fleet` 四語;真引擎 PermissionRequest 的 `tool_input` 是否等於 `tool.check` 的 input。已驗:本 session 熱重載後狀態檔、心跳、`host.orcaTerminal`、`npx flightwake fleet`、`/fw-mod` 七開關(見 record)。
- **spend 熱重載後「token 不明」但費用有值**:待查(record 未完節)。
- 慣例演進採讀取端容忍(DECISIONS 2026-07-18),容忍不了時再議遷移工具;zh-CN/ja 安裝內容待 issue 需求再擴。

# 下一步入口

0. **Kai 決定**:①F7 真機驗證誰做、何時做(上面清單);②舊待決:roles 座位設計對只有 AGENTS.md 的 repo 的影響、TRAPS 兩條 python 3.11 重複條目壓實、`~/.claude/projects` 下五個 scratch session 資料夾是否刪除。
0a. 網站維護:0.17.0 npm/Release 公開後先切換網站版本說明,再依 `website/README.md` 執行 Direct Upload。
1. 常用 repo `npx flightwake update`(npm latest 仍為 0.16.0;待 0.17.0 正式發佈後才升級)(現在會看到附加元件提示;有 AGENTS.md 的 16 個機隊 repo 會長出 `.agents/skills` 與 `.codex/hooks.json`,每個 repo 首次開 Codex 會被問一次信任 hook);觀察下游 `/clear` 後角色派工。
2. Orca 側:讀 `<base>/sessions/*.json`(契約見 `docs/mod.md`「Fleet file contract」)做 blocked 通知與 `--until blocked` 等待——herdr 分析的最後一塊。
3. 未驗證平台:Windows(含 Intl 語系)、Linux Intl、Gemini CLI hook 真機(AfterAgent 是否觸發,見 [[260902-codex-gemini-native]])、真正的 resume/compact 體驗。
4. 宣傳:三稿最終版在使用者桌面 `~/Desktop/flightwake-launch-copy.md`,截圖三張在使用者手上;HN 作者留言仍 auto-flag 待 hn@ 回覆;之後盯 issues(含徵求日文/簡中母語校對)。
5. 低優先:SCOPE+ 格式向使用者確認(機隊零筆)、向使用者要「最近重複踩到的 trap」驗證 confidence 三型、GSD 側對照實測(benchmarks 公平性)、範例 repo。
