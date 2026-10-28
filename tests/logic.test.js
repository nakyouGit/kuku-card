import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCards, createDrawPile, refillField, expressionsFor,
  pickNumberTarget, pickSameTarget, forceSameTarget, isMatch, judgeCompare, makeCard,
} from '../js/deck.js';
import { planCpuMove } from '../js/cpu.js';
import { createRace } from '../js/race.js';
import { normalizeSettings, getSettingsProblem } from '../js/settings.js';
import { createTakeMode } from '../js/mode-take.js';
import { createCompareMode } from '../js/mode-compare.js';
import { CPU_LEVELS, FIELD_SIZE } from '../js/config.js';

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** 偽のタイマー（時間を手で進める） */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const queue = new Map();
  return {
    setTimeout(fn, ms) { const id = ++seq; queue.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { queue.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of queue) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        queue.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
    pending: () => queue.size,
  };
}

/** 呼ばれた内容を記録するだけの画面 */
function fakeView() {
  const calls = [];
  const view = new Proxy({}, {
    get(_, name) {
      return (...args) => { calls.push([name, ...args]); };
    },
  });
  return { view, calls };
}

test('カードは段ごとに9枚', () => {
  const cards = createCards([3, 2, 3]);
  assert.equal(cards.length, 18);
  assert.equal(cards[0].id, '2x1');
  assert.equal(cards.at(-1).product, 27);
});

test('山札は場にあるカードを引かず、尽きても補われる', () => {
  const cards = createCards([2]);
  const pile = createDrawPile(cards, seeded(3));
  const field = refillField([], pile, FIELD_SIZE);
  assert.equal(field.length, 9, '9枚しかない時は9枚まで');
  assert.equal(new Set(field.map((c) => c.id)).size, 9);
  assert.equal(pile.draw(new Set(field.map((c) => c.id))), null, '全部場にある時は引けない');
  for (let i = 0; i < 40; i += 1) assert.ok(pile.draw());
});

test('答えが同じ式の一覧', () => {
  const DANS_2_5 = [2, 3, 4, 5];
  const DANS_1_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.deepEqual(expressionsFor(12, DANS_2_5).map((c) => c.id).sort(), ['2x6', '3x4', '4x3']);
  assert.deepEqual(expressionsFor(12, DANS_1_9).map((c) => c.id).sort(), ['2x6', '3x4', '4x3', '6x2']);
  assert.deepEqual(expressionsFor(25, DANS_2_5).map((c) => c.id), ['5x5']);
  assert.deepEqual(expressionsFor(11, DANS_1_9), []);
  assert.deepEqual(expressionsFor(14, DANS_2_5).map((c) => c.id), ['2x7'], '選んでいない7の段は出さない');
  assert.deepEqual(expressionsFor(14, DANS_1_9).map((c) => c.id).sort(), ['2x7', '7x2']);
  assert.deepEqual(expressionsFor(9, [1]).map((c) => c.id), ['1x9']);
});

test('カードとり1の問題は必ず場に正解がある', () => {
  const rng = seeded(7);
  const pile = createDrawPile(createCards([2, 3, 4, 5]), rng);
  for (let i = 0; i < 200; i += 1) {
    const field = refillField([], pile, FIELD_SIZE);
    const t = pickNumberTarget(field, rng);
    assert.ok(field.some((c) => isMatch(t, c)));
  }
});

test('カードとり2の問題は場に無い式で、場に正解がある', () => {
  const rng = seeded(11);
  for (const dans of [[2], [3], [5], [2, 3, 4, 5], [1, 2], [6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8, 9]]) {
    const pile = createDrawPile(createCards(dans), rng);
    for (let i = 0; i < 100; i += 1) {
      const field = refillField([], pile, FIELD_SIZE);
      const t = pickSameTarget(field, rng, dans);
      if (!t) continue;
      assert.ok(!field.some((c) => c.a === t.a && c.b === t.b), '同じ式は場に無い');
      assert.ok(field.some((c) => isMatch(t, c)), '正解が場にある');
      assert.ok(dans.includes(t.a), '出す式は選んだ段だけ');
    }
  }
});

