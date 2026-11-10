# A5 tripwire-hook 設計唯讀審查（Codex）

審查日期：2026-11-10。讀取時 HEAD：354b95514e7abc1ff05ee553c7de29c91d9bd5b3。審查對象是設計與現有實作，不是尚未存在的新 hook 的驗收。

## 一、結論

**請修訂後再實作。跨平台的一般 hook 值得做；現稿不能支持「模型在這次修改前先看到坑」的核心承諾。** 最大問題不是解析器，而是把「hook 在工具前執行」當成「模型在工具前有一次讀取提示並重新決策的機會」。Claude Code 官方文件已明確否定後者；Codex 的 additionalContext 契約也不能單獨證明後者。

三個指定問題的判斷：

- **單一 traps-core.mjs：值得，但應限制為純解析／比對核心。** 先做載入與型別探針，再搬現有行為；不要順便改 YAML、shell 或 glob 語意，也不要把 fleet I/O 拉入核心。
- **<base>/hints/<session id>.json：位置可以接受，協定尚不完整。** 必須補 repo、版本、接收者範圍、併行寫入、初始化與清理；它是可丟棄的提示快取，不是 trips，也不是已確認送達的證據。
- **以 settings 登記決定 mod 不提示：不可靠，應改。** 靜態登記只能證明配置意圖；它不能證明該次呼叫的 hook 成功執行並產生對應提示。

在「永不擋」保持不變的前提下，建議把 A5 的承諾改為「一般 hook 提供按目標篩選的 context，讓後續模型步驟使用，並覆蓋沒有 mod 的安裝」。若一定要讓模型在第一次修改前重新考慮，必須另做可中止／重試或更早注入的設計決策，不能靠換事件名稱達成。

## 二、依據（檔案與行號）

### 1. [P0] 執行時序使目前的產品承諾不成立，Q1 會得到假陽性

設計稿 docs/plans/tripwire-hook.md:10–20、:69 把「事後才提示」列為要消除的限制；narrow-and-launch.md:124–125 更直接承諾「改到同一個檔之前會先看到」。但是目前 Q1 只要求模型複述 context。工具已執行後再複述，一樣會通過，沒有測到這次呼叫是否受提示影響。

