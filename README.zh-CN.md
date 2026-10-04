<!-- 简体中文版。主版:README.md(英文);其他:README.zh-TW.md / README.ja.md — 改任一版必同步其他版。 -->
# flightwake ✈️

> **记录是工作飞过后自然留下的航迹,不是起飞前必须申报的飞行计划。**

[![npm](https://img.shields.io/npm/v/flightwake)](https://www.npmjs.com/package/flightwake) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/kaiwutech-TW/flightwake/badge)](https://scorecard.dev/viewer/?uri=github.com/kaiwutech-TW/flightwake)

🌐 [English](README.md) · [繁體中文](README.zh-TW.md) · **简体中文** · [日本語](README.ja.md)

给强模型(Claude Fable 5 世代起)的极轻量工作记录框架。零运行期依赖、纯 Markdown、一切进 git。

![本 repo 的真实冷启动:/fw-coldstart 读 STATE 与最新 record,约 30 秒报告安全接手](https://raw.githubusercontent.com/kaiwutech-TW/flightwake/main/docs/demo.gif)

*就在本 repo 实录:一个指令、两次读文件,全新 session 准确报告上次做到哪、这次从哪接。*

## 安装

```bash
cd your-repo
npx flightwake setup    # 引导式安装:问几个问题、列出将写入的每个路径,你确认后才安装
```

`setup` 需要终端。它先检查 git(目录不是 repo 时会问要不要 `git init`,默认 No,且只在最后确认后才执行),接着问语言、agent(文件夹已有 CLAUDE.md / AGENTS.md / GEMINI.md 时列出检测结果;都没有时直接问你用哪些工具,可多选、不预选)、可选附加项(每项默认 No:底部仪表、Claude Code mod、roles、Orca 协作;mod 这个问题只在选了 Claude Code 时才会问)与 repo 类型(code / notes),列出将写入的所有路径,再问「确定执行? [Y/n]」——按 Enter 即安装;`n`、EOF 或 Ctrl-C 都不会写入任何东西。若已安装 flightwake,只会提供就地升级(`update`)。它与 `init` 走同一条安装路径,装完跑 `doctor` 并打印下一步。命令行上给的旗标会直接回答对应的问题;`--private` 只能用旗标,从不询问。

**非交互形式**——`npx flightwake init [旗标]`(直接敲 `npx flightwake` 效果相同)从不提问:给自动化、agent、CI 与已经知道要什么的高级用户用:

```bash
npx flightwake init --lang=zh-CN --statusline   # 简体中文 + 底部仪表
npx flightwake init --lang=zh-CN --statusline --agents=claude,codex,gemini   # 三家一次装齐(Claude Code + Codex + Gemini CLI)
npx flightwake update                           # 就地升级,沿用你装过的选项(lang/statusline/private)
```

**选你的语言**(非交互形式;`setup` 会帮你问)— 安装的模板、skill 与所有 CLI/仪表输出都跟着它走。**刻意不做自动检测**:终端的 `LANG` 与操作系统语系经常不一致(实测过:系统是 zh_TW,终端却报 `en_US.UTF-8`),猜错又讲得很有自信,比明讲默认更糟。直接复制你要的那行:

| 语言 | 全新安装 | 已经装成其他语言 |
|---|---|---|
| 简体中文 | `npx flightwake init --lang=zh-CN --statusline` | `npx flightwake init --lang=zh-CN --force --statusline` |
| 繁體中文 | `npx flightwake init --lang=zh-TW --statusline` | `npx flightwake init --lang=zh-TW --force --statusline` |
| 日本語 | `npx flightwake init --lang=ja --statusline` | `npx flightwake init --lang=ja --force --statusline` |
| English | `npx flightwake init --statusline` | `npx flightwake init --lang=en --force --statusline` |

切语言是安全的:`--force` 只换框架拥有的文件(模板、skill、hook、marker 区块),你的 STATE / DECISIONS / TRAPS / records **完全不动**,维持你当初写下的语言。不要仪表的话,把 `--statusline` 拿掉即可。加 `--agents=claude,codex,gemini`(可任选子集)明确指定要装哪些 agent;不加的话,init 依既有的指令文件(CLAUDE.md / AGENTS.md / GEMINI.md)自动检测。

**不要手动翻译装好的文件。** marker 记着你装的是哪个语言,下次 `update` 会用那个语言的来源刷新,你的修改会消失。要换语言请重跑 init 加 `--lang`;若已经手改过,现在 init/update 会逐档列出它覆盖了什么。

init 会:建 `.flightwake/`(模板 + Stop hook)、复制 4 个 skill 到 `.claude/skills/`、把 Stop hook 并入 `.claude/settings.json`、把触发义务表(含 `<!-- flightwake:begin/end -->` 标记)追加到**检测到的 agent 指令文件**(CLAUDE.md / AGENTS.md / GEMINI.md,有哪个贴哪个;全都没有就建 AGENTS.md;`--agents=claude,codex,gemini` 可明确指定)。**检测到的每个平台都拿到同一套 skill 与 hook,用它自己的方言**:Codex 与 Gemini CLI 从 `.agents/skills/fw-*` 读 skill,STATE 检查分别进 `.codex/hooks.json`(Stop)与 `.gemini/settings.json`(AfterAgent),义务表对 Codex 写 `$fw-coldstart`、对 Claude Code 写 `/fw-coldstart`、对 Gemini 写裸 skill 名。Codex 首次执行会要你信任这个 repo hook 一次。**纯文件复制,零运行期依赖**(Node ≥18 只在安装与 hook 时用)。用户数据(STATE/DECISIONS/TRAPS)任何情况下都不覆盖;`--force` 只更新框架拥有的文件。

## 使用教程

### 第一次安装后

1. 在 repo 里开一个 agent session,运行 `/fw-coldstart`——它会发现 STATE 还是未填的模板,并依 repo 现状写出第一份 STATE(health 绝不乱猜成 green:没有实际验证前一律是 yellow)
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

忘了收尾也没关系:STATE 落后 ≥3 commits 时,Stop hook 会在 session 结束前拦一次提醒(STATE 标 health=green 但最新 record 没有测试证据时,也会提醒);CI 端用 `--ci` 把同一道关卡带给其他 agent 与人类协作者。诚实标注这张网的边界:落后量只数**人**的 commit——bot 的 commit(`dependabot[bot]`、`renovate[bot]` 等)不计入,因为依赖升版不会让 STATE 变错,而 bot 的 PR 也永远无法自己补 STATE。零 commit 的 session(研究、ops 操作)或 squash/rebase 流程会从网下溜过;网接住的是「忘记」,不取代 session 结束时的义务。要跨 session 停手的大工程,停手前说「交接」让模型跑 `/fw-handoff`。

### 你唯一要盯的事

STATE 的 health 诚不诚实(green/yellow/red)。框架的质量指标只有一个:**新 session 从 `/fw-coldstart` 到安全接手花了多久**——超过 5 分钟,代表你的记录在退化。其他一切——记录多寡、格式合规——都不重要。

灯亮了也不用你动手保养,说一句:「**这次冷启动花了 X 分钟,诊断慢在哪并压实**」。模型会带着诊断(STATE 太长?上次没收尾?TRAPS/DECISIONS 过时条目太多?)和逐条处置清单回来——哪条标 superseded、为什么、哪些合并——你一个字放行即可。提示的诀窍是给事实不给情绪:「超过 5 分钟代表下个 session 会接错手」模型能推理;「这很严重!」它只能表演紧张。

### 想看实际长相

本 repo 自己就 dogfooding 这套框架:[`.flightwake/`](.flightwake/) 里是真实的 STATE、DECISIONS 与 records——框架从缺口清单到开源上线的每一步都记录在里面,那就是装进你 repo 后会自然长出的东西。

### 分阶段实战手册

刚开始跟强模型协作?[docs/workflow.zh-TW.md](docs/workflow.zh-TW.md) 是一张阶段地图:每个阶段**你**该做什么、该对模型说什么——主线给新手,「⚙ 进阶」折叠给 Claude Code 老手。(英文版:[workflow.md](docs/workflow.md))

同一个 repo 用不止一个模型?[docs/multi-agent.zh-TW.md](docs/multi-agent.zh-TW.md) 说明 Claude Code、Codex、Gemini CLI 怎么共用同一份 `.flightwake/`——init 替各家装了什么、各工具怎么叫 skill、以及让交接不分模型都一样的「收尾 → commit → 冷启动」循环。(英文版:[multi-agent.md](docs/multi-agent.md))

用一组 agent 组团队(项目经理、技术总监、写手、审核)?[docs/roles.zh-CN.md](docs/roles.zh-CN.md) 说明 `flightwake roles`(选配,v0.14.0 起):agent 依你的项目推荐一组角色,你预览、定制,每个角色被写进该 agent 每次开场都会重读的指令文件——`/clear` 之后没人忘记自己的工作,团队横跨多个 repo 也行。(英文版:[roles.md](docs/roles.md))

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
├── .claude/skills/fw-*/     # 四个 skill(Claude Code)
├── .claude/settings.json    # init 并入 Stop hook 设置
├── .agents/skills/fw-*/     # 同一套四个 skill 给 Codex / Gemini CLI(检测到 AGENTS.md / GEMINI.md 才装)
├── .codex/hooks.json        # Codex 的 Stop hook(检测到 AGENTS.md 才装)
└── .gemini/settings.json    # Gemini CLI 的 AfterAgent hook(检测到 GEMINI.md 才装)
```

skill 与 hook 是各平台的便利糖衣——同一套四个 skill、同一份检查脚本,装到 Claude Code、Codex、Gemini CLI 各自会去找的位置;`.flightwake/` 本体是进 git 的纯 Markdown,所以每个 agent(和每个人)读写的是同一份状态。其他 agent 读指令文件也能手动遵循同一套触发义务。与既有 GSD `.planning/` 可并存(旧记录即历史档案)。

## 高级安装

**`--private`** 让记录**只留本机、不进 git**:所有写入登进 `.git/info/exclude`(纯本地,不在 repo 留痕迹),hook 改进 `.claude/settings.local.json`,义务表改写 `CLAUDE.local.md`(受 git 追踪的既有指令文件一律不碰)。代价:记录不随 repo 共享、重新 clone 后要重跑 `init --private`——「进 git 随 repo 共享」才是 flightwake 的默认与存在理由,`--private` 是给「在别人的 repo 里私用」的逃生口。

**`doctor`**(`npx flightwake doctor`)是只读、不联网的安装结构检查:git 与 git root、Node ≥18、`.flightwake/`、STATE(未填的模板字段算警告)、`latest_record`、标记区块及其 version/lang/profile 是否一致、skill、hook 注册(JSON 合法、命令完全一致、事件正确——Claude Code/Codex 为 Stop,Gemini CLI 为 AfterAgent——无重复、脚本存在)、`--private` 的 exclude 是否真的生效,以及可选附加项状态。每行输出 ok / warning / fail;有任何 fail 即 exit 1。它只验证安装结构,不保证 hook 在运行期真的会触发(Codex 是否信任 hook 路径无法检查,只会打印提示)。不写入任何东西。

**`--profile=code|notes`**(默认 `code`)选择义务表。`notes` 给非代码的 repo(写作、研究、笔记):去掉「测试绿 + typecheck 干净」、「prod 验证证据」与 schema/prod 收尾触发,保留冷启动、决策、坑、交接、≥3 commit 收尾、破坏性操作先确认、session 结束时 STATE 诚实。安装的文件相同。profile 记在标记里(`profile=notes`);`update` 会沿用,`update --profile=code` 可切回。

**`--orca`**(可选;`setup` 也会问,但只在检测到 Orca 时)在每个启用平台的指令文件加一个标记区块:跨 agent 讨论与评审要用看得见的 Orca 标签页,不要用藏在后台的运行;并附单一写手评审协议(被请来评审的 agent 不写 record、不碰 STATE;提问方把采纳的结论写进自己的 record)。`uninstall` 会移除;`update` 只在已安装处刷新。

**`--mod`**(可选;`setup` 也会问,但只在选了 Claude Code 时)安装 Claude Code mod `flightwake-mod`,放在 `.claude/skills/flightwake-mod/`(只复制 manifest、`hooks/`、`types/`):session 开始时注入 STATE、输入框上方的提示行、session 飞行日志(`/fw-log`)、TRAPS 触发提醒,以及默认关闭的角色守门。需要 Claude Code 2.1.287+,接受文件夹信任提示,并从 repo 根目录启动。目录已存在时需 `--force` 才会覆盖;`update` 只刷新已安装的 mod,`uninstall` 移除整个文件夹。详见 [docs/mod.zh-CN.md](docs/mod.zh-CN.md)。

**`--git-init`** 让 `init` 在目录不是 git repo 时先创建它——只有明确给旗标才会做;没给就停下并告知。`init` 与 `setup` 都会先检查 git 是否已安装,没有则按平台给出安装提示。

**`uninstall`** 反向清除 init 的固定写入范围:删 skill 与框架文件、从 settings 摘除 flightwake 的 Stop hook(用户其他 hook 原样保留)、移除指令文件与 `.git/info/exclude` 的标记区块(由 flightwake 建的文件清空后删除)。**`.flightwake/` 是用户数据,默认保留**,`uninstall --purge` 才连同删除。

**monorepo 政策:单 repo 一份,装在 git root。** 工作是 session 形状的——一个 session 常横跨多个 package,记录跟着 session 走;拆到子目录各装会把同一段工作切碎成多份 record,也让「该读哪份 STATE」变成新的冷启动歧义。子目录执行 init 会拦下并指路 root。submodule 有自己的 `.git`,视为独立 repo 各装各的。多团队高流量 monorepo 若觉得 CI 落后检查误报,先调 `--threshold`。

### 从 GSD 迁移

先把手上的 milestone 收完,然后:

1. `npx flightwake init`——与 `.planning/` 并存,什么都不会被删
2. 对你的 agent 说:「**这个 repo 从 GSD 转用 flightwake:读 `.planning/` 的现状,用 /fw-record 初始化 `.flightwake/STATE.md`,未完事项写进下一步入口;从现在起 `.planning/` 只是历史档案,不要再更新它**」
3. 把 CLAUDE.md 里 GSD 自己的指令段移除(或注释掉),避免两套规则抢模型的服从

### 底部仪表(可选)

`npx flightwake init --statusline` 在 Claude Code 底部装一条常驻仪表:

```
✈️ flightwake │ ●green · STATE 落后 2c │ ▓▓░░░░░░░░ 23%
```

health 颜色(你唯一要盯的事)、STATE 落后量(与 Stop hook 同一套 rev-list 逻辑,但从「结束时提醒」变成「随时看得到」)、context 用量。仪表还会依状态**直接提示下一个指令**:刚开场 → `→ 开工先 /fw-coldstart`;STATE 落后 ≥3 → `→ /fw-record 收尾`;context 快满 → `→ /fw-record → /clear → /fw-coldstart`;一切正常 → 安静。绝不覆盖既有 statusline(单值设置),且 repo 层设置优先于用户层,与全局仪表工具可并存。

注意:纯 `npx flightwake init` **不会**装仪表——它是选配。已经 init 过才想装?再跑一次 `npx flightwake init --statusline` 即可,只会补上仪表(其他已装的全部 skip),下一个 Claude Code session 就会看到 bar。

仪表也会在 flightwake 有新版时提示(`→ 可更新 v0.9.1:npx flightwake update`)——只在没有更要紧的事时显示。检查是每 24 小时最多一次对 npm registry 的匿名 GET,缓存在系统临时目录,永远在后台进程执行(渲染绝不等网络)。不想要:`FLIGHTWAKE_NO_UPDATE_CHECK=1`。

### CI 端收尾检查(可选)

hook 只在 Claude Code、Codex、Gemini CLI 的 session 里触发;要把「STATE 不落后」的纪律带到其他 agent 与人类协作者,在 CI 跑同一份脚本——STATE 落后 HEAD ≥3 commits 即失败(`--threshold=N` 可调):

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

**Claude Code 记忆功能**:持久记忆与 flightwake 同形(frontmatter + `[[链接]]`)但不同层——记忆是单机单人的;flightwake 的文件进 git,随 repo 共享给团队、CI 与任何 agent。分工规则:repo 的事实(坑、决策、状态)进 flightwake;个人偏好与跨项目习惯进记忆。同一件事不要双写——唯一的刻意例外:**不是本 repo 特有的通用坑**(平台/语言层)两边都存,因为 repo 登记簿必须自足,而你的其他 repo 也需要这个警告(跨范畴各存是分工不是重复)。

**[Google OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)**:OKF 管**知识层**(系统事实:schema、指标口径、代码对照),flightwake 管**过程层**(发生了什么、为什么、现在在哪)。flightwake 的知识型产物采 OKF 惯例(YAML frontmatter + `[[链接]]`),两边在「纯 Markdown + frontmatter」底层天然兼容。

## 安全性

- **零依赖、无网络、无 install script**:安装器只做文件复制;hook 只用 `git`(无 shell)做只读查询。
- **写入范围固定**:`init` 只碰 `.flightwake/`、`.claude/skills/fw-*`、`.claude/settings.json`、agent 指令文件里的标记区块(含 Orca 区块,仅在你选用时)、`~/.flightwake/registry.json`(init/update 会写;uninstall 移除本 repo 的条目)、`.claude/skills/fw-roles` / `.agents/skills/fw-roles`(仅在你选用 roles 时)、`.claude/skills/flightwake-mod/`(仅在你选用 mod 时;`uninstall` 会移除;`--private` 时加进 exclude 区块),以及(检测到 Codex / Gemini CLI 时)`.agents/skills/fw-*`、`.codex/hooks.json`、`.gemini/settings.json`;`--private` 时改碰 `.claude/settings.local.json`、`CLAUDE.local.md` 与 `.git/info/exclude` 里的标记区块(Codex/Gemini 那几个文件只在未受跟踪时才写,并加进 exclude)。`uninstall` 反向清除同一范围。任何写入都不经由 symlink、也不落在 repo 之外:安装前先预检,有必要路径会被拒写就在写入任何东西之前中止并点名该路径(以非零退出)。文件一律以「临时文件 + rename」替换,不原地覆写;uninstall 与 roles 命令遵守同样规则。`--private` 若隐私无法生效(要排除的东西已受追踪,或 `.git/info/exclude` 写不进去)会在一开始就拒绝。`doctor` 不写入任何东西(安装了 mod 时它会执行只读的 `claude --version`)。「只复制文件」唯一的例外是 `git init`:只在你于 `setup` 最后摘要确认后,或你传了 `--git-init` 时才会执行。
- **hook 进 git**:`.flightwake/hooks/state-check.mjs` 是 repo 内的文件,能 commit 的人就能改——与所有 repo-local 设置同级,Claude Code 加载时会要求确认。
- 漏洞报告见 [SECURITY.md](SECURITY.md)。以 npm Trusted Publishing 发布(附 provenance),可用 `npm audit signatures` 验证。

## 状态

🚧 v0.x——持续 dogfooding 中;惯例仍可能演进(append-only 文件有 `superseded` 生命周期,读取端容忍让旧安装不受影响)。

## License

[MIT](LICENSE)
