import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.createContext(context);
for (const file of ['kuku-readings.js', 'kuku-judge.js']) {
  vm.runInContext(readFileSync(new URL(`../kentei/${file}`, import.meta.url), 'utf8'), context);
}
const { KukuReadings, KukuJudge } = context.window;

test('81問すべて、読み方と式の形で正解になる', () => {
  for (let a = 1; a <= 9; a += 1) {
    for (let b = 1; b <= 9; b += 1) {
      const reading = KukuReadings.getReading(a, b);
      assert.ok(KukuJudge.judge(reading, a, b, reading).ok, `${a}x${b} 読み方`);
      assert.ok(KukuJudge.judge(`${a}×${b}=${a * b}`, a, b, reading).ok, `${a}x${b} 式`);
    }
  }
});

test('認識結果のいろいろな形', () => {
  const r = (t, a, b) => KukuJudge.judge(t, a, b, KukuReadings.getReading(a, b));
  assert.equal(r('二二が四', 2, 2).rule, 'numbers');
  assert.equal(r('22が4', 2, 2).rule, 'numbers-merged');
  assert.equal(r('九九八十一', 9, 9).rule, 'numbers');
  assert.equal(r('三四十二', 3, 4).rule, 'numbers');
  assert.equal(r('ハッパロクジュウシ', 8, 8).rule, 'reading');
  assert.equal(r('3×6=19', 3, 6).ok, false);
  assert.equal(r('', 1, 1).ok, false);
});

test('範囲外の式は例外', () => {
  assert.throws(() => KukuReadings.getReading(0, 1));
  assert.throws(() => KukuReadings.getReading(10, 1));
});
