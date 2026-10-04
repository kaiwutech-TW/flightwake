**結論：目前仍不建議合併，合併前必修兩項。** 範圍 `2cb276f..fb64c10`。原版 **249 pass／0 fail**；暫存副本追加 23 個鄰近案例後，**262 pass／10 fail**。validate 與 Git index 唯讀對照通過；未修改受審 worktree。

**依據與合併前必修：**

1. **P1：F3 的「正面證明」仍忽略會停止測試執行的環境變數與參數值。**  
   下列全部仍被記成 pass：
   - `PYTEST_ADDOPTS=--collect-only pytest`，包含放在 package script 裡。
   - `pytest -o addopts=--collect-only`。
   - `go test -count=0 ./...`、`go test -run "^$" ./...`。

   **已用真實 pytest／Go 驗證：**同一份必敗測試正常執行 exit 1，以上模式不執行測試、exit 0。原因是 `seg.env` 未參與證明，帶值旗標則直接跳過值。應檢查影響執行的值／環境設定；無法證明時保持 unknown。  
   [testcmd.ts:231](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/lib/testcmd.ts:231)、[testcmd.ts:355](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/lib/testcmd.ts:355)、[testcmd.ts:406](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/lib/testcmd.ts:406)。

2. **P2，新問題：F4 的候選 cwd 集合可能指數膨脹。**  
   每個不確定的相對 `cd` 都保留原集合並加入新集合，沒有上限。暫存抽測原匹配函式：18 個不同目錄的 `cd` 以分號串接，僅 **145 字元就產生 262,144 個候選**。提示條數上限不限制這段計算；應加候選／計算預算及降級策略，避免提醒功能拖慢工具回覆。  
   [tripwire.ts:100](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/tripwire.ts:100)。

**可以留到之後：**

- **常見指令覆蓋不足，但尚未失去實用性。**新增的 10 個一般測試／型別檢查案例全部記 pass；但 `pytest --disable-warnings`、`jest --watchAll=false`、`npx vitest --run` 被記 unknown。後兩者明確關閉 watch，值得補表，但不會偽造證據。[testcmd.ts:45](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/lib/testcmd.ts:45)、[Jest 文件](https://jestjs.io/docs/30.0/cli)、[Vitest 文件](https://main.vitest.dev/guide/cli)。
- **F4 仍有提醒覆蓋缺口：**`cd -- pkg && rm src/a.ts`、`echo x >pkg/src/a.ts` 漏掉 `pkg/src/**`。多提示有每次五條、同 session 去重限制，但仍可能提示根本沒碰到的路徑；目前是規格明訂的取捨。[tripwire.ts:89](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/tripwire.ts:89)。
- 真正 resume／compact、路徑別名及 UI 真機驗證，可維持明列限制。

**上輪十二例與 F5／record 的判讀：**

- F3 原六個假 pass 已轉 unknown，`mvn test -V` 恢復 pass；F5 字面 `*` 與兩個子 shell 漏報已修。**F4 的 `||`／`&` 原負向案例仍可能多提示**，只是新契約接受，不宜稱為精準消除誤報。
- F5 額外測試「all → revoke → 只放行 `*`」通過，未再發現放行範圍超出指定規則。[role-guard.ts:136](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/role-guard.ts:136)。
- record 現已如實區分模擬事件、舊版真機觀察與未驗證事項；沒有把本輪測試冒稱為真正 reload／resume／compact。[record:67](/Users/kaiwu/orca/workspaces/flightwake/mods/.flightwake/records/261005-flightwake-mod.md:67)。

**沒有驗證的部分：**本輪真機載入、完整生命週期、所有 runner、tsc、完整 smoke、CI；F4 壓測未推到引擎逾時或記憶體耗盡。歷史真機紀錄未獨立重現。

**考慮過但不採用的做法：**不把每個 unknown 都當合併阻礙，也不要求完整 shell 直譯器；優先堵住假 pass，並限制提示計算成本。不因新契約接受多提示，就把原本的假陽性算成精準修復。