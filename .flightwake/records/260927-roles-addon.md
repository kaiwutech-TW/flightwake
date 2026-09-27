---
record_id: 260927-roles-addon
session: Claude(Opus 5.5)
date: 2026-09-27
repos: [flightwake, 兩個下游 repo(規劃 + 實作)]
tests: bash test/smoke.sh 全過(新增第 21 節 roles);兩個下游 repo 四角色誘導題實測 4/4
prod_changes: none(未發版;下游 repo 只本機 commit,未 push)
---

# roles 附加元件:團隊角色寫進指令檔,/clear 後不失憶(未發版,dogfood 中)

**TL;DR**:使用者用 Orca 跑四個 agent 的團隊:規劃 repo 有 Codex 專案經理與 Claude 技術總監,實作 repo 有
Claude 寫手與 Codex 審核。問題是專案經理 /clear 後忘記要派工,改成自己寫 code。根因是角色只存在對話裡。
解法是把角色寫進各 agent 每次開場都會讀的指令檔(Codex 讀 AGENTS.md、Claude 讀 CLAUDE.md),不需要 hook。
先手寫驗證有效,再做成選配的 `flightwake roles`:一份 `.flightwake/ROLES.md` 可以跨 repo,由 `fw-roles`
skill 負責推薦與客製,CLI 負責套用。已在兩個下游 repo dogfood,尚未發版。

## 關鍵發現(重要性排序)

1. **角色要放在「每次開場都會重讀」的地方,不能放在 STATE**。原本分工寫在下游 STATE 的常備事實裡,而且是第三人稱
   (「某 Codex 管理優先序」),冷啟動讀到的是現況,不是「我是誰、我不准做什麼」。實測寫進指令檔後,四個角色
   面對同一個誘導題(「按鈕打錯字,你是誰、下一步做什麼」)都改成轉派,沒有人自己動手。
2. **禁止清單才是關鍵,職責描述不是**。讓專案經理乖乖派工的是「一冒出『順手改一下』就停下來改派工」這種明文禁止。
   調研時 multi-agent-shogun 也採同一招。
3. **Claude Code 只讀 CLAUDE.md、Codex 只讀 AGENTS.md**(Claude Code 2.1.283、Codex 0.157.0 實測),所以每個資料夾
   各一個廠牌時,檔名本身就是身分,不需要 FW_ROLE 或 hook。這也是路由鍵定成 (資料夾, 廠牌) 的原因。
4. **Codex 專案 hook 在 `codex exec` 下不載入**,各種信任繞法都試過,仍然無效 → 已登 TRAPS
   `codex-exec-project-hooks-not-loaded`(suspected)。Claude 的 SessionStart 注入則實測可用。
5. 市場調研(2026-09-27):通用的 agent 編排器已是紅海,原廠也在收編這一層;但「依專案推薦一組角色 → 預覽客製
   → 跨廠牌安裝 → /clear 不失憶」這條完整流程沒人串起來。這個缺口門檻低、窗口短,差異化要靠跟 flightwake 記憶
   整合。定位與取捨見 DECISIONS 2026-09-27 兩條。
6. 順手發現:兩個下游 repo 的 flightwake 安裝層(skills、hooks、settings,其中一個還包括 DECISIONS.md)**從來沒有
   commit 過**。已補 commit。

## 交付 / Commits

- flightwake:3ac5a90..76739e1(roles 功能 + DECISIONS/TRAPS)
- 下游(本機 commit、未 push):規劃 repo e35f06c、06d8a31;實作 repo c1bb7af、b412a48(安裝層補 commit + 角色區塊;
  實作 repo 同時移除與現職責矛盾的舊「第一波」邊界)
- 本機環境(不在任何 repo):GSD 在 Codex 端的殘留(33 個 agent 設定、hook、85 個 skill、get-shit-done 目錄)與
  Claude 端 15 支孤兒 hook 腳本,全部搬到 `~/.gsd-removed-20260927/`(可還原);`~/.codex/config.toml` 另有
  `.bak-gsdhook-20260927` 備份。清完後 Codex 與 Claude 都能正常啟動

## 驗證證據

- `bash test/smoke.sh` 全過。第 21 節涵蓋:init 不裝 roles、dry-run 不寫檔、角色區塊置頂且不動使用者內容與義務表、
  跨 repo 寫入、marker 帶相對 src、重跑 byte 一致、成員 repo 由 src 回溯套用結果一致、撤角色會移除區塊、
  同資料夾同廠牌衝突與未知 agent 退出非零且不寫檔、update 只刷新已安裝的 skill、remove/uninstall 清除但 ROLES.md 保留
- `npm pack --dry-run` 含 `addons/`(14 檔)與 `bin/roles.mjs`
- 下游四角色誘導題:手寫版 4/4、改由 `roles apply` 產生後 4/4(專案經理派給寫手、技術總監轉交、審核者退回寫手、
  寫手修完交審且不自己 commit)。測法:各 repo 用 `codex exec -s read-only` / `claude -p --permission-mode plan`
  開新 session

## 未完 / 交接

- dogfood 觀察:使用者日常 /clear 後專案經理是否仍守角色;出現「同資料夾同廠牌兩角色」的真實需求才做 FW_ROLE+hook
  (Codex 端要先在 TUI 驗證 SessionStart)
- 發版前:README 四語加入口、zh-CN/ja 範本(等需求)、`fw-roles` skill 本身的推薦流程還沒讓 agent 從零實跑過一次
  (這次的 ROLES.md 是手寫再套用)
