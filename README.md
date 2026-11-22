# bibai-hackathon

美唄ハッカソンのチーム用リポジトリです。
AI(Claude など)に日本語でお願いしながら作る「バイブコーディング」で進めます。

## はじめての人へ

上から順番に読んでください。全部で 15 分くらいです。

1. [準備する](docs/01-setup.md) — 必要なものを入れて、このリポジトリを自分の PC に持ってくる
2. [作業の流れ](docs/02-workflow.md) — 「始める → 作る → 保存する」の 3 ステップ
3. [AI への頼み方](docs/03-prompting.md) — うまく作ってもらうコツ
4. [LINE の準備](docs/04-line-setup.md) — LINE Bot と LIFF を動かすための設定
5. [用語集](docs/glossary.md) — わからない言葉が出てきたら

## 合言葉(Claude Code で使えるコマンド)

| 打つもの | いつ使う |
| --- | --- |
| `/start-work` | 作業を始めるとき(最新の状態にして、自分用の作業場所を作る) |
| `/save-work` | キリのいいところで(保存して、みんなに共有する) |
| `/stuck` | エラーが出た・動かない・何をすればいいかわからないとき |
| `/decide-stack` | 何で作るか(技術スタック)をチームで決めるとき |

## いま決まっていること

- 何を作るか: [docs/product.md](docs/product.md)
- 何で作るか・決めたことの記録: [docs/decisions.md](docs/decisions.md)

## フォルダの中身

| 場所 | 中身 |
| --- | --- |
| `docs/` | 人間が読む説明書 |
| `AGENTS.md` | AI に守ってもらうルール(Claude 以外の AI ツールも読みます) |
| `CLAUDE.md` | Claude 用の入口(`AGENTS.md` を読み込むだけ) |
| `.claude/` | Claude Code のチーム共通設定と合言葉(スキル) |
