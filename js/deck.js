// カードの組と、問題の選び方（画面に依存しない純粋な処理）

import { MULTIPLIER_MIN, MULTIPLIER_MAX } from './config.js';

/** @typedef {{id: string, a: number, b: number, product: number}} Card */

/** a×b のカードを作る */
export function makeCard(a, b) {
  return { id: `${a}x${b}`, a, b, product: a * b };
}

/** 選んだ段のカードをすべて作る（3の段 → 3×1〜3×9） */
export function createCards(dans) {
  const uniqueDans = [...new Set(dans)].sort((x, y) => x - y);
  const cards = [];
  for (const a of uniqueDans) {
    for (let b = MULTIPLIER_MIN; b <= MULTIPLIER_MAX; b += 1) {
      cards.push(makeCard(a, b));
    }
  }
  return cards;
}

/** 元の配列を変えずに並べかえる（フィッシャー–イェーツ） */
export function shuffle(list, rng) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickRandom(list, rng) {
  if (list.length === 0) return null;
  return list[Math.floor(rng() * list.length)];
}

/**
 * 山札。尽きたら全カードを切り直して補う。
 * exclude に入っているカード（場に出ているもの）は引かない。
 */
export function createDrawPile(cards, rng) {
  let queue = [];
  return {
    draw(excludeIds = new Set()) {
      for (let refills = 0; refills < 2; refills += 1) {
        while (queue.length > 0) {
          const card = queue.shift();
          if (!excludeIds.has(card.id)) return card;
        }
        queue = shuffle(cards, rng);
      }
      return null; // 全カードが除外されている
    },
  };
}

/** 場を指定枚数まで埋める（埋められない時はそこまで） */
export function refillField(field, pile, size) {
  const next = [...field];
  while (next.length < size) {
    const card = pile.draw(new Set(next.map((c) => c.id)));
    if (!card) break;
    next.push(card);
  }
  return next;
}

/** 答えが product になる a×b（1〜9 の九九の範囲）をすべて返す */
export function expressionsFor(product) {
  const list = [];
  for (let a = MULTIPLIER_MIN; a <= MULTIPLIER_MAX; a += 1) {
    for (let b = MULTIPLIER_MIN; b <= MULTIPLIER_MAX; b += 1) {
      if (a * b === product) list.push(makeCard(a, b));
    }
  }
  return list;
}

/** カードとり1: 場にある答えから数を一つ選ぶ */
export function pickNumberTarget(field, rng) {
  const card = pickRandom(field, rng);
  if (!card) return null;
  return { kind: 'number', product: card.product, label: String(card.product) };
}

/**
 * カードとり2: 場のカードと答えが同じで、場に無い別の式を選ぶ。
 * 1×1・5×5 のように相方の式が無いものは選ばない。
 */
export function pickSameTarget(field, rng) {
  const fieldIds = new Set(field.map((c) => c.id));
  const candidates = [];
  for (const card of field) {
    for (const expr of expressionsFor(card.product)) {
      if (!fieldIds.has(expr.id)) candidates.push(expr);
    }
  }
  const expr = pickRandom(candidates, rng);
  if (!expr) return null;
  return { kind: 'expr', product: expr.product, a: expr.a, b: expr.b, label: `${expr.a}×${expr.b}` };
}

/** その問題の正解カードかどうか（答えが同じなら、どの式でも正解） */
export function isMatch(target, card) {
  return target !== null && card.product === target.product;
}

/** 大きさくらべの判定 */
export function judgeCompare(left, right) {
  if (left.product > right.product) return 'left';
  if (left.product < right.product) return 'right';
  return 'same';
}
