---
updated: {{DATE}}
updated_by: {{SESSION_OR_PERSON}}
latest_record: records/{{YYMMDD}}-{{slug}}.md
health: green   # green | yellow(变更未验证)| red(已知坏掉)
---
<!-- flightwake STATE — 永远短、永远新。新 session 的第一站。 -->
<!-- 规则:只写「现在」与「下一步」;历史去 records/,决策去 DECISIONS.md。 -->
<!-- 冷启动契约:读完本档 + latest_record 必须能在 5 分钟内安全接手。 -->

# 现在在哪

{{一段话:目前焦点与状态。}}

# 进行中(未完成勿删)

- [ ] {{未完成的工作 + 卡在哪}}

# 下一步入口

1. {{最可能的下一件事 → 从哪个档案/指令开始}}
2. {{次可能的}}

# 常备事实(这个 repo 的 3-5 条保命知识)

- {{例:migration 是 SQL 档 — 绝不用 drizzle-kit push}}
- {{例:测试打真实 DB;fixture 一律用 vitest- 前缀}}
