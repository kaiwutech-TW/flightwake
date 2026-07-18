---
record_id: 260718-v082-field-fixes
session: Claude(Fable 5)
date: 2026-07-18
repos: [flightwake]
tests: bash test/smoke.sh 全過(兩次:init 提示修正後、statusline 視窗修正後)
prod_changes: "npm 發版 v0.8.2(GitHub Release → release.yml trusted publishing,連續第四次全綠);驗證證據見下"
---

# 首日真實使用踩出兩個 UX 缺陷,當日修完發 v0.8.2;宣傳三稿定稿、官網 repo 就位

**TL;DR**:接續 [[260718-ab-workflow-handbook]],使用者開始實際佈署與發佈準備,當天踩出兩個真實缺陷並當日修復發版:(1) 純 `init` 不裝儀表但收尾訊息沒說,使用者以為壞了;(2) statusline 視窗硬編碼 200k,在 1M 視窗的 Fable 5 上把 12.7% 顯示成 63%(高估五倍)。後者依使用者的判斷「先實測 stdin 再決定方案」,發現 Claude Code statusline stdin 的 `context_window` 官方欄位直接帶真實視窗大小與百分比,連模型映射表都不用做。另完成:宣傳三稿去 GSD 點名改寫(存 `~/Desktop/flightwake-launch-copy.md`)、kaiwuweb clone 到桌面(private repo,gh 切 kaiwutech-TW 帳號抓取後切回)。

## 關鍵發現(重要性排序)

1. **Claude Code statusline stdin 有官方 `context_window` 欄位**(`context_window_size`、`used_percentage`、`current_usage` 明細),文件:code.claude.com/docs/en/statusline.md。實測(本 repo 暫時傾印 stdin)與文件一致。修正後優先讀官方欄位,舊版 Claude Code 無此欄位才退回 transcript/200k。順帶:v0.9 清單的「視窗依模型推斷」一項因此提前完成且方案更優。
2. **dogfood repo 的 hook 有兩份副本會漂移**(`hooks/` 源頭 vs `.flightwake/hooks/` 安裝副本)——已登 TRAPS [[dogfood-dual-copy-drift]]。
3. **`/cost` 的 cache read 累計值 ≠ context 大小**:7.4m cache read 是整個 session 每輪重讀前綴的計費累計;context 佔用要看最後一筆 usage 的 input 側(當時實際 ~347k/1M)。
4. 首日使用者困惑即產品訊號:兩個缺陷都不是功能壞掉,是「狀態沒說出口」(儀表未裝沒提示、分母錯了沒標示)——修法也都是把實話說出來。

## 交付 / Commits

7956fab..e6812ce + Release v0.8.2(範圍:宣傳三稿定稿與 STATE 指標、init 提示、statusline 視窗修正、版號)

## 驗證證據

- v0.8.2 發版:release.yml run 29649995364 completed/success(19 秒);`npm view flightwake version` = 0.8.2;tarball registry.npmjs.org/flightwake/-/flightwake-0.8.2.tgz
- statusline 修正三路實測:真實 stdin(1M 視窗)→ 35% 綠;移除 `context_window` 欄位 → fallback 200k 舊路;空 stdin → 靜默降級不噴錯
- init 提示:暫存目錄乾淨 git repo 實跑,收尾出現「底部儀表未裝(選配)」一行
- kaiwuweb 側:`.flightwake/hooks/statusline.mjs` 已手動同步修正版(npm 升級前的過渡)

## 未完 / 交接

- **發宣傳**(唯一主線):三稿最終版在使用者桌面 `flightwake-launch-copy.md`(已去 GSD 點名,含 HN 留言預備);截圖三張在使用者手上——注意紅 99% 那張是舊分母拍的,發文若引用百分比場景需與新版行為一致,建議重截
- 官網(kaiwuweb)blog + products 待新 session 開工(開工指令已交付使用者,在 2026-07-18 對話中;repo 已在 ~/Desktop/kaiwuweb,push 前需 `gh auth switch --user kaiwutech-TW`)
- v0.9 剩 i18n 一項(statusline 視窗項已提前完成)
