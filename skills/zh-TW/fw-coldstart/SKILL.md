---
name: fw-coldstart
description: flightwake 冷啟動 — 接手一個 repo 前先恢復狀態。Use when starting work in a repo that has .flightwake/, when the user says 接手/繼續上次/coldstart, or at the start of any session touching a flightwake-managed repo.
---

# fw-coldstart — 冷啟動接手

目的:在動任何檔案之前,用最少的讀取恢復到「安全接手」狀態——冷啟動成本(到正確回報為止的時間與 token)是這個框架的品質指標。

## 步驟

1. 讀 `.flightwake/STATE.md`(現在在哪、進行中、下一步入口、常備事實)
   **還沒初始化?** STATE 若仍留有範本自帶的佔位符——frontmatter 的 `updated: {{DATE}}`、`updated_by: {{SESSION_OR_PERSON}}`、
   `latest_record: records/{{YYMMDD}}-{{slug}}.md`,或內文中與範本逐字相同的 `{{…}}` 行——這是第一次啟用,不是接手。寫出第一版 STATE,然後直接跳到第 5 步:
   - 只有上述已知的範本行算未填。其他 `{{…}}` 是使用者自己的內容(範例、自己的模板),原樣保留;已填的內容也原樣保留——只替換未填的行
   - 依 repo 現況填:README/docs、`git log --oneline -20`、目錄結構、明顯的進行中工作。
     `updated` = 今天,`updated_by` = 你(模型/session),`latest_record` = `.flightwake/records/` 裡最新的檔,沒有就寫 `none`
   - `health`:範本預填的 `health: green` 視為未填。只有本 session 有驗證證據(例如實際跑過測試且通過)才標 green;
     否則標 yellow 並在註解寫明原因(例如 `health: yellow  # 第一版 STATE,尚未驗證任何東西`)
   - 缺料時:沒有 commit → 寫「尚無歷史」;沒有 README → 依檔案結構描述並註明;沒有 record → `latest_record: none`。寧可寫「不明」也不要猜
   - 先把第一版 STATE 回報給使用者(一段話,加上判斷不出來的部分),再繼續
2. 讀 STATE frontmatter 指向的 `latest_record`(上次收尾的完整脈絡)
3. 只在需要時才讀:`DECISIONS.md`(要改既有方向前必讀)、`TRAPS.md`(碰到怪症狀時查;
   **另外——要做的事若碰得到某條 trap 的領域,動手前先查那條**,別等症狀出現才查,那時已經踩下去了)
   — 兩者都**跳過標 superseded 的條目**(它們只是歷史,新舊衝突時以 active/新日期為準)
   — TRAPS 條目**先看 `confidence`**:只有 `confirmed` 能當行為準則;`probable`/`suspected`/
     未標此欄的舊條目一律當**線索**而非事實,尤其**不可**拿來論證「這樣做是安全的」
     (誤判安全會直接打到 prod 和使用者)。要據此放行就先自己驗一次,並把結果回寫升級該條
4. 量化落後程度:`git rev-list --count "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD`
   (≥1 = 上個 session 沒收尾,提高警覺;STATE 從未 commit 時改看 `git log --oneline -10`)
5. 向使用者回報一段話:「上次到哪、這次打算從哪接、有沒有未驗證的變更(health)」——**回報完才開始動手**

## 紅線

- STATE 的 health 是 yellow/red → 先處理未驗證/壞掉的部分,不疊新工作
- STATE 超過 7 天未更新且 git log 有新 commit → 先補一份 record 再開工(考古趁記憶還在 git message 裡)
- TRAPS 的 active 條目 >20,或本次冷啟動實測 >5 分鐘 → 向使用者提議壓實
  (合併重複、把已不成立的條目標 superseded——壓實是改 status 與整併,永不刪行)
  **提議必須具體到一個字能放行**:先給診斷(慢在哪:STATE 太長/太舊?上次沒收尾?
  TRAPS/DECISIONS 過時條目太多?記錄用了外人看不懂的代號?),再列逐條處置清單
  (哪條標 superseded、為什麼;哪些合併)。使用者確認前不動手——
  「這條還成不成立」的判斷錯了會傳染給所有未來 session,確定權留給人,功課留給模型。
