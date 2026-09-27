# 团队角色——/clear 之后,每个 agent 仍然知道自己是谁

> English:[roles.md](roles.md) · 繁體中文:[roles.zh-TW.md](roles.zh-TW.md) · 日本語:[roles.ja.md](roles.ja.md)

**可选附加组件,flightwake v0.14.0 起。** `init` 永远不会安装它。

## 它解决什么问题

你带一支小型 agent 团队,例如 Codex 当项目经理、Claude 当技术负责人、Claude 写代码、Codex 审代码。你在对话里
告诉每一个它的角色。接着有人跑了 `/clear`(或开了新 session),角色就没了。项目经理醒来,在 STATE 读到
「下一步:修 X」,然后做了任何有能力的模型在没有其他指示时都会做的事:自己动手修 X。没有人派活,也没有人审核。

解法是把角色放在 agent **每次 session 开始都会读**的地方,不是放在对话里,也不是放在 STATE(STATE 讲的是
现在在发生什么,不是你是谁)。每个工具本来就有这样一份文件:

| Agent | 每次 session 开始(以及 /clear 之后)都会读 |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |

Claude Code 不读 `AGENTS.md`,Codex 也不读 `CLAUDE.md`(已在 Claude Code 2.1 与 Codex 0.157 验证;若未来版本
开始两份都读,「← you」标记与关于其他 agent 的说明仍能区分它们),所以在一个有一个 Claude 和一个 Codex 的
文件夹里,光靠文件名,每个 agent 就知道哪个角色是自己的。不需要 hook、不需要启动参数、不需要信任提示。

## 快速开始

```bash
npx flightwake roles                  # install the fw-roles skill into this repo
```

然后对你的 agent 说:**「运行 fw-roles」**(Claude Code:`/fw-roles`,Codex:`$fw-roles`)。它会:

1. **扫描**项目——README、依赖清单、目录结构、测试、`.flightwake/STATE.md`——并问你团队横跨哪些文件夹、手上有哪些 agent。
2. **推荐** 3–5 个角色,从六个 preset 里挑:`pm`、`tech-lead`、`coder`、`reviewer`、`qa`、`researcher`,每个都附一句联系到你项目的理由。
3. **预览**:一张表(角色 / agent / 文件夹 / 职责),再列每个角色的*你做 / 禁止 / 交给谁*。
4. **定制**你说的任何地方(「reviewer 可以自己修错别字」),并写进 `.flightwake/ROLES.md`。
5. **应用**:先展示 `npx flightwake roles apply --dry-run`,你确认后再执行 `npx flightwake roles apply`。
6. **验证**:对每个 agent 开一个新 session,问一个诱饵问题(「有个按钮有错别字——你是谁?下一步做什么?」)。pm、技术负责人或 reviewer 应该把它转派出去,而不是自己修。

**禁止**清单最重要。测试中,让项目经理持续派活而不是自己写代码的,是这几句:「永远不写产品代码;一旦冒出
『我顺手改一下更快』,就改成派活」。定制时,把禁止事项改写成有边界的例外,而不是整条删掉。

## ROLES.md

每个团队一份文件,放在项目经理工作的那个 repo 里。第一个角色之前的文字是说明。

```markdown
# 团队角色

## pm — 项目经理
agent: codex
repo: .

**你做**
- 排优先级,把工作拆成有边界的任务,派活,验收结果。

**禁止**
- 写或改产品代码。

**交给谁**
- 实现 → coder;审核 → reviewer。

## coder — 主力开发
agent: claude
repo: ../app
...
```

- `## <id> — <标题>` 开始一个角色。角色内文用粗体或 `###`,绝不用 `##`。
- `agent:` 是 `claude`、`codex` 或 `gemini`。
- `repo:` 是这个角色工作的文件夹,相对于本 repo 根目录(绝对路径与 `~/` 也可以)。默认 `.`。

## 横跨多个 repo 的团队

规划 repo 与实现 repo 可以共用一支团队。ROLES.md 放在其中一个;`roles apply` 会把每个角色写进它 `repo:`
那行指定的 repo。每个生成的区块都记录了来源在哪(`src=`),所以在成员 repo 里执行 `npx flightwake roles apply`
会找到同一份 ROLES.md,得到同样的结果。apply 碰过的**每一个** repo,都要 commit 被改动的指令文件。

## 唯一的规则:同一文件夹,每个 agent 一个角色

agent 分辨自己的角色,只靠它读哪份指令文件。同一文件夹里的两个 Codex 角色会读到同一份 `AGENTS.md`,所以
`roles apply` 会拒绝并且什么都不写。把第二个角色放到另一个文件夹或 git worktree,或交给另一个 agent。

## apply 写了什么

每个角色变成指令文件**最上方**的一个区块,夹在 `<!-- flightwake-roles:begin … -->` 与
`<!-- flightwake-roles:end -->` 之间:角色标题、一句说明此区块会在 /clear 后重新加载、你的角色内文、整个团队
清单(谁、哪个 agent、哪个文件夹、「← you」),以及一行说明用户的直接指示视同派活。标记以外的内容一律不动。

从 ROLES.md 删除一个角色再重新 apply → 它的区块会被删除。改 ROLES.md,不要改生成的区块——下次 apply 会覆盖它。

## 命令

| 命令 | 做什么 |
|---|---|
| `npx flightwake roles` | 在 `.claude/skills/` 安装(或刷新)`fw-roles` skill;repo 有 `AGENTS.md` 或 `GEMINI.md` 时也装进 `.agents/skills/` |
| `npx flightwake roles apply --dry-run` | 显示哪些文件会变、以及确切的区块;什么都不写 |
| `npx flightwake roles apply` | 把 ROLES.md 渲染进团队中每个 repo 的指令文件 |
| `npx flightwake roles remove` | 从本 repo 删除角色区块与 skill;ROLES.md 保留 |
| `npx flightwake update` | 只在已经安装的地方刷新 skill |
| `npx flightwake uninstall` | 也会删除角色区块与 skill;ROLES.md 和你其他的记录一样保留 |

## 限制

- preset 与 skill 只提供英文与繁体中文;其他安装语言(包括简体中文)拿到的是英文版。
- 不支持同一文件夹里同一个 agent 担任两个角色(见上面的规则)。
- 角色是模型读到的指引,不是沙箱。它改变的是 agent 选择做什么,不会拦下工具调用。你真正的防护(审核、分支
  保护、权限)要继续保留。
