---
record_id: 260928-roles-presets-v2-plan
session: Claude(Opus 5.5) + Codex(GPT-6-Sol,同 worktree,經 orca-cli 協作)
date: 2026-09-28
repos: [flightwake, 兩個下游 repo(規劃 + 實作)]
tests: bash test/smoke.sh 全過;fw-roles 從零實跑(暫存雙資料夾團隊)通過;下游誘導題兩輪各 4/4
prod_changes: none(未發版;feat/roles 已推 origin)
---

# roles:從零實測、範本擴到 9 個、四語文件、v2 計劃經 Codex 兩輪審查定案

**TL;DR**:接續 [[260927-roles-addon]]。三件事:① `fw-roles` 從零實跑通過(dogfood 最後一個未驗點解除);
② 範本參考 BMAD/ruflo/wshobson/shogun(只參考不複製)擴為 9 個,每條新增的禁止事項對應一個有文獻的失敗模式;
③ 為「階段性角色沒位子、角色漂移、禁止事項無強制力」寫 v2 計劃,交同資料夾 Codex 審兩輪,定案 0.14.0 發現行版、
v2 放 0.15.0。v2 的「定義檔 = 硬限制」被 Codex 實測推翻。

## 關鍵發現(重要性排序)

1. **Codex 自訂 agent 的 `sandbox_mode = "read-only"` 沒擋住衍生子 agent 寫檔**(shell 與 apply_patch 都成功;
   子 rollout effective sandbox = workspace-write)→ TRAPS `codex-custom-agent-sandbox-not-enforced`(probable)。
   若照 r1 出貨,文件會寫「唯讀」實際可寫。教訓:權限承諾要用真的寫入去驗,不能用「產生了設定檔」或誘導題代替。
2. **跨模型審查有實質價值**:Codex 除推翻上述假設,還補出 8 個失敗情境(Orca worker 是新主 session 會讀到座位
   身分、舊格式 assign 無可改之行、manifest 不能把整份指令檔當可刪產物、兩個 team 同名產物衝突等)。
   協作方式:計劃檔 + 審查檔分開、`orca terminal send` 交接、背景輪詢審查檔出現;不需 orchestration Run。
3. **禁止事項要對準失敗模式寫**:新增條目各有依據(改測試求綠燈 54%→9%、自審偏好、缺「done when」、未驗證就
   宣稱上線)。下游針對性誘導題 4/4:pm 不收 coder 自稱完成、tech-lead 不擴範圍、reviewer 拒審同 context、
   coder 拒 skip 測試並寫衝突報告。
4. **從零實測的觀察**:agent 推薦會附專案事實理由、能把使用者的鬆綁寫成有界例外、確認前不寫檔;唯一偏差是
   描述區塊位置說成「加在後面」(實際置頂)→ skill 已補說明。
5. 發現下游 tech-lead 的實際工作已漂移為平台申請作業 → 這正是 v2 `assign` 的動機;0.15.0 前先手改 ROLES.md。

## 交付 / Commits

- flightwake:4db98ec..8f6144a(四語 roles 說明與 README 入口、9 範本 + skill 更新、v2 計劃 r3 + Codex 審查 + DECISIONS/TRAPS)
- 下游(本機 commit,未 push):禁止事項同步 + 重新套用
- tower:四語 README(tower repo 本機 commit,未 push;tower 無 remote)

## 驗證證據

- `bash test/smoke.sh` 全過(每次 commit 前)
- fw-roles 從零:暫存「規劃 + 產品」雙資料夾,Claude 以 `claude -p` / `--continue` 三輪跑完 掃描→推薦→客製→dry-run→apply;
  產物四檔各一區塊且置頂;之後四角色「使用者直接下令」誘導題 4/4
- 下游兩輪誘導題各 4/4(`codex exec -s read-only` / `claude -p --permission-mode plan`,新 session)
- push 前私人名稱掃描 0 筆

## 未完 / 交接

- 發版時機:本 record 寫成時使用者提議「v2 做完再與 0.14.0 一起發」,待定(見 STATE 下一步)
- 0.15.0 依 `docs/plans/roles-v2.md` r3 實作;發版前人工 gate 需在「已有不同座位角色」的 repo 測 worker 角色卡
- tower 凍結提案尚未寫入 DECISIONS(待使用者確認)
