// ひな形ページ共通の処理。各ページで <script type="module" src="./template.js"></script> と読み込む。
// - LINE(LIFF)の準備をする(「メニューを最初に戻す」ボタンが使えるように)
// - 「メニューを最初に戻す」ボタンを出す
// - 読み込み中の覆い(loading.js)と、テスト用の利用者の切り替え(test-mode.js)を用意する
// ページごとの動きが必要になったら、そのページ用の .js を別に作る。
// 各ページの .js は、最初の表示がそろったら pageReady() を呼ぶこと(loading.js)。

import "./loading.js";
import { resolveProfile } from "./common.js";
import "./reset-menu-button.js";
import "./test-mode.js";

/** この画面を開いている人のユーザー ID(LINE の外では仮の ID)。ページ用の .js から使える。 */
export const profilePromise = resolveProfile();
export const userIdPromise = profilePromise.then((profile) => profile.userId);
userIdPromise.catch((error) => console.error(error));
