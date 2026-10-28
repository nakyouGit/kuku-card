// 画面の表示（ゲームの決まりは持たない。モードから呼ばれて見た目だけを変える）

const CPU_LINES = {
  idle: 'つぎも まけないよ',
  thinking: 'うーん、どれかな…',
  won: 'とった！',
  lost: 'はやい！ まけた〜',
  missed: 'あっ、まちがえた！',
};

const TAKE_EFFECT_MS = 650;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function exprText(card) {
  return `${card.a}×${card.b}`;
}

export function createGameView(root) {
  const $ = (sel) => root.querySelector(sel);
  const roundEl = $('#round');
  const scorePlayerEl = $('#score-player');
  const scoreCpuEl = $('#score-cpu');
  const targetEl = $('#target');
  const boardEl = $('#board');
  const messageEl = $('#message');
  const cpuBubbleEl = $('#cpu-bubble');
  const cpuEl = $('#cpu');

  let shownIds = new Set();

  function setMessage(text, tone = '') {
    messageEl.textContent = text;
    messageEl.dataset.tone = tone;
  }

  function cardButton(id) {
    return boardEl.querySelector(`[data-id="${id}"]`);
  }

  function bump(node, className) {
    node.classList.remove(className);
    void node.offsetWidth; // アニメーションをやり直すため
    node.classList.add(className);
  }

  return {
    setRound(round, total) {
      roundEl.textContent = `${round} / ${total}`;
    },

    setScores({ player, cpu }) {
      scorePlayerEl.textContent = player;
      scoreCpuEl.textContent = cpu;
    },

    setCpuState(state) {
      cpuBubbleEl.textContent = CPU_LINES[state] ?? '';
      cpuEl.dataset.state = state;
    },

    showReady() {
      targetEl.innerHTML = '';
      targetEl.append(el('div', 'target-ready', 'よーい…'));
      if (boardEl.classList.contains('board--compare')) boardEl.innerHTML = '';
      boardEl.classList.add('is-waiting');
      boardEl.classList.remove('player-locked');
      setMessage('');
    },

    /** カードとり: 場を並べ直す（新しく来たカードだけ配るアニメーション） */
    renderField(cards, onTap) {
      boardEl.className = 'board board--field is-waiting';
      boardEl.innerHTML = '';
      const nextIds = new Set();
      cards.forEach((card, index) => {
        const button = el('button', 'card', exprText(card));
        button.type = 'button';
        button.dataset.id = card.id;
        button.setAttribute('aria-label', `${card.a} かける ${card.b}`);
        if (!shownIds.has(card.id)) {
          button.classList.add('is-new');
          button.style.animationDelay = `${(index % 12) * 25}ms`;
        }
        button.addEventListener('click', () => onTap(card.id));
        boardEl.append(button);
        nextIds.add(card.id);
      });
      shownIds = nextIds;
    },

    showTarget(target) {
      targetEl.innerHTML = '';
      if (target.kind === 'number') {
        targetEl.append(el('div', 'target-number', String(target.product)));
        targetEl.append(el('p', 'target-caption', 'こたえが この 数に なる カードは？'));
      } else {
        targetEl.append(el('div', 'card card--target', target.label));
        targetEl.append(el('p', 'target-caption', 'こたえが おなじに なる カードは？'));
      }
      boardEl.classList.remove('is-waiting');
    },

    showMiss(who, id) {
      const node = cardButton(id);
      if (node) bump(node, who === 'player' ? 'miss-player' : 'miss-cpu');
      if (who === 'player') {
        boardEl.classList.add('player-locked');
        setMessage('おてつき！ この もんだいは おやすみ', 'miss');
      } else {
        this.setCpuState('missed');
      }
    },

    showTaken(who, id) {
      const node = cardButton(id);
      if (!node) return;
      node.classList.add(who === 'player' ? 'taken-player' : 'taken-cpu');
      setTimeout(() => node.classList.add('is-gone'), TAKE_EFFECT_MS);
      setMessage(who === 'player' ? 'やったね！ とれた！' : 'コンピューターが とった', who === 'player' ? 'win' : 'lose');
    },

    revealAnswers(ids) {
      boardEl.classList.add('is-waiting');
      ids.forEach((id) => {
        const node = cardButton(id);
        if (node && !node.classList.contains('taken-player') && !node.classList.contains('taken-cpu')) {
          node.classList.add('is-answer');
        }
      });
      if (!messageEl.textContent) setMessage('だれも とれなかった。ひかって いるのが こたえ', '');
    },

    /** 大きさくらべ: 2枚と「おなじ」を出す */
    showCompare(left, right, onPick) {
      boardEl.className = 'board board--compare';
      boardEl.innerHTML = '';
      targetEl.innerHTML = '';
      targetEl.append(el('p', 'target-caption', 'こたえが 大きい ほうは どっち？'));
      const makePick = (side, label, extraClass) => {
        const button = el('button', `pick ${extraClass}`, label);
        button.type = 'button';
        button.dataset.side = side;
        button.addEventListener('click', () => onPick(side));
        return button;
      };
      boardEl.append(
        makePick('left', exprText(left), 'card card--big is-new'),
        makePick('same', 'おなじ', 'pick--same'),
        makePick('right', exprText(right), 'card card--big is-new'),
      );
    },

    showComparePick(who, side, ok) {
      const node = boardEl.querySelector(`[data-side="${side}"]`);
      if (!node) return;
      if (ok) {
        node.classList.add(who === 'player' ? 'taken-player' : 'taken-cpu');
        setMessage(who === 'player' ? 'やったね！ 2まい ゲット！' : 'コンピューターが 2まい ゲット', who === 'player' ? 'win' : 'lose');
        return;
      }
      bump(node, who === 'player' ? 'miss-player' : 'miss-cpu');
      if (who === 'player') {
        boardEl.classList.add('player-locked');
        setMessage('おてつき！ この もんだいは おやすみ', 'miss');
      } else {
        this.setCpuState('missed');
      }
    },

    revealCompare(answer) {
      boardEl.classList.add('is-waiting');
      const node = boardEl.querySelector(`[data-side="${answer}"]`);
      if (node && !node.classList.contains('taken-player') && !node.classList.contains('taken-cpu')) {
        node.classList.add('is-answer');
      }
      if (!messageEl.textContent) setMessage('だれも とれなかった。ひかって いるのが こたえ', '');
    },

    reset() {
      shownIds = new Set();
      targetEl.innerHTML = '';
      boardEl.innerHTML = '';
      setMessage('');
      this.setCpuState('idle');
    },
  };
}

