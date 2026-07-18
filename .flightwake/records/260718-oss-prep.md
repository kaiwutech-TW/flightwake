---
record_id: 260718-oss-prep
session: Claude(Fable 5)
date: 2026-07-18
repos: [flightwake]
tests: smoke 全過(16 項,含本次新增模式混用、--threshold 防呆 case)
prod_changes: none
---

# 5–7 回顧優化 + 開源收殘 + flip 日定案 + README 補論述

**TL;DR**:回顧缺口 5–7 的程式碼抓到一個真 bug(--private 與預設 init 混用會重複安裝片段與 hook,已修:兩模式互認,v0.7.1);開源收殘完成(MIT、README.en.md、release.yml Trusted Publishing、flip 日 runbook 入 design.md);flip 日定 **2026-08-01**(試跑從 v0.7.1 功能完備起算兩週,達標條件與提前/延後訊號見 STATE);README 補上「為什麼會有這個專案」(四個結構性不足)與使用教學(日常循環 walkthrough)。CI state-fresh job 首跑綠(run 29639209296)。

## 關鍵發現(重要性排序)

1. **兩個安裝模式寫不同檔案時,偵測必須互認**:--private 的痕跡在 CLAUDE.local.md/settings.local.json,預設 init 只掃自己模式的檔案就會重複安裝(hook 裝兩份 = Stop 提醒跳兩次)。修法是掃描面永遠涵蓋兩模式的目標檔。
2. **防呆的失效模式比失效本身重要**:`--threshold=非法值` 原本 NaN 比較永遠 false——CI 檢查「靜默變成永不觸發」比 crash 危險,因為看起來一直是綠的。
3. **README 的「為什麼」要框成結構性不足**:session 必死、git 不記 why、紀律漂移、多 agent 不共享——這四項不隨模型變強而消失,是「補持久性與紀律、不補智力」定位的論述基礎(教學與論述雙缺是本次確認才發現的,規格審查值得含「讀者第一次看 README」視角)。
4. gh CLI 多帳號:active 帳號看不到另一帳號的 private repo 會回 404(不是不存在);git push 憑證與 gh token 是兩套。

## 交付 / Commits

`9b7dfef..9421ec8`(4 commits):v0.7.1 混用修復+防呆、開源收殘(LICENSE/README.en/release.yml/runbook)、flip 日入 STATE、README 論述+教學。

## 驗證證據

- `bash test/smoke.sh` → 16 項全過(模式混用 case:--private 後跑預設 init,片段與 hook 都不重複)
- CI run 29639209296:smoke ubuntu/macos + state-fresh 全綠,state-fresh 輸出 `✅ 落後 0 < 門檻 3`(fetch-depth: 0 驗證有效)
- release.yml 推上遠端未觸發(僅 Release 事件觸發,符合預期)

## 未完 / 交接

- 試跑期與 flip 判準:見 STATE 下一步入口(2026-08-01 檢視)
- 範例 repo 未做(開源準備唯一未完項)
- README.en.md 與 README.md 有同步義務(en 檔頭有註記),flip 日對調檔名
