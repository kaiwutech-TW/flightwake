---
record_id: 261115-update-all-global-probe
session: Claude Code(Opus 5.5),2026-11-14 至 11-15(接續 [[261111-release-019]])
date: 2026-11-15
repos: [flightwake, 另 29 個 Kai 本機的 repo(只跑 update)]
tests: smoke 54 節全過(單獨執行,Python 3.11+ 在 PATH 前,exit 0);29 個升級過的 repo 各跑 doctor:0 failed(adsOS 1 則警告是它自己 STATE 的 latest_record 指向不存在的檔)
prod_changes: none(沒有發版、沒有部署;Kai 本機 29 個 repo 的框架檔被 update 改寫,未 commit)
---

# update --all 上線並實跑 29 個 repo;全域模式探針:三家都走自己的 plugin 系統

**TL;DR**:Kai 嫌多個資料夾要個別升級太麻煩。先做 A:`npx flightwake update --all` 照 `~/.flightwake/registry.json` 對每個 repo 跑 `update`,並在 Kai 的 29 個 repo 實跑成功(0.15/0.17 → 0.19.0)。再做 B 的探針:Codex 與 agy 都有 plugin 系統能把 skills 與 hooks 裝在使用者層級,不必碰 Orca 管的全域 hook 檔;設計稿 `docs/plans/global-mode.md` 已改成這條路。剩 Codex plugin hook 信任後的實際執行要 Kai 在 Codex 介面信任一次才能驗。

## 關鍵發現

1. **Codex plugin**(0.167.2):本機 marketplace(`.agents/plugins/marketplace.json`)+ `codex plugin marketplace add/plugin add` 可裝;skill 實測載入。plugin hook 由 `codex app-server` 的 `hooks/list` 列出,`source: plugin`、`untrusted`,信任鍵 `plugin@marketplace:檔:事件:序號`;`.codex-plugin/plugin.json` 的 `"hooks"` 可指定檔案,且優先於 `.claude-plugin/`。`codex exec` 不跑未信任 hook。
2. **agy plugin**(1.5.5):`plugin.json` + `skills/` + 根目錄 `hooks.json`(agy 具名格式),`agy plugin install <dir>` 複製到 `~/.gemini/config/plugins/`;在未信任的資料夾 `agy -p` 也載入 skill、執行 Stop hook,cwd 是 plugin 資料夾、`PLUGIN_ROOT` 有值。
3. **Orca 管著 `~/.codex/hooks.json`**(九個事件都在群組 0),寫入前會檢查檔案是否被別人改過(`HooksJsonChangedError`),並用 `config/batchWrite` 寫 `hooks.state` 信任自己的條目。flightwake 不寫這個檔(見 DECISIONS 2026-11-15)。
4. **實跑 `update --all` 才看到的**:很多 repo 上次升級後沒 commit,框架檔全部「已有變更」;重疊清單因此只列指令檔與設定檔(e91ab92)。

## 交付 / Commits

8ac41ab..b93a71b(update --all、重疊清單收窄、設計稿兩版);本 record 的 commit 另含 DECISIONS 兩條。

## 驗證證據

- `update --all --dry-run`:47 筆登記 → 將升級 29、已是最新 2、略過 1(Qwen3.8 無標記)、不存在 15(多為舊 session 暫存資料夾)。實跑:已升級 29、失敗 0,exit 0。
- 探針暗號:Codex 答出 plugin skill 的暗號;agy 答出另一個暗號且 Stop hook 寫出紀錄檔。

## 未完 / 交接

- **[Kai] Codex 探針 hook 信任**:在 scratchpad 的探針 repo 開 Codex,`/hooks` 信任兩條 `fwprobe`,問一句後離開;主線再讀紀錄檔(實際執行、cwd、`PLUGIN_ROOT`)。
- **探針還裝著**:Codex 的 `fwprobe-mkt` marketplace 與 `fwprobe` plugin、agy 的 `fwprobe` plugin。驗完要移除,再把 `~/.codex/config.toml` 等與 `~/.flightwake/backups/261115-global-probe/` 比對。
- 之後實作 `global install/update/uninstall`、`init --global`、hook 腳本 `--plugin` 模式的 Codex/agy 判斷(設計稿「修正後的形狀」)。
- `update --all` 尚未發版(CHANGELOG `[Unreleased]`)。29 個 repo 的變更待 Kai 各自 commit。
