# Claude Code mod——把 flightwake 的状态带进 session 里

> English:[mod.md](mod.md) · 繁體中文:[mod.zh-TW.md](mod.zh-TW.md) · 日本語:[mod.ja.md](mod.ja.md)

**可选附加组件,只支持 Claude Code。** `init` 默认不会安装它,要加 `--mod`(或在 `setup` 里回答是)。

## 它是什么

`flightwake-mod` 是一个由函数 hook 组成的 Claude Code 插件(mod)。Codex 与 Gemini CLI 没有对应的东西;flightwake 的其他部分
(skill、Stop hook、底部仪表)无论有没有它,行为都一样。**`.flightwake/` 里的 Markdown 仍然是唯一的事实来源。**

它读取这些东西:`.flightwake/`、git 状态(一律用 `git --no-optional-locks`,所以不会改写 `.git/index`)、CLAUDE.md /
.claude/CLAUDE.md / CLAUDE.local.md 里 flightwake 与 roles 的标记区块、AGENTS.md / GEMINI.md 里的 flightwake 标记(只读语言)、
`package.json` 的 scripts、当前生效的 `statusLine` 设置、`spend` 用到的本 session 自己在 `~/.claude/projects/` 下的 transcript(只加总 token),
以及 `fleet` 用到的 `<base>/sessions/*.json` 里的 session 文件(见下方「session 状态上报」)、别的 session 在 `~/.claude/projects/` 下的
transcript 是否还在(只看存不存在,而且只认那个 session 自己的 transcript 路径),和 `<base>` 是不是记录文件夹或位于 git repo 里
(`<base>/STATE.md`,以及 `<base>` 和其上层各文件夹的 `.git` 与 `.flightwake/STATE.md`;只看存不存在),还有 repo 根目录与 `<base>/sessions`
实际落在哪里(会跟着链接走的 `stat`)。不联网。

它**绝不写 repo 里的东西,也不写你的记录**(STATE / DECISIONS / TRAPS / records / ROLES.md);状态是每个 session 各自一份(`$.state`),
只有一个例外:**它唯一的写入是每个交互 session 一个文件 `<base>/sessions/<id>.json`,放在 repo 外**(`fleet` 功能;`<base>` 是绝对路径的
`FLIGHTWAKE_HOME`,否则是 `~/.flightwake`)。`<base>` 落在 session 的 repo 里、是 flightwake 记录文件夹、或位于任何 git repo 里时,什么都不写。
它里面出任何错都会悄悄降级,不打扰你。在没有 `.flightwake/STATE.md` 的文件夹里,它什么都不做。显示语言跟随安装时记录在指令文件标记里的语言。

## 加载条件

必须全部满足,mod 才会加载:

- Claude Code **2.1.287 或更新版本**。
- Claude Code 从项目的 `.claude/skills/flightwake-mod/` 把它当作 `flightwake-mod@skills-dir` 加载——而且只在你接受该文件夹的工作区信任提示之后(第一次打开时会出现)。
- session 必须从 repo 根目录启动;从子目录启动不会加载。
- 如果你的个人目录里有同名插件,它的优先级高于项目里的这一个。

## 安装、更新与移除

```bash
npx flightwake setup          # 附加组件清单第 2 行,选了 Claude Code 才列出,预选(*)
npx flightwake init --mod     # 直接安装
npx flightwake update --mod   # 给既有安装加上 mod,其他选项沿用
npx flightwake update         # 只刷新已安装的 mod
npx flightwake uninstall      # 只移除发行的文件;你自己加的文件保留
npx flightwake doctor         # 检查安装状态
```

