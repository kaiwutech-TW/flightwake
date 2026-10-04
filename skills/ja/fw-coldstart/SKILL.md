---
name: fw-coldstart
description: flightwake コールドスタート — repo に触る前に状態を復元する。Use when starting work in a repo that has .flightwake/, when the user says 引き継ぎ/続きから/coldstart, or at the start of any session touching a flightwake-managed repo.
---

# fw-coldstart — コールドスタートでの引き継ぎ

目的:ファイルに触る前に、最小限の読み取りで「安全に引き継げる」状態まで復元する——コールドスタートのコスト(正しい報告までの時間とトークン)がこのフレームワークの品質指標。

## 手順

1. `.flightwake/STATE.md` を読む(今どこか、進行中、次の入口、常備知識)
   **まだ初期化されていない?** STATE にテンプレート由来のプレースホルダーが残っている場合——frontmatter の `updated: {{DATE}}`、`updated_by: {{SESSION_OR_PERSON}}`、
   `latest_record: records/{{YYMMDD}}-{{slug}}.md`、または本文中でテンプレートと一字一句同じ `{{…}}` の行——これは初回起動であり、引き継ぎではない。最初の STATE を書き、ステップ 5 へ直接進む:
   - 未記入として扱うのは上記の既知のテンプレート行だけ。それ以外の `{{…}}` はユーザー自身の内容(例、自作のテンプレート)なのでそのまま残す;記入済みの内容もそのまま残す——置き換えるのは未記入の行だけ
   - repo の現状から埋める:README/docs、`git log --oneline -20`、ディレクトリ構成、明らかな進行中の作業。
     `updated` = 今日、`updated_by` = あなた(モデル/session)、`latest_record` = `.flightwake/records/` の最新ファイル、無ければ `none`
   - `health`:テンプレートが事前に入れている `health: green` は未記入として扱う。green にしてよいのは、この session に検証の証拠がある場合(例:実際にテストを走らせて通った)だけ;
     そうでなければ yellow にして、コメントに理由を書く(例:`health: yellow  # 最初の STATE、まだ何も検証していない`)
   - 材料が足りない場合:commit が無い → 「履歴なし」と書く;README が無い → ファイル構成から説明し、その旨を明記;record が無い → `latest_record: none`。推測するより「不明」と書く
   - 最初の STATE をユーザーに報告する(一段落、加えて判断できなかった部分)。それから続行する
2. STATE の frontmatter が指す `latest_record` を読む(前回の締めの全文脈)
3. 必要なときだけ読む:`DECISIONS.md`(既存の方向を変える前は必読)、`TRAPS.md`(おかしな症状に当たったとき。
   **加えて——これからやる作業がある罠の領域に触れるなら、着手前にその項目を読む**。症状が出るのを待つな、
   その時点ですでに踏んでいる)
   — どちらも **superseded の項目は飛ばす**(それは履歴。新旧が矛盾したら active / 新しい日付を信じる)
   — TRAPS の項目は**まず `confidence` を見る**:行動規範にできるのは `confirmed` だけ。`probable`/`suspected`/
     この欄が無い旧項目は、事実ではなく**手がかり**として扱う。とりわけ「このやり方は安全だ」の論拠には
     **使ってはならない**(安全の誤判は prod とユーザーに直撃する)。それを根拠に進めるなら自分で一度検証し、
     結果を書き戻してその項目の確度を引き上げる
4. 遅れを数値化:`git rev-list --count "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD`
   (≥1 = 前のセッションが締めていない。警戒度を上げる。STATE が未コミットなら `git log --oneline -10` を見る)
5. ユーザーに一段落で報告する:「前回はどこまで進んだか、今回はどこから入るか、未検証の変更はあるか(health)」——**報告してから着手する**

## レッドライン

- STATE の health が yellow/red → 未検証・壊れている部分を先に片付ける。新しい作業を上に積まない
- STATE が 7 日以上更新されておらず、git log に新しいコミットがある → 着手前に record を 1 本補う(記憶がまだコミットメッセージに残っているうちが一番安い)
- TRAPS の active 項目が 20 を超える、または今回のコールドスタートが実測 5 分を超えた → ユーザーに圧縮を提案する
  (重複の統合、成り立たなくなった項目を superseded に——圧縮とは status の変更と統合であって、行の削除では決してない)
  **提案は一言で承認できる粒度にすること**:まず診断(何が遅いのか:STATE が長すぎ/古すぎ?前回が締められていない?
  TRAPS/DECISIONS に古い項目が多すぎ?record が部外者に読めないコードネームを使っている?)、
  次に項目ごとの処置案(どれを superseded にするか、なぜか。どれを統合するか)。ユーザーの確認前には手を触れない——
  「これはまだ成り立つか」の判断を誤ると、以後のすべてのセッションに伝染する。決定権は人に、宿題はモデルに。
