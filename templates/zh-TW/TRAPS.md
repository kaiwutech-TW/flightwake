<!-- flightwake TRAPS — 坑 registry。非顯而易見、會再咬人的事實。 -->
<!-- 條目採 OKF 式慣例:frontmatter 區塊 + 內文;可用 [[名稱]] 互連。新的加最上面。 -->
<!-- 時效:條目過時(功能合併/重構後不再成立)不刪 — status 改 superseded 並指向取代者;讀的人只信 active。 -->
<!-- 證據強度:confidence 標的是「根因」的把握度,不是症狀。**不對稱門檻**——拿這條論證
     「這樣會壞」probable 就夠(錯了只是多做防護);論證「這樣是安全的」必須 confirmed
     (錯了直接打到 prod 和使用者)。 -->

# 坑 Registry

---
name: {{kebab-case-slug}}
type: trap          # trap | gotcha | constraint
status: active      # active | superseded(過時不刪,改此欄並在內文指向 [[取代條目]] 或 record)
confidence: suspected  # confirmed(受控實驗坐實:改變因 → 症狀跟著出現/消失,至少兩次;
                       #           非因果事實則為「窮盡查證 + 指得出一手來源」)
                       # probable(多次觀察一致,但沒做對照組)
                       # suspected(單次觀察,或「當下最像的解釋」)
                       # 未標此欄 = unknown(舊條目),讀的人比照 suspected 對待
tags: [{{標籤}}]
discovered: {{YYYY-MM-DD}}
---

**症狀**:{{看到什麼(錯誤訊息/怪行為)——這欄永遠是事實,錯誤訊息照貼}}
**根因**:{{一句話。confidence 標的就是這一欄的把握度}}
**解法/繞法**:{{怎麼處理。非 confirmed 時只寫「繞法」,不寫「解法」,也不得當行為準則}}
**佐證**:{{commit/record 連結;標 confirmed 必須指得出受控實驗}}
