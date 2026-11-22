# お年寄りの「助けを呼ぶ」フォームを作る人へ(Gemini 向け作業メモ)

このメモは、**Gemini(無料版)で、お年寄り向けフォームの見た目を作る人** のためのものです。
Python 以外の言語を書いたことがなくても大丈夫です。触るのは HTML と CSS(= 画面の部品と見た目)だけです。

## あなたが触るファイル

| ファイル | 触ってよいか | 中身 |
| --- | --- | --- |
| `public/liff/help-request.html` | **触ってよい** | 画面の部品(`<section>` の中)と見た目(`<style>` の中) |
| `public/liff/help-request.js` | 触らない | ボタンを押したときの動き・送信 |
| `public/liff/common.js` | 触らない | 画面共通の処理 |
| それ以外 | 触らない | サーバーなど |

画像を使いたいときは `public/liff/images/` に置いて、`<img src="./images/ファイル名.png" alt="説明">` で表示します。

## 変えてはいけないもの(動かなくなります)

HTML の中の、次の **id と name / value はそのまま残してください**。場所や見た目、文章は自由に変えて OK です。

| 変えてはいけないもの | 役割 |
| --- | --- |
| `id="step-ask"` | 最初の画面(呼ぶかどうか聞く) |
| `id="step-sending"` | 送っている途中の画面 |
| `id="step-done"` | 送れた後の画面 |
| `id="call-button"` | 「よぶ」ボタン |
| `id="cancel-button"` | 「やめる」ボタン |
| `id="close-button"` | 「とじる」ボタン |
| `id="error"` | エラーを出す場所 |
| `id="preview-note"` | おためし表示の注意書き |
| `name="amount"` と `value="little"` / `"normal"` / `"lots"` | 雪の多さ(すこし / ふつう / たくさん) |

## 足してよい入力欄(任意)

次の `name` を付けた入力欄を足すと、その値も一緒に送られます。**なくても動きます**。空のままなら送りません。

| 項目 | `name` 属性 | 入力欄の例 | 決まり |
| --- | --- | --- | --- |
| お年寄りの名前 | `name="name"` | `<input type="text" name="name">` | 40 文字まで |
| 住所 | `name="address"` | `<input type="text" name="address">` | 100 文字まで。「北海道美唄市東1条南2丁目」のように書くと、若者の一覧に「東」のような地区名だけが出る |
| 雪の深さ | `name="depth"` | `<input type="radio" name="depth" value="knee">ひざ` など | 選んだ value の文字(20 文字まで)。value は英語の短い言葉にする(例: `ankle` / `knee` / `waist`) |
| 道具 | `name="tools"` | `<input type="text" name="tools">` | 100 文字まで。例「スコップあり」 |
| 位置(緯度・経度) | `name="lat"` と `name="lng"` | `<input type="hidden" name="lat">` `<input type="hidden" name="lng">` | 2 つそろったときだけ送る |
| 現在地ボタン | `id="use-location-button"` | `<button type="button" id="use-location-button">いまいる場所を使う</button>` | 押すと、上の `lat` / `lng` に現在地が入る(上の 2 つの hidden と一緒に置く) |

位置が送られないときは、地図には美唄市の中心あたりが出ます。名前・住所・正確な位置は、参加した若者にだけ見せます。

`<script ...>` の 2 行(LINE の部品とボタンの動き)も消さないでください。

画面の右下に「↺ メニューを最初に戻す」ボタンが自動で出ます。これはどの画面にも出る共通のボタンなので、HTML に書く必要はありません。デザインが重なって困るときは、下に少し余白(`padding-bottom`)をとってください。

## 守ってほしいこと

- **お年寄りが使う画面**です。文字は大きく(本文 20px 以上が目安)、ボタンは大きく(高さ 80px 以上が目安)、1 画面のボタンは少なく
- 色だけで区別しない(例: 赤いボタン、だけでなく「よぶ」と文字も書く)
- 外部のライブラリや、ネット上の CSS・フォントを読み込まない(LINE の中で遅くなったり、読み込めなかったりするため)
- JavaScript は書かない(必要になったら Claude 側に頼む)
- 実在の人の名前・住所・電話番号を書かない

## 自分の PC で見た目を確かめる方法

Python に付いている簡易サーバーを使います。ターミナルで、このリポジトリのフォルダから順に実行します。

```bash
cd public/liff
```

```bash
python -m http.server 8000
```

ブラウザで次の URL を開きます(最後の `?preview` が大事です)。

```text
http://localhost:8000/help-request.html?preview
```

- 上に「おためし表示中です」と出ていれば OK。「よぶ」を押すと、送ったふりをして完了画面まで進みます(本当には送られません)
- スマホの大きさで見たいときは、Chrome で右クリック →「検証」→ 左上のスマホのマークを押します
- 止めるときはターミナルで `Ctrl + C`

## Gemini への頼み方(コピーして使ってください)

最初に、このメモ全体と `help-request.html` の中身を貼ってから、次のように頼みます。

```text
あなたは HTML と CSS を書くアシスタントです。
上の「作業メモ」のルールを必ず守ってください。特に「変えてはいけないもの」の id と name/value は残してください。
JavaScript は書かないでください。外部のライブラリやフォントは読み込まないでください。

いま、help-request.html を次のデザインに合わせて書き換えたいです。
(ここにデザインの説明や、画像の説明を書く)

書き換えた help-request.html の全文を出してください。
変えたところを最後に箇条書きで教えてください。
```

Gemini が出したものは、`help-request.html` に **まるごと上書き** して保存し、上の方法で確かめます。
うまくいかないときは、ブラウザで見えている様子や、変になった部分を Gemini にそのまま伝えて直してもらいます。

## できたら

- Git に慣れていれば: 作業ブランチを作って `help-request.html` をコミットし、プルリクエストを出す
- 慣れていなければ: `help-request.html`(と画像)をチームに渡す。Claude 側で取り込みます

## 参考: 裏側の仕組み(読まなくても大丈夫)

「よぶ」を押すと、次の内容がサーバーに送られます。

```text
POST /api/help-requests
{ "userId": "LINE のユーザー ID", "amount": "little" か "normal" か "lots",
  "name"・"address"・"depth"・"tools"・"lat"・"lng" は入力欄があって空でなければ }
```

保存された依頼は、若者側の「助けに行く」画面に出ます。