- **`setup`**:附加组件是一题清单(Enter = 标 `*` 的、输入编号 = 就是这些、`0` = 都不要)。选了 Claude Code 时 mod 是第 2 行、预先标 `*`,并用白话说明:需要 Claude Code 2.1.287 以上;从 repo 根目录启动、接受文件夹信任后才会加载;已经开着的 session 要重开。`claude --version` 报告较旧的版本时,这一行会说明并且不预选;读不到版本(没有 `claude`,或 5 秒内没响应)时保持预选。
- **`init --mod`**:安装它。如果这次设置的 agent 里没有 Claude Code,会打印一条说明并跳过 mod(不算错误)。如果该文件夹已经存在,`init --mod` 会跳过,除非加 `--force`。
- **复制了什么**:插件的 manifest(`.claude-plugin/plugin.json`)、`hooks/` 与 `types/`——不含它的测试与开发脚本。
- **`update`**(以及 `init --force`)只在已经安装 mod 的地方刷新,逐个文件进行;你自己加在 `.claude/skills/flightwake-mod/` 里的文件会保留。单纯的 `update` 不会替你新增 mod;`update --mod`(或在已安装的 repo 跑 setup → 「升级并加装附加组件」)才会加上,并沿用你其他的选项。选了 Claude Code 却没装 mod 时,`update` 与 `init` 结尾会多打印一行说明;在有人要求之前什么都不加(输出明写要 agent 先问用户)。
- **`uninstall`**:只移除 flightwake 发行到这里的文件,以及因此变空的文件夹。`.claude/skills/flightwake-mod/` 里的其他东西(你自己加的文件、Claude Code 写的文件)会保留,并在输出列出;flightwake 发行的是文件、那个位置却是目录时,也原样保留并列出,绝不递归删除。`uninstall --purge` 只针对 `.flightwake/`,也不会删它们。
- **`--private`**:mod 文件夹会进入 `.git/info/exclude` 的区块;如果该文件夹已被 git 跟踪,`--private` 会在写入任何东西之前拒绝(与其他 private 要求相同)。之后在 private 安装上用 `update --mod` 补装,会保持 private,并把它加进 exclude 区块。

### doctor 检查什么

`doctor` 会报告 mod 是否已安装(可选项,没装不算问题)。已安装时它检查:

- manifest 存在且能解析;
- `hooks/hooks.json` 以及它指到的模块都存在;
- 每个随包发布的文件都在;
- 已安装的版本与包里的版本一致(不一致会给出警告,并指向 `update`);
- 随包发布的文件有没有被手动改过(警告;`update` 会还原)。

如果能执行 `claude --version`,会拿它与 2.1.287 比较(更旧是警告;读不到只是提示,绝不算失败)。**`doctor` 看不到文件夹是否已被信任、session 是否从 repo 根目录启动**——它会明说这一点。请在 Claude Code 里确认 mod 真的加载了(跑 `/fw-mod`)。

## 七个功能,各有开关

七个功能各自独立开关(插件选项):六个默认开启,角色守门默认关闭。开关在 Claude Code 的 `/config`,或写进你的*用户*设置:

```json
"pluginConfigs": { "flightwake-mod@skills-dir": { "options": { "<开关>": true } } }
```

插件选项不读项目设置,所以安装程序没办法替你设置。

