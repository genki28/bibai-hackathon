# 4. LINE の準備

LINE Bot と LIFF(= LINE の中で開く Web 画面)を、実際の LINE とつなぐための準備です。
チームで 1 人がやれば大丈夫です。取れた値は `.env` に入れます(入れ方は [準備する](01-setup.md) の「追加で必要になるもの」)。

> LINE の管理画面はときどき見た目や名前が変わります。下の画面名・ボタン名と少し違っていたら、近い名前のものを探してください。
> 迷ったら公式の説明(https://developers.line.biz/ja/docs/)が正解です。

## 全体像

| 取ってくる値 | `.env` での名前 | どこで取れるか |
| --- | --- | --- |
| チャネルシークレット | `LINE_CHANNEL_SECRET` | Messaging API のチャネル |
| チャネルアクセストークン | `LINE_CHANNEL_ACCESS_TOKEN` | Messaging API のチャネル |
| LIFF ID | `LIFF_ID` | LINE ログインのチャネル |

チャネルシークレットとチャネルアクセストークンは **秘密の値** です。`.env` 以外(コード、ドキュメント、チャット、スクリーンショット)に書かないでください。
LIFF ID は画面の URL にも出る値なので、見られても問題ありません。

## A. LINE Bot の準備

1. **LINE 公式アカウントを作る。** https://www.linebiz.com/jp/entry/ などから、無料で作れます。これが Bot の「顔」になります。
2. **Messaging API を有効にする。** LINE Official Account Manager(公式アカウントの管理画面)の設定の中に「Messaging API」という項目があるので、そこから利用を始めます。途中で「プロバイダー」(= チャネルをまとめる入れ物)を選ぶか作るように言われます。チーム名などで 1 つ作れば OK です。
3. **LINE Developers コンソールを開く。** https://developers.line.biz/console/ に同じ LINE アカウントでログインすると、いま作ったプロバイダーの中に Messaging API のチャネルができています。
4. **チャネルシークレットを取る。** チャネルの「チャネル基本設定」タブのあたりにあります。→ `.env` の `LINE_CHANNEL_SECRET` へ。
5. **チャネルアクセストークンを取る。** 「Messaging API設定」タブの下の方で、チャネルアクセストークン(長期)を発行します。→ `.env` の `LINE_CHANNEL_ACCESS_TOKEN` へ。
6. **Webhook URL を設定する。**(公開 URL が決まってから)「Messaging API設定」タブの Webhook URL に `https://(公開URL)/webhook` を入れ、「Webhookの利用」をオンにします。「検証」ボタンがあれば押して、成功と出るか確かめます。
7. **自動応答をオフにする。** そのままだと公式アカウントの定型の自動応答メッセージも一緒に返ってしまうので、LINE Official Account Manager の応答設定でオフにしておくと分かりやすいです。
8. **友だち追加して話しかける。** 「Messaging API設定」タブにある QR コードを自分の LINE で読み取り、メッセージを送ります。「〇〇」ですね! と返ってくれば成功です。

## B. LIFF の準備

1. **LINE ログインのチャネルを作る。** LINE Developers コンソールで、A と同じプロバイダーの中に「LINEログイン」のチャネルを新しく作ります(LIFF アプリは Messaging API のチャネルには追加できません)。アプリタイプは「ウェブアプリ」を選びます。
2. **LIFF アプリを追加する。** そのチャネルの「LIFF」タブで「追加」を押します。
   - サイズ: まずは Full(全画面)で OK
   - エンドポイント URL: `https://(公開URL)/liff/`(公開 URL が決まってから。あとで変更できます)
   - Scope(= 取ってよい情報の範囲): `profile` にチェック(表示名を出すために必要)
3. **LIFF ID を取る。** 追加すると LIFF ID(`数字-英数字` の形)と、LIFF URL(`https://liff.line.me/` で始まる URL)が表示されます。LIFF ID を `.env` の `LIFF_ID` へ。
4. **開いてみる。** LIFF URL を LINE のトークに貼ってタップします。「LINE アプリの中」と自分の表示名が出れば成功です。
5. チャネルが「開発中」の状態だと、チャネルの権限を持つ人しか LIFF を開けないことがあります。チームのメンバーをチャネルの権限に追加するか、デモの前に「公開」に切り替えてください。

## 公開 URL について(まだ決まっていません = 次に決めること)

LINE のサーバーやスマホの LINE アプリは、あなたの PC の中の `http://localhost:3000` には届きません。
そのため Webhook URL と LIFF のエンドポイント URL には、**インターネットから見える `https://` で始まる URL** が必要です。

公開方法は **未定** です。大きく分けて次の 2 通りがあり、チームで決めて [決めたことの記録](decisions.md) に書きます(Claude に `/decide-stack` と頼むと相談できます)。

- 自分の PC で動かしたまま、一時的に外から見える URL を作る道具(トンネルと呼ばれます)を使う
- サーバーを置けるサービスに公開(デプロイ)する

公開 URL が決まるまでにできること:

- `npm run dev` で起動して http://localhost:3000/liff/ を PC のブラウザで開く(LIFF ID が空なら「LIFF ID が未設定です」と出ます。LIFF ID を入れても、エンドポイント URL が未設定のうちは LINE との連携部分はエラーになることがあります)
- `src/bot/reply.ts` を書き換えて `npm test` で Bot の返事を確かめる

## うまくいかないとき

| 症状 | 見るところ |
| --- | --- |
| Bot が返事をしない | Webhook URL が `https://…/webhook` になっているか、「Webhookの利用」がオンか、サーバーが動いているか |
| サーバーのログに 401 や「署名を確認できませんでした」と出る | `LINE_CHANNEL_SECRET` が違うチャネルのものになっていないか |
| http://localhost:3000/health で `botConfigured` が `false` | `.env` の 2 つの値が入っているか。入れたあとサーバーを再起動したか |
| LIFF の画面に「LIFF ID が未設定です」と出る | `.env` の `LIFF_ID`。入れたあとサーバーを再起動したか |

それでも分からなければ、Claude に `/stuck` と打ってください。

次は [用語集](glossary.md) へ。
