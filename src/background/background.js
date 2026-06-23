/**
 * WOOsdk Wallet — background.js (Service Worker MV3)
 * Gerencia estado, aprovações e se comunica com o popup de confirmação.
 */

/* ══════════════════════════════════════════════════
   STORAGE HELPERS
══════════════════════════════════════════════════ */
const STORAGE_KEY = 'adla_wallet_v13';

async function getWalletData() {
  return new Promise((res) => {
    chrome.storage.local.get(STORAGE_KEY, (r) => {
      const d = r[STORAGE_KEY];
      res(d ? JSON.parse(d) : null);
    });
  });
}

async function getAddress() {
  const d = await getWalletData();
  if (!d?.privateKey) return null;
  // A chave privada Aleo → endereço é derivada via SDK no popup.
  // Aqui armazenamos o endereço já calculado após cada unlock.
  return d.cachedAddress || null;
}

async function getApprovedOrigins() {
  return new Promise((res) =>
    chrome.storage.local.get('woo_approved_origins', (r) =>
      res(r.woo_approved_origins || [])
    )
  );
}

async function approveOrigin(origin) {
  const list = await getApprovedOrigins();
  if (!list.includes(origin)) {
    list.push(origin);
    chrome.storage.local.set({ woo_approved_origins: list });
  }
}

/* ══════════════════════════════════════════════════
   PENDING REQUESTS (aprovação por popup)
══════════════════════════════════════════════════ */
const pending = new Map(); // id → { resolve, reject, data }

/* ══════════════════════════════════════════════════
   ABRIR POPUP DE CONFIRMAÇÃO
══════════════════════════════════════════════════ */
function openConfirmPopup(type, payload, id) {
  const params = new URLSearchParams({
    type,
    id,
    payload: JSON.stringify(payload),
  });
  chrome.windows.create({
    url:    `confirm.html?${params}`,
    type:   'popup',
    width:  420,
    height: type === 'connect' ? 480 : 520,
  });
}

/* ══════════════════════════════════════════════════
   HANDLER PRINCIPAL
══════════════════════════════════════════════════ */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg.__woo) return false;

  const { id, method, params } = msg;
  const origin = sender.tab?.url ? new URL(sender.tab.url).origin : 'unknown';

  (async () => {
    try {
      switch (method) {

        /* ── getAccounts: retorna contas aprovadas sem pop-up ── */
        case 'getAccounts': {
          const approved = await getApprovedOrigins();
          if (!approved.includes(origin)) { sendResponse({ result: [] }); return; }
          const addr = await getAddress();
          sendResponse({ result: addr ? [addr] : [] });
          break;
        }

        /* ── getRpcUrl ── */
        case 'getRpcUrl': {
          const d = await getWalletData();
          sendResponse({ result: d?.rpcUrl || 'http://localhost:8545' });
          break;
        }

        /* ── requestAccounts: mostra pop-up de conexão ── */
        case 'requestAccounts': {
          const approved = await getApprovedOrigins();
          if (approved.includes(origin)) {
            const addr = await getAddress();
            sendResponse({ result: addr ? [addr] : [] });
            return;
          }
          // Salva promise para quando o popup responder
          pending.set(id, { sendResponse, origin, method: 'requestAccounts' });
          openConfirmPopup('connect', { origin, title: sender.tab?.title || origin }, id);
          break; // resposta assíncrona
        }

        /* ── signMessage: sempre pede confirmação ── */
        case 'signMessage': {
          pending.set(id, { sendResponse, origin, method: 'signMessage', params });
          openConfirmPopup('sign', { origin, message: params.message }, id);
          break;
        }

        /* ── sendTransaction ── */
        case 'sendTransaction': {
          pending.set(id, { sendResponse, origin, method: 'sendTransaction', params });
          openConfirmPopup('transaction', { origin, tx: params.tx }, id);
          break;
        }

        /* ── executeContract ── */
        case 'executeContract': {
          pending.set(id, { sendResponse, origin, method: 'executeContract', params });
          openConfirmPopup('contract', { origin, req: params.req }, id);
          break;
        }

        /* ── Resposta do popup de confirmação ── */
        case '__popup_response': {
          const req = pending.get(params.id);
          if (!req) { sendResponse({ result: null }); return; }
          pending.delete(params.id);

          if (!params.approved) {
            req.sendResponse({ error: 'User rejected the request.' });
            sendResponse({ result: 'ack' });
            return;
          }

          // Processa a ação aprovada
          const d   = await getWalletData();
          const addr = await getAddress();

          if (req.method === 'requestAccounts') {
            await approveOrigin(req.origin);
            req.sendResponse({ result: [addr] });

          } else if (req.method === 'signMessage') {
            // Assinatura real é feita no popup (tem acesso ao SDK)
            req.sendResponse({ result: params.signature });

          } else if (req.method === 'sendTransaction') {
            req.sendResponse({ result: params.txId || 'pending' });

          } else if (req.method === 'executeContract') {
            req.sendResponse({ result: params.txId || 'pending' });
          }

          sendResponse({ result: 'ack' });
          break;
        }

        default:
          sendResponse({ error: `Method not supported: ${method}` });
      }
    } catch (e) {
      sendResponse({ error: e.message });
    }
  })();

  return true; // resposta assíncrona
});
