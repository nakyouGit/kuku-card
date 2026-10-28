// 1問ぶんの早取り勝負。先に正解した方が勝ち、お手つきはその問題だけ休み。

/**
 * @param {object} options
 * @param {number} options.timeoutMs だれも取れない時に打ち切るまで
 * @param {{setTimeout:Function, clearTimeout:Function}} options.timers
 * @param {(result:{winner:'player'|'cpu'|'none', choice:any, reason:string}) => void} options.onResolve
 * @param {(who:'player'|'cpu', choice:any) => void} [options.onMiss] お手つきが出た時
 */
export function createRace({ timeoutMs, timers, onResolve, onMiss = () => {} }) {
  let finished = false;
  const locked = { player: false, cpu: false };
  const pending = new Set();

  function schedule(fn, ms) {
    const handle = timers.setTimeout(() => {
      pending.delete(handle);
      fn();
    }, ms);
    pending.add(handle);
  }

  function clearPending() {
    for (const handle of pending) timers.clearTimeout(handle);
    pending.clear();
  }

  function finish(result) {
    if (finished) return;
    finished = true;
    clearPending();
    onResolve(result);
  }

  function attempt(who, isCorrect, choice) {
    if (finished || locked[who]) return 'ignored';
    if (isCorrect) {
      finish({ winner: who, choice, reason: 'correct' });
      return 'won';
    }
    locked[who] = true;
    onMiss(who, choice);
    if (locked.player && locked.cpu) {
      finish({ winner: 'none', choice: null, reason: 'both-missed' });
    }
    return 'missed';
  }

  schedule(() => finish({ winner: 'none', choice: null, reason: 'timeout' }), timeoutMs);

  return {
    /** 子どもがタッチした */
    player(isCorrect, choice) {
      return attempt('player', isCorrect, choice);
    },
    /** コンピューターの手を予約する */
    scheduleCpu(move, isCorrectFn) {
      if (!move) return;
      schedule(() => attempt('cpu', isCorrectFn(move.choice), move.choice), move.delayMs);
    },
    isLocked: (who) => locked[who],
    isFinished: () => finished,
    /** 画面を離れる時などに、結果を出さずに止める */
    cancel() {
      finished = true;
      clearPending();
    },
  };
}
