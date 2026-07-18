---
record_id: 260718-v081-actionable-statusline
session: Claude(Fable 5)
date: 2026-07-18
repos: [flightwake, marketing_dashboard]
tests: smoke 全過(18 項,含開場提示斷言);v0.8.1 Release 16s 全綠
prod_changes: "npm 發布 v0.8.1(trusted publishing,連三次 Release 零失誤)"
---

# v0.8.1:儀表從「顯示狀態」升級為「提示下一個指令」;宣傳素材收齊

**TL;DR**:使用者提問「能不能在對的時機提示該下什麼指令(快滿→record/clear/coldstart、開專案→coldstart)」直接變成產品功能:statusline 依狀態給單一提示(優先序:health 異常 > context ≥80% > STATE 落後 ≥3c > 剛開場;正常時安靜),偵測「剛開場」用 transcript 訊息數 ≤2。宣傳素材至此全齊:三稿文案 + 紅 99%/綠 43%/開場提示三張截圖 + HN 常見質疑回法。GSD 移除定為兩階段(逐 repo 遷移→全轉完才拆全域)。

## 關鍵發現(重要性排序)

1. **提示給人、義務表給模型,兩邊都是被動觸發**——使用者不用背任何規則,這是框架哲學在 UI 層的延伸。單一提示 + 正常時安靜是抗噪音的關鍵設計。
2. **「剛開場」可以從 transcript 訊息數推斷**(≤2 則 = 該提示 coldstart,跑幾輪自動消失)——不需要任何狀態檔就能做時機偵測。
3. GSD 全域足跡(user 層 statusLine + 7 類 hooks + 71 skill)不必急拆:repo 層設定優先,flightwake 裝上即蓋過;階段二拆除前備份 settings(方案已交付使用者,見上一筆 record)。

## 交付 / Commits

flightwake `fe2c611`(v0.8.1);marketing_dashboard 同步升級。四語 README statusline 節更新。

## 驗證證據(prod 級變更)

- Release workflow 29646894172 success(16s);`npm view flightwake version` → 0.8.1
- 儀表實跑:`✈️ flightwake │ ●green · STATE 落後 1c │ → 開工先 /fw-coldstart`(本 repo);使用者實截紅 99% 警示與綠 43% 對照
- smoke 18 項全過(新斷言:無 transcript 時應出現 coldstart 提示)

## 未完 / 交接

- **宣傳待發**(素材全齊,只剩按鍵;文案三稿見 session 對話,截圖在使用者手上)
- GSD 階段二全域拆除待所有 repo 轉完(拆前備份 ~/.claude/settings.json)
- v0.9 已知項:context 視窗 200k 硬編碼會高估大視窗模型、完整 i18n(CLI 輸出 + --lang)
