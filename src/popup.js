/* ══════════════════════════════════════════════
   ESTADO LOCAL
══════════════════════════════════════════════ */
let walletData = null;
let approvedOrigins = [];
let activeTab = 'wallet';
let selectedTokenIdx = 0;
let statusMsg = '✓ Pronto';
let statusType = 'ok';
let showConfirm = false;
let copied = false;
let showSendForm = false;
let showSettings = false;
let sendTo = '', sendAmt = '';

const shortAddr = (a) => a?.length > 12 ? `${a.slice(0,8)}...${a.slice(-6)}` : (a || '—');

const formatBal = (token) => {
  if (!token?.balance || token.balance === 'Erro') return '0';
  try {
    const val = BigInt(token.balance.toString().trim().split('.')[0]);
    const dec = token.decimals ?? 0;
    if (dec === 0) return val.toString();
    const div = 10n ** BigInt(dec);
    const int = val / div, frac = val % div;
    if (frac === 0n) return int.toString();
    return `${int}.${frac.toString().padStart(dec,'0').replace(/0+$/,'')}`;
  } catch { return '0'; }
};

/* ══════════════════════════════════════════════
   LOAD DATA
══════════════════════════════════════════════ */
async function loadData() {
  await new Promise(res => {
    chrome.storage.local.get(['adla_wallet_v13','woo_approved_origins'], (r) => {
      const d = r['adla_wallet_v13'];
      walletData = d ? JSON.parse(d) : {
        rpcUrl: 'http://localhost:8545',
        privateKey: '',
        tokens: [{ address:'native', symbol:'gas_adla', decimals:0 }],
        simulationMode: false,
        txHistory: [],
        cachedAddress: ''
      };
      approvedOrigins = r['woo_approved_origins'] || [];
      res();
    });
  });
}

function saveData() {
  chrome.storage.local.set({ 'adla_wallet_v13': JSON.stringify(walletData) });
}

function setMsg(msg, type='ok') { statusMsg = msg; statusType = type; render(); }

/* ══════════════════════════════════════════════
   ENVIAR TRANSAÇÃO
══════════════════════════════════════════════ */
async function doSend() {
  if (!sendTo || !sendAmt) { setMsg('✗ Preencha todos os campos', 'err'); return; }
  if (!showConfirm) { showConfirm = true; render(); return; }
  showConfirm = false;
  setMsg('⏳ Enviando...', 'loading');

  try {
    const token = walletData.tokens[selectedTokenIdx];
    const addr  = walletData.cachedAddress || '';
    const rpc   = walletData.rpcUrl || 'http://localhost:8545';
    const nonce = await fetch(rpc, {
      method: 'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0',method:'woo_getNonce',params:[addr],id:1})
    }).then(r=>r.json()).then(r=>r.result??0).catch(()=>0);

    // Auto-assinatura via stub (SDK real seria importado aqui)
    const sig = `auto_sig_${Date.now()}`;
    const mult = 10 ** (token.decimals??0);
    const numAmt = Math.floor(parseFloat(sendAmt.replace(',','.')) * mult);

    const method = token.address === 'native' ? 'woo_sendTransaction' : 'woo_sendTokenTransaction';
    const params = token.address === 'native'
      ? [{ from:addr, to:sendTo, amount:numAmt, signature:sig, nonce }]
      : [{ from:addr, tokenId:token.address, to:sendTo, amount:`${numAmt}u64`, signature:sig, nonce }];

    const res = await fetch(rpc, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0', method, params, id:1})
    }).then(r=>r.json());

    if (res.error) { setMsg(`✗ ${JSON.stringify(res.error)}`, 'err'); return; }

    walletData.txHistory = [
      { txId: res.result?.txId||'ok', type:'TRANSFER', from:addr, to:sendTo, amount:sendAmt, timestamp:Date.now(), status:'confirmed' },
      ...(walletData.txHistory||[]).slice(0,49)
    ];
    saveData();
    setMsg(`✓ Enviado!`);
    sendTo=''; sendAmt=''; showSendForm=false;
    await refreshBalances();
  } catch(e) { setMsg('✗ Transação falhou', 'err'); }
}

async function refreshBalances() {
  const addr = walletData.cachedAddress||'';
  const rpc  = walletData.rpcUrl||'http://localhost:8545';
  if (!addr) return;
  try {
    walletData.tokens = await Promise.all(walletData.tokens.map(async t => {
      try {
        const r = await fetch(rpc, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            jsonrpc:'2.0',
            method: t.address==='native' ? 'woo_getBalance' : 'woo_getTokenBalance',
            params: t.address==='native' ? [addr] : [addr, t.address],
            id: 1
          })
        }).then(r=>r.json());
        return { ...t, balance: String(r.result??'0') };
      } catch { return { ...t, balance:'Erro' }; }
    }));
    saveData();
    setMsg('✓ Saldos atualizados');
  } catch { setMsg('✗ Falha ao atualizar', 'err'); }
  render();
}

function revokeOrigin(origin) {
  approvedOrigins = approvedOrigins.filter(o=>o!==origin);
  chrome.storage.local.set({ woo_approved_origins: approvedOrigins }, render);
}