| 开关 | 默认 | 做什么 |
|---|---|---|
| `stateInject` | 开 | session 开始时,把 `.flightwake/STATE.md`(每个 session 只取一次快照)加进 system prompt,并附一句说明:这是上次收尾时的状态,仍要检查 git。STATE 还是未填的模板时,改为一行「请运行 cold start」的提示。超过 6000 字符时,注入 frontmatter、「进行中」与「下一步入口」两节以及文件路径,并提示去精简 STATE,而不是粗暴截掉前 N 个字符。它不取代 `fw-coldstart`(落后检查与读最近一份 record 仍是 skill 的工作)。 |
| `band` | 开 | 输入框上方的一行:健康颜色、STATE 落后数(与 Stop hook 检查用同一个算法;机器人 commit 不算)、上下文用量、token 与费用(见 `spend`),以及建议的下一个命令。没有生效的底部仪表时,band 一直显示,Claude Code 回报了上下文百分比就一直带着它;不再等到 60%,一切正常也不会消失,它代替仪表。颜色门槛不变(≥60% 黄、≥80% 红),上下文到 80% 时弹一次提示。STATE 还是未填的模板时,健康显示为 `?`,并提示「STATE 尚未初始化——先跑 /fw-coldstart」。当 flightwake 的底部仪表(`statusline.mjs`)就是生效的状态栏时,band 会隐藏仪表已经显示的字段并保持安静;80% 的提示仍会弹出。 |
| `recorder` | 开 | session 飞行日志:改动的文件、shell 命令推断出的改动(单独一节)、commit、以及识别出的测试命令与结果。`/fw-log` 以本地时间(附 UTC 偏移,后面再列 UTC)把它打印出来,供 `fw-record` 当作 `tests:` 证据与改动清单。它从不写 record。 |
| `tripwire` | 开 | 当 agent 编辑的文件或执行的命令符合某个有效 TRAPS 条目的可选 `paths` / `commands` 字段时,每个 session 只向 agent 显示一次该条目的要点与可信度——在工具执行*之后*(它保护的是下一次尝试,不是这一次)。绝不阻止。`probable` / `suspected` 条目会标示为线索,不是结论。 |
| `roleGuard` | 关 | 对这个文件夹里 Claude 座位的角色,角色内文(ROLES.md)中的 `deny-write: [globs]` 行会变成对主 session 的 `Edit` / `Write` / `NotebookEdit` 写入这些路径的拦截,提示会说明角色、规则以及改做什么。只有用户本人能在输入框输入 `/fw-role-release` 为本 session 放行;放行期间状态栏持续显示。细节见 [roles.zh-CN.md](roles.zh-CN.md) 的「可选:Claude Code mod 的角色守门」一节。 |
| `spend` | 开 | 本 session 用了多少 token、换算成 API 牌价是多少钱。金额是 Claude Code 自己的账(与 `/cost` 相同,按 API 牌价计;订阅用户不会另外被收这笔);token 从 `~/.claude/projects/` 下的 session transcript 加总,每次 API 响应只算一次(子 agent 有自己的 transcript,不计在内)。显示在 band 最后一栏(`1.2M tok · ≈$4.99`)——底部仪表是生效中的状态行时,仪表会显示同一栏、band 保持安静——以及 `/fw-mod` 的一行;`/fw-cost` 打印明细(未缓存输入/写入缓存/读取缓存/输出)。每回合结束后更新。 |
| `fleet` | 开 | 把本 session 的状态——工作中、等你回复、闲置或已结束——上报到 repo 外的 `<base>/sessions/<id>.json`,供 `/fw-fleet`、`npx flightwake fleet`、底部仪表的 `⛔` 字段使用,并在某个 session 意外中断后提示一次 `claude --resume`。只限交互 session;绝不写 prompt 或命令内容。见下方「session 状态上报」。 |

### tripwire 用到的 TRAPS 字段

两个字段都是可选的;没有它们的旧条目只是不会被匹配:

```yaml
paths: ["src/db/**", "*.sql"]            # repo 相对的 glob(不含 / 的样式会匹配任意深度的该文件名)
commands: ["npm run migrate", "psql"]    # 命令前缀,逐个 token 比对
```

不支持正则。已被取代(superseded)的条目永远不会被匹配。

## session 状态上报(`fleet`)

每个交互 session 把一件事——**它需不需要你**——上报到 repo 外的一个小文件,让你一次看到所有 Claude Code session:哪个在等你回复、
哪些在跑、哪些闲置、哪些意外中断可以接回去。读它的有 `/fw-fleet`、`npx flightwake fleet`、底部仪表上的 `⛔` 字段,以及其他工具
(Orca),通过下面的「session 文件契约」。

