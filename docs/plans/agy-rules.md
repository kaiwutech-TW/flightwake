# 設計:由 TRAPS 錨點產生 Antigravity 的規則檔(A6)

- 狀態:**已實作,未發版**(2026-11-11)。計畫來源:`docs/plans/narrow-and-launch.md` A6。探針結果見最後一節:**`glob` 規則在 agy CLI 上不會載入,改用 `model_decision`**,下文「要做什麼」已照探針結果改寫。
- 為什麼:Antigravity 的 PreToolUse 沒有附加 context 的欄位,A5 的坑提示 hook 在 agy 上用不了(`multi-agent.md` 平台表)。
  agy 有工作區規則檔(`.agents/rules/`)。用它把有 `paths` 錨點的坑送到 agy。

## 官方文件(antigravity.google/docs/rules,2026-11-11 讀)

- 位置:`<workspace>/.agents/rules/*.md`(舊的 `.agent/rules/` 也讀);只掃第一層,子資料夾不讀。
- 每個檔都要 YAML frontmatter,`trigger` 必填:`always_on | model_decision | glob | manual`。寫錯(例如 camelCase)整檔**默默丟掉**。
- `trigger: glob` 要 `globs`(或單數 `glob`),值是**逗號分隔**的 glob 字串,`*` 開頭要加引號,例:`globs: "*.proto, **/*.pb.go"`。
- 啟用時機:「when the agent interacts with files matching any … pattern」——讀、改、還是只是出現在 context 都算,文件沒說。
- 每檔上限 24,000 bytes;`always_on` 共用 20,000 token 預算(glob 規則不佔,觸發才載入)。

## 要做什麼

`npx flightwake traps rules`:把 active 且有 `paths` 的 TRAPS 條目,各寫成一個 `.agents/rules/flightwake-trap-<name>.md`:

```markdown
---
trigger: model_decision
description: "flightwake TRAPS: a known trap for db/**, *.sql. Read this rule before editing those files."
---
<!-- flightwake:generated from .flightwake/TRAPS.md — do not edit here; edit TRAPS.md, then run: npx flightwake traps rules -->

flightwake TRAPS: `db-order` [confirmed] — anchored to db/**, *.sql
**Root cause**: …
**Fix**: …
Full entry: .flightwake/TRAPS.md
```

- 內容和坑提示 hook 一樣精簡(根因與繞法各一行,`probable` / `suspected` 加「線索,不是定論」那句)。
- **路徑寫在描述裡**:`model_decision` 規則只有描述常駐在 context(每條約一行),agy 依描述決定要不要讀全文,所以描述直接列出錨點路徑。沒有 glob 換算的問題;代價是每條有錨點的坑多一行常駐 context。描述用安裝語言。
- **清理**:`.agents/rules/flightwake-trap-*.md` 裡,對不到現在 active 條目的檔刪掉(只刪檔頭有我們標記的;使用者自己的規則一律不動)。
- **何時重產**:`init` / `update` 在 agy 啟用時跑一次;`/fw-trap` 寫完條目後,skill 叫 agent 跑一次(只有 repo 有 agy 時)。`commands` 錨點沒有對應的規則觸發方式,不產生。
- **只做 agy**:Claude Code 與 Codex 已有 A5 的 hook,再產 `.claude/rules/` 會同一條提示兩次。
- **`--private`**:產生的檔加進 `.git/info/exclude` 的 flightwake 區塊(`.agents/rules/flightwake-trap-*.md`),不進版控。
- **uninstall**:刪掉有標記的產生檔;資料夾空了才刪。

## 同一事實只寫一處

TRAPS.md 是唯一正本。規則檔是**產生物**:檔頭寫明不要手改、內容只摘根因與繞法、每次重產都整檔覆寫,所以手改會被下一次 `update` 蓋掉。
這是「寫兩處必有一處過時」的例外,理由:agy 讀不到 TRAPS.md 的錨點,沒有別的送達管道。寫進 DECISIONS。

## 要先做的探針(agy CLI,Orca 可見分頁)

| # | 問題 | 怎麼驗 |
|---|---|---|
| R1 | glob 規則在 agent **改**符合的檔時載入嗎?**讀**的時候呢? | 暫存 repo 放一條帶 nonce 的 glob 規則,請 agy 讀檔、改檔,各問一次有沒有看到 nonce;另看 agy 的 transcript |
| R2 | 沒有 `/` 的 `*.sql` 會命中 `db/x.sql` 嗎?`**/*.sql` 呢? | 兩條規則各帶不同 nonce |
| R3 | 逗號分隔多個 glob 有效嗎? | 一條規則 `globs: "a/**, b/**"`,改 `b/` 下的檔 |

R1 不成立(例如只有檔案在 context 才載入、或根本不載入)→ A6 擱置,agy 照舊只有 TRAPS.md 與冷啟動。

## 探針結果(2026-11-11,agy CLI 1.5.3,中途自動更新到 1.5.5;Orca 可見分頁「A6 agy rules probe」)

暫存 repo 放三條帶 nonce 的 `glob` 規則(`"*.sql"`、`"**/*.sql"`、`"src/a/**, src/b/**"`),再加對照組。

| 試驗 | 結果 |
|---|---|
| 讀 `db/x.sql`(1.5.3) | 三條 glob 規則都**沒**載入(agy 回報沒有任何 R2/R3 碼) |
| 改 `db/x.sql` 與 `src/b/two.ts`(1.5.3) | 都**沒**載入 |
| 對照:`always_on` 規則(1.5.5) | 載入,agy 逐字唸出 nonce 與檔名——所以 `.agents/rules/` 有被讀 |
| 改 `db/x.sql` 與 `src/a/one.ts`(1.5.5) | glob 規則仍**沒**載入 |
| `model_decision` 規則(描述寫「db/ 與 .sql 有已知的坑,改之前先讀」),請求裡提到規則 | agy 先讀規則檔再改檔,回報 nonce |
| 同上,**新 session、請求完全不提規則**(「把 db/x.sql 改成 select 5;」) | agy 的思考寫「檔案路徑表示觸發了 flightwake trap」,**先讀規則再改檔**,回覆附上 nonce |
| 改不相關的 `README.md` | 沒有讀規則 |

R1–R3(glob)不成立,所以 A6 改用 `model_decision`。這反而在 agy 上做到了 A5 在 Claude Code 與 Codex 做不到的事:**改檔之前**就讀到坑——
但這是模型自己決定的,不是保證;只觀察了一個模型(Gemini 4 Argon,medium)與兩次改檔。對外說法:「Antigravity 會在改這些檔之前先讀到那條坑(實測)」,不寫「一定」。

探針結束後,agy 設定 `~/.gemini/antigravity-cli/settings.json` 的 `trustedWorkspaces` 裡兩個 scratchpad 探針資料夾(本次與 11-10 的 agy 探針)已移除,其餘不變(先備份再比對)。
