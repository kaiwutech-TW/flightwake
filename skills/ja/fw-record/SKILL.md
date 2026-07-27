---
name: fw-record
description: flightwake 締めの記録 — 飛行記録を書いて STATE を更新する。Use when wrapping up work that touched schema/prod, spanned 3+ commits, or when the session is ending; also when the user says 締め/記録して/record.
---

# fw-record — 飛行記録で締める

目的:この作業を「3 か月後の他人が読んで分かる」持続物に変える。**事後に書く。作業のリズムは止めない。**

## 手順

1. この区間を棚卸し:`git log --oneline "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD`
   で前回の締め以降のコミットを列挙(STATE が未コミットなら `git log --oneline -20`)。重要な発見/決定/検証を思い出す
2. `.flightwake/TEMPLATE-record.md` に従って `.flightwake/records/YYMMDD-slug.md` を書く:
   - TL;DR を 2〜3 文(出発点の問題 → 到達した状態)
   - 重要な発見を重要度順に。条件を満たすものは **TRAPS にも**(/fw-trap の形式で)**DECISIONS にも**登録
   - コミット range を 1 行(詳細は git に任せる)、検証の証拠、未完了/引き継ぎ
3. `.flightwake/STATE.md` を更新:今どこか、進行中、次の入口、`latest_record` のポインタ、`health`
4. まとめてコミット(record + STATE を 1 コミットに。メッセージは `docs(fw): record YYMMDD-slug`)

## 品質チェック(書き終えたら自問)

- このプロジェクトを知らない人が TL;DR を読んで何が起きたか分かるか?
- このセッションにしか通じないコードネームを使っていないか?(使っていたら → 展開する)
- 検証の証拠は「主張」か「証拠」か?(数値/出力/リンクが要る)
- **重複排除**:git が既に記録していること(コミットメッセージ、diff の詳細)を書き写していないか?同じ事実が STATE/DECISIONS に既にないか?(あれば → リンク/hash で指す。二箇所に書けば必ず片方が古くなる)
- **非識別化**:record に prod URL、顧客/社内コードネーム、実 ID、token/鍵が入っていないか?(repo は公開されうる。コミット前に一度スキャン:
  `grep -nEi 'https?://|token|secret|key|password' .flightwake/records/<今回のファイル>`。ヒットは 1 件ずつマスク済みか確認)
