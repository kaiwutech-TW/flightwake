# 示範影片實錄(S1–S6)

配合 `demo-video.md` 的畫面清單。六段都用 vhs 在真的終端機裡錄,成品在 `~/Desktop/計畫案/影片製作/實錄/`,
tape 腳本在同目錄 `tapes/`(S1、S3)與本次 session 的暫存資料夾(S2、S4–S6,下面寫了重錄方法)。剪進影片的方式見 `build_v2.py`。

## 共同做法(不讓私人資訊入鏡)

- **假的家目錄與示範專案**:`/Users/Shared/fw-demo/` 當 HOME / `FLIGHTWAKE_HOME`;示範專案是虛構的 `shop-api`(Stripe webhook、訂單 API),
  作者 Alex Chen,裝 flightwake 0.18.0(英文、claude/codex/agy、mod)。英文 STATE、一份 record、三條 DECISIONS、一條錨在 `src/payments/webhook.js` 的 TRAPS,
  `npm test` 42 個測試真的會過。git tag `base-s5` = S2/S4/S6 用的狀態;`lag3-s5` = S5 用的(多三個 commit,STATE 落後 3)。
- **錄影前清掉環境變數**:`CLAUDE*`、`ORCA_*` 全部 unset(不然 Claude Code 會以子 session 身分啟動,狀態列出現「Transcript saving is off」)。
- **Claude Code**:示範專案拿掉底部計量列(它一定顯示花費),改由 mod 的狀態列;`--settings /Users/Shared/fw-demo/claude-demo-settings.json` 把 mod 的 `spend` 關掉。
  畫面仍會出現模型與方案名稱(例:Fable 5.2 · Claude Max),不算私人資訊。
- **Antigravity**:標頭會顯示登入帳號的 email,錄完用 ffmpeg `drawbox` 蓋掉(x=270 y=114 w=460 h=34),前 10 秒逐格檢查過;未遮的原檔已刪。
- **信任對話框**:三家第一次開都會問信任資料夾,先在隱藏的一次執行裡按掉;Codex 另外要「Trust all and continue」信任 repo 的 hook。
  這會在 Kai 的 `~/.codex/config.toml` 留下 `/Users/Shared/fw-demo/shop-api` 的專案信任與 hook 信任兩筆(`config.toml.bak` 是之前的備份)。

## 各段

| 段 | 檔案 | 長度 | 內容 | 剪進影片的片段 |
|---|---|---|---|---|
| S1 | `S1-setup.mp4` | 17.2 秒 | 乾淨 repo 跑 `npx flightwake setup`,停在完整路徑清單與 `Proceed? [Y/n]`,沒有真的安裝 | 打指令 → 跳到路徑清單 |
| S2 | `S2-coldstart.mp4` | 51 秒 | Claude Code 開 `shop-api` 打 `/fw-coldstart`,約 10 秒回報上次到哪、health 黃、下一步跑壓測 | 打指令 → 跳到回報 |
| S3 | `S3-decisions.mp4` | 13 秒 | vim 在 DECISIONS 最上面打一行(含理由)、反白 | 整段加速到旁白長度 |
| S4 | `S4-trap-hint.mp4` | 64.7 秒 | 請 Claude「把 `express.json()` 移到所有路由前面」,它不改、引用 `stripe-webhook-needs-raw-body` 那條坑,給兩個安全做法 | 打指令 → 跳到回答 |
| S5 | `S5-wrap-up.mp4` | 121.9 秒 | STATE 落後 3 個 commit;問一句之後 Stop hook 擋下「lags 3 commits behind」,Claude 接著跑 `/fw-record`、寫 record、commit | Stop hook 訊息 → 跳到收尾摘要 |
| S6 | `S2-coldstart.mp4`、`S6-codex.mp4`、`S6-agy.mp4` | — | 同一個 repo:Claude Code `/fw-coldstart`、Codex `$fw-coldstart`、Antigravity 只說「Pick up where the last session left off.」,三家都說出同一個下一步(跑 500 events/s 壓測) | 三家各 2.3–2.8 秒,右上角標名稱 |

## 錄的時候發現的

- **坑的提示畫面上看不到**:mod 的絆線在 Edit 之後把提示附在工具結果裡給 agent,Claude Code 一般畫面只顯示「1 PostToolUse hook ran」,要按 ctrl+o 才看得到全文
  (trips 紀錄證實有觸發)。所以 S4 改拍「agent 停下來引用坑」;旁白第 8 句因此要改,見 `demo-video.md`。
- **S4 的停下來主要來自冷啟動**:CLAUDE.md 的義務表讓 Claude 開工先跑 coldstart,STATE 的常備事實與 TRAPS 已經寫了這條坑。不是改檔後才觸發的提示。
- **S5 第一次錄的示範 commit 太空**(壓測腳本只有兩行、alert 只是註解),Claude 在 record 裡如實寫「做了的事比 commit 訊息說的少」。改成真的實作後重錄。
- **agy `--mode auto` 仍會問 shell 指令要不要跑**,錄影時在固定時間按 Enter 同意。

## 重錄

```
cd /Users/Shared/fw-demo/shop-api && git reset --hard base-s5 && git clean -fd   # S2/S4/S6;S5 改用 lag3-s5
rm -f /Users/Shared/fw-demo/.flightwake/trips/*.json                             # S4:同一 session 同一條坑只記一次
vhs <tape>
```
