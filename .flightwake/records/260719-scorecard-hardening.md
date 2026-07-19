---
record_id: 260719-scorecard-hardening
session: Claude(Fable 5)
date: 2026-07-19
repos: [flightwake]
tests: CodeQL 首跑 success(1m20s,零 findings);ci.yml 同 push 全綠(14s);無 runtime 面變更
prod_changes: none(repo 側 CI/文件;無發版)
---

# Scorecard 體檢後的補強三件套:SECURITY.md 揭露流程、dependabot 盯 actions、CodeQL SAST

**TL;DR**:接續 [[260719-v090-i18n-update]]。使用者拿 OpenSSF Scorecard(總分 5.4)當開源練習的檢查表,分析拆成三堆:七項滿分(開源前硬化的驗收)、四項便宜真改進、五項單人專案結構現狀不追。本段落地前三項改進:SECURITY.md 補揭露流程與直達連結(改英文主版,並誠實補記 0.9.0 儀表更新檢查這個唯一網路行為)、dependabot 每週盯 GitHub Actions SHA 升版(runtime 零依賴,actions 是唯一該盯的;附帶把 PR 流程帶進工作習慣)、CodeQL SAST(釘 SHA、最小權限,照本 repo workflow 硬防護規矩)。

## 關鍵發現(重要性排序)

1. **Scorecard 對個人小專案的正確用法是檢查表不是計分板**:量表按多人大型供應鏈專案設計,Code-Review/Contributors/Fuzzing 對單人零依賴 CLI 是結構性 0 分,追分即 cargo cult;值得做的三項全因「本來就有真實價值」入選,尤其 dependabot——釘 SHA 不配升版提醒,久了會變成凍在舊版。
2. **威脅模型文件要跟著功能走**:0.9.0 新增的更新檢查是專案唯一網路行為,SECURITY.md 主動寫明(匿名 GET/24h 快取/可關)——安全文件裡藏著不寫的東西才是真扣分項。
3. Scorecard 的 Branch-Protection -1 是掃描器認證錯誤(保護實際有開)、Signed-Releases -1 是它只看 GH Release 附件(我們的完整性走 npm provenance)——讀報告要會分「真缺口」與「量測盲區」。

## 交付 / Commits

65b1764(SECURITY.md 重寫 + .github/dependabot.yml + .github/workflows/codeql.yml)

## 驗證證據

- CodeQL run 29672132333:success,1m20s,零 findings;ci run 29672132310 同 push 全綠
- 新 workflow 權限:頂層 read-all,僅 analyze job security-events: write;action SHA 沿用 repo 既有釘點

## 未完 / 交接

- Scorecard 週掃後看三項回分;Maintained 滿 90 天自癒;第四項(PR 流程)由 dependabot 的升版 PR 自然開始
- HN:等 hn@ycombinator.com 回覆解 flag 後補「v0.9.0 已兌現 English defaults」留言;X 中英稿未發
