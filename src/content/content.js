/**
 * WOOsdk Wallet — content.js
 * Roda no contexto MAIN (world: "MAIN") direto na página.
 * Injeta window.woo com a API Web3 e gerencia pop-ups de conexão.
 */

(function () {
  if (window.__woo_injected) return;
  window.__woo_injected = true;

  /* ── helpers de comunicação com o background ── */
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const handler = (ev) => {
        if (ev.source !== window || !ev.data?.__woo_response || ev.data.id !== id) return;
        window.removeEventListener('message', handler);
        if (ev.data.error) reject(new Error(ev.data.error));
        else resolve(ev.data.result);
      };
      window.addEventListener('message', handler);
      window.postMessage({ __woo_request: true, id, method, params }, '*');
    });

  /* ── ouve respostas do background (via content-relay ou background direto) ── */
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data?.__woo_request) return;
    const { id, method, params } = ev.data;

    // Pede ao extension context para processar
    chrome?.runtime?.sendMessage({ __woo: true, id, method, params }, (res) => {
      window.postMessage(
        { __woo_response: true, id, result: res?.result, error: res?.error },
        '*'
      );
    });
  });

  /* ── provider público exposto em window.woo ── */
  const provider = {
    isWoo: true,
    isAleo: true,
    networkVersion: 'woo-l3',

    /**
     * Solicita conexão (mostra pop-up de aprovação).
     * Retorna array com o endereço do usuário se aceito.
     */
    requestAccounts() {
      return call('requestAccounts');
    },

    /** Retorna contas já aprovadas (sem pop-up). */
    getAccounts() {
      return call('getAccounts');
    },

    /** Retorna RPC URL configurado. */
    getRpcUrl() {
      return call('getRpcUrl');
    },

    /**
     * Pede ao usuário para assinar uma mensagem.
     * @param {string} message  - mensagem legível
     * @returns {Promise<string>} assinatura hex/base58
     */
    signMessage(message) {
      return call('signMessage', { message });
    },

    /**
     * Envia uma transação (pede confirmação ao usuário).
     * @param {object} tx  - { to, amount, tokenId?, data? }
     * @returns {Promise<string>} txId
     */
    sendTransaction(tx) {
      return call('sendTransaction', { tx });
    },

    /**
     * Executa um contrato (pede confirmação ao usuário).
     * @param {object} req - { contractName, functionName, inputs }
     */
    executeContract(req) {
      return call('executeContract', { req });
    },

    /** Atalho EIP-1193-like para compatibilidade */
    request({ method, params }) {
      return call(method, params ?? {});
    },

    on(event, cb) {
      window.addEventListener(`__woo_event_${event}`, (e) => cb(e.detail));
    },
    removeListener(event, cb) {
      window.removeEventListener(`__woo_event_${event}`, cb);
    },
  };

  Object.defineProperty(window, 'woo', {
    value:      provider,
    writable:   false,
    enumerable: true,
    configurable: false,
  });

  // dispara evento para dApps saberem que o provider está pronto
  window.dispatchEvent(new Event('woo#initialized'));
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: {
      info: { name: 'WOOsdk Wallet', icon: '', rdns: 'io.woosdk.wallet' },
      provider,
    },
  }));
})();