**状态。** `working`(回合进行中,或手动 `/compact`)、`blocked`(等你回复)、`idle`(回合之间)、`ended`(session 已结束,附原因)。
只有以下情况才算 `blocked`:

- **权限对话框**开着——交互 session 里,一个下层没有答掉的 `PermissionRequest`(没有任何 settings hook 给出决定)。单单一个 `ask`
  判定不算:auto 模式、分类器或 headless 决策者都不会问人,所以永远不会显示成 blocked;
- 或主循环有 **`AskUserQuestion` 或 `ExitPlanMode`** 正在进行。子 agent 的提问不算;子 agent 的权限对话框算(标成 `(子 agent)`)。

**放在哪里。** `<base>/sessions/<session id>.json`。`FLIGHTWAKE_HOME` 设成**绝对**路径时 `<base>` 就是它,否则是 `$HOME/.flightwake`
(Windows 是 `%USERPROFILE%\.flightwake`)。空的或相对的 `FLIGHTWAKE_HOME` 会被忽略。`npx flightwake init --mod`、`update --mod` 与 setup 的「升级并加装附加组件」
在 `<base>/sessions` 不存在时以权限 `0700` 创建它(已有的文件夹绝不改权限,遇到 symlink 就拒绝);如果是 mod 先创建文件夹,文件权限跟随你的 umask(通常 `0644`)。

**什么时候写。** 状态改变时、`/clear` 或 `/resume` 之后接手新 id 时,以及每 30 秒一次心跳。普通的工具调用、prompt 或命令绝不触发写入——
大约每回合 2 次、每个对话框 2 次、每 30 秒 1 次。每次都整个文件重写。

**绝不写的东西。** prompt 文本、Bash 命令文本、提问/选项/计划文本、URL、查询、样式、repo 外的任何路径、权限的 `tool_input`、MCP 消息、
git remote 或 branch、模型、费用、上下文百分比。文件里只有 id、repo 路径、工具名称、Edit / Write / MultiEdit / Read / NotebookEdit
的 repo 相对路径、时间与计数。

**什么时候完全不写。** 每一种都会在 `/fw-mod` 显示为闲置原因,其他功能不受影响:

- `-p` / SDK 运行(没有人能回复,而且 CI 会灌爆文件夹);
- 找不到主目录(`HOME` / `USERPROFILE` 都没设,或不是绝对路径);
- `<base>` 落在**这个 session 的 repo 里**——请把 `FLIGHTWAKE_HOME` 设成 repo 外的绝对路径(每次写入前都会再检查:repo 根目录会跟着 `/cd` 与 worktree 移动)。也看实际路径,所以 `<base>` 上层有链接通进 repo 也算;拿不到实际路径时什么都不写;
- `<base>` 是 flightwake 记录文件夹(里面有 `STATE.md`:装在 `$HOME` 的 repo,或 `FLIGHTWAKE_HOME` 指到某个 repo 的 `.flightwake`),或位于**任何 git repo 或 flightwake 根目录**里(`<base>` 或其上层有 `.git` 或 `.flightwake/STATE.md`,实际路径也查)——文件会出现在那个 repo 里,它的 `uninstall --purge` 也会碰到。查不到答案的探测一律算命中;
- `<base>`、`sessions` 文件夹或文件本身是符号链接(绝不通过它写入;每次心跳都会再检查;查不到答案就当成链接);
- 文件已存在但不是 flightwake 的 session 文件(不动它;每次心跳都会再检查,之后才放上去的也不会被覆盖);
- session id 不能当文件名;
- 写入失败——下次状态变化时重试。

没有 `.flightwake/STATE.md` 的文件夹:没有文件、没有计时器、没有命令、没有提示。

**开关。** `fleet`,默认开。在同一个 `pluginConfigs` 键下设 `"fleet": false` 就关掉;已经写出的文件之后会变成失联(可能被当成接回候选
提示一次)——`npx flightwake fleet --prune` 可删掉。

