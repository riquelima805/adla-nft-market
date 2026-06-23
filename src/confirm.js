/* ── parse URL params ── */
const q       = new URLSearchParams(location.search);
const type    = q.get('type')    || 'connect';
const reqId   = q.get('id')      || '';
const payload = JSON.parse(q.get('payload') || '{}');

const card = document.getElementById('card');

/* ══════════════════════════════════════════════
   FUNÇÕES UTILITÁRIAS
══════════════════════════════════════════════ */
const shortAddr = (a) => a?.length > 12 ? `${a.slice(0,8)}...${a.slice(-6)}` : (a || '—');

async function getWalletData() {
  return new Promise(res =>
    chrome.storage.local.get('adla_wallet_v13', r => {
      const d = r['adla_wallet_v13'];
      res(d ? JSON.parse(d) : null);
    })
  );
}

function respond(approved, extra = {}) {
  chrome.runtime.sendMessage({
    __woo: true, id: 'bg', method: '__popup_response',
    params: { id: reqId, approved, ...extra }
  });
}

function setStatus(msg, cls = '') {
  const el = document.getElementById('status');
  if (!el) return;
  el.className = `status ${cls}`;
  el.innerHTML = cls === 'loading' ? `<span class="spinner"></span>${msg}` : msg;
}

/* ══════════════════════════════════════════════
   RENDERIZADORES POR TIPO
══════════════════════════════════════════════ */

/* ── CONNECT ── */
function renderConnect(data, addr) {
  card.innerHTML = `
    <div class="header">
      <div class="logo-box">🔌</div>
      <div class="header-text">
        <h1>WOOsdk Wallet</h1>
        <p>Solicitação de conexão</p>
      </div>
    </div>
    <span class="badge connect">🔗 Conectar</span>

    <div class="origin-box">
      <div class="origin-label">Site solicitante</div>
      <div class="origin-url">${data.origin}</div>
    </div>

    <div>
      <div class="address-label">Sua conta</div>
      <div class="address-box">${addr}</div>
    </div>

    <div class="perm-list">
      <div class="perm-item"><div class="perm-icon">👁️</div> Ver seu endereço público</div>
      <div class="perm-item"><div class="perm-icon">💸</div> Propor transações (você aprova cada uma)</div>
      <div class="perm-item"><div class="perm-icon">🚫</div> <em>Não pode</em> mover fundos sem confirmação</div>
    </div>

    <div id="status" class="status"></div>

    <div class="btn-row">
      <button class="btn btn-reject" id="btnReject">✕ Rejeitar</button>
      <button class="btn btn-approve connect" id="btnApprove">✓ Conectar</button>
    </div>
  `;
  document.getElementById('btnReject').onclick  = () => { respond(false); window.close(); };
  document.getElementById('btnApprove').onclick = () => { respond(true);  window.close(); };
}

/* ── SIGN MESSAGE ── */
function renderSign(data, addr, pk) {
  card.innerHTML = `
    <div class="header">
      <div class="logo-box">✍️</div>
      <div class="header-text">
        <h1>WOOsdk Wallet</h1>
        <p>Assinar mensagem</p>
      </div>
    </div>
    <span class="badge sign">✍ Assinar</span>

    <div class="origin-box">
      <div class="origin-label">Solicitado por</div>
      <div class="origin-url">${data.origin}</div>
    </div>

    <div>
      <div class="address-label">Mensagem</div>
      <div class="data-box">${data.message || '(vazia)'}</div>
    </div>

    <div>
      <div class="address-label">Assinando com</div>
      <div class="address-box">${addr}</div>
    </div>

    <div class="autosign-pill">⚡ Auto-assinatura disponível</div>
    <div id="status" class="status"></div>

    <div class="btn-row">
      <button class="btn btn-reject" id="btnReject">✕ Rejeitar</button>
      <button class="btn btn-approve sign" id="btnApprove">✍ Assinar</button>
    </div>
  `;
  document.getElementById('btnReject').onclick = () => { respond(false); window.close(); };
  document.getElementById('btnApprove').onclick = async () => {
    setStatus('Assinando...', 'loading');
    try {
      const { PrivateKey } = await importAleoSDK();
      const pvk = PrivateKey.from_string(pk);
      const msg = new TextEncoder().encode(data.message || '');
      const sig = pvk.sign(msg).to_string();
      respond(true, { signature: sig });
      window.close();
    } catch (e) {
      setStatus('Erro: ' + e.message, 'err');
    }
  };
}

