---
record_id: 260723-eval-driven-hardening
session: Claude(Fable 5)
date: 2026-07-23
repos: [flightwake]
tests: bash test/smoke.sh 全過(22 組,含新增 7b health=green 證據檢查)
prod_changes: none(版本已 bump 0.10.0 但未發 Release;npm 發布待使用者觸發)
---

# 外部評測驅動的補強:同類專案掃描定位 + 三個真缺口落地(v0.10.0 待發)

**TL;DR**:使用者要求評測 flightwake 對 Fable 5 的價值並與同類專案比較。派 agent 掃了 GitHub 同類生態(claude-mem、beads、Cline Memory Bank、spec-kit、cc-sessions、ADR 工具鏈等 20+ 專案),結論:「事後記錄 × git 原生 × 零依賴 × 硬防護」象限無高星專案佔據,TRAPS 是全場唯一的坑登記一級公民。評測找出的缺口按序落地三項:fw-trap 跨 repo 通用坑雙寫、state-check 補 health=green 證據檢查、Stop hook 盲區誠實標注文件化。

## 關鍵發現(重要性排序)

1. **競品定位圖**:市場分三派——自動側錄+檢索(claude-mem ~88K stars:全記但不可讀、不記 why、不進 git)、任務/spec 先行(spec-kit/beads/taskmaster/CCPM:引導工作,與本框架哲學相反)、markdown 慣例(Cline Memory Bank:最同源但覆寫式無歷史軸、無強制,規模化後崩)。flightwake 的差異化組合(可讀 + 事件觸發 + TRAPS + 不引導)成立;beads 的 hash-ID + JSONL 是多 agent 並行衝突的已知參考解(見 DECISIONS 2026-07-23 緩議條目)。
2. **health=green 原本無背書**:「測試綠才算完成」硬防護與 health 自我申報之間沒有接線——偷懶 session 標 green 無機制可擋。現在 state-check 偵測「green 但最新 record tests 欄空白」(只看欄位有無,不判讀內文;CI 只警告)。
3. **跨 repo 通用坑會重咬是實證過的**:TRAPS 的 hook-stdin-tty-block 自記「只登在單一 repo,換 repo 重犯」。fw-trap 新 step 6 落地雙寫規則,並已回頭把該坑存進使用者層記憶(dogfood)。
4. 第一手冷啟動數據(本 session,第三筆樣本):/fw-coldstart 兩次讀取、約 1 分鐘、接手零糾正——與 benchmarks n=2 的 3–5K tok 級一致。

## 交付 / Commits

20569f9(單一批次:skills ×3、hooks ×2、README ×4、smoke 7b、design.md 過時條目、DECISIONS ×3、version bump 0.10.0)

## 驗證證據

- `bash test/smoke.sh` 全過,含新增 7b:record 無 tests 欄 → hook block + CI 警告不失敗;補上 tests → 靜默
- 源頭/安裝副本同步:`diff hooks/state-check.mjs .flightwake/hooks/state-check.mjs` 僅 LANG 蓋章差異;fw-trap skill 三份 diff 一致

## 未完 / 交接

- **發 v0.10.0 Release**(GH Release 觸發 trusted publishing;版本已 bump、未發)
- **Demo 錄製**(評測改進項第 5,採用轉化的最高投報項):需使用者參與——建議在任一實裝 repo 開新 session 錄 /fw-coldstart 實況(asciinema 或 Claude Code 畫面),20–30 秒即可,README 首屏放 GIF
- 評測完整報告(競品比較表)在本 session 對話中,若要沉澱可轉 docs/comparison.md(未定案,先不做)
- 前續未完事項不變:發宣傳三稿(使用者桌面)、HN flag 解除後補留言
