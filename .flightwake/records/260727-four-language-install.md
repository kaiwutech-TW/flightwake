---
record_id: 260727-four-language-install
session: Claude(Opus 5)
date: 2026-07-27
repos: [flightwake]
tests: bash test/smoke.sh 全過(25 組,新增 zh-CN/ja 安裝與覆蓋點名兩組);四語安裝實跑輸出見驗證證據
prod_changes: none(未發版;內容待下次 Release 一起出)
---

# 安裝內容擴到四語;不做語言自動偵測;覆蓋本地修改改為逐檔點名

**TL;DR**:使用者問「`init --statusline` 會不會自動辨識語言」,並提到自己都是裝完再請 Claude 手動改成中文。查證後兩件事都成立問題:語言完全不自動偵測(`langArg ?? marker?.lang ?? 'en'`),而手動翻譯會在下次 `update` 被無聲清空(marker 仍記 lang=en)。修法不是加自動偵測——實測證明該訊號不可靠——而是把安裝內容從兩語擴到四語(en/zh-TW/zh-CN/ja)、讓預設之外的選項在 init 收尾與四語 README 都看得見,並在覆蓋本地修改時逐檔點名。

## 關鍵發現

1. **語言自動偵測是不可靠訊號,實測即為反例** → 入 DECISIONS 2026-07-27。本機終端 `LANG=en_US.UTF-8`、Node `Intl` 解析 `en-US`,但 macOS 實際系統語系是 `zh_TW`(`defaults read -g AppleLocale`)。照 env 偵測會很有自信地裝英文——比「有文件的預設」更難察覺。讀真實系統語系需 shell 呼叫且僅 macOS,違反零依賴承諾。**結論:明講預設 + 讓替代選項好找,勝過猜測。**
2. **手改安裝檔會在升版時無聲蒸發**(實測序列:init 英文 → 手動翻譯 → `update` → 翻譯歸零,marker 仍 `lang=en`)。這是「框架檔歸框架管」設計的正確結果,但**無聲**才是問題所在。
3. **四語下位置參數的 M(en, zh) 會靜默錯位**:改一個語言的字串很容易讓其餘位置整排偏移且不報錯。改成 key 查表 `M({en, 'zh-TW', 'zh-CN', ja})`,缺 key 回退英文而非印 undefined。35 處呼叫全轉。
4. **覆蓋偵測必須限定「同版本且同語言」**才有意義:跨版本或跨語言時內容本來就不同,那時判定必然誤報。與 state-check 同一原則——寧可少報不可錯報。
5. **zh-CN / ja 的 README 原本寫著「模板暫提供 en/zh-TW 兩種」**,擴語言後這句變成假陳述,已一併修正——四語文件的代價就是這種散落各處的過時斷言。

## 交付 / Commits

見本次 commit(四語安裝內容 18 檔、M() 機制、init 提示、覆蓋點名、四語 README 安裝表、smoke 兩組新測試)

## 驗證證據

- `bash test/smoke.sh` 25 組全過;新增測試涵蓋:zh-CN/ja 的 marker/蓋章/模板/儀表/state-check 輸出語言、覆蓋本地修改逐檔點名且**不列入使用者資料**、切語言時**不誤報**
- 四語實跑輸出(`init --lang=X --statusline` 後跑儀表與 state-check):
  zh-CN `✈️ flightwake v0.10.1 │ ●green · STATE 更新中 │ → 开工先 /fw-coldstart` / `✅ flightwake:STATE 新鲜(落后 0 < 阈值 3)`;
  ja `→ まず /fw-coldstart から` / `✅ flightwake:STATE は最新(遅れ 0 < しきい値 3)`
- 四語安裝內容檔案數一致(各 9 檔)
- 兩支 hook 源頭與安裝副本 diff 僅剩蓋章差異

## 未完 / 交接

- **日文與簡中翻譯未經母語者校對**,由模型產出。品質風險真實存在;README.ja/zh-CN 早先也是同樣來源。建議推廣後在 issue 徵求校對(CONTRIBUTING 已列「非英語 README 的母語者修正」為特別歡迎項)
- 四語維護成本已翻倍:任何行為變更要改 4 份 README + 4 份安裝內容。DECISIONS 已記重評條件(某語言長期落後時考慮降級為社群維護)
- 本批仍未發 Release;CHANGELOG `[Unreleased]` 已收錄
- 測試踩到的坑(已在測試內註解):新測試切換 cwd 後未切回,污染後續測試;`grep -A5` 抓過頭抓到不相干區塊——斷言要限定在區塊邊界內
