// ひな形ページ共通の処理。各ページで <script type="module" src="./template.js"></script> と読み込む。
// - LINE(LIFF)の準備をする(「メニューを最初に戻す」ボタンが使えるように)
// - 「メニューを最初に戻す」ボタンを出す
// ページごとの動きが必要になったら、そのページ用の .js を別に作る。

import { resolveProfile } from "./common.js";
import "./reset-menu-button.js";

/** この画面を開いている人のユーザー ID(LINE の外では仮の ID)。ページ用の .js から使える。 */
export const profilePromise = resolveProfile();
export const userIdPromise = profilePromise.then((profile) => profile.userId);
userIdPromise.catch((error) => console.error(error));
