// カードとり 1・2（場から正解のカードを早取りする）

import { CPU_LEVELS, FIELD_SIZE, TIMING } from './config.js';
import {
  createCards,
  createDrawPile,
  refillField,
  pickNumberTarget,
  pickSameTarget,
  forceSameTarget,
  isMatch,
  expressionsFor,
} from './deck.js';
import { planCpuMove } from './cpu.js';
import { createRace } from './race.js';
import { createScheduler } from './scheduler.js';

const TARGET_PICKERS = {
  number: pickNumberTarget,
  same: pickSameTarget,
};

/**
 * @param {object} deps
 * @param {'number'|'same'} deps.variant
 * @param {{dans:number[], level:string, rounds:number}} deps.settings
 * @param {object} deps.view ui.js の createGameView が返すもの
 * @param {() => number} deps.rng
 * @param {{setTimeout:Function, clearTimeout:Function}} deps.timers
 * @param {(summary:object) => void} deps.onFinish
 */
export function createTakeMode({ variant, settings, view, rng, timers, onFinish }) {
  const level = CPU_LEVELS[settings.level];
  const pickTarget = TARGET_PICKERS[variant];
  const gameCards = createCards(settings.dans);
  const pile = createDrawPile(gameCards, rng);
  const scheduler = createScheduler(timers);

  const score = { player: 0, cpu: 0 };
  const review = [];
  let field = refillField([], pile, FIELD_SIZE);
  let round = 0;
  let race = null;
  let target = null;
  let stopped = false;

  function nextRound() {
    if (stopped) return;
    target = round < settings.rounds ? chooseTarget() : null;
    if (!target) {
      finish();
      return;
    }
    round += 1;
    view.setRound(round, settings.rounds);
    view.renderField(field, handleTap);
    view.showReady();
    scheduler.later(startRace, TIMING.readyMs);
  }

  /** 問題を選ぶ。カードとり2で作れない時は、場を1枚入れ替えて作る */
  function chooseTarget() {
    const picked = pickTarget(field, rng);
    if (picked || variant !== 'same') return picked;
    const forced = forceSameTarget(field, gameCards, rng);
    if (!forced) return null;
    field = forced.field;
    return forced.target;
  }

  function startRace() {
    if (stopped) return;
    view.showTarget(target);
    view.setCpuState('thinking');
    const correct = field.filter((card) => isMatch(target, card));
    const wrong = field.filter((card) => !isMatch(target, card));
    race = createRace({
      timeoutMs: TIMING.roundTimeoutMs,
      timers,
      onResolve: resolveRound,
      onMiss: (who, card) => view.showMiss(who, card.id),
    });
    race.scheduleCpu(planCpuMove(level, correct, wrong, rng), (card) => isMatch(target, card));
  }

  function handleTap(cardId) {
    if (!race) return;
    const card = field.find((c) => c.id === cardId);
    if (card) race.player(isMatch(target, card), card);
  }

  function resolveRound(result) {
    race = null;
    const answers = field.filter((card) => isMatch(target, card));
    if (result.winner !== 'none') {
      score[result.winner] += 1;
      view.showTaken(result.winner, result.choice.id);
      field = field.filter((card) => card.id !== result.choice.id);
    }
    view.revealAnswers(answers.map((card) => card.id));
    view.setCpuState(result.winner === 'cpu' ? 'won' : result.winner === 'player' ? 'lost' : 'idle');
    view.setScores(score);
    if (result.winner !== 'player') {
      review.push({ question: describeTarget(target), answer: describeAnswers(target) });
    }
    scheduler.later(() => {
      field = refillField(field, pile, FIELD_SIZE);
      nextRound();
    }, TIMING.resultMs);
  }

  function describeTarget(t) {
    return t.kind === 'number' ? `こたえが ${t.product} に なる カード` : `${t.label} と こたえが おなじ カード`;
  }

  function describeAnswers(t) {
    const exprs = expressionsFor(t.product)
      .filter((e) => t.kind !== 'expr' || e.id !== `${t.a}x${t.b}`)
      .map((e) => `${e.a}×${e.b}`);
    return `${exprs.join('、')}（こたえ ${t.product}）`;
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