test('相方の無い式だけの場では、カードとり2の問題を作らない', () => {
  const field = [makeCard(1, 1), makeCard(5, 5), makeCard(7, 7)];
  assert.equal(pickSameTarget(field, seeded(1), [1, 5, 7]), null);
});

test('大きさくらべの判定', () => {
  assert.equal(judgeCompare(makeCard(3, 7), makeCard(2, 9)), 'left');
  assert.equal(judgeCompare(makeCard(2, 6), makeCard(3, 4)), 'same');
  assert.equal(judgeCompare(makeCard(1, 1), makeCard(9, 9)), 'right');
});

test('コンピューターの手は強さの時間幅に収まる', () => {
  const rng = seeded(5);
  for (const level of Object.values(CPU_LEVELS)) {
    for (let i = 0; i < 100; i += 1) {
      const move = planCpuMove(level, ['ok'], ['ng1', 'ng2'], rng);
      assert.ok(move.delayMs >= level.minDelayMs && move.delayMs <= level.maxDelayMs);
      assert.equal(move.isMistake, move.choice !== 'ok');
    }
  }
  const noWrong = planCpuMove({ minDelayMs: 1, maxDelayMs: 2, mistakeRate: 1 }, ['ok'], [], rng);
  assert.equal(noWrong.choice, 'ok', 'まちがえる先が無ければ正解する');
});

test('早取り: 先に正解した方が勝ち、後からは無視', () => {
  const timers = fakeTimers();
  const results = [];
  const race = createRace({ timeoutMs: 10000, timers, onResolve: (r) => results.push(r) });
  race.scheduleCpu({ delayMs: 2000, choice: 'x' }, () => true);
  timers.advance(1000);
  assert.equal(race.player(true, 'p'), 'won');
  timers.advance(5000);
  assert.equal(results.length, 1);
  assert.equal(results[0].winner, 'player');
  assert.equal(timers.pending(), 0, 'タイマーは残らない');
});

test('早取り: お手つきはその問題だけ休み、両方お手つきで流れる', () => {
  const timers = fakeTimers();
  const results = [];
  const misses = [];
  const race = createRace({ timeoutMs: 10000, timers, onResolve: (r) => results.push(r), onMiss: (w) => misses.push(w) });
  race.scheduleCpu({ delayMs: 3000, choice: 'bad' }, () => false);
  assert.equal(race.player(false, 'p'), 'missed');
  assert.equal(race.player(true, 'p'), 'ignored', '休み中は取れない');
  timers.advance(3000);
  assert.deepEqual(misses, ['player', 'cpu']);
  assert.equal(results[0].winner, 'none');
  assert.equal(results[0].reason, 'both-missed');
});

test('早取り: だれも取らなければ時間切れ', () => {
  const timers = fakeTimers();
  const results = [];
  createRace({ timeoutMs: 5000, timers, onResolve: (r) => results.push(r) });
  timers.advance(5000);
  assert.equal(results[0].reason, 'timeout');
});

test('設定の検証', () => {
  const s = normalizeSettings({ mode: 'xx', dans: [0, 3, 3, 12], level: 'super', rounds: 7 });
  assert.equal(s.mode, 'take-number');
  assert.deepEqual(s.dans, [3]);
  assert.equal(s.level, 'normal');
  assert.equal(s.rounds, 10);
  assert.deepEqual(normalizeSettings({ dans: [] }).dans, [2, 3, 4, 5]);
  assert.deepEqual(normalizeSettings({ dans: ['3', 4] }).dans, [4], '文字の数は落とす');
  assert.deepEqual(normalizeSettings({ dans: [1, 2, 9] }).dans, [1, 2, 9], '1〜9の段は選べる');
  assert.deepEqual(normalizeSettings({ dans: [0, 10, 5, 5] }).dans, [5], '1〜9の外は落とす');
  assert.deepEqual(normalizeSettings(null).dans, [2, 3, 4, 5], '最初は2〜5の段');
});

