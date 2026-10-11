---
record_id: 261011-mod-side-panel
session: Claude Code (Opus 5.5)
date: 2026-10-11
repos: [flightwake]
tests: claude plugin test mods/flightwake 488 pass / 0 fail(單獨執行);claude plugin validate --strict 通過;tsc 5.9.3 對 Claude Code 2.1.296 型別 clean;bash test/smoke.sh 全過(Python 3.12 在 PATH 前)
prod_changes: none(未發佈;mod 0.3.0 只在 main 與本 repo dogfood 副本)
---

# mod 0.3.0:側邊面板 `/fw-panel` 與「注意」區塊,fleet 狀態檔多三欄

**TL;DR**:使用者裝了 mod 卻在畫面上看不到它——底部儀表在時 band 會整條隱藏。新增 F8 側邊面板(`/fw-panel` 開關,開過就記住),集中顯示 STATE、本 session 行車記錄與費用、其他 session;第二輪加「注意」區塊(context ≥80% 該收尾、health 非綠原因、未 commit 檔、最新 record 的未完事項、TRAPS 過多),並讓 fleet 狀態檔多寫 context / 角色 / 安裝版本,面板據此標出其他 session 該收尾或版本不一致。程式與測試全綠,**尚未在真的 session 裡看過面板**。

## 關鍵發現

1. **面板位置由 Claude Code 決定,不是 mod**:只有全螢幕版面(非 tmux、非 `CLAUDE_CODE_NO_FLICKER=0`)且終端機 ≥110 欄才會停靠在對話旁,否則出現在輸入框上方;mod 自行(unasked)開啟時門檻是 144 欄,使用者開過且沒手動關的 id 降為 110,不夠寬就「開著但不畫」。所以「開過就記住」靠 `$.store` 的一個布林 + session.start 時 unasked 開(決策見 DECISIONS 2026-10-11 兩條)。
2. 既有 bug:`/fw-fleet` 空清單訊息拿「目前 mod 版本」當最低需求,版本一升就說錯(測試因 0.3.0 升版而抓到);改為固定常數 `FLEET_SINCE = '0.2.0'`。
3. 測試 kit 無法觸發「使用者手動關 pane」,也沒有 `$.state` 名詞 → 登 TRAPS `mod-test-kit-no-ui-close-no-state-noun`。
4. 範圍刻意不做:從 STATE 自由文字猜「待人決定」條目、列出 Codex/Gemini session(見 DECISIONS)。

## 交付 / Commits

28be332..ac600a5(b4376a8 面板;ac600a5 注意區塊 + fleet 三欄;另含本 record commit)。工作區另有使用者 `update` 產生、未 commit 的 Orca 協作段落(AGENTS.md / CLAUDE.md)與 `fw-roles` skill 資料夾,刻意未混入。

## 驗證證據

- `claude plugin test mods/flightwake`:488 pass / 0 fail(新 panel.test.ts:純函式、開/關/記住、非互動不自動開、開關關閉、未安裝不動作、繪製四區兩介面、band 關時自量落後、未初始化 STATE、zh-TW 標題、注意區塊各訊號、latest_record 不可跳出 `.flightwake/records`、其他 session 列的角色/context/版本)。
- `claude plugin validate mods/flightwake --strict`:Validation passed;tsc 5.9.3 clean;`bash test/smoke.sh`:全過(含 DEFAULTS 對 plugin.json、MOD_VERSION 對 manifest)。
- 本 repo dogfood 副本 `.claude/skills/flightwake-mod/` 已刷新到 0.3.0。

## 未完 / 交接

- **真機驗證面板**(本 session 的 mod 已熱重載,可直接試):`/fw-panel` 開啟位置(停靠 vs 輸入框上方)、四區與注意區塊實際版面、`/fw-mod` 第八個開關、手動關閉(ctrl+x x)後下個 session 不再自動開、開著時下個 session 自動開;另一個 session 的列是否出現 context/角色/版本(需兩個 0.3.0 session)。
- `npx flightwake fleet` CLI 與底部儀表尚未顯示新三欄(讀者可忽略未知欄位,不影響);要不要加另議。
- 發佈:CHANGELOG `[Unreleased]` 已寫,待下次切版。
