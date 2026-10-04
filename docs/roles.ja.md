# チームロール——/clear の後も、どの agent も自分が誰かを覚えている

> English:[roles.md](roles.md) · 繁體中文:[roles.zh-TW.md](roles.zh-TW.md) · 简体中文:[roles.zh-CN.md](roles.zh-CN.md)

**オプトインのアドオン、flightwake v0.14.0 以降。** `init` がこれをインストールすることはない。

## 解決する問題

小さな agent チームを動かしているとする。たとえば Codex がプロジェクトマネージャー、Claude がテックリード、
Claude がコードを書き、Codex がそれをレビューする。チャットでそれぞれにロールを伝える。そこで誰かが `/clear`
を実行する(あるいは新しい session が始まる)と、ロールは消える。プロジェクトマネージャーは目を覚まし、STATE で
「次のステップ:X を直す」を読み、ほかに指示のない有能なモデルなら誰でもすることをする:自分で X を直す。
誰も作業を割り振らず、誰もレビューしない。

チームをしばらく動かすと、さらに 2 つの問題が出てくる:

- **一部のロールは一部のフェーズでしか要らない。** セキュリティレビュー、UI デザイン、リリースは後半で重要になるが、
  初日から agent を 1 つ占有させたくはない。
- **仕事は流れていく。** テックリードがいつの間にかプラットフォームの事務作業をしている。ロールの文面もきれいに追随すべきだ。

## 2 つの考え方:席とオンコールロール

**席**は(フォルダー, ベンダー)の組。席のロールは、そのベンダーが **session 開始のたびに必ず**指示を読む場所に
書かれる——チャットでも、STATE でもない(STATE は今何が起きているかを書くもので、あなたが誰かを書くものではない):

| ベンダー | session 開始のたび(と /clear の後)に読む |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |

Claude Code は `AGENTS.md` を読まず、Codex は `CLAUDE.md` を読まない(Claude Code 2.1 と Codex 0.157 で検証済み)。
そのため、Claude と Codex が 1 つずついるフォルダーでは、ファイル名だけで各 agent はどのロールが自分のものかわかる。
それが唯一の制限でもある:**1 フォルダーにつき、1 ベンダーあたり 1 席。** 長く続くロールが席に座る——pm、
テックリード、coder、reviewer。

**オンコールロール**には席がなく、数の制限もない。`roles apply` は、席のある(フォルダー, ベンダー)すべてに、
それをネイティブの agent 定義として生成する:

- Claude Code:`.claude/agents/fw-<id>.md`
- Codex:`.codex/agents/fw-<id>.toml`

必要になったとき:

- **同じベンダーで短いタスク** → 席にいる agent がネイティブ agent `fw-<id>` を呼び出す(たとえば coder が `fw-security` を頼む)。
- **別のベンダー、または長めのタスク** → プロジェクトマネージャーが worker を割り振り、そのタスクの冒頭に
  `npx flightwake roles card <id>` のロールカードを置く。カードには「このタスクでは、このロールとして動く」と書かれ、
  worker が入ったフォルダーの席のロールより優先される。repo 共通のルールは引き続き適用される。

フェーズ限定のロール(security、designer、release、qa)は最初はオンコールにしておく。それぞれ `### When to call`
セクションを持てて、それはすべての席のチーム一覧に表示される——だからプロジェクトマネージャーは session 開始のたびに
トリガーを読み直す。

## クイックスタート

```bash
npx flightwake roles                  # install the fw-roles skill into this repo
```

そして agent にこう頼む:**「fw-roles を実行して」**(Claude Code:`/fw-roles`、Codex:`$fw-roles`)。agent は次のことをする:

