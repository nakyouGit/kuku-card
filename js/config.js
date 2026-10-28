// くくの カードゲーム — 設定値（ここだけを直せば遊び方の調整ができる）

export const GAME_TITLE = 'くくの カードゲーム';

/** かけられる数の範囲（○の段 × 1〜9） */
export const MULTIPLIER_MIN = 1;
export const MULTIPLIER_MAX = 9;

/** 選べる段（1〜9の段） */
export const ALL_DANS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

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
  dans: [...ALL_DANS],
  level: 'normal',
  rounds: 10,
};

export const STORAGE_KEY = 'kukuCard.settings.v1';
