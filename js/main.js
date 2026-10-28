// 画面の切り替えと、モードの起動

import { createGameView, renderResult } from './ui.js';
import { loadSettings, saveSettings, mountSettingsForm, getSettingsProblem } from './settings.js';
import { createTakeMode } from './mode-take.js';
import { createCompareMode } from './mode-compare.js';
import { MODES, STOP_API_URL, STOP_POLL_MS, STOP_REQUEST_TIMEOUT_MS, START_CHECK_WAIT_MS } from './config.js';
import { createRemote } from './remote.js';
import { createStopWatcher } from './stop-watch.js';

const MODE_FACTORIES = {
  compare: (deps) => createCompareMode(deps),
  'take-number': (deps) => createTakeMode({ ...deps, variant: 'number' }),
  'take-same': (deps) => createTakeMode({ ...deps, variant: 'same' }),
};

const screens = {
  setup: document.getElementById('screen-setup'),
  game: document.getElementById('screen-game'),
  result: document.getElementById('screen-result'),
  stopped: document.getElementById('screen-stopped'),
};
const stoppedMessageEl = document.getElementById('stopped-message');
const startButton = document.getElementById('btn-start');

/** 先生が止めている間は、設定とゲームの画面を出さずに「おやすみ」を出す */
function showScreen(name) {
  const blocked = watcher.getState().stopped && (name === 'setup' || name === 'game');
  const target = blocked ? 'stopped' : name;
  for (const [key, node] of Object.entries(screens)) node.hidden = key !== target;
  window.scrollTo(0, 0);
}

/** 止まった・再開した、が分かった時の画面の切り替え */
function handleStopChange({ stopped, message }) {
  if (stopped) {
    if (current) current.stop();
    current = null;
    stoppedMessageEl.textContent = message;
    stoppedMessageEl.hidden = message === '';
    if (!screens.result.hidden) return; // 結果を見ている間は、そのままにする
    showScreen('stopped');
  } else if (!screens.stopped.hidden) {
    showScreen('setup');
  }
}

const watcher = createStopWatcher({
  remote: createRemote({
    url: STOP_API_URL,
    fetchImpl: (...args) => window.fetch(...args),
    timers: { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (h) => window.clearTimeout(h) },
    timeoutMs: STOP_REQUEST_TIMEOUT_MS,
  }),
  timers: { setInterval: (fn, ms) => window.setInterval(fn, ms), clearInterval: (h) => window.clearInterval(h) },
  intervalMs: STOP_POLL_MS,
  onChange: handleStopChange,
});

let settings = loadSettings(window.localStorage);
const form = mountSettingsForm(screens.setup, settings, (next) => {
  settings = next;
  saveSettings(window.localStorage, settings);
});

const view = createGameView(screens.game);
const timers = { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (h) => window.clearTimeout(h) };
let current = null;

async function startGame() {
  if (getSettingsProblem(form.get())) {
    showScreen('setup'); // 理由は設定の画面に出ている
    return;
  }
  startButton.disabled = true;
  // 止まっていれば「おやすみ」になる。回線が遅い時は待たずに、分かっている状態で進める
  // （確認は裏で続き、遅れて止まったと分かれば、その時点でゲームを止める）
  await Promise.race([watcher.checkNow(), new Promise((resolve) => window.setTimeout(resolve, START_CHECK_WAIT_MS))]);
  const { stopped } = watcher.getState();
  startButton.disabled = false;
  if (stopped) {
    showScreen('setup'); // 止まっている間は「おやすみ」の画面に切り替わる
    return;
  }
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

// 別のタブに移ったらゲームを止め、見張りも休む。戻ったらすぐ確かめる
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    watcher.pause();
    if (current) quitGame();
  } else {
    watcher.start();
    watcher.checkNow();
  }
});

showScreen('setup');
watcher.start();
watcher.checkNow();
