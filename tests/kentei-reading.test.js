import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
let kuromoji = null;
try { kuromoji = require('kuromoji'); } catch (err) { /* npm install していない時は飛ばす */ }

const context = { window: {} };
vm.createContext(context);
for (const file of ['kuku-readings.js', 'kuku-judge.js', 'kuku-reading-judge.js']) {
  vm.runInContext(readFileSync(new URL(`../kentei/${file}`, import.meta.url), 'utf8'), context);
}
const { KukuReadings, KukuReadingJudge } = context.window;

function buildTokenizer() {
  const dicPath = new URL('../kentei/vendor/kuromoji/dict/', import.meta.url).pathname;
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err, t) => (err ? reject(err) : resolve(t)));
  });
}

test('読み方の判定（2026-11-19 のログと、よくある読み違い）', { skip: !kuromoji && 'kuromoji 未インストール（npm install）' }, async () => {
  KukuReadingJudge.useTokenizer(await buildTokenizer());
  const judge = (text, a, b) => KukuReadingJudge.judgeReading([text], a, b, KukuReadings.getReading(a, b)).verdict;
  // ログで聞き取られた形は ○
  for (const [text, a, b] of [['兄さんがさん', 1, 3], ['変化 額', 1, 9], ['インに何', 1, 2], ['肉18', 2, 9], ['ニック18', 2, 9]]) {
    assert.equal(judge(text, a, b), 'ok', text);
  }
  // よくある読み違いは ×
  for (const [text, a, b] of [['ななきゅうろくじゅうさん', 7, 9], ['はちはちろくじゅうし', 8, 8], ['いちさんがさん', 1, 3], ['よんよんじゅうろく', 4, 4]]) {
    assert.equal(judge(text, a, b), 'ng', text);
  }
  // 聞き取りがあいまいでも、明確な読み違いがなければ ○（数字・漢数字で返った時も）
  for (const [text, a, b] of [['インディアに', 1, 2], ['イン ニア', 1, 2], ['倫理が2', 1, 2], ['七九63', 7, 9], ['4×7=28', 4, 7]]) {
    assert.equal(judge(text, a, b), 'ok', text);
  }
  // 答えの数がちがう、別の式を言った時は ×
  assert.equal(judge('さんしじゅうに', 7, 9), 'ng');
  assert.equal(judge('3×6=19', 3, 6), 'ng');
  // 81問すべて、正しい読みそのものは ○
  for (let a = 1; a <= 9; a += 1) {
    for (let b = 1; b <= 9; b += 1) {
      assert.equal(judge(KukuReadings.getReading(a, b), a, b), 'ok', `${a}x${b}`);
    }
  }
});

test('よくある読み違いの候補', () => {
  const v = KukuReadingJudge.wrongVariants('しちくろくじゅうさん');
  assert.ok(v.includes('ななくろくじゅうさん'));
  assert.ok(v.includes('しちきゅうろくじゅうさん'));
  assert.ok(!v.includes('しちくろくじゅうさん'));
});
