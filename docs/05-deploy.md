# 5. 公開する(デプロイ)

アプリを Cloudflare Workers(= Cloudflare の無料のサーバー置き場)に公開する手順です。
公開すると `https://bibai-yukikaki.<アカウント名>.workers.dev` のような **ずっと変わらない URL** になり、PC を閉じても動き続けます。

チームで 1 人がやれば大丈夫です。

## 最初の 1 回だけ

### 1. Cloudflare のアカウントを作る

https://dash.cloudflare.com/sign-up から無料で作れます。

### 2. この PC から Cloudflare にログインする

```bash
npx wrangler login
```

ブラウザが開くので、内容を確認して「許可(Allow)」を押します。

### 3. 秘密の値を Cloudflare に登録する

1 行ずつ実行します。それぞれ値を聞かれるので、`.env` に入れたのと同じ値を貼り付けて Enter を押します(画面には表示されません)。

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
```

```bash
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
```

LIFF ID は秘密の値ではないので、`wrangler.jsonc` の `vars` に書いてあります。

## 公開する(毎回)

```bash
npm run deploy
```

最後に表示される `https://〜.workers.dev` が公開 URL です。

## 公開 URL を LINE に登録する(URL が変わったときだけ)

| 場所 | 入れる値 |
| --- | --- |
| LINE Developers → Messaging API チャネル → Messaging API設定 → Webhook URL | `https://(公開URL)/webhook` |
| LINE Developers → LINE ログインチャネル → LIFF → エンドポイント URL | `https://(公開URL)/liff/` |

## 手元で、公開先と同じ仕組みで試す

```bash
npm run dev:worker
```

http://127.0.0.1:8787/liff/ で開けます。`.env` の値がそのまま使われます。

## 注意: データが残らない

いまは役割・依頼・本人確認の結果を **サーバーのメモリ** に置いています。
Cloudflare Workers はリクエストごとに別の場所で動くことがあるため、公開先では次のことが起きます。

- 登録した役割や依頼が、しばらくすると消える
- 人によって(またはタイミングによって)見えるデータが違う

ちゃんと残すには **Supabase につなぐ** 必要があります(決定済み・未実装)。それまでは「画面の流れを見せるデモ」として使ってください。
LINE 側のリッチメニューの切り替えは LINE に保存されるので、こちらは消えません。

## うまくいかないとき

- 公開先のエラーの記録は `npx wrangler tail` で見られます(止めるときは `Ctrl + C`)
- 困ったら Claude に `/stuck` と打ってください
