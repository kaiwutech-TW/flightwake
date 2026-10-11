---
record_id: 261011-showcase-locale-and-case
session: Codex
date: 2026-10-11
repos: [flightwake]
tests: website Astro check 0 errors/warnings/hints; build 5 pages; live browser 5 locale preferences, 4 mobile pages with axe 0 violations; 9 production routes HTTP 200
prod_changes: Cloudflare Pages Direct Upload deployed; custom domain checked
---

# 展示站加入飛行記錄器 Logo、語言偏好與匿名多 agent 實例

**TL;DR**: 展示站原本有四語靜態路由，但首頁不會依訪客偏好選語言，也缺少能代表「工作留痕」的識別圖形。這次加入飛行記錄器 Logo、首次進入首頁的瀏覽器語言選擇與手動覆寫，並將一個真實進行中的雙 repo 多 agent 流程匿名寫入四語網站；網站已部署並在正式路由驗證。

## 關鍵發現

1. 語言偏好由瀏覽器提供，可能與作業系統設定不同；只在 `/` 首訪選擇、保留明確語系網址，仍讓靜態四語頁面可直接索引。取捨見 DECISIONS 2026-10-11。
2. 實際多 agent 工作把產品決策、技術檢視、工程實作與獨立審查分開；截至本次查閱，實作尚未完成獨立驗收。網站依使用者選擇匿名，且標示進行中；公開範圍見 DECISIONS 2026-10-11。

## 交付 / Commits

e2c9f5a..a45cd37（展示站內容、視覺、語言行為與來源文件）

## 驗證證據

- `npm run check`：12 個 Astro 檔案，0 errors、0 warnings、0 hints；`npm run build`：5 個頁面建置完成。
- 本機與正式站 Playwright：en-US、zh-CN、zh-TW、ja-JP、fr-FR 的首頁選擇皆符合預期；手動切換優先、明確語系路徑不轉址、query/hash 保留、無 JavaScript 時繁中首頁保留。
- 正式站四語頁面在 320px 寬度無橫向溢出，Logo 與案例可見；axe 四語頁面皆 0 violations。
- 正式站四語 HTML、Logo、OG 圖、robots、llms、sitemap 共 9 條路由回應 HTTP 200；英語頁面包含新版案例文字。
- GitHub `website` 與 `scorecard` 工作流在網站 commit 上通過；其餘工作流收尾時仍在執行。

## 未完 / 交接

- 0.16.0 發版與 F7 真機驗證仍照 STATE 的入口處理；本次網站只如實標示未發版。
- `ci` 與 `codeql` 工作流待完成後再看結果；如失敗，從該次網站 commit 的 Actions 紀錄接手。
