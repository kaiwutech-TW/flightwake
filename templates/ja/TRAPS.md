<!-- flightwake TRAPS — 罠のレジストリ。自明でない、また必ず刺さる事実。 -->
<!-- 項目は OKF 式:frontmatter ブロック + 本文。[[名前]] で相互リンク可。新しいものを一番上に。 -->
<!-- 時効:項目が成り立たなくなっても(機能の統合/リファクタ後)削除しない — status を superseded にして置き換え先を指す。読む側は active だけを信じる。 -->

# 罠レジストリ

---
name: {{kebab-case-slug}}
type: trap          # trap | gotcha | constraint
status: active      # active | superseded(古くなっても消さず、この欄を変えて本文で [[置き換え先]] か record を指す)
tags: [{{タグ}}]
discovered: {{YYYY-MM-DD}}
---

**症状**:{{何が見えたか(エラーメッセージ/おかしな挙動)}}
**根本原因**:{{一文で}}
**対処/回避**:{{どう扱うか}}
**根拠**:{{commit/record へのリンク}}
