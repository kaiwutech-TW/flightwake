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
| 單一 Node 安裝器(v0.2 移除 init.sh) | 雙安裝器實測漂移:.DS_Store 誤裝、worktree `.git` 檔誤判、`cp -n` exit code 跨平台不一致 | — |
| Stop hook 做 STATE 過期檢查 | 收尾義務發生在 context 最枯竭、prompt 遵循最弱的時刻;可靠性必須來自 hook 這種硬防護 | 提醒過吵或過鈍時調 THRESHOLD(現為 3 commits) |
| 檔案只有 4 種 | STATE(現在)/DECISIONS(為什麼)/TRAPS(坑)/records(發生過什麼)— 各自回答一個問題,不重疊 | — |

## 與 GSD 的遷移關係

不遷移。既有 `.planning/` 原地保留為歷史檔案;flightwake 從安裝日起管未來。
兩者短暫並存時,phase 級 CONTEXT 可放 `.planning/phases/`(沿用索引)但用 fw-handoff 的格式。

## 原型出處

2026-07-15~17 的一個真實三日雙 repo session(內部專案:後端自動化服務 × 資料儀表板):

- records 模板 ← 該 session 收尾時留下的 GSD quick task SUMMARY
- CONTEXT 模板 ← 該 session 的 GSD phase CONTEXT 文件
- TRAPS 條目形狀 ← Claude 持久記憶檔(frontmatter + [[互連]])
- 該 session:19 commits、4 條 cron、1,237 筆資料修復、2 個深層 bug,無事前計畫、零走偏

## Roadmap(測試期)

- [x] hook:session 結束時 STATE 過期檢查(v0.2:`hooks/state-check.mjs`,Stop hook,落後 ≥3 commits 提醒)
- [x] 安裝器煙霧測試(`test/smoke.sh` + GitHub Actions,ubuntu/macos)
- [ ] 在內部 repo 實裝試跑 2 週(與 GSD 並存)
- [x] 實測冷啟動成本(首筆有效樣本 2026-07-18,見 docs/benchmarks.md;持續累積)
- [ ] 評估:TRAPS 是否該升級為 OKF 目錄(當條目 >30 時)
- [ ] 開源準備:
  - [x] 英文版 README(README.en.md,v0.7.1;flip 日對調檔名)
  - [x] license:MIT(LICENSE + package.json,v0.7.1;`private: true` 留到 flip 日)
  - [x] npm 發布 workflow(.github/workflows/release.yml,Trusted Publishing + provenance,release 觸發)
  - [ ] 範例 repo
- [ ] 開源安全 checklist:
  - [x] 內部專案名/session id/內部路徑匿名化,含 git 歷史清除(v0.2)
  - [x] CI 最小權限(contents: read)+ actions 釘 SHA(v0.2)
  - [x] SECURITY.md 威脅模型與回報管道(v0.2)
  - [ ] 其餘皆為 flip 日動作 → 見下方 runbook

## Flip 日 runbook — **2026-07-18 執行完畢**

1. ✅ 推全新 repo(舊 repo 改名 `flightwake-archive` 封存 private;新 public repo 佔回原名,乾淨歷史,伺服器端舊 objects 甩掉)
2. ✅ 已提前完成(npm 佔位時刪 private;README 四語版 en 主版 + zh-TW/zh-CN/ja 互鏈)
3. ✅ npmjs.com trusted publisher 登記(kaiwutech-TW/flightwake + release.yml,Allow npm publish)
4. ✅ PVR 開啟 + branch protection(main 禁 force push/deletion)
5. ✅ 首個 Release v0.7.2(2026-07-18):trusted publishing 全鏈路實證(release.yml 18 秒跑完,OIDC 發布 + SLSA provenance,`npm audit signatures` 驗證通過),npm README 刷新為英文主版
6. ✅ Scorecard 已跑(轉 public 當日三 run 全綠)、四語 README 掛 badge
7. ✅ `npx flightwake@0.7.1 init` 乾淨 repo 實裝驗證(npm 佔位當日)
