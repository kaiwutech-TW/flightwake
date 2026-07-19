<!-- 日本語版。主版:README.md(英語);他:README.zh-TW.md / README.zh-CN.md — どの版を編集しても他版への同期が義務。 -->
# flightwake ✈️

> **記録とは、仕事が飛び去った後に自然と残る飛行機雲であって、離陸前に提出を強いられる飛行計画ではない。**

[![npm](https://img.shields.io/npm/v/flightwake)](https://www.npmjs.com/package/flightwake) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/kaiwutech-TW/flightwake/badge)](https://scorecard.dev/viewer/?uri=github.com/kaiwutech-TW/flightwake)

🌐 [English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · **日本語**

強いモデル(Claude Fable 5 世代以降)のための超軽量ワーク記録フレームワーク。ランタイム依存ゼロ、純粋な Markdown、すべて git に入る。

## インストール

```bash
cd your-repo
npx flightwake init             # 既定は英語(--lang=zh-TW で繁體中文;テンプレートは現在 en/zh-TW の 2 種)
npx flightwake update           # その場で更新。インストール時のオプション(lang/statusline/private)を引き継ぐ
```

init が行うこと:`.flightwake/` の作成(テンプレート + Stop hook)、4 つの skill を `.claude/skills/` にコピー、Stop hook を `.claude/settings.json` にマージ、トリガー義務表(`<!-- flightwake:begin/end -->` マーカー付き)を**検出した agent 指示ファイル**(CLAUDE.md / AGENTS.md / GEMINI.md — 存在するものに追記;どれも無ければ AGENTS.md を作成;`--agents=claude,codex,gemini` で明示指定可)に追記。**純粋なファイルコピー、ランタイム依存ゼロ**(Node ≥18 はインストール時と hook のみ)。ユーザーデータ(STATE/DECISIONS/TRAPS)はいかなる場合も上書きしない;`--force` はフレームワーク所有ファイルのみ更新する。

## 使い方

### 初回インストール直後

1. Claude Code セッションを開き、「**/fw-record で STATE を初期化して**」と言う——モデルが repo の現状を最初の STATE に書き起こす
2. `git add .flightwake .claude CLAUDE.md && git commit`
3. 以降のセッションはすべて下記の日常ループ

### 日常ループ

あなた(とモデル)が覚えるべきことは一つだけ:**作業開始時に `/fw-coldstart`、残りの義務はモデルが自らトリガーする**——義務表はすでに指示ファイルに貼られており、強いモデルはそれを読み、守る。典型的なセッション:

```text
あなた:/fw-coldstart
モデル:(STATE + 最新 record を読む、約 1 分)
        「前回は X まで完了、health green、次の入口は Y。
         未検証の変更:なし。Y から引き継ぎますか?」
あなた:はい、進めて
モデル:(直ちに作業開始。選択肢を閉じる決定をした → DECISIONS に一行追記;
        非自明な罠を踏んだ → /fw-trap で登録)
あなた:締めて
モデル:(/fw-record:飛行記録を書き、STATE を更新し、機密情報セルフチェック)
```

締め忘れても大丈夫:STATE が 3 コミット以上遅れると、Stop hook がセッション終了前に一度ブロックして催促する;`--ci` で同じゲートを他の agent や人間の協力者にも届けられる。セッションをまたぐ大きな工事は、手を止める前に「引き継ぎ」と言って `/fw-handoff` を走らせる。

### あなたが見張るべき唯一のこと

STATE の health が正直かどうか(green/yellow/red)。フレームワークの品質指標はただ一つ:**新しいセッションが `/fw-coldstart` から安全な引き継ぎに至るまでにかかった時間**——5 分を超えたら、記録が劣化しているということだ。それ以外——記録の量、形式の遵守——はどうでもいい。

ランプが点いてもメンテナンスはあなたの仕事ではない。一言:「**今回のコールドスタートは X 分かかった。どこが遅いか診断して圧縮して**」。モデルは診断(STATE が長すぎ?前回未収束?TRAPS/DECISIONS に失効エントリが多い?)と項目別の処置リスト——どれを superseded にするか・なぜ・どれを統合するか——を持って戻ってくる。あなたは一言で承認するだけ。プロンプトのコツは感情ではなく事実:「5 分超は次のセッションが引き継ぎに失敗するということ」はモデルが推論できるが、「深刻だぞ!」は緊張の演技しか生まない。

### 実物を見たい

この repo 自身がこのフレームワークを dogfooding している:[`.flightwake/`](.flightwake/) には本物の STATE、DECISIONS、records が入っている——ギャップ一覧からオープンソース公開までの全ステップが記録されている。あなたの repo にインストール後、自然に育つのはまさにこれだ。

### ステージ別プレイブック

強いモデルとの協働が初めてなら:[docs/workflow.md](docs/workflow.md) は「各ステージで**あなた**が何をし、モデルに何と言うか」のステージマップ——本線は初心者向け、「⚙ Advanced」の折りたたみは Claude Code 熟練者向け。(繁體中文版:[workflow.zh-TW.md](docs/workflow.zh-TW.md))

## なぜこのプロジェクトが存在するか

Fable 5 級のモデルに仕事のやり方を教える必要はない——だが、どれほど強いモデルにもできないことが四つある。すべて**構造的**なもので、モデルが強くなっても消えない:

1. **セッションは必ず死に、コンテキストは有限。** 仕事がセッションをまたぐと記憶はゼロに戻る;記録がなければ、引き継ぎのたびに git 考古学の発掘作業——強いモデルは掘るのが速いだけで、掘らずに済むわけではない。
2. **git は what を記録するが、why は記録しない。** コミットで「何を変えたか」は分かるが、「なぜ別の道を選ばなかったか」「あの罠の根本原因」は分からない——そしてこの二つこそ、次のセッション(次の agent)にとって最も高価な情報だ。
3. **規律は長いセッションで漂流する。** 「テストを走らせる前に完了と報告」「prod を触って検証証拠を残さない」——この種の滑落はモデルの知能と無関係で、モデルの外側のガードが要る。
4. **agent 同士は状態を共有しない。** Claude、Codex、Gemini、人間のチームメイトはそれぞれ別の世界を見ている;git に入って初めて状態はみんなのものになる。

つまり flightwake が補うのは**永続性と規律であって、知能ではない**。思想的な先祖は GSD:GSD は**ナビゲーション**(モデルの一歩一歩を turn-by-turn で誘導)、flightwake は**ドライブレコーダー + 警告灯 + 道路標識**——強いモデルは自分で運転できるので、フレームワークは三つだけを担う:

1. **ドライブレコーダー**:決定、発見、検証証拠を事後に記録(`records/`、`DECISIONS.md`、`TRAPS.md`)
2. **警告灯**:モデルの強弱と無関係なハードガード(テストが緑になるまで「完了」ではない、prod 変更は検証証拠必須、破壊的操作は事前確認)
3. **道路標識**:どのセッションが死んでも、次のセッションが `STATE.md` を読んで 2 分以内に安全に引き継ぐ

起源は実在の三日間セッション(2026-07-15~17:2 repo、19 commits、cron 4 本、深いバグ修正 2 件——事前計画なし、脱線ゼロ)。強いモデルにナビは不要だと証明した——だが、次のセッションを可能にするために残されたもの(SUMMARY/CONTEXT/記憶ファイル)は、すべてその場の即興だった。flightwake はその即興を、インストール可能な慣習に変える。

## 中核原則:記録は仕事に従う——仕事を導かない

GSD は **stage-driven**(research→plan→execute→verify のゲート制);flightwake は **trigger-driven**(イベントが義務を生む):

| トリガーイベント | 義務 | ツール |
|---|---|---|
| repo を触り始める | まず STATE + 最新 record を読む | `/fw-coldstart` |
| 「他の選択肢を閉じる」決定をする | DECISIONS に一行(append-only、why を記す) | 直接書く |
| 非自明な罠を踏む | TRAPS に一件 | `/fw-trap` |
| schema を触る / prod を触る / 約 3 コミット超 | record を書いて締める | `/fw-record` |
| 仕事がセッションをまたぐ | **手を止める前に**(開始前ではなく)handoff/CONTEXT を書く | `/fw-handoff` |
| セッションを閉じる | STATE の現在地と次の入口を更新 | `/fw-record` に含む |

**エスカレーションルール(GSD の逆)**:デフォルトはすべて quick、直ちに着手;「複数セッションにまたがる建設」だけが phase に昇格する(CONTEXT 一枚;plan の分解はモデルのその場の判断に委ねる)。

## ファイル構成(対象 repo へのインストール後)

```
your-repo/
├── .flightwake/
│   ├── STATE.md             # 今どこにいるか、次の入口(常に短く、常に新しく)
│   ├── DECISIONS.md         # append-only 決定ログ(一行一決定、why を記す)
│   ├── TRAPS.md             # 罠レジストリ(OKF 式 frontmatter エントリ)
│   ├── TEMPLATE-record.md   # 飛行記録テンプレート
│   ├── hooks/state-check.mjs  # Stop hook:STATE が 3 コミット以上遅れたら催促
│   └── records/             # 飛行記録(意味のある締めごとに一枚)
├── .claude/skills/fw-*/     # 4 つの skill
└── .claude/settings.json    # init が Stop hook 設定をマージ
```

skill と Stop hook は Claude Code 上の便利な糖衣;`.flightwake/` 本体は純粋な Markdown で、指示ファイルを読める agent なら誰でも同じトリガー義務に従える。既存の GSD `.planning/` と共存可能(旧記録は歴史アーカイブになる)。

## 高度なインストール

**`--private`** は記録を**ローカルのみ、git の外**に保つ:すべての書き込みを `.git/info/exclude` に登録(純ローカル——repo に痕跡を残さない)、hook は `.claude/settings.local.json` へ、義務表は `CLAUDE.local.md` へ(git 追跡下の既存指示ファイルには一切触れない)。代償:記録は repo と共有されず、clone し直したら `init --private` の再実行が必要——「git に入れて repo と共有」こそが flightwake のデフォルトであり存在理由;`--private` は「他人の repo での私的利用」のための非常口だ。

**`uninstall`** は init の固定書き込み範囲を逆順に掃除する:skill とフレームワークファイルを削除、settings から flightwake の Stop hook を抜き取り(あなたの他の hook はそのまま)、指示ファイルと `.git/info/exclude` のマーカーブロックを除去(flightwake が作ったファイルは空になったら削除)。**`.flightwake/` はユーザーデータでありデフォルトで保持**;`uninstall --purge` で初めて一緒に削除される。

**monorepo ポリシー:1 repo 1 インストール、git root に。** 仕事はセッションの形をしている——1 セッションは複数パッケージを日常的にまたぎ、記録はセッションに従う;サブディレクトリごとのインストールは一続きの仕事を細切れの record に裂き、「どの STATE を読むべきか」という新たなコールドスタートの曖昧さを生む。サブディレクトリで init を実行すると停止して root を案内する。submodule は自前の `.git` を持つ独立 repo として扱う。マルチチームの高流量 monorepo で CI の遅延チェックが誤検知するなら、まず `--threshold` を調整。

### GSD からの移行

進行中の milestone をまず締めてから:

1. `npx flightwake init`——`.planning/` と共存し、何も削除されない
2. agent にこう伝える:「**この repo は GSD から flightwake に移行する。`.planning/` を読んで現状を把握し、/fw-record で `.flightwake/STATE.md` を初期化して——未完了項目は次の入口に書く。今後 `.planning/` は歴史アーカイブであり、更新しないこと**」
3. CLAUDE.md 内の GSD 自身の指示ブロックを削除(またはコメントアウト)し、二つのルールブックがモデルの服従を奪い合わないようにする

### ステータスライン(任意)

`npx flightwake init --statusline` で Claude Code の下部に常駐ゲージを設置:

```
✈️ flightwake │ ●green · STATE 2c 遅れ │ ▓▓░░░░░░░░ 23%
```

health の色(あなたが見張る唯一のもの)、STATE の遅れ(Stop hook と同じ rev-list ロジックを「終了時の催促」から「常時表示」に)、context 使用量。ゲージは状態に応じて**次のコマンドを直接提示**する——セッション開始直後 → `→ まず /fw-coldstart`;STATE が 3 コミット以上遅れ → `→ /fw-record`;context が満杯間近 → `→ /fw-record → /clear → /fw-coldstart`;すべて正常 → 沈黙。既存の statusline は決して上書きせず(単一値設定)、repo 層の設定がユーザー層より優先されるため、グローバルなゲージツールとも共存できる。

注意:素の `npx flightwake init` ではゲージは**入らない**——オプトインだ。init 済みで後から欲しくなったら `npx flightwake init --statusline` をもう一度実行するだけ(既に入っているものはすべて skip され、ゲージだけ追加される)。次の Claude Code セッションから bar が表示される。

ゲージは flightwake の新バージョンも知らせる(`→ v0.9.1 available: npx flightwake update`)——他に急ぎがないときだけ表示。チェックは 24 時間に最大 1 回の npm registry への匿名 GET で、OS の一時ディレクトリにキャッシュされ、常にバックグラウンドプロセスで実行(描画がネットワークを待つことはない)。無効化:`FLIGHTWAKE_NO_UPDATE_CHECK=1`。

### CI 側の締めチェック(任意)

Stop hook は Claude Code 内でのみ有効;「STATE を遅らせない」規律を他の agent や人間の協力者に広げるには、同じスクリプトを CI で走らせる——STATE が HEAD から 3 コミット以上遅れたら失敗(`--threshold=N` で調整可):

```yaml
# .github/workflows/flightwake.yml(例;repo の慣習に従い actions は SHA 固定を推奨)
name: flightwake
on: [push, pull_request]
permissions:
  contents: read
jobs:
  state-fresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # rev-list の遅延カウントには全履歴が必要
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: node .flightwake/hooks/state-check.mjs --ci
```

flightwake があなたの repo に workflow を書き込むことはない——`.github/workflows/` は権限的にセンシティブで、「固定書き込み範囲」の約束の外にある;例は自分でコピーすること。

## 隣接システムとの境界

**Claude Code のメモリ機能**:永続メモリは flightwake と同形(frontmatter + `[[リンク]]`)だが別レイヤー——メモリは単一マシン・単一人;flightwake のファイルは git に入り、repo と共にチーム・CI・あらゆる agent へ届く。分担ルール:repo の事実(罠、決定、状態)は flightwake へ;個人の好みやプロジェクト横断の習慣はメモリへ。同じ事実を両方に書かない。

**[Google OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)**:OKF は**知識レイヤー**(システムの事実:schema、指標の定義、コード対照)を、flightwake は**プロセスレイヤー**(何が起きたか、なぜ、今どこか)を管理する。flightwake の知識型成果物は OKF 慣習(YAML frontmatter + `[[リンク]]`)を採用——「純 Markdown + frontmatter」という共通基盤の上で自然に互換。

## セキュリティ

- **依存ゼロ、ネットワークなし、install script なし**:インストーラはファイルコピーのみ;hook は `git`(shell なし)で読み取り専用クエリのみ。
- **固定書き込み範囲**:`init` が触るのは `.flightwake/`、`.claude/skills/fw-*`、`.claude/settings.json`、および agent 指示ファイル内のマーカーブロックのみ;`--private` 時は代わりに `.claude/settings.local.json`、`CLAUDE.local.md`、`.git/info/exclude` 内のマーカーブロック。`uninstall` は同じ範囲を逆順に掃除。
- **hook は git に入る**:`.flightwake/hooks/state-check.mjs` は repo 内のファイル——commit できる人は誰でも変更できる。すべての repo-local 設定と同じ信頼レベルで、Claude Code は読み込み時に確認を求める。
- 脆弱性報告は [SECURITY.md](SECURITY.md) へ。npm には Trusted Publishing(provenance 付き)で公開;`npm audit signatures` で検証可能。

## ステータス

🚧 v0.x——dogfooding 継続中;慣習はまだ進化しうる(append-only ファイルは `superseded` ライフサイクルを持ち、読み取り側の寛容さが旧インストールを守る)。

## License

[MIT](LICENSE)
