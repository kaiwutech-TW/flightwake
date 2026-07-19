<!-- flightwake TRAPS — 坑 registry。非顯而易見、會再咬人的事實。 -->
<!-- 條目採 OKF 式慣例:frontmatter 區塊 + 內文;可用 [[名稱]] 互連。新的加最上面。 -->
<!-- 時效:條目過時(功能合併/重構後不再成立)不刪 — status 改 superseded 並指向取代者;讀的人只信 active。 -->

# 坑 Registry

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
