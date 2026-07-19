---
record_id: 260719-metric-prescription
session: Claude(Fable 5)
date: 2026-07-19
repos: [flightwake]
tests: 無 runtime 面(全為 docs/skill 文案;smoke 未涉及)
prod_changes: none(npm 仍 0.8.2;本段改動 GitHub 即刻可見,npm 端 README 隨下次發版)
---

# 品質指標句讀反引出的三處文件補強:亮燈處方、提示詞原則、不做 /fw-auto

**TL;DR**:接續 [[260718-v082-field-fixes]]。使用者以作者身分細讀 README,發現品質指標句「>5 minutes = records degrading」連自己都會讀反 → 四語改寫成完整句(「從 /fw-coldstart 到安全接手花了多久——超過 5 分鐘代表記錄在退化」)。追問「超過五分鐘該做什麼」暴露文件只給指標沒給處方 → 處方三處落地(coldstart 紅線、README 四語、workflow.md),並定案不做 /fw-auto 自動壓實。

## 關鍵發現(重要性排序)

1. **指標句沒有處方就是半成品**:README 原本只說「>5 分鐘 = 退化」,沒說亮燈後怎麼辦。現規格化為:使用者一句「診斷慢在哪並壓實」→ 模型必附診斷 + 逐條處置清單(哪條標 superseded、為什麼、哪些合併)→ 使用者一字放行。已寫進 coldstart 紅線(源頭與安裝副本同步,未踩 [[dogfood-dual-copy-drift]])。
2. **不做 /fw-auto**(DECISIONS 2026-07-19):壓實風險在判斷不在執行——標錯 superseded 會傳染給所有只信 active 的未來 session;且守「只背一條指令」承諾。重評條件:放行率長期 ~100% 時再議。
3. **提示詞原則入 README**:給事實不給情緒——「超過 5 分鐘下個 session 會接錯手」可推理,「這很嚴重!」只能表演緊張。源自使用者提問「該用什麼提示詞、要不要帶指責」。
4. **作者本人讀反 = 最便宜的可用性測試**:「how long a session *needs* to take over(>5 min)」的 needs 帶門檻語感,掃讀會反轉語意;符號縮在括號裡加劇。修法是展開成完整句、寫明量測起點。

## 交付 / Commits

5cf7161..245d972(指標句四語改寫、處方三處落地、DECISIONS 一行)

## 驗證證據

- 文案改動無 runtime 面;skill 源頭與安裝副本 diff 一致後才 commit
- 三個 commit 均已 push(GitHub 即刻生效)

## 未完 / 交接

- **發宣傳**(唯一主線,同上份 record:三稿在使用者桌面、紅 99% 截圖建議重截)
- 官網 kaiwuweb blog + products 待新 session
- v0.9:i18n(本段新增的 README/skill 文案屆時一併翻)
