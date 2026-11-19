import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.createContext(context);
for (const file of ['kuku-readings.js', 'game-config.js', 'game-questions.js']) {
  vm.runInContext(readFileSync(new URL(`../kentei/${file}`, import.meta.url), 'utf8'), context);
}
const { KukuGameQuestions: Q, KukuGameConfig: C } = context.window;
const bs = (list) => Array.from(list, (q) => q.b); // vm の配列をこちらの配列に直す

test('じゅんばんどおり・ぎゃく・ランダムの並び', () => {
  assert.deepEqual(bs(Q.buildQuestions(3, 'order')), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(bs(Q.buildQuestions(3, 'reverse')), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  const random = bs(Q.buildQuestions(3, 'random'));
  assert.deepEqual([...random].sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const q = Q.buildQuestions(8, 'order')[7];
  assert.equal(q.product, 64);
  assert.equal(q.reading, 'はっぱろくじゅうし');
});

test('範囲外の段・不明なモードは例外', () => {
  assert.throws(() => Q.buildQuestions(0, 'order'));
  assert.throws(() => Q.buildQuestions(2, 'zigzag'));
});

test('はやさは1・2・3秒と、たつじん（0.7秒）・ウルトラたつじん（0.4秒）から選べ、はじめは1秒', () => {
  assert.deepEqual(Array.from(C.SPEEDS, (s) => s.sec), [1, 2, 3, 0.7, 0.4]);
  assert.ok(C.SPEEDS.find((s) => s.sec === 0.4).ultra);
  assert.ok(C.SPEEDS.find((s) => s.sec === 0.7).master);
  assert.equal(C.DEFAULT_SPEED_SEC, 1);
  assert.ok(C.SPEEDS.some((s) => s.sec === C.DEFAULT_SPEED_SEC));
});
