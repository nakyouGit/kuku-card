import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.createContext(context);
for (const file of ['kuku-readings.js', 'game-config.js', 'game-questions.js', 'game-records.js']) {
  vm.runInContext(readFileSync(new URL(`../kentei/${file}`, import.meta.url), 'utf8'), context);
}
const { KukuGameQuestions: Q, KukuGameRecords: R } = context.window;
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

test('記録: いちばん良い数と、はじめての ごうかく', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const rec = R.createRecords(storage, 'k');
  assert.equal(rec.record(2, 'order', 7, 9).firstPass, false);
  assert.equal(rec.record(2, 'order', 9, 9).firstPass, true);
  assert.equal(rec.record(2, 'order', 5, 9).firstPass, false);
  const again = R.createRecords(storage, 'k').get(2, 'order');
  assert.equal(again.best, 9);
  assert.equal(again.passed, true);
});

test('記録: 保存できない環境でも止まらない', () => {
  const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  const rec = R.createRecords(broken, 'k');
  assert.equal(rec.record(4, 'random', 9, 9).firstPass, true);
  assert.equal(R.createRecords(null, 'k').get(4, 'random'), null);
});
