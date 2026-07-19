---
name: fw-coldstart
description: flightwake 冷啟動 — 接手一個 repo 前先恢復狀態。Use when starting work in a repo that has .flightwake/, when the user says 接手/繼續上次/coldstart, or at the start of any session touching a flightwake-managed repo.
---

# fw-coldstart — 冷啟動接手

目的:在動任何檔案之前,用最少的讀取恢復到「安全接手」狀態。**計時**——冷啟動成本是框架的品質指標。

## 步驟

1. 讀 `.flightwake/STATE.md`(現在在哪、進行中、下一步入口、常備事實)
2. 讀 STATE frontmatter 指向的 `latest_record`(上次收尾的完整脈絡)
3. 只在需要時才讀:`DECISIONS.md`(要改既有方向前必讀)、`TRAPS.md`(碰到怪症狀時查)
   — 兩者都**跳過標 superseded 的條目**(它們只是歷史,新舊衝突時以 active/新日期為準)
4. 量化落後程度:`git rev-list --count "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD`
   (≥1 = 上個 session 沒收尾,提高警覺;STATE 從未 commit 時改看 `git log --oneline -10`)
5. 向使用者回報一段話:「上次到哪、這次打算從哪接、有沒有未驗證的變更(health)」——**回報完才開始動手**
   (要量 token 成本時:模型端看不到自己的用量——優先零 token 解析本機 transcript
   (`~/.claude/projects/<專案>/*.jsonl` 每條訊息帶 usage;hook stdin 也帶 transcript_path),拿不到再向使用者要 `/cost`)

## 紅線

- STATE 的 health 是 yellow/red → 先處理未驗證/壞掉的部分,不疊新工作
- STATE 超過 7 天未更新且 git log 有新 commit → 先補一份 record 再開工(考古趁記憶還在 git message 裡)
- TRAPS 的 active 條目 >20,或本次冷啟動實測 >5 分鐘 → 向使用者提議壓實
  (合併重複、把已不成立的條目標 superseded——壓實是改 status 與整併,永不刪行)
  **提議必須具體到一個字能放行**:先給診斷(慢在哪:STATE 太長/太舊?上次沒收尾?
  TRAPS/DECISIONS 過時條目太多?記錄用了外人看不懂的代號?),再列逐條處置清單
  (哪條標 superseded、為什麼;哪些合併)。使用者確認前不動手——
  「這條還成不成立」的判斷錯了會傳染給所有未來 session,確定權留給人,功課留給模型。