/** 結果の画面 */
export function renderResult(root, summary) {
  const { score, review } = summary;
  const headline = root.querySelector('#result-headline');
  const scoresEl = root.querySelector('#result-scores');
  const reviewEl = root.querySelector('#result-review');

  let verdict;
  if (score.player > score.cpu) verdict = 'あなたの かち！';
  else if (score.player < score.cpu) verdict = 'コンピューターの かち';
  else verdict = 'ひきわけ！';
  headline.textContent = verdict;
  root.dataset.outcome = score.player > score.cpu ? 'win' : score.player < score.cpu ? 'lose' : 'draw';

  scoresEl.innerHTML = '';
  scoresEl.append(
    el('div', 'result-score result-score--player', `あなた ${score.player}まい`),
    el('div', 'result-score result-score--cpu', `コンピューター ${score.cpu}まい`),
  );

  reviewEl.innerHTML = '';
  if (review.length === 0) {
    reviewEl.append(el('p', 'review-perfect', 'ぜんぶ じぶんで とれたね。すごい！'));
    return;
  }
  reviewEl.append(el('h3', 'review-title', 'もう いちど たしかめよう'));
  const list = el('ul', 'review-list');
  review.forEach((item) => {
    const li = el('li', 'review-item');
    li.append(el('span', 'review-q', item.question), el('span', 'review-a', item.answer));
    list.append(li);
  });
  reviewEl.append(list);
}
