// ガスの窓口との通信（画面に依存しない）。
// 通信できない・形がおかしい時は、例外ではなく null や {ok:false} を返す。

/**
 * @param {object} options
 * @param {string} options.url
 * @param {typeof fetch} options.fetchImpl
 * @param {{setTimeout:Function, clearTimeout:Function}} options.timers
 * @param {number} options.timeoutMs
 */
export function createRemote({ url, fetchImpl, timers, timeoutMs }) {
  /** JSON を POST して JSON を受け取る。失敗したら null */
  async function call(body) {
    let timeoutHandle;
    const timeout = new Promise((resolve) => {
      timeoutHandle = timers.setTimeout(() => resolve(null), timeoutMs);
    });
    const request = (async () => {
      try {
        // Content-Type を付けない（text/plain になる）ことで、事前確認の通信が要らない形にする
        const response = await fetchImpl(url, { method: 'POST', body: JSON.stringify(body) });
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    })();
    const result = await Promise.race([request, timeout]);
    timers.clearTimeout(timeoutHandle);
    return result;
  }

  return {
    /**
     * 今の状態を返す。分からない時（通信できない等）は null。
     * @returns {Promise<{enabled:boolean, message:string} | null>}
     */
    async fetchStatus() {
      const result = await call({ action: 'cardStatus' });
      if (!result || result.ok !== true || typeof result.enabled !== 'boolean') return null;
      return { enabled: result.enabled, message: typeof result.message === 'string' ? result.message : '' };
    },

    /** @returns {Promise<{ok:true, token:string} | {ok:false, error:string}>} */
    async adminLogin(id, password) {
      const result = await call({ action: 'adminLogin', id, password });
      if (!result) return { ok: false, error: 'つながりません。ネットワークを確かめてください' };
      if (result.ok && typeof result.token === 'string') return { ok: true, token: result.token };
      return { ok: false, error: result.error || 'ログインできませんでした' };
    },

    /** @returns {Promise<{ok:true, enabled:boolean, message:string} | {ok:false, auth?:boolean, error:string}>} */
    async setCard(token, enabled, message) {
      const result = await call({ action: 'setCard', token, enabled, message });
      if (!result) return { ok: false, error: 'つながりません。ネットワークを確かめてください' };
      if (result.ok === true && typeof result.enabled === 'boolean') {
        return { ok: true, enabled: result.enabled, message: result.message || '' };
      }
      if (result.error === '不明な操作です') {
        return { ok: false, error: 'ガス側がまだ更新されていません（停止の機能が入っていません）' };
      }
      return { ok: false, auth: result.auth === false ? false : undefined, error: result.error || 'うまくいきませんでした' };
    },
  };
}