### `/fw-fleet`

只读。列出近 7 天的 session 文件(最新 200 个),等你回复的排最前(等最久的在前),接着是工作中、闲置、失联、已结束(已结束最多 10 行);
`/fw-fleet all` 放宽到 30 天。心跳超过 120 秒的 session 显示为**失联**,绝不显示成工作中或等你回复。读不了的文件(正在写入或已损坏)在页脚计数;
格式不明、时钟比你快 60 秒以上、或两个进程共用同一个 session,一律显示为「不明」。失联的 session,以及已结束的 session——正常退出、登出或意外结束都算,
但 `/clear`、`/resume` 之后的不算(那个进程已换成另一个 id 继续)——只要至少跑过一个回合、而且 transcript 还在,就会附上接回命令。
(一次性的「接回提示」比较窄:只针对意外中断。)

```
## /fw-fleet

**3 个进行中 · ⛔ 1 个等你回复 · 1 个可接回** — ~/.flightwake/sessions(近 7 天)

| 状态 | session | repo | 持续 | 细节 |
|---|---|---|---:|---|
| ⛔ 等你回复 | `3f9a2c1e` | api | 2m | 权限确认 · Bash |
| ● 工作中 | `8b21d0aa`(本 session) | flightwake | 12s | Edit src/a.ts |
| ● 工作中 | `c0ffee12` | orca ⎇ feat-x | 1m | Read(子 agent) |
| ○ 闲置 | `77aa0b3c` | web | 5m | 已回复 |
| ◌ 失联 | `1234abcd` | flightwake | 2h | 没有心跳(原本工作中)——崩溃或睡眠中? · `claude --resume 1234abcd-…` |
| – 已结束 | `deadbeef` | web | 1d | 已退出 |

另有 2 个较旧的已结束文件未列出——`/fw-fleet all` 显示 30 天。
只读:/fw-fleet 不改任何东西。`npx flightwake fleet --prune` 会删掉 7 天前已结束/失联的文件。
```

`orca ⎇ feat-x` 是 repo `orca` 的一个 worktree(`feat-x`)。如果那个 session 是在别的文件夹启动的,接回命令前面会加上 `cd '…' && `——
`claude --resume` 必须在 session 启动的位置执行。

### `npx flightwake fleet`

在终端里看同一份清单,任何文件夹都能跑(不需要 repo;不执行 git)。除了 `--prune` 之外都是只读。

```
npx flightwake fleet                     # 文本,等你回复的排前面
npx flightwake fleet --json              # 给工具用的单个 JSON 对象(只增不改,与文件相同)
npx flightwake fleet --all               # 30 天,已结束不设上限
npx flightwake fleet --root=/abs/path    # 只列 repo 或主工作树是这个路径的 session
npx flightwake fleet --prune [--days=N] [--dry-run]   # 删掉超过 N 天(默认 7)的已结束/失联文件
```

`--lang=` 指定语言(否则用当前文件夹的 flightwake 语言,再否则英文)。接回命令一律带 `cd '…' && ` 前缀。`--prune` 只动文件夹里直接放着的
普通 `<id>.json` 文件:结束时间超过 N 天的已结束文件、最后心跳超过 N 天的失联文件,或在那之前最后修改的、我们自己写到一半的文件(开头是 `{"schema":"flightwake.session/`)
或不认得版本的 `flightwake.session/` 文件;不是我们的文件(其他任何 JSON)绝不删,120 秒内修改过的文件绝不删,文件夹本身也不删。文件夹位于 repo 或记录文件夹里时,
它会拒绝(exit 1,什么都不删)。这是 `<base>/sessions` 里**唯一**的删除途径:`npx flightwake uninstall` 与 `--purge` 都保留这个文件夹(所有 repo 共用),
并打印一行说明。

### 底部仪表的字段

