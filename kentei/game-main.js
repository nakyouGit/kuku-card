/**
 * game-main.js
 * 九九検定ゲームの画面の切り替えと進行。
 * 画面に出す言葉は、九九のほかはひらがなにする。
 */
(function () {
  'use strict';

  const C = window.KukuGameConfig;
  const Q = window.KukuGameQuestions;
  const T = window.KukuGameTrial;
  const K = T.KINDS;

  const FEEDBACK = Object.freeze({
    [K.GOOD]: { mark: '○', text: () => 'はやい！' },
    [K.LATE]: { mark: '△', text: (q) => `おしい！ ${q.reading}` },
    [K.WRONG]: { mark: '×', text: (q) => `ただしくは ${q.reading}` },
    [K.SILENT]: { mark: '×', text: (q) => `きこえなかったよ ${q.reading}` },
  });

  const MIC_MESSAGES = Object.freeze({
    'not-allowed': 'マイクが つかえないよ。せんせいに きいてね',
    'service-not-allowed': 'こえの にゅうりょくが つかえないよ。せんせいに きいてね',
    'audio-capture': 'マイクが みつからないよ。せんせいに きいてね',
  });
  const MIC_MESSAGE_DEFAULT = 'マイクが とまったよ。「つづける」を おしてね';

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
    readyState: $('readyState'),
    playTitle: $('playTitle'),
    quitButton: $('quitButton'),
    progress: $('progress'),
    card: $('card'),
    cardMain: $('cardMain'),
    cardSub: $('cardSub'),
    timerBar: $('timerBar'),
    pausePanel: $('pausePanel'),
    pauseMessage: $('pauseMessage'),
    resumeButton: $('resumeButton'),
    resultTitle: $('resultTitle'),
    resultScore: $('resultScore'),
    resultNote: $('resultNote'),
    resultList: $('resultList'),
    retryButton: $('retryButton'),
    practiceMissedButton: $('practiceMissedButton'),
    backButton: $('backButton'),
  };

  // ===== 状態 =====
  const storage = getStorage();
  const records = window.KukuGameRecords.createRecords(storage, C.RECORDS_STORAGE_KEY);
  const selection = loadSelection();
  const runner = new T.TrialRunner(C, { onSpeechDetected: markHeard, onLog: log });
  let currentRun = null;
  let lastRun = null;
  let resumeWaiter = null;
  let starting = false;

  init();

  function init() {
    ui.timerBar.style.setProperty('--limit', `${C.LIMIT_SEC}s`);
    buildDanButtons();
    buildModeButtons();
    ui.hintToggle.checked = selection.hint;
    bindEvents();
    refreshSelection();
    prepare();
    window.addEventListener('kentei-stop-change', (event) => handleStopChange(event.detail));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && currentRun) quitRun(); // 別の画面に移ったら、遊びとマイクを止める
    });
  }

  // ===== 先生が止める =====
  function isStopped() {
    return Boolean(window.KukuKenteiStop && window.KukuKenteiStop.getState().stopped);
  }

  /** 止まった・再開したが分かった時の画面の切り替え */
  function handleStopChange({ stopped, message }) {
    if (stopped) {
      ui.stoppedMessage.textContent = message;
      ui.stoppedMessage.hidden = message === '';
      if (currentRun) abandonRun();
      if (!ui.screens.result.hidden) return; // 結果を見ている間は、そのままにする
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

  function bindEvents() {
    ui.startButton.addEventListener('click', () => {
      startRun({
        dan: selection.dan,
        mode: selection.mode,
        questions: Q.buildQuestions(selection.dan, selection.mode),
        practice: selection.hint,
        showReading: selection.hint,
        label: modeLabel(selection.mode),
      });
    });
    ui.hintToggle.addEventListener('change', () => {
      selection.hint = ui.hintToggle.checked;
      saveSelection();
    });
    ui.quitButton.addEventListener('click', quitRun);
    ui.resumeButton.addEventListener('click', resumeAfterMicStop);
    ui.retryButton.addEventListener('click', () => {
      if (!lastRun) return;
      const base = lastRun.origin;
      startRun(Object.assign({}, base, { questions: Q.buildQuestions(base.dan, base.mode) }));
    });
    ui.practiceMissedButton.addEventListener('click', () => {
      if (!lastRun) return;
      const missed = lastRun.results.filter((o) => o.kind !== K.GOOD).map((o) => o.question);
      if (missed.length === 0) return;
      startRun({
        dan: lastRun.dan,
        mode: lastRun.mode,
        questions: missed,
        practice: true,
        showReading: lastRun.showReading,
        label: 'できなかった しき',
        origin: lastRun.origin,
      });
    });
    ui.backButton.addEventListener('click', () => {
      refreshSelection();
      showScreen(isStopped() ? 'stopped' : 'title');
    });
  }

  // ===== じゅんび =====
  async function prepare() {
    if (!T.TrialRunner.isSupported()) {
      ui.readyState.textContent = 'この たんまつでは こえの にゅうりょくが つかえないよ。Safari で ひらいてね';
      return;
    }
    const result = await window.KukuDictionaryLoader.prepare({
      dicPath: C.DICT_PATH,
      serviceWorkerPath: C.SERVICE_WORKER_PATH,
      waitMs: C.SERVICE_WORKER_WAIT_MS,
      log,
    });
    ui.readyState.textContent = result.ok
      ? 'じゅんび できたよ！'
      : 'じゅんび できたよ（こたえの かずで はんていするよ）';
    ui.startButton.disabled = false;
  }

  // ===== はじめの画面 =====
  function buildDanButtons() {
    for (let dan = window.KukuReadings.MIN_NUMBER; dan <= window.KukuReadings.MAX_NUMBER; dan += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dan-button';
      button.dataset.dan = String(dan);
      const name = document.createElement('span');
      name.textContent = `${dan}のだん`;
      const marks = document.createElement('span');
      marks.className = 'dan-marks';
      button.append(name, marks);
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

  /** 選んでいるボタンと、ごうかくの★を表示し直す。 */
  function refreshSelection() {
    ui.danButtons.querySelectorAll('.dan-button').forEach((button) => {
      const dan = Number(button.dataset.dan);
      button.classList.toggle('selected', dan === selection.dan);
      const stars = C.MODES.filter((mode) => {
        const rec = records.get(dan, mode.id);
        return rec && rec.passed;
      }).length;
      button.querySelector('.dan-marks').textContent = '★'.repeat(stars);
    });
    ui.modeButtons.querySelectorAll('.mode-button').forEach((button) => {
      button.classList.toggle('selected', button.dataset.mode === selection.mode);
    });
  }

  // ===== あそぶ =====
  async function startRun(options) {
    if (starting || currentRun) return; // 続けて押された時に、2回始まらないように
    starting = true;
    runner.startMic(); // ボタンを押した処理の中でマイクを開く（iPad の決まり）。確かめる前に開いておく
    const allowed = await confirmNotStopped();
    starting = false;
    if (!allowed) {
      runner.stopMic();
      return;
    }
    const run = Object.assign({ results: [], index: 0 }, options);
    if (!run.origin) {
      run.origin = {
        dan: run.dan, mode: run.mode, practice: run.practice, showReading: run.showReading, label: run.label,
      };
    }
    currentRun = run;
    ui.playTitle.textContent = `${run.dan}のだん ・ ${run.label}${run.practice ? '（れんしゅう）' : ''}`;
    ui.pausePanel.hidden = true;
    showScreen('play');
    renderProgress(run);
    playLoop(run);
  }

  async function playLoop(run) {
    for (let n = C.START_COUNTDOWN_SEC; n >= 1; n -= 1) {
      setCard(String(n), 'じゅんび してね', '');
      await sleep(1000);
      if (currentRun !== run) return;
    }

    while (run.index < run.questions.length) {
      const question = run.questions[run.index];
      setCard('', 'よーい', '');
      resetTimer();
      renderProgress(run);

      let outcome;
      try {
        outcome = await runner.run(question, () => showQuestion(run, question));
      } catch (err) {
        if (currentRun !== run) return;
        if (err instanceof T.MicStoppedError) {
          await waitForResume(err.code);
          if (currentRun !== run) return;
          continue; // 同じ問題をもう一度
        }
        throw err;
      }
      if (currentRun !== run) return;

      run.results.push(outcome);
      run.index += 1;
      showFeedback(outcome);
      renderProgress(run);
      await sleep(outcome.kind === K.GOOD ? C.FEEDBACK_GOOD_MS : C.FEEDBACK_MISS_MS);
      if (currentRun !== run) return;
    }
    finishRun(run);
  }

  function showQuestion(run, question) {
    if (currentRun !== run) return;
    setCard(`${question.a}×${question.b}`, run.showReading ? question.reading : '', '');
    startTimer();
  }

  function markHeard() {
    if (!currentRun) return;
    ui.card.classList.add('heard');
    ui.timerBar.classList.add('stopped');
  }

  function showFeedback(outcome) {
    const fb = FEEDBACK[outcome.kind];
    setCard(fb.mark, `${outcome.question.a}×${outcome.question.b}　${fb.text(outcome.question)}`, outcome.kind);
    ui.timerBar.classList.add('stopped');
  }

  function waitForResume(code) {
    ui.pauseMessage.textContent = MIC_MESSAGES[code] || MIC_MESSAGE_DEFAULT;
    ui.pausePanel.hidden = false;
    resetTimer();
    setCard('', '', '');
    return new Promise((resolve) => { resumeWaiter = resolve; });
  }

  function resumeAfterMicStop() {
    ui.pausePanel.hidden = true;
    runner.resumeMic(); // ボタンを押した処理の中で開き直す
    const resolve = resumeWaiter;
    resumeWaiter = null;
    if (resolve) resolve();
  }

  function quitRun() {
    abandonRun();
    refreshSelection();
    showScreen('title');
  }

  /** 遊びを途中でやめて、マイクを止める（画面は変えない） */
  function abandonRun() {
    currentRun = null;
    resumeWaiter = null;
    runner.stopMic();
    ui.pausePanel.hidden = true;
  }

  // ===== けっか =====
  function finishRun(run) {
    currentRun = null;
    runner.stopMic();
    lastRun = run;
    const total = run.results.length;
    const goodCount = run.results.filter((o) => o.kind === K.GOOD).length;
    const passed = goodCount === total;
    const isFullTest = !run.practice && total === window.KukuReadings.MAX_NUMBER;
    const saved = isFullTest ? records.record(run.dan, run.mode, goodCount, total) : null;

    ui.resultTitle.textContent = passed ? 'ごうかく！' : 'あと すこし！';
    ui.resultTitle.classList.toggle('pass', passed);
    ui.resultScore.textContent = `${total}もん ちゅう ${goodCount}もん できたよ`;
    if (!isFullTest) ui.resultNote.textContent = 'れんしゅうなので、きろくは のこらないよ';
    else if (saved && saved.firstPass) ui.resultNote.textContent = 'はじめて ごうかく！ ★が ついたよ';
    else if (passed) ui.resultNote.textContent = 'すごい！ また ごうかく！';
    else ui.resultNote.textContent = '△と× の しきを れんしゅう しよう';

    ui.resultList.replaceChildren(...run.results.map(renderResultItem));
    ui.practiceMissedButton.hidden = passed;
    showScreen('result');
  }

  function renderResultItem(outcome) {
    const li = document.createElement('li');
    const mark = document.createElement('span');
    mark.className = `result-mark ${outcome.kind}`;
    mark.textContent = FEEDBACK[outcome.kind].mark;
    const formula = document.createElement('span');
    formula.textContent = `${outcome.question.a}×${outcome.question.b}＝${outcome.question.product}`;
    li.append(mark, formula);
    if (outcome.kind !== K.GOOD) {
      const reading = document.createElement('span');
      reading.className = 'result-reading';
      reading.textContent = outcome.question.reading;
      li.appendChild(reading);
    }
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
      if (i < run.results.length) dot.classList.add(run.results[i].kind);
      else if (i === run.index) dot.classList.add('current');
      return dot;
    });
    ui.progress.replaceChildren(...dots);
  }

  function resetTimer() {
    ui.timerBar.classList.remove('running', 'stopped');
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

  function log(tag, text) {
    if (window.console && console.debug) console.debug(`[kentei] ${tag} ${text}`);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
