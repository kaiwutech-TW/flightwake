---
record_id: 260727-oss-pr-flow-hardening
session: Claude(Opus 5)
date: 2026-07-27
repos: [flightwake]
tests: bash test/smoke.sh 全過(23 組,新增 bot commit 計數測試);main 兩個 commit 的 ci/codeql/scorecard 全 success
prod_changes: 無發版;GitHub 端有設定變更(main 分支保護開 required status checks,證據見下)
---

# 首批 dependabot PR 全數合併;修掉閘門誤判 bot commit;補齊開源社群基礎檔

**TL;DR**:接續 [[260727-dependabot-codeql-group]]。首批五個 dependabot PR 全部處理完(#6 群組 PR、#3、#2 合併,#1/#4/#5 被群組取代自動關閉)。過程中閘門連續誤擋兩次,追出這是設計問題而非門檻問題——STATE 落後量把 bot 的 commit 當成人的工作,改為只數人的 commit(state-check 與 statusline 兩處同步)。最後補齊第一次開源該有但缺的六項:分支保護 required checks、CONTRIBUTING、CHANGELOG、CoC、issue/PR 模板、.gitignore。

## 關鍵發現

1. **「不可能被滿足的 CI check」是最糟的紅燈** → 已入 DECISIONS 2026-07-27。dependabot 的 PR 永遠無法自己補 STATE,這種 check 會訓練所有人忽略紅燈,連帶讓真正的紅失去意義。修法是排除 bot 作者(`--author=\[bot\]`,匹配帳號後綴而非廠商名),不是調高門檻——調門檻只延後同樣的誤判。腳本開頭自述的原則「誤放行優於誤阻擋」原本就在,是實作違反了它。
2. **儀表與閘門是兩份獨立實作的同一規則**:`statusline.mjs` 自己算落後量,README 還明說「與 Stop hook 同一套邏輯」。只修 state-check 會讓閘門說新鮮、儀表繼續催收尾。**同一規則存在兩處實作時,改一處必然漂移**——這次兩處都改,但這個結構性風險仍在。
3. **`gh run list --commit` 需要完整 SHA**,短 SHA 靜默回傳空結果(不報錯)。用它寫 `until length>0` 的等待迴圈會永遠空轉,看起來像 CI 還在跑。本 session 兩個背景 shell 因此空轉到被手動停掉。
4. **GitHub 的 rerun 重播同一個 head SHA**,不會拿到新的 base。base 上的修正要讓 PR 看見,只能 rebase(`@dependabot rebase`)——rerun 無效。
5. **Scorecard 客觀分數 7.2/10**(實測 commit 3c9f17a):滿分項為 pinned dependencies、token 最小權限、SAST、CI 測試、security policy、license、無危險 workflow pattern;`Code-Review: 0/27` 反映一切直推 main。已知取捨:選 `enforce_admins: false` 保留單人速度,此分數不會改善。

## 交付 / Commits

fa6fda7..9da5083(dependabot 首批合併 → 閘門 bot 排除 → 社群基礎檔)

GitHub 端設定變更(不在 git 內,故記於此):main 分支保護啟用 required status checks
`smoke (ubuntu-latest)` / `smoke (macos-latest)` / `state-fresh` / `analyze`;
`strict: false`(避免每個 PR 都被迫 rebase,即本 session 實際踩過的來回)、`enforce_admins: false`、
force push 與刪除皆禁止。

## 驗證證據

- `bash test/smoke.sh` 23 組全過;新增測試雙向驗證:3 個 bot commit 不觸發提醒、隨後 1 個人的 commit 在 `--threshold=1` 下仍觸發
- 兩支 hook 的源頭與安裝副本 diff 僅剩蓋章差異(state-check 一行 LANG;statusline 兩行 LANG/FW_VERSION)
- main 上 3c9f17a 與 9da5083 的 ci / codeql / scorecard 全數 success
- 分支保護實際回讀確認四個 check 已生效
- 四份 issue/dependabot/workflow YAML 以 ruby YAML parser 驗證可解析(本機無 pyyaml,且不得為此加依賴)

## 未完 / 交接

- **0.10.1 仍未發 Release**;CHANGELOG 的 `[Unreleased]` 已收好本批內容(儀表版本號、bot 排除、dependabot grouping),下次發版直接搬
- 社群檔案現在是對外承諾:CHANGELOG 斷更比沒有更傷信任,零依賴條款以後也約束自己
- 結構性風險未解:落後量規則在 state-check 與 statusline 兩處各有實作,下次改仍需手動同步(是否抽共用模組待議,受零依賴與單檔 hook 設計約束)
- 其餘待辦不變(發宣傳、HN 後續),見 STATE 下一步入口
