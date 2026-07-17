---
name: fw-record
description: flightwake 收尾記錄 — 寫飛行紀錄並更新 STATE。Use when wrapping up work that touched schema/prod, spanned 3+ commits, or when the session is ending; also when the user says 收尾/記錄一下/record.
---

# fw-record — 飛行紀錄收尾

目的:把這段工作變成「三個月後的陌生人能讀懂」的持久物。**事後寫,不打斷工作節奏**。

## 步驟

1. 盤點本段工作:`git log --oneline "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD`
   列出自上次收尾以來的 commits(STATE 從未 commit 時直接 `git log --oneline -20`);回想關鍵發現/決策/驗證
2. 依 `.flightwake/TEMPLATE-record.md` 寫 `.flightwake/records/YYMMDD-slug.md`:
   - TL;DR 兩三句(起點問題 → 終點狀態)
   - 關鍵發現按重要性排序;夠格的**同步登進 TRAPS**(用 /fw-trap 格式)**與 DECISIONS**
   - commits 對照表、驗證證據、未完交接
3. 更新 `.flightwake/STATE.md`:現在在哪、進行中、下一步入口、`latest_record` 指標、`health`
4. 一起 commit(record + STATE 同一個 commit,訊息 `docs(fw): record YYMMDD-slug`)

## 品質檢查(寫完自問)

- 不認識這個專案的人讀 TL;DR 能知道發生什麼事嗎?
- 有沒有用了只有這個 session 才懂的代號?(有 → 展開)
- 驗證證據是「宣稱」還是「證據」?(要有數字/輸出/連結)
