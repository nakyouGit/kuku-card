// カードの組と、問題の選び方（画面に依存しない純粋な処理）

import { MULTIPLIER_MIN, MULTIPLIER_MAX, ALL_DANS } from './config.js';

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

/** 答えが product になる a×b をすべて返す（a は扱う段、b は 1〜9） */
export function expressionsFor(product, dans = ALL_DANS) {
  const list = [];
  for (const a of dans) {
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

/**
 * カードとり2で場から問題が作れない時（相方がみな場にそろっている等）、
 * 場のカードを1枚入れ替えて問題が作れる形にする。
 * @param {Card[]} field 今の場
 * @param {Card[]} gameCards このゲームで使うカード（選んだ段）
 * @returns {{field: Card[], target: object} | null}
 */
export function forceSameTarget(field, gameCards, rng) {
  if (field.length === 0) return null;
  const fieldIds = new Set(field.map((c) => c.id));
  const options = [];
  for (const expr of allExpressions()) {
    if (fieldIds.has(expr.id)) continue;
    for (const partner of gameCards) {
      if (partner.product === expr.product && partner.id !== expr.id && !fieldIds.has(partner.id)) {
        options.push({ expr, partner });
      }
    }
  }
  const pick = pickRandom(options, rng);
  if (!pick) return null;
  const replaceIndex = Math.floor(rng() * field.length);
  const nextField = field.map((card, i) => (i === replaceIndex ? pick.partner : card));
  const { expr } = pick;
  return {
    field: nextField,
    target: { kind: 'expr', product: expr.product, a: expr.a, b: expr.b, label: `${expr.a}×${expr.b}` },
  };
}

/** 扱う段のすべての式 */
function allExpressions() {
  const list = [];
  for (const a of ALL_DANS) {
    for (let b = MULTIPLIER_MIN; b <= MULTIPLIER_MAX; b += 1) list.push(makeCard(a, b));
  }
  return list;
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
