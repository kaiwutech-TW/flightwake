# 團隊角色——/clear 之後,每個 agent 仍然知道自己是誰

> English:[roles.md](roles.md) · 简体中文:[roles.zh-CN.md](roles.zh-CN.md) · 日本語:[roles.ja.md](roles.ja.md)

**選用附加元件,flightwake v0.14.0 起。** `init` 永遠不會安裝它。

## 它解決什麼問題

你帶一支小型 agent 團隊,例如 Codex 當專案經理、Claude 當技術總監、Claude 寫程式、Codex 審程式。你在對話裡
告訴每一個它的角色。接著有人跑了 `/clear`(或開了新 session),角色就不見了。專案經理醒來,在 STATE 讀到
「下一步:修 X」,然後做了任何有能力的模型在沒有其他指示時都會做的事:自己動手修 X。沒有人派工,也沒有人審核。

團隊跑一陣子之後,還會冒出兩個問題:

- **有些角色只在某些階段需要。** 資安審查、UI 設計、發版在後期才重要,但你不想讓它們從第一天就佔掉一個 agent。
- **職責會漂移。** 技術總監最後在做平台的文書工作;角色文字應該乾淨地跟著改。

## 兩個概念:座位與待命角色

**座位**是一組(資料夾, 廠牌)。座位上的角色寫在該廠牌**每次 session 開始都會讀**指示的地方——不是放在對話裡,
也不是放在 STATE(STATE 講的是現在在發生什麼,不是你是誰):

| 廠牌 | 每次 session 開始(以及 /clear 之後)都會讀 |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |

Claude Code 不讀 `AGENTS.md`,Codex 也不讀 `CLAUDE.md`(已在 Claude Code 2.1 與 Codex 0.157 驗證),所以在一個
有一個 Claude 和一個 Codex 的資料夾裡,光靠檔名,每個 agent 就知道哪個角色是自己的。這也是唯一的限制:
**每個資料夾、每個廠牌只有一個座位。** 長期存在的角色坐座位——pm、技術總監、coder、reviewer。

**待命角色**沒有座位,也沒有數量限制。`roles apply` 會在每個有座位的(資料夾, 廠牌)裡,把它產生成原生的
agent 定義:

- Claude Code:`.claude/agents/fw-<id>.md`
- Codex:`.codex/agents/fw-<id>.toml`

需要它的時候:

- **同一廠牌、短任務** → 坐在座位上的 agent 召喚原生 agent `fw-<id>`(例如 coder 叫出 `fw-security`)。
- **不同廠牌,或較長的任務** → 專案經理派出一個 worker,任務開頭放上 `npx flightwake roles card <id>` 產生的
  角色卡。角色卡寫著「這次任務,請擔任這個角色」,並覆蓋 worker 落腳資料夾的座位角色;repo 共用的規則照樣適用。

特定階段才需要的角色(security、designer、release、qa)一開始先待命。每個都可以帶一段 `### 何時叫`,它會出現在
每個座位的團隊清單裡——所以專案經理每次 session 開始都會重讀這些觸發條件。

## 快速開始

```bash
npx flightwake roles                  # install the fw-roles skill into this repo
```

然後對你的 agent 說:**「跑 fw-roles」**(Claude Code:`/fw-roles`,Codex:`$fw-roles`)。它會:

1. **掃描**專案——README、套件清單、目錄結構、測試、部署、`.flightwake/STATE.md`——並問你團隊橫跨哪些資料夾、手上有哪些 agent。
2. **推薦** 3–4 個座位與一些待命角色,從九個 preset 裡挑——核心 `pm`、`tech-lead`、`coder`、`reviewer`;視需要 `qa`、`researcher`;有條件才推薦 `release`(會部署上線)、`security`(碰到登入、金流、個資)、`designer`(有前端畫面)——每個都附一句連到你專案的理由。
3. **預覽**:座位表、待命角色與何時叫它們,再列每個角色的*你做 / 禁止 / 交給誰*。
4. **客製**你說的任何地方(「reviewer 可以自己修錯字」),並寫進 `.flightwake/ROLES.md`。
5. **套用**:先展示 `npx flightwake roles apply --dry-run`,你確認後再執行 `npx flightwake roles apply`。
6. **驗證**:對每個座位開一個新 session,問一個誘餌問題(「有個按鈕有錯字——你是誰?下一步做什麼?」),再實際叫一次某個待命角色。

**禁止**清單最重要。測試中,讓專案經理持續派工而不是自己寫程式的,是這幾句:「永遠不寫產品程式碼;一旦冒出
『我順手改一下比較快』,就改成派工」。客製時,把禁止事項改寫成有邊界的例外,而不是整條刪掉。

## ROLES.md

每個團隊一份檔案,放在專案經理工作的那個 repo 裡。第一個角色之前的文字是說明。

```markdown
# 團隊角色

## pm — 專案經理
**你做**
- 排優先序,把工作拆成有邊界的任務,派工,驗收結果。

**禁止**
- 寫或改產品程式碼。

**交給誰**
- 實作 → coder;審核 → reviewer。

## security — 資安審查
**你做**
- 審查碰到登入、機密、金流、個資的變更。
### 何時叫
- 變更碰到登入、權限、機密、金流、個資。

## seats
| repo | vendor | role |
|---|---|---|
| . | codex | pm |
| ../app | claude | coder |
| ../app | codex | reviewer |
```

- `## <id> — <標題>` 開始一個角色。角色內文用粗體或 `###`,絕不用 `##`。
- `## seats` 是一張表:`repo` 相對於本 repo 根目錄(絕對路徑、`~/` 與空白都可以),`vendor` 是
  `claude`、`codex` 或 `gemini`,`role` 是角色 id。一個角色可以佔好幾個座位;沒有座位的角色就是待命角色。
