/**
 * speech-session.js
 * ブラウザの音声認識（Web Speech API）を包む。
 * - 聞きっぱなし（continuous）で途中結果も受け取る
 * - iPad で勝手に止まった時は自動で聞き直す
 * - 聞き直しが短い間に続きすぎたら止めて知らせる
 */
(function (global) {
  'use strict';

  const DEFAULT_OPTIONS = Object.freeze({
    lang: 'ja-JP',
    maxAlternatives: 5,
    autoRestart: true,
    restartDelayMs: 50,
    restartLoopWindowMs: 3000,
    restartLoopLimit: 5,
    startTimeoutMs: 2000, // start() のあと、この間に開始の知らせが来なければ失敗とみなす（iPad は黙って開かないことがある）
  });

  const FATAL_ERRORS = new Set([
    'not-allowed',
    'service-not-allowed',
    'audio-capture',
    'language-not-supported',
  ]);

  const PASSIVE_EVENTS = Object.freeze([
    'start', 'audiostart', 'soundstart', 'speechstart', 'speechend', 'soundend', 'audioend',
  ]);

  const STATES = Object.freeze({ RUNNING: 'running', STOPPED: 'stopped' });

  function getRecognitionConstructor() {
    return global.SpeechRecognition || global.webkitSpeechRecognition || null;
  }

  function noop() {}

  class SpeechSession {
    constructor(options = {}) {
      this._options = Object.assign({}, DEFAULT_OPTIONS, options);
      this._handlers = {
        event: options.onEvent || noop,
        result: options.onResult || noop,
        error: options.onError || noop,
        state: options.onStateChange || noop,
      };
      this._recognition = null;
      this._wanted = false;
      this._restartTimer = null;
      this._recentRestarts = [];
      this._startCount = 0;
      this._restartCount = 0;
      this._startWatchdog = null;
    }

    static isSupported() {
      return getRecognitionConstructor() !== null;
    }

    get isRunning() {
      return this._wanted;
    }

    get stats() {
      return { startCount: this._startCount, restartCount: this._restartCount };
    }

    /** 聞き始める。iPad では最初の1回をボタンを押した処理の中から呼ぶこと。 */
    start() {
      if (this._wanted) return;
      this._wanted = true;
      this._recentRestarts = [];
      this._handlers.state(STATES.RUNNING);
      this._spawn();
    }

    stop() {
      this._wanted = false;
      clearTimeout(this._restartTimer);
      clearTimeout(this._startWatchdog);
      this._disposeCurrent();
      this._emitEvent('stopped-by-user');
      this._handlers.state(STATES.STOPPED);
    }

    /** 今の認識を捨てて、すぐに開き直す（ボタンを押した処理の中から呼ぶ）。 */
    restartNow() {
      if (!this._wanted) {
        this.start();
        return;
      }
      clearTimeout(this._restartTimer);
      this._disposeCurrent();
      this._spawn();
    }

    _spawn() {
      const Recognition = getRecognitionConstructor();
      if (!Recognition) {
        this._fail('not-supported');
        return;
      }
      const recognition = new Recognition();
      recognition.lang = this._options.lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = this._options.maxAlternatives;

      PASSIVE_EVENTS.forEach((name) => {
        recognition[`on${name}`] = () => this._emitEvent(name);
      });
      recognition.onstart = () => {
        clearTimeout(this._startWatchdog);
        this._emitEvent('start');
      };
      recognition.onresult = (event) => this._handleResult(event);
      recognition.onerror = (event) => this._handleError(event);
      recognition.onend = () => this._handleEnd(recognition);

      this._recognition = recognition;
      try {
        recognition.start();
        this._startCount += 1;
        clearTimeout(this._startWatchdog);
        this._startWatchdog = setTimeout(() => {
          if (this._recognition === recognition && this._wanted) {
            this._disposeCurrent();
            this._fail('start-timeout');
          }
        }, this._options.startTimeoutMs);
      } catch (err) {
        this._fail(`start-failed: ${(err && err.message) || err}`);
      }
    }

    _disposeCurrent() {
      const recognition = this._recognition;
      this._recognition = null;
      if (!recognition) return;
      PASSIVE_EVENTS.forEach((name) => { recognition[`on${name}`] = null; });
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch (err) { /* すでに止まっている */ }
    }

    _emitEvent(name, detail) {
      this._handlers.event({ name, detail, at: performance.now() });
    }

    _handleResult(event) {
      const at = performance.now();
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const alternatives = [];
        for (let j = 0; j < result.length; j += 1) {
          alternatives.push({ transcript: result[j].transcript, confidence: result[j].confidence });
        }
        this._handlers.result({ index: i, isFinal: result.isFinal, alternatives, at });
      }
    }

    _handleError(event) {
      const code = event.error || 'unknown';
      this._handlers.error({ code, message: event.message || '', at: performance.now() });
      if (FATAL_ERRORS.has(code)) {
        this._wanted = false;
        clearTimeout(this._restartTimer);
        this._handlers.state(STATES.STOPPED);
      }
    }

    _handleEnd(recognition) {
      if (recognition !== this._recognition) return;
      this._recognition = null;
      this._emitEvent('end');

      if (!this._wanted || !this._options.autoRestart) {
        this._wanted = false;
        this._handlers.state(STATES.STOPPED);
        return;
      }

      const now = performance.now();
      this._recentRestarts = this._recentRestarts
        .filter((t) => now - t < this._options.restartLoopWindowMs);
      this._recentRestarts.push(now);
      if (this._recentRestarts.length > this._options.restartLoopLimit) {
        this._fail('restart-loop');
        return;
      }

      this._restartTimer = setTimeout(() => {
        if (!this._wanted) return;
        this._restartCount += 1;
        this._emitEvent('auto-restart');
        this._spawn();
      }, this._options.restartDelayMs);
    }

    _fail(code) {
      this._wanted = false;
      clearTimeout(this._restartTimer);
      clearTimeout(this._startWatchdog);
      this._recognition = null;
      this._handlers.error({ code, message: '', at: performance.now() });
      this._handlers.state(STATES.STOPPED);
    }
  }

  SpeechSession.STATES = STATES;
  global.SpeechSession = SpeechSession;
})(window);