当另一个 session 已经等你回复至少 2 秒、而且心跳还活着,底部仪表(`statusline.mjs`)会在品牌名后面显示一个红色字段(放在第二栏,截断时也留得住):
一个时是 `⛔ api 等你回复`(repo 名称,最多 16 字符),多个时是 `⛔ 2 个 session 等你回复`。你自己的 session 永远不计。它只读 120 秒内修改过的文件,
不写入、不联网。

### 接回提示

新 session 开始时(重新加载、`/clear`、`/resume` 都不算),最多一次:如果**同一个 repo 文件夹**里有个 session 在近 7 天内意外中断——心跳失联
(崩溃、`kill -9`、断电),或以原因 `other` 结束——至少跑过一个回合、transcript 还在、而且之后没有人在那个文件夹开过新 session,就弹一条提示
附上命令:

```
flightwake:这个 repo 有个 session 在 2h 前意外中断(当时工作中)。接回去:claude --resume 1234abcd-… — /fw-fleet 列出全部
```

正常的 `/exit`、`/clear`、`/resume` 或登出绝不触发。「只提示一次」靠文件本身判断:那个文件夹有更新的 session 启动过,候选就作废——不另外存储任何东西。

### session 文件契约

schema `flightwake.session/1`。JSON(`JSON.stringify(rec, null, 2)` 加一个换行)、UTF-8,通常小于 1.2 KB,每次写入整个文件重写。每个字段一律存在;
`null` 表示不明,绝不用假的 0。时间是 epoch 毫秒。

| 字段 | 含义 |
|---|---|
| `schema` | `"flightwake.session/1"` |
| `mod` | 写入者的 mod 版本 |
| `sessionId` | session id;等于文件的主文件名 |
| `instance` | 每个进程一个的写入者记号(热重载后不变) |
| `state` | `working` / `blocked` / `idle` / `ended` |
| `why` | 上次状态改变的机器可读原因(例如 `permission-dialog`、`turn.complete:answer`、`adopt:clear`);心跳不改它 |
| `stateSince`、`seq`、`heartbeatAt`、`heartbeatMs` | 状态上次改变的时间;每次写入 +1;上次写入时间(结束后冻结);`30000` |
| `startedAt` | 这个进程接手这个 id 的时间 |
| `root`、`repoRoot`、`launchCwd` | session 的工作根目录(跟着 `/cd` 与 worktree 移动);主工作树或 null;session 启动的位置——`claude --resume` 必须在这里执行 |
| `lang`、`surface` | 显示语言;`terminal` 等,或 null |
| `blocked` | null,或 `{kind: permission / question / plan, tool, target, agent, since}`——恰好在 `state` 为 `blocked` 时不是 null;取最早开始的等待 |
| `activity` | null,或 `{tool, target, agent, at}`——最近开始的工具调用 |
| `inFlight`、`turns` | 当前正在跑的工具调用数;到目前为止的回合数 |
| `lastTurn` | null,或最后一个主循环回合的 `{reason, at, durationMs}` |
| `ended` | null,或 `{reason, at, stateAtEnd}`——`reason` 是 Claude Code 的 session 结束原因或 `id-changed` |
| `resume` | `{id, resumable}`——`resumable` 表示至少跑过一个回合 |
| `transcript` | transcript 路径,或 null |
| `parent` | null,或 `{sessionId, via: clear / resume / fork / id-changed}`——同一个进程里被这个 session 取代的那一个 |
| `contested` | 两个进程共用同一个 id 时为 true |
| `host` | 只有环境变量有设的键:`orcaTerminal`(`ORCA_TERMINAL_HANDLE`)、`orcaWorkspace`(`ORCA_WORKSPACE_ID`)、`tmuxPane`(`TMUX_PANE`) |

`target` 是 Edit / Write / MultiEdit / Read / NotebookEdit 在 repo 内的 repo 相对路径,否则为 null;子 agent 发出的调用 `agent` 为 true。

