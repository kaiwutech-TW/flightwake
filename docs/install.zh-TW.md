# 安裝 flightwake

> English:[install.md](install.md) · 回到 [README](../README.zh-TW.md)

安裝、升級、移除 flightwake 的完整說明。簡短版在 README:`npx flightwake setup`。

## 引導式安裝(`setup`)

```bash
cd your-repo
npx flightwake setup    # 引導式安裝:問幾個問題、列出將寫入的每個路徑
```

`setup` 需要終端機。它先檢查 git(目錄不是 repo 時會問要不要 `git init`,預設 No,且只在最後確認後才執行),接著問語言(依終端機語系預選——先看 `LC_ALL`,再看 `LC_MESSAGES`,再看 `LANG`,三者都沒設才看作業系統語系;`C` / `POSIX` 視為英文——並標出依據)、agent(資料夾已有 CLAUDE.md / AGENTS.md / GEMINI.md 時列出偵測結果;都沒有時直接問你用哪些工具,可複選、不預選)、選配附加元件(一題清單,見下)與 repo 類型(code / notes),先印一行摘要(`lang=… · agents=… · add-ons=… · profile=…`),猜錯一眼就看得出來,再列出將寫入的所有路徑,再問「確定執行? [Y/n]」——按 Enter 即安裝;`n`、EOF 或 Ctrl-C 都不會寫入任何東西。它與 `init` 走同一條安裝路徑,裝完跑 `doctor` 並印出下一步。命令列上給的旗標會直接回答對應的問題;`--private` 只能用旗標,從不詢問。

**附加元件清單**編號固定——1 底部儀表、2 Claude Code mod、3 團隊角色、4 Orca 協作(這裡不適用的不列)——你的回答就是你要的那一組:Enter = 保留標 `*` 的,輸入編號或名稱(`1 2`、`mod roles`)= 就是這些、其他都不要,`0` = 都不要。agent 裡有 Claude Code 時,mod 會預選,除非 `claude --version` 回報低於 2.1.287 的版本(mod 不會載入)。底部儀表只在你(`~/.claude/settings.json`)與這個 repo 都還沒有 status line 時才預選:它寫進會 commit 的 `.claude/settings.json`,在這個 repo 裡會取代每位隊友自己的 status line,那一列也會這樣說明。Orca 協作只在 setup 於 Orca 裡執行(有 `ORCA_*` 環境變數)時預選;只在 PATH 上找到 `orca` 程式時會列出但不標記,因為 GNOME 的螢幕閱讀器也叫 `orca`。團隊角色永不預選。已安裝的列標 `✓`,保持不動。

**已經裝過 flightwake 的 repo**,setup 不改語言與 repo 類型(那是 `update --lang=… / --profile=…` 的事)。若有這裡適用、但尚未安裝的附加元件,它提供三個選擇:就地升級(等同 `npx flightwake update`)、升級並加裝附加元件(只加不減——你其他的選項與紀錄都不動;與 `update --statusline / --mod / --orca` 同一條路徑),或維持原狀(什麼都不寫,exit 0)。適用的都已安裝時,直接走就地升級。

## 非互動安裝(`init` / `update`)

**非互動形式**——`npx flightwake init [旗標]`(直接打 `npx flightwake` 效果相同)從不提問:給自動化、agent、CI 與已經知道要什麼的進階使用者用:

```bash
npx flightwake init --lang=zh-TW --statusline   # 繁體中文 + 底部儀表
npx flightwake init --lang=zh-TW --statusline --agents=claude,codex,agy   # 三家一次裝齊(Claude Code + Codex + Antigravity)
npx flightwake update                           # 就地升級,沿用你裝過的選項(lang/statusline/private);結尾用一行列出你還沒裝的附加元件
npx flightwake update --mod                     # 升級並加上 Claude Code mod(也可 --statusline、--orca)
```

`update` 與 `init` 從不提問。有這裡適用、但尚未安裝的附加元件時,結尾會用一行點名,並附上 `npx flightwake setup`(先問、列出所有路徑)或直接的指令(`npx flightwake update --statusline / --mod / --orca`、`npx flightwake roles install`)。不會自動加裝,那一行也明寫要 agent 先問使用者;適用的都裝好後就不再出現。`--private` 安裝請照這些 `update` 指令,不要用 `init` 旗標:不帶 `--private` 的 `init` 會寫入共用的 `.claude/settings.json`。

