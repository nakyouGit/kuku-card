// 管理者ページ：ログインして、カードゲームを止める・再開する

import {
  ADMIN_ID,
  ADMIN_MESSAGE_MAX_CHARS,
  ADMIN_TOKEN_STORAGE_KEY,
  STOP_API_URL,
  STOP_REQUEST_TIMEOUT_MS,
} from './config.js';
import { createRemote } from './remote.js';

const $ = (id) => document.getElementById(id);

const remote = createRemote({
  url: STOP_API_URL,
  fetchImpl: (...args) => window.fetch(...args),
  timers: { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (h) => window.clearTimeout(h) },
  timeoutMs: STOP_REQUEST_TIMEOUT_MS,
});

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

function renderState({ enabled, message }) {
  const state = $('state');
  state.dataset.on = String(enabled);
  state.textContent = enabled ? 'あそべる状態です' : 'とまっています';
  $('state-message').textContent = enabled || !message ? '' : `子どもに見せている一言：${message}`;
  $('btn-stop').disabled = !enabled;
  $('btn-resume').disabled = enabled;
}

async function refreshState() {
  const status = await remote.fetchStatus();
  if (!status) {
    $('state').dataset.on = 'true';
    $('state').textContent = '状態が読み取れません';
    $('state-message').textContent = 'ネットワークか、ガス側の更新を確かめてください。';
    $('btn-stop').disabled = false;
    $('btn-resume').disabled = false;
    return;
  }
  renderState(status);
}

async function login() {
  $('login-error').textContent = '';
  $('btn-login').disabled = true;
  const result = await remote.adminLogin(ADMIN_ID, $('admin-password').value);
  $('btn-login').disabled = false;
  if (!result.ok) {
    $('login-error').textContent = result.error;
    return;
  }
  $('admin-password').value = '';
  storeToken(result.token);
  showPanel('control');
  await refreshState();
}

async function applyStop(enabled) {
  $('control-error').textContent = '';
  $('btn-stop').disabled = true;
  $('btn-resume').disabled = true;
  const message = $('stop-message').value.trim().slice(0, ADMIN_MESSAGE_MAX_CHARS);
  const result = await remote.setCard(token, enabled, message);
  if (result.ok) {
    renderState(result);
    if (enabled) $('stop-message').value = '';
    return;
  }
  $('control-error').textContent = result.error;
  if (result.auth === false) {
    storeToken('');
    showPanel('login');
    $('login-error').textContent = 'ログインの有効期限が切れました。もう一度ログインしてください';
    return;
  }
  await refreshState();
}

$('btn-login').addEventListener('click', login);
$('admin-password').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') login();
});
$('btn-stop').addEventListener('click', () => applyStop(false));
$('btn-resume').addEventListener('click', () => applyStop(true));
$('btn-logout').addEventListener('click', () => {
  storeToken('');
  showPanel('login');
});

if (token) {
  showPanel('control');
  refreshState();
} else {
  showPanel('login');
}
