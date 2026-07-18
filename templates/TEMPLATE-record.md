---
record_id: {{YYMMDD}}-{{slug}}
session: {{session id 或人名}}
date: {{YYYY-MM-DD}}
repos: [{{涉及的 repo}}]
tests: {{N passed / tsc clean / 或「無 runtime 面」}}
prod_changes: {{migrations/部署/資料操作,無則 none}}
---
<!-- flightwake record — 飛行紀錄。觸發:動 schema / 動 prod / 自上次 record ≥3 commits / session 收尾。 -->
<!-- 檔名:records/YYMMDD-slug.md。寫給「三個月後的陌生人」:不用縮寫、不用只有你懂的代號。 -->

# {{標題:一句話說完這次做了什麼}}

**TL;DR**:{{兩三句:起點是什麼問題、終點是什麼狀態。}}

## 關鍵發現(重要性排序,沒有可刪)

1. {{發現 + 佐證。夠格的同步登進 TRAPS/DECISIONS}}

## 交付 / Commits

| 內容 | Commit/位置 |
|---|---|
| {{做了什麼}} | {{hash 或路徑}} |

## 驗證證據

<!-- 去識別化:prod URL、客戶/內部代號、真實 ID、token/金鑰不落地(repo 可能公開)。證據用脫敏形式:數字結果、指標位置(「見 prod log YYYY-MM-DD」)。 -->

- {{端到端驗證了什麼、怎麼驗的、結果}}

## 未完 / 交接

- {{沒做完的 + 下一步入口(同步反映到 STATE)}}