读取端的规则:

- v1 **只增不改**。忽略不认识的字段;缺少的字段当成 null;不认识的 `state` 或 `kind` 一律当成 `unknown`;主版本不认识时显示 `unknown`,
  附上 id 与心跳。
- 解析失败是暂时的(写到一半):这一轮跳过该文件,沿用上次的正确值。
- **失联:**`now − heartbeatAt > max(4 × clamp(heartbeatMs, 5000, 600000), 90000)`,没有 `heartbeatMs` 时用 30000(目前是 120 秒)。失联的文件绝不算工作中或等你回复。`contested: true`,
  或 `heartbeatAt` 比现在晚 60 秒以上,算 `unknown`。
- 等你回复的**通知**只在 `now − blocked.since ≥ 2000` 时发,以 `${sessionId}:${blocked.since}` 去重。
- 删除只通过 `npx flightwake fleet --prune`。

给 Orca 与其他工具的建议:

- 监视文件夹(`fs.watch`,200 ms 去抖动,5 秒轮询备援),只重读有变的文件。不要每次轮询都执行 `npx flightwake fleet --json`。
- 以 `host.orcaTerminal` 对应到窗格,没有时退回 `root` / `launchCwd`(`heartbeatAt` 最新者优先)。
- `/clear` 之后沿着 `parent.sessionId` 接续。
- 接回按钮:在 `launchCwd` 执行 `claude --resume ${resume.id}`。

## 查看它在做什么:/fw-mod

`/fw-mod` 是只读命令:逐一列出七个功能是开启、关闭还是闲置,原因,以及怎样让它生效(含本 session 的 token 与 API 等值费用一行;明细用 `/fw-cost`)。例如:band 因为检测到底部仪表而隐藏;tripwire 开着但闲置,因为没有任何有效 TRAPS 条目带 `paths` 或 `commands`;角色守门关闭(并告诉你怎么打开),或开着但闲置,因为这个文件夹的座位没有角色、或没有 `deny-write`;本 session 已注入 STATE,或因为 STATE 未初始化而只注入了「请先跑 /fw-coldstart」的提示;本 session 以“闲置”上报在 `~/.flightwake/sessions/…`,或因为是 `-p` 运行、文件夹会落在 repo 里而没有上报。它也会显示 mod 版本、检测到的语言与 profile。它什么都不改,也不属于七个开关之一;只要装了 flightwake 就一直可用。

## 底部仪表与 band 一起用

`setup` 把两者列成同一题清单里的两行(第 1 行仪表、第 2 行 mod),可以只选一个、两个都选或都不选。两者都装时,收尾信息会说明:底部仪表显示健康 / STATE 落后 / 上下文用量;输入框上方的 band 在仪表开着时隐藏这些相同的字段、保持安静,只在上下文偏高时弹一次提示。没有仪表时,band 一直显示并代替它,安装程序的收尾信息也会这么说。选择 mod 绝不会拿掉仪表。

## 安装之后

安装程序会打印:需要 Claude Code 2.1.287+;从 repo 根目录启动并接受信任提示;这个 repo 已经开着 Claude Code 的话,那个 session 看不到 mod——请结束它,从 repo 根目录重新启动 Claude Code(mod 在 Claude Code 启动时加载);怎么自己打开角色守门(上面的 `pluginConfigs` 键,或 `/config`);它不是安全边界;要确认有加载、各功能在做什么,在 Claude Code 里跑 `/fw-mod`。

## 已知限制

