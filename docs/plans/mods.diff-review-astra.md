**結論：暫不建議合併。** 五個功能與開關大致到位，延後的 skill／模板整合也符合第 2 版；但仍有測試證據誤判、守門範圍錯誤及間接寫入。審查 HEAD：`1faec87`；未修改 worktree，以下實跑皆在暫存副本。

**依據與問題，按嚴重程度排序**

1. **P1：F3 會把未通過／未執行測試記成 pass。**  
   暫存反例：package script 為 `pytest | cat`，`npm test` 被記為 pass；`pytest --help` 也被記為通過。script 只檢查少數吞錯字串，沒有對 script 本體套用複合指令判定；runner 名稱辨識也未排除 help／version 等模式。應將這些情況列 unknown 或不收錄。  
   依據：[recorder.ts:113](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/recorder.ts:113)、[recorder.ts:239](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/recorder.ts:239)。

2. **P1：F5 放行一條規則，會順便繞過其他重疊規則。**  
   實測規則 `["src/**","src/private/**"]`，只放行 `src/**` 後，`src/private/x.ts` 也能寫入。程式只檢查第一個命中項；應檢查所有命中且尚未放行的規則。  
   依據：[role-guard.ts:238](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/role-guard.ts:238)。

3. **P1：F5 會誤擋未安裝 flightwake 的目錄。**  
   缺 STATE、但有 roles marker，仍會攔寫；同 session 換到另一個沒有 flightwake 的 root，也沿用舊座位。快照只有 session ID，沒有 root，且未走 `fwContext`。F3 同樣在缺 STATE 時繼續記錄，違反規格末尾「所有功能靜默」契約。  
   依據：[role-guard.ts:52](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/role-guard.ts:52)、[recorder.ts:447](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/recorder.ts:447)。

4. **P1：外掛不是嚴格零寫入。**  
   F2／F3 呼叫普通 `git status --porcelain`，Git 可以刷新 index。暫存 repo 實測相同 F2 指令，stdout 為空但 `.git/index` 位元組改變。應使用 `git --no-optional-locks …`，並測實際 index。未見直接網路呼叫、`fs.write` 或 Markdown 寫入，但這不足以證明唯讀。  
   依據：[core.ts:183](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/lib/core.ts:183)、[recorder.ts:485](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/recorder.ts:485)。

5. **P2：F4 路徑解析會漏報，也可能誤報。**  
   實測 `paths: ["pkg/src/**"]` 遇到 `cd pkg && rm src/a.ts` 沒提示：所有相對路徑都直接套 root，忽略實際 cwd／cd。反向也可能命中錯誤的根目錄路徑。共用 parser 遇 `#` 就停止整份命令，連下一行也忽略。  
   依據：[tripwire.ts:55](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/tripwire.ts:55)、[shell.ts:80](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/lib/shell.ts:80)。  
   此外，提示在工具執行**後**才附上；這符合已記錄的決策，但不能防止當次重踩。

6. **P2：F1 初始化判定過寬，且與第一階段 notes marker 不相容。**  
   已填 STATE 只要含兩個合法範例 `{{customer}}`、`{{order}}`，就被判尚未初始化，整份快照被初始化提示取代。另實測 `lang=zh-TW profile=notes` 被忽略，語言退回英文。應辨識已知模板欄位，marker 則容忍額外屬性。  
   依據：[core.ts:132](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/lib/core.ts:132)、[core.ts:163](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/lib/core.ts:163)。

7. **P2：使用者放行的來源檢查仍有例外。**  
   明確非 composer 的來源會被拒絕，但 `origin === undefined` 被允許；正式碼不宜為測試保留這個例外，應明確要求 composer，測試也提供來源。**目前沒有證據證明模型能在真引擎偽造 composer**，不能因此宣稱已找到自主放行漏洞。  
   依據：[role-guard.ts:256](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/role-guard.ts:256)。Bash、子 agent 與路徑別名可繞過，則屬目前「非安全邊界」定位的限制。

**測試實際證明的範圍**

- 原版：validate 通過，僅 author 警告；**173 pass／0 fail**。
- 暫存副本追加 8 個反例：**173 pass／8 fail**，涵蓋上述 script、help、缺 STATE、重疊規則、cwd、模板與語言問題。
- 生命週期測試沒有真正 reload／resume／compact，只重送同 ID 的 `session.start`；「git 與 settings 拋錯」案例實際只有 git 回失敗，settings 仍正常。缺安裝案例也沒檢查 recorder state，因此漏掉持續記錄。  
  依據：[lifecycle.test.ts:118](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/tests/lifecycle.test.ts:118)、[lifecycle.test.ts:164](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/tests/lifecycle.test.ts:164)。

**沒有驗證的部分：**未重做真機互動載入、來源不可偽造性、真正生命週期、UI/toast、tsc 或完整 smoke。功能關閉與多數缺檔容錯已有測試支持；任意單一模組拋錯均不影響其他功能，尚不能由現有測試全面證明。

**考慮過但不採用的做法：**不把 F5 擴成 shell 安全沙箱；不以 runner 名稱加 exit 0 代替測試證據；不因 validate／173 測試全綠就接受生命周期與唯讀宣稱；也不修改原始碼替實作者修補。