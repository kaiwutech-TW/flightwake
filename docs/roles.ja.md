# チームロール——/clear の後も、どの agent も自分が誰かを覚えている

> English:[roles.md](roles.md) · 繁體中文:[roles.zh-TW.md](roles.zh-TW.md) · 简体中文:[roles.zh-CN.md](roles.zh-CN.md)

**オプトインのアドオン、flightwake v0.14.0 以降。** `init` がこれをインストールすることはない。

## 解決する問題

小さな agent チームを動かしているとする。たとえば Codex がプロジェクトマネージャー、Claude がテックリード、
Claude がコードを書き、Codex がそれをレビューする。チャットでそれぞれにロールを伝える。そこで誰かが `/clear`
を実行する(あるいは新しいセッションが始まる)と、ロールは消える。プロジェクトマネージャーは目を覚まし、STATE で
「次のステップ:X を直す」を読み、ほかに指示のない有能なモデルなら誰でもすることをする:自分で X を直す。
誰も作業を割り振らず、誰もレビューしない。

解決策は、ロールを agent が**セッション開始のたびに必ず読む**場所に置くこと。チャットでも STATE でもない
(STATE は今何が起きているかを書くもので、あなたが誰かを書くものではない)。各ツールにはすでにそういうファイルがある:

| Agent | セッション開始のたび(と /clear の後)に読む |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |

Claude Code は `AGENTS.md` を読まず、Codex は `CLAUDE.md` を読まない(Claude Code 2.1 と Codex 0.157 で検証済み;
将来のバージョンが両方を読むようになっても、「← you」マーカーと他の agent についての注記で見分けられる)。
そのため、Claude と Codex が 1 つずついるフォルダーでは、ファイル名だけで各 agent はどのロールが自分のものかわかる。
hook も、起動フラグも、信頼確認も要らない。

## クイックスタート

```bash
npx flightwake roles                  # install the fw-roles skill into this repo
```

そして agent にこう頼む:**「fw-roles を実行して」**(Claude Code:`/fw-roles`、Codex:`$fw-roles`)。agent は次のことをする:

1. **スキャン**:プロジェクト——README、マニフェスト、ディレクトリ構成、テスト、`.flightwake/STATE.md`——を調べ、チームがどのフォルダーにまたがるか、どの agent を持っているかを尋ねる。
2. **推薦**:9 つのプリセット(中核 `pm`、`tech-lead`、`coder`、`reviewer`;必要に応じて `qa`、`researcher`;条件を満たすときだけ `release`(デプロイする)、`security`(認証・決済・個人情報)、`designer`(フロントエンドがある))から 3–5 個のロールを、それぞれあなたのプロジェクトに結びついた理由付きで提案する。
3. **プレビュー**:表(ロール / agent / フォルダー / 役割)を示し、続けて各ロールの*あなたがやること / 禁止 / 引き継ぎ先*を示す。
4. **カスタマイズ**:あなたの言うとおりに変え(「reviewer は誤字を自分で直してよい」)、`.flightwake/ROLES.md` に書き込む。
5. **適用**:`npx flightwake roles apply --dry-run` を見せ、あなたが確認したら `npx flightwake roles apply` を実行する。
6. **検証**:各 agent で新しいセッションを開き、誘い水の質問をする(「ボタンに誤字がある——あなたは誰で、次に何をする?」)。pm、テックリード、reviewer なら自分で直さず、担当に回すはずだ。

いちばん大事なのは**禁止**リスト。テストで、プロジェクトマネージャーにコードを書かせず割り振りを続けさせたのは
「プロダクトコードは決して書かない。『自分で直したほうが早い』と頭をよぎった瞬間、代わりに割り振る」という行だった。
カスタマイズするときは、禁止項目を削除するのではなく、範囲を限った例外に書き換えること。

## ROLES.md

チームごとに 1 ファイル。プロジェクトマネージャーが作業する repo に置く。最初のロールより前のテキストは注釈扱い。

