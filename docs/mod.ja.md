# Claude Code mod——STATE の注入、プロンプト上の帯、フライトログ、tripwire、ロールガード

> English:[mod.md](mod.md) · 繁體中文:[mod.zh-TW.md](mod.zh-TW.md) · 简体中文:[mod.zh-CN.md](mod.zh-CN.md)

**オプトインのアドオン。Claude Code 専用。** `init` が黙ってインストールすることはない。

## これは何か

`flightwake-mod` は、関数 hook でできた Claude Code のプラグイン(「mod」)。Codex と Gemini CLI には同等のものがない。
flightwake のそれ以外のすべて(skill、Stop hook、下部ゲージ)は、mod があってもなくても同じように動く。
真実の源はこれまでどおり `.flightwake/` の Markdown 1 つだけ。

mod が読むのは次のもの:

- `.flightwake/`
- git の状態(常に `git --no-optional-locks` で読むので、`.git/index` を書き換えることはない)
- CLAUDE.md / .claude/CLAUDE.md / CLAUDE.local.md の flightwake / roles マーカーブロック
- AGENTS.md / GEMINI.md の flightwake マーカー(言語の取得だけ)
- `package.json` の scripts
- 実際に有効な `statusLine` 設定

ネットワークは使わない。あなたの記録(STATE / DECISIONS / TRAPS / records / ROLES.md)には**決して書き込まない**。
mod 自身が持つ状態は session ごとのもの(`$.state`)だけ。mod の中で起きたエラーは黙って無害化される。
`.flightwake/STATE.md` のないフォルダーでは、何もしない。表示言語は、インストール時に指示ファイルのマーカーへ記録された言語に従う。

## 読み込まれる条件

次の条件がすべてそろったときだけ、mod は読み込まれる:

- Claude Code **2.1.287 以降**。
- Claude Code はプロジェクトの `.claude/skills/flightwake-mod/` から、`flightwake-mod@skills-dir` として読み込む。
  ただし、そのフォルダーのワークスペース信頼プロンプト(初めて開いたときに出る)を承認した後に限る。
- session を **repo のルート**から始めたとき。サブディレクトリから始めると読み込まれない。

個人ディレクトリに同名のプラグインがあると、プロジェクトのものより優先される。

## インストール、更新、削除

```bash
npx flightwake setup           # アドオンの手順に 1 つ質問が増える
npx flightwake init --mod      # 直接インストールする
npx flightwake update          # すでに入っている場所だけ refresh する
npx flightwake uninstall       # 配布したファイルだけ削除(自分で足したファイルは残る)
```

- **`setup`**:アドオンの手順で、質問が 1 つ増える。Claude Code を選んだ場合にだけ尋ね、既定は No。
  mod が何かを平易な言葉で説明し、2.1.287 の要件と信頼プロンプトにも触れる。
- **`init --mod`**:インストールする。Claude Code が設定対象の agent に含まれていなければ、メモを表示して mod をスキップする
  (エラーではない)。フォルダーが既にあれば、`--force` を付けない限りスキップする。
- **コピーされるもの**:プラグインのマニフェスト(`.claude-plugin/plugin.json`)、`hooks/`、`types/`。
  テストと開発用スクリプトは含まれない。
- **`update`(と `init --force`)**:mod がすでにインストールされている場所だけ、ファイルごとに refresh する。
  `.claude/skills/flightwake-mod/` の中にあなたが足したファイルは残る。`update` が mod を新たに追加することはない。
- **`uninstall`**:flightwake がここに配布したファイルと、それで空になったフォルダーだけを削除する。`.claude/skills/flightwake-mod/` のそれ以外(自分で足したファイル、Claude Code が書いたファイル)は残し、出力に一覧を出す。`uninstall --purge` は `.flightwake/` だけが対象で、これらも削除しない。
- **`--private`**:mod のフォルダーは `.git/info/exclude` のブロックに入る。フォルダーが既に git で追跡されている場合、
  `--private` は何も書き込む前に拒否する(ほかの private の要件と同じ)。private のインストールに後から `init --mod` で
  mod を足した場合も、exclude ブロックに加えられる。

### doctor

`npx flightwake doctor` は mod がインストールされているかを報告する(任意の項目なので、未インストールは問題ではない)。
インストールされているときは次を検査する:

- マニフェストが存在し、解析できる
- `hooks/hooks.json` と、そこで名前が挙がっているモジュールが存在する
- 配布されるファイルがすべてそろっている
- インストール済みのバージョンが、パッケージ内のものと一致する(不一致は warning で、`update` を案内する)
- 配布ファイルが手で編集されている(warning;`update` で元に戻る)
- `claude --version` が実行できれば 2.1.287 と比較する(古ければ warning;読み取れなければヒントを出すだけで、失敗にはしない)

doctor には、フォルダーが信頼済みかどうかも、session が repo のルートから始まっているかも見えない——その旨を doctor 自身が表示する。
mod が読み込まれたかどうかは Claude Code の中で確認すること(たとえば `/fw-log` が使えるか)。

## 5 つの機能

機能ごとに専用のスイッチがある(プラグインのオプション。4 つは既定でオン、ロールガードは既定でオフ)。

