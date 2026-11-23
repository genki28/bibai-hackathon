# 若者向けアプリ(ネイティブ)の仕様

iPhone(Swift / SwiftUI)と Android(Kotlin / Jetpack Compose)で、**同じ動き** の若者向けアプリを作る。
お年寄り向けは今の LIFF のまま。サーバー(Cloudflare Workers)と API は今のものをそのまま使う(サーバーは変えない)。

**いちばんの目的: 雪かき中に画面を閉じても、スコップ計(加速度)と位置を読み続け、サーバーへ送り続けること。**

## フォルダ

| 場所 | 中身 |
| --- | --- |
| `helper-app/ios/` | iPhone アプリ。XcodeGen の `project.yml` から Xcode のプロジェクトを作る(`.xcodeproj` は Git に入れない)。ソースは `Sources/`、テストは `Tests/` |
| `helper-app/android/` | Android アプリ。Gradle(Kotlin DSL)+ Jetpack Compose。Gradle の起動の仕組み(`gradlew` と `gradle/wrapper/`)を入れる |
| `helper-app/SPEC.md` | この仕様(両方の元)。動きを変えるときは、まずここを直す |

## 共通の決まり

- **言葉**: 画面の文字・コメント・テスト名はすべて日本語。画面の文字は短く、専門用語を使わない
- **サーバーの URL**: 既定は `https://bibai-yukikaki.gba-to-web-slide.workers.dev`。設定で変えられるようにする(iOS は Info.plist の `BibaiApiBase`、Android は `BuildConfig.API_BASE`)。手元で試すときは iOS シミュレータなら `http://localhost:3000`、Android エミュレータなら `http://10.0.2.2:3000`(http を許す設定はデバッグのときだけ)
- **API の返事**: すべて `{ "success": true, "data": ... }` か `{ "success": false, "error": "日本語" }`。失敗したら `error` を画面に出す
- **色**: 紺 `#192e49`(文字・枠)、朱色 `#b73e2c`(大事なボタン)、白 `#ffffff`、水色 `#d4e0e8`、金 `#ffc94d`(演出)。角は四角め、ドット絵の雰囲気
- **アイコン**: `public/liff/icons/*.svg`(16×16 のドット絵)を使う。iPhone はアセットに SVG を入れて「Preserve Vector Data」、Android は VectorDrawable(XML)に直して入れる
- **秘密情報を書かない**。絶対パス(`/Users/〜`)を書かない
- **利用者 ID**: LINE のログインは使わない。初回に `U` + 16 進数 32 文字のランダムな ID を作って端末に保存(iOS は UserDefaults、Android は SharedPreferences)。名前も最初の画面で決めて保存
- 計算(スコップ計・筆の面積・実況のことば・音の符号)は **純粋な関数** にして、単体テストを書く(下の「元にするもの」と同じ結果になること)
- **デモ用のボタン**([🧪 揺れをまねる]・[デモ: 家に近づく])は、いつも出す(LIFF と同じく、本当に運用するときは外す)
- **確かめる端末**: iPhone は、その Mac の Xcode で一覧に出るシミュレータ(Xcode 27 では iPhone 18 Pro など)。Android はエミュレータか実機

## 画面と流れ

アプリを開いたら、まず `GET /api/help-requests/active/{userId}` で続きがあるか調べ、状態に合わせた画面へ進む(参加中で未到着 → 3、到着済みで開始前 → 4、雪かき中 → 5、終わって 1 時間以内 → 7。なければ 2)。

