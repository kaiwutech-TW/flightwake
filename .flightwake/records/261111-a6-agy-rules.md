---
record_id: 261111-a6-agy-rules
session: Claude Code(Opus 5.5),2026-11-11(接續 [[261111-a5-trap-check]])
date: 2026-11-11
repos: [flightwake]
tests: smoke 全過(含第 50、51 節);CI(ubuntu)對 a5b6f56 的 ci、codeql、scorecard 皆 success;doctor 0/0。mod 程式碼本段沒動(上一段 549/549)
prod_changes: none
---

# A6:Antigravity 的坑改用 model_decision 規則(探針推翻 glob 方案);A9 設計稿與探針

**TL;DR**:A6 原本打算用 Antigravity 的 `glob` 規則把有路徑錨點的坑送給 agy。在 agy CLI 上實測,`glob` 規則讀檔、改檔都不會載入;改用 `model_decision` 規則(只有一行描述常駐,agy 自己決定何時讀全文)後,agy 在沒有任何提示的改檔前就先讀了那條坑,改無關的檔則不讀。照這個結果實作了 `npx flightwake traps rules`,接上 init/update/doctor/uninstall/`/fw-trap`。A9(包成 Claude Code plugin)寫了設計稿並做了三個探針,因為會多一條安裝管道,留給 Kai 決定。另修了一個只在 Linux CI 出現的 smoke 錯誤。

## 關鍵發現

1. **agy CLI 不載入 `glob` 規則**(1.5.3 與中途自動更新的 1.5.5):三條帶 nonce 的 glob 規則(`*.sql`、`**/*.sql`、逗號分隔兩個目錄)讀檔與改檔都沒出現;同時放的 `always_on` 對照組有載入,所以 `.agents/rules/` 確實有被讀。證據:`docs/plans/agy-rules.md`「探針結果」。
2. **`model_decision` 規則在 agy 上做到「改之前」**:新 session、請求完全不提規則(「把 db/x.sql 改成 select 5;」),agy 的思考寫「檔案路徑表示觸發了 flightwake trap」,先讀規則檔才改;改 `README.md` 時不讀。這是模型自己的判斷,只觀察了一個模型、兩次改檔,對外不能寫「一定」。決定寫進 DECISIONS 2026-11-11(也記下這是「同一事實只寫一處」的例外:規則檔是 TRAPS.md 的產生物)。
3. **A9 探針**(Claude Code 2.1.322,`--plugin-dir`):plugin 的 skill 可以用不帶前綴的 `/fw-…` 叫到;skill 內文的 `${CLAUDE_PLUGIN_ROOT}` 會被換成 plugin 路徑,plugin 內附的範本讀得到;repo 的 `.claude/skills/` 有同名 skill 時,不帶前綴叫到的是 repo 那份。細節與建議做法在 `docs/plans/plugin-marketplace.md`。
4. **GNU `stat -f` 是檔案系統資訊,不會失敗**:smoke 第 50 節原本寫 `stat -f %Lp … || stat -c %a …`,在 Linux 上第一個就「成功」輸出別的東西,CI 因此失敗。改用檔案裡現成的 `modeof`(node 讀 mode)。這條有現成的寫法可循,沒登記成坑。

## 交付 / Commits

2d62526..(本 commit):A6 實作、smoke Linux 修正(a5b6f56)、A9 設計稿與本紀錄。

## 驗證證據

- smoke 第 51 節:新增有 `paths` 的條目後 doctor 報過期;`--dry-run` 不寫;update 產生 `model_decision` 規則(描述列出錨點路徑、有產生標記、probable 加線索說明);只有 `commands` 的條目不產生;使用者自己的規則(含撞名但沒標記的)不動;冪等;條目 superseded 後檔案被清;uninstall 只拿有標記的。
- 本 repo 沒有 agy,`update` 不產生規則檔(0 個)。
- 探針結束後,agy 設定裡兩個 scratchpad 探針資料夾的信任已移除(先備份再比對)。

## 未完 / 交接

- **A5、A6 都未發版**(CHANGELOG `[Unreleased]`):發 0.19.0 要 Kai 確認。
- **A9 待 Kai 決定**要不要開第二條安裝管道(`docs/plans/plugin-marketplace.md`「待 Kai 決定」);若做,先探針 manifest 的 `skills` 路徑欄位能否指到 `./skills/en/`。
- **TRAPS active 21 條 > 20**,壓實提案未出。
- Orca 裡「A5 codex probe」與「A6 agy rules probe」兩個分頁可以關。
