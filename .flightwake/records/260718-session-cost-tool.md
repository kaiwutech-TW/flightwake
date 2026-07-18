---
record_id: 260718-session-cost-tool
session: Claude(Fable 5)
date: 2026-07-18
repos: [flightwake]
tests: smoke 全過(12 項)
prod_changes: none
---

# token 量測工具:零 token 解析 transcript,取代向使用者要 /cost

**TL;DR**:回應「量測成本能不能不花 token」——答案是完全免費:Claude Code 本機 transcript(`~/.claude/projects/<專案>/*.jsonl`)每條訊息帶原始 API usage,`tools/session-cost.mjs`(零依賴)解析加總即可,`--since` 可切單一 turn。工具定位 dev-only 不隨 init 安裝(決策見 DECISIONS 2026-07-18);benchmarks 方法論與 fw-coldstart 提示已改指向此法,/cost 降為人工 cross-check。

## 關鍵發現(重要性排序)

1. **transcript 有串流重複行,加總前必須以 message.id 去重留最後一筆**:同一則訊息會寫多行,naive 加總會高估約 2 倍(本 session 實測 84 行 → 去重後 39 則)。工具已內建去重。
2. **sub-agent 是此需求的最差解**:usage 是 harness 層資料,agent 自己看不到,開 agent 等於燒 token 做一件本來零成本的事。
3. **transcript 格式是內部實作、無穩定承諾**:所以只能當 dev 工具、不能寫進框架承諾或安裝路徑;失效時退回 /cost。

## 交付 / Commits

`992f45e`:tools/session-cost.mjs、benchmarks 方法論改用腳本、fw-coldstart 提示改指 transcript、DECISIONS 一行。

## 驗證證據

- `node tools/session-cost.mjs` 於本 session 實跑:正確輸出 per-model 加總;`--since` 切片過濾正常(未來時間 → 空集合)
- `bash test/smoke.sh` → 12 項全過(工具不在安裝路徑,不影響 init)

## 未完 / 交接

- 缺口 5–7 未動(入口見 STATE)
- benchmarks 既有首筆樣本是 /cost 全額值,下次實測改用 `--since` 切單 turn,歸因會更乾淨;GSD 側實跑對照仍缺