## 語言

**選你的語言**(非互動形式;`setup` 會幫你問)— 安裝的模板、skill 與所有 CLI/儀表輸出都跟著它走。`setup` 的語言題以終端機語系為起點,並標出它讀到什麼——Enter 沿用,輸入編號改掉。`init` 從不猜:裝進去的語言是每個 clone 這個 repo 的人共用的,不該由某一個人的終端機決定。沒給 `--lang` 就裝英文;終端機語系是別的語言時,它會印出切換指令(`npx flightwake update --lang=<x>`)。直接複製你要的那行:

| 語言 | 全新安裝 | 已經裝成其他語言 |
|---|---|---|
| 繁體中文 | `npx flightwake init --lang=zh-TW --statusline` | `npx flightwake update --lang=zh-TW` |
| 简体中文 | `npx flightwake init --lang=zh-CN --statusline` | `npx flightwake update --lang=zh-CN` |
| 日本語 | `npx flightwake init --lang=ja --statusline` | `npx flightwake update --lang=ja` |
| English | `npx flightwake init --statusline` | `npx flightwake update --lang=en` |

切語言是安全的:`update --lang=<x>` 只換框架擁有的檔案(模板、skill、hook、marker 區塊),並沿用你其他的選項(private、儀表、附加元件、profile);你的 STATE / DECISIONS / TRAPS / records **完全不動**,維持你當初寫下的語言。不要儀表的話,把全新安裝那一欄的 `--statusline` 拿掉即可。加 `--agents=claude,codex,agy,gemini`(可任選子集)明確指定要裝哪些 agent;不加的話,init 依既有的指令檔(CLAUDE.md / AGENTS.md / GEMINI.md)自動偵測。Antigravity(`agy`)沒有自己的指令檔,第一次要用 `--agents` 指名,之後 `update` 會從它的 hook 認出來。

**不要手動翻譯裝好的檔案。** marker 記著你裝的是哪個語言,下次 `update` 會用那個語言的來源刷新,你的修改會消失。要換語言請用 `update --lang=<x>`;若已經手改過,現在 init/update 會逐檔列出它覆蓋了什麼。

## `init` 寫了什麼

init 會:建 `.flightwake/`(模板 + Stop hook)、複製 4 個 skill 到 `.claude/skills/`、把 Stop hook 併入 `.claude/settings.json`、把觸發義務表(含 `<!-- flightwake:begin/end -->` 標記)附加到**偵測到的 agent 指令檔**(CLAUDE.md / AGENTS.md / GEMINI.md,有哪個貼哪個;全都沒有就建 AGENTS.md;`--agents=claude,codex,agy,gemini` 可明確指定)。**每個平台都拿到同一套 skill 與 hook,用它自己的方言**:Codex、Antigravity 與 Gemini CLI 從 `.agents/skills/fw-*` 讀 skill,STATE 檢查分別進 `.codex/hooks.json`(Stop)、`.agents/hooks.json`(Antigravity,Stop)與 `.gemini/settings.json`(AfterAgent),義務表對 Codex 寫 `$fw-coldstart`、對 Claude Code 寫 `/fw-coldstart`、對 Antigravity 與 Gemini 寫裸 skill 名。Claude Code 與 Codex 另外有**坑提示**:一條 `PreToolUse`(`.flightwake/hooks/trap-check.mjs`,旁邊放共用的 `traps-core.mjs`),呼叫編輯到符合某條 active TRAPS `paths` 的檔、執行開頭符合它 `commands` 的指令、或用 shell 寫入這種路徑時,把那條提示出來。提示跟著工具結果送到 agent——是給下一步看的,不會擋;每條每個 session 只提示一次,紀錄放在 repo 外的私有資料夾(`~/.flightwake/hints`,0700;`FLIGHTWAKE_HOME` 可改位置)。`FLIGHTWAKE_TRIPWIRE=off` 可關掉;在 Claude Code 裡 mod 的 `"tripwire": false` 也會關掉它。Codex 首次執行會要你信任這些 repo hook 一次,之後若 `hooks.json` 裡的條目被改過,那條會被默默停用(`/hooks` 會顯示 needs review),所以 `update` 從不改寫這些條目。Antigravity 的 hook 不能附加 context,所以改用規則:有 `paths` 的坑產生成 `.agents/rules/flightwake-trap-*.md`(`trigger: model_decision`),由 `init` / `update` 與 `npx flightwake traps rules` 從 TRAPS.md 重產(產生的檔有「不要手改」標記;你自己的規則一律不動)。Antigravity 第一次開會問一次是否信任這個資料夾。各平台細節:[multi-agent.zh-TW.md](multi-agent.zh-TW.md)。**純檔案複製,零執行期依賴**(Node ≥18 只在安裝與 hook 時用)。使用者資料(STATE/DECISIONS/TRAPS)任何情況下都不覆蓋;`--force` 只更新框架擁有的檔案。

