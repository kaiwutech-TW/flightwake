結論：支持 doctor 與冷啟動補洞；**不建議照目前規格直接實作**。主要問題是預設互動、選配變預設，以及既有安裝的調整語意未定義。本次僅唯讀審查 `9dd685c`，未修改檔案、未執行會寫入暫存檔的 smoke。

**五題回答**

1. **TTY 分流仍會破壞自動化。** Agent、IDE terminal、PTY 腳本都可能讓 `stdin.isTTY=true`，原本直接安裝變成等待回答；只有旗標的 `flightwake --lang=zh-TW` 也會受影響。建議第一階段只讓明確的 `setup` 互動，保留無指令行為。若仍採分流，至少定義 EOF、Ctrl-C、stdout 被重導向及旗標優先序。

2. **notes 保留檔案集合合理，不應刪 TRAPS／records。** 筆記專案同樣需要陷阱、決策與交接。但精簡義務表應保留 trap、handoff、≥3 commits 收尾與破壞性操作確認，只移除不適用的工程義務。也須同步處理 skill／模板文字：[fw-record:3](/Users/kaiwu/orca/flightwake/skills/zh-TW/fw-record/SKILL.md:3) 仍列 schema/prod 觸發。

3. **同意流程足以授權 `git init`，不足以維持「只複製檔案」的字面承諾。** 應明寫這是例外，且確認後才執行。目前第 2 步先建 repo、第 9 步才確認所有寫入，取消時已留下 `.git`；最好延後到最終確認後，或清楚揭示兩階段副作用。

4. **doctor 要檢查安裝結構，不能宣稱 runtime 已生效。** 應補 JSON 格式、正確事件與 command、重複註冊、缺失 STATE／latest_record、平台間 marker 不一致、private 排除是否有效。Gemini 是 `AfterAgent`，不是 Stop（[cli:437](/Users/kaiwu/orca/flightwake/bin/cli.mjs:437)）。Codex 精確路徑信任已有 confirmed 紀錄，但檔案存在仍不能證明載入成功（[TRAPS:8](/Users/kaiwu/orca/flightwake/.flightwake/TRAPS.md:8)）；`codex exec` hook 未載入的根因則仍是 suspected，不能當確定規則。

5. **確有牴觸，不能只引用 intake gate 那條就略過。** 2026-07-18 明確決定「不做互動選單」（[DECISIONS:49](/Users/kaiwu/orca/flightwake/.flightwake/DECISIONS.md:49)）；roles 明確要求 opt-in（[DECISIONS:14](/Users/kaiwu/orca/flightwake/.flightwake/DECISIONS.md:14)）。新需求可以取代舊決策，但需明記。用內建 readline 並不必然違反零依賴，這部分舊理由可以修正；**Enter 預設全裝則仍不符合原本 opt-in 意圖**。

**(a) 對目前程式碼的錯誤或過度概括**

- 「git 失敗一律落到 Not a git repo」不精確：目前只有缺 `.git` 才進該分支；已有 `.git` 時不先驗證 git 是否可用（[cli:52](/Users/kaiwu/orca/flightwake/bin/cli.mjs:52)）。
- 「所有 CLI 輸出走四語 M()」不是現況：help、git 錯誤等仍硬編英文（[cli:34](/Users/kaiwu/orca/flightwake/bin/cli.mjs:34)）。可以列為新增要求，不能當既有保證。
- README 寫入清單本身已漏掉 `~/.flightwake/registry.json`；init/update 確實會寫（[cli:73](/Users/kaiwu/orca/flightwake/bin/cli.mjs:73)、[cli:602](/Users/kaiwu/orca/flightwake/bin/cli.mjs:602)）。摘要不能只照 README 列路徑。
- 「筆記 repo 會被測試檢查誤報」缺少限定：hook 只檢查既存最新 record 的 `tests:` 是否非空，不判斷是否真的跑測試（[hook:50](/Users/kaiwu/orca/flightwake/hooks/state-check.mjs:50)）；模板已允許填「無 runtime 面」（[模板:6](/Users/kaiwu/orca/flightwake/templates/zh-TW/TEMPLATE-record.md:6)）。

**(b) 設計風險與漏例**

- **profile 解析／持久化：**現有 regex 不接受 `profile=notes`（[cli:106](/Users/kaiwu/orca/flightwake/bin/cli.mjs:106)）；而 private 安裝可能跳過指令檔，根本沒有 marker。需定義無 marker 時如何保留 profile，以及多 marker 衝突如何處理。
- **「調整選項」不等於 init/update：**目前 private/statusline 用 OR 沿用，無法表達取消（[cli:131](/Users/kaiwu/orca/flightwake/bin/cli.mjs:131)）。減少 agents 也不清理舊產物；切 private 更不會取消既有 git 追蹤。
- **private＋roles 會漏排除：**`roles install` 另外複製 skill，沒有更新 exclude（[roles:486](/Users/kaiwu/orca/flightwake/bin/roles.mjs:486)）。setup 串接兩者後，角色檔可能出現在 git status。
- **STATE 誤判與資料保護：**任何 `{{…}}` 都視為全未初始化，會誤傷部分已填內容或合法範例。應僅補已知模板欄位、保留現有內容，並定義首次無 record、無 commits、缺 README 時的行為；不能猜 green。
- **doctor 不可沿用模糊偵測：**目前 hook 安裝以字串包含檔名判定，錯 command 也可能被視為已裝（[cli:383](/Users/kaiwu/orca/flightwake/bin/cli.mjs:383)）。另外 `.claude` skill/hook 目前永遠安裝，不能只按 active agents 推導檢查清單。
- **測試缺互動取消與 notes 行為驗證：**補最終拒絕零寫入、EOF／Ctrl-C、worktree／submodule、profile 雙向切換；實際驗證 notes 不檢查證據、仍檢查落後。doctor 唯讀驗證須包含 ignored 檔及外部 registry，不能只看 git diff。

**(c) 我會刪減的部分**

- 第一階段取消無指令自動進 setup；先提供明確 `setup`。
- 取消 Enter 全裝；roles 預設否，statusline 僅向 Claude 使用者提供。
- 暫緩完整「調整選項」介面，先提供保留選項的升級。
- 不加隱藏環境變數繞過 TTY；抽出可注入輸入輸出的問答函式測試。
- 不做 notes 專用檔案樹；保留共同檔案，集中處理義務差異。