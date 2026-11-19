/**
 * game-config.js
 * 九九けんてい（フラッシュ）の設定値。数値の調整はこのファイルだけで行う。
 * 2026-11-19 庸平の指示: iPad で音声入力が動かなかったため、声の判定をやめ、式を1秒ずつフラッシュで出す形にした。
 */
(function (global) {
  'use strict';

  global.KukuGameConfig = Object.freeze({
    FLASH_SEC: 1.0,            // 1つの式を出しておく時間
    FLASH_GAP_MS: 150,         // 式と式のあいだの空白（同じ見た目が続いても切り替わりが分かるように）
    START_COUNTDOWN_SEC: 3,

    // 先生が止める（見張りは game-stop.js。間隔と通信の待ち時間は js/config.js）
    START_STOP_CHECK_WAIT_MS: 1500, // スタートを押した時に、止まっているかの確認を待つ長さ

    SETTINGS_STORAGE_KEY: 'kukuKentei.settings.v1',
    DEFAULT_DAN: 2,
    DEFAULT_MODE: 'order',
    MODES: Object.freeze([
      Object.freeze({ id: 'order', label: 'じゅんばんどおり' }),
      Object.freeze({ id: 'reverse', label: 'ぎゃく' }),
      Object.freeze({ id: 'random', label: 'ランダム' }),
    ]),
  });
})(window);
