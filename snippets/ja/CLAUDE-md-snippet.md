<!-- flightwake トリガー義務スニペット — init がこのファイルの内容(このコメントを除く)を対象 repo の CLAUDE.md に追記します -->
## flightwake の作業規律

この repo は flightwake(フライトレコーダー式の作業フレームワーク)を使う:**記録は作業に従う、作業を導かない**。
基本はそのまま手を動かしてよい。ただし以下のイベントは義務を発生させる:

| トリガー | 義務 |
|---|---|
| このセッションで初めてこの repo を触るとき | まず `/fw-coldstart`(`.flightwake/STATE.md` + 直近の record を読み、報告してから着手) |
| 他の選択肢を閉じる決定をしたとき | `.flightwake/DECISIONS.md` に 1 行 append(なぜを添えて) |
| 自明でない罠を踏んだとき | その場で `/fw-trap` して `.flightwake/TRAPS.md` に登録 |
| schema を触った / prod を触った / 前回の record から 3 コミット以上 | `/fw-record` で締める(飛行記録 + STATE 更新。遅れると Stop hook が知らせる) |
| セッションをまたぐ工事を中断するとき | `/fw-handoff`(CONTEXT は手を止める前に書く。始める前ではない) |
| セッション終了時 | STATE が現実を反映していること(health の色は正直に) |

ハードガード(モデルの強さとは無関係):テストが緑 + typecheck がクリーンで初めて完了;prod の変更は record に検証の証拠を必ず残す;
破壊的操作は先にユーザーへ確認。
重複排除の原則:同じ事実は一箇所にだけ書く(git で分かることは書き写さない。record/STATE/DECISIONS はそれぞれ役割が違い、他所からはリンクか hash で指す)——二箇所に書けば必ず片方が古くなる。
