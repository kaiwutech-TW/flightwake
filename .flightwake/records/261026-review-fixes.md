---
record_id: 261026-review-fixes
session: Claude Code (Opus 5.5) + max code review + 兩個子代理(mod 側、CLI 側),2026-10-26
date: 2026-10-26
repos: [flightwake]
tests: bash test/smoke.sh 全過(含新 47.1–47.6,Python 3.12 在 PATH 前,單獨執行,install 改動後重跑);claude plugin test mods/flightwake 521 pass / 25 fail(Claude Code 2.1.310,單獨執行;失敗清單與 clean HEAD 逐名相同,diff 無差異);claude plugin validate --strict 通過;tsc 5.9.3 clean
prod_changes: none(未發版)
---

# max review 的 15 項修正:觸發紀錄改每 session 一次、移除提示不再指向 --purge

**TL;DR**:使用者跑 `/code-review max` 檢查 [[261026-traps-similar-and-trips]] 等 4 個 commit,15 項全部確認、沒有被推翻。最嚴重的三項:`/fw-trap` 的指令範本會執行貼進去的反引號、resume 會蓋掉觸發計數、計數幾乎全是唯讀指令的雜訊。使用者選「每 session 一次」並要求 15 項全修;兩個子代理分 mod / CLI 修完,smoke 全綠。mod 測試照舊有那 25 個 2.1.310 測試環境造成的失敗,mod 測試套件因此仍不算綠。

## 關鍵發現(重要性排序)

1. **舊的 uninstall 提示會刪光紀錄**:一般 `uninstall` 叫人用 `uninstall --purge` 刪觸發紀錄,但 `--purge` 會刪整個 `.flightwake/`;private 安裝不在 git 裡,刪了救不回(審查子代理在暫存 repo 重現)。改成 `npx flightwake traps forget`。
2. **逐次計數不能當證據**:這個只讀的審查 35 分鐘就記了 2,623 次,來源是 `cat`/`grep`/`git diff -- mods/…`。改成每 session 每 repo 最多一次,只認 Edit/Write 路徑與指令開頭(DECISIONS 2026-10-26)。
3. **指令範本的雙引號會執行反引號**:TRAPS 症狀欄幾乎都有反引號,照範本填就會在查重前先執行裡面的指令。改成 heredoc(`<<'EOF'`)從 stdin 傳內文、其他值用單引號;smoke 47.5 在 bash 和 zsh 照四語範例原樣跑。
4. **一般 `update` 沒有建 `trips` 資料夾**(收尾時自己發現,不在審查清單):新 mod 只寫進已存在且 0700 的資料夾,但建資料夾只在 `--mod` 時跑,已裝 mod 的人升級後會靜默不記。改成 mod 在 repo 裡就建或收緊(`bin/install.mjs` 第 8 段)。
5. **10-19 的面板修正有破口**:讀回失敗時仍說「已送出」、確認鍵在 800 ms 等待中可再按一次;已修,讀回只對 Codex。

## 交付 / Commits

本 record 的前一個 commit(兩側修正 + 四語文件與 skill + smoke 47.1–47.6 + CHANGELOG + TRAPS 新增 `claude-code-toast-40-columns-3-lines` + DECISIONS + dogfood 刷新)。設計細節在 DECISIONS 2026-10-26 第二條與 `docs/mod.md`「Trip file」。

## 驗證證據

| 項目 | 結果 |
|---|---|
| smoke | 全過;47.1 v2/v1 讀取、多 repo、`--days`、本地日期、`__proto__`、3,000 筆 `--json` 經慢速管線不截斷;47.2 forget / `--dry-run` / 拒刪 / `--purge`;47.3 prune 觸發檔;47.4 0700 建立與收緊;47.5 stdin 與範本安全;47.6 同名保留、catch-all glob |
| mod 測試 | 521 / 25;25 個失敗與 clean HEAD 同名同集合;新增測試涵蓋每 session 一次、Bash 路徑字詞不記、合併與 v1 轉換、resume、per-repo、拒絕判定、資料夾權限、開關跟隨 fleet、面板讀回與連按、`/fw-fleet` 精確跳脫 |
| 本機 | `update` 印出 `chmod ~/.flightwake/trips/ 0700(原為 755…)`,之後 `drwx------` |

## 未完 / 交接

- **25 個 fleet 測試在 2.1.310 失敗**(TRAPS `plugin-test-kit-denies-unanswered-permission-request`)——修好之前 mod 測試套件不算綠。
- **都沒真機驗**:v2 觸發紀錄在真 session 的寫入(本 session 的 mod 要到下一輪才重載)、權限對話框按「否」的文字是否被 `REFUSAL_RE` 認出、`classic.PreToolUse` / `PermissionDenied` 在 `tool.call` 裡的實際順序、Linux 的 `stat` 輸出、Windows(沒有 `stat`,mod 不寫)。
- `traps forget` 和正在跑的 session 可能互相覆寫(沒有鎖;下一次寫入可能把本 repo 的紀錄帶回來)。
- Claude Code Bash 工具裡的 stdin 狀態沒查;2 秒逾時保底。
- 審查列為次要、這次沒處理的:macOS 大小寫不同的路徑對不上、讀到寫一半的檔不重試、`fleet.ts:579` 的 `resumeCmd` 死碼、bin 與 mod 的 glob 比對沒有同步檢查、測試 fixture 重複。
- 前幾份 record 的未完照舊:待發版、TRAPS active 超過 20 待決。
