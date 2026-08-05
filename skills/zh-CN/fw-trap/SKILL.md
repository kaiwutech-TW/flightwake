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
supersede 保留给「根因本身换了」的情况。

## 步骤

1. 依 `.flightwake/TRAPS.md` 顶部示范的条目格式(OKF 式 frontmatter:name/type/status/confidence/tags/discovered)
   写在 `.flightwake/TRAPS.md` 的**最上面**
2. 四个栏位齐全:症状(贴原始错误讯息)、根因一句话、解法/绕法、佐证链接(commit/record)
3. 相关的坑用 `[[名称]]` 互连
4. **症状当下就写**——细节半天内就会模糊;**根因待坐实再定案**——还没坐实就先标
   `confidence: suspected` 并写下还没排除什么,不要空着等想清楚,也不要把猜测写成定论。
   之后坐实了回头升级
5. 新坑**取代或涵盖**既有条目时:把旧条目 frontmatter 的 `status` 改成 `superseded`,内文指向 [[新条目]] —— 永不删行,
   这样「旧 md vs 新 md」冲突时永远有明确方向
6. 判断坑的**范畴**:若它不专属本 repo——任何专案都会踩(平台/语言/工具层,例如 Node stdin 行为、shell 展开)——
   仍要登进 TRAPS(repo 的登记簿必须自足:下一个人或 agent 看不到你的个人记忆),
   **并同时存一份到使用者层记忆**(如 Claude memory),让你其他 repo 不再重踩。
   跨范畴各存一份是分工不是重复:通用坑只记单一 repo,换个 repo 就再咬一次