- 沒有座位表的舊檔案(每個角色帶著 `agent:` / `repo:` 行)照舊可用;`roles assign` 會要你先遷移,
  fw-roles skill 會附完整預覽幫你遷移。

## 橫跨多個 repo 的團隊

規劃 repo 與實作 repo 可以共用一支團隊:ROLES.md 放在其中一個,`apply` 會寫進座位表裡的每一個 repo。每個產生的
區塊都記錄了來源在哪(`src=`),所以在成員 repo 裡執行 `npx flightwake roles apply` 會找到同一份 ROLES.md,
得到同樣的結果。apply 碰過的**每一個** repo,都要 commit 被改動的檔案——指令檔、`.claude/agents/`、
`.codex/agents/`,以及 ROLES.md 旁邊的 `.flightwake/roles-manifest.json`。

## 換座位:`roles assign`

```bash
npx flightwake roles assign ../app:codex release --dry-run   # preview
npx flightwake roles assign ../app:codex release             # edit that one seats cell, then re-apply
npx flightwake roles assign ../new:claude designer --add     # a seat that doesn't exist yet needs --add
```

`assign` 只改座位表裡的那一格——註解、角色內文、順序都不動——而且如果 ROLES.md 在它規劃期間被改過,它會拒絕
寫入。變更在每個 agent 的**下一個新 session** 生效;在那之前,執行中的 session 與 worker 維持原本的角色。
在 DECISIONS 加一行說明原因(fw-roles skill 會做)。

## apply 寫了什麼,以及它絕不覆蓋什麼

- **座位區塊**,位於每份指令檔**最上方**,夾在 `<!-- flightwake-roles:begin … -->` 與
  `<!-- flightwake-roles:end -->` 之間:角色、一句說明此區塊會在 /clear 後重新載入且是*主 session* 的角色、
  你的角色內文、團隊清單(座位、待命角色與何時叫它們、「← you」),以及一行說明使用者的直接指示視同派工。
  標記以外的內容一律不動。
- **原生待命定義**,位於 `.claude/agents/` 與 `.codex/agents/`,每一份都標記為產生物。
- **一份 manifest**(`.flightwake/roles-manifest.json`),列出每一個產生的輸出與它的 hash。

apply 只會改寫或移除仍與它當初產生的內容一致、或已經等於新內容的輸出。你自己寫的同名檔案、你手動改過的產生檔,
或另一支團隊的輸出,都算**衝突**:apply 會列出來,什麼都不寫。當一個角色或整個 repo 從 ROLES.md 離開,它的舊區塊
與定義會透過 manifest 清掉。改 ROLES.md,不要改產生的輸出。

## 指令

| 指令 | 做什麼 |
|---|---|
| `npx flightwake roles` | 在 `.claude/skills/` 安裝(或刷新)`fw-roles` skill;repo 有 `AGENTS.md` 或 `GEMINI.md` 時也裝進 `.agents/skills/` |
| `npx flightwake roles apply --dry-run` | 顯示哪些會新增、更新或清掉——以及確切的區塊;什麼都不寫 |
| `npx flightwake roles apply` | 把 ROLES.md 渲染進團隊中每個 repo;清掉過時的輸出 |
| `npx flightwake roles card <id>` | 把一個角色以派工卡形式印到 stdout(出錯時:stdout 無輸出,訊息寫到 stderr,非零結束碼) |
| `npx flightwake roles assign <repo>:<vendor> <id> [--add] [--dry-run]` | 把一個角色放上一個座位 |
| `npx flightwake roles remove` | 從本 repo 移除角色區塊、產生的 agent 與 skill;ROLES.md 保留 |
| `npx flightwake update` | 只在已經安裝的地方刷新 skill |
| `npx flightwake uninstall` | 也會移除角色區塊、產生的 agent 與 skill;ROLES.md 和你其他的紀錄一樣保留 |

## 限制——請先讀這段

- **角色是指引,不是權限。** 它改變的是 agent 選擇做什麼,不會攔下工具呼叫。我們測過:定義為唯讀的 Codex
  自訂 agent,從可寫入的 session 召喚出來時照樣會寫檔。flightwake 產生的任何東西都不宣稱能強制執行什麼。你真正的
  防護(審核、分支保護、工具本身的權限設定)要繼續保留。
- 每個資料夾、每個廠牌一個座位;要更多,就用待命角色或另一個資料夾/worktree。
- preset 與 skill 只提供英文與繁體中文;其他安裝語言拿到的是英文版。
- Gemini CLI 有座位區塊,但還沒有原生待命定義。
- **Codex 只在受信任的專案裡載入 `.codex/agents/`——而且必須是那個確切的 repo 路徑受信任**(受信任的上層資料夾不涵蓋裡面的 git repo,每個 worktree 路徑也各自分開算)。確認方式是實際召喚一次,而不是看檔案在不在;帶有 Codex 不認得欄位的定義會被悄悄丟掉,這就是為什麼 flightwake 只寫 `name`、`description` 與 `developer_instructions`。
- 角色的「何時叫」是告訴 agent 的資訊,不會自己觸發。座位區塊帶有明確規則(「任務符合時,就由那個角色做——召喚它或派工給它」),測試中正是這條讓 agent 真的去轉派。

## 參考過的前例

我們參考過的角色庫(只參考、沒有複製任何文字):[BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) · [ruflo](https://github.com/ruvnet/ruflo) · [wshobson/agents](https://github.com/wshobson/agents) · [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)。multi-agent-shogun 每個角色的禁止行為清單,跟我們的「禁止」最接近;Gas Town 的長期 crew 與短期 worker 之分,跟我們的座位與待命最接近。
