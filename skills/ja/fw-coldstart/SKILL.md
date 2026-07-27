---
name: fw-coldstart
description: flightwake コールドスタート — repo に触る前に状態を復元する。Use when starting work in a repo that has .flightwake/, when the user says 引き継ぎ/続きから/coldstart, or at the start of any session touching a flightwake-managed repo.
---

# fw-coldstart — コールドスタートでの引き継ぎ

目的:ファイルに触る前に、最小限の読み取りで「安全に引き継げる」状態まで復元する。**時間を計ること**——コールドスタートのコストはこのフレームワークの品質指標。

## 手順

1. `.flightwake/STATE.md` を読む(今どこか、進行中、次の入口、常備知識)
2. STATE の frontmatter が指す `latest_record` を読む(前回の締めの全文脈)
3. 必要なときだけ読む:`DECISIONS.md`(既存の方向を変える前は必読)、`TRAPS.md`(おかしな症状に当たったとき)
   — どちらも **superseded の項目は飛ばす**(それは履歴。新旧が矛盾したら active / 新しい日付を信じる)
4. 遅れを数値化:`git rev-list --count "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD`
   (≥1 = 前のセッションが締めていない。警戒度を上げる。STATE が未コミットなら `git log --oneline -10` を見る)
5. ユーザーに一段落で報告する:「前回はどこまで進んだか、今回はどこから入るか、未検証の変更はあるか(health)」——**報告してから着手する**
   (トークンコストを測るとき:モデルは自分の使用量を見られない——まずローカルの transcript をゼロトークンで解析する
   (`~/.claude/projects/<プロジェクト>/*.jsonl` は各メッセージに usage を持つ。hook の stdin にも transcript_path がある)。取れない場合だけユーザーに `/cost` を頼む)

## レッドライン

- STATE の health が yellow/red → 未検証・壊れている部分を先に片付ける。新しい作業を上に積まない
- STATE が 7 日以上更新されておらず、git log に新しいコミットがある → 着手前に record を 1 本補う(記憶がまだコミットメッセージに残っているうちが一番安い)
- TRAPS の active 項目が 20 を超える、または今回のコールドスタートが実測 5 分を超えた → ユーザーに圧縮を提案する
  (重複の統合、成り立たなくなった項目を superseded に——圧縮とは status の変更と統合であって、行の削除では決してない)
  **提案は一言で承認できる粒度にすること**:まず診断(何が遅いのか:STATE が長すぎ/古すぎ?前回が締められていない?
  TRAPS/DECISIONS に古い項目が多すぎ?record が部外者に読めないコードネームを使っている?)、
  次に項目ごとの処置案(どれを superseded にするか、なぜか。どれを統合するか)。ユーザーの確認前には手を触れない——
  「これはまだ成り立つか」の判断を誤ると、以後のすべてのセッションに伝染する。決定権は人に、宿題はモデルに。
