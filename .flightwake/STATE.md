---
updated: 2026-10-11
updated_by: Codex
latest_record: records/261011-showcase-locale-and-case.md
health: yellow  # 展示網站新版已部署且四語/SEO 路由 HTTPS 200;F7 真機驗證未做,0.16.0 未發版
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

flightwake **v0.15.0 已發佈(2026-10-05,npm latest;PR #11 merge 4605ee0)**:引導式 `setup`、`doctor`、`--profile=notes`、Orca 協作、roles v2、Claude Code mod `flightwake-mod` 0.1.0。
歷史里程碑(開源 2026-07-18、i18n、tower/registry、Codex/Gemini 原生、OKF export、roles)各有 record,從 `records/` 依日期讀。

**main 上未發版的新工作(2026-10-09 → 10-11,commit 3048dc6 起四個,詳見 [[261011-fleet-and-setup-flow]])**:
- **mod 0.2.0(未發版)**:F6 `spend`(`/fw-cost`、band 與儀表費用欄)+ F7 `fleet`(每個互動 session 寫 repo 外 `<base>/sessions/<id>.json`:working/blocked/idle/ended;`/fw-fleet`、`npx flightwake fleet [--json|--prune]`、儀表 `⛔` 欄、意外中斷後一次性 `claude --resume` 提示)。
- **安裝流程升級**:setup 依終端機語系(LC_ALL > LC_MESSAGES > LANG)預選語言、附加元件一次多選(精確集合;儀表/mod 預勾有條件、roles 不勾、Orca 只認 `ORCA_*`)、已安裝 repo 三選一、`update` 結尾點名未裝的附加元件並要 agent 先問人、init 偵測到語系差異提示 `update --lang=X`;`registryPath` 改與 `fleetBase` 同規則;private 安裝的語言寫進排除標頭。
- 關卡(2026-10-11 主導者重跑):smoke 46 節全過、plugin test 465/465、validate 過、tsc clean、readonly 三項 ok、doctor 0/0;本 repo dogfood 副本已刷新。設計規格在 session scratchpad,不入版控。

**展示網站**:四語 Astro 網站已推 main 並部署 Cloudflare Pages Direct Upload;新增飛行記錄器 Logo、首頁依瀏覽器語言偏好轉址與手動覆寫、匿名的雙 repo 多 agent 現場案例。自訂網域四語/SEO 路由 HTTPS 200;本次證據見 [[261011-showcase-locale-and-case]]。後續網站更新須重建並手動部署(指令見 `website/README.md`)。

# 進行中(未完成勿刪)

- **F7 真機驗證(需一般權限、非 bypass 的 session)**:permission 對話框 → `blocked`/儀表 `⛔`;AskUserQuestion;`/clear`;`/exit` 與 `kill -9` 後的接回 toast;`/fw-fleet` 四語;真引擎 PermissionRequest 的 `tool_input` 是否等於 `tool.check` 的 input。已驗:本 session 熱重載後狀態檔、心跳、`host.orcaTerminal`、`npx flightwake fleet`、`/fw-mod` 七開關(見 record)。
- **spend 熱重載後「token 不明」但費用有值**:待查(record 未完節)。
- 慣例演進採讀取端容忍(DECISIONS 2026-07-18),容忍不了時再議遷移工具;zh-CN/ja 安裝內容待 issue 需求再擴。

# 下一步入口

0. **Kai 決定**:①main 已 push、CI 已通過;要不要以 0.16.0 發版(mod 0.2.0 隨版發;DECISIONS 2026-10-05 每版 bump 一次);②F7 真機驗證誰做、何時做(上面清單);③舊待決:roles 座位設計對只有 AGENTS.md 的 repo 的影響、TRAPS 兩條 python 3.11 重複條目壓實、`~/.claude/projects` 下五個 scratch session 資料夾是否刪除。
0a. 網站維護:未來改版依 `website/README.md` 執行 Direct Upload。
1. 發版後:常用 repo `npx flightwake update`(現在會看到附加元件提示;有 AGENTS.md 的 16 個機隊 repo 會長出 `.agents/skills` 與 `.codex/hooks.json`,每個 repo 首次開 Codex 會被問一次信任 hook);觀察下游 `/clear` 後角色派工。
2. Orca 側:讀 `<base>/sessions/*.json`(契約見 `docs/mod.md`「Fleet file contract」)做 blocked 通知與 `--until blocked` 等待——herdr 分析的最後一塊。
3. 未驗證平台:Windows(含 Intl 語系)、Linux Intl、Gemini CLI hook 真機(AfterAgent 是否觸發,見 [[260902-codex-gemini-native]])、真正的 resume/compact 體驗。
4. 宣傳:三稿最終版在使用者桌面 `~/Desktop/flightwake-launch-copy.md`,截圖三張在使用者手上;HN 作者留言仍 auto-flag 待 hn@ 回覆;之後盯 issues(含徵求日文/簡中母語校對)。
5. 低優先:SCOPE+ 格式向使用者確認(機隊零筆)、向使用者要「最近重複踩到的 trap」驗證 confidence 三型、GSD 側對照實測(benchmarks 公平性)、範例 repo。
