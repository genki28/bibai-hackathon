# bibai-hackathon

美唄ハッカソンのチーム用リポジトリです。
AI(Claude など)に日本語でお願いしながら作る「バイブコーディング」で進めます。

## はじめての人へ

上から順番に読んでください。全部で 15 分くらいです。

1. [準備する](docs/01-setup.md) — 必要なものを入れて、このリポジトリを自分の PC に持ってくる
2. [作業の流れ](docs/02-workflow.md) — 「始める → 作る → 保存する」の 3 ステップ
3. [AI への頼み方](docs/03-prompting.md) — うまく作ってもらうコツ
4. [LINE の準備](docs/04-line-setup.md) — LINE Bot と LIFF を動かすための設定
5. [公開する(デプロイ)](docs/05-deploy.md) — Cloudflare Workers に公開する手順
6. [用語集](docs/glossary.md) — わからない言葉が出てきたら

## 合言葉(Claude Code で使えるコマンド)

| 打つもの | いつ使う |
| --- | --- |
| `/start-work` | 作業を始めるとき(最新の状態にして、自分用の作業場所を作る) |
| `/save-work` | キリのいいところで(保存して、みんなに共有する) |
| `/stuck` | エラーが出た・動かない・何をすればいいかわからないとき |
| `/decide-stack` | 何で作るか(技術スタック)をチームで決めるとき |

## いま決まっていること

- 何を作るか: [docs/product.md](docs/product.md)
- 機能ごとの説明: [docs/features/README.md](docs/features/README.md)
- 技術的な課題: [docs/technical-challenges.md](docs/technical-challenges.md)
- ハック要素の提案(未実装): [docs/proposals/README.md](docs/proposals/README.md)
- お年寄りのフォームを Gemini で作る人へ: [docs/guides/help-request-form-for-gemini.md](docs/guides/help-request-form-for-gemini.md)
- 何で作るか・決めたことの記録: [docs/decisions.md](docs/decisions.md)

## 若者向けアプリ(iPhone / Android)をスマホに入れる

若者向けのアプリは `helper-app/` にあります(くわしい仕組みは [helper-app/README.md](helper-app/README.md))。
ここでは「自分のスマホに入れるまで」の手順だけを書きます。コマンドは **リポジトリの一番上のフォルダ** から 1 行ずつ打ちます。

### iPhone(Mac だけ)

**準備(1 回だけ)**

1. App Store から **Xcode** を入れて、一度開く(追加のインストールを聞かれたら「Install」)
2. Xcode の「設定 → Accounts」で自分の Apple ID を足す(無料の Apple ID でも OK)
3. Xcode のプロジェクトを作る道具 **XcodeGen** を入れる

```bash
brew install xcodegen
```

**iPhone 側の準備(1 台ごとに 1 回)**

1. iPhone を Mac にケーブルでつなぎ、「このコンピュータを信頼」で「信頼」
2. iPhone の「設定 → プライバシーとセキュリティ → デベロッパモード」をオン → 再起動 →「オンにする」

**ビルド(= アプリを作る)と、iPhone に入れる**

Xcode のプロジェクトを作って開きます(`project.yml` が変わったら、もう一度これを実行)。

```bash
cd helper-app/ios && xcodegen generate && open BibaiHelper.xcodeproj
```

Xcode で次の順に操作します。

1. 左の一覧の **BibaiHelper** →「Signing & Capabilities」→「Team」で自分の Apple ID を選ぶ
2. 上の端末の選択で、つないだ iPhone を選ぶ
3. ▶(Run)を押す。**iPhone のロックは外しておく**
4. 初回だけ、iPhone の「設定 → 一般 → VPN とデバイス管理」で自分の Apple ID を「信頼」してから、もう一度 ▶

無料の Apple ID で入れたアプリは **7 日で動かなくなる** ので、そのときは ▶ で入れ直します。

**うまくいかないとき(iPhone)**

