---
record_id: 261110-narrow-a1-a2-tripwire
session: Claude Code(Fable 5.2 研究與規劃 → Opus 5.5 實作),2026-11-10
date: 2026-11-10
repos: [flightwake]
tests: claude plugin test mods/flightwake 546 pass / 0 fail(Claude Code 2.1.321,單獨執行;修正前 521/25);bash test/smoke.sh 全過(含新 48,Python 3.12 在 PATH 前,單獨執行,最後一次在 8e3760f 的工作樹);claude plugin validate --strict 通過;tsc 5.9.3 對 2.1.321 型別 clean
prod_changes: none(未發版)
---

# 收窄計畫開工:mod 測試回綠、支援 Antigravity、絆線只對瞄準的目標提示

**TL;DR**:兩份研究報告(本機 `reports/`,不進版控)的結論是「守住 Markdown 核心與 TRAPS、凍結機隊外掛、補上 Antigravity」,寫成計畫 `docs/plans/narrow-and-launch.md`,Kai 對五個範圍決定全選建議值。接著做了三件:25 個 mod 測試失敗查出是測試 kit 的改變並修好(546/546);新增 Antigravity(`agy`)平台,Gemini CLI 降級保留;絆線在 Bash 裡只對指令前綴與寫入的路徑提示。agy 的 Stop hook 依官方文件寫成,還沒在真機上看它觸發。

## 關鍵發現(重要性排序)

1. **25 個 fleet 測試失敗是測試 kit 改變,不是 mod 壞了**:2.1.310 起 kit 會在測試的 `$.tool.call` 開始前自己跑一次 `tool.check`,`ask` 沒人答就判拒絕;測試的 `tool.check` 對每個 check 都答 `ask`,呼叫根本沒跑到底層。依據是 2.1.321 的 `claude-code.d.ts`(`EngineToolCall` 文件)。TRAPS `plugin-test-kit-denies-unanswered-permission-request` 由 probable 升為 confirmed 並改寫根因。以後測試 kit 再變,先 grep 當版 d.ts,不要先寫探針。
2. **真引擎的 F7 blocked 仍正常(間接證據)**:本 session 的 fleet 檔 `why` 是 `unblocked:tool-done`,代表今天的權限對話框期間被判 blocked、呼叫結束後清掉。直接觀察(對話框開著時看檔案)仍待 Kai。
3. **v2 觸發紀錄已在真 session 驗到**:本 session 的 trip 檔是 `v: 2`、每 repo 每 trap 一筆,只記了 `claude plugin test` 這個指令前綴;大量唯讀 `grep` 沒有被記。STATE 上「v2 觸發紀錄未真機驗」這項可以拿掉。
4. **Antigravity 的 hook 合約和其他三家都不同**(antigravity.google/docs/hooks,2026-11-10 讀):stdin 是 camelCase、以 `conversationId` 為鍵、沒有 `hook_event_name` 也沒有 `stop_hook_active`;Stop 用 `decision: "continue"` 擋停,`reason` 變成系統訊息;hook 的工作目錄、環境變數、信任流程都沒寫。所以腳本用 `workspacePaths` 找 repo,迴圈防護自己做(每個對話在同一個 HEAD 只提醒一次,標記在暫存資料夾)。
5. **agy 不能進 `GROUPS`**:它讀 `AGENTS.md`,和 Codex 同一個檔;放進 `GROUPS` 會讓 `--force` 時最後一家的 skill 寫法蓋掉另一家。改成獨立平台、共用 Codex 群組的區塊(只裝 agy 時用裸名、兩家都裝時用 `$fw-` 並各附一行)。`update` 與 `doctor` 用「區塊裡有沒有 `` `$fw- ``」分辨 agy-only 的 `AGENTS.md`,否則每次 `update` 都會替 agy-only repo 加裝 Codex(試裝時抓到)。
6. **絆線改成只對瞄準的目標提示**(DECISIONS 2026-11-10,同時部分取代 10-26 那條):Bash 裡只認指令前綴與寫入的路徑(重導、`cp`/`mv`/`tee`/`rm`、`sed -i`);寫入路徑沿用原本的 cwd 推算,所以 `(cd pkg && (cd sub && rm a.ts))` 仍命中。寫入的判讀從 F3 的 `shellWriteTargets` 拆出 `segmentWrites` 共用。
7. **計畫裡一個數字錯了**:研究報告說 STATE 10.6K 字元超過 6,000 門檻,那是 10 月 5 日的舊數字;今天是約 4.8K,在門檻內。計畫檔已註明,`reports/` 第一份報告的 md 未改。

## 交付 / Commits

d5dc241..8e3760f(計畫與五個決定、A1 測試修正、A2 agy 平台、D4 絆線規則)。設計細節在 `docs/plans/narrow-and-launch.md`、`docs/plans/agy.probe.md`、DECISIONS 2026-11-10 五條。

## 驗證證據

| 項目 | 結果 |
|---|---|
| mod 測試 | 修正前 2.1.321 上 521/25(與 10-26 同一組名);只把 kit 的前置閘門答 allow 為 529/17(hook 拿到的是複本,物件同一性比不到);改用內容鍵 546/0;絆線改動後再 546/0 |
| smoke | 全過,新增 48:agy 安裝、與使用者既有 `.agents/hooks.json` 合併、重跑冪等、`update` 不誤認 Codex、`doctor` 0 failed、codex+agy 共用一份 `AGENTS.md`、Stop 對 agy/Claude/Gemini 三種 stdin 各回 continue/block/deny、同 HEAD 只提醒一次、新 commit 再提醒、不合法 id 靜默、標記不進 repo、uninstall 只拿自己那一條 |
| 手動試裝 | 暫存 repo 從 `/` 執行 hook 也找得到 repo(`workspacePaths`);`my-lint` 這種使用者 hook 在 install/uninstall 後保留 |
| 型別與檢查 | tsc 5.9.3 對 2.1.321 型別 clean;`claude plugin validate --strict` 通過 |

## 未完 / 交接

- **[Kai] agy 真機探針**:照 `docs/plans/agy.probe.md` 跑 P1–P8。最大的未知是 hook 的工作目錄:不在 repo 裡的話 `$(git rev-parse --show-toplevel)` 找不到腳本。
- **[Kai] F7 直接觀察**(選做):權限對話框開著時看 `~/.flightwake/sessions/<id>.json` 是 `blocked`。
- **A3 TRAPS 壓實**:active 32 條、13 條無錨點;逐條處置提案要 Kai 放行,下一步就做。
- 還沒做:A7(`/fw-trap` 入選門檻)、A8(套件關鍵字)、A10(凍結標示)、A12(發 0.18.0)。dogfood 副本(`.flightwake/hooks/state-check.mjs`、`.claude/skills/flightwake-mod`)還是舊的,發版前用 `update` 刷新。
