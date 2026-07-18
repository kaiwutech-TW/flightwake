---
record_id: 260718-v080-statusline
session: Claude(Fable 5)
date: 2026-07-18
repos: [flightwake, marketing_dashboard]
tests: smoke 全過(17 項,含 --statusline case);v0.7.2 與 v0.8.0 兩次 Release 全綠
prod_changes: "npm 發布 v0.7.2(刷新 README)與 v0.8.0(statusline);均經 trusted publishing,證據見下"
---

# gate 2 收官 + v0.7.2/v0.8.0 連發:trusted publishing 實證、GSD 遷移指南、statusline 儀表

**TL;DR**:gate 2 第二 repo 冷啟動實測完成(非自我參照,邊際 3.6K 讀 + 0.9K 出、API 19s、回報零糾正)→ 兩 gate 全關。v0.7.2 首個 Release 實證 trusted publishing 全鏈路(18s,SLSA provenance,`npm audit signatures` 過)並刷新 npm README 為英文主版。GSD 遷移三步入四語 README。v0.8.0 新增 `--statusline` 底部儀表(health/STATE 落後/context 用量),本 repo 與 marketing_dashboard 均已裝上實跑。宣傳文三稿已擬(HN/X 中文串/X 英文短版),隨時可發。

## 關鍵發現(重要性排序)

1. **npm 頁的 README 是發布當下快照**,不隨 GitHub 更新——文件大改後要發新版本才會刷新。順勢把「首個 Release 驗證鏈路」與「刷新 README」併成一件事。
2. **statusLine 是單值設定且 repo 層優先於使用者層**——flightwake 裝 repo 層即自動蓋過 GSD 的全域儀表,無需先拆 GSD;也因此絕不覆蓋他家設定是硬規則(見 DECISIONS)。
3. **context bar 以 200k 視窗硬編碼計算**——若模型視窗更大會高估百分比;v0.9 可從 statusline stdin JSON 或 model id 推斷視窗大小(已知限制,先記著)。
4. GSD 全域足跡實測:user 層 statusLine + 7 類 hooks + 71 個 skill;移除採兩階段(逐 repo 遷移 → 全部轉完才拆全域,拆前備份 settings)。

## 交付 / Commits

flightwake `c091c0c..e1269cd`(5 commits):v0.7.2、gate 2 數據、GSD 遷移指南、v0.8.0 statusline。marketing_dashboard:v0.8.0 升級 + 儀表(7366e43)。

## 驗證證據(prod 級變更)

- v0.7.2/v0.8.0 release workflow 均 success(29645694623 / 29646454169);`npm view flightwake version` → 0.8.0;0.7.2 時 `npm audit signatures` → verified attestation;tarball README 確認英文主版
- statusline 實跑:本 repo 輸出 `✈️ flightwake │ ●green · STATE 落後 1c`;使用者實截 context 99% 紅色警示(「該收尾/交接」文案正確觸發)
- benchmarks 第二筆:非自我參照樣本,主觀正確性=零糾正(使用者確認)

## 未完 / 交接

- 宣傳待發(素材:三稿 + statusline 紅/綠對比截圖;入口見 STATE)
- GSD 全域拆除(階段二)待使用者所有 repo 轉完後執行,拆前備份 ~/.claude/settings.json
- context 視窗硬編碼 200k 的高估風險(見關鍵發現 3)
