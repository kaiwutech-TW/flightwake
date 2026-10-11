---
record_id: 261011-showcase-site
session: Codex
date: 2026-10-11
repos: [flightwake]
tests: website Astro check 0 errors/0 warnings, build 4 locales; root smoke 46/46; GitHub website and ci workflows passed
prod_changes: Cloudflare Pages Direct Upload deploy, custom-domain CNAME, unintended Worker deploy during Wrangler project-create attempt and user-approved deletion
---

# 四語展示網站上線，公開說明 flightwake 與 Orca 協作實例

**TL;DR**:以 repo 的 0.16.0 未發版工作與最近一筆飛行紀錄為事實底座，新增四語 Astro 靜態展示網站，介紹理念、功能、安裝和 Orca 多 agent 實例。網站已部署到 Cloudflare Pages，四語與 SEO 資源在自訂網域均回傳 HTTPS 200；Pages 網域所有權與憑證驗證均已 active。

## 關鍵發現

1. `0.16.0` 尚未發版，npm `latest` 仍是 `0.15.0`。網站把新版安裝流程與 Fleet 標為 main 上未發版工作，並明示部分 Fleet 真機情境未驗證，避免安裝指示與網站故事超前事實。
2. Wrangler 4.149.0 在 Astro 目錄執行 `pages project create` 時，改走 Workers 設定與部署，沒有建立 Pages 專案，且改寫專案檔案。已還原改寫、用 Pages API 建立 Direct Upload 專案，從 Astro 目錄外部署純靜態產物；詳見 [[wrangler-pages-create-delegates-to-workers]]。誤建的 Worker 經 Kai 確認後刪除。
3. Direct Upload 專案不能改成 Git integration。原始碼已推到 GitHub，站內 README 明列手動部署方式；若將來要自動上線，需另建 Git-integrated 專案或新增具有受限憑證的 GitHub Actions 部署工作。

## 交付 / Commits

`095b700..5ce8dc8`（網站、部署文件、Cloudflare CLI 坑與快取排除）。

## 驗證證據

- 網站 `npm ci` 成功、`astro check` 為 0 errors / 0 warnings / 0 hints、`astro build` 產出四個語言路由；GitHub `website` workflow run `38127535380` 通過。
- 本機 Playwright 檢查四語的 320/390/768/1440px 畫面均無水平溢出，FAQ 可展開，日文複製按鈕可用；繁中 axe 掃描零違規。
- 根目錄 smoke 46 節全過；推送後 GitHub `ci` workflow run `38127535368` 通過。
- Pages 預設網域及自訂網域的 `/`、`/zh-CN/`、`/en/`、`/ja/`、`/robots.txt`、`/llms.txt`、`/sitemap-index.xml`、`/og.png` 均回傳 HTTP 200。自訂網域 DNS 為指向 Pages 的 proxied CNAME；Pages API 網域所有權與 HTTP 憑證驗證均 active（2026-10-11 17:17 台北時間）。Googlebot、GPTBot、OAI-SearchBot、ClaudeBot user agent 請求英文頁也均回傳 200。
- 額外 Worker 在刪除前只有本次的一筆部署、無自訂網域 reference；Kai 授權刪除後 `cf workers get` 回 404，Pages 網域仍 active、首頁 HTTPS 200。

## 未完 / 交接

- 網站後續更新要重新 Direct Upload。
- 既有 Fleet 真機驗證與 0.16.0 發版決策仍依 [[261011-fleet-and-setup-flow]] 與 STATE。
