---
name: fw-roles
description: flightwake 團隊角色 — 掃專案、推薦一組 agent 角色、讓使用者預覽與客製,再裝進 CLAUDE.md/AGENTS.md(/clear 後不會忘)。Use when the user wants to set up or change agent roles (PM/技術總監/寫手/審核…), says 設定角色/分工/roles, or an agent keeps drifting out of its role after /clear.
---

# fw-roles — 團隊角色

目的:讓每個 agent 在每次新對話與 /clear 後都記得「我是誰、做什麼、**禁止做什麼**、交給誰」。
角色寫在一份 `.flightwake/ROLES.md`(人看得懂、可 review),由 `npx flightwake roles apply` 產生到各 agent
每次開場都會讀的指令檔:Claude Code → `CLAUDE.md`、Codex → `AGENTS.md`、Gemini CLI → `GEMINI.md`。

**路由規則(唯一硬限制)**:agent 分辨自己的角色,靠的是「它讀哪個指令檔」。所以**同一個資料夾裡,每個廠牌
最多一個角色**。需要兩個 Codex 角色,就放在不同資料夾/worktree,或換一個廠牌擔任。

## 步驟

1. **掃專案**(唯讀,不寫任何檔)
   - README、套件清單(package.json/pyproject 等)、頂層目錄結構、有沒有測試/CI、`.flightwake/STATE.md` 與 DECISIONS
   - 問使用者(能自己查到就別問):團隊橫跨哪些資料夾?(用 Orca 時可 `orca repo list` 看)手上有哪些 agent
     (Claude Code/Codex/Gemini CLI)?已經有 `.flightwake/ROLES.md` 就讀它,這次是修改不是新建。
2. **推薦一組角色**(3–5 個就好,多了互相踩線)
   - 從本 skill 的 `presets/` 挑:pm、tech-lead、coder、reviewer、qa、researcher。都不合就自己寫一個,同樣格式。
   - 每個角色配一個 (資料夾, 廠牌),遵守路由規則。
   - 建議 coder 與 reviewer 用**不同廠牌**(異質模型互審抓得到同模型的盲點);pm 放在不寫程式的資料夾更穩。
   - 每個推薦附一句理由,連到你在步驟 1 看到的具體事實。
3. **預覽**:先給一張表(角色|廠牌|資料夾|一句職責),再列每個角色的「做/禁止/交給誰」。
   說明預設值是起點,請使用者挑想改的地方。
4. **客製**:照使用者的話改。**禁止事項是這套的核心**——使用者說「reviewer 可以自己修小錯」就把那條禁止改寫
   成有邊界的例外,不要整條刪掉。寫進 `.flightwake/ROLES.md`,格式如下(`##` 標題開一個角色;角色內文只用
   `**粗體**`/`###`,不要再用 `##`):

   ```markdown
   # 團隊角色
   (這段之前的文字是說明,apply 會忽略)

   ## pm — 專案經理／總指揮
   agent: codex
   repo: .

   **你做**
   - …
   ```

   `repo:` 相對於本 repo 根目錄(可用絕對路徑或 `~/`)。一個團隊**只寫一份** ROLES.md,放在 pm 所在的 repo;
   其他 repo 不必複製,apply 會一起寫過去。
5. **套用**:先 `npx flightwake roles apply --dry-run` 給使用者看實際會寫進哪些檔、長什麼樣,確認後再
   `npx flightwake roles apply`。它只動 `<!-- flightwake-roles:begin/end -->` 標記區塊,其他內容不碰。
   指令檔裡如果還有**手寫的舊角色段落**,指給使用者看並在確認後刪掉——新舊並存會互相矛盾。
6. **驗收**:在每個角色的資料夾用對應 agent 開一個**新對話**,問同一個誘導題,例如「前端有個按鈕打錯字,
   你是哪個角色、下一步做什麼?不要動手」。pm/tech-lead/reviewer 應該轉派而不是自己改。有人自己動手 →
   回步驟 4 把那條禁止寫得更具體。
7. **收尾**:DECISIONS 一行(採用哪組角色、為什麼);提醒使用者每個被寫到的 repo 都要 commit。

## 紅線

- 不在使用者確認預覽前寫任何指令檔。
- 不刪使用者手寫的內容,除非指給他看過並得到確認。
- 改角色 = 改 ROLES.md 再 apply,不要直接改產生出來的區塊(下次 apply 會被蓋掉)。
