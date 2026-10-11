<!-- flightwake:begin v0.17.0 lang=zh-TW -->
## flightwake 工作紀律

本 repo 使用 flightwake(行車記錄器式工作框架):**記錄追隨工作,不引導工作**。
預設一切直接動手,但以下事件觸發對應義務:

| 觸發 | 義務 |
|---|---|
| 本 session 首次要動這個 repo | 先跑 `$fw-coldstart`(讀 `.flightwake/STATE.md` + 最近 record,回報後才動手) |
| 做出關掉其他選項的決策 | 一行 append 進 `.flightwake/DECISIONS.md`(含 why) |
| 發現非顯而易見的坑 | 當下 `$fw-trap` 登進 `.flightwake/TRAPS.md` |
| 動 schema / 動 prod / 自上次 record ≥3 commits | 收尾 `$fw-record`(飛行紀錄 + 更新 STATE;Stop hook 會在落後時提醒) |
| 跨 session 的建設要停手 | `$fw-handoff`(寫 CONTEXT,停手前寫、不是開工前) |
| session 結束 | STATE 必須反映真實現況(health 誠實標色) |

硬防護(與模型強弱無關):測試綠 + typecheck 乾淨才算完成;prod 變更必留驗證證據於 record;
破壞性操作先向使用者確認。
去重原則:同一事實只寫一處(git 能查的不重抄;record/STATE/DECISIONS 各司其職,其他處用連結或 hash 指過去)——寫兩處必有一處過時。
Codex:四個 skill 在 `.agents/skills/fw-*`(用 `$fw-…` 點名);收尾提醒是 `.codex/hooks.json` 的 Stop hook——Codex 首次會要你信任它一次。
<!-- flightwake:end -->

<!-- flightwake-orca:begin v0.17.0 lang=zh-TW -->
## Orca 協作(flightwake 附加元件)

在 Orca 裡工作、要找另一個 agent 討論或審查時:
- 把訊息送進使用者已開的可見 Orca 分頁,再從該分頁讀回覆。不要另起背景程序(例如 `codex exec`)——使用者看不到。
- 找不到合適的既有分頁?先告訴使用者、問他。不要自行決定改走背景。
- Orca 的指令會隨版本變動:不要憑記憶寫語法——用 `orca skills get orca-cli` 讀當前版本的說明。

只有一個寫手(Stop hook 在每個廠牌的 session 都會催收尾;不講清楚誰是寫手,兩邊會同時改 STATE):
- 被找來討論或審查的 agent 不寫 record、不改 STATE,把結論交回給找它的 agent。
- 找人審查的 agent 負責把採納的結論寫進自己的 record。
- 審查者只讀不改——審查請求裡要明講(可見分頁不一定有唯讀限制)。要改由主線 agent 改,讓所有變更都留在同一邊的紀錄。

請對方審查時,要求回覆包含四項:結論;依據(檔案與行號);沒有驗證的部分;考慮過但不採用的做法。
會影響決策的審查回覆,原文存成 repo 裡的檔案(比照 `docs/plans/<主題>.review-<審查者>.md`):終端機畫面不會留存,主線也只拿得到審查者的最終結論,拿不到過程。
<!-- flightwake-orca:end -->