## 選項

**`--private`** 讓紀錄**只留本機、不進 git**:所有寫入登進 `.git/info/exclude`(純本地,不在 repo 留痕跡),hook 改進 `.claude/settings.local.json`,義務表改寫 `CLAUDE.local.md`(受 git 追蹤的既有指令檔一律不碰)。代價:紀錄不隨 repo 共享、重新 clone 後要重跑 `init --private`——「進 git 隨 repo 共享」才是 flightwake 的預設與存在理由,`--private` 是給「在別人的 repo 裡私用」的逃生口。

**`doctor`**(`npx flightwake doctor`)是唯讀、不連網的安裝結構檢查:git 與 git root、Node ≥18、`.flightwake/`、STATE(未填的範本欄位算警告)、`latest_record`、標記區塊及其 version/lang/profile 是否一致、skill、hook 註冊(JSON 合法、指令完全一致、事件正確——Claude Code、Codex 與 Antigravity 為 Stop,Gemini CLI 為 AfterAgent——無重複、腳本存在)、`--private` 的 exclude 是否真的生效,以及選配附加項狀態。每行輸出 ok / warning / fail;有任何 fail 即 exit 1。它只驗證安裝結構,不保證 hook 在執行期真的會觸發(Codex 是否信任 hook 路徑無法檢查,只會印出提示)。不寫入任何東西。

**`--profile=code|notes`**(預設 `code`)選擇義務表。`notes` 給非程式碼的 repo(寫作、研究、筆記):拿掉「測試綠 + typecheck 乾淨」、「prod 驗證證據」與 schema/prod 收尾觸發,保留冷啟動、決策、坑、交接、≥3 commit 收尾、破壞性操作先確認、session 結束時 STATE 誠實。安裝的檔案相同。profile 記在標記裡(`profile=notes`);`update` 會沿用,`update --profile=code` 可切回。

**`--orca`**(選配;也是 `setup` 清單的一列,只在偵測到 Orca 時列出,只在 setup 於 Orca 裡執行時預選)在每個啟用平台的指令檔加一個標記區塊:跨 agent 討論與審查要用看得見的 Orca 分頁,不要用藏在背景的執行;並附單一寫手審查協議(被請來審查的 agent 不寫 record、不碰 STATE;提問方把採納的結論寫進自己的 record)。`uninstall` 會移除;`update` 在已安裝處刷新;`update --orca` 會加上。

**`--mod`**(選配;`setup` 選了 Claude Code 時列出,版本 ≥2.1.287 時預選)把 `flightwake-mod` 裝到 `.claude/skills/flightwake-mod/`。mod 0.4.0 有九個開關:STATE 注入、提示橫條、session 飛行日誌、TRAPS 絆線、預設關閉的角色守門、API 等值費用、session Fleet、觸發紀錄、側邊面板。`/fw-mod` 顯示各功能狀態;`/fw-panel` 開啟面板,可看這個 repo 的 health、context 與注意事項。在 Orca 裡,面板還會按 repo 顯示 Claude、Codex 終端機,提供跳轉與須再次確認的閒置 agent 收尾。面板只在你要求後開啟,並記住這個選擇直到關閉。需要 Claude Code 2.1.287+、接受資料夾信任提示,並從 repo 根目錄啟動。**新安裝**後請重開 Claude Code,再跑 `/fw-mod` 確認載入。`update` 刷新已安裝的 mod,`update --mod` 加裝;`uninstall` 只移除發行檔並保留使用者自加檔。完整說明見 [docs/mod.zh-TW.md](mod.zh-TW.md)。