/* ══════════════════════════════════════════════
   RENDER
══════════════════════════════════════════════ */
function render() {
  const app  = document.getElementById('app');
  const addr = walletData?.cachedAddress || '—';
  const tokens = walletData?.tokens || [];
  const selTok = tokens[selectedTokenIdx] || tokens[0] || { symbol:'?', balance:'0', decimals:0 };

  app.innerHTML = `
  <!-- HEADER -->
  <div class="header">
    <div class="logo-group">
      <div class="logo-icon">🪙</div>
      <div class="logo-text">
        <h1>WOOsdk</h1>
        <p>WALLET</p>
      </div>
    </div>
    <div class="header-right">
      <button class="icon-btn" id="btnOpenApp" title="Abrir app completo">↗</button>
      <button class="icon-btn" id="btnSettings" title="Configurações">⚙</button>
    </div>
  </div>

  <!-- BALANCE -->
  <div class="balance-section">
    <div class="addr-chip" id="addrChip">${copied ? '✓ Copiado!' : shortAddr(addr)}</div>
    <div class="balance-label">Saldo Principal</div>
    <div class="balance-value">${formatBal(tokens[0]||{balance:'0',decimals:0})}<span class="balance-symbol">${tokens[0]?.symbol||'—'}</span></div>
    <div class="quick-actions">
      <button class="quick-btn" id="btnSend">↗ Enviar</button>
      <button class="quick-btn" id="btnRefresh">↻ Refresh</button>
    </div>
  </div>

  <!-- TABS -->
  <div class="nav-tabs">
    ${[['wallet','🪙','Carteira'],['sites','🔗','Sites'],['history','📋','Histórico'],['settings','⚙','Config']].map(([v,ico,label])=>
      `<button class="nav-btn ${activeTab===v?'active':''}" data-tab="${v}"><span class="nav-ico">${ico}</span>${label}</button>`
    ).join('')}
  </div>

  <!-- CONTENT -->
  <div class="content">
    ${activeTab === 'wallet' ? renderWallet(tokens, selTok) : ''}
    ${activeTab === 'sites'   ? renderSites()   : ''}
    ${activeTab === 'history' ? renderHistory()  : ''}
    ${activeTab === 'settings'? renderSettings() : ''}
  </div>

  <!-- STATUS -->
  <div class="status-bar ${statusType}">
    ${statusType==='loading'?'<span class="spinner"></span>':''}
    ${statusMsg}
  </div>
  `;

  /* ── Event listeners ── */
  document.getElementById('addrChip')?.addEventListener('click', () => {
    navigator.clipboard.writeText(addr);
    copied=true; setTimeout(()=>{copied=false;render();},2000); render();
  });
  document.getElementById('btnSend')?.addEventListener('click', ()=>{showSendForm=!showSendForm;render();});
  document.getElementById('btnRefresh')?.addEventListener('click', async ()=>{setMsg('⏳ Atualizando...','loading');await refreshBalances();});
  document.getElementById('btnOpenApp')?.addEventListener('click', ()=>chrome.tabs.create({url:'index.html'}));
  document.getElementById('btnSettings')?.addEventListener('click', ()=>{activeTab='settings';render();});

  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn=>{
    btn.addEventListener('click', ()=>{activeTab=btn.dataset.tab;showSendForm=false;showConfirm=false;render();});
  });
  document.querySelectorAll('.token-item[data-idx]').forEach(el=>{
    el.addEventListener('click', ()=>{selectedTokenIdx=+el.dataset.idx;render();});
  });
  document.getElementById('btnDoSend')?.addEventListener('click', doSend);
  document.getElementById('btnCancelSend')?.addEventListener('click',()=>{showSendForm=false;showConfirm=false;render();});
  document.getElementById('btnConfirmYes')?.addEventListener('click', doSend);
  document.getElementById('btnConfirmNo')?.addEventListener('click',()=>{showConfirm=false;render();});
  document.getElementById('inputTo')?.addEventListener('input', e=>{ sendTo=e.target.value; });
  document.getElementById('inputAmt')?.addEventListener('input', e=>{ sendAmt=e.target.value; });

  document.querySelectorAll('.btn-revoke[data-origin]').forEach(btn=>{
    btn.addEventListener('click', ()=>revokeOrigin(btn.dataset.origin));
  });

  // Settings save
  document.getElementById('btnSaveSettings')?.addEventListener('click', ()=>{
    const rpc = document.getElementById('inputRpc')?.value;
    const pk  = document.getElementById('inputPk')?.value;
    if(rpc) walletData.rpcUrl = rpc;
    if(pk)  { walletData.privateKey = pk; /* cachedAddress seria recalculado pelo app */ }
    saveData();
    setMsg('✓ Configurações salvas');
  });
}

