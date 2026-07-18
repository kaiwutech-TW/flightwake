---
record_id: 260718-ab-workflow-handbook
session: Claude(Fable 5)
date: 2026-07-18
repos: [flightwake]
tests: 無 runtime 面(本段只動 docs 與 .flightwake;量測用唯讀 transcript 解析 + headless 新 session)
prod_changes: "none(repo 側);使用者機器變更:卸載第三方 plugin understand-anything(claude plugin uninstall,marketplace 註冊仍在)"
---

# A/B 底盤量測收尾 + 開場底盤分解到底 + 產出分階段實戰手冊 docs/workflow.md

**TL;DR**:接續 GSD 拆除(見 [[260718-gsd-teardown]]),本 session 補完 A/B:開場底盤 40,377→33,783 tokens(20.2%→16.9%),GSD 實佔僅 ~6.6k/3.3%。使用者追問「不可能一開就這麼滿」,用 headless 新 session 把底盤分解到底:大頭是 Claude Code 本體 ~21.5k,拆無可拆。隨後使用者兩個轉向:(1) 文案不點名 GSD(感謝其貢獻,入 DECISIONS);(2) 提出「給一般開發者的階段地圖」構想,當場落地為 `docs/workflow.md`(新手主線 + 進階摺疊),四語 README 加入口。

## 關鍵發現(重要性排序)

1. **開場底盤分解(200k 視窗)**:Claude Code 本體(系統提示+內建工具定義+內建 skill 清單)≈ 21.5k 為大頭;GSD 6.6k(已拆);understand-anything ≈ 1.5k(本次已卸載);本專案自帶(CLAUDE.md+fw skills+記憶索引)僅 ~1.5k;互動模式較 headless 另加 ~9-10k(chrome MCP 等,未實測)。方法:headless `claude -p --output-format json` 開新 session 量第一筆 usage,空白目錄 21,534 vs 專案目錄 22,991。
2. **A/B 對比乾淨的判準**:兩 session 的 cache_read 完全相同(20,410)證明穩定前綴未變,差額全落在 cache_creation,歸因才成立;開場訊息差異 ~375 chars 折 ±2-300 tokens 為誤差界。數字細節與文案紅線見個人記憶 gsd-context-overhead-case。
3. **understand-anything 是第三方 plugin**(GitHub `Egonex-AI/Understand-Anything`,自帶 marketplace),非 Anthropic 官方;官方 marketplace 是 `anthropics/claude-plugins-official`。安裝來源查 `~/.claude/plugins/known_marketplaces.json`,不憑印象。
4. **文案不點名 GSD**(決策,已入 DECISIONS 2026-07-18):既有宣傳三稿引用 context 對比的段落發佈前需改寫。

## 交付 / Commits

220d4b3(docs/workflow.md 手冊 + 四語 README 入口 + DECISIONS/STATE 同步)

## 驗證證據

- A/B:拆 GSD 前後兩個互動 session 第一筆 usage 對帳 40,377 → 33,783(input 2 / cache_read 20,410 相同 / cache_creation 19,965→13,371)
- 底盤分解:headless 空白目錄 21,534、flightwake 專案目錄 22,991(皆主模型 input 側合計,`--output-format json` 的 modelUsage)
- understand-anything 卸載:CLI 回報 Successfully uninstalled(scope: user)
- workflow.md:使用者已審閱通過;與 README 義務表以連結去重,無重抄

## 未完 / 交接

- **發宣傳前必做**:三稿中 context 對比段落改寫為不點名版本(紅線見 DECISIONS 2026-07-18 與個人記憶)
- 互動 session 的最終底盤數字未量(headless 量不到 chrome MCP 那 ~9-10k;使用者開任一新互動 session 後讀 transcript 即得,nice-to-have)
- workflow.md 目前 zh-TW,英文版併入 v0.9 i18n(README 英/簡/日入口已註明)
