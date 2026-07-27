---
updated: {{DATE}}
updated_by: {{SESSION_OR_PERSON}}
latest_record: records/{{YYMMDD}}-{{slug}}.md
health: green   # green | yellow(未検証の変更あり)| red(壊れているのが既知)
---
<!-- flightwake STATE — 常に短く、常に最新。新しいセッションの最初の一歩。 -->
<!-- ルール:ここには「今」と「次」だけ。履歴は records/ へ、決定は DECISIONS.md へ。 -->
<!-- コールドスタート契約:このファイル + latest_record だけで 5 分以内に安全に引き継げること。 -->

# 今どこにいるか

{{一段落:現在の焦点と状況。}}

# 進行中(終わるまで消さない)

- [ ] {{未完了の作業 + どこで詰まっているか}}

# 次の入口

1. {{次にやる可能性が最も高いこと → どのファイル/コマンドから始めるか}}
2. {{次点}}

# 常備知識(この repo の 3〜5 個の生存知識)

- {{例:migration は SQL ファイル — drizzle-kit push は絶対に使わない}}
- {{例:テストは実 DB を叩く。fixture は必ず vitest- プレフィックス}}
