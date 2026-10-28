import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemote } from '../js/remote.js';
import { createStopWatcher } from '../js/stop-watch.js';

const realTimers = { setTimeout, clearTimeout };

function remoteWith(fetchImpl, timeoutMs = 50) {
  return createRemote({ url: 'https://example.test/exec', fetchImpl, timers: realTimers, timeoutMs });
}
const respond = (body, ok = true) => async () => ({ ok, json: async () => body });

test('状態: 動作中・停止中と一言を読む', async () => {
  assert.deepEqual(await remoteWith(respond({ ok: true, enabled: true, message: '' })).fetchStatus(), { enabled: true, message: '' });
  assert.deepEqual(
    await remoteWith(respond({ ok: true, enabled: false, message: 'まってね' })).fetchStatus(),
    { enabled: false, message: 'まってね' },
  );
});

test('状態: 通信の失敗・形のちがう答え・時間切れは null（分からない）', async () => {
  assert.equal(await remoteWith(async () => { throw new Error('offline'); }).fetchStatus(), null);
  assert.equal(await remoteWith(respond({}, false)).fetchStatus(), null);
  assert.equal(await remoteWith(respond({ ok: false, error: '不明な操作です' })).fetchStatus(), null);
  assert.equal(await remoteWith(respond({ ok: true })).fetchStatus(), null);
  assert.equal(await remoteWith(async () => { throw new SyntaxError('not json'); }).fetchStatus(), null);
  assert.equal(await remoteWith(() => new Promise(() => {}), 20).fetchStatus(), null, '返事が来なくても待ち続けない');
});

test('送る内容: POST で JSON、Content-Type は付けない（事前確認の通信を避ける）', async () => {
  let seen;
  await remoteWith(async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ ok: true, enabled: true }) }; }).fetchStatus();
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers, undefined);
  assert.deepEqual(JSON.parse(seen.init.body), { action: 'cardStatus' });
});

test('ログイン: 成功でトークン、失敗でメッセージ', async () => {
  assert.deepEqual(await remoteWith(respond({ ok: true, token: 'abc' })).adminLogin('admin', 'pw'), { ok: true, token: 'abc' });
  const bad = await remoteWith(respond({ ok: false, error: 'IDまたはパスワードがちがいます' })).adminLogin('admin', 'x');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /パスワード/);
  const offline = await remoteWith(async () => { throw new Error('x'); }).adminLogin('admin', 'x');
  assert.equal(offline.ok, false);
});

test('停止の切り替え: 成功・ログイン切れ・ガス未更新・通信失敗', async () => {
  const ok = await remoteWith(respond({ ok: true, enabled: false, message: 'a' })).setCard('t', false, 'a');
  assert.deepEqual(ok, { ok: true, enabled: false, message: 'a' });
  const expired = await remoteWith(respond({ ok: false, auth: false, error: 'ログインし直してください' })).setCard('t', false, '');
  assert.equal(expired.auth, false);
  const old = await remoteWith(respond({ ok: false, error: '不明な操作です' })).setCard('t', false, '');
  assert.match(old.error, /ガス側/);
  assert.equal((await remoteWith(async () => { throw new Error('x'); }).setCard('t', false, '')).ok, false);
});

/** 偽の通信と偽のタイマーで見張りを動かす */
function watcherWith(statuses) {
  const queue = [...statuses];
  const changes = [];
  let tick = null;
  const watcher = createStopWatcher({
    remote: { fetchStatus: async () => queue.shift() },
    timers: { setInterval: (fn) => { tick = fn; return 1; }, clearInterval: () => { tick = null; } },
    intervalMs: 20000,
    onChange: (s) => changes.push(s),
  });
  return { watcher, changes, tick: () => tick && tick(), isTicking: () => tick !== null };
}
const running = { enabled: true, message: '' };
const stopped = (message = '') => ({ enabled: false, message });

test('見張り: はじめて分からない時は、動いているとみなす', async () => {
  const { watcher, changes } = watcherWith([null]);
  assert.deepEqual(await watcher.checkNow(), { stopped: false, message: '' });
  assert.equal(changes.length, 0);
});

test('見張り: 止まった時と再開した時だけ知らせ、同じ状態では知らせない', async () => {
  const { watcher, changes } = watcherWith([running, stopped('まっててね'), stopped('まっててね'), stopped('ちがう一言'), running, running]);
  for (let i = 0; i < 6; i += 1) await watcher.checkNow();
  assert.deepEqual(changes, [
    { stopped: true, message: 'まっててね' },
    { stopped: true, message: 'ちがう一言' },
    { stopped: false, message: '' },
  ]);
});

test('見張り: 止まっている間に通信が切れても、止まったままにする', async () => {
  const { watcher } = watcherWith([stopped('まって'), null, null]);
  await watcher.checkNow();
  assert.equal((await watcher.checkNow()).stopped, true);
  assert.equal((await watcher.checkNow()).stopped, true);
});

test('見張り: 同時に何度確かめても通信は1回', async () => {
  let calls = 0;
  const watcher = createStopWatcher({
    remote: { fetchStatus: async () => { calls += 1; return running; } },
    timers: { setInterval: () => 1, clearInterval: () => {} },
    intervalMs: 1,
    onChange: () => {},
  });
  await Promise.all([watcher.checkNow(), watcher.checkNow(), watcher.checkNow()]);
  assert.equal(calls, 1);
  await watcher.checkNow();
  assert.equal(calls, 2);
});

test('見張り: 一定間隔で確かめ、休ませると止まる', async () => {
  const { watcher, changes, tick, isTicking } = watcherWith([stopped('a')]);
  watcher.start();
  assert.equal(isTicking(), true);
  tick();
  await watcher.checkNow();
  assert.equal(changes.length, 1);
  watcher.pause();
  assert.equal(isTicking(), false);
});