Claude Code 官方 Hooks reference 的「Add context for Claude」明訂 reminder 於下一次模型請求讀取；PreToolUse decision control 明訂 additionalContext 隨工具結果提供。這是文件確認，不只是對事件名稱的猜測。[官方文件：context 送達時機](https://code.claude.com/docs/en/hooks#add-context-for-claude)、[PreToolUse decision control](https://code.claude.com/docs/en/hooks#pretooluse-decision-control)。

因此設計稿 :75 的退路不能只寫成「Q1 不成立，Claude 回 mod，Codex 繼續」：Codex 也必須驗同一個時序命題。支持 additionalContext，和在執行待決工具前再次呼叫模型，是不同能力。對 Codex 這一點是從呼叫流程提出的推論／驗證要求，本次沒有追到執行器原始碼或真機 trace，不把它冒充成已證實的廠商實作。

**修正與驗收：** 先選定實際承諾。若要驗「本次修改前模型能採納」，用無害的暫存檔測試：模型原先送出寫入 A，hook 只回帶隨機 nonce 的指示，要求改寫 B；記錄 hook 回傳、工具實際寫入及下一次模型請求的順序。只有工具尚未執行前出現模型重決策，才算通過。事後改成 B、口頭說「先看到了」、或成功複述 nonce 都不算。這個探針由主線在獨立暫存環境執行。

### 2. [P1] settings 有登記就關掉 mod，會把可恢復的失敗變成完全漏報

設計稿 :53–55 的判斷會在下列情況失效：登記的 matcher 只涵蓋部分工具、腳本／traps-core 遺失、node 啟動失敗、腳本崩潰或逾時、設定在磁碟上但本次未被採用。即使比對完整 command 而非子字串，這些假陽性仍存在。

反向也有漏判：一般 hook 可以來自 user、managed 或其他有效設定來源，只讀兩個專案 settings 可能讓 hook 與 mod 重複提示。Claude Code 有設定層級與 disableAllHooks，磁碟檔案不是完整有效狀態；這也可由官方設定與 hook 文件核對。[settings precedence](https://code.claude.com/docs/en/settings)、[停用 hooks](https://code.claude.com/docs/en/hooks#disable-or-remove-hooks)。

現有 tripwire.ts:240–254 先記 trips，再判斷提示去重；:260–279 的 mod 在 next(e) 之後才附加 context，正好有機會觀察該次一般 hook 留下的紀錄。建議保留這個次序：mod 仍算 trips；只有讀到與該接收者／repo／entry version 對應的近期「hook 已產生 context」紀錄，才省略提示。若要證明是本次執行，紀錄還須關聯 tool_use_id；舊的「hook 啟動過」標記不足。可把這份協調資料放進 hints，避免再增一套任意 marker。

**限制必須誠實：** 一般 hook 寫入紀錄只能證明它產生了輸出，不能證明宿主已將輸出交給模型。先寫紀錄後 stdout 失敗、另一個 hook deny／改寫、或宿主丟棄 context，仍可能造成漏報。因此這只能是最佳努力去重；拿不到可靠證據時保留 mod fallback，允許少量重複。若平台無法可靠讓 mod 讀到它，先接受雙提示也比設定存在即靜音好。不要為省 context 做出更強的送達保證。

### 3. [P1] hints 路徑合理，但「每 session 每條一次」不足以當儲存協定

設計稿 :47–49 只規定位置、0700 與拒寫；以下須在實作前定義：

- **鍵與資料：** 至少 schema version、host、session、repo 身分、trap name、entry version。兩個 repo 可以有同名且同內容的條目，不能因 /cd 共用 session 而互相壓掉。entry version 必須保留，否則 session 中修正 TRAPS 後仍不提示。既有 tripwire.ts:243–251 用 name@version；tests/tripwire.test.ts:175–195 已保護「條目更新重提示」與「一次最多五條，其餘下次再提示」。只把真正輸出的條目標為 seen，不把全部命中都吞掉。
- **接收者：** Codex 子代理與主線可能沒有相同 context。去重應依能證明共享 context 的範圍，而不是只依程序或父 session。現有 Claude 測試 :198–201 確實刻意共用 session 去重；那是現有政策，不能無驗證就當成跨平台正確性證據。若 hook 沒有穩定接收者 ID，明列「同 session 可能僅第一個接收者看到」的限制，或選更保守的去重範圍。
- **併行：** 每次 hook 是新行程。兩次 read→modify→write 即使用原子 rename，仍會遺失更新；兩次都讀到未提示也會重複輸出。要嚴格去重需帶逾時的跨行程鎖並重讀合併；若延遲成本不值得，可接受最佳努力，但不能寫成嚴格「一次」。原子替換防半截 JSON，不能取代互斥。
- **失敗政策：** 無合法 session ID、HOME 不可用、權限不足、foreign file、壞 JSON、鎖逾時都繼續提示；不要把所有缺 ID 呼叫收進同一個 unknown.json。不要保存 patch 全文、指令全文或提示內文，存識別鍵即可。
- **生命週期：** 非 mod 的安裝誰建 hints？何時清理？uninstall --purge 是否清本 repo 的鍵、prune 是否有 TTL？必須講清楚。這是可丟快取，預設存 user cache 也合理；若沿用 base，需有明確清理入口，不能只靠使用者刪整個 fleet。

現有拒寫的具體規則在 features/fleet.ts:365–393，含字面／實體路徑不在 repo、拒 symlink／foreign file、探測不明即拒寫；:768–801 額外要求 trips 目錄已存在且私有、讀檔合併。fleet.ts:45–55 與 bin/fleet.mjs:39–44 定義 base／安全 ID。CLI 端新的 writer 應以 Node fs 明確實作同等保護，檔案用 0600；不能因為 mod 的 guard 已存在，就假設新 hook 自動得到保護。

另有相容性決策：DECISIONS.md:135 解釋 fleet:false 的人原本預期不在 repo 外寫入，所以 trips 預設跟 fleet。新 hints 即使不算使用統計，依然是 repo 外持久寫入；需要明講新的預設與關閉方式，不應默默借用 trips 開關，也不要連同核心提示一起關掉才容許無快取模式。

### 4. [P2] 共享核心值得，範圍要從真實依賴圖畫出來

不贊成為了「減少碰檔」刻意保留第三份解析器。當三個入口必須遵守同一組比對規則，共享純函式比長期人工同步合理。現有重複還不只 frontmatter：bin/traps.mjs:21–90 明寫 MIRRORS，:92–121 另有 glob compiler；mod lib/traps.ts:11 依賴 core.ts 的 YAML/list/hash；tripwire.ts:53–145 自己持有 matchFile／matchBash 與 cwd 分支追蹤。只搬設計稿點名的三支 lib，卻把這段留在 feature 裡，hook 還是要再抄一次主比對流程。

建議核心包括解析與完整 entry 資料、glob 基元、shell 基元、詞法路徑正規化、目標比對與 patch header 解析。I/O、設定、語言 rendering、拒寫／去重、trips 與 REFUSAL_RE 這類宿主行為留在 adapter。核心可以有多個命名 export；「一個可複製單元」不表示要做大而泛用的框架。

須守住幾個容易漏掉的相容面：

- CLI 的 entry 有 tags／discovered（bin/traps.mjs:78–79），mod 型別沒有（lib/traps.ts:15–26）。合併時保留 CLI 完整資料，否則 similar 功能退化。保留舊 export 或薄 re-export，避免重構擴散到既有呼叫者。
- shell.ts:2–4、:183–184、:232–258 是 F3 recorder 與 F4 共用，而且兩者 cwd 策略不同。不能把 recorder 的保守候選與 tripwire 的多 cwd 搜尋混成一種。glob.ts:2 也供 roles 使用；維護模式不代表這些消費者可以不驗。
- core.ts:101–114 的 relToRoot 是詞法正規化；新核心要帶走這項依賴，又不可反過來 import 帶 I/O 的 core.ts。原 core 的其他使用者可 re-export 純 helper，避免第二份。
- 新 .mjs 脫離 TS 後，要有 JSDoc/checkJs 或明確 .d.mts 契約，不能以 any 通過 typecheck。不要把整個專案調成 allowJs 然後把乾淨 typecheck 當保證。

設計稿 :39 所援引的 TRAPS mod-loader-static-rules，只證明 $／on 的跨檔限制與純函式方向（TRAPS.md:17–20），沒有證明當版 loader 一定接受 .mjs。因此 Q5 仍必做，並補真正的 plugin test／執行期 import；validate 單獨通過不等於 Node 端與 mod 端都載入成功。若 Q5 不成立，可從單一來源產生發佈產物，保留兩份人工解析器只宜暫時退路。

不以「546 個測試全綠」代替覆蓋範圍。還要有少數針對共用邊界的差異測試：同一 TRAPS fixture、command、cwd 在 mod／CLI／已複製 hook 得到同一 entry 與 hit；安裝副本真的能獨立 import，不靠 npm cache。無須新增大量鏡像單元測試。

### 5. [P1] Codex 契約大致寫對，但有幾個必補邊界

以下由本次取得的官方 OpenAI Hooks 文件核對；是文件證據，尚未做本機互動探針。[OpenAI Hooks](https://learn.chatgpt.com/docs/hooks)。

- **輸入正確：** Bash／apply_patch 都用 tool_input.command。後者須辨識 Add／Update／Delete／Move to、多檔、空白與相對路徑；不要掃 diff 本文裡看似檔名的字串。shell 呼叫 apply_patch 是另一條路徑，目前 segmentWrites 不支援，須列為已知缺口而非宣稱全部修改都覆蓋。
- **matcher 可用：** Bash|apply_patch 合法；「只比工具名」應補別名，apply_patch 也匹配 Edit／Write。可用 ^(Bash|apply_patch)$ 明確限定。
- **輸出形狀：** 補完整 JSON 範例，含 hookEventName:PreToolUse，只回 additionalContext；勿加 permissionDecision:allow 來表示「不擋」，勿套 Stop 的 decision:block。約 2500 token 是溢出預覽門檻，不是硬上限。
- **信任兩層：** project layer 與個別 hook trust 都要成立；新／改 hook 定義會待審，/hooks 可停用。文件只說定義 hash，不能推論改被引用 .mjs 必定重信任或必定免信任。Q3 分測 hooks.json、腳本、traps-core，保留原始觀察。
- **執行環境：** hook 命令 cwd 是 session cwd；保留與 repo root 的區分，另測 exec_command.workdir。多 hook 併行；不要假定讀得到其他 hook 改寫後的輸入。
- **去重身分：** 官方明訂子代理 hook 使用父 session_id；因此僅用 session 檔名不能證明每個 agent 都看過。

設計稿 :71 已把更新腳本信任列為問題，這是對的，不能在 :59–61 的 doctor 結果或文件中提前說成「已啟用」。TRAPS codex-project-trust 的 confidence 是 probable（TRAPS.md:84），其中夾有對 Orca 的推測；精確路徑限制應由當版 TUI 探針確認，不拿它當已驗安全前提。亦不要只見全域 Orca hook 有執行就宣稱專案 hook 成功：TRAPS.md:106–109 已記錄這個誤判。

### 6. [P1/P2] 安裝／更新還缺 feature 開關與成對版本的決策

設計稿 :59–61 要預設安裝；mod 目前有 tripwire:false（hooks/register.ts:20–23、:39–44）。如果一般 hook 無條件安裝且不讀共用開關，舊使用者關掉 tripwire 後，update 又開始提示。請明定新的跨平台 opt-out，或寫清遷移語意；trips:false 與不提示仍是兩回事。

bin/install.mjs:685–705 目前逐檔寫入，既有檔在非 FORCE 時跳過。新增相依的兩支 mjs 後，須避免 trap-check 更新而 traps-core 仍舊、或任一檔無法寫入卻已登記 hook。定義相容版本／成對更新及失敗時保留上一個可用版本。doctor 除「存在」也要檢查獨立載入與 pair 相容；這只能證明安裝完整，不能證明宿主信任或送達。

現有 Stop 安裝用 includes 判重（install.mjs:748、:765、:835），不應直接升格為新功能的所有權判定。新增 PreToolUse 應精確識別自身 event／handler／command、保留同群其他 handler；移除不可整群刪掉。沿用 --private 的細節是合理的，但要保留 :814–825 的 tracked Codex 設定跳過與提示，不可讓「預設核心功能」越過該規則。

效能目標 :62–63 可留，但測整次 hook command，不只核心函式；至少報多次冷啟動的中位數／較慢分位，包含 repo root 解析、讀檔、去重安全檢查。並設定短且 fail-open 的 timeout；不能只看一次 <100ms。這是驗收完善項，不主張先做快取守護行程。

## 三、沒有驗證的部分

- 沒有修改、新增或刪除任何 repo 檔案；沒有 commit、record、STATE／DECISIONS／TRAPS 寫入。唯一寫入是本篇指定的 repo 外審查檔。未執行會產生產物或修改使用者設定的測試。
- 沒有做 Q1–Q5 真機探針、沒有啟動新的 Codex／Claude session、沒有變更信任、沒有載入新的 .mjs。Q1 的 Claude 文件結論已取得，但當版互動行為仍需主線保留證據。
- 沒有重跑 546 個 mod 測試、smoke、typecheck 或 validate；本次沒有程式變更，既有測試通過也不能證明這份尚未實作的設計成立。STATE 的測試數字是前次紀錄，非本審查的新結果。
- 沒有驗 apply_patch 實際 hook payload、move／多檔路徑、workdir override、hook 合併後 context 是否在 deny／改寫時仍送達、子代理可取得的穩定身分、resume／compact 的 context 與 hints 關係。
- 沒有驗本機 Codex 0.167.0 的信任 hash 範圍（從 /opt/homebrew/bin/codex 的連結辨識安裝版本，未靠新 session 探針）；官方現行文件可能比這個版本更新。來源頁於本次讀取，不能替代部署版本測試。
- 沒有量延遲、併行競爭、磁碟滿／權限拒絕／symlink 對照或 Windows 路徑。上述安全與一致性要求是設計審查，非已通過的執行測試。
- 審查開始 git status 為乾淨，後段唯讀查詢出現未追蹤 docs/install.md；本審查沒有建立或讀取它。這個共享工作區有其他寫手活動，不能把末態差異歸為本審查產物，也不能保證主線後續未更新其他內容。

建議探針優先序：先解決時序／產品承諾，再驗 .mjs 載入與型別，再驗各平台實際 payload／信任，最後驗提示去重協定、共存與安裝失敗路徑。這樣不會先重構完才發現 A5 最想提供的行為不存在。

## 四、考慮過但不採用的做法

1. **新增第三份解析器，靠「記得同步」維持。** 不採用：目標是跨宿主同規則，複製最容易把 shell／cwd／版本處理分叉。Q5 失敗時才考慮短期兩份，並用共用 fixture 鎖定。
2. **讓 hook 執行時 npx／import 已安裝的 flightwake。** 不採用：破壞安裝副本可獨立執行、離線與版本可預期的條件，還可能落到 npm 舊版。複製小型零依賴核心較合適。
3. **為了嚴格一次提示加入 daemon、SQLite 或 fleet 服務。** 不採用：一個提示快取不值得引入服務生命週期。先選簡單檔案加有界鎖，或誠實接受可重複的最佳努力；不要假裝 rename 本身解決競爭。
4. **把 hints 寫進 trips 或 TRAPS frontmatter。** 不採用：提示生成與實際執行命中是不同事實；後者遇拒絕不該記，混用會污染 stats，也讓每次工具呼叫改 repo。
5. **settings 裡找到檔名就永久靜音 mod。** 不採用：優先避免漏報；應以具體呼叫／條目輸出證據協調，證據不明保留 fallback。
6. **一律 deny 一次、請模型讀提示後重試，當成此次 A5 的小修。** 不採用：它可能解決本次重新決策，但直接改變「永不擋」的明確邊界，還有重試、並行、去重與使用者體驗問題。可以另立設計，不能在本案偷偷加入。
7. **在 session start 注入所有 active TRAPS 來保證一定先看。** 不採用：失去按目標提示的成本優勢，也無法保證 session 中新增的條目；若未來改成更早且精準的注入，應另驗其選取依據。
8. **只把 hook 回 stdout 或拿模型事後複述當驗收。** 不採用：無法證明該次呼叫之前的模型可見性，會把本次最關鍵的失敗藏起來。