for (const variant of ['number', 'same']) {
  test(`カードとり（${variant}）を最後まで通す: 子どもが毎回正解をタッチ`, () => {
    const timers = fakeTimers();
    const { view, calls } = fakeView();
    let summary = null;
    let lastField = null;
    let onTap = null;
    let lastTarget = null;
    const proxyView = new Proxy(view, {
      get(target, name) {
        if (name === 'renderField') return (field, tap) => { lastField = field; onTap = tap; calls.push(['renderField']); };
        if (name === 'showTarget') return (t) => { lastTarget = t; calls.push(['showTarget', t]); };
        return target[name];
      },
    });
    const mode = createTakeMode({
      variant, settings: { dans: [2, 3, 4, 5], level: 'weak', rounds: 10 },
      view: proxyView, rng: seeded(21), timers, onFinish: (s) => { summary = s; },
    });
    mode.start();
    for (let i = 0; i < 10; i += 1) {
      timers.advance(900); // よーい
      const answer = lastField.find((c) => c.product === lastTarget.product);
      assert.ok(answer, '場に正解がある');
      onTap(answer.id);
      timers.advance(1400);
    }
    assert.ok(summary, '10問で終わる');
    assert.equal(summary.score.player, 10);
    assert.equal(summary.score.cpu, 0);
    assert.equal(summary.review.length, 0);
    assert.equal(timers.pending(), 0);
  });
}

test('カードとりで子どもが何もしなければ、コンピューターが取り、ふりかえりに残る', () => {
  const timers = fakeTimers();
  const { view } = fakeView();
  let summary = null;
  const mode = createTakeMode({
    variant: 'number', settings: { dans: [2, 3, 4, 5], level: 'strong', rounds: 5 },
    view, rng: seeded(4), timers, onFinish: (s) => { summary = s; },
  });
  mode.start();
  timers.advance(5 * 20000);
  assert.ok(summary);
  assert.equal(summary.score.player, 0);
  assert.equal(summary.review.length, 5);
  assert.equal(summary.score.cpu + 0 <= 5, true);
});

test('大きさくらべを最後まで通す', () => {
  const timers = fakeTimers();
  const { view, calls } = fakeView();
  let summary = null;
  let pick = null;
  let pair = null;
  const proxyView = new Proxy(view, {
    get(target, name) {
      if (name === 'showCompare') return (l, r, onPick) => { pair = [l, r]; pick = onPick; calls.push(['showCompare']); };
      return target[name];
    },
  });
  const mode = createCompareMode({
    settings: { dans: [2, 3], level: 'normal', rounds: 5 },
    view: proxyView, rng: seeded(9), timers, onFinish: (s) => { summary = s; },
  });
  mode.start();
  for (let i = 0; i < 5; i += 1) {
    timers.advance(900);
    pick(judgeCompare(pair[0], pair[1]));
    timers.advance(1400);
  }
  assert.ok(summary);
  assert.equal(summary.score.player, 10, '1問2枚');
  assert.notEqual(pair[0].id, pair[1].id);
});

test('途中でやめるとタイマーが残らない', () => {
  const timers = fakeTimers();
  const { view } = fakeView();
  let finished = false;
  const mode = createTakeMode({
    variant: 'same', settings: { dans: [2, 3], level: 'normal', rounds: 10 },
    view, rng: seeded(2), timers, onFinish: () => { finished = true; },
  });
  mode.start();
  timers.advance(1500);
  mode.stop();
  assert.equal(timers.pending(), 0);
  timers.advance(60000);
  assert.equal(finished, false);
});

