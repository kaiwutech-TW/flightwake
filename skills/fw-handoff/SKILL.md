---
name: fw-handoff
description: flightwake 跨 session 交接 — 為「還沒做完、之後要繼續」的工作寫 CONTEXT。Use when stopping mid-build on multi-session work, when the user says 交接/handoff/下次繼續, or before context runs out on a large task.
---

# fw-handoff — 跨 session 交接(升級為 phase 的唯一時機)

目的:讓「未完成的建設」能被任何 session 冷啟動接續。**觸發點是停手前,不是開工前**——
接觸過現實之後寫的 CONTEXT 才是真的。

## 步驟

1. 寫 `.flightwake/records/YYMMDD-slug-CONTEXT.md`,必含四節:
   - **Scope**:要做什麼/明確不做什麼(out of scope 防範圍蔓延)
   - **已定案決策**:含 why(同步登 DECISIONS)
   - **現況與資料底座**:哪些已就緒(附驗證證據)、哪些是假設(標注「執行前 spot-check」)
   - **下一步**:具體到「打開哪個檔案/跑哪個指令」
2. 開放問題單獨列——**需要問人的標「需與 X 確認」**,不要讓下個 session 用猜的
3. 更新 STATE:進行中 + 下一步入口指向此 CONTEXT
4. commit + push(交接物必須離開本機)

## 與 GSD phase 的關係

這就是 flightwake 版的 phase 立案:一份 CONTEXT,不預先拆 plan——plan 由執行 session 臨場判斷。
若 repo 同時有 GSD `.planning/`,CONTEXT 可以放那邊的 phases/ 目錄以維持既有索引(參照本檔格式即可)。
