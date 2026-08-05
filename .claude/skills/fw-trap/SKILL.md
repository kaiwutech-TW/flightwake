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
supersede 保留給「根因本身換了」的情況。

## 步驟

1. 依 `.flightwake/TRAPS.md` 檔頭示範的條目格式(OKF 式 frontmatter:name/type/status/confidence/tags/discovered)
   寫進 `.flightwake/TRAPS.md` **最上面**
2. 四欄都要:症狀(原始錯誤訊息照貼)、根因一句話、解法/繞法、佐證連結(commit/record)
3. 相關的坑用 `[[name]]` 互連
4. **症狀當下就寫**——細節半天就忘;**根因待坐實再定案**——還沒坐實就先標
   `confidence: suspected` 並寫下還沒排除什麼,不要空著等想清楚,也不要把猜測寫成定論。
   之後坐實了回頭升級
5. 新坑**取代或涵蓋**既有條目時:舊條目 frontmatter 的 `status` 改 `superseded`、內文指向 [[新條目]]——不刪行,
   讓「舊 md vs 新 md」的衝突有明確方向邊
6. 判斷坑的**範疇**:若坑不是本 repo 特有、任何專案都會踩(平台/語言/工具層,如 Node stdin 行為、shell 展開)——
   TRAPS 照登(repo 登記簿必須自足:接手者與其他 agent 看不到你的個人記憶),
   **另存一份到你的使用者層記憶**(如 Claude 記憶),防其他 repo 重犯。
   跨範疇各存是分工不是重複:通用坑只記在單一 repo,換個 repo 就會再咬一次
