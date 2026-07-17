# flightwake 設計文件

## 為什麼存在

GSD 在 Opus 4.8 世代穩定有效;到 Fable 5 世代,實測「不用 GSD 反而更快更好」——但完全不用框架,
session 的 context window 遲早耗盡,長專案必然走偏。flightwake 是對這個矛盾的回答:
**把 GSD 拆成「給模型的鷹架」和「給人與未來 session 的持久狀態」兩部分,只保留後者。**

汽車比喻:GSD 是導航(turn-by-turn);flightwake 是行車記錄器(事後記錄)+ 儀表警示燈(硬防護)
+ 路標(冷啟動入口)。強模型自己會開車。

## 設計決策

| 決策 | 為什麼 | 重評條件 |
|---|---|---|
| trigger-driven 而非 stage-driven | 預先計畫在接觸現實後秒過時(實證:「比對名單」的計畫不可能預見 webhook 漏事件才是真問題) | 若模型出現長任務漂移,可對特定 repo 加回 plan 義務 |
| 預設 quick、滿足條件才升級 phase | 與 GSD 相反;速度差的主要來源 | — |
| CONTEXT 停手前寫,不是開工前 | 接觸現實後的 scope 才是真的 | — |
| 品質指標=冷啟動成本(<5 分鐘) | 文件數量與合規率都是代理指標,冷啟動是真目標 | — |
| 知識條目採 OKF 慣例(frontmatter+[[連結]]) | 與知識層工具相容;Claude 記憶系統同形已驗證 | OKF spec 大改時 |
| 純檔案、零執行期依賴 | Git 原生、無鎖定(OKF 同哲學);與 GSD .planning/ 並存 | — |
| 檔案只有 4 種 | STATE(現在)/DECISIONS(為什麼)/TRAPS(坑)/records(發生過什麼)— 各自回答一個問題,不重疊 | — |

## 與 GSD 的遷移關係

不遷移。既有 `.planning/` 原地保留為歷史檔案;flightwake 從安裝日起管未來。
兩者短暫並存時,phase 級 CONTEXT 可放 `.planning/phases/`(沿用索引)但用 fw-handoff 的格式。

## 原型出處

2026-07-15~17 的一個真實三日雙 repo session(repo-A × repo-B):

- records 模板 ← `repo-A/.planning/quick/260716-example-quick-task/`
- CONTEXT 模板 ← `repo-B/.planning/phases/11-example-phase/11-CONTEXT.md`
- TRAPS 條目形狀 ← Claude 持久記憶檔(frontmatter + [[互連]])
- 該 session:19 commits、4 條 cron、1,237 筆資料修復、2 個深層 bug,無事前計畫、零走偏

## Roadmap(測試期)

- [ ] 在 repo-A 實裝試跑 2 週(與 GSD 並存)
- [ ] 實測冷啟動成本(新 session 接手計時)
- [ ] hook:session 結束時 STATE 過期檢查(Claude Code settings hooks)
- [ ] 評估:TRAPS 是否該升級為 OKF 目錄(當條目 >30 時)
- [ ] 開源準備:英文版 README、範例 repo
