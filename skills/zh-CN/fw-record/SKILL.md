---
name: fw-record
description: flightwake 收尾记录 — 写飞行记录并更新 STATE。Use when wrapping up work that touched schema/prod, spanned 3+ commits, or when the session is ending; also when the user says 收尾/记录一下/record.
---

# fw-record — 飞行记录收尾

目的:把这段工作变成「三个月后的陌生人能读懂」的持久物。**事后写,不打断工作节奏**。

## 步骤

1. 盘点本段工作:`git log --oneline "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD`
   列出自上次收尾以来的 commits(STATE 从未 commit 时直接 `git log --oneline -20`);回想关键发现/决策/验证
2. 依 `.flightwake/TEMPLATE-record.md` 写 `.flightwake/records/YYMMDD-slug.md`:
   - TL;DR 两三句(起点问题 → 终点状态)
   - 关键发现按重要性排序;够格的**同步登进 TRAPS**(用 /fw-trap 格式)**与 DECISIONS**
   - commit range 一行(细节留给 git)、验证证据、未完交接
3. 更新 `.flightwake/STATE.md`:现在在哪、进行中、下一步入口、`latest_record` 指标、`health`
4. 一起 commit(record + STATE 同一个 commit,讯息 `docs(fw): record YYMMDD-slug`)

## 品质检查(写完自问)

- 不认识这个专案的人读 TL;DR 能知道发生什么事吗?
- 有没有用了只有这个 session 才懂的代号?(有 → 展开)
- 验证证据是「宣称」还是「证据」?(要有数字/输出/链接)
- **去重**:有没有重抄 git 已记录的东西(commit 讯息、diff 细节)?同一事实是否已存在于 STATE/DECISIONS?(有 → 改成链接/hash 指过去;写两处必有一处过时)
- **去识别化**:record 里有没有 prod URL、客户/内部代号、真实 ID、token/密钥?(repo 可能公开;commit 前扫一次:
  `grep -nEi 'https?://|token|secret|key|password' .flightwake/records/<本次档名>`,命中逐一确认是否脱敏)
