/**
 * kuku-judge.js
 * 音声認識の結果（文字）が、九九の式に合っているかを判定する。
 * 認識結果は「ににんがし」「2×2=4」「二二が四」などばらばらに返るため、
 * 読み方の一致 → 数字の並びの一致 → 答えの数だけの一致、の順に照らす。
 */
(function (global) {
  'use strict';

  const KANJI_DIGITS = Object.freeze({
    '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  });
  const KANJI_TEN = '十';
  const NUMBER_TOKEN_PATTERN = /[0-9]+|[〇零一二三四五六七八九十]+/g;
  // 「三四十二」は 3,42 とも 3,4,12 とも読めるため、二通りの分け方を試す
  const KANJI_SPLIT_PATTERNS = Object.freeze([
    /[一二三四五六七八九]?十[一二三四五六七八九]?|[〇零一二三四五六七八九]/g,
    /十[一二三四五六七八九]?|[〇零一二三四五六七八九]/g,
  ]);
  const IGNORED_CHARS_PATTERN = /[\s、。・,.!?！？「」]/g;

  const RULES = Object.freeze({
    READING: 'reading',
    NUMBERS: 'numbers',
    NUMBERS_MERGED: 'numbers-merged',
    PRODUCT_LAST: 'product-last',
    NONE: 'none',
  });

  const RULE_LABELS = Object.freeze({
    [RULES.READING]: '読み方が一致',
    [RULES.NUMBERS]: '数字の並びが一致',
    [RULES.NUMBERS_MERGED]: '数字の並びが一致（段とかける数がくっついた形）',
    [RULES.PRODUCT_LAST]: '答えの数だけ一致（ゆるい判定）',
    [RULES.NONE]: '一致なし',
  });

  function toHalfWidthDigits(text) {
    return text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  }

  function katakanaToHiragana(text) {
    return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }

  /** 比べやすい形にそろえる（全角数字→半角、カタカナ→ひらがな、空白・記号を除く）。 */
  function normalizeText(text) {
    return katakanaToHiragana(toHalfWidthDigits(String(text || ''))).replace(IGNORED_CHARS_PATTERN, '');
  }

  /** 漢数字の一かたまり（99まで）を数にする。「二十四」→24、「十二」→12、「八」→8。 */
  function parseKanjiNumber(token) {
    const tenIndex = token.indexOf(KANJI_TEN);
    if (tenIndex === -1) return KANJI_DIGITS[token];
    const tens = tenIndex === 0 ? 1 : KANJI_DIGITS[token[0]];
    const ones = tenIndex === token.length - 1 ? 0 : KANJI_DIGITS[token[token.length - 1]];
    return tens * 10 + ones;
  }

  /** 漢数字の並びを数ごとに分ける。「九九八十一」→[9, 9, 81]、「二二が四」→[2, 2]。 */
  function splitKanjiNumbers(token, pattern) {
    return (token.match(pattern) || []).map(parseKanjiNumber);
  }

  /** 文字の中の数（算用数字・漢数字）を、分け方ごとに取り出す。重複は除く。 */
  function extractNumberCandidates(text) {
    const tokens = normalizeText(text).match(NUMBER_TOKEN_PATTERN) || [];
    const lists = KANJI_SPLIT_PATTERNS.map((pattern) => tokens.flatMap((token) => (
      /^[0-9]+$/.test(token) ? [Number(token)] : splitKanjiNumbers(token, pattern)
    )));
    const seen = new Set();
    return lists.filter((list) => {
      const key = list.join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** 文字の中の数を順に取り出す（一つ目の分け方）。 */
  function extractNumbers(text) {
    return extractNumberCandidates(text)[0];
  }

  function hasSequence(numbers, sequence) {
    for (let i = 0; i + sequence.length <= numbers.length; i += 1) {
      if (sequence.every((value, offset) => numbers[i + offset] === value)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 一つの認識結果を判定する。
   * @returns {{ok:boolean, rule:string, numbers:number[], text:string}}
   */
  function judge(transcript, a, b, expectedReading) {
    const text = normalizeText(transcript);
    const candidates = extractNumberCandidates(transcript);
    const result = (ok, rule, numbers) => ({ ok, rule, numbers: numbers || candidates[0], text });

    if (!text) return result(false, RULES.NONE);
    if (expectedReading && text.includes(normalizeText(expectedReading))) {
      return result(true, RULES.READING);
    }
    // 強い判定から順に、すべての分け方で照らす
    for (const rule of [RULES.NUMBERS, RULES.NUMBERS_MERGED, RULES.PRODUCT_LAST]) {
      const matched = candidates.find((numbers) => matchesNumberRule(rule, numbers, a, b));
      if (matched) return result(true, rule, matched);
    }
    return result(false, RULES.NONE);
  }

  function matchesNumberRule(rule, numbers, a, b) {
    const product = a * b;
    if (rule === RULES.NUMBERS) return hasSequence(numbers, [a, b, product]);
    if (rule === RULES.NUMBERS_MERGED) return hasSequence(numbers, [Number(`${a}${b}`), product]);
    if (numbers.length === 0) return false;
    const last = numbers[numbers.length - 1];
    const prev = numbers[numbers.length - 2];
    const lastTwoJoined = numbers.length >= 2 && last < 10 && prev < 10 ? Number(`${prev}${last}`) : null;
    return last === product || lastTwoJoined === product;
  }

  /** 候補のうち一つでも合えばそれを返す。どれも合わなければ一番目の候補の判定を返す。 */
  function judgeAlternatives(transcripts, a, b, expectedReading) {
    let firstResult = null;
    for (const transcript of transcripts) {
      const r = judge(transcript, a, b, expectedReading);
      if (r.ok) return r;
      if (!firstResult) firstResult = r;
    }
    return firstResult || { ok: false, rule: RULES.NONE, numbers: [], text: '' };
  }

  global.KukuJudge = Object.freeze({
    RULES,
    RULE_LABELS,
    normalizeText,
    extractNumbers,
    judge,
    judgeAlternatives,
  });
})(window);
