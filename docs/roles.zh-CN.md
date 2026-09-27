# 团队角色——/clear 之后,每个 agent 仍然知道自己是谁

> English:[roles.md](roles.md) · 繁體中文:[roles.zh-TW.md](roles.zh-TW.md) · 日本語:[roles.ja.md](roles.ja.md)

**可选附加组件,flightwake v0.14.0 起。** `init` 永远不会安装它。

## 它解决什么问题

你带一支小型 agent 团队,例如 Codex 当项目经理、Claude 当技术负责人、Claude 写代码、Codex 审代码。你在对话里
告诉每一个它的角色。接着有人跑了 `/clear`(或开了新 session),角色就没了。项目经理醒来,在 STATE 读到
「下一步:修 X」,然后做了任何有能力的模型在没有其他指示时都会做的事:自己动手修 X。没有人派活,也没有人审核。

团队跑一阵子之后,还会冒出两个问题:

- **有些角色只在某些阶段需要。** 安全审查、UI 设计、发版在后期才重要,但你不想让它们从第一天就占掉一个 agent。
- **职责会漂移。** 技术负责人最后在做平台的文书工作;角色文字应该干净地跟着改。

## 两个概念:座位与待命角色

**座位**是一组(文件夹, 厂牌)。座位上的角色写在该厂牌**每次 session 开始都会读**指示的地方——不是放在对话里,
也不是放在 STATE(STATE 讲的是现在在发生什么,不是你是谁):

| 厂牌 | 每次 session 开始(以及 /clear 之后)都会读 |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |

Claude Code 不读 `AGENTS.md`,Codex 也不读 `CLAUDE.md`(已在 Claude Code 2.1 与 Codex 0.157 验证),所以在一个
有一个 Claude 和一个 Codex 的文件夹里,光靠文件名,每个 agent 就知道哪个角色是自己的。这也是唯一的限制:
**每个文件夹、每个厂牌只有一个座位。** 长期存在的角色坐座位——pm、技术负责人、coder、reviewer。

**待命角色**没有座位,也没有数量限制。`roles apply` 会在每个有座位的(文件夹, 厂牌)里,把它生成为原生的
agent 定义:

- Claude Code:`.claude/agents/fw-<id>.md`
- Codex:`.codex/agents/fw-<id>.toml`

需要它的时候:

- **同一厂牌、短任务** → 坐在座位上的 agent 召唤原生 agent `fw-<id>`(例如 coder 叫出 `fw-security`)。
- **不同厂牌,或较长的任务** → 项目经理派出一个 worker,任务开头放上 `npx flightwake roles card <id>` 生成的
  角色卡。角色卡写着「这次任务,请担任这个角色」,并覆盖 worker 落脚文件夹的座位角色;repo 共用的规则照样适用。

特定阶段才需要的角色(security、designer、release、qa)一开始先待命。每个都可以带一段 `### When to call`,它会出现在
每个座位的团队清单里——所以项目经理每次 session 开始都会重读这些触发条件。

## 快速开始

```bash
npx flightwake roles                  # install the fw-roles skill into this repo
```

然后对你的 agent 说:**「运行 fw-roles」**(Claude Code:`/fw-roles`,Codex:`$fw-roles`)。它会:

1. **扫描**项目——README、依赖清单、目录结构、测试、部署、`.flightwake/STATE.md`——并问你团队横跨哪些文件夹、手上有哪些 agent。
2. **推荐** 3–4 个座位与一些待命角色,从九个 preset 里挑——核心 `pm`、`tech-lead`、`coder`、`reviewer`;视需要 `qa`、`researcher`;有条件才推荐 `release`(会部署上线)、`security`(涉及登录、支付、个人资料)、`designer`(有前端界面)——每个都附一句联系到你项目的理由。
3. **预览**:座位表、待命角色与何时叫它们,再列每个角色的*你做 / 禁止 / 交给谁*。
4. **定制**你说的任何地方(「reviewer 可以自己修错别字」),并写进 `.flightwake/ROLES.md`。
5. **应用**:先展示 `npx flightwake roles apply --dry-run`,你确认后再执行 `npx flightwake roles apply`。
6. **验证**:对每个座位开一个新 session,问一个诱饵问题(「有个按钮有错别字——你是谁?下一步做什么?」),再实际叫一次某个待命角色。

**禁止**清单最重要。测试中,让项目经理持续派活而不是自己写代码的,是这几句:「永远不写产品代码;一旦冒出
『我顺手改一下更快』,就改成派活」。定制时,把禁止事项改写成有边界的例外,而不是整条删掉。

## ROLES.md

每个团队一份文件,放在项目经理工作的那个 repo 里。第一个角色之前的文字是说明。

```markdown
# 团队角色

## pm — 项目经理
**你做**
- 排优先级,把工作拆成有边界的任务,派活,验收结果。

**禁止**
- 写或改产品代码。

**交给谁**
- 实现 → coder;审核 → reviewer。

## security — 安全审查
**你做**
- 审查涉及登录、密钥、支付、个人资料的变更。
### When to call
- 变更涉及登录、权限、密钥、支付、个人资料。

## seats
| repo | vendor | role |
|---|---|---|
| . | codex | pm |
| ../app | claude | coder |
| ../app | codex | reviewer |
```

- `## <id> — <标题>` 开始一个角色。角色内文用粗体或 `###`,绝不用 `##`。
- `## seats` 是一张表:`repo` 相对于本 repo 根目录(绝对路径、`~/` 与空格都可以),`vendor` 是
  `claude`、`codex` 或 `gemini`,`role` 是角色 id。一个角色可以占好几个座位;没有座位的角色就是待命角色。