1. **はじめに**: 名前を入れて [はじめる]。保存してあれば飛ばす
2. **助けに行く(一覧)**: `GET /api/help-requests`。1 件ずつ「エリア(area)・雪の多さ(little=すこし / normal=ふつう / lots=たくさん。雪の結晶 1〜3 個)・参加 helperCount/capacity 人」。押すと確認 →「参加する」で `POST /api/help-requests/{id}/join { userId, displayName }` → 3 へ。下にタブ「助けに行く / ランキング」
3. **目的地**: `GET /api/help-requests/{id}?userId=`。地図(iPhone は MapKit、Android は osmdroid = 鍵の要らない地図)に家のピン「ここ」と自分「あなた」。住所・募集者の名前・雪の多さ・道具
   - **位置の共有はいつもオン**: 開いたら位置の許可を求め、`POST /api/help-requests/{id}/location { userId, lat, lng, accuracy }` を 15 秒ごと(前に送った位置から 10m 以上動いたか、60 秒たったとき)。**画面を閉じても送り続ける**(下の「裏で動かす」)
   - [デモ: 家に近づく]: 押すたびに「家から南西へ約 1km(緯度 -0.006・経度 -0.008)」から家へ 150m ずつ近づいた位置を、自分の位置として送る(押したら本物の位置は使わない)
   - [参加をやめる](`POST .../leave`)→ 2 へ。[到着しました] → 3' へ
   - 3'. **到着(音の合言葉)**: 「お年寄りのスマホに近づけてね」「雪かきするエリアを確認してください」。`GET /api/help-requests/{id}/arrival-code?userId=` の 4 桁を、下の「音の合言葉」で 3 分くり返し鳴らす。3 秒ごとに詳細を読み、自分の `arrivedAt` が入ったら 4 へ。[聞こえる音にする](高い音 ⇄ 聞こえる音)、[スキップして到着](`POST .../arrive`)→ 4 へ
4. **集合**: 参加者の名前と、着いた人の数「〇/〇人集合」。3 秒ごとに読み直す。[雪かきを始める](`POST .../start`)。状態が `working` になったら 5 へ
5. **雪かき中**: 経過時間(`startedAt` から)・リーダー(`leaderUserId`。自分なら「あなたがリーダー(終わったら範囲を記録)」)・「みんなで動かした雪 約〇kg(〇杯)」とたとえ
   - **スコップ計はいつもオン**。画面を閉じても数え続ける(下の「裏で動かす」)。10 秒ごとと、終えるときに `POST .../scoops { userId, count }`
   - **音の実況**: すくうたびに「ザクッ」(短い雑音)、節目は読み上げ(iPhone は AVSpeechSynthesizer、Android は TextToSpeech。日本語)。**画面を閉じていても鳴らす**。[音の実況: オン / オフ]
   - [🧪 揺れをまねる]: 1 回すくったことにする
   - [雪かきを終える]: リーダー(か、`leaderUserId` がない)なら 6 へ。ほかの人は「〇〇さんが範囲を記録中…」で 3 秒ごとに読み直し、`done` になったら 7 へ
   - (できれば)雪かき中のドット絵: `public/liff/images/working-bg.png`(背景)と `working-hero.png`(主人公の 4 コマ、1 コマ 271×247)。参加者の人数ぶん並べ、すくうたびに自分が雪を投げる
6. **範囲を記録**: 地図の上を **指でなぞって筆で塗る**(細い 1.5m / 太い 4m、[地図を動かす] / [筆で塗る] の切り替え、[1 つ戻す] [やり直す])。面積は下の「筆の面積」。5,000 ㎡ まで。[雪かきを完了する](`POST .../finish { userId, areaM2 }`)→ 7 へ
7. **お疲れ様**: `GET /api/help-requests/{id}/points?userId=`。「CLEAR」、獲得ポイントを派手に(数字が回ってから止まる・花火・ファンファーレ)、内訳(雪かき・評価・再会・初回ボーナス)、スコップの回数(自分・みんな)。[ランキングへ] [助けに行く]
8. **ランキング**: `GET /api/ranking?period=daily|total&userId=`。今日 / これまでの切り替え、順位・名前・ポイント、自分の行は目立たせる

本人確認(顔の照合)はアプリでは作らない(LIFF の機能として残す)。

## 裏で動かす(いちばん大事)

