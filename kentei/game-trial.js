/**
 * game-trial.js
 * 1問ぶんの「式を出す → 聞く → 判定する」を受け持つ。
 *
 * 結果の種類（kind）:
 *   good   … 1秒以内に言い始め、明確な読み違いなし
 *   late   … 読み方はよいが、言い始めがおそい
 *   wrong  … 読み違い・答えの数がちがう
 *   silent … 聞き取れなかった
 */
(function (global) {
  'use strict';

  const KINDS = Object.freeze({ GOOD: 'good', LATE: 'late', WRONG: 'wrong', SILENT: 'silent' });

  class MicStoppedError extends Error {
    constructor(code) {
      super(`mic stopped: ${code || 'unknown'}`);
      this.name = 'MicStoppedError';
      this.code = code || '';
    }
  }

  function readNoReopenMark(key) {
    try { return global.localStorage.getItem(key) === '1'; } catch (err) { return false; }
  }

  function writeNoReopenMark(key) {
    try { global.localStorage.setItem(key, '1'); } catch (err) { /* 残せなくても、この回は開き直さない */ }
  }

  function stripPrefix(text, prefix) {
    return prefix && text.startsWith(prefix) ? text.slice(prefix.length) : text;
  }

  class TrialRunner {
    /**
     * @param {object} config KukuGameConfig
     * @param {object} hooks { onSpeechDetected(), onLog(tag, text) }
     */
    constructor(config, hooks = {}) {
      this._config = config;
      this._hooks = hooks;
      this._session = null;
      this._latest = new Map();
      this._trial = null;
      this._reopen = config.REOPEN_EACH_QUESTION && !readNoReopenMark(config.NO_REOPEN_STORAGE_KEY);
      this._lastErrorCode = '';
      this._micStartedAt = 0;
      this._lastReopenAt = 0;
      this._stoppedAfterReopen = false;
    }

    static isSupported() {
      return global.SpeechSession.isSupported();
    }

    /** マイクを開く。iPad では必ずボタンを押した処理の中から呼ぶ。 */
    startMic() {
      if (!this._session) {
        this._session = new global.SpeechSession({
          lang: this._config.LANG,
          maxAlternatives: this._config.MAX_ALTERNATIVES,
          onEvent: (ev) => this._handleEvent(ev),
          onResult: (r) => this._handleResult(r),
          onError: (e) => this._handleError(e),
          onStateChange: (state) => this._handleState(state),
        });
      }
      this._lastErrorCode = '';
      if (!this._session.isRunning) {
        this._micStartedAt = performance.now();
        this._session.start();
      }
    }

    /**
     * マイクが止まった後に、ボタンから再開する。
     * 開き直した直後に止まった時は、この端末では開き直せない（iPad はボタンを押した時しかマイクを開けないことがある）とみなし、
     * 以後は開き直さずに聞き続ける。その印は端末に残す。
     */
    resumeMic() {
      if (this._stoppedAfterReopen && this._reopen) {
        this._reopen = false;
        writeNoReopenMark(this._config.NO_REOPEN_STORAGE_KEY);
        this._log('mic', 'reopen disabled');
      }
      this._stoppedAfterReopen = false;
      this.startMic();
    }

    stopMic() {
      this.cancel();
      if (this._session) this._session.stop();
    }

    get lastErrorCode() {
      return this._lastErrorCode;
    }

    /** 開き直した直後に止まったか（その時は、つづけるで直る） */
    get stoppedAfterReopen() {
      return this._stoppedAfterReopen;
    }

    /**
     * 1問を出して判定する。
     * @param {object} question { a, b, reading }
     * @param {() => void} onShow 式を画面に出す時に呼ぶ
     * @returns {Promise<object>} 結果。マイクが止まった時は MicStoppedError で失敗する
     */
    run(question, onShow) {
      if (this._trial) return Promise.reject(new Error('前の問題がまだ終わっていません'));
      return new Promise((resolve, reject) => {
        if (!this._session || !this._session.isRunning) {
          reject(new MicStoppedError(this._lastErrorCode));
          return;
        }
        const trial = {
          question, resolve, reject,
          t0: null, firstResultAt: null, lastUpdateAt: null, speechStartAt: null,
          alternatives: [], baseline: new Map(), timerId: null, warmupId: null,
        };
        this._trial = trial;
        const now = performance.now();
        if (this._reopen && now - this._micStartedAt >= this._config.REOPEN_MIN_AGE_MS) {
          this._lastReopenAt = now;
          this._session.restartNow();
        }
        trial.warmupId = setTimeout(() => {
          if (this._trial !== trial) return;
          trial.baseline = new Map(this._latest);
          trial.t0 = performance.now();
          onShow();
          this._log('trial', `show ${question.a}x${question.b}`);
          this._scheduleCheck(trial);
        }, this._config.MIC_WARMUP_MS);
      });
    }

    /** 進行中の問題を捨てる（やめる時）。 */
    cancel() {
      const trial = this._trial;
      if (!trial) return;
      clearTimeout(trial.warmupId);
      clearTimeout(trial.timerId);
      this._trial = null;
    }

    // ===== 音声認識からの知らせ =====
    _handleEvent(ev) {
      this._log('event', ev.name);
      if (ev.name === 'start') {
        this._latest.clear();
        if (this._trial) this._trial.baseline = new Map();
      }
      const trial = this._trial;
      const isSpeech = ev.name === 'speechstart' || ev.name === 'soundstart';
      if (trial && trial.t0 !== null && ev.at >= trial.t0 && isSpeech && trial.speechStartAt === null) {
        trial.speechStartAt = ev.at;
        if (this._hooks.onSpeechDetected) this._hooks.onSpeechDetected();
      }
    }

    _handleResult(r) {
      const transcripts = r.alternatives.map((alt) => alt.transcript);
      this._log(r.isFinal ? 'final' : 'interim', `#${r.index} ${transcripts.join(' | ')}`);
      const trial = this._trial;
      if (trial && trial.t0 !== null && r.at >= trial.t0) {
        const base = trial.baseline.get(r.index) || '';
        const alternatives = transcripts.map((t) => stripPrefix(t, base).trim()).filter(Boolean);
        if (alternatives.length > 0) {
          if (trial.firstResultAt === null) {
            trial.firstResultAt = r.at;
            if (trial.speechStartAt === null && this._hooks.onSpeechDetected) this._hooks.onSpeechDetected();
          }
          trial.lastUpdateAt = r.at;
          trial.alternatives = alternatives;
          if (r.isFinal) this._finish(trial, 'final');
        }
      }
      this._latest.set(r.index, transcripts[0] || '');
    }

    _handleError(e) {
      if (e.code !== 'no-speech' && e.code !== 'aborted') this._lastErrorCode = e.code;
      this._log('error', e.code);
    }

    _handleState(state) {
      this._log('mic', state);
      if (state !== global.SpeechSession.STATES.STOPPED) return;
      if (this._lastReopenAt && performance.now() - this._lastReopenAt <= this._config.REOPEN_FAILURE_WINDOW_MS) {
        this._stoppedAfterReopen = true;
      }
      if (!this._trial) return;
      const trial = this._trial;
      this.cancel();
      trial.reject(new MicStoppedError(this._lastErrorCode));
    }

    // ===== 判定 =====
    _scheduleCheck(trial) {
      trial.timerId = setTimeout(() => this._check(trial), this._config.CHECK_INTERVAL_MS);
    }

    _check(trial) {
      if (this._trial !== trial) return;
      const now = performance.now();
      const settled = trial.lastUpdateAt !== null
        && (now - trial.lastUpdateAt) / 1000 >= this._config.SETTLE_AFTER_LAST_INTERIM_SEC;
      if (settled) { this._finish(trial, 'settled'); return; }
      if ((now - trial.t0) / 1000 >= this._config.QUESTION_TIMEOUT_SEC) { this._finish(trial, 'timeout'); return; }
      this._scheduleCheck(trial);
    }

    _finish(trial, reason) {
      if (this._trial !== trial) return;
      this.cancel();
      const outcome = this._evaluate(trial);
      this._log('result', `${trial.question.a}x${trial.question.b} kind=${outcome.kind} start=${outcome.startSec === null ? '-' : outcome.startSec.toFixed(2)} text="${outcome.transcript}" kana="${outcome.kana}" reason=${reason}`);
      trial.resolve(outcome);
    }

    _evaluate(trial) {
      const c = this._config;
      const q = trial.question;
      const secFromT0 = (at) => (at === null ? null : (at - trial.t0) / 1000);
      const speechSec = secFromT0(trial.speechStartAt);
      const firstSec = secFromT0(trial.firstResultAt);
      let startSec = speechSec;
      if (startSec === null && firstSec !== null) startSec = Math.max(0, firstSec - c.INTERIM_LAG_SEC);

      const base = { question: q, startSec, transcript: trial.alternatives[0] || '', kana: '', reason: '' };
      if (trial.alternatives.length === 0) return Object.assign(base, { kind: KINDS.SILENT });

      const reading = global.KukuReadingJudge.judgeReading(trial.alternatives, q.a, q.b, q.reading);
      Object.assign(base, { kana: reading.kana, reason: reading.reason });
      if (reading.verdict !== global.KukuReadingJudge.VERDICTS.OK) return Object.assign(base, { kind: KINDS.WRONG });
      const inTime = startSec !== null && startSec <= c.LIMIT_SEC + c.TIMING_GRACE_SEC;
      return Object.assign(base, { kind: inTime ? KINDS.GOOD : KINDS.LATE });
    }

    _log(tag, text) {
      if (this._hooks.onLog) this._hooks.onLog(tag, text);
    }
  }

  global.KukuGameTrial = Object.freeze({ KINDS, MicStoppedError, TrialRunner });
})(window);
