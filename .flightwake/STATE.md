---
updated: 2026-11-11
updated_by: Claude Code (Opus 5.5)
latest_record: records/261111-release-019.md
health: yellow  # 0.19.0 已發且從 npm 實裝驗過(smoke 53 節、mod 549/0、doctor 0/0);黃燈只因 TRAPS active 21 條超過 20(Kai 暫緩壓實)
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

npm latest 是 **v0.19.0**(2026-11-11,mod 0.5.0;發佈證據見 [[261111-release-019]]):不裝 mod 也有坑提示(Claude Code、Codex)、agy 的坑規則檔、Claude Code plugin 市集、`--version` 修正。前一版 v0.18.0([[261110-release-018]])、v0.17.0([[261011-fleet-console]])。之前的版本與里程碑各有 record,從 `records/` 依日期讀:0.16.0 [[261011-fleet-and-setup-flow]]、0.17.0 [[261011-mod-side-panel]]、真機驗證 [[261019-console-realmachine]]、traps similar/stats [[261026-traps-similar-and-trips]]、max review 修正 [[261026-review-fixes]]。

**2026-11-10 方向收窄**(計畫 `docs/plans/narrow-and-launch.md`,決定見 DECISIONS 同日五條):守住 Markdown 核心與 TRAPS;fleet、面板、spend、roles 進維護模式;Antigravity(`agy`)成為第三家平台、Gemini CLI 降級保留;zh-CN 與 ja 停在現版;研究報告留在本機 `reports/`、`research_notes/`(不進版控)。

**已完成**(詳見 [[261110-narrow-a1-a2-tripwire]]、[[261110-narrow-a3-a10]]、[[261110-narrow-b3-a5-draft]]):A1 mod 測試回綠(測試 kit 改變,TRAPS 升 confirmed)、A2 agy 平台(`--agents=…,agy`)、絆線在 Bash 只對指令前綴與寫入的路徑提示;A3 TRAPS 壓實(Kai 放行):32 → 20 條 active、只剩 `unquoted-heredoc-runs-backticks` 無錨點(寫了理由);A7 `/fw-trap` 入選門檻與 `retire_when`;A8 npm 關鍵字;A10 維護模式標示(含 setup 清單上的 roles 與 Orca)、zh-CN/ja 標明停在 v0.17.0;B3 證據頁 `docs/evidence.md`;A5 設計稿 `docs/plans/tripwire-hook.md`;agy 真機探針 P1–P8 全部成立,hook 指令不必改([[261110-agy-probe]])。以上連同 10-19、10-26 的修正都已隨 0.18.0 發佈。B1 README 第一屏改成 Kai 選的「交接」句,安裝細節搬到 `docs/install.md`;A5 設計經 Codex 審查,Claude Code 上沒有「執行前提示」(DECISIONS 2026-11-10)([[261110-release-018]])。

**2026-11-11**([[261111-a5-trap-check]]):B5 GitHub 描述與 topics、B4 網站改版部署(Kai 確認);B2 示範旁白稿 `docs/plans/demo-video.md`。**A5**:Codex 探針顯示兩家都是工具跑完才讀到提示;TRAPS 解析收成一份 `traps-core.mjs`;新的 PreToolUse hook `trap-check.mjs` 給 Claude Code 與 Codex(不需 mod),每 session 一次的紀錄在 `<base>/hints`;真機驗過 mod 不重複提示([[261111-release-019]])。**A6**([[261111-a6-agy-rules]]):agy 的 `glob` 規則實測不載入,改用 `model_decision` 規則 `.agents/rules/flightwake-trap-*.md`(`npx flightwake traps rules`,init/update 重產);agy 在改檔前就讀了坑。**A9**([[261111-a9-plugin]]):repo 根目錄就是 Claude Code plugin,市集指向 npm 套件,`init --plugin`。A5/A6/A9 都隨 0.19.0 發佈。**B2 示範影片完成**:橫式 v3 與直式各中英文，在 Kai 桌面 `~/Desktop/計畫案/影片製作/粗剪/`,做法見 `docs/plans/demo-video.md`。

**展示網站**:四語 Astro 網站在 Cloudflare Pages(Direct Upload),2026-11-11 改版並於 0.19.0 再部署：交接句與安裝指令在首屏、`/` 改英文(繁中在 `/zh-TW/`);證據見 [[261111-a5-trap-check]],指令見 `website/README.md`。流量統計未開。

# 進行中(未完成勿刪)

- **仍未驗**:F7 blocked 的直接觀察(今天只有間接證據);權限對話框按「否」不被記;`/fw-fleet` 四語輸出;Codex hook trust 的 bypass 對照;spend 熱重載後「token 不明」但費用有值。
- **小 bug 不修**(維護模式):面板「本 session」列寫死工作中(`features/panel.ts` 的 `isSelf ? 'working'`)。
- 慣例演進採讀取端容忍(DECISIONS 2026-07-18),容忍不了時再議遷移工具。

# 下一步入口

1. **[Kai] 對外推廣**(計畫 C):2026-11-11 已發 YouTube 四支、README 與網站影片、X 串文、Reddit 兩個每週串的留言(連結見 [[261111-release-019]])。接下來:FB / IG / Threads(中文文案);Reddit 獨立經驗文要等帳號有 karma 或改用個人帳號。文案 Kai 本人寫，實作者只做事實核對、不改寫。
2. **[Kai]** 網站流量統計要不要開(Cloudflare Web Analytics,影片發出前決定);舊待決:roles 座位設計對只有 AGENTS.md 的 repo 的影響、`~/.claude/projects` 下的 scratch session 資料夾是否刪除;`~/.codex/config.toml` 裡兩條 `/Users/Shared/fw-demo/shop-api` 的信任設定與 `/Users/Shared/fw-demo` 是否清掉(錄影用，備份 `config.toml.bak`)。
3. **[Kai] TRAPS 壓實**:active 21 條 > 20;提案是把 `codex-hook-entry-change-silently-untrusted` 併進 `codex-project-trust`。Kai 2026-11-11 說「先不用」。
4. 未驗證平台:Windows(含 Intl 語系)、Linux Intl、Gemini CLI hook 真機。根目錄 plugin 補 icon(只影響官方目錄上架)。
5. 低優先:SCOPE+ 格式向使用者確認、向使用者要「最近重複踩到的 trap」驗證 confidence 三型、範例 repo。
