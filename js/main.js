// 画面の切り替えと、モードの起動

import { createGameView, renderResult } from './ui.js';
import { loadSettings, saveSettings, mountSettingsForm } from './settings.js';
import { createTakeMode } from './mode-take.js';
import { createCompareMode } from './mode-compare.js';
import { MODES } from './config.js';

const MODE_FACTORIES = {
  compare: (deps) => createCompareMode(deps),
  'take-number': (deps) => createTakeMode({ ...deps, variant: 'number' }),
  'take-same': (deps) => createTakeMode({ ...deps, variant: 'same' }),
};

const screens = {
  setup: document.getElementById('screen-setup'),
  game: document.getElementById('screen-game'),
  result: document.getElementById('screen-result'),
};

function showScreen(name) {
  for (const [key, node] of Object.entries(screens)) node.hidden = key !== name;
  window.scrollTo(0, 0);
}

let settings = loadSettings(window.localStorage);
const form = mountSettingsForm(screens.setup, settings, (next) => {
  settings = next;
  saveSettings(window.localStorage, settings);
});

const view = createGameView(screens.game);
const timers = { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (h) => window.clearTimeout(h) };
let current = null;

function startGame() {
  settings = form.get();
  if (current) current.stop();
  view.reset();
  screens.game.dataset.mode = settings.mode;
  screens.game.querySelector('#mode-name').textContent = MODES[settings.mode].label;
  showScreen('game');
  current = MODE_FACTORIES[settings.mode]({
    settings,
    view,
    rng: Math.random,
    timers,
    onFinish: (summary) => {
      current = null;
      renderResult(screens.result, summary);
      showScreen('result');
    },
  });
  current.start();
}

function quitGame() {
  if (current) current.stop();
  current = null;
  showScreen('setup');
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-quit').addEventListener('click', quitGame);
document.getElementById('btn-again').addEventListener('click', startGame);
document.getElementById('btn-setup').addEventListener('click', () => showScreen('setup'));

// 別のタブに移ったら止める（戻った時に勝手に進んでいないように）
document.addEventListener('visibilitychange', () => {
  if (document.hidden && current) quitGame();
});

showScreen('setup');
