---
name: fw-coldstart
description: flightwake 冷启动 — 接手一个 repo 前先恢复状态。Use when starting work in a repo that has .flightwake/, when the user says 接手/继续上次/coldstart, or at the start of any session touching a flightwake-managed repo.
---

# fw-coldstart — 冷启动接手

目的:在动任何档案之前,用最少的读取恢复到「安全接手」状态——冷启动成本(到正确回报为止的时间与 token)是这个框架的品质指标。

## 步骤

1. 读 `.flightwake/STATE.md`(现在在哪、进行中、下一步入口、常备事实)
   **还没初始化?** STATE 若仍留有模板自带的占位符——frontmatter 的 `updated: {{DATE}}`、`updated_by: {{SESSION_OR_PERSON}}`、
   `latest_record: records/{{YYMMDD}}-{{slug}}.md`,或正文中与模板逐字相同的 `{{…}}` 行——代表 STATE 从未初始化。先补完未填的栏位:
   - 只有上述已知的模板行算未填。其他 `{{…}}` 是用户自己的内容(示例、自己的模板),原样保留;已填的内容也原样保留——只替换未填的行
   - 依 repo 现状填:README/docs、`git log --oneline -20`、目录结构、明显的进行中工作。
     `updated` = 今天,`updated_by` = 你(模型/session),`latest_record` = `.flightwake/records/` 里最新的档,没有就写 `none`
   - `health`:模板预填的 `health: green` 视为未填。只有本 session 有验证证据(例如实际跑过测试且通过)才标 green;
     否则标 yellow 并在注释写明原因(例如 `health: yellow  # 第一版 STATE,尚未验证任何东西`)
   - 缺料时:没有 commit → 写「尚无历史」;没有 README → 依文件结构描述并注明;没有 record → `latest_record: none`——就写这个,小写、不加引号或括号:这是 `doctor` 认得的唯一「尚无 record」写法(正常状态,不是问题)。宁可写「不明」也不要猜
   - 接着决定怎么走。repo 若已有历史——`.flightwake/records/` 有任何 record、DECISIONS/TRAPS 有模板以外的条目、或有 commit——
     这是 STATE 只填一半的接手:照常续走第 2–4 步(最新 record、相关 DECISIONS/TRAPS、落后量检查)。只有真正全新的安装
     (以上皆无)才直接到第 5 步。无论哪种,第 5 步的回报都要包含你补上的 STATE 与判断不出来的部分
2. 读 STATE frontmatter 指向的 `latest_record`(上次收尾的完整脉络)
3. 只在需要时才读:`DECISIONS.md`(要改既有方向前必读)、`TRAPS.md`(碰到怪症状时查;
   **另外——要做的事若碰得到某条 trap 的领域,动手前先查那条**,别等症状出现才查,那时已经踩下去了)
   — 两者都**跳过标 superseded 的条目**(它们只是历史,新旧冲突时以 active/新日期为准)
   — TRAPS 条目**先看 `confidence`**:只有 `confirmed` 能当行为准则;`probable`/`suspected`/
     未标此栏的旧条目一律当**线索**而非事实,尤其**不可**拿来论证「这样做是安全的」
     (误判安全会直接打到 prod 和用户)。要据此放行就先自己验一次,并把结果回写升级该条
4. 量化落后程度:`git rev-list --count "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD`
   (≥1 = 上个 session 没收尾,提高警觉;STATE 从未 commit 时改看 `git log --oneline -10`)
5. 向使用者回报一段话:「上次到哪、这次打算从哪接、有没有未验证的变更(health)」——**回报完才开始动手**

## 红线

- STATE 的 health 是 yellow/red → 先处理未验证/坏掉的部分,不叠新工作
- STATE 超过 7 天未更新且 git log 有新 commit → 先补一份 record 再开工(考古趁记忆还在 git message 里)
- TRAPS 的 active 条目 >20,或本次冷启动实测 >5 分钟 → 向使用者提议压实
  (合并重复、把已不成立的条目标 superseded——压实是改 status 与整并,永不删行)
  **提议必须具体到一个字能放行**:先给诊断(慢在哪:STATE 太长/太旧?上次没收尾?
  TRAPS/DECISIONS 过时条目太多?记录用了外人看不懂的代号?),再列逐条处置清单
  (哪条标 superseded、为什么;哪些合并)。使用者确认前不动手——
  「这条还成不成立」的判断错了会传染给所有未来 session,确定权留给人,功课留给模型。