| 出てくる言葉 | 原因と直し方 |
| --- | --- |
| `Developer Mode disabled` | iPhone のデベロッパモードがオフ。上の「iPhone 側の準備」の 2 |
| `device is locked` / `passcode protected` | iPhone のロックを外してから、もう一度 ▶ |
| `PLA Update available` / `Program License Agreement` | Apple の新しい利用規約に同意していない。https://developer.apple.com/account にログインして同意してから、もう一度 ▶ |
| `doesn't include the currently selected device` | その iPhone がまだ登録されていない。Xcode の Signing の画面で「Try Again」か、もう一度 ▶(自動で登録されます) |
| `No Account for Team` | Xcode に Apple ID が入っていない。上の「準備」の 2 |

### Android(Mac / Windows)

**準備(1 回だけ)**

1. **Android Studio** を入れて、一度開く(最初の設定画面は「Standard」のまま進める。Android の部品と Java が一緒に入ります)
2. Android Studio で `helper-app/android` のフォルダを開く(右下の読み込みが終わるまで待つ)

**スマホ側の準備(1 台ごとに 1 回)**

1. 「設定 → デバイス情報(またはスマートフォン情報)」の **ビルド番号を 7 回タップ** → 開発者向けオプションが出る
2. 「設定 → システム → 開発者向けオプション」で **USB デバッグ** をオン
3. ケーブルでパソコンにつなぎ、スマホに出る「USB デバッグを許可しますか?」で「許可」(「常に許可」にチェック)
4. USB の接続の種類を聞かれたら「ファイル転送」を選ぶ

**ビルドと、スマホに入れる**

いちばんかんたんなのは、Android Studio の上の端末の選択でスマホを選んで ▶(Run)を押すことです。

コマンドで入れるときは、まずフォルダを移ります。

```bash
cd helper-app/android
```

Mac は次の 1 行(Android Studio の中の Java 17 を使うため、`JAVA_HOME` を付けます)。

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew installDebug
```

Android Studio を自分のユーザーの「アプリケーション」に入れた人は、パスの先頭を `$HOME/Applications/` に変えます。

Windows(PowerShell)は次の 2 行。

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
```

```powershell
.\gradlew.bat installDebug
```

`BUILD SUCCESSFUL` と出たら、スマホのアプリ一覧に「雪かきお助け」が入っています。

**うまくいかないとき(Android)**

| 出てくる言葉 | 原因と直し方 |
| --- | --- |
| `no such file or directory: ./gradlew` | フォルダが違う。先に `cd helper-app/android` |
| `No connected devices!` | スマホが見えていない。ケーブルを差し直す(充電専用のケーブルはダメ)・USB デバッグがオンか・「許可」を押したか・接続の種類が「ファイル転送」かを確かめる |
| `Unsupported class file major version` など Java の話 | Java が新しすぎる/古すぎる。上のとおり `JAVA_HOME` に Android Studio の中の Java(jbr)を指定する |
| `SDK location not found` | Android Studio で一度 `helper-app/android` を開く(`local.properties` が自動で作られる) |

ケーブルがないときは、Android Studio の「Device Manager → Pair Devices Using Wi-Fi」と、スマホの「開発者向けオプション → ワイヤレスデバッグ」で、Wi-Fi でもつなげます(パソコンとスマホが同じ Wi-Fi のとき)。

### つながるサーバー

何もしなければ、どちらのアプリも公開中のサーバーにつながります。手元のサーバーで試すやり方は [helper-app/README.md](helper-app/README.md) の「手元のサーバーで試す」にあります。

## フォルダの中身

| 場所 | 中身 |
| --- | --- |
| `docs/` | 人間が読む説明書 |
| `AGENTS.md` | AI に守ってもらうルール(Claude 以外の AI ツールも読みます) |
| `CLAUDE.md` | Claude 用の入口(`AGENTS.md` を読み込むだけ) |
| `.claude/` | Claude Code のチーム共通設定と合言葉(スキル) |
