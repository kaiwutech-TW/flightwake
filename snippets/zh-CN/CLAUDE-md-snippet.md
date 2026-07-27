<!-- flightwake 触发义务片段 — init 会把本档内容(不含本注解)附加到目标 repo 的 CLAUDE.md -->
## flightwake 工作纪律

本 repo 使用 flightwake(行车记录器式工作框架):**记录追随工作,不引导工作**。
预设一切直接动手,但以下事件触发对应义务:

| 触发 | 义务 |
|---|---|
| 本 session 首次要动这个 repo | 先跑 `/fw-coldstart`(读 `.flightwake/STATE.md` + 最近 record,回报后才动手) |
| 做出关掉其他选项的决策 | 一行 append 进 `.flightwake/DECISIONS.md`(含 why) |
| 发现非显而易见的坑 | 当下 `/fw-trap` 登进 `.flightwake/TRAPS.md` |
| 动 schema / 动 prod / 自上次 record ≥3 commits | 收尾 `/fw-record`(飞行记录 + 更新 STATE;Stop hook 会在落后时提醒) |
| 跨 session 的建设要停手 | `/fw-handoff`(写 CONTEXT,停手前写、不是开工前) |
| session 结束 | STATE 必须反映真实现况(health 诚实标色) |

硬防护(与模型强弱无关):测试绿 + typecheck 干净才算完成;prod 变更必留验证证据于 record;
破坏性操作先向使用者确认。
去重原则:同一事实只写一处(git 能查的不重抄;record/STATE/DECISIONS 各司其职,其他处用链接或 hash 指过去)——写两处必有一处过时。
