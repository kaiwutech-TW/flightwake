<!-- flightwake TRAPS — 坑 registry。非顯而易見、會再咬人的事實。 -->
<!-- 條目採 OKF 式慣例:frontmatter 區塊 + 內文;可用 [[名稱]] 互連。新的加最上面。 -->
<!-- 時效:條目過時(功能合併/重構後不再成立)不刪 — status 改 superseded 並指向取代者;讀的人只信 active。 -->

# 坑 Registry

---
name: macos-mktemp-symlink-cwd-mismatch
type: gotcha
status: active
tags: [macos, testing, node, paths]
discovered: 2026-08-11
confidence: confirmed
---

**症狀**:測試在暫存 repo 裡把 `process.cwd()` 記下的路徑(如 registry 條目)拿去和 shell 的 `$TMP` 比對,比對永遠落空——兩邊看起來是同一個目錄。
**根因**:macOS `mktemp -d` 回傳 `/var/folders/…`,而 `/var` 是 `/private/var` 的 symlink;bash 保留邏輯路徑,Node 的 `process.cwd()` 回實體路徑,字串永不相等。
**解法/繞法**:測試腳本拿到 `$TMP` 後立刻 `TMP="$(cd "$TMP" && pwd -P)"` 正規化成實體路徑再往下用(smoke.sh 已內建)。任何「shell 路徑 vs Node cwd」的字串比對都適用本條。
**佐證**:本 repo test/smoke.sh registry 測項首次紅燈(2026-08-11),正規化後綠

---
name: codeql-action-version-lockstep
type: trap
status: active
tags: [ci, github-actions, dependabot, codeql]
discovered: 2026-07-27
---

**症狀**:dependabot 開的 codeql-action 升版 PR,CI 紅在 `##[error]Loaded a configuration file for version '4.37.1', but running version '4.37.3'` → `CodeQL job status was configuration error`。PR 內容本身只是換一行 SHA,看起來完全無辜。
**根因**:`github/codeql-action/init`、`analyze`、`upload-sarif` 在 dependabot 眼中是**三個獨立套件**,會拆成三個 PR;但 CodeQL 要求同一 workflow 內所有 codeql-action step 同版,任一 PR 單獨存在時 branch 上就是 init 舊版 + analyze 新版。init 步驟其實有先警告(`Not all workflow steps that use github/codeql-action actions use the same version`),但它只是 warning,真正炸在 analyze。
**解法/繞法**:`.github/dependabot.yml` 用 `groups` 把 `github/codeql-action*` 併成單一 PR(已設,2026-07-27)。若手動升版:三處 SHA 一起換。看到 configuration error 先 `grep codeql-action .github/workflows/` 比對版本註解,別去查 CodeQL 設定檔。
**佐證**:PR #1/#4/#5(2026-07-26 dependabot 批次),失敗 run 30184467406

---
name: gh-active-account-drift
type: gotcha
status: active
tags: [gh, github, multi-account]
discovered: 2026-07-23
---

**症狀**:`gh release create` 失敗說 "workflow scope may be required";或 `git push` 403 denied to 另一個帳號——明明這個 session 剛 `gh auth switch` 成功過。
**根因**:gh 的 active account 是**全域狀態**,其他 session/終端切帳號會直接影響本 session;且錯誤訊息誤導——說缺 workflow scope,實際是 active 帳號對 repo 無權限。
**解法/繞法**:本 repo 任何 gh 或 push 操作**前**先 `gh auth switch -u kaiwutech-TW`(別信上次的切換還在);看到 workflow scope 錯誤先 `gh auth status` 查 active 帳號,不要急著 `gh auth refresh` 加 scope。
**佐證**:[[260723-v0100-release]](push main 成功後、開 Release 前被切回 kaiwu-aideamed)

---
name: hook-stdin-tty-block
type: trap
status: active
tags: [hooks, node, stdin]
discovered: 2026-07-19
---

**症狀**:hook/statusline 腳本手動執行(終端機直接跑、沒接 pipe)時永久卡住,無錯誤訊息。
**根因**:`readFileSync(0)` 在 stdin 是 TTY 時等 EOF 等不到——Claude Code 情境永遠 pipe JSON 進來所以沒事,手動測試必卡。
**解法/繞法**:所有讀 stdin 的 hook 開頭先判 `process.stdin.isTTY`,是 TTY 就跳過讀取。**已咬兩次**:state-check 2026-07-17 修過(dashboard 手測 2 分鐘 timeout 坐實),statusline 2026-07-18 新寫時重犯——寫任何新 hook 前查本條。
**佐證**:salesmartly_chain repo TRAPS 同名條目(當時只記在那邊,本 repo 漏登,故重犯)

---
name: dogfood-dual-copy-drift
type: gotcha
status: active
tags: [dogfooding, hooks, release]
discovered: 2026-07-18
---

**症狀**:修了 statusline/hook 的 bug,本機儀表變正常,但發版後使用者拿到的還是舊行為(或反過來:改了源頭,本機看不到效果)。
**根因**:本 repo dogfood 自己——同一份 hook 存在兩處:`hooks/`(npm 發佈的源頭)與 `.flightwake/hooks/`(本 repo 的安裝副本)。改任一邊都不會自動同步另一邊。
**解法/繞法**:改 hook/skill 時兩份都要動(`diff hooks/X .flightwake/hooks/X` 確認一致再 commit);已在其他 repo 裝過的副本(如 kaiwuweb)npm 發版前只能手動 cp。
**佐證**:4b9abd8(context_window 修正,當下先改了安裝副本、diff 才發現源頭沒動)

---
name: {{kebab-case-slug}}
type: trap          # trap | gotcha | constraint
status: active      # active | superseded(過時不刪,改此欄並在內文指向 [[取代條目]] 或 record)
tags: [{{標籤}}]
discovered: {{YYYY-MM-DD}}
---

**症狀**:{{看到什麼(錯誤訊息/怪行為)}}
**根因**:{{一句話}}
**解法/繞法**:{{怎麼處理}}
**佐證**:{{commit/record 連結}}

---
name: codex-exec-stdin-hang
type: trap
status: active
tags: [codex, stdin, automation]
discovered: 2026-09-02
confidence: confirmed
---

**症狀**:從腳本/agent 的 Bash 呼叫 `codex exec '<prompt>'`,印出 `Reading additional input from stdin...` 後永久卡住,零 CPU、不開 session、無錯誤。
**根因**:`codex exec` 在 stdin 不是 TTY 時會**額外**讀 stdin 到 EOF 當補充輸入(即使已給 prompt 參數);agent 的 shell stdin 是不會關的 pipe,EOF 永遠不來。與 [[hook-stdin-tty-block]] 同一家族,只是這次卡的是 Codex 本體而非我們的 hook。
**解法/繞法**:非互動呼叫一律 `codex exec … </dev/null`(或 `echo | codex exec …`)。macOS 沒有 `timeout` 指令,別指望它救場。
**佐證**:[[260902-codex-gemini-native]](真機驗證第一次卡 9 分鐘 0% CPU;加 `</dev/null` 後同指令 100 秒內完成——開關對照一次;第二次 Stop-hook 測試同法直接過,合計兩次)
