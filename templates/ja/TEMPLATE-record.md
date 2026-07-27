---
record_id: {{YYMMDD}}-{{slug}}
session: {{session id または担当者名}}
date: {{YYYY-MM-DD}}
repos: [{{触れた repo}}]
tests: {{N passed / tsc clean / または「ランタイム面なし」}}
prod_changes: {{migration/デプロイ/データ操作。無ければ none}}
---
<!-- flightwake record — 飛行記録。トリガー:schema を触った / prod を触った / 前回の record から 3 コミット以上 / セッションの締め。 -->
<!-- ファイル名:records/YYMMDD-slug.md。「3 か月後の他人」に向けて書く:略語も、自分にしか分からないコードネームも使わない。 -->

# {{タイトル:この作業が何をしたかを一文で}}

**TL;DR**:{{2〜3 文:どの問題から始まり、どの状態で終わったか。}}

## 重要な発見(重要度順。無ければ節ごと削除)

1. {{発見 + 根拠。条件を満たすものは TRAPS/DECISIONS にも登録}}

## 成果物 / Commits

<!-- 重複排除:詳細は git が語る。ここには range だけ。git log から読み取れない対応関係だけ一文足す。 -->

{{開始 hash}}..{{終了 hash}}({{この range が何を含むかを一文で。git log で十分明らかなら省略}})

## 検証の証拠

<!-- 非識別化:prod URL、顧客/社内コードネーム、実 ID、token/鍵は書かない(repo は公開されうる)。証拠はマスクした形で:数値結果、参照先(「prod log YYYY-MM-DD 参照」)。 -->

- {{何をエンドツーエンドで検証したか、どう検証したか、結果}}

## 未完了 / 引き継ぎ

- {{終わっていないこと + 次の入口(STATE にも反映する)}}
