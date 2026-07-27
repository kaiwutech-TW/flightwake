---
record_id: 260727-dependabot-codeql-group
session: Claude(Opus 5)
date: 2026-07-27
repos: [flightwake]
tests: bash test/smoke.sh 全過(22 組);PR #6 CI analyze/CodeQL 轉綠
prod_changes: none(只動 CI 設定,未發版)
---

# 首批 dependabot 升版 PR:codeql-action 拆 PR 導致 CI 紅,改用 groups 修根因

**TL;DR**:開源後第一批 dependabot 升版 PR(5 個)進來,其中 codeql-action 的兩個 PR CI 是紅的。查出根因是 dependabot 把 `init`/`analyze`/`upload-sarif` 當三個獨立套件拆成三個 PR,但 CodeQL 要求同 workflow 內版本一致,任一 PR 單獨存在時就撞版本不一致。在 `.github/dependabot.yml` 加 `groups` 收攏成單一 PR;dependabot 重跑後生出 PR #6 並自動關掉被取代的 #1/#4/#5,CodeQL 轉綠。三個 PR 待合(#6 codeql-action 三合一、#3 scorecard-action、#2 checkout)。

## 關鍵發現

1. **codeql-action 子 action 必須同版,dependabot 預設會拆散它們** → 已登 TRAPS [[codeql-action-version-lockstep]]。錯誤訊息 `Loaded a configuration file for version '4.37.1', but running version '4.37.3'` 指向「設定檔」,實際與 CodeQL 設定無關,是 action 版本不一致;init 步驟有先出 warning 但不擋,真正失敗在 analyze。
2. **修法選 groups 而非按序合併**(入 DECISIONS 2026-07-27):按序合併(先合 init、等 rebase、再合 analyze)每次升版都要手動排雷,且中間 main 會短暫紅;groups 是一次修根因,且不動「釘 SHA」這條安全決策。
3. **本 repo 的 state-fresh gate 在這次自己咬到自己**:推完設定變更後 PR #6 的 state-fresh 紅,訊息「STATE 已落後 3 個 commit(門檻 3)」——dogfood 的閘門在真實情境下如期生效,本記錄即為它要求的收尾。

## 交付 / Commits

d12c9d7(dependabot groups + TRAPS + DECISIONS)

## 驗證證據

- `bash test/smoke.sh` 全過(22 組)
- dependabot 重跑後產出 PR #6「Bump the codeql-action group with 3 updates」,diff 同時改三處 SHA 到 4.37.3;#1/#4/#5 被 dependabot 自動關閉
- PR #6 檢查:`analyze` pass(54s)、`CodeQL` pass、smoke 四組全 pass — 對照修正前失敗 run 30184467406

## 未完 / 交接

- 三個 PR 待使用者決定合併:#6(codeql-action 4.37.1→4.37.3)、#3(scorecard-action 2.4.3→2.4.4)、#2(checkout 7.0.0→7.0.1);#6 合併前 state-fresh 需本記錄推上 main 才會轉綠
- 其餘待辦不變(發宣傳、HN 後續),見 STATE 下一步入口
