---
name: fw-coldstart
description: flightwake 冷启动 — 接手一个 repo 前先恢复状态。Use when starting work in a repo that has .flightwake/, when the user says 接手/继续上次/coldstart, or at the start of any session touching a flightwake-managed repo.
---

# fw-coldstart — 冷启动接手

目的:在动任何档案之前,用最少的读取恢复到「安全接手」状态。**计时**——冷启动成本是框架的品质指标。

## 步骤

1. 读 `.flightwake/STATE.md`(现在在哪、进行中、下一步入口、常备事实)
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
   (要量 token 成本时:模型端看不到自己的用量——优先零 token 解析本机 transcript
   (`~/.claude/projects/<专案>/*.jsonl` 每条讯息带 usage;hook stdin 也带 transcript_path),拿不到再向使用者要 `/cost`)

## 红线

- STATE 的 health 是 yellow/red → 先处理未验证/坏掉的部分,不叠新工作
- STATE 超过 7 天未更新且 git log 有新 commit → 先补一份 record 再开工(考古趁记忆还在 git message 里)
- TRAPS 的 active 条目 >20,或本次冷启动实测 >5 分钟 → 向使用者提议压实
  (合并重复、把已不成立的条目标 superseded——压实是改 status 与整并,永不删行)
  **提议必须具体到一个字能放行**:先给诊断(慢在哪:STATE 太长/太旧?上次没收尾?
  TRAPS/DECISIONS 过时条目太多?记录用了外人看不懂的代号?),再列逐条处置清单
  (哪条标 superseded、为什么;哪些合并)。使用者确认前不动手——
  「这条还成不成立」的判断错了会传染给所有未来 session,确定权留给人,功课留给模型。
