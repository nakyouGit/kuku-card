/**
 * game-records.js
 * ごうかくの記録を端末（localStorage）に残す。保存できない環境でもゲームは止めない。
 */
(function (global) {
  'use strict';

  function createRecords(storage, storageKey) {
    let data = {};
    try {
      const raw = storage && storage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      data = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      data = {};
    }

    const keyOf = (dan, mode) => `${dan}-${mode}`;

    function persist() {
      try {
        if (storage) storage.setItem(storageKey, JSON.stringify(data));
      } catch (err) { /* 保存できなくても続ける */ }
    }

    function get(dan, mode) {
      return data[keyOf(dan, mode)] || null;
    }

    /** 1回分の結果を記録する。いちばん良い数と、ごうかくしたかを残す。 */
    function record(dan, mode, goodCount, total) {
      const key = keyOf(dan, mode);
      const prev = data[key] || { best: 0, passed: false };
      const passed = goodCount === total;
      data[key] = {
        best: Math.max(prev.best, goodCount),
        total,
        passed: prev.passed || passed,
        passedAt: passed && !prev.passed ? new Date().toISOString() : prev.passedAt || null,
      };
      persist();
      return { record: data[key], firstPass: passed && !prev.passed };
    }

    return Object.freeze({ get, record });
  }

  global.KukuGameRecords = Object.freeze({ createRecords });
})(window);
