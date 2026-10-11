---
record_id: 261011-mod-showcase
session: Codex
date: 2026-10-11
repos: [flightwake]
tests: mod 465/465; smoke 46 sections; strict plugin validate pass; Astro check 13 files 0 diagnostics; build 5 pages; four live locales browser and accessibility pass
prod_changes: Cloudflare Pages Direct Upload deployed; custom domain checked
---

# 0.16.0 展示站加入 Claude Code mod 實測畫面

**TL;DR**: 0.16.0 發佈後，展示站仍稱 0.15.0 為最新版，也只講 flightwake 的整體觀念。現在四語網站已更新版本資訊，並以可切換的終端機畫面節錄展示引導式安裝、Claude Code 裡的 `/fw-mod`，以及 Fleet 清單；部署後已在正式站驗證。

## 關鍵發現

1. Claude Code 2.1.296 在隔離 repo 的互動 session 執行 `/fw-mod`，實際回報 mod v0.2.0 的七項狀態，包含 Fleet 在互動 session 回報為 on；非互動 `-p` 執行時 Fleet 會顯示 idle。網站使用前者的節錄，沒有把模擬結果冒充互動畫面。
2. `test/setup-drive.mjs` 能餵入答案並執行真實 setup 流程；Fleet 終端機畫面則由正式 CLI 讀取依 `test/smoke.sh` 建立的受控 session 資料。公開畫面省略暫存路徑、標明測試資料與仍待真機驗證的邊界。呈現方式與公開範圍見 DECISIONS 2026-10-11。
3. 本機第一次跑 smoke 因系統 Python 3.9 缺 `tomllib` 停住；依既有 TRAPS `smoke-needs-python311-tomllib`，將 Python 3.13 放在 PATH 前重跑後全過。這不是產品回歸。

## 交付 / Commits

c08a288..ace3ffc

## 驗證證據

- `npm view flightwake version` 回報 `0.16.0`；正式站四語 HTML、`llms.txt` 與 sitemap 六條路由均 HTTP 200。
- `claude plugin test mods/flightwake`：465 pass、0 fail；`claude plugin validate mods/flightwake --strict`：Validation passed；`bash test/smoke.sh`：46 節全過（Python 3.13）。
- `npm run check`：13 個 Astro 檔案，0 errors、0 warnings、0 hints；`npm run build`：5 個頁面完成。
- 本機及正式站 Playwright：四語在 320px 的三段切換、方向鍵、版號和 axe 掃描均通過；無 JavaScript 時三段內容仍可讀。本機四語在 360–1440px 七種寬度無橫向溢出。
- GitHub `website` 與 `scorecard` 在最後一筆四語文案 commit 上通過；前一筆網站 commit 的 `ci`、`codeql` 也通過。最後一筆的 `ci`、`codeql` 於寫 record 時仍在執行。

## 未完 / 交接

- Fleet 權限對話框、`/clear`、異常中斷後接回等真機情境仍照 STATE 的入口驗證；網站對這些功能不宣稱已完成真機覆蓋。
- `ci` 與 `codeql` 工作流完成後可從網站 commit 的 Actions 紀錄核對；若失敗，先查是否與此網站變更有關。
