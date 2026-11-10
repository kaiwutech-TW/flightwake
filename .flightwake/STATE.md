---
updated: 2026-11-10
updated_by: Claude Code (Opus 5.5)
latest_record: records/261110-narrow-a1-a2-tripwire.md
health: yellow  # 測試全綠(mod 546/546 on 2.1.321、smoke 含 48、tsc、validate);仍黃:agy 的 Stop hook 未在真機觸發過、[Unreleased] 未發版
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

npm latest 是 **v0.17.0**(2026-10-11,mod 0.3.0 側邊面板與機隊中控台;發佈證據見 [[261011-fleet-console]])。之前的版本與里程碑各有 record,從 `records/` 依日期讀:0.16.0 [[261011-fleet-and-setup-flow]]、0.17.0 [[261011-mod-side-panel]]、真機驗證 [[261019-console-realmachine]]、traps similar/stats [[261026-traps-similar-and-trips]]、max review 修正 [[261026-review-fixes]]。

**2026-11-10 方向收窄**(計畫 `docs/plans/narrow-and-launch.md`,決定見 DECISIONS 同日五條):守住 Markdown 核心與 TRAPS;fleet、面板、spend、roles 進維護模式;Antigravity(`agy`)成為第三家平台、Gemini CLI 降級保留;zh-CN 與 ja 停在現版;研究報告留在本機 `reports/`、`research_notes/`(不進版控)。

**已完成**(詳見 [[261110-narrow-a1-a2-tripwire]]):A1 mod 測試回綠(測試 kit 改變,TRAPS 升 confirmed)、A2 agy 平台(`--agents=…,agy`)、絆線在 Bash 只對指令前綴與寫入的路徑提示;A3 TRAPS 壓實(Kai 放行):32 → 20 條 active、只剩 `unquoted-heredoc-runs-backticks` 無錨點(寫了理由)。這些和 10-19、10-26 的修正一起在 CHANGELOG `[Unreleased]`。

**展示網站**:四語 Astro 網站在 Cloudflare Pages(Direct Upload),標示 npm 0.17.0;部署證據 [[261011-mod-017-site]],指令見 `website/README.md`。

# 進行中(未完成勿刪)

- **agy 的 Stop hook 未真機驗**:等 Kai 照 `docs/plans/agy.probe.md` 跑 P1–P8;最大未知是 hook 的工作目錄。
- **dogfood 副本是舊的**:`.flightwake/hooks/state-check.mjs` 與 `.claude/skills/flightwake-mod` 還沒刷新,發版前跑 `node bin/cli.mjs update`(TRAPS `dogfood-dual-copy-drift`)。
- **仍未驗**:F7 blocked 的直接觀察(今天只有間接證據);權限對話框按「否」不被記;`/fw-fleet` 四語輸出;Codex hook trust 的 bypass 對照;spend 熱重載後「token 不明」但費用有值。
- **小 bug 不修**(維護模式):面板「本 session」列寫死工作中(`features/panel.ts` 的 `isSelf ? 'working'`)。
- 慣例演進採讀取端容忍(DECISIONS 2026-07-18),容忍不了時再議遷移工具。

# 下一步入口

1. **照 `docs/plans/narrow-and-launch.md` 繼續**:A7 `/fw-trap` 入選門檻 → A8 套件關鍵字 → A10 凍結標示與 setup 瘦身(setup 那題要 Kai 決定)→ A12 發 0.18.0(對外動作,先確認)。之後是 B 段線上資訊、C 段推廣(Kai 本人寫對外文字)。
2. **[Kai]** agy 探針 `docs/plans/agy.probe.md`;結果決定 A2 是否要改 hook 指令。
3. 舊待決:roles 座位設計對只有 AGENTS.md 的 repo 的影響、`~/.claude/projects` 下的 scratch session 資料夾是否刪除。
4. 發版後:常用 repo 跑 `npx flightwake update`;用 agy 的 repo 要明確加 `--agents=…,agy`(agy 不會被自動偵測)。
5. 未驗證平台:Windows(含 Intl 語系)、Linux Intl、Gemini CLI hook 真機。
6. 低優先:SCOPE+ 格式向使用者確認、向使用者要「最近重複踩到的 trap」驗證 confidence 三型、範例 repo。
