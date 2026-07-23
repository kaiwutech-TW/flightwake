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

## 步驟

1. 依 `.flightwake/TRAPS.md` 檔頭示範的條目格式(OKF 式 frontmatter:name/type/tags/discovered)
   寫進 `.flightwake/TRAPS.md` **最上面**
2. 四欄都要:症狀(原始錯誤訊息照貼)、根因一句話、解法/繞法、佐證連結(commit/record)
3. 相關的坑用 `[[name]]` 互連
4. 當下就寫——坑的細節半天就忘
5. 新坑**取代或涵蓋**既有條目時:舊條目 frontmatter 的 `status` 改 `superseded`、內文指向 [[新條目]]——不刪行,
   讓「舊 md vs 新 md」的衝突有明確方向邊
6. 判斷坑的**範疇**:若坑不是本 repo 特有、任何專案都會踩(平台/語言/工具層,如 Node stdin 行為、shell 展開)——
   TRAPS 照登(repo 登記簿必須自足:接手者與其他 agent 看不到你的個人記憶),
   **另存一份到你的使用者層記憶**(如 Claude 記憶),防其他 repo 重犯。
   跨範疇各存是分工不是重複:通用坑只記在單一 repo,換個 repo 就會再咬一次
