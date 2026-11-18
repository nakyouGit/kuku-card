/**
 * game-config.js
 * 九九検定ゲームの設定値。数値の調整はこのファイルだけで行う。
 */
(function (global) {
  'use strict';

  global.KukuGameConfig = Object.freeze({
    LANG: 'ja-JP',

    // 1秒の判定（2026-11-19 のマイクテストのログで決めた）
    LIMIT_SEC: 1.0,                     // 式が出てから言い始めるまで
    TIMING_GRACE_SEC: 0.1,              // 音の検出のずれを見込んだ猶予
    INTERIM_LAG_SEC: 0.55,              // 音の検出が届かない時、最初の文字の時刻から引く遅れ

    // 進み方
    START_COUNTDOWN_SEC: 3,
    MIC_WARMUP_MS: 500,                 // マイクを開き直してから式を出すまで
    QUESTION_TIMEOUT_SEC: 4.0,          // 1問を打ち切るまで
    SETTLE_AFTER_LAST_INTERIM_SEC: 1.0, // 確定が来ない時、文字が止まってから待つ秒数
    CHECK_INTERVAL_MS: 100,
    FEEDBACK_GOOD_MS: 700,              // ○ を見せる時間
    FEEDBACK_MISS_MS: 1800,             // △・× と正しい読み方を見せる時間
    REOPEN_EACH_QUESTION: true,         // 1問ごとにマイクを開き直す（音の検出で正しく測れる）
    REOPEN_MIN_AGE_MS: 5000,            // 開いたばかりのマイク（カウントダウン中に開いたもの）は開き直さない
    REOPEN_FAILURE_WINDOW_MS: 4000,     // 開き直してからこの間に止まったら、開き直しが原因とみなす
    NO_REOPEN_STORAGE_KEY: 'kukuKentei.noReopen.v1', // 開き直せない端末の印（iPad など）
    MAX_ALTERNATIVES: 5,

    // 読みがなの辞書
    DICT_PATH: 'vendor/kuromoji/dict/',
    SERVICE_WORKER_PATH: 'sw.js',
    SERVICE_WORKER_WAIT_MS: 3000,

    // 記録
    RECORDS_STORAGE_KEY: 'kukuKentei.records.v1',
    SETTINGS_STORAGE_KEY: 'kukuKentei.settings.v1',

    // 先生が止める（見張りは game-stop.js。間隔と通信の待ち時間は js/config.js）
    START_STOP_CHECK_WAIT_MS: 1500,     // スタートを押した時に、止まっているかの確認を待つ長さ

    // はじめの設定
    DEFAULT_DAN: 2,
    DEFAULT_MODE: 'order',
    MODES: Object.freeze([
      Object.freeze({ id: 'order', label: 'じゅんばんどおり' }),
      Object.freeze({ id: 'reverse', label: 'ぎゃく' }),
      Object.freeze({ id: 'random', label: 'ランダム' }),
    ]),
  });
})(window);
