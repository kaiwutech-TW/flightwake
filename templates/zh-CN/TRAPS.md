<!-- flightwake TRAPS — 坑 registry。非显而易见、会再咬人的事实。 -->
<!-- 条目采 OKF 式惯例:frontmatter 区块 + 内文;可用 [[名称]] 互连。新的加最上面。 -->
<!-- 时效:条目过时(功能合并/重构后不再成立)不删 — status 改 superseded 并指向取代者;读的人只信 active。 -->
<!-- 证据强度:confidence 标的是「根因」的把握度,不是症状。**不对称门槛**——拿这条论证
     「这样会坏」probable 就够(错了只是多做防护);论证「这样是安全的」必须 confirmed
     (错了直接打到 prod 和用户)。 -->

# 坑 Registry

---
name: {{kebab-case-slug}}
type: trap          # trap | gotcha | constraint
status: active      # active | superseded(过时不删,改此栏并在内文指向 [[取代条目]] 或 record)
confidence: suspected  # confirmed(受控实验坐实:改变因 → 症状跟着出现/消失,至少两次;
                       #           非因果事实则为「穷尽查证 + 指得出一手来源」)
                       # probable(多次观察一致,但没做对照组)
                       # suspected(单次观察,或「当下最像的解释」)
                       # 未标此栏 = unknown(旧条目),读的人比照 suspected 对待
tags: [{{标签}}]
discovered: {{YYYY-MM-DD}}
---

**症状**:{{看到什么(错误讯息/怪行为)——这栏永远是事实,错误讯息照贴}}
**根因**:{{一句话。confidence 标的就是这一栏的把握度}}
**解法/绕法**:{{怎么处理。非 confirmed 时只写「绕法」,不写「解法」,也不得当行为准则}}
**佐证**:{{commit/record 链接;标 confirmed 必须指得出受控实验}}