| スイッチ | 既定 | 何をするか |
|---|---|---|
| `stateInject` | オン | session 開始時に、`.flightwake/STATE.md`(session ごとに 1 回取ったスナップショット)をシステムプロンプトに加える。「これは前回の締めの時点の状態であり、git も確認すること」という注記つき。未記入のテンプレート STATE の場合は、代わりに「コールドスタートを実行する」という 1 行を入れる。6000 文字を超えるときは、先頭の N 文字を切り取るのではなく、frontmatter、「進行中」と「次の入口」のセクション、ファイルパスを入れ、STATE を圧縮するよう促す。`fw-coldstart` の代わりにはならない(遅れの確認と最新 record の読み込みは、これまでどおり skill の仕事)。 |
| `band` | オン | プロンプトの上に 1 行:health の色、STATE の遅れ(Stop hook の検査と同じ数え方。bot の commit は数えない)、コンテキスト使用率、次に勧めるコマンド。すべて順調なら黙っている(health が緑でない、遅れが 3 commit 以上、またはコンテキストが 60% 以上のときに表示される)。コンテキストが 80% に達したときは toast を 1 回出す。flightwake の下部ゲージ(`statusline.mjs`)が実際のステータス行になっているときは、帯はゲージがすでに表示している項目を隠して静かにし、toast だけが残る。 |
| `recorder` | オン | session のフライトログ:変更されたファイル、commit、認識できたテストコマンドとその結果。`/fw-log` がそれを出力し、`fw-record` が `tests:` の証拠と変更一覧に使う。record を書き込むことはない。 |
| `tripwire` | オン | agent がファイルを編集したとき、またはコマンドを実行したときに、有効な TRAPS エントリの任意フィールド `paths` / `commands` に一致すると、そのエントリの要旨と確信度を、session ごとに 1 回だけ agent に見せる——ツールの実行**後**に(守るのは次の試行であって、今回のものではない)。ブロックはしない。`probable` / `suspected` のエントリは、結論ではなく手がかりとして表示される。 |
| `roleGuard` | オフ | このフォルダーの Claude の席のロールについて、ロール本文(ROLES.md)の `deny-write: [globs]` 行が、メイン session による該当パスへの `Edit` / `Write` / `NotebookEdit` のブロックになる。メッセージには、ロール名、ルール、代わりにどうするかが示される。この session について解除できるのは本人だけで、プロンプトに自分で `/fw-role-release` と入力する。解除はステータス行に表示され続ける。詳細は [roles.ja.md](roles.ja.md) の「オプション:Claude Code mod のロールガード」を参照。 |

### スイッチの設定

スイッチは Claude Code の `/config` か、*ユーザー*設定(`~/.claude/settings.json`)に書く:

```json
{
  "pluginConfigs": {
    "flightwake-mod@skills-dir": {
      "options": { "roleGuard": true, "band": false }
    }
  }
}
```

プラグインのオプションはプロジェクト設定からは読まれない。そのためインストーラーが代わりに設定することはできず、各自の選択になる。

### tripwire が使う TRAPS のフィールド

どちらも任意。これらを持たない古いエントリは、単に一致の対象にならない。

```yaml
paths: ["src/db/**", "*.sql"]
commands: ["npm run migrate", "psql"]
```

- `paths`:repo 相対の glob。`/` を含まないパターンは、どの深さでもそのファイル名に一致する。
- `commands`:コマンドの先頭部分(プレフィックス)で、トークンごとに比較する。正規表現は使えない。
- superseded になったエントリは、決して一致の対象にならない。

## 下部ゲージと帯を一緒に使う

`setup` は両方の質問を残している。両方をインストールした場合、終了時のメッセージはこう説明する:下部ゲージは health / STATE の遅れ / コンテキスト使用率を表示し、
プロンプト上の帯は、ゲージが有効な間はそれと同じ項目を隠して静かにし、コンテキストが逼迫したときに toast を 1 回出すだけ。
mod を選んでもゲージが外れることはない。

インストール後にインストーラーが表示すること:Claude Code 2.1.287 以降が必要;repo のルートから始め、信頼プロンプトを承認すること;
ロールガードを自分でオンにする方法(上の `pluginConfigs` のキー、または `/config`);そしてそれがセキュリティ境界ではないこと。

## 制限——必ず読むこと

- **`/fw-log` の「pass」が意味するのは、**直接呼び出された、認識できるテストランナーが、認識できる形で実行され、0 を返した、ということだけ。
  テストが実際には走らなくなる設定——設定ファイルや環境の中のもの(たとえば pytest.ini の `addopts`、テストを飛ばすビルドプロファイル)——は見えず、
  テストが何を検査しているかを保証するものでもない。証明できないものは、pass ではなく「unknown」として終了コードとともに記録される。
- **ロールガードはセキュリティ境界ではない。** Bash とそのほかのツールは検査されず、サブ agent も検査されず、
  禁止パスの symlink などの別名も捕まえられない。
- tripwire が作業ディレクトリを確定できないとき(たとえば `||` の後の `cd`、サブシェルの中)は、候補ディレクトリごとに照合する(最大 16 個。超えるとパスの末尾部分での照合に切り替える)ので、必要以上にヒントが出ることがある。
- Claude Code 専用。2.1.287 以降、承認済みのフォルダー信頼プロンプト、repo のルートからの開始が必要。
- 実際の Claude Code の session で 1 回検証した(5 つの機能すべてが効いた)。**まだ実際の session で検証していないもの**:
  再起動後の session の再開、compaction 後の挙動、80% の toast、デスクトップ / VS Code での見た目、`/config` にオプションが並ぶかどうか(ドキュメントにはそう書かれている)。

関連:[roles.ja.md](roles.ja.md)(席、オンコールロール、ROLES.md)。
