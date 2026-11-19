/**
 * game-main.js
 * 九九けんてい（フラッシュ）の画面の切り替えと進行。
 * 式を1つずつ、選んだはやさ（SPEEDS）の秒数だけ出し、子どもは声に出して読む。判定はしない。
 * 画面に出す言葉は、九九のほかはひらがなにする。
 */
(function () {
  'use strict';

  const C = window.KukuGameConfig;
  const Q = window.KukuGameQuestions;

  // ===== 画面の部品 =====
  const $ = (id) => document.getElementById(id);
  const ui = {
    screens: {
      title: $('titleScreen'), play: $('playScreen'), result: $('resultScreen'), stopped: $('stoppedScreen'),
    },
    stoppedMessage: $('stoppedMessage'),
    danButtons: $('danButtons'),
    modeButtons: $('modeButtons'),
    speedButtons: $('speedButtons'),
    hintToggle: $('hintToggle'),
    startButton: $('startButton'),
    playTitle: $('playTitle'),
    quitButton: $('quitButton'),
    progress: $('progress'),
    card: $('card'),
    cardMain: $('cardMain'),
    cardSub: $('cardSub'),
    resultList: $('resultList'),
    retryButton: $('retryButton'),
    backButton: $('backButton'),
  };

  // ===== 状態 =====
  const storage = getStorage();
  const selection = loadSelection();
  let currentRun = null;
  let lastRun = null;
  let pendingRun = null; // スタートを押して、止まっていないかを確かめている間の回

  init();

  function init() {
    buildDanButtons();
    buildModeButtons();
    buildSpeedButtons();
    ui.hintToggle.checked = selection.hint;
    bindEvents();
    refreshSelection();
    window.addEventListener('kentei-stop-change', (event) => handleStopChange(event.detail));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && currentRun) quitRun(); // 別の画面に移ったら止める
    });
  }

  function bindEvents() {
    ui.startButton.addEventListener('click', () => {
      startRun({ dan: selection.dan, mode: selection.mode, speedSec: selection.speedSec, showReading: selection.hint });
    });
    ui.hintToggle.addEventListener('change', () => {
      selection.hint = ui.hintToggle.checked;
      saveSelection();
    });
    ui.quitButton.addEventListener('click', quitRun);
    ui.retryButton.addEventListener('click', () => {
      if (lastRun) startRun(lastRun.options);
    });
    ui.backButton.addEventListener('click', () => {
      refreshSelection();
      showScreen(isStopped() ? 'stopped' : 'title');
    });
  }

  // ===== 先生が止める =====
  function isStopped() {
    return Boolean(window.KukuKenteiStop && window.KukuKenteiStop.getState().stopped);
  }

  function handleStopChange({ stopped, message }) {
    if (stopped) {
      ui.stoppedMessage.textContent = message;
      ui.stoppedMessage.hidden = message === '';
      currentRun = null;
      pendingRun = null;
      if (!ui.screens.result.hidden) return; // こたえあわせを見ている間は、そのままにする
      showScreen('stopped');
    } else if (!ui.screens.stopped.hidden) {
      refreshSelection();
      showScreen('title');
    }
  }

  /** スタートの前に、止まっていないかを確かめる。回線が遅い時は待たずに進める */
  async function confirmNotStopped() {
    if (!window.KukuKenteiStop) return true; // 見張りが読み込めない時は止めない
    await Promise.race([window.KukuKenteiStop.checkNow(), sleep(C.START_STOP_CHECK_WAIT_MS)]);
    if (isStopped()) {
      showScreen('stopped');
      return false;
    }
    return true;
  }

  // ===== はじめの画面 =====
  function buildDanButtons() {
    for (let dan = window.KukuReadings.MIN_NUMBER; dan <= window.KukuReadings.MAX_NUMBER; dan += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dan-button';
      button.dataset.dan = String(dan);
      button.textContent = `${dan}のだん`;
      button.addEventListener('click', () => {
        selection.dan = dan;
        saveSelection();
        refreshSelection();
      });
      ui.danButtons.appendChild(button);
    }
  }

  function buildModeButtons() {
    C.MODES.forEach((mode) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mode-button';
      button.dataset.mode = mode.id;
      button.textContent = mode.label;
      button.addEventListener('click', () => {
        selection.mode = mode.id;
        saveSelection();
        refreshSelection();
      });
      ui.modeButtons.appendChild(button);
    });
  }

  function buildSpeedButtons() {
    C.SPEEDS.forEach((speed) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = ['mode-button', speed.master ? 'master' : '', speed.ultra ? 'ultra' : ''].filter(Boolean).join(' ');
      button.dataset.speed = String(speed.sec);
      button.textContent = speed.label;
      button.addEventListener('click', () => {
        selection.speedSec = speed.sec;
        saveSelection();
        refreshSelection();
      });
      ui.speedButtons.appendChild(button);
    });
  }

  function refreshSelection() {
    ui.danButtons.querySelectorAll('.dan-button').forEach((button) => {
      button.classList.toggle('selected', Number(button.dataset.dan) === selection.dan);
    });
    ui.modeButtons.querySelectorAll('.mode-button').forEach((button) => {
      button.classList.toggle('selected', button.dataset.mode === selection.mode);
    });
    ui.speedButtons.querySelectorAll('.mode-button').forEach((button) => {
      button.classList.toggle('selected', Number(button.dataset.speed) === selection.speedSec);
    });
  }

  // ===== フラッシュ =====
  /** @param {{dan:number, mode:string, speedSec:number, showReading:boolean}} options */
  async function startRun(options) {
    if (pendingRun || currentRun) return; // 続けて押された時に、2回始まらないように
    const run = { options, questions: Q.buildQuestions(options.dan, options.mode), index: 0 };
    pendingRun = run;
    // 確かめている間も、押したことが分かるように先に画面を切り替える
    ui.playTitle.textContent = `${options.dan}のだん ・ ${modeLabel(options.mode)} ・ ${speedLabel(options.speedSec)}`;
    setCard('', 'じゅんび してね', 'countdown');
    renderProgress(run);
    showScreen('play');
    const allowed = await confirmNotStopped();
    if (pendingRun !== run) return; // 確かめている間に「やめる」が押された
    pendingRun = null;
    if (!allowed) return; // 止まっていれば「おやすみ」の画面になっている

    currentRun = run;
    playLoop(run);
  }

  async function playLoop(run) {
    for (let n = C.START_COUNTDOWN_SEC; n >= 1; n -= 1) {
      setCard(String(n), 'じゅんび してね', 'countdown');
      await sleep(1000);
      if (currentRun !== run) return;
    }

    while (run.index < run.questions.length) {
      const q = run.questions[run.index];
      setCard(`${q.a}×${q.b}`, run.options.showReading ? q.reading : '', '');
      renderProgress(run);
      await sleep(run.options.speedSec * 1000);
      if (currentRun !== run) return;

      run.index += 1;
      setCard('', '', '');
      await sleep(C.FLASH_GAP_MS);
      if (currentRun !== run) return;
    }
    finishRun(run);
  }

  function quitRun() {
    currentRun = null;
    pendingRun = null;
    refreshSelection();
    showScreen(isStopped() ? 'stopped' : 'title');
  }

  // ===== おわり（こたえあわせ） =====
  function finishRun(run) {
    currentRun = null;
    lastRun = run;
    ui.resultList.replaceChildren(...run.questions.map(renderAnswerItem));
    showScreen('result');
  }

  function renderAnswerItem(q) {
    const li = document.createElement('li');
    const formula = document.createElement('span');
    formula.textContent = `${q.a}×${q.b}＝${q.product}`;
    const reading = document.createElement('span');
    reading.className = 'result-reading';
    reading.textContent = q.reading;
    li.append(formula, reading);
    return li;
  }

  // ===== 表示の道具 =====
  function showScreen(name) {
    Object.entries(ui.screens).forEach(([key, el]) => { el.hidden = key !== name; });
    window.scrollTo(0, 0);
  }

  function setCard(main, sub, kind) {
    ui.card.className = `card${kind ? ` ${kind}` : ''}`;
    ui.cardMain.textContent = main;
    ui.cardSub.textContent = sub;
  }

  function renderProgress(run) {
    const dots = run.questions.map((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'dot';
      if (i < run.index) dot.classList.add('done');
      else if (i === run.index) dot.classList.add('current');
      return dot;
    });
    ui.progress.replaceChildren(...dots);
  }

  function speedLabel(sec) {
    const speed = C.SPEEDS.find((s) => s.sec === sec);
    if (!speed) return `${sec}びょう`;
    return speed.shortLabel || speed.label;
  }

  function modeLabel(modeId) {
    const mode = C.MODES.find((m) => m.id === modeId);
    return mode ? mode.label : modeId;
  }

  // ===== 保存 =====
  function getStorage() {
    try {
      const s = window.localStorage;
      const probe = '__kukuKenteiProbe';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (err) {
      return null;
    }
  }

  function loadSelection() {
    const fallback = { dan: C.DEFAULT_DAN, mode: C.DEFAULT_MODE, speedSec: C.DEFAULT_SPEED_SEC, hint: false };
    try {
      const saved = JSON.parse((storage && storage.getItem(C.SETTINGS_STORAGE_KEY)) || 'null');
      if (!saved) return fallback;
      return {
        dan: window.KukuReadings.isValidNumber(saved.dan) ? saved.dan : fallback.dan,
        mode: C.MODES.some((m) => m.id === saved.mode) ? saved.mode : fallback.mode,
        speedSec: C.SPEEDS.some((s) => s.sec === saved.speedSec) ? saved.speedSec : fallback.speedSec,
        hint: saved.hint === true,
      };
    } catch (err) {
      return fallback;
    }
  }

  function saveSelection() {
    try {
      if (storage) storage.setItem(C.SETTINGS_STORAGE_KEY, JSON.stringify(selection));
    } catch (err) { /* 保存できなくても続ける */ }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