- **`/fw-log` 里的「pass」**的意思是:直接调用的、可识别的测试运行器以可识别的方式运行并返回 0。它看不到配置文件或环境里让测试根本不执行的设置(例如 pytest.ini 里的 `addopts`、跳过测试的构建 profile),也不保证测试检查的内容。凡是它无法证明的,都记为「unknown」并附上 exit code,不记为 pass。
- **`/fw-log` 里 shell 推断的改动可能不完整**:它们是从命令推断的(repo 内 `>`、`>>` 的输出目标,以及 `cp`、`mv`、`rm`、`tee`、`sed -i`),单独列出并标明这一点;脚本、其他程序或 git 造成的写入看不到。「agent 改动的文件」仍只含 Edit/Write/NotebookEdit 工具回报的。
- **只列出能确认的路径——可能漏记,但不该错记。** 每个命令按它自己的参数语法读取,参数值(sed 的 `-e`/`-f` 脚本、cp 的 `-t`/`-S`)不会被当成路径;相对路径只在工作目录确定时解析(一开始,或开头的 `cd 目录 &&` 之后),其他任何 `cd` 之后就不猜;repo 外的路径不记;候选路径还要在命令执行后由 git 确认在 repo 内有变更才列出。不是 git repo 就什么都不列。(踩坑绊线刻意做相反的取舍:它只是提示,宁可多提示;记录是记录,宁可漏记。)
- **与其他命令串在一起运行的测试记为 unknown**:例如 `echo … && npm test 2>&1; echo exit=$?`,只看得到整串命令的 exit code,所以不能当作通过的证据。每个 session 会给 agent 一次提示(附在该工具结果上),只是说明这一点、不阻止任何事;需要证据时,请单独再跑一次该测试命令。
- **角色守门不是安全边界**:Bash 与其他工具不检查,子 agent 不检查,被禁止路径的 symlink 或其他别名也拦不到。
- **tripwire** 在无法确定工作目录时(例如 `||` 之后的 `cd`、子 shell 里),会在候选目录下逐一比对——最多 16 个,超过就改为比对路径的尾段——所以可能多提示一些。
- **session 状态上报:权限对话框可能停留过久。** 没有事件标示「对话框已回复」:你批准之后,工具在同一个调用里执行,所以 session 会一直是 `blocked`,直到工具跑完。在终端里,工具的进度标示一画出来就会解除;MCP 工具与 WebFetch 会一直等到跑完。「持续」栏从 `blocked.since` 起算,界面上写的是「权限确认」,不是「对话框开着」。
- **桌面版、VS Code 与 Remote Control 上的 session 状态上报尚未验证。** 那些环境若不发出权限事件,对话框会显示成工作中——是漏报,不是误报。
- **session 状态上报与同步的主目录:** 另一台机器上进行中的 session 看起来也是进行中(文件里没有主机名)。
- **两个进程共用同一个 session id**(例如在两个终端各跑一次 `claude --resume <id>`)会显示为「不明」。其中一个结束而另一个还在时,文件最多有 30 秒显示已结束,直到另一个的下一次心跳。
- **session 中途关掉 `fleet`**:文件会变成失联,可能被当成接回候选提示一次。`npx flightwake fleet --prune` 可删掉。
- **策略面。** 有 `fleet` 时,hooks 模块会用到 `fs.write`、`fs.list` 与六个环境变量读取(`FLIGHTWAKE_HOME`、`HOME`、`USERPROFILE`、`ORCA_TERMINAL_HANDLE`、`ORCA_WORKSPACE_ID`、`TMUX_PANE`)。拒绝会写文件插件的受管策略会拒绝**整个** mod,不只这个功能。
- 只支持 Claude Code,需要 2.1.287+、已接受的文件夹信任提示,并从 repo 根目录启动。
- 只在一个真实的 Claude Code session 里验证过一次(前五个功能都生效)。**尚未在真实 session 里验证**:`spend` 功能、重启后恢复 session、compaction 之后的行为、80% 提示、桌面版 / VS Code 的外观,`/config` 是否列出这些选项(文档如此描述),以及整个 `fleet` 功能(发版前必须在真实 session 里验过对话框、auto 模式、AskUserQuestion、`/clear`、`/exit` 与 `kill -9` 各情况)。
