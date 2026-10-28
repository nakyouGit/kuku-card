// 設定の読み書きと、設定画面の操作

import {
  ALL_DANS, CPU_LEVELS, DEFAULT_SETTINGS, MODES, ROUND_OPTIONS, STORAGE_KEY, TAKE_SAME_MIN_DANS,
} from './config.js';

/** 保存値を検証し、おかしな値は既定値に戻す */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!Object.hasOwn(MODES, s.mode)) s.mode = DEFAULT_SETTINGS.mode;
  if (!Object.hasOwn(CPU_LEVELS, s.level)) s.level = DEFAULT_SETTINGS.level;
  if (!ROUND_OPTIONS.includes(s.rounds)) s.rounds = DEFAULT_SETTINGS.rounds;
  const dans = Array.isArray(s.dans) ? s.dans.filter((d) => ALL_DANS.includes(d)) : [];
  s.dans = dans.length > 0 ? [...new Set(dans)].sort((a, b) => a - b) : [...DEFAULT_SETTINGS.dans];
  return s;
}

/** 今の設定では遊べない時の理由（遊べる時は null） */
export function getSettingsProblem(settings) {
  if (settings.mode === 'take-same' && settings.dans.length < TAKE_SAME_MIN_DANS) {
    return 'カードとり 2 は、だんを 2つ いじょう えらんでね（こたえが おなじ べつの しきを つくるため）';
  }
  return null;
}

export function loadSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return normalizeSettings(null);
  }
}

export function saveSettings(storage, settings) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 保存できない端末でも遊べるようにする
  }
}

/** 設定画面を組み立て、変更を onChange で知らせる */
export function mountSettingsForm(root, initial, onChange) {
  let settings = { ...initial, dans: [...initial.dans] };

  function emit() {
    onChange({ ...settings, dans: [...settings.dans] });
    render();
  }

  function optionButton(group, value, label, selected, onSelect, sub) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `option option--${group}`;
    button.setAttribute('aria-pressed', String(selected));
    button.append(Object.assign(document.createElement('span'), { className: 'option-label', textContent: label }));
    if (sub) button.append(Object.assign(document.createElement('span'), { className: 'option-sub', textContent: sub }));
    button.addEventListener('click', onSelect);
    return button;
  }

  function render() {
    root.querySelector('#setup-problem').textContent = getSettingsProblem(settings) ?? '';
    const modeBox = root.querySelector('#opt-mode');
    modeBox.replaceChildren(
      ...Object.entries(MODES).map(([key, mode]) =>
        optionButton('mode', key, mode.label, settings.mode === key, () => {
          settings.mode = key;
          emit();
        }, mode.rule),
      ),
    );

    const danBox = root.querySelector('#opt-dans');
    danBox.replaceChildren(
      ...ALL_DANS.map((dan) =>
        optionButton('dan', dan, `${dan}のだん`, settings.dans.includes(dan), () => {
          const has = settings.dans.includes(dan);
          if (has && settings.dans.length === 1) return; // 0こには しない
          settings.dans = has ? settings.dans.filter((d) => d !== dan) : [...settings.dans, dan].sort((a, b) => a - b);
          emit();
        }),
      ),
    );

    const levelBox = root.querySelector('#opt-level');
    levelBox.replaceChildren(
      ...Object.entries(CPU_LEVELS).map(([key, level]) =>
        optionButton('level', key, level.label, settings.level === key, () => {
          settings.level = key;
          emit();
        }),
      ),
    );

    const roundBox = root.querySelector('#opt-rounds');
    roundBox.replaceChildren(
      ...ROUND_OPTIONS.map((n) =>
        optionButton('rounds', n, `${n}もん`, settings.rounds === n, () => {
          settings.rounds = n;
          emit();
        }),
      ),
    );
  }

  root.querySelector('#dans-all').addEventListener('click', () => {
    settings.dans = [...ALL_DANS];
    emit();
  });

  render();
  return { get: () => ({ ...settings, dans: [...settings.dans] }) };
}
