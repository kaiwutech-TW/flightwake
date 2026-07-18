# flightwake 基準測試(vs GSD)

框架的兩個量化指標:**冷啟動成本**(品質主指標)與 **token 邊際成本**(用量指標)。
資料點持續累積於本檔;測量方式如下。

## 測量方法

1. **冷啟動 token**:開全新 session → 只跑 `/fw-coldstart`(或 GSD 等效續作指令)→
   `node tools/session-cost.mjs`(零 token:解析 Claude Code 本機 transcript 的原始 usage,
   已做串流去重;`--since=<ISO>` 可切單一 turn)。`/cost` 降為人工 cross-check;
   transcript 格式是內部實作,工具失效時退回 /cost。讀取面可用
   `wc -c <讀到的檔案>` 精算下界(中文 ≈ 1 token/字 ≈ 0.35 token/byte)。
2. **冷啟動時間**:skill 內建計時(讀取起訖);另記「回報後使用者確認方向」的主觀正確性。
3. **每任務總量**:同一個真實任務分別在兩框架流程下完成,比 `/cost` 總量與 wall time
   (樣本少,僅供方向感;冷啟動指標才是可重複的)。

## 資料點

| 日期 | 場景 | flightwake | GSD 等效 | 備註 |
|---|---|---|---|---|
| 2026-07-17 | 內部 repo A 冷啟動(溫啟動:同 session 自測) | 讀取面 5.9KB ≈ 2.1K tok;含推理輸出 ≈ 4–5K tok;讀取 12 秒 | `.planning/` 核心四檔 31.3KB ≈ 11K tok,實務含 phase 文件 15–20K tok | 首筆;GSD 側為檔案實量非實跑 |
| 2026-07-18 | 本 repo 全新 session 真冷啟動(/fw-coldstart 單指令) | 讀取面 7.2KB ≈ 2.6K tok(STATE 2.9K + record 2.6K + skill prompt 1.6KB);/cost 全額:510 in + 24.7K cache write + 146.1K cache read + 2.0K out,$0.75;API 42s / wall 1m14s;3 個工具呼叫 2 輪往返 | | 首筆有效樣本。cache read 146K 與 cache write 大宗是 harness 系統 prompt+工具 schema+skill 目錄,任何指令都要付,非 flightwake 邊際成本;flightwake 邊際 ≈ 讀取 2.6K + 輸出 2K tok。接手零猶豫(STATE 下一步入口直接指名本次任務) |
| — | 待補:GSD 側實跑一次續作指令的 /cost | | | 公平對照 |

## 已知的測量偏差

- 本表 GSD 側目前是「讀取面實量」,未含 GSD 指令本身的 prompt 注入(通常不小)→ 差距被低估
- flightwake 側含 session 既有 context 的攤提困難 → 一律用「全新 session 單指令」測
- 中文 token 率隨 tokenizer 版本浮動,以 /cost 實測為準,byte 精算只當下界
