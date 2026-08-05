<!-- flightwake TRAPS — 罠のレジストリ。自明でない、また必ず刺さる事実。 -->
<!-- 項目は OKF 式:frontmatter ブロック + 本文。[[名前]] で相互リンク可。新しいものを一番上に。 -->
<!-- 時効:項目が成り立たなくなっても(機能の統合/リファクタ後)削除しない — status を superseded にして置き換え先を指す。読む側は active だけを信じる。 -->
<!-- 証拠の強さ:confidence が評価するのは「根本原因」であって症状ではない。**非対称な基準**——
     「これは壊れる」の論拠なら probable で足りる(外しても余分に守るだけ);
     「これは安全だ」の論拠には confirmed が必須(外すと prod とユーザーに直撃する)。 -->

# 罠レジストリ

---
name: {{kebab-case-slug}}
type: trap          # trap | gotcha | constraint
status: active      # active | superseded(古くなっても消さず、この欄を変えて本文で [[置き換え先]] か record を指す)
confidence: suspected  # confirmed(統制実験で確定:原因を切り替える → 症状が現れる/消える、最低 2 回;
                       #           非因果的な事実は「網羅的な確認 + 指し示せる一次情報」)
                       # probable(複数回の観察で一貫、ただし対照群なし)
                       # suspected(単発の観察、または「その時点で最も可能性の高い説明」)
                       # 欄が無い = unknown(旧項目)。読む側は suspected として扱う
tags: [{{タグ}}]
discovered: {{YYYY-MM-DD}}
---

**症状**:{{何が見えたか(エラーメッセージ/おかしな挙動)——この欄は常に事実。エラーは原文のまま貼る}}
**根本原因**:{{一文で。confidence が評価するのはまさにこの欄}}
**対処/回避**:{{どう扱うか。confirmed 未満なら「回避」のみを書き、「対処」とは書かない。行動規範にもしない}}
**根拠**:{{commit/record へのリンク。confirmed を名乗るなら統制実験を指し示せること}}
