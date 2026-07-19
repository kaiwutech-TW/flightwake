<!-- flightwake:begin v0.9.0 lang=zh-TW -->
## flightwake 工作紀律

本 repo 使用 flightwake(行車記錄器式工作框架):**記錄追隨工作,不引導工作**。
預設一切直接動手,但以下事件觸發對應義務:

| 觸發 | 義務 |
|---|---|
| 本 session 首次要動這個 repo | 先跑 `/fw-coldstart`(讀 `.flightwake/STATE.md` + 最近 record,回報後才動手) |
| 做出關掉其他選項的決策 | 一行 append 進 `.flightwake/DECISIONS.md`(含 why) |
| 發現非顯而易見的坑 | 當下 `/fw-trap` 登進 `.flightwake/TRAPS.md` |
| 動 schema / 動 prod / 自上次 record ≥3 commits | 收尾 `/fw-record`(飛行紀錄 + 更新 STATE;Stop hook 會在落後時提醒) |
| 跨 session 的建設要停手 | `/fw-handoff`(寫 CONTEXT,停手前寫、不是開工前) |
| session 結束 | STATE 必須反映真實現況(health 誠實標色) |

硬防護(與模型強弱無關):測試綠 + typecheck 乾淨才算完成;prod 變更必留驗證證據於 record;
破壞性操作先向使用者確認。
去重原則:同一事實只寫一處(git 能查的不重抄;record/STATE/DECISIONS 各司其職,其他處用連結或 hash 指過去)——寫兩處必有一處過時。
<!-- flightwake:end -->
