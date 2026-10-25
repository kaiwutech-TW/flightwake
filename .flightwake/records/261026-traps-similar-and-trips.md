---
record_id: 261026-traps-similar-and-trips
session: Claude Code (Opus 5.5) + 兩個子代理(CLI 側、mod 側),2026-10-22 → 10-26
date: 2026-10-26
repos: [flightwake]
tests: bash test/smoke.sh 47 節全過(Python 3.12 在 PATH 前,單獨執行);claude plugin test mods/flightwake 490 pass / 25 fail(單獨執行,Claude Code 2.1.310;同一組 25 個在 clean HEAD 也失敗,見下);claude plugin validate --strict 通過;tsc 5.9.3 對 2.1.301 型別 clean
prod_changes: none(未發版)
---

# TRAPS 寫前查重與觸發次數(參考 dsh 記憶插件)

**TL;DR**:看過 dsh-plugin.org「記憶與上下文」區的 41 個插件(細讀 11 個導讀頁、沒看原始碼),多數機制 flightwake 已有(凍結快照、superseded、confidence、去重原則)。借了兩個:寫入 TRAPS 前用 `npx flightwake traps similar` 查重並三選一(dsh-memoir),以及 mod 絆線記下每條 trap 被比對到的次數、`npx flightwake traps stats` 彙整(dsh-fail-logger)。功能完成、smoke 全綠;mod 測試有 25 個 fleet 失敗,是 Claude Code 2.1.310 測試環境的行為改變,clean HEAD 同樣失敗,未修。

## 關鍵發現(重要性排序)

1. **`claude plugin test` 2.1.310 讓 25 個 fleet 測試失敗,與本次功能無關**:clean HEAD 與工作樹的失敗清單 diff 相同。探針顯示 mod 的 check / perm 配對都正常,但 `tool.call` 的 `next(e)` 在底層還掛著時就回「Permission to use Bash has been denied」。已登 TRAPS [[plugin-test-kit-denies-unanswered-permission-request]](probable)。真引擎是否也改了要真機驗。
2. **門檻 0.40 有實測依據**:子代理拿真實 TRAPS 33 條兩兩比對(1,056 組有向配對),python 3.11 那對分數 0.79 / 0.55,無關配對最高 0.37;0.35 會有 6 個誤報。權重採 IDF,`claude`、`mods` 這類常見字權重低。
3. **`traps similar` 第一次實用就有效**:登記第 1 條發現時列出兩個相關條目,判定根因不同後選「另立新條目」並在內文寫理由。
4. **active 條目約一半沒有錨點**(stats:31 active、18 有 paths/commands、13 沒有),沒錨點的條目絆線永遠不會觸發——壓實時優先補錨點。
5. **mod 的寫入從一處變兩處**(DECISIONS 2026-10-26,取代 2026-10-11 那條):兩處都在 `<base>` 下、同一套拒寫規則、都只在 `features/fleet.ts` 寫;只記互動 session。

## 交付 / Commits

本 record 的前一個 commit(功能 + 四語 skill/文件 + CHANGELOG `[Unreleased]` Added + TRAPS 新條目 + DECISIONS + dogfood 副本刷新)。

設計重點(細節在 `bin/traps.mjs` 與 `docs/mod.md`「Trip file」):
- trip 檔契約:`<base>/trips/<sessionId>.json`,`{ v:1, sessionId, repo, updated, trips: { <name>: { n, first, last } } }`;`n` 算每次比對,含 dedup 後沒再提示的。
- tripwire 只在 `$.state` 計數;寫檔的 `registerTripLog` 註冊在 tripwire 外層(先註冊 = 最外層),因為 smoke 45 規定 `fs.write` 只出現在 `features/fleet.ts`,且 `$` 不能跨 import。
- stats 沒有資料時不宣稱「從未觸發」;沒錨點的條目不算「沒用」。
- `uninstall --purge` 只刪 `repo` 等於本 repo 的 trip 檔;`sessions/` 照舊不碰。

## 驗證證據

| 項目 | 結果 |
|---|---|
| smoke | 47 節全過;新 47 節:parser 與 mod 一致、similar 近似/同名/無關/--json/路徑/用法錯誤/唯讀、stats 無資料/只算本 repo/--days、uninstall 保留或 --purge 只刪本 repo |
| mod 測試 | 490/25,失敗集合 = clean HEAD 的失敗集合(diff 相同);新增 14 個 trip file 測試全過 |
| validate / tsc | strict 通過 / exit 0 |
| 真實 TRAPS | `traps similar` 對 python 坑給 0.75(active)與 0.68(superseded);無關查詢零候選;`traps stats` 正確回報無觸發資料 |

## 未完 / 交接

- **25 個 fleet 測試在 2.1.310 失敗**:要拿到 2.1.310 的 testing 文件找出讓權限請求保持等待的方式;另需真機確認互動 session 的 F7 blocked 是否仍正常。
- **沒真機驗**:引擎內 hook 順序(只依文件規則與測試)、`$.fs.write` 建 `<base>/trips` 的權限、實際寫入頻率。
- `/fw-mod` 不顯示 trip 檔狀態;trip 檔沒有清理機制(檔小,一個 session 一檔)。
- **只記互動 session**、**一檔一個 repo 欄位**(session 中途 `/cd` 到別的 repo 時,舊計數歸到最後的 repo)——子代理的選擇,待使用者確認。
- 前次 record 的未完項照舊(待發版、兩處小 bug、TRAPS >20 待決)。
