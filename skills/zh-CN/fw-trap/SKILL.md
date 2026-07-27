---
name: fw-trap
description: flightwake 登记坑 — 把非显而易见的陷阱写进 TRAPS registry。Use immediately when a surprising root cause is found (weird error, vendor quirk, encoding trap), or when the user says 记一下这个坑/trap.
---

# fw-trap — 登记坑

目的:同一个坑,每个专案只踩一次(含未来 session 与其他 agent)。

## 什么够格进 TRAPS

- 症状与根因**距离远**(例:jsonb 存成字串 scalar → 根因是 driver 对「字串参数 + ::jsonb」的编码方式)
- 供应商未文件化的行为(例:某个操作路径不触发 webhook)
- 环境差异坑(本机过、prod 炸)
- **不够格**:普通 bug、看错误讯息就懂的东西

## 步骤

1. 依 `.flightwake/TRAPS.md` 顶部示范的条目格式(OKF 式 frontmatter:name/type/tags/discovered)
   写在 `.flightwake/TRAPS.md` 的**最上面**
2. 四个栏位齐全:症状(贴原始错误讯息)、根因一句话、解法/绕法、佐证链接(commit/record)
3. 相关的坑用 `[[名称]]` 互连
4. 当下就写——坑的细节半天内就会模糊
5. 新坑**取代或涵盖**既有条目时:把旧条目 frontmatter 的 `status` 改成 `superseded`,内文指向 [[新条目]] —— 永不删行,
   这样「旧 md vs 新 md」冲突时永远有明确方向
6. 判断坑的**范畴**:若它不专属本 repo——任何专案都会踩(平台/语言/工具层,例如 Node stdin 行为、shell 展开)——
   仍要登进 TRAPS(repo 的登记簿必须自足:下一个人或 agent 看不到你的个人记忆),
   **并同时存一份到使用者层记忆**(如 Claude memory),让你其他 repo 不再重踩。
   跨范畴各存一份是分工不是重复:通用坑只记单一 repo,换个 repo 就再咬一次
