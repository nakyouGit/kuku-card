/**
 * game-questions.js
 * 段とモードから、出す問題の並びを作る。
 */
(function (global) {
  'use strict';

  const MODE_IDS = Object.freeze({ ORDER: 'order', REVERSE: 'reverse', RANDOM: 'random' });

  function makeQuestion(a, b) {
    return Object.freeze({ a, b, product: a * b, reading: global.KukuReadings.getReading(a, b) });
  }

  function shuffle(list, random) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /**
   * @param {number} dan 1〜9
   * @param {string} mode order | reverse | random
   * @param {() => number} [random] 試験用に差し替えられる乱数
   */
  function buildQuestions(dan, mode, random = Math.random) {
    if (!global.KukuReadings.isValidNumber(dan)) throw new RangeError(`段が範囲外です: ${dan}`);
    const multipliers = [];
    for (let b = global.KukuReadings.MIN_NUMBER; b <= global.KukuReadings.MAX_NUMBER; b += 1) multipliers.push(b);

    let ordered;
    if (mode === MODE_IDS.ORDER) ordered = multipliers;
    else if (mode === MODE_IDS.REVERSE) ordered = multipliers.slice().reverse();
    else if (mode === MODE_IDS.RANDOM) ordered = shuffle(multipliers, random);
    else throw new RangeError(`モードが不明です: ${mode}`);

    return ordered.map((b) => makeQuestion(dan, b));
  }

  global.KukuGameQuestions = Object.freeze({ MODE_IDS, buildQuestions });
})(window);