1. **スキャン**:プロジェクト——README、マニフェスト、ディレクトリ構成、テスト、デプロイ、`.flightwake/STATE.md`——を調べ、チームがどのフォルダーにまたがるか、どの agent を持っているかを尋ねる。
2. **推薦**:9 つのプリセット(中核 `pm`、`tech-lead`、`coder`、`reviewer`;必要に応じて `qa`、`researcher`;条件を満たすときだけ `release`(デプロイする)、`security`(認証・決済・個人情報)、`designer`(フロントエンドがある))から 3–4 つの席といくつかのオンコールロールを、それぞれあなたのプロジェクトに結びついた理由付きで提案する。
3. **プレビュー**:席の表、オンコールロールとそれを呼ぶタイミングを示し、続けて各ロールの*あなたがやること / 禁止 / 引き継ぎ先*を示す。
4. **カスタマイズ**:あなたの言うとおりに変え(「reviewer は誤字を自分で直してよい」)、`.flightwake/ROLES.md` に書き込む。
5. **適用**:`npx flightwake roles apply --dry-run` を見せ、あなたが確認したら `npx flightwake roles apply` を実行する。
6. **検証**:各席で新しい session を開いて誘い水の質問をし(「ボタンに誤字がある——あなたは誰で、次に何をする?」)、さらにオンコールロールを 1 つ実際に呼んでみる。

いちばん大事なのは**禁止**リスト。テストで、プロジェクトマネージャーにコードを書かせず割り振りを続けさせたのは
「プロダクトコードは決して書かない。『自分で直したほうが早い』と頭をよぎった瞬間、代わりに割り振る」という行だった。
カスタマイズするときは、禁止項目を削除するのではなく、範囲を限った例外に書き換えること。

## ROLES.md

チームごとに 1 ファイル。プロジェクトマネージャーが作業する repo に置く。最初のロールより前のテキストは注釈扱い。

```markdown
# チームロール

## pm — プロジェクトマネージャー
**あなたがやること**
- 優先順位を決め、作業を範囲の明確なタスクに切り分け、割り振り、結果を検証する。

**禁止**
- プロダクトコードを書くこと・編集すること。

**引き継ぎ先**
- 実装 → coder;レビュー → reviewer。

## security — セキュリティレビュー
**あなたがやること**
- 認証、シークレット、決済、個人情報に触れる変更をレビューする。
### When to call
- 変更が認証、権限、シークレット、決済、個人情報に触れるとき。

## seats
| repo | vendor | role |
|---|---|---|
| . | codex | pm |
| ../app | claude | coder |
| ../app | codex | reviewer |
```

- `## <id> — <タイトル>` でロールが始まる。ロールの中では太字か `###` を使い、`##` は決して使わない。
- `## seats` は表:`repo` はこの repo のルートからの相対パス(絶対パス、`~/`、空白も可)、`vendor` は
  `claude`、`codex`、`gemini` のいずれか、`role` はロール id。1 つのロールが複数の席を持ってよい。席のないロールはオンコール。
- seats 表のない古いファイル(各ロールが `agent:` / `repo:` 行を持つ形式)はそのまま動く。`roles assign` は
  先に移行するよう求め、fw-roles skill が完全なプレビュー付きで移行を行う。

## 複数の repo にまたがるチーム

計画用 repo と実装用 repo で 1 つのチームを共有できる:ROLES.md はどちらか一方に置き、`apply` は seats 表にある
すべての repo に書き込む。生成されるブロックはすべてソースの場所(`src=`)を記録しているので、メンバー repo の中で
`npx flightwake roles apply` を実行しても同じ ROLES.md が見つかり、同じ結果になる。apply が触れた**すべての**
repo で、変更されたファイル——指示ファイル、`.claude/agents/`、`.codex/agents/`、そして ROLES.md の隣の
`.flightwake/roles-manifest.json`——を commit すること。

## 席を変える:`roles assign`

```bash
npx flightwake roles assign ../app:codex release --dry-run   # preview
npx flightwake roles assign ../app:codex release             # edit that one seats cell, then re-apply
npx flightwake roles assign ../new:claude designer --add     # a seat that doesn't exist yet needs --add
```