function renderWallet(tokens, selTok) {
  return `
    <div class="section-title">Seus Ativos</div>
    ${tokens.map((t,i)=>`
      <div class="token-item ${selectedTokenIdx===i?'selected':''}" data-idx="${i}">
        <div class="t-left">
          <div class="t-icon">${t.address==='native'?'⛽':'🪙'}</div>
          <div><div class="t-sym">${t.symbol}</div><div class="t-name">${t.address==='native'?'Gás L3':shortAddr(t.address)}</div></div>
        </div>
        <div class="t-right">
          <div class="t-bal">${formatBal(t)}</div>
          <div class="t-fiat">≈ $0.00</div>
        </div>
      </div>
    `).join('')}

    ${showSendForm ? `
      <div style="margin-top:14px">
        <div class="auto-sign-badge">⚡ Auto-assinatura ativa</div>
        <div class="form-group">
          <label>Enviar ${selTok.symbol} para</label>
          <input class="form-input" id="inputTo" placeholder="aleo1..." value="${sendTo}" />
        </div>
        <div class="form-group">
          <label>Quantidade</label>
          <input class="form-input" id="inputAmt" type="text" placeholder="Ex: 10" value="${sendAmt}" />
        </div>
        ${showConfirm ? `
          <div class="confirm-panel">
            <div class="confirm-row"><span>Para:</span><strong>${shortAddr(sendTo)}</strong></div>
            <div class="confirm-row"><span>Valor:</span><strong>${sendAmt} ${selTok.symbol}</strong></div>
            <div style="font-size:12px;color:#dc2626;margin-top:8px">⚠️ Esta ação é irreversível.</div>
            <div class="confirm-btns">
              <button id="btnConfirmNo" style="background:#fff;border:2px solid #1e1e2a;color:#1e1e2a;">✕ Cancelar</button>
              <button id="btnConfirmYes" style="background:#1e1e2a;border:2px solid #1e1e2a;color:#fff;">✓ Confirmar</button>
            </div>
          </div>
        ` : `
          <button class="btn-primary" id="btnDoSend">↗ Enviar</button>
          <button class="btn-secondary" id="btnCancelSend">Cancelar</button>
        `}
      </div>
    ` : ''}
  `;
}

function renderSites() {
  return `
    <div class="section-title">Sites Conectados (${approvedOrigins.length})</div>
    ${approvedOrigins.length === 0
      ? '<p style="color:#5e6c7c;font-size:13px;text-align:center;padding:20px">Nenhum site conectado.</p>'
      : approvedOrigins.map(o=>`
          <div class="site-item">
            <div class="site-info">
              <span class="site-origin">${o}</span>
              <span class="site-badge">✓ Conectado</span>
            </div>
            <button class="btn-revoke" data-origin="${o}">Revogar</button>
          </div>
        `).join('')
    }
    <p style="font-size:11px;color:#5e6c7c;margin-top:12px;line-height:1.5">
      Estes sites podem ver seu endereço e propor transações.<br>
      Cada transação exige sua confirmação individual.
    </p>
  `;
}

function renderHistory() {
  const hist = walletData?.txHistory || [];
  const icons = { TRANSFER:'💸', SWAP:'🔄', LIQUIDITY:'💧', CONTRACT:'📜' };
  return `
    <div class="section-title">Histórico (${hist.length})</div>
    ${hist.length===0
      ? '<p style="color:#5e6c7c;font-size:13px;text-align:center;padding:20px">Nenhuma transação.</p>'
      : hist.slice(0,20).map(tx=>`
          <div style="display:flex;align-items:center;gap:10px;padding:10px;background:#f8fafc;border:2px solid #e2e8f0;border-radius:14px;margin-bottom:8px">
            <span style="font-size:20px">${icons[tx.type]||'📋'}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:#1e1e2a">${tx.type} ${tx.amount?`· ${tx.amount}`:''}</div>
              <div style="font-size:11px;color:#5e6c7c">${shortAddr(tx.txId||'')}</div>
            </div>
            <span style="font-size:16px">${tx.status==='confirmed'?'✅':'⏳'}</span>
          </div>
        `).join('')
    }
  `;
}

function renderSettings() {
  return `
    <div class="settings-section">
      <label>URL do RPC</label>
      <input class="form-input" id="inputRpc" value="${walletData?.rpcUrl||'http://localhost:8545'}" placeholder="http://localhost:8545" />
    </div>
    <div class="settings-section">
      <label>Chave Privada</label>
      <input class="form-input" id="inputPk" type="password" value="${walletData?.privateKey||''}" placeholder="APrivateKey..." />
    </div>
    <div class="auto-sign-badge" style="margin-bottom:14px">⚡ Auto-assinatura: ATIVA</div>
    <button class="btn-primary" id="btnSaveSettings">💾 Salvar</button>
    <div style="margin-top:16px;padding:12px;background:#f1f5f9;border-radius:12px;font-size:11px;color:#5e6c7c;line-height:1.6">
      <strong style="color:#1e1e2a">window.woo</strong> está disponível em todos os sites.<br>
      dApps podem chamar <code>window.woo.requestAccounts()</code> para se conectar.
    </div>
  `;
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
(async () => {
  await loadData();
  render();
  // Refresh balances silencioso ao abrir
  if (walletData?.cachedAddress) refreshBalances();
})();