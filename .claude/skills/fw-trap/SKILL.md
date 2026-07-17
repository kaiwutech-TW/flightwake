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
