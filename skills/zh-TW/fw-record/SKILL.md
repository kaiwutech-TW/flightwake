---
name: fw-record
description: flightwake 收尾記錄 — 寫飛行紀錄並更新 STATE。Use when wrapping up: 3+ commits since the last record, the session is ending, or (in code repos) work that touched schema/prod; also when the user says 收尾/記錄一下/record.
---

# fw-record — 飛行紀錄收尾

目的:把這段工作變成「三個月後的陌生人能讀懂」的持久物。**事後寫,不打斷工作節奏**。

## 步驟

1. 盤點本段工作:`git log --oneline "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD`
   列出自上次收尾以來的 commits(STATE 從未 commit 時直接 `git log --oneline -20`);回想關鍵發現/決策/驗證
   — 本 session 有 `/fw-log`(Claude Code mod)時先跑它,以它的輸出作為 record 的 `tests:` 證據與變更清單的依據。標成「未知」(unknown)
     的項目是它無法證明的——自己判斷(重跑,或照實寫成未證實),不可算成通過;「通過」(pass)的意義以它輸出結尾的說明為準
2. 依 `.flightwake/TEMPLATE-record.md` 寫 `.flightwake/records/YYMMDD-slug.md`:
   - TL;DR 兩三句(起點問題 → 終點狀態)
   - 關鍵發現按重要性排序;夠格的**同步登進 TRAPS**(用 /fw-trap 格式)**與 DECISIONS**
   - commit range 一行(細節留給 git)、驗證證據、未完交接
     — 未完的若是**跨多 session 的建設**(不是下個 session 順手能撿的零頭)→ 改走 `/fw-handoff` 寫 CONTEXT,
     record 的未完節只留一個指標指過去
3. 更新 `.flightwake/STATE.md`:現在在哪、進行中、下一步入口、`latest_record` 指標、`health`
4. 一起 commit(record + STATE 同一個 commit,訊息 `docs(fw): record YYMMDD-slug`)

## 品質檢查(寫完自問)

- 不認識這個專案的人讀 TL;DR 能知道發生什麼事嗎?
- 有沒有用了只有這個 session 才懂的代號?(有 → 展開)
- 驗證證據是「宣稱」還是「證據」?(要有數字/輸出/連結)
- **去重**:有沒有重抄 git 已記錄的東西(commit 訊息、diff 細節)?同一事實是否已存在於 STATE/DECISIONS?(有 → 改成連結/hash 指過去;寫兩處必有一處過時)
- **去識別化**:record 裡有沒有 prod URL、客戶/內部代號、真實 ID、token/金鑰?(repo 可能公開;commit 前掃一次:
  `grep -nEi 'https?://|token|secret|key|password' .flightwake/records/<本次檔名>`,命中逐一確認是否脫敏)
