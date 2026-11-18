/**
 * game-stop.js（モジュール）
 * 先生が九九けんていを止めたかを見張る。カードゲームと同じ仕組み（js/remote.js・js/stop-watch.js）を使い、
 * 操作名だけ九九けんてい用（kenteiStatus）にする。
 * 変わった時は window に「kentei-stop-change」を知らせ、game-main.js が画面を切り替える。
 * 通信できない時・ガス側が未対応の時は、止めずに遊べる。
 */
import {
  STOP_API_URL, STOP_POLL_MS, STOP_REQUEST_TIMEOUT_MS, STOP_TARGETS,
} from '../js/config.js';
import { createRemote } from '../js/remote.js';
import { createStopWatcher } from '../js/stop-watch.js';

const target = STOP_TARGETS.kentei;

const watcher = createStopWatcher({
  remote: createRemote({
    url: STOP_API_URL,
    fetchImpl: (...args) => window.fetch(...args),
    timers: { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (h) => window.clearTimeout(h) },
    timeoutMs: STOP_REQUEST_TIMEOUT_MS,
    statusAction: target.statusAction,
    setAction: target.setAction,
  }),
  timers: { setInterval: (fn, ms) => window.setInterval(fn, ms), clearInterval: (h) => window.clearInterval(h) },
  intervalMs: STOP_POLL_MS,
  onChange: (state) => window.dispatchEvent(new CustomEvent('kentei-stop-change', { detail: state })),
});

window.KukuKenteiStop = Object.freeze({
  checkNow: () => watcher.checkNow(),
  getState: () => watcher.getState(),
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    watcher.pause();
  } else {
    watcher.checkNow();
    watcher.start();
  }
});

watcher.checkNow();
watcher.start();