- 没有座位表的旧文件(每个角色带着 `agent:` / `repo:` 行)照旧可用;`roles assign` 会要你先迁移,
  fw-roles skill 会附完整预览帮你迁移。

## 横跨多个 repo 的团队

规划 repo 与实现 repo 可以共用一支团队:ROLES.md 放在其中一个,`apply` 会写进座位表里的每一个 repo。每个生成的
区块都记录了来源在哪(`src=`),所以在成员 repo 里执行 `npx flightwake roles apply` 会找到同一份 ROLES.md,
得到同样的结果。apply 碰过的**每一个** repo,都要 commit 被改动的文件——指令文件、`.claude/agents/`、
`.codex/agents/`,以及 ROLES.md 旁边的 `.flightwake/roles-manifest.json`。

## 换座位:`roles assign`

```bash
npx flightwake roles assign ../app:codex release --dry-run   # preview
npx flightwake roles assign ../app:codex release             # edit that one seats cell, then re-apply
npx flightwake roles assign ../new:claude designer --add     # a seat that doesn't exist yet needs --add
```

`assign` 只改座位表里的那一格——注释、角色内文、顺序都不动——而且如果 ROLES.md 在它规划期间被改过,它会拒绝
写入。变更在每个 agent 的**下一个新 session** 生效;在那之前,运行中的 session 与 worker 维持原本的角色。
在 DECISIONS 加一行说明原因(fw-roles skill 会做)。

## apply 写了什么,以及它绝不覆盖什么

- **座位区块**,位于每份指令文件**最上方**,夹在 `<!-- flightwake-roles:begin … -->` 与
  `<!-- flightwake-roles:end -->` 之间:角色、一句说明此区块会在 /clear 后重新加载且是*主 session* 的角色、
  你的角色内文、团队清单(座位、待命角色与何时叫它们、「← you」),以及一行说明用户的直接指示视同派活。
  标记以外的内容一律不动。
- **原生待命定义**,位于 `.claude/agents/` 与 `.codex/agents/`,每一份都标记为生成物。
- **一份 manifest**(`.flightwake/roles-manifest.json`),列出每一个生成的输出与它的 hash。

apply 只会改写或删除仍与它当初生成的内容一致、或已经等于新内容的输出。你自己写的同名文件、你手动改过的生成文件,
或另一支团队的输出,都算**冲突**:apply 会列出来,什么都不写。当一个角色或整个 repo 从 ROLES.md 离开,它的旧区块
与定义会通过 manifest 清掉。改 ROLES.md,不要改生成的输出。

## 命令

| 命令 | 做什么 |
|---|---|
| `npx flightwake roles` | 在 `.claude/skills/` 安装(或刷新)`fw-roles` skill;repo 有 `AGENTS.md` 或 `GEMINI.md` 时也装进 `.agents/skills/` |
| `npx flightwake roles apply --dry-run` | 显示哪些会新增、更新或清掉——以及确切的区块;什么都不写 |
| `npx flightwake roles apply` | 把 ROLES.md 渲染进团队中每个 repo;清掉过时的输出 |
| `npx flightwake roles card <id>` | 把一个角色以派活卡形式打印到 stdout(出错时:stdout 无输出,消息写到 stderr,非零退出码) |
| `npx flightwake roles assign <repo>:<vendor> <id> [--add] [--dry-run]` | 把一个角色放上一个座位 |
| `npx flightwake roles remove` | 从本 repo 删除角色区块、生成的 agent 与 skill;ROLES.md 保留 |
| `npx flightwake update` | 只在已经安装的地方刷新 skill |
| `npx flightwake uninstall` | 也会删除角色区块、生成的 agent 与 skill;ROLES.md 和你其他的记录一样保留 |

## 限制——请先读这段

- **角色是指引,不是权限。** 它改变的是 agent 选择做什么,不会拦下工具调用。我们测过:定义为只读的 Codex
  自定义 agent,从可写入的 session 召唤出来时照样会写文件。flightwake 生成的任何东西都不声称能强制执行什么。你真正的
  防护(审核、分支保护、工具本身的权限设置)要继续保留。
- 每个文件夹、每个厂牌一个座位;要更多,就用待命角色或另一个文件夹/worktree。
- preset 与 skill 只提供英文与繁体中文;其他安装语言(包括简体中文)拿到的是英文版。
- Gemini CLI 有座位区块,但还没有原生待命定义。
- **Codex 只在受信任的项目里加载 `.codex/agents/`——而且必须是那个确切的 repo 路径受信任**(受信任的上层文件夹不涵盖里面的 git repo,每个 worktree 路径也各自分开算)。确认方式是实际召唤一次,而不是看文件在不在;带有 Codex 不认识字段的定义会被悄悄丢掉,这就是为什么 flightwake 只写 `name`、`description` 与 `developer_instructions`。
- 角色的「When to call」是告诉 agent 的信息,不会自己触发。座位区块带有明确规则(「任务符合时,就由那个角色做——召唤它或派活给它」),测试中正是这条让 agent 真的去转派。

## 参考过的前例

我们参考过的角色库(只参考、没有复制任何文字):[BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) · [ruflo](https://github.com/ruvnet/ruflo) · [wshobson/agents](https://github.com/wshobson/agents) · [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)。multi-agent-shogun 每个角色的禁止行为清单,跟我们的「禁止」最接近;Gas Town 的长期 crew 与短期 worker 之分,跟我们的座位与待命最接近。
