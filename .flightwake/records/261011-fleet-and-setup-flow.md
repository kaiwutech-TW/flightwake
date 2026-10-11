---
record_id: 261011-fleet-and-setup-flow
session: Claude(Fable 5.1)主導 + 兩個 Workflow(subagent 全為 Claude Opus 5.5:fleet 89 個 agent、安裝流程 69 個 agent;產出經主導者重跑關卡核對)
date: 2026-10-11
repos: [flightwake(main)]
tests: bash test/smoke.sh 46 節全過(Python 3.12 在 PATH 前;新 16.2、45、46.1–46.8);claude plugin test mods/flightwake 465 pass / 0 fail(13 檔;F6 前 312);claude plugin validate 通過;tsc 5.9.3(對 2.1.289 型別檔)clean;git-readonly-check 三項 ok;node --check bin/ test/ hooks/ 全過;doctor 失敗 0 提醒 0;真機:本 session `/fw-mod` 印出 v0.2.0 七個開關(spend、fleet 皆開),`~/.flightwake/sessions/<本 session id>.json` 由本 session 寫、`npx flightwake fleet` 列出「工作中」
prod_changes: npm publish flightwake@0.16.0(2026-10-11,release run 38129566832,provenance;證據見末節「發佈補記」)
---
<!-- flightwake record — 飛行紀錄。 -->

# mod F6 spend、F7 fleet(session 狀態回報)與安裝/升級流程升級

**TL;DR**:起點是使用者拿 herdr(一個 Rust 寫的多 agent 終端 runtime)問「Orca + flightwake 是否已達到同樣效果」。分析結論:持久化、agent 驅動 CLI、多機 Orca 都有,
缺的是「一眼看出每個 session 在工作/卡住等人/閒置」與「重啟後自動 `claude --resume`」。於是做了 mod F7 `fleet`:每個互動 session 把狀態寫到 repo 外的
`<base>/sessions/<id>.json`,由 `/fw-fleet`、`npx flightwake fleet`、底部儀表 `⛔` 欄讀取,意外中斷後一次性提示接回指令。接著使用者指出 `update` 從不裝 mod/roles、沒人知道有這些東西,
做了安裝流程升級:依終端機語系預選語言、附加元件一次多選(精確集合)、已安裝 repo 三選一、`update` 結尾點名未裝的附加元件。兩批都是 Workflow 實作 + 三鏡頭對抗審查各兩輪,
最後由主導者重跑全部關卡。F6 `spend`(10-09 做好)一併收在此 record。已依使用者決定分四個 commit 直接進 main,同日以 0.16.0 發版(見末節)。

## 關鍵發現(重要性排序)

1. **Claude Code 2.1.296 會在同一 session 內重新載入「已載入、檔案後來被改」的 skills-dir mod**。證據與副作用(module memory 歸零、spend 列顯示 token 不明)見 TRAPS
   `mod-installed-into-running-session-is-invisible-until-restart` 的 2026-10-11 補充。這意外給了 F7 真機證據:不用重開就看到本 session 的狀態檔、心跳與 `host.orcaTerminal`。
2. **`tool.check` 的 `ask` 不是對話框證據**(可能交給 auto 分類器或 headless host),而 `classic.PermissionRequest` 又沒有 `tool_use_id`。定案:blocked 只認「沒被下層答掉的 PermissionRequest」
   + 主迴圈 AskUserQuestion/ExitPlanMode 進行中;配對改用「工具名 + input 指紋」(指紋只在記憶體)。DECISIONS 2026-10-11 兩列、TRAPS `permission-request-has-no-tool-use-id`。
   審查另抓到:AskUserQuestion 也走權限路徑會被 R1 覆寫成 permission、子 agent 對話框被主迴圈 turn.complete 清掉、reload 時 compacting 卡 true——皆已修並有測試。
3. **mod 寫入防護必須 fail closed 且看實際路徑**:`<base>` 落在 session 的 repo、任何 git repo、或 flightwake 紀錄資料夾(有 STATE.md)內都拒寫(新狀態 `other-repo`);stat/exists 被拒絕就不寫;
   每次心跳重查 symlink 與外來檔。`--prune` 只刪 `flightwake.session/` 格式(含本格式的斷寫檔),base 在 repo 內拒絕執行。DECISIONS 2026-10-11。
