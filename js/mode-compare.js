// 大きさくらべ（2枚のうち、答えが大きい方を早くタッチする）

import { CPU_LEVELS, TIMING, COMPARE_CARDS_PER_ROUND } from './config.js';
import { createCards, createDrawPile, judgeCompare } from './deck.js';
import { planCpuMove } from './cpu.js';
import { createRace } from './race.js';
import { createScheduler } from './scheduler.js';

const CHOICES = ['left', 'right', 'same'];

export function createCompareMode({ settings, view, rng, timers, onFinish }) {
  const level = CPU_LEVELS[settings.level];
  const pile = createDrawPile(createCards(settings.dans), rng);
  const scheduler = createScheduler(timers);

  const score = { player: 0, cpu: 0 };
  const review = [];
  let round = 0;
  let race = null;
  let pair = null;
  let answer = null;
  let stopped = false;

  function drawPair() {
    const left = pile.draw();
    if (!left) return null;
    // 同じカードが2枚並ばないようにする（1枚しかない時は同じでもよい）
    const right = pile.draw(new Set([left.id])) ?? left;
    return { left, right };
  }

  function nextRound() {
    if (stopped) return;
    pair = round < settings.rounds ? drawPair() : null;
    if (!pair) {
      finish();
      return;
    }
    round += 1;
    answer = judgeCompare(pair.left, pair.right);
    view.setRound(round, settings.rounds);
    view.showReady();
    scheduler.later(startRace, TIMING.readyMs);
  }

  function startRace() {
    if (stopped) return;
    view.showCompare(pair.left, pair.right, handlePick);
    view.setCpuState('thinking');
    race = createRace({
      timeoutMs: TIMING.roundTimeoutMs,
      timers,
      onResolve: resolveRound,
      onMiss: (who, side) => view.showComparePick(who, side, false),
    });
    const wrong = CHOICES.filter((c) => c !== answer);
    race.scheduleCpu(planCpuMove(level, [answer], wrong, rng), (side) => side === answer);
  }

  function handlePick(side) {
    if (race) race.player(side === answer, side);
  }

  function resolveRound(result) {
    race = null;
    if (result.winner !== 'none') {
      score[result.winner] += COMPARE_CARDS_PER_ROUND;
      view.showComparePick(result.winner, result.choice, true);
    }
    view.revealCompare(answer);
    view.setCpuState(result.winner === 'cpu' ? 'won' : result.winner === 'player' ? 'lost' : 'idle');
    view.setScores(score);
    if (result.winner !== 'player') {
      const { left, right } = pair;
      const verdict = answer === 'same' ? 'おなじ' : `${answer === 'left' ? left.a : right.a}×${answer === 'left' ? left.b : right.b} の ほうが 大きい`;
      review.push({
        question: `${left.a}×${left.b} と ${right.a}×${right.b}`,
        answer: `${left.product} と ${right.product} で、${verdict}`,
      });
    }
    scheduler.later(nextRound, TIMING.resultMs);
  }

  function finish() {
    stopped = true;
    scheduler.clearAll();
    onFinish({ score, review, rounds: round });
  }

  return {
    start() {
      view.setScores(score);
      nextRound();
    },
    stop() {
      stopped = true;
      if (race) race.cancel();
      race = null;
      scheduler.clearAll();
    },
  };
}
