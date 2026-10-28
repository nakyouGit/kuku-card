// まとめて止められるタイマー（ゲームを途中でやめた時に後始末するため）

export function createScheduler(timers) {
  const handles = new Set();
  return {
    later(fn, ms) {
      const handle = timers.setTimeout(() => {
        handles.delete(handle);
        fn();
      }, ms);
      handles.add(handle);
    },
    clearAll() {
      for (const handle of handles) timers.clearTimeout(handle);
      handles.clear();
    },
  };
}
