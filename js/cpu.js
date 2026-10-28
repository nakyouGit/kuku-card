// コンピューターの手の決め方（画面とタイマーに依存しない）

import { pickRandom } from './deck.js';

/**
 * 1問ぶんの手を決める。
 * @param {{minDelayMs:number,maxDelayMs:number,mistakeRate:number}} level
 * @param {Array} correctChoices 正解の選択肢
 * @param {Array} wrongChoices まちがいの選択肢
 * @param {() => number} rng
 * @returns {{delayMs:number, choice:any, isMistake:boolean} | null}
 */
export function planCpuMove(level, correctChoices, wrongChoices, rng) {
  const delayMs = Math.round(level.minDelayMs + rng() * (level.maxDelayMs - level.minDelayMs));
  const canMistake = wrongChoices.length > 0;
  const isMistake = canMistake && (correctChoices.length === 0 || rng() < level.mistakeRate);
  const pool = isMistake ? wrongChoices : correctChoices;
  const choice = pickRandom(pool, rng);
  if (choice === null) return null;
  return { delayMs, choice, isMistake };
}
