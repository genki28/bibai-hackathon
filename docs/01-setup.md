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

(技術スタックが決まったら、ここに追記します)

次は [作業の流れ](02-workflow.md) へ。
