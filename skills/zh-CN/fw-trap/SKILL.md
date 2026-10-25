---
name: fw-trap
description: flightwake 登记坑 — 把非显而易见的陷阱写进 TRAPS registry。Use immediately when a surprising root cause is found (weird error, vendor quirk, encoding trap), or when the user says 记一下这个坑/trap.
---

# fw-trap — 登记坑

目的:同一个坑,每个专案只踩一次(含未来 session 与其他 agent)。

## 什么够格进 TRAPS

- 症状与根因**距离远**(例:jsonb 存成字串 scalar → 根因是 driver 对「字串参数 + ::jsonb」的编码方式)
- 供应商未文件化的行为(例:某个操作路径不触发 webhook)
- 环境差异坑(本机过、prod 炸)
- **不够格**:普通 bug、看错误讯息就懂的东西

## 根因的把握度(confidence)

registry 最贵的失效不是漏记,是**把误诊写成定案**——读的人分不出「受控实验坐实的」和
「当下最像的解释」,照着错的根因走比没有 registry 更远。所以根因必须标把握度:

| confidence | 意思 | 佐证要求 |
|---|---|---|
| `confirmed` | 受控实验:改变因 → 症状跟着出现/消失,至少两次。**非因果类**的事实(某功能存不存在、清单有哪些、版本行为)改用「直接穷尽查证 + 指得出一手来源(源码行号/官方文档/后台逐项确认)」 | 佐证栏必须指得出那个实验或那份来源 |
| `probable` | 多次观察一致,但没做对照组 | 写出观察次数与时间范围 |
| `suspected` | 单次观察,或「当下最像的解释」 | 注明**还没排除掉什么** |

三条规则:

1. **症状栏永远是事实**(错误讯息照贴),confidence 只评「根因」那一栏
2. 非 `confirmed` 的条目,「解法」一律写成「**绕法**」,且**不得当行为准则**
3. **不对称门槛**——这条 trap 拿来论证「**这样会坏**」→ `probable` 就够(错了只是多做防护);
   论证「**这样是安全的**」→ 必须 `confirmed`(错了直接打到 prod 和用户)

把握度升级(suspected → confirmed)是**就地改同一条**,不是 supersede;
supersede 保留给「根因本身换了」的情况。写入前查重(第 1 步)遇到候选时,也照这条判断。

## 步骤

1. **先查重,再动笔**:写入前先跑(只读;只看 TRAPS.md)

```bash
npx flightwake traps similar --name='<slug>' --tags='<a,b>' --paths='src/db/**,*.sql' --commands='npm run migrate,psql' <<'EOF'
<症状(原样贴上错误信息)+ 一句话根因>
EOF
```

   正文一律走加引号的 heredoc(`<<'EOF'` … `EOF`,结尾的 `EOF` 单独一行、顶格),其他值一律用单引号——绝不用双引号:
   双引号里,shell 会执行贴上的错误信息中的反引号与 `$(…)`。条目没有 paths / commands 就省略 `--paths` / `--commands`。
   列出候选时三选一,不要直接再加一条:
   - **就地更新**既有条目——同一个根因:补佐证、补 paths/commands;把握度升级(suspected → confirmed)就是这种
   - **supersede**——根因本身换了:照第 6 步,旧条目改 `status: superseded`、正文指向新的 [[名称]]
   - **仍另立新条目**——根因不同:在新条目正文用一行写出为什么跟候选不是同一件事
   候选标「同名」时不能再立同名条目。没有候选 → 照常往下写。
   命令跑不了(离线、旧版 flightwake、没有 Node)→ 手动做同一件事:用新条目的 tags、paths 和关键错误字样 grep
   `.flightwake/TRAPS.md`,有相近条目一样三选一
2. 依 `.flightwake/TRAPS.md` 顶部示范的条目格式(OKF 式 frontmatter:name/type/status/confidence/tags/discovered)
   写在 `.flightwake/TRAPS.md` 的**最上面**
   选填 `paths` / `commands`——坑绑在特定文件或命令上时才填,让 Claude Code mod 的绊线在有人碰到时把这条提示出来:
   `paths: ["src/db/**", "*.sql"]`(repo 相对路径的 glob;不含 `/` 的样式匹配任何深度的同名文件)、
   `commands: ["npm run migrate", "psql"]`(命令前缀,逐词比对)。不支持 regex。拿不准、或坑是观念而不是某个位置?留空即可——
   不填的条目照常运作
3. 四个栏位齐全:症状(贴原始错误讯息)、根因一句话、解法/绕法、佐证链接(commit/record)
4. 相关的坑用 `[[名称]]` 互连
5. **症状当下就写**——细节半天内就会模糊;**根因待坐实再定案**——还没坐实就先标
   `confidence: suspected` 并写下还没排除什么,不要空着等想清楚,也不要把猜测写成定论。
   之后坐实了回头升级
6. 新坑**取代或涵盖**既有条目时:把旧条目 frontmatter 的 `status` 改成 `superseded`,内文指向 [[新条目]] —— 永不删行,
   这样「旧 md vs 新 md」冲突时永远有明确方向
7. 判断坑的**范畴**:若它不专属本 repo——任何专案都会踩(平台/语言/工具层,例如 Node stdin 行为、shell 展开)——
   仍要登进 TRAPS(repo 的登记簿必须自足:下一个人或 agent 看不到你的个人记忆),
   **并同时存一份到使用者层记忆**(如 Claude memory),让你其他 repo 不再重踩。
   跨范畴各存一份是分工不是重复:通用坑只记单一 repo,换个 repo 就再咬一次
