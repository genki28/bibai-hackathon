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

## データの保存先(Supabase)

役割・依頼・本人確認の結果は **Supabase**(= ネット上のデータベース)に保存します。
Cloudflare Workers はリクエストごとに別の場所で動くことがあるので、サーバーのメモリに置くとデータが消えたり、人によって見え方が違ったりします。Supabase に置けば全員が同じデータを見られます。

### 最初の 1 回だけ: 表を作る

1. Supabase のダッシュボードでプロジェクトを開き、左のメニューの **SQL Editor** を開く
2. `supabase/migrations/0001_init.sql` の中身を全部貼り付けて **Run** を押す(何度実行しても壊れません)
3. 左のメニューの **Table Editor** に `help_requests`・`identity_verifications`・`user_roles` の 3 つの表ができていれば成功

すべての表で RLS(= 行ごとの読み書きの許可)を有効にし、許可は 1 つも作っていません。
ブラウザ用の公開キー(publishable キー)からは読み書きできず、サーバーだけが secret キーで読み書きします。

### 最初の 1 回だけ: secret キーを Cloudflare に登録する

secret キーは **Project Settings → API Keys** にある `sb_secret_...` の形の値です(⚠ 秘密の値。チャットや画面に出さない)。

```bash
npx wrangler secret put SUPABASE_SECRET_KEY
```

プロジェクトの URL(`SUPABASE_URL`)は公開してよい値なので、`wrangler.jsonc` の `vars` に書いてあります。

### 手元で Supabase を使う

`.env` に `SUPABASE_URL` と `SUPABASE_SECRET_KEY` を入れると、`npm run dev` でも Supabase に保存します。
どちらかが空なら、これまでどおりサーバーのメモリに置きます(再起動で消えます)。
起動したときのログの「保存先」で、どちらを使っているか分かります。

LINE 側のリッチメニューの切り替えは、Supabase とは別に LINE に保存されます。

## うまくいかないとき

- 公開先のエラーの記録は `npx wrangler tail` で見られます(止めるときは `Ctrl + C`)
- 困ったら Claude に `/stuck` と打ってください
