**結論：目前不能合併。** 審至 `5153c17`。上輪兩個原反例已通過，但仍有以下必修。完整 smoke **43 節全過**、外掛 **289／289**、validate 與 Git 唯讀檢查通過；追加四個 hook 測試為 **2 過、2 失敗**。

**依據，按嚴重度排序：**

1. **P1，必修：shell 推斷會把替換內容洩漏進日誌。**  
   實測 `sed -i '' -e 's/foo/bar/' -e 's/password/SECRET_REVIEW/' config.txt`，`/fw-log` 把 `s/password/SECRET_REVIEW` 列為檔名。這是一般多組 `-e` 用法；替換內容若是憑證，會進入 session 日誌，並可能被 fw-record 引用。應正確辨識參數，無法確定時略過，不能把剩餘字串當路徑。[shell.ts:180](/Users/kaiwu/orca/workspaces/flightwake/integration/mods/flightwake/hooks/lib/shell.ts:180)。

2. **P1，必修：uninstall 對「發行檔位置變成目錄」仍會遞迴刪除使用者資料。**  
   上輪型別反例現在能於安裝前拒絕，沒有建立 STATE；但同一個 `hooks/register.ts/` 內放 `KEEP`，再跑 uninstall，仍 **exit 0 並刪除 KEEP**。發行清單指定的是檔案，移除時應拒絕型別不符，不能自動改成整目錄刪除。[cli.mjs:187](/Users/kaiwu/orca/workspaces/flightwake/integration/bin/cli.mjs:187)、[install.mjs:372](/Users/kaiwu/orca/workspaces/flightwake/integration/bin/install.mjs:372)。一般自加 `my-notes.md` 則已確認保留。

3. **P2，必修：repo 外操作會被錯記為 repo 內變更。**  
   `cd /tmp; rm private.txt` 被記成 repo 內的 `private.txt`。目前只處理開頭 `cd … &&`，其他 cwd 變化仍套用原目錄。至少應在 cwd 不確定後停止推斷相對路徑。[recorder.ts:193](/Users/kaiwu/orca/workspaces/flightwake/integration/mods/flightwake/hooks/features/recorder.ts:193)。

其餘核對：

- 真實 PTY 補測最終確認 **Ctrl-C＝130、EOF＝1、多行貼上後答 n＝1**，均未建立安裝產物；非 TTY 與既有取消測試通過。
- 一次性提示與 F4 同時命中時兩者都保留；實際呼叫 `/fw-mod` 前後，檔案與 session state 均未變。原「唯讀」測試只驗未安裝情境，覆蓋不足，補測才確認實際呼叫。[feedback.test.ts:176](/Users/kaiwu/orca/workspaces/flightwake/integration/mods/flightwake/tests/feedback.test.ts:176)。
- `date +%z` 確實新增外部程序，但固定參數、唯讀、不連網，失敗退回 UTC；符合承諾。[recorder.ts:381](/Users/kaiwu/orca/workspaces/flightwake/integration/mods/flightwake/hooks/features/recorder.ts:381)。
- 橫條未增加輪詢，render 不跑 Git；原斷言改為常駐、百分比與功能各自的註冊狀態，符合新需求，沒有把主要驗證刪掉。STATE 提示、`none` 與四語主要描述一致；但「推斷可能不完整」不足以涵蓋上述內容洩漏與錯誤歸屬。

**沒有驗證的部分：**本輪未重跑 tsc、真實 Claude session／Orca 畫面、Windows、跨時區或夏令時間切換、CI。所有實跑均在暫存副本並隔離 `FLIGHTWAKE_HOME`，受審 worktree 未修改。

**考慮過但不採用的做法：**不要求完整 shell 直譯器、交易回滾或擴搜檔案系統攻擊；無法可靠推斷就略過即可。真機重繪效能與跨時區精度可延後；一般指令內容洩漏、錯誤路徑歸屬與已重現的刪檔不宜延後。