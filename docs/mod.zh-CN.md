# Claude Code mod——把 flightwake 的状态带进 session 里

> English:[mod.md](mod.md) · 繁體中文:[mod.zh-TW.md](mod.zh-TW.md) · 日本語:[mod.ja.md](mod.ja.md)

**可选附加组件,只支持 Claude Code。** `init` 默认不会安装它,要加 `--mod`(或在 `setup` 里回答是)。

## 它是什么

`flightwake-mod` 是一个由函数 hook 组成的 Claude Code 插件(mod)。Codex 与 Gemini CLI 没有对应的东西;flightwake 的其他部分
(skill、Stop hook、底部仪表)无论有没有它,行为都一样。**`.flightwake/` 里的 Markdown 仍然是唯一的事实来源。**

它读取这些东西:`.flightwake/`、git 状态(一律用 `git --no-optional-locks`,所以不会改写 `.git/index`)、CLAUDE.md /
.claude/CLAUDE.md / CLAUDE.local.md 里 flightwake 与 roles 的标记区块、AGENTS.md / GEMINI.md 里的 flightwake 标记(只读语言)、
`package.json` 的 scripts,以及当前生效的 `statusLine` 设置。不联网。

它**绝不写你的记录**(STATE / DECISIONS / TRAPS / records / ROLES.md);它唯一的状态是每个 session 各自一份(`$.state`)。
它里面出任何错都会悄悄降级,不打扰你。在没有 `.flightwake/STATE.md` 的文件夹里,它什么都不做。显示语言跟随安装时记录在指令文件标记里的语言。

## 加载条件

必须全部满足,mod 才会加载:

- Claude Code **2.1.287 或更新版本**。
- Claude Code 从项目的 `.claude/skills/flightwake-mod/` 把它当作 `flightwake-mod@skills-dir` 加载——而且只在你接受该文件夹的工作区信任提示之后(第一次打开时会出现)。
- session 必须从 repo 根目录启动;从子目录启动不会加载。
- 如果你的个人目录里有同名插件,它的优先级高于项目里的这一个。

## 安装、更新与移除

```bash
npx flightwake setup          # 附加项那一步多一个问题,默认 No
npx flightwake init --mod     # 直接安装
npx flightwake update         # 只刷新已安装的 mod
npx flightwake uninstall      # 只移除发行的文件;你自己加的文件保留
npx flightwake doctor         # 检查安装状态
```

- **`setup`**:只有选了 Claude Code 才会问这个问题,默认 No。它用白话解释 mod 是什么,并提到 2.1.287 的要求与信任提示。
- **`init --mod`**:安装它。如果这次设置的 agent 里没有 Claude Code,会打印一条说明并跳过 mod(不算错误)。如果该文件夹已经存在,`init --mod` 会跳过,除非加 `--force`。
- **复制了什么**:插件的 manifest(`.claude-plugin/plugin.json`)、`hooks/` 与 `types/`——不含它的测试与开发脚本。
- **`update`**(以及 `init --force`)只在已经安装 mod 的地方刷新,逐个文件进行;你自己加在 `.claude/skills/flightwake-mod/` 里的文件会保留。`update` 不会替你新增 mod。
- **`uninstall`**:只移除 flightwake 发行到这里的文件,以及因此变空的文件夹。`.claude/skills/flightwake-mod/` 里的其他东西(你自己加的文件、Claude Code 写的文件)会保留,并在输出列出;`uninstall --purge` 只针对 `.flightwake/`,也不会删它们。
- **`--private`**:mod 文件夹会进入 `.git/info/exclude` 的区块;如果该文件夹已被 git 跟踪,`--private` 会在写入任何东西之前拒绝(与其他 private 要求相同)。之后在 private 安装上用 `init --mod` 补装,同样会把它加进 exclude 区块。

### doctor 检查什么

`doctor` 会报告 mod 是否已安装(可选项,没装不算问题)。已安装时它检查:

- manifest 存在且能解析;
- `hooks/hooks.json` 以及它指到的模块都存在;
- 每个随包发布的文件都在;
- 已安装的版本与包里的版本一致(不一致会给出警告,并指向 `update`);
- 随包发布的文件有没有被手动改过(警告;`update` 会还原)。

如果能执行 `claude --version`,会拿它与 2.1.287 比较(更旧是警告;读不到只是提示,绝不算失败)。**`doctor` 看不到文件夹是否已被信任、session 是否从 repo 根目录启动**——它会明说这一点。请在 Claude Code 里确认 mod 真的加载了(例如 `/fw-log` 可用)。

## 五个功能,各有开关

五个功能各自独立开关(插件选项):四个默认开启,角色守门默认关闭。开关在 Claude Code 的 `/config`,或写进你的*用户*设置:

