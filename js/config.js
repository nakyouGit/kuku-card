// くくの カードゲーム — 設定値（ここだけを直せば遊び方の調整ができる）

export const GAME_TITLE = 'くくの カードゲーム';

/** かけられる数の範囲（○の段 × 1〜9） */
export const MULTIPLIER_MIN = 1;
export const MULTIPLIER_MAX = 9;

/** 選べる段（1〜9の段。どれでも自由に組み合わせられる） */
export const ALL_DANS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** はじめに選ばれている段（習った段に合わせて変える） */
export const DEFAULT_DANS = [2, 3, 4, 5];

/** カードとり2は、答えが同じ別の式を作るために、2つ以上の段が要る */
export const TAKE_SAME_MIN_DANS = 2;

/** カードとりで場に並べる枚数 */
export const FIELD_SIZE = 12;

/** 1回のゲームのもんだい数の選択肢 */
export const ROUND_OPTIONS = [5, 10, 15];

/** 遊び方 */
export const MODES = {
  compare: {
    label: '大きさくらべ',
    rule: 'こたえが 大きい ほうの カードを はやく タッチ！ おなじなら「おなじ」。',
  },
  'take-number': {
    label: 'カードとり 1',
    rule: 'こたえが その 数に なる カードを はやく とろう！',
  },
  'take-same': {
    label: 'カードとり 2',
    rule: 'こたえが おなじに なる カードを はやく とろう！',
  },
};

/** コンピューターの強さ（考える時間の幅と、お手つきの割合） */
export const CPU_LEVELS = {
  weak: { label: 'よわい', minDelayMs: 4000, maxDelayMs: 6500, mistakeRate: 0.2 },
  normal: { label: 'ふつう', minDelayMs: 2500, maxDelayMs: 4000, mistakeRate: 0.1 },
  strong: { label: 'つよい', minDelayMs: 1400, maxDelayMs: 2400, mistakeRate: 0.04 },
};

/** 進行のタイミング（ミリ秒） */
export const TIMING = {
  readyMs: 900, // 「よーい」の表示
  resultMs: 1400, // 1問の結果を見せる時間
  roundTimeoutMs: 15000, // だれも取れなかった時に次へ進むまで
};

/** 大きさくらべで、1問に取れるカードの枚数（2枚とも） */
export const COMPARE_CARDS_PER_ROUND = 2;

export const DEFAULT_SETTINGS = {
  mode: 'take-number',
  dans: [...DEFAULT_DANS],
  level: 'normal',
  rounds: 10,
};

export const STORAGE_KEY = 'kukuCard.settings.v1';

/**
 * 先生が止められるようにするための窓口（九九クエストのガス。ウェブアプリの公開用の住所）。
 * 住所は秘密ではない。止める操作は、管理者のパスワードで守られている。
 * ガスを作り直した時は、ここだけを差し替える。
 */
export const STOP_API_URL =
  'https://script.google.com/macros/s/AKfycbx6cF50o3KLf3YaDk7tmP1WD0mlyxtIzbwJpbjI7VJmurAGVNQnPhbSBapac-wxf2CHXw/exec';

/** 止まっているかを見に行く間隔と、1回の待ち時間（ミリ秒） */
export const STOP_POLL_MS = 20000;
export const STOP_REQUEST_TIMEOUT_MS = 6000;
/** 「はじめる」を押した時に、状態の確認を待つ長さ。遅い時は、分かっている状態で進める */
export const START_CHECK_WAIT_MS = 1500;

/** 管理者ページ */
export const ADMIN_ID = 'admin';
export const ADMIN_MESSAGE_MAX_CHARS = 60;
export const ADMIN_TOKEN_STORAGE_KEY = 'kukuCard.adminToken.v1';
