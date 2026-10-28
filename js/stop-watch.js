// 先生が止めたかどうかを見張る（画面に依存しない）。
// 通信できない時は、最後に分かった状態を保つ。一度も分かっていなければ「動いている」とみなす
// （回線が落ちただけで授業中の全員が固まらないように）。

/**
 * @param {object} options
 * @param {{fetchStatus: () => Promise<{enabled:boolean,message:string}|null>}} options.remote
 * @param {{setInterval:Function, clearInterval:Function}} options.timers
 * @param {number} options.intervalMs
 * @param {(state:{stopped:boolean, message:string}) => void} options.onChange 変わった時だけ呼ぶ
 */
export function createStopWatcher({ remote, timers, intervalMs, onChange }) {
  let state = { stopped: false, message: '' };
  let handle = null;
  let inFlight = null;

  function apply(status) {
    if (status === null) return; // 分からない時は、前のまま
    const next = { stopped: !status.enabled, message: status.enabled ? '' : status.message };
    if (next.stopped === state.stopped && next.message === state.message) return;
    state = next;
    onChange({ ...state });
  }

  /** 今すぐ確かめる。同時に何度呼ばれても、通信は1回にまとめる */
  function checkNow() {
    if (!inFlight) {
      inFlight = remote
        .fetchStatus()
        .then(apply)
        .finally(() => { inFlight = null; });
    }
    return inFlight.then(() => ({ ...state }));
  }

  return {
    checkNow,
    getState: () => ({ ...state }),
    start() {
      if (handle !== null) return;
      handle = timers.setInterval(() => { checkNow(); }, intervalMs);
    },
    pause() {
      if (handle === null) return;
      timers.clearInterval(handle);
      handle = null;
    },
  };
}
