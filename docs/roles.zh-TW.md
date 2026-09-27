# 團隊角色——/clear 之後,每個 agent 仍然知道自己是誰

> English:[roles.md](roles.md) · 简体中文:[roles.zh-CN.md](roles.zh-CN.md) · 日本語:[roles.ja.md](roles.ja.md)

**選用附加元件,flightwake v0.14.0 起。** `init` 永遠不會安裝它。

## 它解決什麼問題

你帶一支小型 agent 團隊,例如 Codex 當專案經理、Claude 當技術總監、Claude 寫程式、Codex 審程式。你在對話裡
告訴每一個它的角色。接著有人跑了 `/clear`(或開了新 session),角色就不見了。專案經理醒來,在 STATE 讀到
「下一步:修 X」,然後做了任何有能力的模型在沒有其他指示時都會做的事:自己動手修 X。沒有人派工,也沒有人審核。

解法是把角色放在 agent **每次 session 開始都會讀**的地方,不是放在對話裡,也不是放在 STATE(STATE 講的是
現在在發生什麼,不是你是誰)。每個工具本來就有這樣一份檔案:

| Agent | 每次 session 開始(以及 /clear 之後)都會讀 |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |

Claude Code 不讀 `AGENTS.md`,Codex 也不讀 `CLAUDE.md`(已在 Claude Code 2.1 與 Codex 0.157 驗證;若未來版本
開始兩份都讀,「← you」標記與關於其他 agent 的註記仍能區分它們),所以在一個有一個 Claude 和一個 Codex 的
資料夾裡,光靠檔名,每個 agent 就知道哪個角色是自己的。不需要 hook、不需要啟動參數、不需要信任提示。

## 快速開始

```bash
npx flightwake roles                  # install the fw-roles skill into this repo
```

然後對你的 agent 說:**「跑 fw-roles」**(Claude Code:`/fw-roles`,Codex:`$fw-roles`)。它會:

1. **掃描**專案——README、套件清單、目錄結構、測試、`.flightwake/STATE.md`——並問你團隊橫跨哪些資料夾、手上有哪些 agent。
2. **推薦**3–5 個角色,從九個 preset 裡挑——核心 `pm`、`tech-lead`、`coder`、`reviewer`;視需要 `qa`、`researcher`;有條件才推薦 `release`(會部署上線)、`security`(碰到登入、金流、個資)、`designer`(有前端畫面)——每個都附一句連到你專案的理由。
3. **預覽**:一張表(角色 / agent / 資料夾 / 職責),再列每個角色的*你做 / 禁止 / 交給誰*。
4. **客製**你說的任何地方(「reviewer 可以自己修錯字」),並寫進 `.flightwake/ROLES.md`。
5. **套用**:先展示 `npx flightwake roles apply --dry-run`,你確認後再執行 `npx flightwake roles apply`。
6. **驗證**:對每個 agent 開一個新 session,問一個誘餌問題(「有個按鈕有錯字——你是誰?下一步做什麼?」)。pm、技術總監或 reviewer 應該把它轉派出去,而不是自己修。

**禁止**清單最重要。測試中,讓專案經理持續派工而不是自己寫程式的,是這幾句:「永遠不寫產品程式碼;一旦冒出
『我順手改一下比較快』,就改成派工」。客製時,把禁止事項改寫成有邊界的例外,而不是整條刪掉。

## ROLES.md

每個團隊一份檔案,放在專案經理工作的那個 repo 裡。第一個角色之前的文字是說明。

```markdown
# 團隊角色

## pm — 專案經理
agent: codex
repo: .

**你做**
- 排優先序,把工作拆成有邊界的任務,派工,驗收結果。

**禁止**
- 寫或改產品程式碼。

**交給誰**
- 實作 → coder;審核 → reviewer。

## coder — 主寫程式
agent: claude
repo: ../app
...
```

- `## <id> — <標題>` 開始一個角色。角色內文用粗體或 `###`,絕不用 `##`。
- `agent:` 是 `claude`、`codex` 或 `gemini`。
- `repo:` 是這個角色工作的資料夾,相對於本 repo 根目錄(絕對路徑與 `~/` 也可以)。預設 `.`。

## 橫跨多個 repo 的團隊

規劃 repo 與實作 repo 可以共用一支團隊。ROLES.md 放在其中一個;`roles apply` 會把每個角色寫進它 `repo:`
那行指定的 repo。每個產生的區塊都記錄了來源在哪(`src=`),所以在成員 repo 裡執行 `npx flightwake roles apply`
會找到同一份 ROLES.md,得到同樣的結果。apply 碰過的**每一個** repo,都要 commit 被改動的指令檔。

## 唯一的規則:同一資料夾,每個 agent 一個角色

agent 分辨自己的角色,只靠它讀哪份指令檔。同一資料夾裡的兩個 Codex 角色會讀到同一份 `AGENTS.md`,所以
`roles apply` 會拒絕並且什麼都不寫。把第二個角色放到另一個資料夾或 git worktree,或交給另一個 agent。

## apply 寫了什麼

每個角色變成指令檔**最上方**的一個區塊,夾在 `<!-- flightwake-roles:begin … -->` 與
`<!-- flightwake-roles:end -->` 之間:角色標題、一句說明此區塊會在 /clear 後重新載入、你的角色內文、整個團隊
清單(誰、哪個 agent、哪個資料夾、「← you」),以及一行說明使用者的直接指示視同派工。標記以外的內容一律不動。

從 ROLES.md 移除一個角色再重新 apply → 它的區塊會被移除。改 ROLES.md,不要改產生的區塊——下次 apply 會覆蓋它。

## 指令

| 指令 | 做什麼 |
|---|---|
| `npx flightwake roles` | 在 `.claude/skills/` 安裝(或刷新)`fw-roles` skill;repo 有 `AGENTS.md` 或 `GEMINI.md` 時也裝進 `.agents/skills/` |
| `npx flightwake roles apply --dry-run` | 顯示哪些檔案會變、以及確切的區塊;什麼都不寫 |
| `npx flightwake roles apply` | 把 ROLES.md 渲染進團隊中每個 repo 的指令檔 |
| `npx flightwake roles remove` | 從本 repo 移除角色區塊與 skill;ROLES.md 保留 |
| `npx flightwake update` | 只在已經安裝的地方刷新 skill |
| `npx flightwake uninstall` | 也會移除角色區塊與 skill;ROLES.md 和你其他的紀錄一樣保留 |

## 限制

- preset 與 skill 只提供英文與繁體中文;其他安裝語言拿到的是英文版。
- 不支援同一資料夾裡同一個 agent 擔任兩個角色(見上面的規則)。
- 角色是模型讀到的指引,不是沙箱。它改變的是 agent 選擇做什麼,不會攔下工具呼叫。你真正的防護(審核、分支
  保護、權限)要繼續保留。

## 參考過的前例

我們參考過的角色庫(只參考、沒有複製任何文字):[BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) · [ruflo](https://github.com/ruvnet/ruflo) · [wshobson/agents](https://github.com/wshobson/agents) · [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)。其中 multi-agent-shogun 每個角色的禁止行為清單,跟我們的「禁止」最接近。