4. **macOS 的 Node `Intl` 不看系統語系**:三個環境變數全 unset → `en-US`、空字串 → `und`、`LANG=C` → `en-US`;所以語系偵測以 LC_ALL > LC_MESSAGES > LANG 為準,C/POSIX 停止查找,Intl 只在三者皆空時用
   (實測與 spec 假設相反,已依實測改 DECISIONS 列 (a))。TRAPS `intl-locale-mirrors-posix-env`;Linux/Windows 未測。
5. **`init` 的旗標在 `--private` 安裝上會把 private 弄掉**(寫進共用的 `.claude/settings.json`);無 marker 的 private 安裝 `update` 還會退回英文。所以所有提示(未裝附加元件、改語言、覆寫警告、
   非 TTY 的 setup)一律指向 `update --statusline/--mod/--orca/--lang`,排除區塊標頭加 `lang=`,舊標頭從 hook 的 `LANG` 常數取回。TRAPS `init-flags-on-private-install-drop-private`。
6. **`registryPath` 用 `??`**:空的 `FLIGHTWAKE_HOME` 把 registry 寫進 cwd、相對值寫進 repo。改成與 `fleetBase` 同規則(只認非空絕對路徑,無 HOME 時跳過登記並提示)。
7. **PATH 上有 `orca` 不代表在 Orca 裡**(GNOME 螢幕閱讀器也叫 orca):只有 `ORCA_*` 環境變數才預勾、才進提示;儀表只在 repo 設定與個人 `~/.claude/settings.json` 都沒別的 statusLine 時才預勾。
8. **Workflow 成本**:fleet 89 個 agent / 8.5M token / 97 分鐘(中途撞用量上限暫停);安裝流程 69 個 agent / 6.1M token / 58 分鐘。兩輪審查分別確認 36 與 25 項,全數修掉;
   主導者重跑關卡與一次真實 setup 試跑(zh_TW 語系預選、三選一、update 提示)結果一致。

## 交付 / Commits

baa0ee8..(本 record 的 commit)共四個 commit:3048dc6 dogfood 副本刷新到 0.15.0、06cf66b mod 0.2.0(F6+F7)、b4db041 安裝流程、本 record。中間 commit 各自不保證獨立綠(混用檔案依主題歸類),關卡以最終狀態為準。43 個檔(含新檔 `bin/fleet.mjs`、`mods/flightwake/hooks/{lib,features}/{spend,fleet}.ts`、`tests/{spend,fleet}.test.ts`)。
範圍:mod 0.2.0(F6 spend:`/fw-cost`、band 末欄、儀表同欄;F7 fleet:`/fw-fleet`、資料契約 `flightwake.session/1`、心跳 30 秒、接回提示)、`bin/fleet.mjs`、儀表 `⛔` 欄、
安裝流程(`bin/install.mjs` 語系/附加元件介面、`bin/setup.mjs` 多選與三選一、`bin/cli.mjs` 提示、`bin/doctor.mjs`、`test/setup-drive.mjs` 新旗標)、smoke 16.1/16.2/45/46、
四語 `docs/mod*.md` 與 README、`docs/plans/mods.md`(「mod 永不寫檔」標 superseded)、CHANGELOG [Unreleased]、DECISIONS 2026-10-09/10-11 共 12 列、TRAPS 6 條、
本 repo dogfood 副本(`.claude/skills/flightwake-mod/`、`.flightwake/hooks/statusline.mjs`)已刷新。設計規格在 session scratchpad(fleet-spec.md、setup-spec.md),不入版控。

## 驗證證據

