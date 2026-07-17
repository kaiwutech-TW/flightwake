# flightwake ✈️

> **記錄是工作飛過後自然留下的航跡,不是起飛前必須申報的飛行計畫。**

給強模型(Claude Fable 5 世代起)的極輕量工作記錄框架。
前身思想來自 GSD:GSD 是**導航**(turn-by-turn 引導模型每一步),flightwake 是**行車記錄器 + 儀表警示燈 + 路標**——強模型自己會開車,框架只負責三件事:

1. **行車記錄器**:決策、發現、驗證證據,事後記錄(`records/`、`DECISIONS.md`、`TRAPS.md`)
2. **儀表警示燈**:模型強弱無關的硬防護(測試綠才算完成、prod 變更必留驗證證據、破壞性操作先確認)
3. **路標**:任何 session 死掉,下一個 session 讀 `STATE.md` 2 分鐘內安全接手

## 核心原則:記錄追隨工作,而非引導工作

GSD 是 **stage-driven**(research→plan→execute→verify 關卡制);flightwake 是 **trigger-driven**(事件觸發義務制):

| 觸發事件 | 義務 | 工具 |
|---|---|---|
| 開始動一個 repo | 先讀 STATE + 最近一筆 record | `/fw-coldstart` |
| 做出「關掉其他選項」的決策 | 一行進 DECISIONS(append-only,記 why) | 直接寫 |
| 踩到非顯而易見的坑 | 一則進 TRAPS | `/fw-trap` |
| 動 schema / 動 prod / 超過 ~3 commit | 收尾留 record | `/fw-record` |
| 工作會跨 session | **停手前**(非開工前)寫 handoff/CONTEXT | `/fw-handoff` |
| session 要關 | 更新 STATE 的位置與下一步入口 | `/fw-record` 內含 |

**升級規則(與 GSD 相反)**:預設一切都是 quick、直接動手;只有「跨多 session 的建設」才升級成 phase(一份 CONTEXT,plan 拆分交給模型臨場判斷)。

**品質唯一指標:冷啟動成本。** 不是文件數、不是流程合規率——新 session 讀多久能安全接手。超過 5 分鐘 = 記錄品質退化。

## 檔案結構(安裝進目標 repo 後)

```
your-repo/
├── .flightwake/
│   ├── STATE.md             # 現在在哪、下一步入口(永遠短、永遠新)
│   ├── DECISIONS.md         # append-only 決策日誌(一行一決策,記 why)
│   ├── TRAPS.md             # 坑registry(OKF 式 frontmatter 條目)
│   ├── TEMPLATE-record.md   # 飛行紀錄模板
│   ├── hooks/state-check.mjs  # Stop hook:STATE 落後 ≥3 commits 時提醒收尾
│   └── records/             # 飛行紀錄(每次有意義的收尾一份)
├── .claude/skills/fw-*/     # 四個 skill
└── .claude/settings.json    # init 併入 Stop hook 設定
```

## 與 Claude Code 記憶功能的分工

Claude Code 的持久記憶(memory 目錄)與 flightwake 同形(frontmatter + `[[連結]]`)但不同層:
**記憶是單機單人的;flightwake 的檔案進 git,隨 repo 共享給團隊、CI 與任何 agent。**
分工規則:repo 的事實(坑、決策、狀態)進 flightwake;個人偏好與跨專案習慣進記憶。同一件事不要雙寫。

## 與 OKF 的關係(分層,不競爭)

[Google OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) 管**知識層**(系統事實:schema、指標口徑、代碼對照),flightwake 管**過程層**(發生了什麼、為什麼、現在在哪)。flightwake 的知識型產物(TRAPS、領域事實)採 OKF 慣例:YAML frontmatter(`type`/`tags`/`timestamp`)+ `[[連結]]`,兩邊在「純 Markdown + frontmatter」底層天然相容。OKF 的目錄生成機器(reference agent)適合獨立的知識策展工作,不屬於本框架。

## 安裝

```bash
cd your-repo
npx github:kaiwutech-TW/flightwake init        # 升級既有安裝:加 --force
```

init 會:建 `.flightwake/`(模板 + Stop hook)、複製 4 個 skill 到 `.claude/skills/`、把 Stop hook 併入 `.claude/settings.json`、把觸發義務表(含 `<!-- flightwake:begin/end -->` 標記)附加到 CLAUDE.md(或提示你手動貼 `snippets/CLAUDE-md-snippet.md`)。**純檔案複製,零執行期依賴**(Node ≥18 只在安裝與 hook 時用)— 與既有 GSD `.planning/` 可並存(舊紀錄即歷史檔案)。使用者資料(STATE/DECISIONS/TRAPS)任何情況下都不覆蓋;`--force` 只更新框架擁有的 skill/hook/模板/片段。

## 起源

從 2026-07-15~17 的一個真實三日 session 萃取(repo-A × repo-B 雙 repo,19 commits、4 條 cron、2 個深層 bug 修復,全程無事前計畫、零走偏)。該 session 留下的 SUMMARY/CONTEXT/記憶檔就是本框架三個模板的原型。

## 狀態

🚧 內部測試中(kaiwutech-TW private)。驗證完成後開源。
