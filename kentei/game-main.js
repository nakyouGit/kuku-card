/**
 * game-main.js
 * 九九けんてい（フラッシュ）の画面の切り替えと進行。
 * 式を1つずつ FLASH_SEC 秒だけ出し、子どもは声に出して読む。判定はしない。
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
    hintToggle: $('hintToggle'),
    startButton: $('startButton'),
    playTitle: $('playTitle'),
    quitButton: $('quitButton'),
    progress: $('progress'),
    card: $('card'),
    cardMain: $('cardMain'),
    cardSub: $('cardSub'),
    timerBar: $('timerBar'),
    resultList: $('resultList'),
    retryButton: $('retryButton'),
    backButton: $('backButton'),
  };

  // ===== 状態 =====
  const storage = getStorage();
  const selection = loadSelection();
  let currentRun = null;
  let lastRun = null;
  let starting = false;

  init();

  function init() {
    ui.timerBar.style.setProperty('--limit', `${C.FLASH_SEC}s`);
    buildDanButtons();
    buildModeButtons();
    ui.hintToggle.checked = selection.hint;
    bindEvents();
    refreshSelection();
    window.addEventListener('kentei-stop-change', (event) => handleStopChange(event.detail));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && currentRun) quitRun(); // 別の画面に移ったら止める
    });
  }

  function bindEvents() {
    ui.startButton.addEventListener('click', () => startRun(selection.dan, selection.mode, selection.hint));
    ui.hintToggle.addEventListener('change', () => {
      selection.hint = ui.hintToggle.checked;
      saveSelection();
    });
    ui.quitButton.addEventListener('click', quitRun);
    ui.retryButton.addEventListener('click', () => {
      if (lastRun) startRun(lastRun.dan, lastRun.mode, lastRun.showReading);
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

  function refreshSelection() {
    ui.danButtons.querySelectorAll('.dan-button').forEach((button) => {
      button.classList.toggle('selected', Number(button.dataset.dan) === selection.dan);
    });
    ui.modeButtons.querySelectorAll('.mode-button').forEach((button) => {
      button.classList.toggle('selected', button.dataset.mode === selection.mode);
    });
  }

  // ===== フラッシュ =====
  async function startRun(dan, mode, showReading) {
    if (starting || currentRun) return; // 続けて押された時に、2回始まらないように
    starting = true;
    const allowed = await confirmNotStopped();
    starting = false;
    if (!allowed) return;

    const run = { dan, mode, showReading, questions: Q.buildQuestions(dan, mode), index: 0 };
    currentRun = run;
    ui.playTitle.textContent = `${dan}のだん ・ ${modeLabel(mode)}`;
    showScreen('play');
    renderProgress(run);
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
      setCard(`${q.a}×${q.b}`, run.showReading ? q.reading : '', '');
      renderProgress(run);
      startTimer();
      await sleep(C.FLASH_SEC * 1000);
      if (currentRun !== run) return;

      run.index += 1;
      setCard('', '', '');
      resetTimer();
      await sleep(C.FLASH_GAP_MS);
      if (currentRun !== run) return;
    }
    finishRun(run);
  }

  function quitRun() {
    currentRun = null;
    resetTimer();
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

  function resetTimer() {
    ui.timerBar.classList.remove('running');
  }

  function startTimer() {
    resetTimer();
    void ui.timerBar.offsetWidth; // アニメーションを最初から
    ui.timerBar.classList.add('running');
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
    const fallback = { dan: C.DEFAULT_DAN, mode: C.DEFAULT_MODE, hint: false };
    try {
      const saved = JSON.parse((storage && storage.getItem(C.SETTINGS_STORAGE_KEY)) || 'null');
      if (!saved) return fallback;
      return {
        dan: window.KukuReadings.isValidNumber(saved.dan) ? saved.dan : fallback.dan,
        mode: C.MODES.some((m) => m.id === saved.mode) ? saved.mode : fallback.mode,
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