| | iPhone | Android |
| --- | --- | --- |
| 動き続ける仕組み | 位置情報の裏での利用(Info.plist の `UIBackgroundModes` に `location` と、読み上げのための `audio`)。`CLLocationManager.allowsBackgroundLocationUpdates = true`、`pausesLocationUpdatesAutomatically = false`、`showsBackgroundLocationIndicator = true`。位置の許可は「常に」を求める | フォアグラウンドサービス(通知「雪かき中: 〇杯 / 約〇kg」を出し続ける。`foregroundServiceType="location"`)。Android 13 以上は通知の許可、Android 14 以上は `FOREGROUND_SERVICE_LOCATION` の権限 |
| 加速度 | `CMMotionManager` の `deviceMotion.userAcceleration`(重力を除いた値。単位が G なので 9.81 を掛けて m/s²)、1 秒 50 回 | `SensorManager` の `TYPE_LINEAR_ACCELERATION`(なければ `TYPE_ACCELEROMETER` と下の重力の推定)。サービスの中で読む |
| 位置 | `CLLocationManager`(標準の位置の更新) | `LocationManager`(Google Play 開発者サービスに頼らない) |
| 送信 | 裏にいる間も `URLSession` で送る | サービスの中で送る(`HttpURLConnection` か OkHttp) |
| 始める / 止める | 3 に入ったら位置、5 に入ったらスコップ計。7 に進んだら・参加をやめたら止める | 同じ |
| 位置の許可がないとき | スコップ計だけ数える(画面を閉じると止まる) | Android 14 以上はサービスの種類を health(センサー)にして、スコップ計だけは裏で続ける(`FOREGROUND_SERVICE_HEALTH`・`HIGH_SAMPLING_RATE_SENSORS`) |
| 到着したあと | 位置は送らないが、読み続ける(読むのをやめると、画面を閉じたときにアプリが止まるため。電池は多めに使う) | サービスが動いている間は同じ |

回数は端末にも保存して(依頼 ID ごと)、アプリを閉じて開き直しても続きから数える。

## 元にするもの(Web の実装。同じ結果にする)

| 機能 | Web の実装 | テスト |
| --- | --- | --- |
| スコップ計の数え方(しきい値 6 / 3 m/s²、0.7 秒あけ、5 サンプルの平均、重力の推定、1 秒途切れたらやり直し、1 杯 3.5kg) | `public/liff/scoop-counter.js` | `tests/scoop-counter.test.ts` |
| みんなで動かした雪と実況のことば(たとえ: 100 / 300 / 700 / 1500kg、みんなで 50 杯ごと、自分の 10 杯ごと、優先の順) | `public/liff/snow-moved.js` | `tests/snow-moved.test.ts` |
| 筆の面積(家からの m 座標、50cm のマス目、重ね塗りしない) | `public/liff/brush-area-core.js` | `tests/brush-area-core.test.ts` |
| 音の合言葉(合図 S + 4 桁、1 記号 140ms、休み 300ms、高い音 17,500 + 数字 × 120Hz・合図 18,800Hz、聞こえる音 1,000 + 数字 × 180Hz・合図 2,900Hz、音量 0.9 / 0.25、8ms のなめらかな立ち上がり) | `public/liff/sound-code.js`、`public/liff/sound-checkin.js` の `playCode` | `tests/sound-code.test.ts` |
| 位置を送る間隔・デモの近づき方 | `public/liff/location-share.js`、`public/liff/eta.js` の `stepToward` | `tests/eta.test.ts` |
| 画面の文言・流れ | `public/liff/` の `go-help`、`helper-place`、`helper-sound-code`、`helper-gather`、`helper-working`、`snow-area`、`finish`、`ranking` | — |
| API の細かい決まり | `src/help-requests/routes.ts`、`src/help-requests/views.ts`、`docs/features/pages.md` の「API の一覧」 | `tests/*api*.test.ts` |
