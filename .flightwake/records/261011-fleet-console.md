---
record_id: 261011-fleet-console
session: Claude Code (Opus 5.5)
date: 2026-10-11
repos: [flightwake]
tests: claude plugin test mods/flightwake 500 pass / 0 fail(單獨執行);claude plugin validate --strict 通過;tsc 5.9.3 對 2.1.296 型別 clean;bash test/smoke.sh 全過(Python 3.12 在 PATH 前)
prod_changes: npm publish flightwake@0.17.0(2026-10-11,release run 38139683264,provenance;見末節「發佈補記」)
---

# 側邊面板改成機隊中控台:Orca 裡所有 agent(含 Codex)按 repo 分卡,可跳過去、可請閒置者收尾

**TL;DR**:使用者真機看了 [[261011-mod-side-panel]] 的面板後,回饋三點:文字被截斷、不像 GUI、不能操作、重點應是整個機隊(含 Codex)。這輪先改成自動換行,再把面板重做成卡片式中控台:在 Orca 裡讀 `orca terminal list` 列出所有 agent 分頁並依 repo 分組,跨 repo 唯讀讀 health 與版本,每列有「跳過去」與兩段確認的「收尾」。測試全綠;中控台本身尚未真機看過。

## 關鍵發現

1. **Orca 已握有整個機隊**:`orca terminal list --json` 列出每個分頁的 `agentIdentity`(claude / codex)、`worktreePath`、`title`、`lastOutputAt`;Claude Code 的標題 `✳` 為閒置、`◐` 為工作中,Codex 標題 `[ . ] Action Required | …` 為等你回覆。`orca terminal switch` / `send` 可切分頁與打字。因此不必替 Codex 另造回報管道(決策見 DECISIONS 2026-10-11 第三條)。
2. 載入器規則:`$.env.get` 只收字面值名稱(與既有的 `$.state` 字面值規則同類),寫成共用 `envOf(name)` 會讓整個 mod 驗證失敗;改為每個變數一個函式。
3. 時序:`/fw-panel` 回應前要等第一次 poll,否則畫面先顯示「正在問 Orca…」;session 開始時的自動開啟要先 `await $.ui.open` 再開 poll,否則 poll 看不到 pane 會自行停止。後者的測試只驗得到行為、驗不到競態本身(測試替身的 `ui.open` 是同步的;做過突變檢查,拿掉修正測試仍過)。
4. 漏洞:前兩輪只改英文 `docs/mod.md`,三份翻譯落後;本輪補上(057d371),中控台的翻譯交 Sonnet subagent 進行中。

## 交付 / Commits

744b2d7..11bc112(ab34239 換行;057d371 翻譯補上前兩輪;11bc112 中控台)。

## 驗證證據

- `claude plugin test mods/flightwake`:500 pass / 0 fail;新 `tests/console.test.ts` 以模擬的 `orca` 回應涵蓋:只列 agent 分頁、標題狀態判讀與清理、依 repo 分組排序、跨 repo health/版本與 `≠`、本 session 無按鈕、blocked 無收尾鈕、「跳過去」呼叫 switch、「收尾」兩段確認與 `/fw-record` / `$fw-record`、確認時已開始工作就不送、Orca 失敗改用 fleet 回報、每 10 秒 poll 且關閉即停、Orca 外零 orca 呼叫。
- validate --strict 通過、tsc clean、smoke 全過;dogfood 副本已刷新。
- 真機:換行(ab34239)使用者確認「有看到完整訊息了」;`/fw-panel` 開關兩次正常。

## 未完 / 交接

- **中控台真機驗證**:卡片與按鈕在實際寬度的版面、跳過去、對一個不重要的閒置分頁試「收尾」、Codex 狀態判讀準不準、session 重開後自動開與 poll。
- 中控台段落的三語翻譯(subagent 進行中,完成後檢查再 commit)。
- 面板手動關閉(ctrl+x x)後下次不自動開——仍只能真機驗。

## 發佈補記(2026-10-11,同 session)

使用者決定 GitHub 與 npm 都推。步驟與證據:
- 切版:`package.json` 0.17.0、CHANGELOG `[Unreleased]` → `[0.17.0] — 2026-10-11`;`node bin/cli.mjs update` 刷新本 repo dogfood 安裝(同時把先前 update 裝上、未 commit 的 Orca 協作區塊與 `fw-roles` 一起 commit),doctor 失敗 0 提醒 0;smoke 全過、plugin test 500/500、validate(原始碼與 dogfood 副本)通過、tsc clean、兩份 mod 內容一致。commit 9777586,`git push` 直接進 main(GitHub 提示以管理員略過 4 個必要狀態檢查);ci / codeql / scorecard 對 9777586 皆 success。
- 期間另一個 session(Codex,網站)推了 c373453(四語 README、網站 0.17 面板示意)與 b596ea5(其 record);c373453 的 ci / codeql 通過後,`gh release create v0.17.0 --target b596ea5…`(說明在 Release 頁)。
- release run **38139683264** success:`bash test/smoke.sh` 全過 → `npm publish --provenance --access public`,日誌 `+ flightwake@0.17.0`,provenance 進 sigstore(logIndex 3207298900)。
- npm:`dist-tags.latest = 0.17.0`、`dist.attestations` 存在。暫存 repo `npx -y flightwake@0.17.0 init --agents=claude --lang=zh-TW --mod` 成功,裝出的 mod 為 0.3.0 且含 `panel.ts`。
- 未隨版驗證:中控台「跳過去 / 收尾」與 Codex 狀態判讀、手動關閉後不自動開(Release 說明已明講)。