`assign` は seats 表のそのセルだけを編集する——コメント、ロール本文、順序には触れない——そして計画中に ROLES.md が
変更されていたら書き込みを拒否する。変更は各 agent の**次の新しい session** から有効になる。それまでは、実行中の
session と worker は今のロールのままだ。理由を DECISIONS に 1 行追加すること(fw-roles skill がやってくれる)。

## apply が書き込むもの、そして決して上書きしないもの

- **席ブロック**:各指示ファイルの**先頭**、`<!-- flightwake-roles:begin … -->` と
  `<!-- flightwake-roles:end -->` の間に入る:ロール、このブロックが /clear の後に再読み込みされ*メイン session* の
  ロールであるという注記、あなたのロール本文、チーム一覧(席、オンコールロールとそれを呼ぶタイミング、「← you」)、
  そしてユーザーからの直接の指示は割り振りとみなす、という 1 行。マーカーの外側には一切手を触れない。
- **ネイティブのオンコール定義**:`.claude/agents/` と `.codex/agents/` に置かれ、それぞれ生成物であると明記される。
- **マニフェスト**(`.flightwake/roles-manifest.json`):生成したすべての出力をハッシュ付きで列挙する。

apply が書き換えたり削除したりするのは、自分が生成したものとまだ一致している出力か、すでに新しい内容と同じ出力だけ。
あなたが書いた同名のファイル、手で編集した生成ファイル、別チームの出力は**衝突**となる:apply はそれを列挙し、何も
書き込まない。ロールや repo 全体が ROLES.md から外れると、古いブロックと定義はマニフェストを通じて片付けられる。
編集するのは ROLES.md であって、生成された出力ではない。

## コマンド

| コマンド | 何をするか |
|---|---|
| `npx flightwake roles` | `fw-roles` skill を `.claude/skills/` にインストール(または refresh)。repo に `AGENTS.md` か `GEMINI.md` があれば `.agents/skills/` にも入れる |
| `npx flightwake roles apply --dry-run` | 何が追加・更新・片付けされるか、そして正確なブロックを表示する。何も書き込まない |
| `npx flightwake roles apply` | ROLES.md をチーム内すべての repo にレンダリングする。古くなった出力を片付ける |
| `npx flightwake roles card <id>` | 1 つのロールを割り振り用カードとして stdout に出力する(エラー時:stdout には何も出さず、メッセージは stderr、終了コードは非ゼロ) |
| `npx flightwake roles assign <repo>:<vendor> <id> [--add] [--dry-run]` | ロールを席に就ける |
| `npx flightwake roles remove` | この repo からロールブロック、生成した agent、skill を取り除く。ROLES.md は残る |
| `npx flightwake update` | skill はすでにインストールされている場所でのみ refresh する |
| `npx flightwake uninstall` | ロールブロック、生成した agent、skill も取り除く。ROLES.md はほかの記録と同様に残る |

## 制限——必ず読むこと

- **ロールはガイダンスであって、権限ではない。** agent が何を選んでするかは変えるが、ツール呼び出しを止めはしない。
  実際にテストした:読み取り専用として定義した Codex のカスタム agent も、書き込み可能な session から呼び出されると
  ファイルを書き込んだ。flightwake が生成するものは何一つ、強制力があるとは主張しない。本当のガードレール(レビュー、
  ブランチ保護、ツール自体の権限設定)はそのまま維持すること。
- 1 フォルダーにつき 1 ベンダーあたり 1 席。それ以上必要なら、オンコールロールか別のフォルダー/worktree を使う。
- プリセットと skill は英語と繁体字中国語でのみ提供される。ほかのインストール言語(日本語を含む)では英語版が入る。
- Gemini CLI には席ブロックは入るが、ネイティブのオンコール定義はまだない。
- **Codex が `.codex/agents/` を読み込むのは信頼済みプロジェクトの中だけ——しかもその repo パスそのものが信頼されている必要がある**(信頼済みの親フォルダーは、その中の git repo をカバーしない。worktree のパスもそれぞれ別に数えられる)。ファイルがあるかどうかではなく、一度実際に呼び出して確かめること。Codex が認識しないフィールドを含む定義は黙って捨てられる。flightwake が `name`、`description`、`developer_instructions` しか書かないのはそのためだ。
- ロールの「When to call」は agent への情報であって、ひとりでに発火するものではない。席ブロックには明示的なルール(「タスクが当てはまったら、そのロールがやる——呼び出すか割り振る」)が入っていて、テストで agent に実際に委任させたのはこのルールだった。

