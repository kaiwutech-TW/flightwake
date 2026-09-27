---
name: fw-roles
description: flightwake 團隊角色 — 推薦、客製並安裝 /clear 後不會忘的 agent 角色(座位寫進 CLAUDE.md/AGENTS.md,待命角色裝成原生 agent)。Use when setting up or changing who does what on a multi-agent team (設定角色/分工/換角色), calling an on-call role, or when an agent drifts out of its role after /clear.
---

# fw-roles — 團隊角色

目的:讓每個 agent 在每次新對話與 /clear 後都記得「我是誰、做什麼、**禁止做什麼**、交給誰」,而且階段性的角色
(資安、設計、上線…)不必一開始就佔位子。

## 兩個觀念

- **座位(seat)**:(資料夾, 廠牌)。每個資料夾每個廠牌最多一個座位——agent 分辨自己的角色,靠的是「它讀哪個
  指令檔」(Claude Code → `CLAUDE.md`、Codex → `AGENTS.md`、Gemini CLI → `GEMINI.md`)。座位角色被寫進指令檔最
  前面,/clear 後自動回來。長期、天天在做的角色坐座位:pm、tech-lead、coder、reviewer。
- **待命(on-call)**:沒坐座位的角色。apply 會在每個座位的 (資料夾, 廠牌) 產生原生定義
  (`.claude/agents/fw-<id>.md`、`.codex/agents/fw-<id>.toml`)。需要時:同廠牌短任務 → 衍生原生 agent `fw-<id>`;
  跨廠牌或長任務 → pm 派 worker,任務開頭接 `npx flightwake roles card <id>` 的輸出。名額不限。
  階段性角色(security、designer、release、qa)先放待命,不佔座位。

**誠實邊界**:角色文字是行為指引,不是權限邊界。原生定義裡不宣稱唯讀或禁止寫檔(實測擋不住,見 TRAPS
`codex-custom-agent-sandbox-not-enforced`)。向使用者介紹時照這個講。

## 首次設定

1. **掃專案**(唯讀,不寫任何檔)
   - README、套件清單、頂層目錄結構、有沒有測試/CI/部署、`.flightwake/STATE.md` 與 DECISIONS
   - 問使用者(能自己查到就別問):團隊橫跨哪些資料夾?(用 Orca 時可 `orca repo list`)手上有哪些 agent?
     已經有 `.flightwake/ROLES.md` 就讀它——這次是修改,跳到下面「日常調整」。
2. **推薦**:座位 3–4 個 + 待命若干。
   - 從本 skill 的 `presets/` 挑。核心(通常坐座位):pm、tech-lead、coder、reviewer;視需要:qa、researcher;
     **有條件才推薦**:release(專案真的會部署)、security(碰到登入、金流、個資)、designer(有前端畫面)。
   - 建議 coder 與 reviewer 用**不同廠牌**;pm 放在不寫程式的資料夾更穩。
   - 每個推薦附一句理由,連到步驟 1 看到的具體事實。待命角色寫好 `### 何時叫`(給 pm 的觸發清單)。
3. **預覽**:先給一張座位表(資料夾|廠牌|角色),再列待命角色與何時叫,最後列每個角色的「做/禁止/交給誰」。
4. **客製**:照使用者的話改。**禁止事項是這套的核心**——使用者說「reviewer 可以自己修小錯」就改寫成有邊界的
   例外,不要整條刪掉。寫進 `.flightwake/ROLES.md`(`##` 開一個角色;角色內文只用 `**粗體**`/`###`):

   ```markdown
   # 團隊角色
   (第一個 ## 之前是說明,apply 會忽略)

   ## pm — 專案經理／總指揮
   **你做**
   - …

   ## security — 資安審查
   **你做**
   - …
   ### 何時叫
   - 改動碰到登入、權限、金鑰、金流、個資

   ## seats
   | repo | vendor | role |
   |---|---|---|
   | . | codex | pm |
   | ../app | claude | coder |
   ```

   `repo` 相對於 ROLES.md 所在 repo 的根目錄(可用絕對路徑或 `~/`,可含空白)。一個團隊**只寫一份** ROLES.md,
   放在 pm 所在的 repo;apply 會寫到座位表列出的每個 repo。
5. **套用**:先 `npx flightwake roles apply --dry-run` 給使用者看實際會新增/更新/清除哪些檔,確認後再
   `npx flightwake roles apply`。座位區塊一律放在指令檔**最前面**,其他內容不碰——說明時照這個講。
   指令檔裡如果還有**手寫的舊角色段落**,指給使用者看並在確認後刪掉——新舊並存會互相矛盾。
   apply 回報**衝突**(使用者自己的同名檔、手改過的產生檔、別的團隊的產物)時什麼都不會寫:把衝突原樣給使用者,
   由使用者決定怎麼處理,不要自己刪檔繞過。
6. **驗收**:每個座位用對應 agent 開**新對話**,問誘導題(「按鈕打錯字,你是哪個角色、下一步做什麼?不要動手」);
   pm/tech-lead/reviewer 應轉派。另外叫一次待命角色(同廠牌衍生 `fw-<id>`,或用角色卡派 worker),確認它自認的是
   待命角色而不是座位角色。Codex 看不到 `fw-<id>` 時:該 repo 必須以**精確路徑**受信任(worktree 路徑各算各的),
   Codex 解析不了的定義會被靜默丟掉——照實告訴使用者,不要自己繞過。
7. **收尾**:DECISIONS 一行(座位與待命安排、為什麼);提醒使用者每個被寫到的 repo 都要 commit
   (含 `.claude/agents/`、`.codex/agents/` 與 `.flightwake/roles-manifest.json`)。

## 日常調整

- **換座位上的角色**(例如進入上線期,把某座位換成 release):
  `npx flightwake roles assign <repo>:<vendor> <角色> --dry-run` → 使用者確認 → 去掉 `--dry-run` 再跑。
  它只改座位表那一格並重新套用;座位不存在要加 `--add`。**新對話後才生效**,正在跑的 session 維持原角色——
  告訴使用者要重開哪幾個。然後在 DECISIONS 補一行為什麼換。
- **改角色內容**:改 ROLES.md 對應段落再 apply;不要直接改產生出來的區塊或原生檔(會被視為衝突)。
- **叫待命角色**:同廠牌 → 衍生 `fw-<id>`;跨廠牌 → 先確認 `npx flightwake roles card <id>` 成功(失敗時
  stdout 是空的,不能照樣派),再把卡片放在 worker 任務最前面。派工帶:任務、工作目錄、可動哪些檔、驗收、回報方式。
  叫不出來(找不到 agent type、spawn 失敗)→ 回報使用者,**不要**改用一般子 agent 或自己做完。
- **舊格式遷移**(ROLES.md 沒有 `## seats`、角色內寫 `agent:`/`repo:`):assign 會拒絕。把每個角色的
  `agent`/`repo` 轉成座位表列,並刪掉角色內那兩行;給使用者看完整的前後對照,確認後才寫,寫完 apply --dry-run。

## 紅線

- 不在使用者確認預覽前寫任何指令檔或 ROLES.md。
- 不刪使用者手寫的內容或 apply 回報為衝突的檔,除非指給他看過並得到確認。
- 不把角色說成權限控制;需要真正的限制,告訴使用者要另外用工具本身的權限設定並自己實測。