**`--git-init`** 讓 `init` 在目錄不是 git repo 時先建立它——只有明確給旗標才會做;沒給就停下並告知。`init` 與 `setup` 都會先檢查 git 是否已安裝,沒有則依平台給出安裝提示。

**`uninstall`** 反向清除 init 的固定寫入範圍:刪 skill 與框架檔(只刪發行的檔——你在 skill 資料夾裡自己加的檔,或發行檔位置變成目錄的,都保留並列出)、從 settings 摘除 flightwake 的 Stop 與 PreToolUse hook(使用者其他 hook 原樣保留)、移除指令檔與 `.git/info/exclude` 的標記區塊(由 flightwake 建的檔案清空後刪除)。**`.flightwake/` 是使用者資料,預設保留**,`uninstall --purge` 才連同刪除。

**monorepo 政策:單 repo 一份,裝在 git root。** 工作是 session 形狀的——一個 session 常橫跨多個 package,記錄跟著 session 走;拆到子目錄各裝會把同一段工作切碎成多份 record,也讓「該讀哪份 STATE」變成新的冷啟動歧義。子目錄執行 init 會擋下並指路 root。submodule 有自己的 `.git`,視為獨立 repo 各裝各的。多團隊高流量 monorepo 若覺得 CI 落後檢查誤報,先調 `--threshold`。

## 從 GSD 遷移

先把手上的 milestone 收完,然後:

1. `npx flightwake init`——與 `.planning/` 並存,什麼都不會被刪
2. 對你的 agent 說:「**這個 repo 從 GSD 轉用 flightwake:讀 `.planning/` 的現況,用 /fw-record 初始化 `.flightwake/STATE.md`,未完事項寫進下一步入口;從現在起 `.planning/` 只是歷史檔案,不要再更新它**」
3. 把 CLAUDE.md 裡 GSD 自己的指令段移除(或註解掉),避免兩套規則搶模型的服從

## 底部儀表(選配)

`npx flightwake init --statusline` 在 Claude Code 底部裝一條常駐儀表:

```
✈️ flightwake │ ●green · STATE 落後 2c │ ▓▓░░░░░░░░ 23%
```

health 顏色(你唯一要盯的事)、STATE 落後量(與 Stop hook 同一套 rev-list 邏輯,但從「結束時提醒」變成「隨時看得到」)、context 用量。儀表還會依狀態**直接提示下一個指令**:剛開場 → `→ 開工先 /fw-coldstart`;STATE 落後 ≥3 → `→ /fw-record 收尾`;context 快滿 → `→ /fw-record → /clear → /fw-coldstart`;一切正常 → 安靜。絕不覆蓋既有 statusline(單值設定),且 repo 層設定優先於使用者層,與全域儀表工具可並存。

注意:純 `npx flightwake init` **不會**裝儀表——它是選配。已經 init 過才想裝?跑 `npx flightwake update --statusline` 就會補上儀表,其他選項(包括 `--private`)沿用,下一個 Claude Code session 就會看到 bar。

儀表也會在 flightwake 有新版時提示(`→ 可更新 v0.9.1:npx flightwake update`)——只在沒有更要緊的事時顯示。檢查是每 24 小時最多一次對 npm registry 的匿名 GET,快取在系統暫存目錄,永遠在背景進程執行(渲染絕不等網路)。不想要:`FLIGHTWAKE_NO_UPDATE_CHECK=1`。

## CI 端收尾檢查(選配)

hook 只在 Claude Code、Codex、Antigravity、Gemini CLI 的 session 裡觸發;要把「STATE 不落後」的紀律帶到其他 agent 與人類協作者,在 CI 跑同一份腳本——STATE 落後 HEAD ≥3 commits 即失敗(`--threshold=N` 可調):

```yaml
# .github/workflows/flightwake.yml(範例;依你的 repo 慣例建議把 actions 釘到 SHA)
name: flightwake
on: [push, pull_request]
permissions:
  contents: read
jobs:
  state-fresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # rev-list 數落後量需要完整歷史
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: node .flightwake/hooks/state-check.mjs --ci
```

flightwake 不會把 workflow 寫進你的 repo——`.github/workflows/` 權限敏感,這超出「寫入範圍固定」的承諾;範例請自行複製。
