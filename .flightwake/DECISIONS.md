<!-- flightwake DECISIONS — append-only。一行一決策,新的加在最上面。 -->
<!-- 什麼算「決策」:關掉了其他選項的選擇。格式:日期 | 決策 | why | 觸發重評條件(選填) -->
<!-- 推翻決策:不刪舊行 — 新決策一行寫明取代哪天的哪條;舊行「決策」欄開頭加 [superseded→新日期]。新舊衝突時以此判方向。 -->

# 決策日誌

| 日期 | 決策 | 為什麼 | 重評條件 |
|---|---|---|---|
| 2026-07-18 | token 量測工具(tools/session-cost.mjs)dev-only:不隨 init 安裝、不入框架承諾;正解是零 token 解析本機 transcript,不用 sub-agent | 量測是框架開發者驗證品質的事,使用者日常不該為此花 token;transcript 格式是 Claude Code 內部實作無穩定承諾,只能當工具不能當承諾;sub-agent 看不到 usage 還燒 token | Claude Code 提供正式 usage API 時 |
| 2026-07-18 | --private 寫入細則:claude 義務表改寫 CLAUDE.local.md,codex/gemini 遇受 git 追蹤的指令檔跳過並警告;exclude 條目以 # flightwake:begin/end 包裹 | exclude 對已追蹤檔不生效,寫入受追蹤檔必留痕跡;claude 有本地等價檔、其他平台沒有;標記包裹為 uninstall(缺口 5)可逆性鋪路 | 其他平台出現 local 指令檔等價物時 |
| 2026-07-18 | 去重原則入義務表:同一事實只寫一處,git 能查的不重抄,其他處用連結/hash | 自我審查發現同一事實寫四遍(commit/record/DECISIONS/回覆);寫兩處必有一處過時,重複正是新舊衝突偏差的源頭 | — |
| 2026-07-18 | 使用者資料(TRAPS/DECISIONS)的慣例演進採「讀取端容忍舊格式」,不做遷移工具 | --force 永不碰使用者資料是硬承諾;容忍(無 status 欄視同 active)讓舊安裝不炸、零遷移成本 | 慣例變動大到容忍不了時再議遷移工具 |
| 2026-07-18 | record 的 secret 防護採 fw-record 檢查清單 + grep 自查,不內建自動掃描器 | 祕密判定需語境(敏感範圍因專案而異);內建掃描器違反零依賴承諾;公開 repo 建議另配 gitleaks 類工具 | 實際發生 record 洩漏事故時 |
| 2026-07-18 | 壓實義務併入 fw-coldstart 紅線與 fw-trap 步驟,不新增 fw-curate skill | 壓實的天然觸發點就在冷啟動(量測成本時)與登坑(發現取代時);維持 4-skill 最小表面 | 壓實頻率或複雜度成為痛點時 |
| 2026-07-18 | 開源前缺口優先序定為:敏感資訊防護 > 記錄增長+時效管理 > 多平台安裝 > --private > uninstall > CI 端 STATE 檢查 > monorepo | 敏感資訊直接擋開源;時效偏差傷唯一品質指標(冷啟動成本);其餘按採用信任排 | 內部試跑(2 週)結束後重排 |
| 2026-07-18 | TRAPS/DECISIONS 維持 append-only,但條目加 superseded 生命週期標記 + 觸發式壓實(由 skill 執行),不做框架自動改寫 | 功能合併後舊條目變成「看似有效的錯誤事實」,偏差風險比佔空間嚴重;自動改寫違反零執行期依賴,records 因有日期+只讀最新而天生免疫此問題 | 條目數超門檻或實測冷啟動 >5 分鐘 |
| 2026-07-18 | 多平台安裝採「偵測既有指令檔(CLAUDE.md/AGENTS.md/GEMINI.md)+ --agents flag 覆寫」,不做 GSD 式互動選單;都沒有時建 AGENTS.md | 互動 prompt 違反零依賴/無 install script 承諾,且卡死 agent 與 CI 的非互動安裝;AGENTS.md 是跨工具相容面最廣的事實標準 | AGENTS.md 標準化格局變動 |
| 2026-07-18 | --private(不進 git)做成 opt-in flag:用 .git/info/exclude + .claude/settings.local.json,預設維持進 git | 「進 git 隨 repo 共享」是 flightwake 與個人記憶分工的存在理由,不可預設放棄;exclude 純本地、不在 repo 留下使用痕跡 | 團隊使用者對 private 模式的實際回饋 |
| 2026-07-17 | flightwake repo 自我安裝(dogfooding),本 repo 開發適用自己的觸發義務表 | 框架吃自己的狗糧才能在開源前發現真實摩擦(當天即發現 init 無 CLAUDE.md 只警告的缺口) | — |