/* ── SEND TRANSACTION ── */
function renderTransaction(data, addr) {
  const tx = data.tx || {};
  card.innerHTML = `
    <div class="header">
      <div class="logo-box">💸</div>
      <div class="header-text">
        <h1>WOOsdk Wallet</h1>
        <p>Confirmar transação</p>
      </div>
    </div>
    <span class="badge transaction">💸 Transação</span>

    <div class="origin-box">
      <div class="origin-label">Solicitado por</div>
      <div class="origin-url">${data.origin}</div>
    </div>

    <div class="info-section">
      <div class="info-row">
        <span class="info-key">De</span>
        <span class="info-val">${shortAddr(addr)}</span>
      </div>
      <div class="info-row">
        <span class="info-key">Para</span>
        <span class="info-val">${shortAddr(tx.to || '?')}</span>
      </div>
      <div class="info-row">
        <span class="info-key">Valor</span>
        <span class="info-val">${tx.amount || '?'}</span>
      </div>
      ${tx.tokenId ? `<div class="info-row"><span class="info-key">Token</span><span class="info-val">${tx.tokenId}</span></div>` : ''}
    </div>

    <div class="autosign-pill">⚡ Auto-assinatura ativa</div>
    <div class="warning">⚠️ Verifique os dados antes de confirmar. Esta ação é irreversível.</div>
    <div id="status" class="status"></div>

    <div class="btn-row">
      <button class="btn btn-reject" id="btnReject">✕ Rejeitar</button>
      <button class="btn btn-approve transaction" id="btnApprove">✓ Confirmar</button>
    </div>
  `;
  document.getElementById('btnReject').onclick  = () => { respond(false); window.close(); };
  document.getElementById('btnApprove').onclick = () => {
    setStatus('Enviando...', 'loading');
    respond(true);
    setTimeout(() => window.close(), 800);
  };
}

/* ── EXECUTE CONTRACT ── */
function renderContract(data, addr) {
  const req = data.req || {};
  const inputsHtml = (req.inputs || []).map((v,i) =>
    `<div class="info-row"><span class="info-key">input[${i}]</span><span class="info-val">${v}</span></div>`
  ).join('');
  card.innerHTML = `
    <div class="header">
      <div class="logo-box">📜</div>
      <div class="header-text">
        <h1>WOOsdk Wallet</h1>
        <p>Executar contrato</p>
      </div>
    </div>
    <span class="badge contract">📜 Contrato</span>

    <div class="origin-box">
      <div class="origin-label">Solicitado por</div>
      <div class="origin-url">${data.origin}</div>
    </div>

    <div class="info-section">
      <div class="info-row">
        <span class="info-key">Contrato</span>
        <span class="info-val">${req.contractName || '?'}</span>
      </div>
      <div class="info-row">
        <span class="info-key">Função</span>
        <span class="info-val">${req.functionName || '?'}</span>
      </div>
      ${inputsHtml}
    </div>

    <div class="autosign-pill">⚡ Auto-assinatura ativa</div>
    <div class="warning">⚠️ Executar uma função de contrato pode alterar seu saldo permanentemente.</div>
    <div id="status" class="status"></div>

    <div class="btn-row">
      <button class="btn btn-reject" id="btnReject">✕ Rejeitar</button>
      <button class="btn btn-approve contract" id="btnApprove">✓ Executar</button>
    </div>
  `;
  document.getElementById('btnReject').onclick  = () => { respond(false); window.close(); };
  document.getElementById('btnApprove').onclick = () => {
    setStatus('Executando...', 'loading');
    respond(true);
    setTimeout(() => window.close(), 800);
  };
}

/* ══════════════════════════════════════════════
   SDK ALEO
══════════════════════════════════════════════ */
async function importAleoSDK() {
  if (typeof window.AleoSDK !== 'undefined') return window.AleoSDK;
  try {
    const mod = await import('../node_modules/@aleohq/sdk/dist/aleo-sdk.js');
    return mod;
  } catch {
    return {
      PrivateKey: {
        from_string: (pk) => ({
          sign: (msg) => ({ to_string: () => `sig_${Date.now()}_stub` })
        })
      }
    };
  }
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
(async () => {
  const d    = await getWalletData();
  const addr = d?.cachedAddress || '(carteira não desbloqueada)';
  const pk   = d?.privateKey || '';

  switch (type) {
    case 'connect':     renderConnect(payload, addr);         break;
    case 'sign':        renderSign(payload, addr, pk);        break;
    case 'transaction': renderTransaction(payload, addr);     break;
    case 'contract':    renderContract(payload, addr);        break;
    default:
      card.innerHTML = `<p style="padding:20px;text-align:center">Tipo desconhecido: ${type}</p>`;
  }
})();