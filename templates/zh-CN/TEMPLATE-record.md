---
record_id: {{YYMMDD}}-{{slug}}
session: {{session id 或人名}}
date: {{YYYY-MM-DD}}
repos: [{{涉及的 repo}}]
tests: {{N passed / tsc clean / 或「无 runtime 面」}}
prod_changes: {{migration/部署/资料操作,无则 none}}
---
<!-- flightwake record — 飞行记录。触发:动 schema / 动 prod / 自上次 record ≥3 commits / session 收尾。 -->
<!-- 档名:records/YYMMDD-slug.md。写给「三个月后的陌生人」:不用缩写、不用只有你懂的代号。 -->

# {{标题:一句话说完这次做了什么}}

**TL;DR**:{{两三句:起点是什么问题、终点是什么状态。}}

## 关键发现(重要性排序,没有可删)

1. {{发现 + 佐证。够格的同步登进 TRAPS/DECISIONS}}

## 交付 / Commits

<!-- 去重:细节 git 自己讲,这里只写 range;git log 看不出的对应关系才补一句。 -->

{{起 hash}}..{{迄 hash}}({{一句话说这段 range 涵盖什么;git log 已清楚就不写}})

## 验证证据

<!-- 去识别化:prod URL、客户/内部代号、真实 ID、token/密钥不落地(repo 可能公开)。证据用脱敏形式:数字结果、指标位置(「见 prod log YYYY-MM-DD」)。 -->

- {{端到端验证了什么、怎么验的、结果}}

## 未完 / 交接

- {{没做完的 + 下一步入口(同步反映到 STATE)}}
