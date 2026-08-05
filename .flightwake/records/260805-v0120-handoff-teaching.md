---
record_id: 260805-v0120-handoff-teaching
session: Claude(Fable 5)
date: 2026-08-05
repos: [flightwake]
tests: bash test/smoke.sh 23/23 全過;PR #8 required checks(smoke×2 平台、state-fresh、analyze、CodeQL)全綠
prod_changes: npm v0.12.0 發佈(本檔「驗證證據」節含發佈後驗證;發佈流程走 Release → trusted publishing)
---

# v0.12.0:handoff 教學補強 + 出貨擱置的 trap-confidence 批次

**TL;DR**:使用者問「該不該有 fw-handoff 的教學」——數據直接支持:本 repo 23 筆 record、
**0 筆 CONTEXT**,fw-handoff 是四個 skill 裡唯一零使用的。診斷不是 skill 寫得差,而是
**record 與 handoff 兩個出口的分界從未被寫下**,每次收尾都能把交接資訊塞進 record 的未完節,
CONTEXT 永遠「不太需要」。本批補分界規則與教學,連同擱置的 trap-confidence(260803)一起
發成 v0.12.0。

## 關鍵發現(重要性排序)

1. **skill 零使用的原因要先量再猜。** 23:0 的比值一查就有(`ls records/ | grep -i context`),
   答案立刻從「要不要寫教學文件」收斂成「缺一句可判定的分界」:
   *下個 session 順手能撿的零頭 → record 未完節;跨多 session 的建設要停手 → CONTEXT*。
2. **導流比教學有效:讓最常被觸發的 skill 幫最少被觸發的指路。** fw-record 每次收尾都會跑,
   在它的未完節加一行「若是多 session 建設 → 改走 /fw-handoff」,比獨立教學文件便宜且到點。
   刻意不做新檔、不做第五 skill(邊界同 DECISIONS 2026-08-03 首條)。
3. **PR 合併方式因 record 引用 hash 而受約束。** 260803 record 內文引用 `fae6554`/`40101e3`;
   rebase/squash 合併會改寫 hash 讓記錄失效。故 PR #8 用 merge commit(分支保護未要求線性歷史,
   實查 `required_linear_history: false`)。**引用了 commit hash 的 record 存在時,合併只能用
   merge commit**——這是框架自身結構帶來的工作約束,遇到再犯不值得,先記在這。
4. state-fresh CI 在本分支第 3 個 commit 時如設計紅燈(門檻 3),本檔即是回應——閘門咬了
   自己人,證明它活著。

## 本批變更(commits 見 PR #8)

- 四語 fw-record 未完節加 handoff 指路一行(`9f1717d` 原始 hash,合併後不變)
- workflow.md / workflow.zh-TW.md:§5 加分界規則 + ⚙進階加四節 CONTEXT 實例
- 版本 bump 0.12.0 + 本 repo dogfood update(`.claude/skills` 同步拿到 confidence 內容,
  之前是舊版——update 依賴發版節奏,分支上的 skills 源與已安裝副本會短暫分歧,屬預期)
- 連同 260803 批(TRAPS confidence 三級、coldstart 讀取路徑、handoff 驗收)一起出貨

## 驗證證據

- `bash test/smoke.sh` 23/23(本機,教學變更後)
- PR #8 required checks 全綠:smoke ubuntu/macos、state-fresh、analyze、CodeQL(連結見 PR)
- npm 發佈驗證(2026-08-05 補記):release run 30981923138 success;`npm view flightwake version` 實回 `0.12.0`(trusted publishing 第八次零失誤)

## 未完 / 交接

- 下游三 repo(kaiwuweb、salesmartly_chain、marketing_dashboard)`npx flightwake update` 至 0.12.0
- 使用者提到「實際重複踩到 trap」——**具體是哪條尚未取得**;拿到後對照三型
  (誤診型/危險側通則型/忘了查型)驗證 confidence 修正是否命中,並依新規則補標
- repo A 那條疑似誤診的驗證仍未執行(見 260803 未完節)
- **Codex/MCP 原生支援調研已完成**(本 session 前半):結論=先做 `.agents/skills` 移植 +
  `.codex/hooks.json`(SessionEnd/PreCompact),MCP server 觀望至 2026-07-28 spec 生態穩定,
  statusline 無 API 不做。調研全文在本 session 對話中,**尚未落 DECISIONS**(使用者未拍板),
  下次要動 Codex 支援前先向使用者確認方向
