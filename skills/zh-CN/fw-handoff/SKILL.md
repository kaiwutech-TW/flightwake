---
name: fw-handoff
description: flightwake 跨 session 交接 — 为「还没做完、之后要继续」的工作写 CONTEXT。Use when stopping mid-build on multi-session work, when the user says 交接/handoff/下次继续, or before context runs out on a large task.
---

# fw-handoff — 跨 session 交接(唯一会把工作升格成阶段的时机)

目的:让任何 session 都能冷启动进入未完成的建设。**触发点是停手前,不是开工前**——
碰过现实之后写的 CONTEXT 才是真的。

## 步骤

1. 写 `.flightwake/records/YYMMDD-slug-CONTEXT.md`,四个必备段落:
   - **范围**:要建什么 / 明确不做什么(挡 scope creep);再加一行**验收**——
     怎样算做完,**要可观测**(哪个数字要对得上什么、哪个画面要出现什么、哪个测试要绿)。
     「做完」没有可观测的定义,下个 session 只能自己补一个,而且通常补得比你宽
   - **已定案的决策**:含 why(同步登进 DECISIONS)
   - **现状与资料基础**:什么已就绪(附验证证据)、什么是假设(标「执行前先抽验」)
   - **下一步**:具体到「打开哪个档案 / 跑哪个指令」
2. 未决问题另立清单——**需要人决定的标「找 X 确认」**;绝不让下个 session 去猜
3. 更新 STATE:进行中 + 下一步入口指向这份 CONTEXT
4. commit;然后向使用者提议 push(交接要离开这台机器才算安全,但推不推是使用者的决定)

## 与阶段式流程的关系

这是 flightwake 版本的「开一个阶段」:一份 CONTEXT,不做事前计划分解——计划是执行的那个 session 当下的判断。
若 repo 里还有历史遗留的 `.planning/` 目录,CONTEXT 可放进它的 phases/ 目录以沿用既有索引(格式与本档相同)。
