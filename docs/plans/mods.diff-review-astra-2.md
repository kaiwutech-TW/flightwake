**結論：仍建議修正後再合併。** 範圍 `1faec87..2cb276f`。原八個反例的對應案例已通過；七項中，第 **1、2、5 項仍有鄰近缺口**，第 3、4、6、7 項在本輪驗證範圍內成立。受審 worktree 未修改。

**依據，按嚴重程度排序：**

1. **P1：F3 仍會把吞錯或未執行測試記成 pass。**  
   暫存反例：package script 為 `sh -c "pytest || true"`、`bash -c "pytest; exit 0"`，仍記 pass；引號內的 shell 本體沒有被判為複合指令。另 `cargo test --no-run`、`jest --listTests=true`、`mvn test -DskipTests` 也被記 pass。甚至原本已排除的 `pytest --help`，只要 STATE 宣告它是測試指令，就由 fallback 重新收錄為 pass。  
   [recorder.ts:138](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/recorder.ts:138)、[recorder.ts:249](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/recorder.ts:249)、[recorder.ts:266](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/recorder.ts:266)。[Cargo 文件](https://doc.rust-lang.org/cargo/commands/cargo-test.html)確認 `--no-run` 不執行測試。

2. **P1：F5 的重疊規則仍有 `*` 例外。**  
   規則 `["*","src/**","src/private/**"]`，只執行 `/fw-role-release 1`，就連帶放行全部規則。原因是字面 glob `*` 與「all」共用同一儲存值。一般三條重疊規則逐項放行、再 `revoke` 的案例則通過。  
   [role-guard.ts:64](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/role-guard.ts:64)、[role-guard.ts:144](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/role-guard.ts:144)。

3. **P2：F4 的 cwd 修正仍會誤報與漏報。**  
   `cd pkg || rm src/a.ts`、`cd pkg & rm src/a.ts` 被錯當成操作 `pkg/src/a.ts`；前者執行 rm 時 cd 必然失敗，後者的 cd 不改變父 shell。`(cd pkg && rm src/a.ts)` 及更深子 shell 則漏報。一般連續 `cd pkg && cd sub && …` 已通過。  
   [tripwire.ts:60](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/tripwire.ts:60)、[tripwire.ts:82](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/tripwire.ts:82)。

4. **P2，新回歸：F3 共用旗標黑名單會漏掉合法測試。**  
   `mvn test -V` 完全不收錄；但 Maven 的 `-V` 是顯示版本後繼續建置。應按 runner 解讀旗標。一般 pytest、`npx vitest run`、`npm test` 仍能記錄，尚未出現「幾乎不記錄」的全面退化。  
   [recorder.ts:139](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/features/recorder.ts:139)、[Maven 官方說明](https://maven.apache.org/ref/3.9.11/maven-embedder/cli.html)。

其餘驗證與測試可信度：

- **原版 210 pass／0 fail**；暫存副本追加 23 個鄰近案例後，**221 pass／12 fail**。validate 通過，僅 author 警告。上述功能反例使用測試引擎模擬工具結果。
- **零寫入修正成立於已查路徑：**五個功能的 Git 呼叫均帶 `--no-optional-locks`；真 Git 對照組會改 index，外掛指令組保持 index 位元組不變。未見直接檔案寫入或網路呼叫；保留的是規格允許的 session 狀態／放行紀錄。[git-readonly-check.sh:13](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/scripts/git-readonly-check.sh:13)。
- **root／來源：**缺 STATE 靜默、切 root 不繼承座位與放行、缺 origin 拒絕皆通過。路徑仍只做字串正規化，不解析 symlink；別名繞過限制仍存在。[core.ts:77](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/lib/core.ts:77)。
- **讀取範圍：**AGENTS／GEMINI 是整檔讀入，但僅提取 marker 語言；新增案例確認 AGENTS 正文不注入、其角色不控制 Claude，未見用途擴張。[core.ts:155](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/hooks/lib/core.ts:155)。
- **生命週期自動測試仍只是重送同 ID 的 `session.start`。** record 另記一次真熱重載後 F3 log 保留，但不能據此證明真正 resume／compact 或其他狀態。[lifecycle.test.ts:118](/Users/kaiwu/orca/workspaces/flightwake/mods/mods/flightwake/tests/lifecycle.test.ts:118)、[record:54](/Users/kaiwu/orca/workspaces/flightwake/mods/.flightwake/records/261005-flightwake-mod.md:54)。

**沒有驗證的部分：**真機 reload／resume／compact、實際 worktree／symlink 下引擎回傳的 root、composer 來源不可偽造性、各 runner 真實執行、tsc、完整 smoke 與 CI。record 的真機敘述本輪未獨立重現。

**考慮過但不採用的做法：**不把 F5 擴成 shell 安全沙箱；不為 F3 實作完整 shell 直譯器，無法證明的包裝指令應記 unknown。也不把 `npm test --ignore-scripts` 當成反例：[npm 文件](https://docs.npmjs.com/cli/test/)明示它仍執行指定的 test script。