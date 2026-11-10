---
record_id: 261110-agy-probe
session: Claude Code(Opus 5.5),2026-11-10(接續 [[261110-narrow-b3-a5-draft]])
date: 2026-11-10
repos: [flightwake]
tests: smoke 全過(含 48 agy 節,`P=$(dirname $(uv python find 3.12)); PATH="$P:$PATH" bash test/smoke.sh` exit 0);本 repo doctor 0/0;mod 未動,沿用上一份的 546/546
prod_changes: none
---

# agy 真機探針:P1–P8 全部成立

**TL;DR**:A2 依官方文件寫的 Antigravity 收尾 hook 一直沒在真機觸發過,是 0.18.0 發版前最後一個未知。Kai 開好 agy 後,主線透過一個可見的 Orca 分頁,在拋棄式 repo 裡操作 agy CLI 1.5.3 跑完探針 P1–P8,全部成立。hook 指令不必改;doctor 拿掉「未真機驗證」提示,文件和 CHANGELOG 改成已驗證。

## 關鍵發現

1. **hook 的工作目錄是 `<repo>/.agents`**(hooks.json 所在的資料夾),不是 repo 根目錄。安裝的指令用 `git rev-parse --show-toplevel`,在 `.agents/` 裡照樣找得到 repo,所以不必改;腳本裡註明不能拿 cwd 當根目錄。只看到這一種放法(workspace hook),沒有對照 user 層的 hook,所以寫在探針文件和程式註解,不登 TRAPS(探針文件預先寫好的處置:全部成立就不登)。
2. **提醒的路徑和文件一致**:`decision: "continue"` 的 `reason` 以 `SYSTEM_MESSAGE` 注入(「Stop hook blocked termination: …」),agy 接著再跑一輪;同對話同 HEAD 只提醒一次;Stop 每個回合結束都會呼叫,不只是離開時。
3. **agy 會自己遵守義務表**:只說「接手這個 repo」它就讀 fw-coldstart;連「列出檔案」這種小事它也先讀 fw-coldstart。fw-trap、fw-record、fw-handoff 都照 skill 的步驟做(把握度判斷、去識別化掃描、commit 範圍正確)。
4. **附帶觀察(各一次,線索)**:被擋下的那次 Stop 沒有跑到名稱排在後面的 hook,看起來 agy 依名稱順序跑、遇到擋下就停,Orca 的 `orca-status` 那一次可能也沒跑。stdin 比文件多 `executionNum`、`transcriptPath` 等欄位(完整清單在探針文件)。
5. **發版前才有的失敗**:fw-trap 照 skill 先跑 `npx flightwake traps similar`,npm 上的 0.17.0 沒有這個指令。0.18.0 發佈後就會好;這也是發版的理由之一。

## 交付 / Commits

e23e607(doctor、state-check 註解、multi-agent 雙語表格、CHANGELOG、探針結果)。

## 驗證證據

- 探針逐項結果與原文引述:`docs/plans/agy.probe.md` 的「結果」欄。stdin 與 cwd 用一條暫加的 Stop hook 擷取(檔案在 session scratchpad,不入版控)。
- 拋棄式 repo 裡 `doctor` 0 failed;`uninstall` 只拿掉 `flightwake-state-check`,暫加的 hook 留著,registry 登記也移除(`grep -c agy-probe ~/.flightwake/registry.json` → 0)。
- 本 repo 的安裝副本已刷新,和原始碼只差註解那兩行(已一併 commit)。

## 未完 / 交接

- **[Kai] 發 0.18.0**(A12,對外動作,要你確認):CHANGELOG 分出 `[0.18.0]`、mod 版號從 0.3.0 往上推、發佈證據寫進 record。之後 push `main`。
- B1 第二句候選(提到 Antigravity)現在可以用了。
- 用 agy 的使用者 repo 要明確加 `--agents=…,agy`(偵測只認已裝的 hook)。
