// 管理者ページ：ログインして、くくの カードゲームと九九けんていを、別々に止める・再開する

import {
  ADMIN_ID,
  ADMIN_MESSAGE_MAX_CHARS,
  ADMIN_TOKEN_STORAGE_KEY,
  STOP_API_URL,
  STOP_REQUEST_TIMEOUT_MS,
  STOP_TARGETS,
} from './config.js';
import { createRemote } from './remote.js';

const $ = (id) => document.getElementById(id);
const timers = { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (h) => window.clearTimeout(h) };

function remoteFor(target) {
  return createRemote({
    url: STOP_API_URL,
    fetchImpl: (...args) => window.fetch(...args),
    timers,
    timeoutMs: STOP_REQUEST_TIMEOUT_MS,
    statusAction: target.statusAction,
    setAction: target.setAction,
  });
}

// ログインはどちらの窓口でも同じ（九九クエストの管理者）
const loginRemote = remoteFor(STOP_TARGETS.card);
let token = readStoredToken();

function readStoredToken() {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function storeToken(value) {
  token = value;
  try {
    if (value) window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, value);
    else window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // 保存できなくても、この画面を開いている間は使える
  }
}

function showPanel(name) {
  $('panel-login').hidden = name !== 'login';
  $('panel-control').hidden = name !== 'control';
}

function backToLogin() {
  storeToken('');
  showPanel('login');
  $('login-error').textContent = 'ログインの有効期限が切れました。もう一度ログインしてください';
}

/** 一つのゲームぶんの操作欄を作る */
function createTargetPanel(target) {
  const node = $('target-template').content.firstElementChild.cloneNode(true);
  const el = (role) => node.querySelector(`[data-role="${role}"]`);
  const remote = remoteFor(target);
  el('title').textContent = target.label;

  function render({ enabled, message }) {
    el('state').dataset.on = String(enabled);
    el('state').textContent = enabled ? 'あそべる状態です' : 'とまっています';
    el('state-message').textContent = enabled || !message ? '' : `子どもに見せている一言：${message}`;
    el('stop').disabled = !enabled;
    el('resume').disabled = enabled;
  }

  async function refresh() {
    const status = await remote.fetchStatus();
    if (!status) {
      el('state').dataset.on = 'true';
      el('state').textContent = '状態が読み取れません';
      el('state-message').textContent = 'ネットワークか、ガス側の更新を確かめてください。';
      el('stop').disabled = false;
      el('resume').disabled = false;
      return;
    }
    render(status);
  }

  async function apply(enabled) {
    el('error').textContent = '';
    el('stop').disabled = true;
    el('resume').disabled = true;
    const message = el('message').value.trim().slice(0, ADMIN_MESSAGE_MAX_CHARS);
    const result = await remote.setEnabled(token, enabled, message);
    if (result.ok) {
      render(result);
      if (enabled) el('message').value = '';
      return;
    }
    el('error').textContent = result.error;
    if (result.auth === false) {
      backToLogin();
      return;
    }
    await refresh();
  }

  el('stop').addEventListener('click', () => apply(false));
  el('resume').addEventListener('click', () => apply(true));
  $('targets').appendChild(node);
  return { refresh };
}

const panels = Object.values(STOP_TARGETS).map(createTargetPanel);

function refreshAll() {
  return Promise.all(panels.map((panel) => panel.refresh()));
}

async function login() {
  $('login-error').textContent = '';
  $('btn-login').disabled = true;
  const result = await loginRemote.adminLogin(ADMIN_ID, $('admin-password').value);
  $('btn-login').disabled = false;
  if (!result.ok) {
    $('login-error').textContent = result.error;
    return;
  }
  $('admin-password').value = '';
  storeToken(result.token);
  showPanel('control');
  await refreshAll();
}

$('btn-login').addEventListener('click', login);
$('admin-password').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') login();
});
$('btn-logout').addEventListener('click', () => {
  storeToken('');
  showPanel('login');
});

if (token) {
  showPanel('control');
  refreshAll();
} else {
  showPanel('login');
}
