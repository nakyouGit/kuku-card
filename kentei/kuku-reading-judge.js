/**
 * kuku-reading-judge.js
 * 九九の「読み方」が正しいかを、3段階（○・×・？）で判定する。
 *
 * 音声認識は「兄さんがさん」「変化 額」のように言葉として返すため、
 * 辞書（kuromoji）で読みがなに直してから、正しい読みとの近さを測る。
 * よくある読み違い（なな・きゅう・よん・はちはち など）の方が近ければ × にする。
 * 数字で返ってきた部分は読み方が分からないので、既定では ？（先生が確認）にする。
 *
 * 使う前に KukuJudge（kuku-judge.js）と kuromoji（vendor/kuromoji/kuromoji.js）を読み込むこと。
 */
(function (global) {
  'use strict';

  const SETTINGS = Object.freeze({
    OK_SIMILARITY: 0.6,      // これ以上近ければ ○（2026-11-19 のログで決めた）
    NG_SIMILARITY: 0.4,      // これより遠ければ ×
    DIGITS_MAKE_UNKNOWN: true, // 読み方が分からない数字で返った時は ？ にする
    MAX_COMBINATIONS: 256,
  });

  // 子どもが読み違えやすい数字（し/よん、しち/なな、く/きゅう）
  const AMBIGUOUS_DIGITS = /[479]/;
  const KANJI_NUMERAL_ONLY = /^[〇零一二三四五六七八九十]+$/;

  const VERDICTS = Object.freeze({ OK: 'ok', NG: 'ng', UNKNOWN: 'unknown' });

  const UNIT_READINGS = Object.freeze({
    1: ['いち', 'いん'], 2: ['に'], 3: ['さん', 'さ'], 4: ['し', 'よん'], 5: ['ご'],
    6: ['ろく', 'ろっ'], 7: ['しち', 'なな'], 8: ['はち', 'はっ', 'は', 'ぱ'], 9: ['く', 'きゅう'],
  });

  // 正しい読み → よくある読み違い。guard は、その位置で置き換えてよいか。
  const WRONG_RULES = Object.freeze([
    { from: 'いん', to: 'いち' },
    { from: 'しちじゅう', to: 'ななじゅう' },
    { from: 'しじゅう', to: 'よんじゅう' },
    { from: 'くじゅう', to: 'きゅうじゅう' },
    { from: 'しち', to: 'なな' },
    { from: 'し', to: 'よん', guard: (s, i) => s[i + 1] !== 'ち' && !s.startsWith('じゅう', i + 1) },
    { from: 'く', to: 'きゅう', guard: (s, i) => s[i - 1] !== 'ろ' && s[i - 1] !== 'っ' && s[i + 1] !== 'じ' },
    { from: 'はっぱ', to: 'はちはち' },
    { from: 'はっく', to: 'はちく' },
    { from: 'ごっく', to: 'ごく' },
    { from: 'ろっく', to: 'ろくく' },
    { from: 'さざん', to: 'さんさん' },
    { from: 'さぶろく', to: 'さんろく' },
    { from: 'さんぱ', to: 'さんはち' },
    { from: 'にんが', to: 'にが' },
  ]);

  let tokenizer = null;
  let loadPromise = null;

  // ===== 辞書の読み込み =====
  function load(dicPath) {
    if (tokenizer) return Promise.resolve();
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      if (!global.kuromoji) {
        reject(new Error('kuromoji が読み込まれていません'));
        return;
      }
      global.kuromoji.builder({ dicPath }).build((err, built) => {
        if (err) {
          loadPromise = null;
          reject(err);
          return;
        }
        tokenizer = built;
        resolve();
      });
    });
    return loadPromise;
  }

  /** 試験用: 用意済みの tokenizer を使う。 */
  function useTokenizer(built) {
    tokenizer = built;
  }

  function isReady() {
    return tokenizer !== null;
  }

  // ===== 読みがなに直す =====
  /** 認識結果を「読みがなの部分」と「数字の部分」に分ける。 */
  function toSegments(transcript) {
    const text = String(transcript || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const segments = [];
    tokenizer.tokenize(text).forEach((token) => {
      const surface = token.surface_form;
      // 漢数字は辞書が「なな」「きゅう」と読んでしまうため、数字と同じく読み方不明として扱う
      if (KANJI_NUMERAL_ONLY.test(surface)) {
        global.KukuJudge.extractNumbers(surface).forEach((value) => {
          segments.push({ type: 'num', raw: String(value), value, fromKanji: true });
        });
        return;
      }
      if (/^[0-9]+$/.test(surface)) {
        const prev = segments[segments.length - 1];
        if (prev && prev.type === 'num' && !prev.fromKanji) {
          prev.raw += surface;
          prev.value = Number(prev.raw);
        } else {
          segments.push({ type: 'num', raw: surface, value: Number(surface) });
        }
        return;
      }
      const reading = token.reading && token.reading !== '*' ? token.reading : surface;
      const kana = global.KukuJudge.normalizeText(reading);
      if (kana) segments.push({ type: 'kana', text: kana });
    });
    return segments;
  }

  /** 数の読み方の候補（例 18 → じゅうはち、いちはち…）。 */
  function numberReadings(n) {
    const out = new Set();
    const units = (d) => UNIT_READINGS[d] || [];
    if (n >= 1 && n <= 9) units(n).forEach((r) => out.add(r));
    if (n >= 10 && n <= 99) {
      const tens = Math.floor(n / 10);
      const ones = n % 10;
      const tensHeads = tens === 1 ? [''] : units(tens);
      const onesTails = ones === 0 ? [''] : units(ones);
      tensHeads.forEach((h) => onesTails.forEach((t) => out.add(`${h}じゅう${t}`)));
      // 「22」が「に に」の意味で返ることもあるため、1けたずつの読みも入れる
      if (ones !== 0) units(tens).forEach((h) => units(ones).forEach((t) => out.add(h + t)));
    }
    return out.size ? [...out] : [String(n)];
  }

  /** 数字の部分を読みに置き換えた、読みがなの並びの候補を作る。 */
  function expandSegments(segments) {
    let combos = [''];
    for (const seg of segments) {
      const options = seg.type === 'num' ? numberReadings(seg.value) : [seg.text];
      const next = [];
      for (const head of combos) {
        for (const option of options) {
          next.push(head + option);
          if (next.length >= SETTINGS.MAX_COMBINATIONS) break;
        }
        if (next.length >= SETTINGS.MAX_COMBINATIONS) break;
      }
      combos = next;
    }
    return combos;
  }

  // ===== 近さを測る =====
  function editDistance(a, b) {
    const x = Array.from(a);
    const y = Array.from(b);
    let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
    for (let i = 1; i <= x.length; i += 1) {
      const cur = [i];
      for (let j = 1; j <= y.length; j += 1) {
        const cost = x[i - 1] === y[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[y.length];
  }

  function similarity(a, b) {
    const longer = Math.max(Array.from(a).length, Array.from(b).length);
    return longer === 0 ? 1 : 1 - editDistance(a, b) / longer;
  }

  /** よくある読み違いの候補を作る（一か所ずつ置き換えたもの）。 */
  function wrongVariants(reading) {
    const out = new Set();
    for (const rule of WRONG_RULES) {
      let index = reading.indexOf(rule.from);
      while (index !== -1) {
        if (!rule.guard || rule.guard(reading, index)) {
          out.add(reading.slice(0, index) + rule.to + reading.slice(index + rule.from.length));
        }
        index = reading.indexOf(rule.from, index + 1);
      }
    }
    out.delete(reading);
    return [...out];
  }

  /**
   * 数字の部分で、読み方の判定に要る情報が消えているか。
   * 答え（最後）以外が数字なら消えている。答えでも 4・7・9 を含めば消えている（よん・なな・きゅうと読んだか分からない）。
   */
  function hidesReading(segments) {
    const lastIndex = segments.length - 1;
    return segments.some((seg, i) => seg.type === 'num'
      && (i !== lastIndex || AMBIGUOUS_DIGITS.test(String(seg.value))));
  }

  // ===== 判定 =====
  /**
   * @param {string[]} transcripts 認識の候補（一番目が本命）
   * @returns {{verdict:string, reason:string, kana:string, similarity:number|null,
   *            nearestWrong:string|null, hasDigits:boolean, transcript:string}}
   */
  function judgeReading(transcripts, a, b, expectedReading) {
    const base = { kana: '', similarity: null, nearestWrong: null, hasDigits: false, transcript: transcripts[0] || '' };
    if (!tokenizer) {
      return Object.assign(base, { verdict: VERDICTS.UNKNOWN, reason: '辞書の読み込みがまだです' });
    }
    const expected = global.KukuJudge.normalizeText(expectedReading);
    const variants = wrongVariants(expected);

    let best = null;
    for (const transcript of transcripts) {
      const segments = toSegments(transcript);
      if (segments.length === 0) continue;
      const hasDigits = segments.some((s) => s.type === 'num');
      const digitsHideReading = hidesReading(segments);
      const answerWrong = hasDigits && !global.KukuJudge.judge(transcript, a, b, '').ok;
      for (const kana of expandSegments(segments)) {
        const sim = similarity(kana, expected);
        const distance = editDistance(kana, expected);
        let nearestWrong = null;
        for (const v of variants) {
          const d = editDistance(kana, v);
          if (!nearestWrong || d < nearestWrong.distance) nearestWrong = { reading: v, distance: d };
        }
        const candidate = { transcript, kana, similarity: sim, distance, nearestWrong, hasDigits, digitsHideReading, answerWrong };
        if (!best || candidate.similarity > best.similarity) best = candidate;
      }
    }

    if (!best) return Object.assign(base, { verdict: VERDICTS.NG, reason: '聞き取れませんでした' });

    const result = {
      kana: best.kana,
      similarity: best.similarity,
      nearestWrong: best.nearestWrong ? best.nearestWrong.reading : null,
      hasDigits: best.hasDigits,
      transcript: best.transcript,
    };
    const verdict = (v, reason) => Object.assign(result, { verdict: v, reason });

    if (best.answerWrong) return verdict(VERDICTS.NG, '答えの数がちがいます');
    if (best.nearestWrong && best.nearestWrong.distance < best.distance) {
      return verdict(VERDICTS.NG, `よくある読み違い（${best.nearestWrong.reading}）に近い`);
    }
    if (best.similarity < SETTINGS.NG_SIMILARITY) return verdict(VERDICTS.NG, '正しい読みから遠い');
    if (best.similarity >= SETTINGS.OK_SIMILARITY) {
      if (best.digitsHideReading && SETTINGS.DIGITS_MAKE_UNKNOWN) {
        return verdict(VERDICTS.UNKNOWN, '数字で聞き取られた部分があるため、読み方は先生が確認');
      }
      return verdict(VERDICTS.OK, '正しい読みに近い');
    }
    return verdict(VERDICTS.UNKNOWN, 'どちらとも言えないため、先生が確認');
  }

  global.KukuReadingJudge = Object.freeze({
    SETTINGS,
    VERDICTS,
    load,
    useTokenizer,
    isReady,
    toSegments,
    numberReadings,
    wrongVariants,
    editDistance,
    similarity,
    judgeReading,
  });
})(window);