```markdown
# チームロール

## pm — プロジェクトマネージャー
agent: codex
repo: .

**あなたがやること**
- 優先順位を決め、作業を範囲の明確なタスクに切り分け、割り振り、結果を検証する。

**禁止**
- プロダクトコードを書くこと・編集すること。

**引き継ぎ先**
- 実装 → coder;レビュー → reviewer。

## coder — メイン実装担当
agent: claude
repo: ../app
...
```

- `## <id> — <タイトル>` でロールが始まる。ロールの中では太字か `###` を使い、`##` は決して使わない。
- `agent:` は `claude`、`codex`、`gemini` のいずれか。
- `repo:` はこのロールが作業するフォルダーで、この repo のルートからの相対パス(絶対パスと `~/` も可)。既定は `.`。

## 複数の repo にまたがるチーム

計画用 repo と実装用 repo で 1 つのチームを共有できる。ROLES.md はどちらか一方に置く。`roles apply` は各ロールを
その `repo:` 行が指す repo に書き込む。生成されるブロックはすべてソースの場所(`src=`)を記録しているので、
メンバー repo の中で `npx flightwake roles apply` を実行しても同じ ROLES.md が見つかり、同じ結果になる。
apply が触れた**すべての** repo で、変更された指示ファイルを commit すること。

## ただ 1 つのルール:1 フォルダーにつき、1 agent あたり 1 ロール

agent が自分のロールを見分ける手がかりは、どの指示ファイルを読むかだけ。同じフォルダーにある 2 つの Codex ロールは
どちらも `AGENTS.md` を読んでしまうので、`roles apply` はそれを拒否し、何も書き込まない。2 つ目のロールは別の
フォルダーか git worktree に置くか、別の agent に任せること。

## apply が書き込むもの

各ロールは指示ファイルの**先頭**にあるブロックになり、`<!-- flightwake-roles:begin … -->` と
`<!-- flightwake-roles:end -->` の間に入る:ロール見出し、このブロックが /clear の後に再読み込みされるという注記、
あなたのロール本文、チーム全体の一覧(誰が、どの agent で、どのフォルダーで、「← you」)、そしてユーザーからの
直接の指示は割り振りとみなす、という 1 行。マーカーの外側には一切手を触れない。

ROLES.md からロールを削除して再度 apply する → そのブロックは削除される。編集するのは ROLES.md であって、
生成されたブロックではない——次の apply で上書きされる。

## コマンド

| コマンド | 何をするか |
|---|---|
| `npx flightwake roles` | `fw-roles` skill を `.claude/skills/` にインストール(または refresh)。repo に `AGENTS.md` か `GEMINI.md` があれば `.agents/skills/` にも入れる |
| `npx flightwake roles apply --dry-run` | どのファイルが変わるか、正確なブロックを表示する。何も書き込まない |
| `npx flightwake roles apply` | ROLES.md を、チーム内すべての repo の指示ファイルにレンダリングする |
| `npx flightwake roles remove` | この repo からロールブロックと skill を取り除く。ROLES.md は残る |
| `npx flightwake update` | skill はすでにインストールされている場所でのみ refresh する |
| `npx flightwake uninstall` | ロールブロックと skill も取り除く。ROLES.md はほかの記録と同様に残る |

## 制限

- プリセットと skill は英語と繁体字中国語でのみ提供される。ほかのインストール言語(日本語を含む)では英語版が入る。
- 1 つのフォルダーで同じ agent に 2 つのロールを持たせることはできない(上のルールを参照)。
- ロールはモデルが読むガイダンスであって、サンドボックスではない。agent が何を選んでするかは変えるが、ツール呼び出しを
  止めはしない。本当のガードレール(レビュー、ブランチ保護、権限)はそのまま維持すること。

## 先行事例

参考にしたロール集(参照のみ、文章の複製はなし):[BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) · [ruflo](https://github.com/ruvnet/ruflo) · [wshobson/agents](https://github.com/wshobson/agents) · [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)。中でも multi-agent-shogun のロールごとの禁止行動リストが、私たちの Never リストに最も近い発想です。
