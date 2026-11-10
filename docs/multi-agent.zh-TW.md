# 一個資料夾、多個模型——讓 Claude Code、Codex、Antigravity 共用 flightwake 的記憶

> English version: [multi-agent.md](multi-agent.md)

## 只有一個觀念

flightwake 的記憶是 **repo 裡的檔案**,不是服務、也不是任何一個模型的私有記憶:

```
.flightwake/
├── STATE.md        # 現在在哪、進行中什麼、下一步從哪接
├── DECISIONS.md    # 關掉其他選項的決策,附 why
├── TRAPS.md        # 非顯而易見的坑,每條根因標 confidence
└── records/        # 每次有意義的收尾一份飛行紀錄
```

每個打開這個資料夾的模型,讀的是同四份檔、寫的也是同四份檔。共享機制就這樣,沒有同步步驟、沒有匯出、
沒有「把 Codex 的記憶匯進 Claude」——檔案變了,下一個打開資料夾的模型就看到。

各模型不同的只有**動詞層**:怎麼被告知義務表、怎麼呼叫四個 skill、收尾 hook 放哪。`npx flightwake init`
會替偵測到的每個平台裝好這一層,所以裝一次之後只管換工具。

## init 替每個模型裝了什麼

| | Claude Code | Codex | Antigravity(`agy`) | Gemini CLI |
|---|---|---|---|---|
| `--agents=` 名稱 | `claude` | `codex` | `agy` | `gemini` |
| 靠什麼偵測 | `CLAUDE.md`(或 `.claude/CLAUDE.md`) | `AGENTS.md` | `.agents/hooks.json` 裡它的 hook(第一次用 `--agents` 指定) | `GEMINI.md` |
| 義務表貼進 | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md`(與 Codex 同一個區塊) | `GEMINI.md` |
| skill | `.claude/skills/fw-*` | `.agents/skills/fw-*` | `.agents/skills/fw-*`(同一個目錄) | `.agents/skills/fw-*`(同一個目錄) |
| 怎麼叫 skill | `/fw-coldstart` | `$fw-coldstart` | 用名字,例如「跑 fw-coldstart」 | 說「跑 fw-coldstart skill」(靠名字/描述啟用) |
| 收尾 hook | `.claude/settings.json` 的 `Stop` | `.codex/hooks.json` 的 `Stop` | `.agents/hooks.json` 的 `flightwake-state-check` → `Stop` | `.gemini/settings.json` 的 `AfterAgent` |
| 坑提示(呼叫碰到有錨點的檔或指令後提示 TRAPS) | `.claude/settings.json` 的 `PreToolUse`(Edit、Write、NotebookEdit、Bash) | `.codex/hooks.json` 的 `PreToolUse`(Bash、apply_patch) | 有 `paths` 的條目產生成 `.agents/rules/flightwake-trap-*.md` 的 `model_decision` 規則(`npx flightwake traps rules`;init/update 會重產)——探針裡 agy 在**改檔之前**就讀了([A6](plans/agy-rules.md)) | — |
| 平台一次性提示 | 載入 repo hook 時確認 | 要你**信任**這些 repo hook 一次;之後被改過的條目會停止執行、不會提示,要到 `/hooks` 重新信任([探針](plans/tripwire-hook.probe.md)) | 第一次開時問一次是否信任這個資料夾,沒有針對 hook 的提示 | — |
| 真機驗證 | 有 | 有 | 有——agy CLI 1.5.3,2026-11-10([探針](plans/agy.probe.md)) | 沒有——而且 Google 已於 2026-06-18 對個人方案停止 Gemini CLI,只剩企業授權與 API key 用戶 |

Antigravity 沒有自己的指令檔,它讀 `AGENTS.md`。同時裝了 Codex 時,共用的區塊用 Codex 的 `$fw-…` 寫法,並各附一行說明;
只裝 Antigravity 時用裸名。它的 Stop hook 回 `decision: "continue"`;Antigravity 不提供迴圈防護,所以每個對話在同一個
HEAD commit 最多提醒一次。

今天只有 `CLAUDE.md` 的 repo,要一次裝好 Claude Code、Codex、Antigravity:

```bash
npx flightwake init --agents=claude,codex,agy   # 建 AGENTS.md,全部裝齊
git add .flightwake .claude .agents .codex CLAUDE.md AGENTS.md && git commit
```

已經裝過?`npx flightwake update` 會重新偵測現有的指令檔,把缺的平台補上。install/update 任何情況都不會
覆蓋 `.flightwake/` 裡的東西。

三家的 hook 是同一份腳本(`.flightwake/hooks/state-check.mjs`),用各宿主的方言回話。它只在真正的 session
裡觸發;在 shell 跑 `node .flightwake/hooks/state-check.mjs --ci` 是同一個檢查。

## 換模型時的日常循環

讓共享成立的規則只有一條:**停手的模型負責寫,接手的模型負責讀。**

1. **換走一個模型前**(或結束它的 session 前):叫它收尾——`/fw-record`、`$fw-record`、或「跑 fw-record
   skill」。這會更新 STATE,值得的話再寫一份飛行紀錄。STATE 落後 3 個以上 commit 時 hook 會催,但你不必等它催。
2. **commit**(`git add .flightwake && git commit`)。同一台機器、同一個 checkout,下一個模型不 commit 也立刻
   看得到檔案;跨機器、跨 worktree、跨隊友,git 就是運輸層,所以 commit 並 push。
3. **下一個模型打開資料夾**,第一個動作是冷啟動(`/fw-coldstart`、`$fw-coldstart`、「跑 fw-coldstart」)。
   它讀 STATE 與最新 record、回報現況,然後才動手。每個模型走同一套腳本,所以不管上一份 record 是誰寫的、
   這次是誰讀,交接長得一模一樣。
4. **工作中的義務三家相同**:關掉其他選項的決策 → DECISIONS 一行;非顯而易見的坑 → 當下 `fw-trap`;
   跨 session 的建設要停手 → `fw-handoff`。

典型的一天:Claude Code 做設計並記錄 → 你 commit → Codex `$fw-coldstart` 後接手實作,收尾寫自己的 record
→ 隔天早上 Gemini CLI「跑 fw-coldstart」後做 review,在 `records/` 看到兩份 record,順手登一條它發現的坑。
三個模型,一條時間軸。

## 什麼**不會**共享(也不該共享)

- **各工具自己的記憶**——Claude Code 的 auto-memory、Codex 與 Gemini 的對話歷史與 transcript——留在各工具、
  各機器。flightwake 不讀它們。一個事實對 repo 重要,就得**進 repo**:坑寫 TRAPS、決策寫 DECISIONS、現況寫
  STATE。義務表逼的就是這件事。
- **平台設定**(`.claude/`、`.codex/`、`.gemini/`、`.agents/`)本來就各家各的。commit 進去讓隊友拿到同樣的設定,
  但別期待一家去讀另一家的。
- **`--private` 安裝**用 `.git/info/exclude` 把 `.flightwake/` 擋在 git 外。在**那一台機器上**跨模型照樣能用,
  但什麼都不會傳出去——private 模式就是刻意用共享換隱私。

## 兩個模型同時開在同一個資料夾

有時 Claude Code 和 Codex 會同時開著同一個 checkout。可以,兩條規矩:

- **一個檔案同一時間一個寫手。** STATE 與 DECISIONS 是 append/改寫的目標;兩個 session 同時收尾,你就得手動
  合併。讓一個做完它的 `fw-record`,另一個再開始。
- **沒冷啟動的模型不知道另一個剛做了什麼。** 如果另一個 session 在這個忙的時候寫了 record,收尾前叫這個
  重跑一次冷啟動,它的 STATE 更新才是疊在現況上,而不是把人家的蓋掉。

想真的平行,給每個模型各自的 git worktree;flightwake 每個 repo 只裝一次(裝在 git root),每個 worktree
在自己的分支上帶著同一份 `.flightwake/`。

## 檢查接線有沒有通

```bash
ls .agents/skills .claude/skills           # 兩邊都有 fw-coldstart fw-handoff fw-record fw-trap
cat .codex/hooks.json .gemini/settings.json # 各自有一條 state-check.mjs hook
grep -n 'fw-coldstart' CLAUDE.md AGENTS.md GEMINI.md
# → CLAUDE.md 是 /fw-coldstart、AGENTS.md 是 $fw-coldstart、GEMINI.md 是 fw-coldstart
```

然後在每個工具裡打開資料夾,用該工具的語法要求冷啟動。三家都該回同一段「上次到哪 / 這次從哪接 / 有沒有未驗證
的東西」——因為讀的是同一份 STATE。

## 角色:讓每個 agent 在 /clear 後還記得自己是誰(選配,預覽版)

一個資料夾裡同時有 Claude 當技術總監、Codex 當專案經理時,角色如果只講在對話裡,/clear 一清就沒了——專案經理
醒來看到「下一步:做 X」,最省事的反應就是自己動手寫。`flightwake roles` 把角色寫進各 agent 每次開場都會讀的
指令檔,所以不需要 hook,/clear 後自動回來:

```bash
npx flightwake roles                 # 裝 fw-roles skill(init 不會裝)
# 然後請 agent 跑 fw-roles:掃專案 → 推薦角色 → 你預覽、客製 → 寫出 .flightwake/ROLES.md
npx flightwake roles apply --dry-run # 先看會寫什麼
npx flightwake roles apply           # 寫進 CLAUDE.md / AGENTS.md / GEMINI.md 的標記區塊
```

- **一個團隊一份 ROLES.md**,可以跨資料夾:`repo: ../other-repo` 的角色會被寫進那個 repo。
- **唯一限制**:agent 靠「讀哪個指令檔」分辨角色,所以同一資料夾每個廠牌最多一個角色。
- 完整說明:[roles.zh-TW.md](roles.zh-TW.md)。
- 每個預設角色都有「禁止」清單——實測中讓專案經理乖乖派工而不自己寫的,就是那幾行。