### オプション:Claude Code mod のロールガード

Claude Code mod の `flightwake-mod` を使っているなら、その**ロールガード**スイッチ(`roleGuard`、既定はオフ)で、機械可読なルール 1 種類をブロックに変えられる。上の「ロールはガイダンスであって、権限ではない」はそれ以外のすべてについて変わらず当てはまる。

- **有効にする方法。** Claude Code の `/config`(mod のオプションが並ぶ)か、*ユーザー*設定(`~/.claude/settings.json`)に `"pluginConfigs": { "flightwake-mod@skills-dir": { "options": { "roleGuard": true } } }` と書く。プラグインのオプションはプロジェクト設定からは読まれないので、これは各自の選択になる。
- **書く場所。** `ROLES.md` のそのロール本文の中に、独立した 1 行として書く:`deny-write: ["src/**", "lib/**"]`(repo 相対の glob。`/` を含まないパターンは、どの深さでもそのファイル名に一致する)。`roles apply` と `roles card` は本文をそのまま写すので、この行は席ブロックにも割り振りカードにも付いていく。
- **mod が強制すること。** スイッチがオンのとき、*メイン*の Claude Code session によるそれらのパスへの `Edit`、`Write`、`NotebookEdit` は拒否される。メッセージには、どのロールのどのルールか、代わりにどうするか(担当ロールに渡す、または本人に解除を頼む)が示される。
- **ガイダンスのままのもの。** それ以外のすべて:Bash とほかのすべてのツール、MCP、サブ agent、そして自然言語の「Never」項目。これらがルールに変換されることはない。
- **上書き。** 割り振りカードで始まった session は、席ではなくカードのロールに従う(`deny-write` のないカードは何も守らない)。サブ agent(タスクのために呼び出したオンコールロールを含む)は明示的な割り当てなので、検査されない。
- **解除。** `/fw-role-release` を実行できるのは本人だけ(プロンプトに自分で入力する。プラグインやモデルからは不可):引数なしならルールを一覧し、glob またはその番号を渡せばそのルールを解除し、`all` で全ルール、`revoke` で解除の取り消し。解除はこの session 限りで、有効な間はステータス行に表示され続け、トランスクリプトにも記録が残る。1 つのパスが複数のルールに当たるときは、そのすべてを解除して初めて書ける:`src/**` を解除しても `src/private/**` は解除されない。ガードは flightwake が導入されたフォルダー(`.flightwake/STATE.md` がある)でだけ働き、session が別のフォルダーに移るとそこの席を読み直す。
- **反映のタイミング。** ロールは session 開始時に一度だけ読まれる。席や `deny-write` を編集したら、新しい session(または `/clear`)で反映される。
- **セキュリティ境界ではない。** これは、マネージャーがつい製品コードを書いてしまうようなよくある失敗を拾うための便宜にすぎない。その気になった agent は Bash 経由で書き込める。本当のガードレールはそのまま維持すること。

## 先行事例

参考にしたロール集(参照のみ、文章の複製はなし):[BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) · [ruflo](https://github.com/ruvnet/ruflo) · [wshobson/agents](https://github.com/wshobson/agents) · [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)。multi-agent-shogun のロールごとの禁止行動リストが、私たちの Never リストに最も近い発想です。Gas Town の長く続く crew と短命な worker の区別が、席とオンコールの区別に最も近い発想です。