test('カードとり2: 場から作れない時は1枚入れ替えて必ず作る（2〜5の段・200問）', () => {
  const rng = seeded(21);
  const gameCards = createCards([2, 3, 4, 5]);
  const pile = createDrawPile(gameCards, rng);
  let field = refillField([], pile, FIELD_SIZE);
  for (let i = 0; i < 200; i += 1) {
    let t = pickSameTarget(field, rng, [2, 3, 4, 5]);
    if (!t) {
      const forced = forceSameTarget(field, gameCards, rng);
      assert.ok(forced, '入れ替えで作れる');
      assert.ok(forced.field.length >= field.length - 1 && forced.field.length <= field.length);
      field = forced.field;
      t = forced.target;
    }
    assert.ok(!field.some((c) => c.a === t.a && c.b === t.b));
    const hit = field.find((c) => isMatch(t, c));
    assert.ok(hit);
    assert.equal(new Set(field.map((c) => c.id)).size, field.length, '場に同じカードが2枚ない');
    field = refillField(field.filter((c) => c !== hit), pile, FIELD_SIZE);
  }
});

test('カードとり2は、段が1つだけだと遊べない。ほかは遊べる', () => {
  assert.match(getSettingsProblem({ mode: 'take-same', dans: [3] }), /2つ/);
  assert.equal(getSettingsProblem({ mode: 'take-same', dans: [3, 4] }), null);
  assert.equal(getSettingsProblem({ mode: 'take-number', dans: [3] }), null);
  assert.equal(getSettingsProblem({ mode: 'compare', dans: [1] }), null);
});

test('どの2つの段でも、カードとり2の問題が作れる（1〜9の段の全組み合わせ）', () => {
  const rng = seeded(31);
  for (let a = 1; a <= 9; a += 1) {
    for (let b = a + 1; b <= 9; b += 1) {
      const dans = [a, b];
      const gameCards = createCards(dans);
      const pile = createDrawPile(gameCards, rng);
      let field = refillField([], pile, FIELD_SIZE);
      for (let i = 0; i < 30; i += 1) {
        let t = pickSameTarget(field, rng, dans);
        if (!t) {
          const forced = forceSameTarget(field, gameCards, rng);
          assert.ok(forced, `${a}と${b}の段で問題が作れない`);
          field = forced.field;
          t = forced.target;
        }
        assert.ok(dans.includes(t.a), '式は選んだ段だけ');
        const hit = field.find((c) => isMatch(t, c));
        assert.ok(hit, '場に正解がある');
        assert.equal(new Set(field.map((c) => c.id)).size, field.length);
        field = refillField(field.filter((c) => c !== hit), pile, FIELD_SIZE);
      }
    }
  }
});

for (const dans of [[1, 2], [6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8, 9], [9, 8]]) {
  test(`カードとり2を最後まで通す（${dans.join('・')}の段）`, () => {
    const timers = fakeTimers();
    const { view, calls } = fakeView();
    let summary = null;
    let lastField = null;
    let onTap = null;
    let lastTarget = null;
    const proxyView = new Proxy(view, {
      get(target, name) {
        if (name === 'renderField') return (field, tap) => { lastField = field; onTap = tap; calls.push(['renderField']); };
        if (name === 'showTarget') return (t) => { lastTarget = t; calls.push(['showTarget', t]); };
        return target[name];
      },
    });
    createTakeMode({
      variant: 'same', settings: { dans, level: 'weak', rounds: 15 },
      view: proxyView, rng: seeded(77), timers, onFinish: (s) => { summary = s; },
    }).start();
    for (let i = 0; i < 15; i += 1) {
      timers.advance(900);
      assert.ok(dans.includes(lastTarget.a), '問題の式は選んだ段だけ');
      assert.ok(lastField.every((c) => dans.includes(c.a)), '場のカードも選んだ段だけ');
      onTap(lastField.find((c) => c.product === lastTarget.product).id);
      timers.advance(1400);
    }
    assert.ok(summary);
    assert.equal(summary.score.player, 15);
  });
}
