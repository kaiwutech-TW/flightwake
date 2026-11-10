---
name: fw-trap
description: flightwake 登記坑 — 把非顯而易見的陷阱寫進 TRAPS registry。Use immediately when a surprising root cause is found (weird error, vendor quirk, encoding trap), or when the user says 記一下這個坑/trap.
---

# fw-trap — 坑登記

目的:同一個坑,全專案(含未來的 session 和其他 agent)只踩一次。

## 什麼夠格進 TRAPS

- 症狀與根因**距離很遠**的(例:jsonb 存成字串 scalar → 根因是驅動對「字串參數+::jsonb」的編碼行為)
- 廠商的未文件化行為(例:某操作路徑不觸發 webhook)
- 環境差異坑(本機過、prod 炸)
- **不夠格**:一般 bug、看錯誤訊息就懂的問題

動筆前先問兩題(只增不減的登記簿會累積沒人需要的條目):

1. **這條不存在的話,下一個 agent 或人還會踩到嗎?** 不會(已經修好且沒有路會走回去、或錯誤訊息現在就說清楚了)→ 不登記。
2. **能不能改成測試、lint 規則、腳本裡的檢查,或程式自己的錯誤訊息?** 能 → 改做那個;測試不佔 context,也不會悄悄過時。
   只有無法強制的事才登記成坑。

## 根因的把握度(confidence)

registry 最貴的失效不是漏記,是**把誤診寫成定案**——讀的人分不出「受控實驗坐實的」和
「當下最像的解釋」,照著錯的根因走比沒有 registry 更遠。所以根因必須標把握度:

| confidence | 意思 | 佐證要求 |
|---|---|---|
| `confirmed` | 受控實驗:改變因 → 症狀跟著出現/消失,至少兩次。**非因果類**的事實(某功能存不存在、清單有哪些、版本行為)改用「直接窮盡查證 + 指得出一手來源(原始碼行號/官方文件/後台逐項確認)」 | 佐證欄必須指得出那個實驗或那份來源 |
| `probable` | 多次觀察一致,但沒做對照組 | 寫出觀察次數與時間範圍 |
| `suspected` | 單次觀察,或「當下最像的解釋」 | 註明**還沒排除掉什麼** |

三條規則:

1. **症狀欄永遠是事實**(錯誤訊息照貼),confidence 只評「根因」那一欄
2. 非 `confirmed` 的條目,「解法」一律寫成「**繞法**」,且**不得當行為準則**
3. **不對稱門檻**——這條 trap 拿來論證「**這樣會壞**」→ `probable` 就夠(錯了只是多做防護);
   論證「**這樣是安全的**」→ 必須 `confirmed`(錯了直接打到 prod 和使用者)

把握度升級(suspected → confirmed)是**就地改同一條**,不是 supersede;
supersede 保留給「根因本身換了」的情況。寫入前查重(第 1 步)遇到候選時,也照這條判斷。

## 步驟

1. **先查重,再動筆**:寫入前先跑(唯讀;只看 TRAPS.md)

```bash
npx flightwake traps similar --name='<slug>' --tags='<a,b>' --paths='src/db/**,*.sql' --commands='npm run migrate,psql' <<'EOF'
<症狀(原樣貼上錯誤訊息)+ 一句話根因>
EOF
```

   內文一律走加引號的 heredoc(`<<'EOF'` … `EOF`,結尾的 `EOF` 單獨一行、頂格),其他值一律用單引號——絕不用雙引號:
   雙引號裡,shell 會執行貼上的錯誤訊息中的反引號與 `$(…)`。條目沒有 paths / commands 就省略 `--paths` / `--commands`。
   列出候選時三選一,不要直接再加一條:
   - **就地更新**既有條目——同一個根因:補佐證、補 paths/commands;把握度升級(suspected → confirmed)就是這種
   - **supersede**——根因本身換了:照第 6 步,舊條目改 `status: superseded`、內文指向新的 [[名稱]]
   - **仍另立新條目**——根因不同:在新條目內文用一行寫出為什麼跟候選不是同一件事
   候選標「同名」時不能再立同名條目。沒有候選 → 照常往下寫。
   指令跑不了(離線、舊版 flightwake、沒有 Node)→ 手動做同一件事:用新條目的 tags、paths 和關鍵錯誤字樣 grep
   `.flightwake/TRAPS.md`,有相近條目一樣三選一
2. 依 `.flightwake/TRAPS.md` 檔頭示範的條目格式(OKF 式 frontmatter:name/type/status/confidence/tags/discovered)
   寫進 `.flightwake/TRAPS.md` **最上面**
   選填 `paths` / `commands`——坑綁在特定檔案或指令上時才填,讓坑提示(Claude Code 與 Codex 的 PreToolUse hook,以及選配的 Claude Code mod)在 agent 碰到之後把這條提示出來:
   `paths: ["src/db/**", "*.sql"]`(repo 相對路徑的 glob;不含 `/` 的樣式比對任何深度的同名檔)、
   `commands: ["npm run migrate", "psql"]`(指令前綴,逐字比對)。不支援 regex。拿不準、或坑是觀念而不是某個位置?留空即可——
   不填的條目照常運作
   選填 `retire_when`——一行寫出這條什麼時候可以標 superseded(例:`retire_when: "codex exec 會載入專案 hook 時"`、
   `retire_when: "smoke 有檢查守住時"`)。壓實時先看這欄。
3. 四欄都要:症狀(原始錯誤訊息照貼)、根因一句話、解法/繞法、佐證連結(commit/record)
4. 相關的坑用 `[[name]]` 互連
5. **症狀當下就寫**——細節半天就忘;**根因待坐實再定案**——還沒坐實就先標
   `confidence: suspected` 並寫下還沒排除什麼,不要空著等想清楚,也不要把猜測寫成定論。
   之後坐實了回頭升級
6. 新坑**取代或涵蓋**既有條目時:舊條目 frontmatter 的 `status` 改 `superseded`、內文指向 [[新條目]]——不刪行,
   讓「舊 md vs 新 md」的衝突有明確方向邊
7. 判斷坑的**範疇**:若坑不是本 repo 特有、任何專案都會踩(平台/語言/工具層,如 Node stdin 行為、shell 展開)——
   TRAPS 照登(repo 登記簿必須自足:接手者與其他 agent 看不到你的個人記憶),
   **另存一份到你的使用者層記憶**(如 Claude 記憶),防其他 repo 重犯。
   跨範疇各存是分工不是重複:通用坑只記在單一 repo,換個 repo 就會再咬一次
8. **這個 repo 有 Antigravity**(`.agents/hooks.json` 裡有 `flightwake-state-check`)**且條目有 `paths`**:寫完後跑
   `npx flightwake traps rules`。它會從 TRAPS.md 重新產生 `.agents/rules/flightwake-trap-*.md`,Antigravity 靠這些檔在改那些檔案之前
   看到這條坑。產生出來的檔不要手改。
