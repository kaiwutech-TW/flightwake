# flightwake 留下了什麼——以這個 repo 為例

> English:[evidence.md](evidence.md)

flightwake 從第一個公開 commit 起就用來開發它自己。它記下的一切都在這個 repo 的 [`.flightwake/`](../.flightwake/),
是純 Markdown,由做事的 agent 寫、人審過。這一頁說明四個月後它長什麼樣子,以及它能證明什麼、不能證明什麼。

## 紀錄的數字

2026-11-10 計算。要重算,在 repo 根目錄執行:

| 項目 | 數量 | 指令 |
|---|---|---|
| session 紀錄 | 45 | `ls .flightwake/records/*.md \| wc -l` |
| 決策(一行一條,附原因) | 127 | `grep -c '^\| 20' .flightwake/DECISIONS.md` |
| 仍有效的坑 | 20 | `npx flightwake traps stats` |
| 保留但已標 superseded 的坑 | 22 | `grep -c '^status: superseded' .flightwake/TRAPS.md` |

沒有任何東西被刪除。推翻的決策留著,並標明被哪一條取代;不再成立的坑標成 superseded,並指向取代它的條目。

## 值得打開的三個檔

- **一份 session 紀錄**:[`records/261110-narrow-a1-a2-tripwire.md`](../.flightwake/records/261110-narrow-a1-a2-tripwire.md)。
  Claude Code 更新後有 25 個測試開始失敗。這份紀錄寫了最後查出的原因、怎麼確認的、改了什麼、還有什麼沒驗。
  新的 session 或接手的人讀它就好,不用來問。
- **決策日誌**:[`DECISIONS.md`](../.flightwake/DECISIONS.md)。每個關掉其他選項的選擇一行,附原因與會讓它重開的條件。
  最上面幾行(2026-11-10)是一次範圍收窄:哪些功能進維護模式、為什麼。
- **一條坑**:[`TRAPS.md`](../.flightwake/TRAPS.md) 裡的 `plugin-test-kit-denies-unanswered-permission-request`。
  2026-10-26 以 `probable` 登記,並寫明還沒排除什麼;2026-11-10 在廠商的型別定義裡找到原因後升為 `confirmed`。
  是這個把握度標籤讓下一個 session 不去相信第一個解釋。

## 為什麼坑要標把握度

2026 年 8 月,我們稽核了另外兩個使用 flightwake 的 repo 的坑登記簿(私有專案,條目無法公開)。106 條裡有 24 條(22%)
後來被標為誤診、更正或取代。其中一例,同一個根因寫了三次,前兩次的解釋都錯,兩次之間那個功能在正式環境壞了三天。
另一條把單次觀察寫成「這樣操作是安全的」通則,結果並不安全。

所以現在每條坑都要標根因有多確定:`confirmed`(受控實驗至少兩次,或有一手來源)、`probable`(多次觀察、沒有對照)、
`suspected`(只看到一次)。論證「這樣會壞」用 `probable` 就夠;論證「這樣是安全的」必須 `confirmed`。完整經過:
[`records/260803-trap-confidence.md`](../.flightwake/records/260803-trap-confidence.md)。

這是工具作者對兩個 repo 做的一次稽核。它說明的是一個設計選擇,不是基準測試。

## 這些不能證明的事

- **這是單一維護者的 repo。** 大部分紀錄是繁體中文,也就是這裡的工作語言。
- **沒有受控比較。** [benchmarks.md](benchmarks.md) 的冷啟動量測只有兩次,對照組也沒有實跑。請當成描述,不是結果。
- **關於 context 檔的研究結論不一。** 一份 2026 年的研究發現 repo 的 context 檔普遍沒有提高 agent 的任務成功率,
  卻讓成本增加 20% 以上;另一份發現注入經過驗證、與任務相關的經驗有幫助。flightwake 押的是第二種:短的、審過的條目,
  只在 agent 碰到相關位置時出現。這個押注還沒有被量測過。
