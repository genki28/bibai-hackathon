# 1. 準備する

最初に 1 回だけやる作業です。つまずいたら遠慮なくチームに聞いてください。

## 用意するもの

| もの | 何のため | 入手先 |
| --- | --- | --- |
| GitHub アカウント | みんなの作業を 1 か所に集める場所 | https://github.com |
| Git | 変更を記録・共有する道具 | https://git-scm.com/downloads |
| GitHub CLI (`gh`) | PC から GitHub にログインする道具 | https://cli.github.com |
| Claude Code | AI に作ってもらう道具(デスクトップアプリが簡単) | https://claude.com/download |

Claude 以外の AI ツールを使う人も、Git と GitHub の準備は同じです。

## 手順

1. **GitHub アカウントを作り**、ユーザー名をリポジトリの管理者に伝える。
2. 届いた **招待メールを承認** する(このリポジトリは非公開なので、招待されないと見えません)。
3. **Git** と **GitHub CLI** をインストールする。
4. ターミナル(Mac は「ターミナル」、Windows は「PowerShell」)を開いて、GitHub にログインする。

   ```bash
   gh auth login
   ```

   質問には `GitHub.com` → `HTTPS` → `Login with a web browser` の順で答えれば OK です。

5. リポジトリを自分の PC に持ってくる(= クローン)。置き場所はどこでも構いません。

   ```bash
   gh repo clone genki28/bibai-hackathon
   ```

6. **Claude Code** を開き、いま作られた `bibai-hackathon` フォルダを選ぶ。
7. Claude に「このプロジェクトについて教えて」と話しかけて、返事が来れば準備完了です。

## 名前の登録(初回だけ)

誰の変更かわかるように、ターミナルで自分の名前とメールアドレスを登録します。

```bash
git config --global user.name "あなたの名前"
```

```bash
git config --global user.email "GitHubに登録したメールアドレス"
```

## 追加で必要になるもの

LINE Bot + LIFF を Node.js で作ることに決まったので、次の準備も 1 回だけ行います。

1. **Node.js(バージョン 22 以上)を入れる。** https://nodejs.org から「LTS」と書かれた方をダウンロードしてインストールします。
   入ったかどうかは、ターミナルで次を打つと確認できます(`v22` 以上の数字が出れば OK)。

   ```bash
   node -v
   ```

2. **必要な部品(ライブラリ)を入れる。** `bibai-hackathon` フォルダの中で次を実行します。

   ```bash
   npm install
   ```

3. **`.env` ファイルを作る。** `.env.example` をコピーして、名前を `.env` に変えます(Claude に「.env.example をコピーして .env を作って」と頼んでも OK)。

   Mac の場合:

   ```bash
   cp .env.example .env
   ```

   Windows(PowerShell)の場合:

   ```powershell
   Copy-Item .env.example .env
   ```

4. **`.env` に値を入れる。** 入れる値の取り方は [LINE の準備](04-line-setup.md) を見てください。
   `.env` は秘密の値を入れるファイルで、Git には入りません。チャットや画面共有で中身を見せないようにしましょう。

   データの保存先(Supabase)を使うときは、次の 2 つも入れます(空ならサーバーのメモリに保存し、再起動で消えます)。表の作り方は [公開する](05-deploy.md) を見てください。

   | 名前 | 入れる値 |
   | --- | --- |
   | `SUPABASE_URL` | Supabase のプロジェクトの URL(`https://〜.supabase.co`)。公開してよい値 |
   | `SUPABASE_SECRET_KEY` | Supabase の secret キー(`sb_secret_...` の形)。**秘密の値**。Project Settings → API Keys にある |

5. **動かしてみる。** 値が空のままでも起動できます。

   ```bash
   npm run dev
   ```

   ブラウザで http://localhost:3000/liff/ を開いて画面が出れば成功です。止めるときはターミナルで `Ctrl + C` を押します。

次は [作業の流れ](02-workflow.md) へ。

### 若者向けアプリ(helper-app)を動かす人だけ

ネイティブアプリ(iPhone / Android)を作る・動かす人だけ、次も入れます。詳しい手順は `helper-app/README.md` にあります。

- **iPhone 版(Mac だけ)**: App Store から **Xcode** を入れる。プロジェクトを作る道具の **XcodeGen** を入れる(Homebrew から)
- **Android 版(Mac / Windows)**: **Android Studio** を入れる(Android の SDK と Java が一緒に入る)
