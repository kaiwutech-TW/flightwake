# 設計:包成 Claude Code plugin,從自架市集安裝(A9)

- 狀態:**已實作,未發版**(2026-11-11,Kai:「做」)。和下面「建議做法」不同處:第 2 點探針成立(根目錄就是 plugin,`skills` 指到 `./skills/en/`);第 3 點改成 `fw-coldstart` 引導跑 `npx flightwake init --plugin`(不由 skill 自己複製範本);第 4 點另外讓 plugin 的兩支 hook 在 repo 有自己那份時安靜;第 6 點的義務表由 `init --plugin` 寫。市集來源是 npm 套件。計畫來源:`docs/plans/narrow-and-launch.md` A9。
- 為什麼:現在只能 `npx flightwake setup`。Claude Code 使用者習慣 `/plugin install`;自架市集不需要審核。

## 官方文件(code.claude.com/docs/en/plugins、plugin-marketplaces、plugins-reference,2026-11-11 讀)

- 市集檔:repo 根目錄的 `.claude-plugin/marketplace.json`,必填 `name`、`owner`、`plugins`;每個 plugin 必填 `name`、`source`。
  `source` 可以是同 repo 的相對路徑(`"./plugins/x"`,從市集根目錄算)、`github`、`git-subdir`、`npm` 等。
- 安裝:`/plugin marketplace add kaiwutech-TW/flightwake`,再 `/plugin install flightwake@flightwake`;
  2.1.275 起可一步:`/plugin install flightwake --marketplace kaiwutech-TW/flightwake`。範圍可選 user / project / local。
- plugin 結構:`.claude-plugin/plugin.json`(只有 `name` 必填)、`skills/<名稱>/SKILL.md`、`hooks/hooks.json`(和 settings 的 `hooks` 同形)。
  hook 指令可用 `${CLAUDE_PLUGIN_ROOT}`、`${CLAUDE_PROJECT_DIR}`。
- plugin 的 skill 有命名空間:`/<plugin>:<skill>`。文件沒有說 i18n,也沒說同名時誰優先。

## 探針(Claude Code 2.1.322,`claude -p --plugin-dir`,暫存 repo)

| 問題 | 結果 |
|---|---|
| plugin 的 skill 能用不帶前綴的 `/fw-probe` 叫嗎? | **能**(repo 裡沒有同名 skill 時) |
| skill 內文的 `${CLAUDE_PLUGIN_ROOT}` 會被換掉嗎? | **會**,換成 plugin 的絕對路徑;skill 也讀得到 plugin 內附的檔(`templates/STATE.md` 的 nonce 讀回來了) |
| repo 的 `.claude/skills/fw-probe` 和 plugin 同名時,`/fw-probe` 叫到誰? | **repo 的那份**;`/fwprobe:fw-probe` 才叫到 plugin 的 |

推論:同一個 repo 若既有 `npx` 安裝又裝了 plugin,`/fw-…` 會叫到 repo 的那份(不會壞),但模型的 skill 清單裡兩份都在,Stop hook 也會跑兩次。

## 建議做法

1. **plugin 只含核心**:四個 skill(只出 en)、Stop hook(`state-check.mjs`)、坑提示 hook(`trap-check.mjs` + `traps-core.mjs`)、en 範本。不含 mod、roles、Orca、儀表。
2. **不複製一份進 git**:市集的 `source` 指向 repo 根目錄(`"./"`),根目錄放 `.claude-plugin/plugin.json`,用 manifest 的路徑欄位把 skill 指到 `skills/en/`、hook 指到一個 plugin 專用的 hooks 檔。這樣 plugin 和 npm 套件是同一份檔案。**要先探針**:manifest 的 `skills` 路徑欄位能不能指到 `./skills/en/`、根目錄 `skills/` 底下的語言資料夾會不會被誤認成 skill。不行的話退回「發版時產生 `plugin/` 資料夾」,由 smoke 檢查它和來源一致。
3. **第一次使用時誰建 `.flightwake/`**:`fw-coldstart` 找不到 `.flightwake/STATE.md` 時,plugin 版從 `${CLAUDE_PLUGIN_ROOT}/templates/en/` 複製範本(探針證實讀得到)。npx 版的 skill 是同一份文字,所以這段寫成「有 `${CLAUDE_PLUGIN_ROOT}` 就從那裡複製,否則請使用者跑 `npx flightwake init`」。
4. **兩種安裝並存**:`doctor` 讀 `.claude/settings*.json` 與 `~/.claude/settings.json` 的 `enabledPlugins`,看到 `flightwake@flightwake` 又有 `.claude/skills/fw-*` 就警告「裝了兩份,Stop 會提醒兩次」,並說怎麼拿掉其中一份。`trap-check.mjs` 已有去重紀錄,兩份同時跑也只提示一次。
5. **`trap-check.mjs` 要能在 plugin 裡跑**:現在它用自己的位置(`<repo>/.flightwake/hooks/`)找 repo;在 plugin 裡改用 `CLAUDE_PROJECT_DIR`。
6. **義務表**:plugin 不寫 `CLAUDE.md`。義務表是 flightwake 的核心之一(「事件觸發的義務」),只靠 skill 的描述觸發會弱很多。建議 `fw-coldstart` 在第一次建 `.flightwake/` 時問使用者要不要把義務表加進 `CLAUDE.md`。

## 待 Kai 決定

- **要不要開第二條安裝管道**:好處是 Claude Code 使用者一行裝好;代價是兩種安裝並存的情況要處理(上面第 4 點)、plugin 版沒有 Codex / Antigravity、義務表要另外問。
- 若要做:是否接受「plugin 版只有英文」(plugin 沒有 i18n 機制)。
