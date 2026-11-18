/**
 * dictionary-loader.js
 * 読みがなの辞書を、端末に残す仕組み（sw.js）を入れてから読み込む。
 */
(function (global) {
  'use strict';

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
  }

  async function registerServiceWorker(path, waitMs, log) {
    if (!('serviceWorker' in navigator)) {
      log('sw', 'unsupported');
      return;
    }
    try {
      await navigator.serviceWorker.register(path);
      await withTimeout(navigator.serviceWorker.ready, waitMs);
      if (!navigator.serviceWorker.controller) {
        await withTimeout(new Promise((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        }), waitMs);
      }
      log('sw', navigator.serviceWorker.controller ? 'active' : 'not-controlling');
    } catch (err) {
      log('sw', `failed ${(err && err.message) || err}`);
    }
  }

  /**
   * @returns {Promise<{ok:boolean, sec:number}>} 読み込めなくても例外にしない
   */
  async function prepare({ dicPath, serviceWorkerPath, waitMs, log = () => {} }) {
    const startedAt = performance.now();
    await registerServiceWorker(serviceWorkerPath, waitMs, log);
    try {
      await global.KukuReadingJudge.load(dicPath);
      const sec = (performance.now() - startedAt) / 1000;
      log('dict', `loaded ${sec.toFixed(1)}s`);
      return { ok: true, sec };
    } catch (err) {
      log('dict', `failed ${(err && err.message) || err}`);
      return { ok: false, sec: (performance.now() - startedAt) / 1000 };
    }
  }

  global.KukuDictionaryLoader = Object.freeze({ prepare });
})(window);
