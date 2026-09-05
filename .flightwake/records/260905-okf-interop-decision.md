---
record_id: 260905-okf-interop-decision
session: Claude(Fable 5)
date: 2026-09-05
repos: [flightwake, flightwake-tower]
tests: flightwake-tower bash test/smoke.sh 8 節全過(新增 export 測項);真機隊實跑 export 成功(19 repo/235 條/256 檔)
prod_changes: 無(tower 仍未 publish;本 repo 只動 DECISIONS)
---

# OKF v0.2 互通評估:不對齊源格式,tower 做單向 export

**TL;DR**:使用者拿 GCP knowledge-catalog 的 OKF spec 問「我們用的是 v0.1 還是 v0.2、
能否全面對齊」。讀 spec 對照後結論:我們只用 v0.1 時代的底盤(frontmatter+內文+type/tags),
好幾處是自己的慣例(單檔 registry、[[wiki-link]]、active/superseded、confidence)。**全面對齊
被否決**(三處語意降級,理由見 DECISIONS 2026-09-05),互通改在 flightwake-tower 實作
`export --okf` 單向輸出 v0.2 conformant bundle——當天完工,源格式零改動。

## 關鍵發現(重要性排序)

1. **對齊的目的是互通,而互通可以整個在讀取層發生**——tower 已有全機隊解析器,吐 bundle
   只是映射;這是把查詢層獨立出來的直接紅利。「要不要對齊某外部 spec」類問題,先問
   「能不能 export 就好」。
2. **confidence 與 OKF trust tier 撞題不撞機制**:他們問「誰驗過」(provenance),我們問
   「根因把握多高」(epistemics)。一條 human-reviewed 的誤診在對方體系是最高信任級,
   在我們體系正是 confidence 要防的東西——這是不可映射的核心理由。
3. export 的誠實原則:**不揑造 `verified`**(exporter 不能替人 attest,全部 unverified by
   design);confidence/discovered 以 extension 欄原樣保留(spec 要求 consumer 保留未知欄);
   不對稱門檻規則寫進 bundle 根 index 隨資料過境。
4. v0.2 相對 v0.1 的主軸是信任機制(sources 可信度訊號、generated/verified、trust tier、
   actor 慣例、stale_after);additive 欄位想用可自由疊加,不構成義務。

## 本批變更

- flightwake:DECISIONS 一條(822efe2;本 record 與 STATE 另 commit)。range 內另兩個
  commit(da99dab dogfood Codex 層、8b8ab5b README)屬他 session 的零頭,git 訊息自足
- flightwake-tower:`lib/okf.mjs` + CLI `export --okf --out=DIR [--status=]` + smoke 測項
  + README 節(tower commit 7a5c020)。防護:out 目錄必須空、拒寫任何 registered repo 內
  (唯讀承諾延伸);同名 repo slug 自動消歧(kai-flightwake/orca-flightwake)

## 驗證證據

- tower `bash test/smoke.sh` 8 節全過(export 測項含:conformance §11 全檔掃描、status 映射、
  不揑造 verified、佔位不外洩、非空目錄/repo 內拒寫、--status=active 過濾)
- 真機隊實跑:`export --okf` 輸出 19 repo/235 條/256 檔,抽驗 concept 檔與根 index 符合預期

## 未完 / 交接

- 無新增未完項;tower publish 與 SCOPE+ 確認等既有事項見 STATE 下一步入口