```json
"pluginConfigs": { "flightwake-mod@skills-dir": { "options": { "<开关>": true } } }
```

插件选项不读项目设置,所以安装程序没办法替你设置。

| 开关 | 默认 | 做什么 |
|---|---|---|
| `stateInject` | 开 | session 开始时,把 `.flightwake/STATE.md`(每个 session 只取一次快照)加进 system prompt,并附一句说明:这是上次收尾时的状态,仍要检查 git。STATE 还是未填的模板时,改为一行「请运行 cold start」的提示。超过 6000 字符时,注入 frontmatter、「进行中」与「下一步入口」两节以及文件路径,并提示去精简 STATE,而不是粗暴截掉前 N 个字符。它不取代 `fw-coldstart`(落后检查与读最近一份 record 仍是 skill 的工作)。 |
| `band` | 开 | 输入框上方的一行:健康颜色、STATE 落后数(与 Stop hook 检查用同一个算法;机器人 commit 不算)、上下文用量,以及建议的下一个命令。一切正常时保持安静(健康不是绿色、落后 ≥3 个 commit、或上下文 ≥60% 时才出现)。上下文到 80% 时弹一次提示。当 flightwake 的底部仪表(`statusline.mjs`)就是生效的状态栏时,band 会隐藏仪表已经显示的字段并保持安静;80% 的提示仍会弹出。 |
| `recorder` | 开 | session 飞行日志:改动的文件、commit、以及识别出的测试命令与结果。`/fw-log` 把它打印出来,供 `fw-record` 当作 `tests:` 证据与改动清单。它从不写 record。 |
| `tripwire` | 开 | 当 agent 编辑的文件或执行的命令符合某个有效 TRAPS 条目的可选 `paths` / `commands` 字段时,每个 session 只向 agent 显示一次该条目的要点与可信度——在工具执行*之后*(它保护的是下一次尝试,不是这一次)。绝不阻止。`probable` / `suspected` 条目会标示为线索,不是结论。 |
| `roleGuard` | 关 | 对这个文件夹里 Claude 座位的角色,角色内文(ROLES.md)中的 `deny-write: [globs]` 行会变成对主 session 的 `Edit` / `Write` / `NotebookEdit` 写入这些路径的拦截,提示会说明角色、规则以及改做什么。只有用户本人能在输入框输入 `/fw-role-release` 为本 session 放行;放行期间状态栏持续显示。细节见 [roles.zh-CN.md](roles.zh-CN.md) 的「可选:Claude Code mod 的角色守门」一节。 |

### tripwire 用到的 TRAPS 字段

两个字段都是可选的;没有它们的旧条目只是不会被匹配:

```yaml
paths: ["src/db/**", "*.sql"]            # repo 相对的 glob(不含 / 的样式会匹配任意深度的该文件名)
commands: ["npm run migrate", "psql"]    # 命令前缀,逐个 token 比对
```

不支持正则。已被取代(superseded)的条目永远不会被匹配。

## 底部仪表与 band 一起用

`setup` 两个问题都会问。两者都装时,收尾信息会说明:底部仪表显示健康 / STATE 落后 / 上下文用量;输入框上方的 band 在仪表开着时隐藏这些相同的字段、保持安静,只在上下文偏高时弹一次提示。选择 mod 绝不会拿掉仪表。

## 安装之后

安装程序会打印:需要 Claude Code 2.1.287+;从 repo 根目录启动并接受信任提示;怎么自己打开角色守门(上面的 `pluginConfigs` 键,或 `/config`);它不是安全边界。

## 已知限制

- **`/fw-log` 里的「pass」**的意思是:直接调用的、可识别的测试运行器以可识别的方式运行并返回 0。它看不到配置文件或环境里让测试根本不执行的设置(例如 pytest.ini 里的 `addopts`、跳过测试的构建 profile),也不保证测试检查的内容。凡是它无法证明的,都记为「unknown」并附上 exit code,不记为 pass。
- **角色守门不是安全边界**:Bash 与其他工具不检查,子 agent 不检查,被禁止路径的 symlink 或其他别名也拦不到。
- **tripwire** 在无法确定工作目录时(例如 `||` 之后的 `cd`、子 shell 里),会在候选目录下逐一比对——最多 16 个,超过就改为比对路径的尾段——所以可能多提示一些。
- 只支持 Claude Code,需要 2.1.287+、已接受的文件夹信任提示,并从 repo 根目录启动。
- 只在一个真实的 Claude Code session 里验证过一次(五个功能都生效)。**尚未在真实 session 里验证**:重启后恢复 session、compaction 之后的行为、80% 提示、桌面版 / VS Code 的外观,以及 `/config` 是否列出这些选项(文档如此描述)。
