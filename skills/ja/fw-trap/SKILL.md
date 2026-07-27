---
name: fw-trap
description: flightwake 罠の登録 — 自明でない罠を TRAPS レジストリに書く。Use immediately when a surprising root cause is found (weird error, vendor quirk, encoding trap), or when the user says この罠を記録して/trap.
---

# fw-trap — 罠の登録

目的:同じ罠は 1 プロジェクトにつき 1 回だけ踏む(将来のセッションや他の agent も含めて)。

## TRAPS に載せる条件

- 症状と根本原因が**遠い**(例:jsonb が文字列スカラーとして保存される → 根本原因は driver の「文字列パラメータ + ::jsonb」のエンコード方式)
- ベンダーの文書化されていない挙動(例:ある操作経路では webhook が発火しない)
- 環境差の罠(ローカルでは通り、prod で爆発する)
- **載せないもの**:普通のバグ、エラーメッセージを読めば分かること

## 手順

1. `.flightwake/TRAPS.md` の冒頭で示されている項目形式(OKF 式 frontmatter:name/type/tags/discovered)に従い、
   `.flightwake/TRAPS.md` の**一番上**に書く
2. 4 つの欄をすべて埋める:症状(元のエラーメッセージを貼る)、根本原因を一文で、対処/回避、根拠リンク(commit/record)
3. 関連する罠は `[[名前]]` でリンクする
4. その場で書く——罠の細部は半日で曖昧になる
5. 新しい罠が既存項目を**置き換える/包含する**場合:古い項目の frontmatter の `status` を `superseded` にし、本文で [[新しい項目]] を指す——行は決して削除しない。
   こうすれば「古い md vs 新しい md」が矛盾しても常に方向が定まる
6. 罠の**スコープ**を判断する:この repo 固有でない——どのプロジェクトでも踏む(プラットフォーム/言語/ツール層、例えば Node の stdin 挙動、shell の展開)——場合も、
   TRAPS には登録する(repo のレジストリは自己完結していなければならない:次の人や agent はあなたの個人メモリを見られない)。
   **同時にユーザーレベルのメモリにも 1 部保存する**(Claude memory など)。そうすれば他の repo で踏み直さずに済む。
   スコープごとに 1 部ずつ持つのは分担であって重複ではない:汎用の罠を 1 つの repo にしか記録しなければ、次の repo でまた刺さる
