---
updated: {{DATE}}
updated_by: {{SESSION_OR_PERSON}}
latest_record: records/{{YYMMDD}}-{{slug}}.md
health: green   # green | yellow(有未驗證變更) | red(已知壞掉)
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

{{一段話:目前的工作焦點與狀態。}}

# 進行中(未完成勿刪)

- [ ] {{未完的事 + 卡在哪}}

# 下一步入口

1. {{最可能的下一件事 → 從哪個檔案/指令開始}}
2. {{次可能}}

# 常備事實(這個 repo 的 3-5 條保命知識)

- {{例:migrations 用 SQL 檔,絕不 drizzle-kit push}}
- {{例:測試打真實 DB,夾具一律 vitest- 前綴}}
