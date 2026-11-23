# 若者向けアプリ(helper-app)

雪かきに参加する若者向けの **ネイティブアプリ**(iPhone / Android)です。雪かき中に画面を閉じても、スコップ計(加速度)と位置を読み続けてサーバーに送ります。
お年寄り向けは、今までどおり LINE の中の画面(LIFF)です。サーバーと API は同じものを使います。

- 仕様(iPhone と Android の両方の元): [SPEC.md](SPEC.md)。動きを変えるときは、まずここを直してから、両方を同じに直す
- iPhone 版: `ios/`(Swift / SwiftUI。Xcode のプロジェクトは XcodeGen で `project.yml` から作る)
- Android 版: `android/`(Kotlin / Jetpack Compose。Gradle)

## iPhone 版(Mac だけ)

準備(1 回だけ): App Store から Xcode を入れる。プロジェクトを作る道具 XcodeGen を入れる。

```bash
brew install xcodegen
```

Xcode のプロジェクトを作って開く(リポジトリの一番上で。`project.yml` を変えたら、もう一度これを実行)。

```bash
cd helper-app/ios && xcodegen generate && open BibaiHelper.xcodeproj
```

Xcode で、スキーム **BibaiHelper** と、一覧にある iPhone のシミュレータを選んで ▶ を押します。

テストだけ動かす(`name=` は一覧にあるシミュレータの名前に変える)。

```bash
xcodebuild test -project BibaiHelper.xcodeproj -scheme BibaiHelper -destination 'platform=iOS Simulator,name=iPhone 18 Pro'
```

**本物の iPhone に入れるとき**: iPhone を Mac にケーブルでつなぎ、Xcode の「Signing & Capabilities」で自分の Apple ID のチームを選んで ▶。無料の Apple ID では 7 日ごとに入れ直しが必要です。

## Android 版(Mac / Windows)

準備(1 回だけ): Android Studio を入れる(Android の SDK と Java が一緒に入る)。`helper-app/android` を Android Studio で開くと、`local.properties`(SDK の場所。Git に入れない)が自動で作られます。

ビルドとテスト(`helper-app/android` のフォルダで。Windows は `./gradlew` を `gradlew.bat` に)。

```bash
./gradlew assembleDebug
```

```bash
./gradlew testDebugUnitTest
```

**本物の Android に入れるとき**: スマホの「開発者向けオプション」で USB デバッグをオンにし、ケーブルでつないで、Android Studio の ▶ か次のコマンド。

```bash
./gradlew installDebug
```

エミュレータ(パソコンの中の仮のスマホ)を使うときは、Android Studio の Device Manager で端末の「システムイメージ」を入れてから起動します(約 1.5GB のダウンロード)。

## 手元のサーバーで試す

リポジトリの一番上でサーバーを起動します(テストモード・メモリ保存)。

```bash
SUPABASE_URL= SUPABASE_SECRET_KEY= TEST_MODE=true npm start
```

- iPhone のシミュレータ: Xcode のスキームの Run → Arguments に `-BibaiApiBase` と `http://localhost:3000` の 2 行を足す
- Android のエミュレータ: 次のコマンドで入れる(エミュレータからは 10.0.2.2 が自分のパソコン)

```bash
./gradlew installDebug -PapiBase=http://10.0.2.2:3000
```

何も変えなければ、公開中のサーバー(`https://bibai-yukikaki.gba-to-web-slide.workers.dev`)につながります。

## 画面を閉じても動かす仕組み

| | iPhone | Android |
| --- | --- | --- |
| 動き続ける方法 | 位置情報を裏で使う許可(「常に」)を使い、その間アプリが動き続ける。読み上げのために音の裏での再生も使う | 通知「雪かき中: 〇杯 / 約〇kg」を出し続けるサービス(フォアグラウンドサービス) |
| スコップ計 | CoreMotion(重力を除いた加速度) | 加速度センサー(重力を除いた値) |
| 送るもの | 回数は 10 秒ごと、位置は 15 秒ごと(動いたときか 60 秒ごと) | 同じ |

## まだ確かめていないこと(実機で試す)

- 画面を閉じてポケットに入れたまま、長い時間、数える・送る・読み上げが続くか
- スコップ計のしきい値が、本物の雪かきの動きに合っているか
- 音の合言葉の高い音(17.5〜18.8kHz)がスピーカーから出て、お年寄りの LIFF が聞き取れるか
- 位置の「常に」の許可・通知の許可の流れ