- 關卡(主導者重跑,2026-10-11):見 frontmatter `tests`;smoke 第一次在六個關卡並行時 43.1 的 pty Ctrl-C 曾因負載 timeout 紅一次,單獨重跑綠(疑似 flaky,未改測試)。
- 真機 F7:`~/.flightwake/sessions/7f451d49….json` schema `flightwake.session/1`、state working/idle 隨 turn 切換、seq 遞增、heartbeat 30 s、`host.orcaTerminal`/`orcaWorkspace` 有值、
  不含 prompt/指令文字;`npx flightwake fleet` 與 `--json` 讀到同一筆;`/fw-mod` 的 fleet 行「本 session 以「閒置」回報…每 30 秒心跳」。
- 真實 setup 試跑(暫存 repo、`FLIGHTWAKE_HOME` 指向暫存):`LANG=zh_TW.UTF-8` → 語言題預選 [2] 並說明依據、後續題目轉繁中;附加元件列表預勾儀表+mod、roles 不勾;
  計畫行 `lang=zh-TW · agents=claude · add-ons=gauge,mod · profile=code`;寫入清單含 `sessions/`(0700);已安裝 repo 顯示三選一(尚未安裝:團隊角色),答 3 零寫入;
  `update` 結尾:「尚未安裝的選配附加元件:團隊角色、Orca 協作。沒有自動加裝 — 要加之前先問使用者」。

## 未完 / 交接

- **F7 真機未驗證項**(要在一般權限、非 bypass 的 session 做):permission 對話框 → `blocked` 與儀表 `⛔`;AskUserQuestion;`/clear`(舊 id 標 ended、新 id 接手);`/exit` 與 `kill -9` 後
  下一個 session 的一次性接回 toast;`/fw-fleet` 四語表;ToolProgress 提早清 blocked。另:input 指紋在真引擎的 PermissionRequest `tool_input` 是否等於 `tool.check` 的 input(不等就退回 `perm:n`)。
- **spend 在 mod 熱重載後顯示「token 不明」但費用仍有值**:待查是 reload 清掉 module memory 還是 `$.state` 只存了費用。
- Windows 的 Intl 與 Linux 的 `Intl` 行為未測;`claude --version` 慢機器上 5 秒上限的體感未測。
- 發版已做(0.16.0,見補記)。README 仍說已安裝 repo 的 setup 不改語言與類型(帶 `--lang/--profile` 其實會改,行為本來就如此)。
- STATE 原「0a」待 Kai 決定的四項(roles 座位、TRAPS python 3.11 重複、scratch session 資料夾)仍開著。

## 發佈補記(2026-10-11,同 session)

使用者決定直接進 main 並發 0.16.0,順便把另一個 session(Codex)做好的展示網站網址放上 GitHub 頁面。步驟與證據(皆為唯讀指令再查):
- 網站:`gh repo edit --homepage` 設為展示網站網址(`gh repo view` 回讀一致);`package.json` 的 `homepage` 同步;README 四語在 Codex 的 bdf0fb2 已連結。
- 切版:CHANGELOG `[Unreleased]` → `[0.16.0] — 2026-10-11`(加展示網站一條)、`package.json` 0.16.0、本 repo dogfood 副本用 `node bin/cli.mjs update` 刷到 0.16.0(doctor 0/0);本地 smoke 46 節全過後 commit c6c486b,`git push` 直接進 main(GitHub 提示以管理員略過 4 個必要狀態檢查;push 後 ci/codeql/scorecard 對 c6c486b 皆 success)。
- 發版:`gh release create v0.16.0`(說明在 Release 頁)→ release run **38129566832** success:`bash test/smoke.sh` → `npm publish --provenance --access public`,日誌 `+ flightwake@0.16.0`、provenance 進 sigstore 透明日誌(logIndex 320490026)。
- npm:registry 直查 `dist-tags.latest = 0.16.0`、`time.0.16.0 = 2026-10-11T09:49:05Z`、`dist.attestations` 存在(publish 後約 1 分鐘才可見,npm 自己也提示「processing」)。暫存 repo `npx -y flightwake@0.16.0 init --agents=claude --lang=zh-TW` 成功並印附加元件提示;`doctor` 只剩 STATE 模板未填的提醒。
- 未隨版驗證:F7 的 permission/clear/exit/kill 真機路徑(文件已標「未在真實 session 驗證」),列在 STATE 進行中。
