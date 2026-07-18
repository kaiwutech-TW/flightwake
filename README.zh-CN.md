<!-- 简体中文版。主版:README.md(英文);其他:README.zh-TW.md / README.ja.md — 改任一版必同步其他版。 -->
# flightwake ✈️

> **记录是工作飞过后自然留下的航迹,不是起飞前必须申报的飞行计划。**

[![npm](https://img.shields.io/npm/v/flightwake)](https://www.npmjs.com/package/flightwake) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/kaiwutech-TW/flightwake/badge)](https://scorecard.dev/viewer/?uri=github.com/kaiwutech-TW/flightwake)

🌐 [English](README.md) · [繁體中文](README.zh-TW.md) · **简体中文** · [日本語](README.ja.md)

给强模型(Claude Fable 5 世代起)的极轻量工作记录框架。零运行期依赖、纯 Markdown、一切进 git。

## 安装

```bash
cd your-repo
npx flightwake init        # 升级既有安装:加 --force
```

init 会:建 `.flightwake/`(模板 + Stop hook)、复制 4 个 skill 到 `.claude/skills/`、把 Stop hook 并入 `.claude/settings.json`、把触发义务表(含 `<!-- flightwake:begin/end -->` 标记)追加到**检测到的 agent 指令文件**(CLAUDE.md / AGENTS.md / GEMINI.md,有哪个贴哪个;全都没有就建 AGENTS.md;`--agents=claude,codex,gemini` 可明确指定)。**纯文件复制,零运行期依赖**(Node ≥18 只在安装与 hook 时用)。用户数据(STATE/DECISIONS/TRAPS)任何情况下都不覆盖;`--force` 只更新框架拥有的文件。

## 使用教程

### 第一次安装后

1. 开一个 Claude Code session,说「**用 /fw-record 初始化 STATE**」——让模型把 repo 现状写成第一份 STATE
2. `git add .flightwake .claude CLAUDE.md && git commit`
3. 之后每个 session 都是下面的日常循环

### 日常循环

你(和模型)只需要记得一件事:**开工先 `/fw-coldstart`,其余义务模型自己会触发**——义务表已贴在指令文件里,强模型读得懂也守得住。一个典型 session 长这样:

```text
你:  /fw-coldstart
模型:(读 STATE + 最近 record,约 1 分钟)
      「上次做到 X,health green,下一步入口是 Y。有没有未验证的变更:无。从 Y 接手?」
你:  对,做吧
模型:(直接动手。过程中做了关掉其他选项的决策 → 自动一行进 DECISIONS;
      踩到非显而易见的坑 → 自动 /fw-trap 登记)
你:  收尾
模型:(/fw-record:写飞行记录、更新 STATE、敏感信息自查)
```

忘了收尾也没关系:STATE 落后 ≥3 commits 时,Stop hook 会在 session 结束前拦一次提醒;CI 端用 `--ci` 把同一道关卡带给其他 agent 与人类协作者。要跨 session 停手的大工程,停手前说「交接」让模型跑 `/fw-handoff`。

### 你唯一要盯的事

STATE 的 health 诚不诚实(green/yellow/red)。框架的质量指标只有一个:**新 session 冷启动多久能安全接手**(>5 分钟 = 记录在退化)。其他一切——记录多寡、格式合规——都不重要。

### 想看实际长相

本 repo 自己就 dogfooding 这套框架:[`.flightwake/`](.flightwake/) 里是真实的 STATE、DECISIONS 与 records——框架从缺口清单到开源上线的每一步都记录在里面,那就是装进你 repo 后会自然长出的东西。

## 为什么会有这个项目

Fable 5 级的模型不需要人教它怎么做事——但有四件事再强的模型也做不到,而且全是**结构性**的,不会随模型变强而消失:

1. **session 必死,context 有限**。工作跨 session 时记忆归零;没有记录,每次接手都是一场 git 考古——强模型只是考古得比较快,不是不用考古。
2. **git 记 what,不记 why**。commit 查得到改了什么,查不到「当时为什么不选另一条路」和「这个坑的根因」——而这两样恰好是下个 session(或下个 agent)最贵的信息。
3. **纪律会在长 session 里漂移**。「测试还没跑就报告完成」「动了 prod 没留验证证据」这类滑坡与模型智力无关,需要模型之外的硬防护。
4. **多 agent 不共享状态**。Claude、Codex、Gemini 与人类队友各看各的;状态进了 git 才是大家的。

所以 flightwake 补的是**持久性与纪律,不是智力**。前身思想来自 GSD:GSD 是**导航**(turn-by-turn 引导模型每一步),flightwake 是**行车记录仪 + 仪表警示灯 + 路标**——强模型自己会开车,框架只负责三件事:

1. **行车记录仪**:决策、发现、验证证据,事后记录(`records/`、`DECISIONS.md`、`TRAPS.md`)
2. **仪表警示灯**:与模型强弱无关的硬防护(测试绿才算完成、prod 变更必留验证证据、破坏性操作先确认)
3. **路标**:任何 session 死掉,下一个 session 读 `STATE.md` 2 分钟内安全接手

起源是一个真实的三日 session(2026-07-15~17:双 repo、19 commits、4 条 cron、2 个深层 bug 修复,全程无事前计划、零走偏)。它证明了强模型不需要导航——但它留下的 SUMMARY/CONTEXT/记忆文件,也就是让下一个 session 能接手的东西,全是临场发明的。flightwake 把那套临场发明变成可安装的惯例。

## 核心原则:记录追随工作,而非引导工作

GSD 是 **stage-driven**(research→plan→execute→verify 关卡制);flightwake 是 **trigger-driven**(事件触发义务制):

| 触发事件 | 义务 | 工具 |
|---|---|---|
| 开始动一个 repo | 先读 STATE + 最近一笔 record | `/fw-coldstart` |
| 做出「关掉其他选项」的决策 | 一行进 DECISIONS(append-only,记 why) | 直接写 |
| 踩到非显而易见的坑 | 一则进 TRAPS | `/fw-trap` |
| 动 schema / 动 prod / 超过 ~3 commit | 收尾留 record | `/fw-record` |
| 工作会跨 session | **停手前**(非开工前)写 handoff/CONTEXT | `/fw-handoff` |
| session 要关 | 更新 STATE 的位置与下一步入口 | `/fw-record` 内含 |

**升级规则(与 GSD 相反)**:默认一切都是 quick、直接动手;只有「跨多 session 的建设」才升级成 phase(一份 CONTEXT,plan 拆分交给模型临场判断)。

## 文件结构(安装进目标 repo 后)

```
your-repo/
├── .flightwake/
│   ├── STATE.md             # 现在在哪、下一步入口(永远短、永远新)
│   ├── DECISIONS.md         # append-only 决策日志(一行一决策,记 why)
│   ├── TRAPS.md             # 坑 registry(OKF 式 frontmatter 条目)
│   ├── TEMPLATE-record.md   # 飞行记录模板
│   ├── hooks/state-check.mjs  # Stop hook:STATE 落后 ≥3 commits 时提醒收尾
│   └── records/             # 飞行记录(每次有意义的收尾一份)
├── .claude/skills/fw-*/     # 四个 skill
└── .claude/settings.json    # init 并入 Stop hook 设置
```

skill 与 Stop hook 是 Claude Code 上的便利糖衣;`.flightwake/` 本体是纯 Markdown,任何 agent 读指令文件即可遵循同一套触发义务。与既有 GSD `.planning/` 可并存(旧记录即历史档案)。

## 高级安装

**`--private`** 让记录**只留本机、不进 git**:所有写入登进 `.git/info/exclude`(纯本地,不在 repo 留痕迹),hook 改进 `.claude/settings.local.json`,义务表改写 `CLAUDE.local.md`(受 git 追踪的既有指令文件一律不碰)。代价:记录不随 repo 共享、重新 clone 后要重跑 `init --private`——「进 git 随 repo 共享」才是 flightwake 的默认与存在理由,`--private` 是给「在别人的 repo 里私用」的逃生口。

**`uninstall`** 反向清除 init 的固定写入范围:删 skill 与框架文件、从 settings 摘除 flightwake 的 Stop hook(用户其他 hook 原样保留)、移除指令文件与 `.git/info/exclude` 的标记区块(由 flightwake 建的文件清空后删除)。**`.flightwake/` 是用户数据,默认保留**,`uninstall --purge` 才连同删除。

**monorepo 政策:单 repo 一份,装在 git root。** 工作是 session 形状的——一个 session 常横跨多个 package,记录跟着 session 走;拆到子目录各装会把同一段工作切碎成多份 record,也让「该读哪份 STATE」变成新的冷启动歧义。子目录执行 init 会拦下并指路 root。submodule 有自己的 `.git`,视为独立 repo 各装各的。多团队高流量 monorepo 若觉得 CI 落后检查误报,先调 `--threshold`。

### 从 GSD 迁移

先把手上的 milestone 收完,然后:

1. `npx flightwake init`——与 `.planning/` 并存,什么都不会被删
2. 对你的 agent 说:「**这个 repo 从 GSD 转用 flightwake:读 `.planning/` 的现状,用 /fw-record 初始化 `.flightwake/STATE.md`,未完事项写进下一步入口;从现在起 `.planning/` 只是历史档案,不要再更新它**」
3. 把 CLAUDE.md 里 GSD 自己的指令段移除(或注释掉),避免两套规则抢模型的服从

### CI 端收尾检查(可选)

Stop hook 只在 Claude Code 生效;要把「STATE 不落后」的纪律带到其他 agent 与人类协作者,在 CI 跑同一份脚本——STATE 落后 HEAD ≥3 commits 即失败(`--threshold=N` 可调):

```yaml
# .github/workflows/flightwake.yml(示例;依你的 repo 惯例建议把 actions 钉到 SHA)
name: flightwake
on: [push, pull_request]
permissions:
  contents: read
jobs:
  state-fresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # rev-list 数落后量需要完整历史
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: node .flightwake/hooks/state-check.mjs --ci
```

flightwake 不会把 workflow 写进你的 repo——`.github/workflows/` 权限敏感,这超出「写入范围固定」的承诺;示例请自行复制。

## 与邻近系统的分界

**Claude Code 记忆功能**:持久记忆与 flightwake 同形(frontmatter + `[[链接]]`)但不同层——记忆是单机单人的;flightwake 的文件进 git,随 repo 共享给团队、CI 与任何 agent。分工规则:repo 的事实(坑、决策、状态)进 flightwake;个人偏好与跨项目习惯进记忆。同一件事不要双写。

**[Google OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)**:OKF 管**知识层**(系统事实:schema、指标口径、代码对照),flightwake 管**过程层**(发生了什么、为什么、现在在哪)。flightwake 的知识型产物采 OKF 惯例(YAML frontmatter + `[[链接]]`),两边在「纯 Markdown + frontmatter」底层天然兼容。

## 安全性

- **零依赖、无网络、无 install script**:安装器只做文件复制;hook 只用 `git`(无 shell)做只读查询。
- **写入范围固定**:`init` 只碰 `.flightwake/`、`.claude/skills/fw-*`、`.claude/settings.json`,以及 agent 指令文件里的标记区块;`--private` 时改碰 `.claude/settings.local.json`、`CLAUDE.local.md` 与 `.git/info/exclude` 里的标记区块。`uninstall` 反向清除同一范围。
- **hook 进 git**:`.flightwake/hooks/state-check.mjs` 是 repo 内的文件,能 commit 的人就能改——与所有 repo-local 设置同级,Claude Code 加载时会要求确认。
- 漏洞报告见 [SECURITY.md](SECURITY.md)。以 npm Trusted Publishing 发布(附 provenance),可用 `npm audit signatures` 验证。

## 状态

🚧 v0.x——持续 dogfooding 中;惯例仍可能演进(append-only 文件有 `superseded` 生命周期,读取端容忍让旧安装不受影响)。

## License

[MIT](LICENSE)
