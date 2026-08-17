// ─── Configuração Supabase ─────────────────────────────────────────────────────
// Tenta buscar de variáveis globais (Easypanel/Local) ou placeholders
const SUPABASE_URL = window.LOCAL_SUPABASE_URL || '';
const SUPABASE_KEY = window.LOCAL_SUPABASE_KEY || '';

console.log('--- Diagnóstico de Conexão ---');
console.log('URL configurada:', SUPABASE_URL ? '✅ OK' : '❌ VAZIA');
console.log('Key configurada:', SUPABASE_KEY ? '✅ OK' : '❌ VAZIA');

// ─── Estado Global ─────────────────────────────────────────────────────────────
const PLAN_VALUES = {
    'Starter': 97,
    'Inicial': 197,
    'Médio': 397,
    'Premium': 797,
    'Ultra Power': 2200,
    'Essencial': 97,
    'Crescimento': 147,
    'Acelerador': 347,
    'Performance': 547,
    'Escala': 997
};

const COST_PER_PROVA = 0.045;

const PLAN_LIMITS = {
    'Starter': 50,
    'Inicial': 100,
    'Médio': 500,
    'Premium': 1200,
    'Ultra Power': 3000,
    'Essencial': 50,
    'Crescimento': 100,
    'Acelerador': 300,
    'Performance': 500,
    'Escala': 1200
};

// ─── Controle de Acesso ────────────────────────────────────────────────
// Apenas estes emails podem acessar o painel de gestão.
// Para adicionar novo admin, inclua o email aqui.
const ADMIN_EMAILS = [
    'lucasdecamargo2015@gmail.com',
    'rafaelwassef@gmail.com'
];

function isAdminEmail(email) {
    return ADMIN_EMAILS.includes(String(email || '').toLowerCase().trim());
}

function getClientMonthlyValue(client) {
    if (client.valorPersonalizado != null && client.valorPersonalizado > 0) {
        return client.valorPersonalizado;
    }
    return PLAN_VALUES[client.plan] || 0;
}

function getClientPlanLabel(client) {
    if (client.planoPersonalizado) return client.planoPersonalizado;
    return client.plan;
}

const COST_PER_CATEGORIA = {
    'oculos': 0.045,
    'roupa': 0.35
};

function getCategoryCost(categoria) {
    const cat = categoria || 'oculos';
    return COST_PER_CATEGORIA.hasOwnProperty(cat) ? COST_PER_CATEGORIA[cat] : null;
}

// ─── Helpers para Faturamento Pós-Prova ─────────────────────────────────────
function normalizePhone(p) {
    let n = String(p || '').replace(/\D/g, '');
    if (n.startsWith('55') && n.length > 11) n = n.slice(2);
    if (n.startsWith('0')) n = n.slice(1);
    return n;
}

function normalizeDomain(o) {
    let s = String(o || '').toLowerCase().trim();
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
    s = s.split('/')[0].split('?')[0];
    return s;
}

function isOrderAfterProva(orderTs, ph, minDateMap, minTsMap) {
    if (!orderTs || !ph) return false;
    const provaDate = minDateMap[ph];
    if (!provaDate) return false;
    const orderDate = String(orderTs).slice(0, 10);
    const hasRealTime = String(orderTs).includes('T') && !String(orderTs).includes('T00:00:00');
    if (hasRealTime) {
        const provaTs = minTsMap[ph];
        if (!provaTs) return false;
        return String(orderTs) >= provaTs;
    }
    return orderDate >= provaDate;
}

function formatRelativeTime(iso) {
    if (!iso) return 'Nunca calculado';
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'agora';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min atrás`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} h atrás`;
    const days = Math.floor(hr / 24);
    return `${days} dia${days > 1 ? 's' : ''} atrás`;
}

function formatBRL(n) {
    return `R$ ${(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function fetchAllPaginated(table, selectFields, filters = []) {
    if (!db) return [];
    const all = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
        let q = db.from(table).select(selectFields).range(from, from + pageSize - 1);
        for (const f of filters) {
            q = q[f.method](...f.args);
        }
        const { data, error } = await q;
        if (error) {
            console.warn(`Pagination error on ${table}:`, error);
            break;
        }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

// Conta provas por loja SERVER-SIDE via RPC (Postgres) em vez de baixar dezenas de milhares de
// linhas pro navegador. lojas = [{dom, cutoff(ISO)}]; retorna { dom: nº de provas desde o cutoff }.
async function fetchProvasCounts(lojas) {
    if (!db || !lojas || !lojas.length) return {};
    try {
        const { data, error } = await db.rpc('provas_por_loja', { lojas });
        if (error) { console.warn('rpc provas_por_loja:', error); return {}; }
        const m = {};
        (data || []).forEach(r => { m[r.dom] = Number(r.cnt) || 0; });
        return m;
    } catch (e) { console.warn('rpc provas_por_loja:', e); return {}; }
}

async function computeFaturamentoPosProva() {
    if (!db) throw new Error('Supabase não conectado');

    // 1. Configs dos lojistas com tabela_pedidos preenchida
    const { data: lojistas, error: lojErr } = await db
        .from('lojistas')
        .select('email, origem, categoria, tabela_pedidos, campo_telefone_pedido, campo_total_pedido, campo_data_pedido, campo_status_pedido, valores_status_pago')
        .neq('tabela_pedidos', '')
        .not('tabela_pedidos', 'is', null);

    const { data: stores } = await db.from('provou_levou_stores').select('email, categoria');
    const storeCategoriaMap = {};
    for (const s of (stores || [])) {
        if (s.email) storeCategoriaMap[s.email.toLowerCase()] = s.categoria || 'oculos';
    }
    if (lojErr) throw lojErr;
    const validLojistas = (lojistas || []).filter(l =>
        l.tabela_pedidos &&
        l.campo_telefone_pedido &&
        l.campo_total_pedido &&
        l.campo_status_pedido &&
        l.valores_status_pago && l.valores_status_pago.length > 0
    );

    // 2. Carregar todas as provas paginadas
    const provas = await fetchAllPaginated(
        'geracoes_provou_levou',
        'telefone_cliente, created_at, origin',
        [{ method: 'order', args: ['created_at', { ascending: false }] }]
    );

    // 3. Indexar provas por origem normalizada
    const provasPorOrigem = {};
    for (const p of provas) {
        const dom = normalizeDomain(p.origin);
        if (!dom) continue;
        if (!provasPorOrigem[dom]) provasPorOrigem[dom] = [];
        provasPorOrigem[dom].push(p);
    }

    const porEmail = {};
    const porDomain = {};
    let totalGeral = 0;

    // 4. Para cada lojista, calcular pós-prova
    for (const loj of validLojistas) {
        try {
            const lojOrigem = normalizeDomain(loj.origem);
            const lojProvas = [];
            for (const [dom, ps] of Object.entries(provasPorOrigem)) {
                if (dom === lojOrigem || dom.endsWith('.' + lojOrigem)) {
                    lojProvas.push(...ps);
                }
            }
            const categoria = storeCategoriaMap[(loj.email || '').toLowerCase()] || loj.categoria || 'oculos';
            if (lojProvas.length === 0) {
                const entry0 = { faturamento: 0, provas: 0, custo: 0, categoria };
                porEmail[loj.email] = entry0;
                if (lojOrigem) porDomain[lojOrigem] = entry0;
                continue;
            }

            const minDateMap = {};
            const minTsMap = {};
            const provaPhones = new Set();
            let earliestProvaDate = '';

            for (const p of lojProvas) {
                const ph = normalizePhone(p.telefone_cliente);
                if (!ph) continue;
                const ts = p.created_at || '';
                const date = ts.slice(0, 10);
                if (!minDateMap[ph] || date < minDateMap[ph]) minDateMap[ph] = date;
                if (!minTsMap[ph] || ts < minTsMap[ph]) minTsMap[ph] = ts;
                provaPhones.add(ph);
                if (date && (!earliestProvaDate || date < earliestProvaDate)) earliestProvaDate = date;
            }

            // 5. Pedidos pagos da loja (paginar)
            const fPhone = loj.campo_telefone_pedido;
            const fTotal = loj.campo_total_pedido;
            const fDate = loj.campo_data_pedido || 'created_at';
            const fStatus = loj.campo_status_pedido;
            const select = `${fPhone}, ${fTotal}, ${fDate}, ${fStatus}`;

            const filters = [
                { method: 'in', args: [fStatus, loj.valores_status_pago] },
                // Regra 6: order explícito para paginação estável (evita duplicatas entre páginas)
                { method: 'order', args: [fDate, { ascending: true }] }
            ];
            if (earliestProvaDate) {
                filters.push({ method: 'gte', args: [fDate, earliestProvaDate + 'T00:00:00-03:00'] });
            }

            const orders = await fetchAllPaginated(loj.tabela_pedidos, select, filters);

            // Dedup safety net: por id se existir, senão por (phone+date+total) string
            const seen = new Set();
            let lojaTotal = 0;
            for (const o of orders) {
                const ph = normalizePhone(o[fPhone]);
                if (!ph || !provaPhones.has(ph)) continue;
                if (!isOrderAfterProva(o[fDate], ph, minDateMap, minTsMap)) continue;
                const val = parseFloat(o[fTotal]) || 0;
                const dedupKey = `${ph}|${o[fDate]}|${val}`;
                if (seen.has(dedupKey)) continue;
                seen.add(dedupKey);
                lojaTotal += val;
            }

            const provasCount = lojProvas.length;
            const costRate = getCategoryCost(categoria);
            const custo = costRate != null ? provasCount * costRate : null;
            const entry = { faturamento: lojaTotal, provas: provasCount, custo, categoria };
            porEmail[loj.email] = entry;
            if (lojOrigem) porDomain[lojOrigem] = entry;
            totalGeral += lojaTotal;
        } catch (err) {
            console.warn(`Erro calculando faturamento para ${loj.email}:`, err);
            const fallbackCat = storeCategoriaMap[(loj.email || '').toLowerCase()] || loj.categoria || 'oculos';
            const entry = { faturamento: 0, provas: 0, custo: 0, categoria: fallbackCat };
            porEmail[loj.email] = entry;
            const lojOrigem2 = normalizeDomain(loj.origem);
            if (lojOrigem2) porDomain[lojOrigem2] = entry;
        }
    }

    let totalProvas = 0;
    let totalCusto = 0;
    let provasOculos = 0, provasRoupa = 0;
    let custoOculos = 0, custoRoupa = 0;
    let custoRoupaPendente = false;
    for (const v of Object.values(porEmail)) {
        const p = v.provas || 0;
        totalProvas += p;
        if (v.categoria === 'roupa') {
            provasRoupa += p;
            if (v.custo != null) custoRoupa += v.custo;
            else if (p > 0) custoRoupaPendente = true;
        } else {
            provasOculos += p;
            custoOculos += v.custo || 0;
        }
    }
    totalCusto = custoOculos + custoRoupa;

    return {
        updatedAt: new Date().toISOString(),
        totalGeral,
        totalProvas,
        totalCusto,
        provasOculos,
        provasRoupa,
        custoOculos,
        custoRoupa,
        custoRoupaPendente,
        porEmail,
        porDomain
    };
}

// --- Faturamento Cache + DOM Render ---
const FATURAMENTO_CACHE_KEY = 'faturamentoPosProvaCache';

function readFaturamentoCache() {
    try {
        const raw = localStorage.getItem(FATURAMENTO_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeFaturamentoCache(data) {
    try {
        localStorage.setItem(FATURAMENTO_CACHE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Falha ao salvar cache de faturamento:', e);
    }
}

function setUpdatedLine(el, iconClass, text) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
    const i = document.createElement('i');
    i.className = iconClass;
    el.appendChild(i);
    el.appendChild(document.createTextNode(' ' + text));
}

function renderFaturamentoCard(cache) {
    const valEl = document.getElementById('stat-faturamento-provador');
    const updEl = document.getElementById('stat-faturamento-updated');
    const custoEl = document.getElementById('stat-custo-geracoes');
    const provasEl = document.getElementById('stat-custo-provas');

    if (!cache) {
        if (valEl) valEl.textContent = 'R$ 0';
        if (updEl) setUpdatedLine(updEl, 'fas fa-clock', 'Clique para calcular');
        if (custoEl) custoEl.textContent = 'R$ 0';
        if (provasEl) setUpdatedLine(provasEl, 'fas fa-image', '0 provas');
        return;
    }
    if (valEl) valEl.textContent = formatBRL(cache.totalGeral);
    if (updEl) setUpdatedLine(updEl, 'fas fa-clock', 'Atualizado ' + formatRelativeTime(cache.updatedAt));
    if (custoEl) custoEl.textContent = formatBRL(cache.totalCusto || 0);
    if (provasEl) setUpdatedLine(provasEl, 'fas fa-image', (cache.totalProvas || 0).toLocaleString('pt-BR') + ' provas');
}

// ─── Pagamentos: histórico + registro ─────────────────────────────────────
let _currentPagamentosStoreId = null;
let _currentPagamentosClient = null;

async function openPagamentosModal(clientId) {
    const c = clients.find(cl => cl.id === clientId);
    if (!c) return;
    _currentPagamentosStoreId = clientId;
    _currentPagamentosClient = c;
    const nomeEl = document.getElementById('pgto-cliente-nome');
    if (nomeEl) nomeEl.textContent = `${c.company || c.name || '—'}`;
    // Pre-fill form defaults
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('pgto-data').value = today;
    document.getElementById('pgto-valor').value = '';
    document.getElementById('pgto-descricao').value = '';
    document.getElementById('pgto-tipo').value = 'mensalidade';
    openModal('pagamentos-modal');
    await loadPagamentos(clientId);
}

function closePagamentosModal() {
    hideModal('pagamentos-modal');
    _currentPagamentosStoreId = null;
    _currentPagamentosClient = null;
}

async function loadPagamentos(storeId) {
    const tbody = document.getElementById('pagamentos-table-body');
    if (!tbody || !db) return;
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5; td.style.cssText = 'text-align:center;color:var(--text-muted);padding:30px 0;';
    td.textContent = 'Carregando...'; tr.appendChild(td); tbody.appendChild(tr);

    try {
        const { data, error } = await db
            .from('pagamentos_clientes')
            .select('id, tipo, valor, data_pagamento, descricao')
            .eq('store_id', storeId)
            .order('data_pagamento', { ascending: false });
        if (error) throw error;

        // Calcula totals
        let totMens = 0, totExtras = 0;
        (data || []).forEach(p => {
            const v = parseFloat(p.valor) || 0;
            if (p.tipo === 'mensalidade') totMens += v;
            else if (p.tipo === 'extra') totExtras += v;
        });
        const setBR = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        };
        setBR('pgto-total-mens', totMens);
        setBR('pgto-total-extras', totExtras);
        setBR('pgto-total-geral', totMens + totExtras);

        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
        if (!data || data.length === 0) {
            const tr2 = document.createElement('tr');
            const td2 = document.createElement('td');
            td2.colSpan = 5; td2.style.cssText = 'text-align:center;color:var(--text-muted);padding:30px 0;';
            td2.textContent = 'Nenhum pagamento registrado.';
            tr2.appendChild(td2); tbody.appendChild(tr2);
            return;
        }

        for (const p of data) {
            const tr2 = document.createElement('tr');
            // Data
            const tdData = document.createElement('td');
            const dp = p.data_pagamento.split('-');
            tdData.textContent = `${dp[2]}/${dp[1]}/${dp[0]}`;
            // Tipo
            const tdTipo = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'status-badge ' + (p.tipo === 'mensalidade' ? 'status-active' : 'status-permuta');
            badge.textContent = p.tipo === 'mensalidade' ? 'Mensalidade' : 'Extra';
            tdTipo.appendChild(badge);
            // Valor
            const tdValor = document.createElement('td');
            tdValor.style.cssText = 'font-weight:600;font-variant-numeric:tabular-nums;';
            tdValor.style.color = p.tipo === 'extra' ? 'var(--purple)' : 'var(--success)';
            tdValor.textContent = `R$ ${(parseFloat(p.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            // Descrição
            const tdDesc = document.createElement('td');
            tdDesc.style.cssText = 'color:var(--text-muted);font-size:11px;';
            tdDesc.textContent = p.descricao || '';
            // Ações (excluir)
            const tdAct = document.createElement('td');
            const btnDel = document.createElement('button');
            btnDel.className = 'btn-icon';
            btnDel.title = 'Excluir';
            btnDel.dataset.pid = p.id;
            const ic = document.createElement('i'); ic.className = 'fas fa-trash';
            btnDel.appendChild(ic);
            btnDel.addEventListener('click', () => deletePagamento(p.id));
            tdAct.appendChild(btnDel);

            tr2.appendChild(tdData);
            tr2.appendChild(tdTipo);
            tr2.appendChild(tdValor);
            tr2.appendChild(tdDesc);
            tr2.appendChild(tdAct);
            tbody.appendChild(tr2);
        }
    } catch (err) {
        console.error('Erro ao carregar pagamentos:', err);
        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
        const tr2 = document.createElement('tr');
        const td2 = document.createElement('td');
        td2.colSpan = 5; td2.style.cssText = 'text-align:center;color:#ef4444;padding:30px 0;';
        td2.textContent = 'Erro ao carregar pagamentos.';
        tr2.appendChild(td2); tbody.appendChild(tr2);
    }
}

async function salvarPagamento() {
    if (!_currentPagamentosStoreId || !db) return;
    const tipo = document.getElementById('pgto-tipo').value;
    const valor = parseFloat(document.getElementById('pgto-valor').value);
    const data = document.getElementById('pgto-data').value;
    const descricao = document.getElementById('pgto-descricao').value.trim() || null;

    if (!valor || valor <= 0) { alert('Informe um valor válido'); return; }
    if (!data) { alert('Informe a data'); return; }

    const btn = document.getElementById('btn-salvar-pagamento');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
        const { error } = await db.from('pagamentos_clientes').insert({
            store_id: _currentPagamentosStoreId,
            tipo, valor, data_pagamento: data, descricao
        });
        if (error) throw error;

        // Mensalidade define o último pagamento, mas só se for mais recente que o
        // que já está lá — lançar um mês atrasado não pode voltar o ciclo do cliente
        const idx = clients.findIndex(c => String(c.id) === String(_currentPagamentosStoreId));
        const atual = idx !== -1 ? clients[idx].lastPayment : null;
        if (tipo === 'mensalidade' && (!atual || atual === '-' || data > atual)) {
            await db.from('provou_levou_stores')
                .update({ last_payment: data })
                .eq('id', _currentPagamentosStoreId);
            if (idx !== -1) clients[idx].lastPayment = data;
        }

        // Limpa form, recarrega lista, atualiza stats
        document.getElementById('pgto-valor').value = '';
        document.getElementById('pgto-descricao').value = '';
        await loadPagamentos(_currentPagamentosStoreId);
        updateStats();
        renderTable();
        // o novo lançamento entra nos números da tela Financeiro
        saudeState.carregado = false;
        if (document.getElementById('pagamentos').classList.contains('active')) {
            payState.rows = buildPagamentosRows();
            renderPagamentos();
            loadSaude(true);
        }
    } catch (err) {
        console.error('Erro ao salvar pagamento:', err);
        alert('Erro ao salvar pagamento: ' + (err.message || err));
    } finally {
        if (btn) {
            btn.disabled = false;
            const ic = document.createElement('i'); ic.className = 'fas fa-check';
            btn.textContent = ' Registrar';
            btn.prepend(ic);
        }
    }
}

async function deletePagamento(id) {
    if (!confirm('Excluir este pagamento?')) return;
    if (!db) return;
    try {
        const { error } = await db.from('pagamentos_clientes').delete().eq('id', id);
        if (error) throw error;
        await loadPagamentos(_currentPagamentosStoreId);
        updateStats();
    } catch (err) {
        console.error('Erro ao excluir:', err);
        alert('Erro ao excluir: ' + (err.message || err));
    }
}

function _waLink(phone, msg) {
    const num = String(phone || '').replace(/\D/g, '');
    if (!num) return null;
    const full = num.startsWith('55') ? num : '55' + num;
    return `https://wa.me/${full}?text=${encodeURIComponent(msg || '')}`;
}

// metaParts: array of { text, bold?, color? ('red'|'yellow'|'green') }
function _actionItem({ name, metaParts, phone, wamsg, urgentClass }) {
    const item = document.createElement('div');
    item.className = 'action-item' + (urgentClass ? ' ' + urgentClass : '');

    const info = document.createElement('div');
    info.className = 'action-info';
    const dn = document.createElement('div');
    dn.className = 'action-name';
    dn.textContent = name;
    const dm = document.createElement('div');
    dm.className = 'action-meta';
    (metaParts || []).forEach((part, i) => {
        if (i > 0) dm.appendChild(document.createTextNode(' · '));
        const el = document.createElement(part.bold ? 'strong' : 'span');
        if (part.color) el.className = part.color;
        el.textContent = part.text;
        dm.appendChild(el);
    });
    info.appendChild(dn); info.appendChild(dm);

    item.appendChild(info);
    const link = _waLink(phone, wamsg);
    if (link) {
        const a = document.createElement('a');
        a.className = 'action-cta';
        a.href = link;
        a.target = '_blank';
        a.title = 'Abrir WhatsApp';
        // Font Awesome icon — hardcoded class, no user data
        const ic = document.createElement('i');
        ic.className = 'fab fa-whatsapp';
        a.appendChild(ic);
        item.appendChild(a);
    }
    return item;
}

function renderCobrarAgora() {
    const list = document.getElementById('cobrar-agora-list');
    const totalEl = document.getElementById('stat-prox-pagamentos-total');
    if (!list) return;

    const today = new Date(); today.setHours(0,0,0,0);
    const rows = [];
    let total = 0;
    for (const c of clients) {
        if (c.status !== 'Ativo' && c.status !== 'Permuta') continue;
        if (!c.lastPayment || c.lastPayment === '-') continue;
        const p = c.lastPayment.split('T')[0].split('-').map(Number);
        if (p.length !== 3) continue;
        const nextPay = new Date(p[0], p[1], p[2]);
        const diff = Math.round((nextPay - today)/(1000*60*60*24));
        if (diff > 30) continue;
        const v = getClientMonthlyValue(c);
        rows.push({ c, nextPay, diff, v });
        if (c.status === 'Ativo' && diff <= 30) total += v;
    }
    rows.sort((a,b) => a.diff - b.diff);

    if (totalEl) totalEl.textContent = `R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

    while (list.firstChild) list.removeChild(list.firstChild);
    if (rows.length === 0) {
        const e = document.createElement('div');
        e.className = 'action-empty';
        e.textContent = 'Sem cobranças nos próximos 30 dias 🎉';
        list.appendChild(e); return;
    }
    for (const r of rows.slice(0, 8)) {
        const empresa = r.c.company || r.c.name || '—';
        const dateStr = r.nextPay.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
        const valor = `R$ ${r.v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
        let statusText, statusColor, urgent = '';
        if (r.diff < 0) { statusText = `Atrasado ${Math.abs(r.diff)}d`; statusColor = 'red'; urgent = 'urgent'; }
        else if (r.diff === 0) { statusText = 'Vence HOJE'; statusColor = 'yellow'; urgent = 'warning'; }
        else if (r.diff <= 7) { statusText = `Em ${r.diff}d`; statusColor = 'yellow'; urgent = 'warning'; }
        else { statusText = `Em ${r.diff}d`; statusColor = 'green'; }
        const wamsg = `Oi ${r.c.name?.split(' ')[0] || ''}, tudo bem? Passando pra lembrar que o pagamento mensal do Provou Levou (${valor}) vence ${dateStr}. Qualquer dúvida tô aqui!`;
        list.appendChild(_actionItem({
            name: empresa,
            metaParts: [
                { text: valor, bold: true },
                { text: `venc ${dateStr}` },
                { text: statusText, color: statusColor }
            ],
            phone: r.c.phone,
            wamsg,
            urgentClass: urgent
        }));
    }
}

function renderTestesGratuitos() {
    const list = document.getElementById('testes-list');
    const totalEl = document.getElementById('stat-testes-total');
    if (!list) return;

    const today = new Date(); today.setHours(0,0,0,0);
    const rows = [];
    for (const c of clients) {
        if (c.status !== 'Teste Gratuito') continue;
        const imp = c.implementationDate || c.date;
        if (!imp) continue;
        const p = String(imp).split('T')[0].split('-').map(Number);
        const start = new Date(p[0], p[1]-1, p[2]);
        const days = Math.round((today - start)/(1000*60*60*24));
        rows.push({ c, days, start });
    }
    rows.sort((a,b) => b.days - a.days);

    if (totalEl) totalEl.textContent = `${rows.length} teste${rows.length === 1 ? '' : 's'}`;

    while (list.firstChild) list.removeChild(list.firstChild);
    if (rows.length === 0) {
        const e = document.createElement('div');
        e.className = 'action-empty';
        e.textContent = 'Nenhum teste ativo';
        list.appendChild(e); return;
    }
    for (const r of rows) {
        const c = r.c;
        const empresa = c.company || c.name || '—';
        const v = getClientMonthlyValue(c);
        const valor = v ? `R$ ${v.toLocaleString('pt-BR')}` : '—';
        let statusText, statusColor, urgent = '';
        if (r.days > 7) {
            statusText = `Expirou há ${r.days - 7}d`;
            statusColor = 'red'; urgent = 'urgent';
        } else if (r.days >= 5) {
            statusText = `Faltam ${7 - r.days}d`;
            statusColor = 'yellow'; urgent = 'warning';
        } else {
            statusText = `Dia ${r.days}/7`;
            statusColor = 'green';
        }
        const wamsg = r.days > 7
            ? `Oi ${c.name?.split(' ')[0] || ''}! Seu teste do Provou Levou já encerrou. Quer continuar usando? O plano ${c.plan} é só ${valor}/mês 🚀`
            : `Oi ${c.name?.split(' ')[0] || ''}! Como está sendo a experiência com o Provou Levou no seu ${r.days}º dia de teste? Posso te ajudar com algo?`;
        list.appendChild(_actionItem({
            name: empresa,
            metaParts: [
                { text: c.plan || '—' },
                { text: valor },
                { text: statusText, color: statusColor }
            ],
            phone: c.phone,
            wamsg,
            urgentClass: urgent
        }));
    }
}

function renderExcessoProvas(cache) {
    const list = document.getElementById('excesso-list');
    const totalEl = document.getElementById('stat-excesso-total');
    if (!list) return;

    const provasCache = cache || readProvasCustoCache();
    if (!provasCache || !provasCache.tableData) {
        if (totalEl) totalEl.textContent = 'calculando...';
        while (list.firstChild) list.removeChild(list.firstChild);
        const e = document.createElement('div');
        e.className = 'action-empty';
        e.textContent = 'Calculando provas...';
        list.appendChild(e); return;
    }

    // Build dom -> {count, list of created_at timestamps not in cache, so approximate using count since start}
    // We don't have per-prova timestamps here; need separate computation similar to loadLimites.
    // Use the cache that was populated by computeProvasCustoTotal.
    const provasByOrigin = {};
    for (const row of provasCache.tableData || []) {
        provasByOrigin[row.origin] = row.count; // total count, not since-payment
    }

    // Contagens por loja (desde o cutoff de cada uma) vêm da RPC via loadExcessoProvasDetailed.
    const counts = window._excessoCounts;
    if (!counts) {
        if (totalEl) totalEl.textContent = 'aguardando...';
        while (list.firstChild) list.removeChild(list.firstChild);
        const e = document.createElement('div');
        e.className = 'action-empty';
        e.textContent = 'Carregando provas com data...';
        list.appendChild(e); return;
    }

    const rows = [];
    for (const c of clients) {
        if (c.status === 'Inativo') continue; // loja inativa não entra em excesso de provas
        const plan = c.plan || '';
        let base;
        if (plan === 'Personalizado') {
            base = (c.limitePersonalizado != null && c.limitePersonalizado > 0) ? c.limitePersonalizado : null;
        } else {
            base = PLAN_LIMITS[plan];
        }
        if (base == null || base === Infinity) continue;
        const limit = base + (c.fotosExtras || 0);
        // Precisa ter data de início (último pagamento / implementação) pra contar "desde então".
        const hasStart = (c.lastPayment && c.lastPayment !== '-') || (c.status === 'Teste Gratuito' && c.implementationDate);
        if (!hasStart) continue;
        const dom = normalizeDomain(c.website);
        if (!dom) continue;
        const used = counts[dom] || 0;  // já contado desde o cutoff da loja pela RPC
        if (used > limit) {
            rows.push({ c, used, limit, excess: used - limit, plan });
        }
    }
    rows.sort((a,b) => b.excess - a.excess);

    if (totalEl) totalEl.textContent = `${rows.length} cliente${rows.length === 1 ? '' : 's'}`;

    while (list.firstChild) list.removeChild(list.firstChild);
    if (rows.length === 0) {
        const e = document.createElement('div');
        e.className = 'action-empty';
        e.textContent = 'Ninguém acima do limite 🎉';
        list.appendChild(e); return;
    }
    for (const r of rows) {
        const c = r.c;
        const empresa = c.company || c.name || '—';
        const pct = Math.round(r.used / r.limit * 100);
        const urgent = pct >= 150 ? 'urgent' : 'warning';
        const wamsg = `Oi ${c.name?.split(' ')[0] || ''}! Vc já usou ${r.used} das ${r.limit} fotos do seu plano ${c.plan} este mês (+${r.excess} acima). Posso te oferecer um upgrade ou um pacote de fotos extras?`;
        list.appendChild(_actionItem({
            name: empresa,
            metaParts: [
                { text: r.plan },
                { text: `${r.used}/${r.limit} (${pct}%)`, bold: true },
                { text: `+${r.excess}`, color: 'red' }
            ],
            phone: c.phone,
            wamsg,
            urgentClass: urgent
        }));
    }
}

async function loadExcessoProvasDetailed() {
    // Conta provas por loja SERVER-SIDE (1 RPC), desde o cutoff de cada cliente ativo (último
    // pagamento / implementação), em vez de baixar dezenas de milhares de linhas pro navegador.
    if (!db) return;
    const lojas = [];
    (clients || []).forEach(c => {
        if (c.status === 'Inativo') return;
        const dom = normalizeDomain(c.website);
        let cutoff = null;
        // Fronteira em BRT (-03:00), igual à dashboard do lojista. Sem o offset o cutoff virava
        // meia-noite UTC e contava ~3h de provas da noite anterior (BRT) a mais (ex.: Cacife +57).
        if (c.lastPayment && c.lastPayment !== '-') cutoff = c.lastPayment.split('T')[0] + 'T00:00:00-03:00';
        else if (c.status === 'Teste Gratuito' && c.implementationDate) cutoff = String(c.implementationDate).split('T')[0] + 'T00:00:00-03:00';
        if (dom && cutoff) lojas.push({ dom, cutoff });
    });
    window._excessoCounts = await fetchProvasCounts(lojas);
    renderExcessoProvas();
}

function renderProximosPagamentos() {
    // Backwards-compat: delegate to new renderers
    renderCobrarAgora();
    renderTestesGratuitos();
    renderExcessoProvas();
    // Trigger detailed fetch in background if not already done
    if (!window._excessoCounts && !window._excessoProvasLoading) {
        window._excessoProvasLoading = true;
        loadExcessoProvasDetailed().finally(() => { window._excessoProvasLoading = false; });
    }
}

function _legacyProximosPagamentos() {
    const tbody = document.getElementById('proximos-pagamentos-body');
    const totalEl = document.getElementById('stat-prox-pagamentos-total');
    if (!tbody) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = [];
    let totalAReceber = 0;

    for (const c of clients) {
        if (c.status !== 'Ativo' && c.status !== 'Permuta') continue;
        if (!c.lastPayment || c.lastPayment === '-') continue;

        const parts = c.lastPayment.split('T')[0].split('-').map(Number);
        if (parts.length !== 3 || isNaN(parts[0])) continue;
        const [y, m, d] = parts;
        const nextPay = new Date(y, m, d); // last_payment + 1 month, same day
        const diffDays = Math.round((nextPay - today) / (1000 * 60 * 60 * 24));

        const valor = getClientMonthlyValue(c);
        rows.push({ c, nextPay, diffDays, valor });
        if (diffDays <= 30 && c.status === 'Ativo') totalAReceber += valor;
    }

    rows.sort((a, b) => a.nextPay - b.nextPay);
    const topRows = rows.slice(0, 3);

    if (totalEl) {
        totalEl.textContent = `R$ ${totalAReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a receber em 30 dias`;
    }

    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    if (topRows.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.style.cssText = 'text-align:center;color:var(--text-muted);padding:30px 0;';
        td.textContent = 'Sem pagamentos previstos. Cadastre a data de último pagamento dos clientes.';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    for (const r of topRows) {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        const divName = document.createElement('div');
        divName.style.fontWeight = '600';
        divName.textContent = r.c.name || '—';
        const divEmail = document.createElement('div');
        divEmail.style.cssText = 'color:var(--text-muted);font-size:12px;';
        divEmail.textContent = r.c.email || '';
        tdName.appendChild(divName);
        tdName.appendChild(divEmail);

        const tdCompany = document.createElement('td');
        tdCompany.textContent = r.c.company || '—';

        const tdPlan = document.createElement('td');
        tdPlan.textContent = getClientPlanLabel(r.c);

        const tdValor = document.createElement('td');
        tdValor.style.cssText = 'color:var(--success);font-weight:600;font-variant-numeric:tabular-nums;';
        tdValor.textContent = `R$ ${r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const tdData = document.createElement('td');
        tdData.style.cssText = 'font-variant-numeric:tabular-nums;';
        tdData.textContent = r.nextPay.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

        const tdStatus = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'status-badge';
        if (r.diffDays < 0) {
            badge.classList.add('status-inactive');
            badge.textContent = `Atrasado ${Math.abs(r.diffDays)}d`;
        } else if (r.diffDays === 0) {
            badge.classList.add('status-pending');
            badge.textContent = 'Hoje';
        } else if (r.diffDays <= 7) {
            badge.classList.add('status-pending');
            badge.textContent = `Em ${r.diffDays} dia${r.diffDays > 1 ? 's' : ''}`;
        } else {
            badge.classList.add('status-active');
            badge.textContent = `Em ${r.diffDays} dias`;
        }
        tdStatus.appendChild(badge);

        tr.appendChild(tdName);
        tr.appendChild(tdCompany);
        tr.appendChild(tdPlan);
        tr.appendChild(tdValor);
        tr.appendChild(tdData);
        tr.appendChild(tdStatus);
        tbody.appendChild(tr);
    }
}

function renderLucroLiquido(mrr) {
    const valEl = document.getElementById('stat-lucro-liquido');
    const subEl = document.getElementById('stat-lucro-sub');
    const cache = readProvasCustoCache();
    const totalCusto = (cache && typeof cache.totalCusto === 'number') ? cache.totalCusto : null;

    if (valEl && subEl) {
        if (totalCusto == null) {
            valEl.textContent = formatBRL(mrr);
            subEl.textContent = 'Custo não calculado · clique 🔄';
        } else {
            valEl.textContent = formatBRL(mrr - totalCusto);
            subEl.textContent = `MRR ${formatBRL(mrr)} − Custo ${formatBRL(totalCusto)}`;
        }
    }

    // Cost breakdown cards
    const setCostCard = (valId, subId, custo, provas, ratePerLabel) => {
        const v = document.getElementById(valId);
        const s = document.getElementById(subId);
        if (v) v.textContent = (custo == null) ? '—' : formatBRL(custo);
        if (s) s.textContent = (provas == null)
            ? '—'
            : `${provas.toLocaleString('pt-BR')} provas${ratePerLabel ? ' · ' + ratePerLabel : ''}`;
    };

    if (cache) {
        setCostCard('stat-dash-custo-oculos', 'stat-dash-custo-oculos-sub', cache.custoOculos, cache.provasOculos, 'R$ 0,045/prova');
        setCostCard('stat-dash-custo-roupa', 'stat-dash-custo-roupa-sub', cache.custoRoupa, cache.provasRoupa, 'R$ 0,35/prova');
        setCostCard('stat-dash-custo-total', 'stat-dash-custo-total-sub', cache.totalCusto, cache.totalProvas, '');
    } else {
        setCostCard('stat-dash-custo-oculos', 'stat-dash-custo-oculos-sub', 0, 0, 'R$ 0,045/prova');
        setCostCard('stat-dash-custo-roupa', 'stat-dash-custo-roupa-sub', 0, 0, 'R$ 0,35/prova');
        setCostCard('stat-dash-custo-total', 'stat-dash-custo-total-sub', 0, 0, '');
    }
}

async function refreshFaturamentoPosProva() {
    const btn = document.getElementById('btn-refresh-faturamento');
    const icon = btn ? btn.querySelector('i') : null;
    const updEl = document.getElementById('stat-faturamento-updated');
    if (icon) icon.classList.add('fa-spin');
    setUpdatedLine(updEl, 'fas fa-spinner fa-spin', 'Calculando...');

    try {
        const result = await computeFaturamentoPosProva();
        writeFaturamentoCache(result);
        renderFaturamentoCard(result);
        renderTable();
    } catch (err) {
        console.error('Erro ao calcular faturamento:', err);
        setUpdatedLine(updEl, 'fas fa-exclamation-triangle', 'Erro — ver console');
    } finally {
        if (icon) icon.classList.remove('fa-spin');
    }
}

// --- Tamagotchi Provinha ---
const GROWTH_LEVELS = [
    { min: 0, max: 3, name: 'Ovo', level: 1 },
    { min: 4, max: 10, name: 'Mini Cabide', level: 2 },
    { min: 11, max: 25, name: 'Cabide Medio', level: 3 },
    { min: 26, max: 50, name: 'Manequim', level: 4 },
    { min: 51, max: Infinity, name: 'Manequim Premium', level: 5 },
];

const REVENUE_LEVELS = [
    { min: 0, max: 200, name: 'Pelado', level: 1 },
    { min: 201, max: 1000, name: 'Camiseta', level: 2 },
    { min: 1001, max: 5000, name: 'Casual', level: 3 },
    { min: 5001, max: 15000, name: 'Elegante', level: 4 },
    { min: 15001, max: Infinity, name: 'Dourado', level: 5 },
];

function getLevel(value, levels) {
    for (const l of levels) {
        if (value >= l.min && value <= l.max) return l;
    }
    return levels[0];
}

function getBarPercent(value, levelObj) {
    if (levelObj.max === Infinity) return 100;
    const range = levelObj.max - levelObj.min + 1;
    const progress = value - levelObj.min;
    return Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
}

function getNextThreshold(levelObj) {
    if (levelObj.max === Infinity) return 'MAX';
    return levelObj.max + 1;
}

function getStageName(growthLevel, revenueLevel) {
    if (growthLevel.level === 1 && revenueLevel.level === 1) return 'Ovo Pelado';
    if (growthLevel.level === 1) return 'Ovo de ' + revenueLevel.name;
    if (revenueLevel.level === 1) return growthLevel.name + ' Pelado';
    return growthLevel.name + ' ' + revenueLevel.name;
}

function buildProvinhaSVG(growthLvl, revenueLvl) {
    const bodies = {
        1: '<ellipse cx="80" cy="110" rx="35" ry="45" fill="#2d1f4e" stroke="#7c3aed" stroke-width="2"/>'
         + '<ellipse cx="80" cy="110" rx="28" ry="38" fill="#3b2766" opacity="0.5"/>'
         + '<circle cx="70" cy="102" r="5" fill="white"/><circle cx="70" cy="102" r="3" fill="#1a1a2e"/>'
         + '<circle cx="90" cy="102" r="5" fill="white"/><circle cx="90" cy="102" r="3" fill="#1a1a2e"/>'
         + '<ellipse cx="80" cy="115" rx="4" ry="2" fill="#c084fc" opacity="0.6"/>',
        2: '<line x1="80" y1="40" x2="80" y2="55" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/>'
         + '<circle cx="80" cy="36" r="6" fill="none" stroke="#7c3aed" stroke-width="3"/>'
         + '<path d="M50 70 Q80 55 110 70" stroke="#7c3aed" stroke-width="5" fill="none" stroke-linecap="round"/>'
         + '<line x1="50" y1="70" x2="50" y2="80" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/>'
         + '<line x1="110" y1="70" x2="110" y2="80" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/>'
         + '<circle cx="70" cy="90" r="5" fill="white"/><circle cx="70" cy="90" r="3" fill="#1a1a2e"/>'
         + '<circle cx="90" cy="90" r="5" fill="white"/><circle cx="90" cy="90" r="3" fill="#1a1a2e"/>'
         + '<path d="M73 100 Q80 105 87 100" stroke="#c084fc" stroke-width="2" fill="none" stroke-linecap="round"/>',
        3: '<line x1="80" y1="30" x2="80" y2="50" stroke="#9333ea" stroke-width="4" stroke-linecap="round"/>'
         + '<circle cx="80" cy="26" r="7" fill="none" stroke="#9333ea" stroke-width="3"/>'
         + '<path d="M40 65 Q80 45 120 65" stroke="#9333ea" stroke-width="6" fill="none" stroke-linecap="round"/>'
         + '<line x1="40" y1="65" x2="40" y2="80" stroke="#9333ea" stroke-width="4" stroke-linecap="round"/>'
         + '<line x1="120" y1="65" x2="120" y2="80" stroke="#9333ea" stroke-width="4" stroke-linecap="round"/>'
         + '<line x1="40" y1="80" x2="35" y2="110" stroke="#9333ea" stroke-width="3" stroke-linecap="round"/>'
         + '<line x1="120" y1="80" x2="125" y2="110" stroke="#9333ea" stroke-width="3" stroke-linecap="round"/>'
         + '<circle cx="68" cy="88" r="6" fill="white"/><circle cx="68" cy="88" r="3.5" fill="#1a1a2e"/>'
         + '<circle cx="92" cy="88" r="6" fill="white"/><circle cx="92" cy="88" r="3.5" fill="#1a1a2e"/>'
         + '<path d="M72 102 Q80 108 88 102" stroke="#c084fc" stroke-width="2" fill="none" stroke-linecap="round"/>',
        4: '<ellipse cx="80" cy="45" rx="22" ry="26" fill="#2d1f4e" stroke="#9333ea" stroke-width="2"/>'
         + '<rect x="65" y="70" width="30" height="55" rx="8" fill="#2d1f4e" stroke="#9333ea" stroke-width="2"/>'
         + '<line x1="65" y1="85" x2="40" y2="100" stroke="#9333ea" stroke-width="4" stroke-linecap="round"/>'
         + '<line x1="95" y1="85" x2="120" y2="100" stroke="#9333ea" stroke-width="4" stroke-linecap="round"/>'
         + '<rect x="70" y="125" width="8" height="35" rx="4" fill="#2d1f4e" stroke="#9333ea" stroke-width="2"/>'
         + '<rect x="82" y="125" width="8" height="35" rx="4" fill="#2d1f4e" stroke="#9333ea" stroke-width="2"/>'
         + '<circle cx="72" cy="40" r="5" fill="white"/><circle cx="72" cy="40" r="3" fill="#1a1a2e"/>'
         + '<circle cx="88" cy="40" r="5" fill="white"/><circle cx="88" cy="40" r="3" fill="#1a1a2e"/>'
         + '<path d="M75 52 Q80 56 85 52" stroke="#c084fc" stroke-width="2" fill="none" stroke-linecap="round"/>',
        5: '<defs><linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">'
         + '<stop offset="0%" style="stop-color:#fbbf24"/><stop offset="100%" style="stop-color:#f59e0b"/>'
         + '</linearGradient></defs>'
         + '<ellipse cx="80" cy="42" rx="24" ry="28" fill="#3b2766" stroke="url(#gold-grad)" stroke-width="3"/>'
         + '<rect x="62" y="68" width="36" height="58" rx="10" fill="#3b2766" stroke="url(#gold-grad)" stroke-width="3"/>'
         + '<line x1="62" y1="85" x2="35" y2="98" stroke="url(#gold-grad)" stroke-width="5" stroke-linecap="round"/>'
         + '<line x1="98" y1="85" x2="125" y2="98" stroke="url(#gold-grad)" stroke-width="5" stroke-linecap="round"/>'
         + '<rect x="68" y="126" width="10" height="38" rx="5" fill="#3b2766" stroke="url(#gold-grad)" stroke-width="3"/>'
         + '<rect x="82" y="126" width="10" height="38" rx="5" fill="#3b2766" stroke="url(#gold-grad)" stroke-width="3"/>'
         + '<circle cx="72" cy="37" r="5.5" fill="white"/><circle cx="72" cy="37" r="3.5" fill="#1a1a2e"/>'
         + '<circle cx="88" cy="37" r="5.5" fill="white"/><circle cx="88" cy="37" r="3.5" fill="#1a1a2e"/>'
         + '<path d="M74 50 Q80 55 86 50" stroke="#fbbf24" stroke-width="2" fill="none" stroke-linecap="round"/>'
         + '<circle cx="80" cy="20" r="3" fill="#fbbf24" opacity="0.8"/>'
         + '<circle cx="68" cy="24" r="2" fill="#fbbf24" opacity="0.5"/>'
         + '<circle cx="92" cy="24" r="2" fill="#fbbf24" opacity="0.5"/>'
    };

    const clothes = {
        1: '<ellipse cx="72" cy="48" rx="6" ry="3" fill="#ef4444" opacity="0.3"/>'
         + '<ellipse cx="88" cy="48" rx="6" ry="3" fill="#ef4444" opacity="0.3"/>',
        2: '<rect x="63" y="70" width="34" height="30" rx="4" fill="#7c3aed" opacity="0.7"/>'
         + '<line x1="80" y1="70" x2="80" y2="100" stroke="#9333ea" stroke-width="1" opacity="0.5"/>',
        3: '<rect x="63" y="70" width="34" height="25" rx="4" fill="#3b82f6" opacity="0.7"/>'
         + '<path d="M73 70 L80 65 L87 70" fill="#3b82f6" stroke="#60a5fa" stroke-width="1"/>'
         + '<rect x="66" y="95" width="12" height="30" rx="3" fill="#1e3a5f" opacity="0.8"/>'
         + '<rect x="82" y="95" width="12" height="30" rx="3" fill="#1e3a5f" opacity="0.8"/>',
        4: '<rect x="61" y="70" width="38" height="28" rx="4" fill="#1e293b" opacity="0.9"/>'
         + '<path d="M70 70 L80 62 L90 70" fill="#334155" stroke="#64748b" stroke-width="1"/>'
         + '<rect x="78" y="72" width="4" height="24" rx="2" fill="#7c3aed" opacity="0.8"/>'
         + '<rect x="64" y="98" width="14" height="28" rx="3" fill="#0f172a" opacity="0.9"/>'
         + '<rect x="82" y="98" width="14" height="28" rx="3" fill="#0f172a" opacity="0.9"/>'
         + '<circle cx="80" cy="73" r="2.5" fill="#c084fc"/>',
        5: '<rect x="59" y="68" width="42" height="30" rx="5" fill="#1a1a2e" opacity="0.95" stroke="#fbbf24" stroke-width="1"/>'
         + '<path d="M68 68 L80 58 L92 68" fill="#1a1a2e" stroke="#fbbf24" stroke-width="1"/>'
         + '<rect x="78" y="70" width="4" height="26" rx="2" fill="#fbbf24" opacity="0.8"/>'
         + '<rect x="62" y="98" width="15" height="30" rx="4" fill="#0f0f13" opacity="0.95" stroke="#fbbf24" stroke-width="0.5"/>'
         + '<rect x="83" y="98" width="15" height="30" rx="4" fill="#0f0f13" opacity="0.95" stroke="#fbbf24" stroke-width="0.5"/>'
         + '<circle cx="80" cy="71" r="3" fill="#fbbf24"/>'
         + '<rect x="35" y="95" width="10" height="3" rx="1.5" fill="#fbbf24" opacity="0.6"/>'
         + '<rect x="115" y="95" width="10" height="3" rx="1.5" fill="#fbbf24" opacity="0.6"/>'
    };

    var bodyKey = Math.min(growthLvl, 5);
    var clothesKey = Math.min(revenueLvl, 5);
    // Only show clothes on bodies level 2+ (ovo has no body to dress)
    var clothesSvg = bodyKey >= 2 ? clothes[clothesKey] : clothes[1];

    return '<svg viewBox="0 0 160 180" width="160" height="200" xmlns="http://www.w3.org/2000/svg">'
        + bodies[bodyKey]
        + clothesSvg
        + '</svg>';
}

let clients = [];
let db = null; // cliente Supabase (nome diferente para não conflitar com window.supabase do SDK)

// ─── Helpers de Modal ──────────────────────────────────────────────────────────
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function hideModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

// Expõe no window para compatibilidade com qualquer onclick inline remanescente
window.openRegistrationModal = () => openModal('registration-modal');
window.closeRegistrationModal = () => {
    hideModal('registration-modal');
    const form = document.getElementById('client-form');
    if (form) form.reset();
    const idInput = document.getElementById('client_id');
    if (idInput) idInput.value = '';
    const title = document.getElementById('reg-modal-title');
    if (title) title.textContent = 'Novo Cliente';
    const errorMsg = document.getElementById('form-error-message');
    if (errorMsg) errorMsg.style.display = 'none';
    const wrapper = document.getElementById('implementation-date-wrapper');
    if (wrapper) wrapper.style.display = 'none';
    const histBtn = document.getElementById('btn-historico-pagamentos');
    if (histBtn) histBtn.style.display = 'none';
    const rapidoNovo = document.getElementById('btn-registrar-rapido');
    if (rapidoNovo) rapidoNovo.style.display = 'none';
    const dicaNovo = document.getElementById('ultimo-pgto-dica');
    if (dicaNovo) dicaNovo.textContent = 'Salve o cliente para lançar pagamentos.';
    // Reset lock do plano personalizado
    const planSelect = document.getElementById('plan');
    if (planSelect) {
        planSelect.disabled = false;
        planSelect.style.opacity = '';
        planSelect.style.cursor = '';
        const opt = planSelect.querySelector('option[value="Personalizado"]');
        if (opt) opt.disabled = true;
    }
};
window.closeModal = () => hideModal('client-modal');

window.showApiKeyModal = (key) => {
    const modal = document.getElementById('apikey-modal');
    if (!modal) return;

    const input = document.getElementById('revealed-api-key');
    const toggleBtn = document.getElementById('btn-toggle-key');
    const copyBtn = document.getElementById('btn-copy-key');
    const iconToggle = document.getElementById('icon-toggle-key');

    input.value = key;
    input.type = 'password';
    iconToggle.className = 'fas fa-eye';

    copyBtn.innerHTML = '<i class="fas fa-copy" style="margin-right: 8px;"></i> Copiar Chave';
    copyBtn.style.background = '';

    modal.classList.add('active');
};

window.closeApiKeyModal = () => {
    hideModal('apikey-modal');
    const input = document.getElementById('revealed-api-key');
    if (input) input.value = '';
};

window.setFilter = (range, btn) => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
};
window.deleteClient = (id) => deleteClientById(id);
window.showClientDetails = (id) => showClientDetailsById(id);

// ─── Funções de Dados ──────────────────────────────────────────────────────────
async function loadClients() {
    if (!db) {
        updateStats();
        renderTable();
        return;
    }

    try {
        const { data, error } = await db
            .from('provou_levou_stores')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        clients = data.map(s => ({
            id: s.id,
            name: s.name,
            company: s.company || s.name,
            email: s.email,
            phone: s.phone || '',
            plan: s.plan || 'Starter',
            status: s.status || 'Ativo',
            website: s.domain || '',
            date: new Date(s.created_at).toISOString().split('T')[0],
            lastPayment: s.last_payment || '-',
            implementationDate: s.implementation_date || null,
            categoria: s.categoria || 'oculos',
            planoPersonalizado: s.plano_personalizado || null,
            valorPersonalizado: s.valor_personalizado != null ? parseFloat(s.valor_personalizado) : null,
            fotosExtras: s.fotos_extras != null ? parseInt(s.fotos_extras) : 0,
            limitePersonalizado: s.limite_personalizado != null ? parseInt(s.limite_personalizado) : null,
            formaPagamento: s.forma_pagamento || '',
            observacao: s.observacao || ''
        }));
    } catch (err) {
        console.error('Erro ao carregar clientes:', err);
    }

    updateStats();
    renderTable();
    autoRefreshLucroLiquido();
}

let lucroAutoRefreshing = false;
async function autoRefreshLucroLiquido() {
    if (lucroAutoRefreshing || !db) return;
    lucroAutoRefreshing = true;
    try {
        await computeProvasCustoTotal();
        const active = clients.filter(c => c.status === 'Ativo');
        const mrr = active.reduce((sum, c) => sum + (PLAN_VALUES[c.plan] || 0), 0);
        renderLucroLiquido(mrr);
    } catch (err) {
        console.warn('Auto-refresh lucro falhou:', err);
    } finally {
        lucroAutoRefreshing = false;
    }
}

async function addClient(event) {
    event.preventDefault();

    const errorMsg = document.getElementById('form-error-message');
    if (errorMsg) errorMsg.style.display = 'none';

    const clientId = document.getElementById('client_id') ? document.getElementById('client_id').value : '';

    const payload = {
        name: document.getElementById('name').value.trim(),
        company: document.getElementById('company').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        plan: document.getElementById('plan').value,
        status: document.getElementById('status').value,
        implementation_date: document.getElementById('status').value === 'Teste Gratuito' ? document.getElementById('implementation_date').value : null,
        domain: document.getElementById('website').value.trim() || `loja-${Date.now()}.com`,
        last_payment: document.getElementById('last_payment').value || null,
        categoria: document.getElementById('categoria').value || 'oculos',
        plano_personalizado: document.getElementById('plano_personalizado').value.trim() || null,
        valor_personalizado: parseFloat(document.getElementById('valor_personalizado').value) || null,
        fotos_extras: parseInt(document.getElementById('fotos_extras').value) || 0,
        limite_personalizado: parseInt(document.getElementById('limite_personalizado').value) || null,
        forma_pagamento: document.getElementById('forma_pagamento').value || null,
        observacao: document.getElementById('observacao').value.trim() || null
    };

    if (!db) {
        // Modo offline: salva localmente
        if (clientId) {
            const index = clients.findIndex(c => c.id == clientId);
            if (index !== -1) {
                clients[index] = { ...clients[index], ...payload, implementationDate: payload.implementation_date };
            }
        } else {
            clients.unshift({
                ...payload,
                id: Date.now(),
                date: new Date().toISOString().split('T')[0],
                lastPayment: '-',
                implementationDate: payload.implementation_date
            });
        }
        window.closeRegistrationModal();
        updateStats();
        renderTable();
        return;
    }

    try {
        if (clientId) {
            const { error } = await db.from('provou_levou_stores').update(payload).eq('id', clientId);
            if (error) throw error;
        } else {
            // Delega a criação/inserção do cliente totalmente para o n8n via Webhook
            // Generate API Key via Webhook right after insertion for new clients
            try {
                const webhookPayload = {
                    name: payload.name,
                    domain: payload.domain,
                    email: payload.email,
                    active: payload.status === 'Ativo',
                    company: payload.company,
                    phone: payload.phone,
                    plan: payload.plan,
                    status: payload.status,
                    last_payment: payload.last_payment,
                    implementation_date: payload.implementation_date
                };

                const response = await fetch('https://n8n.segredosdodrop.com/webhook/cadastro-lojista', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(webhookPayload)
                });

                if (response.ok) {
                    const textData = await response.text();
                    let returnedVal = textData;

                    try {
                        const jsonData = JSON.parse(textData);
                        // Se o n8n retornou um array
                        if (Array.isArray(jsonData) && jsonData.length > 0) {
                            returnedVal = jsonData[0].api_key || JSON.stringify(jsonData[0], null, 2);
                        }
                        // Se o n8n retornou um objeto
                        else if (jsonData && jsonData.api_key) {
                            returnedVal = jsonData.api_key;
                        }
                    } catch (e) {
                        // Se não for JSON, mantém o texto puro
                    }

                    if (returnedVal) {
                        window.showApiKeyModal(returnedVal);
                    } else {
                        alert('Cliente cadastrado com sucesso! Porém a API Key recebida estava vazia.');
                    }
                } else {
                    alert('Cliente cadastrado com sucesso. Porém, erro ao acionar o webhook no n8n. Status: ' + response.status);
                }
            } catch (webhookErr) {
                console.error('Erro no webhook de criação:', webhookErr);
                alert('Cliente cadastrado com sucesso. Porém, falha ao conectar no webhook do n8n para gerar a chave.');
            }
        }
        window.closeRegistrationModal();
        await loadClients();
    } catch (err) {
        console.error('Erro ao cadastrar cliente:', err);
        const errorMsg = document.getElementById('form-error-message');
        if (errorMsg) {
            if (err.code === '23505') {
                errorMsg.innerHTML = `<strong>Atenção!</strong> Este domínio já está cadastrado: <strong>${payload.domain}</strong>.<br>Cada loja precisa ter um domínio único.`;
            } else {
                errorMsg.innerHTML = `Ocorreu um erro ao salvar o cliente. Verifique o console.`;
            }
            errorMsg.style.display = 'block';
        } else {
            // fallback se o elemento não existir
            if (err.code === '23505') {
                alert(`⚠️ Este domínio já está cadastrado:\n"${payload.domain}"\n\nCada loja precisa ter um domínio único. Verifique se esse cliente já existe na lista.`);
            } else {
                alert('Erro ao salvar. Verifique o console.');
            }
        }
    }
}

async function deleteClientById(id) {
    if (!confirm('Excluir este cliente?')) return;

    if (db) {
        try {
            const { error } = await db.from('provou_levou_stores').delete().eq('id', id);
            if (error) throw error;
        } catch (err) {
            console.error('Erro ao excluir:', err);
            alert('Erro ao excluir no banco!');
            return;
        }
    } else {
        clients = clients.filter(c => c.id !== id);
    }

    await loadClients();
}

// Bloqueia dropdown de plano quando há plano personalizado preenchido
function syncPersonalizadoLock() {
    const planoCustomInput = document.getElementById('plano_personalizado');
    const planSelect = document.getElementById('plan');
    const customOpt = planSelect ? planSelect.querySelector('option[value="Personalizado"]') : null;
    if (!planoCustomInput || !planSelect || !customOpt) return;

    const hasCustom = planoCustomInput.value.trim() !== '';
    if (hasCustom) {
        customOpt.disabled = false;
        planSelect.value = 'Personalizado';
        planSelect.disabled = true;
        planSelect.style.opacity = '0.6';
        planSelect.style.cursor = 'not-allowed';
    } else {
        planSelect.disabled = false;
        planSelect.style.opacity = '';
        planSelect.style.cursor = '';
        if (planSelect.value === 'Personalizado') {
            planSelect.value = 'Essencial'; // fallback
        }
        customOpt.disabled = true;
    }
}

function editClientById(id) {
    const c = clients.find(c => c.id == id);
    if (!c) return;

    const idInput = document.getElementById('client_id');
    if (idInput) idInput.value = c.id;

    const title = document.getElementById('reg-modal-title');
    if (title) title.textContent = 'Editar Cliente';

    document.getElementById('name').value = c.name || '';
    document.getElementById('company').value = c.company || '';
    document.getElementById('email').value = c.email || '';
    document.getElementById('phone').value = c.phone || '';
    document.getElementById('plan').value = c.plan || 'Starter';
    document.getElementById('status').value = c.status || 'Ativo';
    document.getElementById('website').value = c.website || '';
    document.getElementById('last_payment').value = c.lastPayment && c.lastPayment !== '-' ? c.lastPayment : '';
    document.getElementById('categoria').value = c.categoria || 'oculos';
    document.getElementById('plano_personalizado').value = c.planoPersonalizado || '';
    document.getElementById('valor_personalizado').value = c.valorPersonalizado != null ? c.valorPersonalizado : '';
    document.getElementById('limite_personalizado').value = c.limitePersonalizado != null ? c.limitePersonalizado : '';
    document.getElementById('fotos_extras').value = c.fotosExtras || '';
    document.getElementById('forma_pagamento').value = c.formaPagamento || '';
    document.getElementById('observacao').value = c.observacao || '';
    // Aplica lógica de plano personalizado (lock dropdown se tem custom)
    syncPersonalizadoLock();

    const impWrapper = document.getElementById('implementation-date-wrapper');
    if (c.status === 'Teste Gratuito') {
        if (impWrapper) impWrapper.style.display = 'block';
        document.getElementById('implementation_date').value = c.implementationDate || c.date;
    } else {
        if (impWrapper) impWrapper.style.display = 'none';
        document.getElementById('implementation_date').value = '';
    }

    // Mostra botão de histórico (só faz sentido pra cliente já existente)
    const histBtn = document.getElementById('btn-historico-pagamentos');
    if (histBtn) {
        histBtn.style.display = 'inline-flex';
        histBtn.onclick = () => openPagamentosModal(id);
    }

    // Atalho: lançar um pagamento sem sair da ficha
    const rapido = document.getElementById('btn-registrar-rapido');
    if (rapido) {
        rapido.style.display = 'inline-flex';
        rapido.onclick = () => openPagamentosModal(id);
    }

    // Dica com o que já está lançado no histórico deste cliente
    const dica = document.getElementById('ultimo-pgto-dica');
    if (dica) {
        const meus = saudeState.pagamentos.filter(p => String(p.store) === String(id));
        if (!saudeState.carregado) {
            dica.textContent = 'Abra o histórico para ver os lançamentos.';
        } else if (!meus.length) {
            dica.textContent = 'Nenhum pagamento no histórico ainda.';
        } else {
            const ult = meus.slice().sort((a, b) => (a.data < b.data ? 1 : -1))[0];
            dica.textContent = `${meus.length} lançamento(s) · último: ${formatBRL(ult.valor)} em ${formatDate(ult.data)}`;
        }
    }

    openModal('registration-modal');
}

function showClientDetailsById(id) {
    const c = clients.find(c => c.id === id);
    if (!c) return;

    document.getElementById('modal-name').textContent = c.name;
    document.getElementById('modal-company').textContent = c.company;
    document.getElementById('modal-email').textContent = c.email;
    document.getElementById('modal-phone').textContent = c.phone;
    document.getElementById('modal-plan').textContent = c.plan;
    document.getElementById('modal-date').textContent = formatDate(c.date);

    const statusBadge = document.getElementById('modal-status');
    statusBadge.textContent = c.status;
    statusBadge.className = 'status-badge ' + statusClass(c.status);

    const testDaysWrapper = document.getElementById('modal-test-days-wrapper');
    if (c.status === 'Teste Gratuito') {
        const impDate = c.implementationDate || c.date;
        const diffTime = new Date() - new Date(impDate);
        const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
        const daysRemaining = Math.max(0, 7 - diffDays);
        if (diffDays > 7) {
            statusBadge.textContent = 'Teste Expirado';
            statusBadge.className = 'status-badge status-inactive';
            document.getElementById('modal-test-days').textContent = `Expirado (${diffDays} dias)`;
            document.getElementById('modal-test-days').style.color = '#ef4444'; // red
        } else {
            document.getElementById('modal-test-days').textContent = `${diffDays} de 7 dias (Restam ${daysRemaining})`;
            document.getElementById('modal-test-days').style.color = '#f59e0b'; // warning
        }
        testDaysWrapper.style.display = 'block';
    } else {
        testDaysWrapper.style.display = 'none';
    }

    const link = document.getElementById('modal-website');
    link.textContent = c.website || 'Não informado';
    link.href = c.website || '#';

    openModal('client-modal');
}


const PROVAS_CUSTO_CACHE_KEY = 'provasVirtuaisCustoCache';

function readProvasCustoCache() {
    try {
        const raw = localStorage.getItem(PROVAS_CUSTO_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function writeProvasCustoCache(data) {
    try { localStorage.setItem(PROVAS_CUSTO_CACHE_KEY, JSON.stringify(data)); }
    catch (e) { console.warn('Falha ao salvar cache de provas:', e); }
}

async function computeProvasCustoTotal() {
    if (!db) throw new Error('Supabase não conectado');

    const [lojistasRes, storesRes] = await Promise.all([
        db.from('lojistas').select('origem, categoria'),
        db.from('provou_levou_stores').select('domain, categoria')
    ]);
    const categoriaMap = {};
    for (const l of (lojistasRes.data || [])) {
        const dom = normalizeDomain(l.origem);
        if (dom) categoriaMap[dom] = l.categoria || 'oculos';
    }
    for (const s of (storesRes.data || [])) {
        const dom = normalizeDomain(s.domain);
        if (dom) categoriaMap[dom] = s.categoria || 'oculos';
    }

    const tryons = await fetchAllPaginated(
        'geracoes_provou_levou',
        'origin, created_at',
        [{ method: 'order', args: ['created_at', { ascending: false }] }]
    );

    const tryonCounts = {};
    for (const t of tryons) {
        const dom = normalizeDomain(t.origin);
        if (!dom) continue;
        tryonCounts[dom] = (tryonCounts[dom] || 0) + 1;
    }

    let totalProvas = 0;
    let provasOculos = 0, custoOculos = 0;
    let provasRoupa = 0, custoRoupa = 0;
    let custoRoupaPendente = false;
    const tableData = [];

    for (const [origin, count] of Object.entries(tryonCounts)) {
        const categoria = categoriaMap[origin] || 'oculos';
        const rate = getCategoryCost(categoria);
        const cost = rate != null ? count * rate : null;
        totalProvas += count;
        if (categoria === 'roupa') {
            provasRoupa += count;
            if (cost != null) custoRoupa += cost;
            else if (count > 0) custoRoupaPendente = true;
        } else {
            provasOculos += count;
            custoOculos += cost || 0;
        }
        tableData.push({ origin, count, categoria, cost });
    }

    const totalCusto = custoOculos + custoRoupa;
    const result = {
        updatedAt: new Date().toISOString(),
        totalProvas,
        totalCusto,
        provasOculos,
        custoOculos,
        provasRoupa,
        custoRoupa,
        custoRoupaPendente,
        tableData
    };
    writeProvasCustoCache(result);
    return result;
}

function clearChildren(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
}

function renderFaturamentoView(cache) {
    const tbody = document.getElementById('faturamento-table-body');
    if (!tbody) return;

    const totalEl = document.getElementById('stat-fat-total');
    const updEl = document.getElementById('stat-fat-updated');
    const lojasEl = document.getElementById('stat-fat-lojas');
    const ticketEl = document.getElementById('stat-fat-ticket');

    if (!cache) {
        if (totalEl) totalEl.textContent = 'R$ 0';
        if (updEl) updEl.textContent = 'Nunca calculado';
        if (lojasEl) lojasEl.textContent = '0';
        if (ticketEl) ticketEl.textContent = 'R$ 0';
        clearChildren(tbody);
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.style.cssText = 'text-align:center;color:var(--text-muted);padding:30px 0;';
        td.textContent = 'Clique em Atualizar pra calcular';
        tr.appendChild(td); tbody.appendChild(tr);
        return;
    }

    if (totalEl) totalEl.textContent = formatBRL(cache.totalGeral || 0);
    if (updEl) updEl.textContent = 'Atualizado ' + formatRelativeTime(cache.updatedAt);

    const porEmail = cache.porEmail || {};
    const porDomain = cache.porDomain || {};
    const rows = [];
    let lojasComReceita = 0;
    let somaReceita = 0;

    const lookup = (c) => {
        // Try email match first (case-insensitive), then domain
        const emailLow = String(c.email || '').toLowerCase().trim();
        for (const [k, v] of Object.entries(porEmail)) {
            if (String(k).toLowerCase().trim() === emailLow) return v;
        }
        const dom = normalizeDomain(c.website);
        if (dom && porDomain[dom]) return porDomain[dom];
        return null;
    };

    for (const c of clients) {
        const entry = lookup(c);
        const fat = entry && typeof entry === 'object'
            ? (entry.faturamento || 0)
            : (typeof entry === 'number' ? entry : null);
        rows.push({ c, fat });
        if (typeof fat === 'number' && fat > 0) {
            lojasComReceita++;
            somaReceita += fat;
        }
    }

    rows.sort((a, b) => (b.fat || 0) - (a.fat || 0));

    if (lojasEl) lojasEl.textContent = lojasComReceita.toLocaleString('pt-BR');
    if (ticketEl) ticketEl.textContent = formatBRL(lojasComReceita > 0 ? somaReceita / lojasComReceita : 0);

    clearChildren(tbody);
    if (rows.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.style.cssText = 'text-align:center;color:var(--text-muted);padding:30px 0;';
        td.textContent = 'Nenhum cliente cadastrado.';
        tr.appendChild(td); tbody.appendChild(tr);
        return;
    }

    for (const r of rows) {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        const dn = document.createElement('div'); dn.style.fontWeight = '600'; dn.textContent = r.c.name || '—';
        const de = document.createElement('div'); de.style.cssText = 'color:var(--text-muted);font-size:12px'; de.textContent = r.c.email || '';
        tdName.appendChild(dn); tdName.appendChild(de);

        const tdCompany = document.createElement('td'); tdCompany.textContent = r.c.company || '—';
        const tdPlan = document.createElement('td'); tdPlan.textContent = r.c.plan || '—';

        const tdFat = document.createElement('td');
        tdFat.style.cssText = 'font-weight:600;font-variant-numeric:tabular-nums;';
        if (typeof r.fat === 'number') {
            tdFat.textContent = formatBRL(r.fat);
            tdFat.style.color = r.fat > 0 ? 'var(--success)' : 'var(--text-muted)';
        } else {
            tdFat.textContent = '—';
            tdFat.style.color = 'var(--text-muted)';
        }

        tr.appendChild(tdName);
        tr.appendChild(tdCompany);
        tr.appendChild(tdPlan);
        tr.appendChild(tdFat);
        tbody.appendChild(tr);
    }
}

let _fatAutoRefreshing = false;
async function loadFaturamentoView() {
    // Show cached value immediately
    renderFaturamentoView(readFaturamentoCache());
    // Then auto-refresh in background
    if (_fatAutoRefreshing) return;
    _fatAutoRefreshing = true;
    try {
        const result = await computeFaturamentoPosProva();
        writeFaturamentoCache(result);
        renderFaturamentoView(result);
    } catch (err) {
        console.warn('Auto-refresh faturamento falhou:', err);
    } finally {
        _fatAutoRefreshing = false;
    }
}

async function refreshFaturamentoView() {
    const btn = document.getElementById('btn-refresh-faturamento-view');
    const icon = btn ? btn.querySelector('i') : null;
    const updEl = document.getElementById('stat-fat-updated');
    if (icon) icon.classList.add('fa-spin');
    if (updEl) updEl.textContent = 'Calculando...';
    try {
        const result = await computeFaturamentoPosProva();
        writeFaturamentoCache(result);
        renderFaturamentoView(result);
    } catch (err) {
        console.error('Erro ao calcular faturamento:', err);
        if (updEl) updEl.textContent = 'Erro — ver console';
    } finally {
        if (icon) icon.classList.remove('fa-spin');
    }
}

async function loadLimites() {
    if (!db) return;
    const tbody = document.getElementById('limites-table-body');
    if (!tbody) return;

    clearChildren(tbody);
    const loading = document.createElement('tr');
    const ldTd = document.createElement('td');
    ldTd.colSpan = 8;
    ldTd.style.cssText = 'text-align:center;color:var(--text-muted);padding:30px 0;';
    ldTd.textContent = 'Carregando dados...';
    loading.appendChild(ldTd);
    tbody.appendChild(loading);

    try {
        // Need clients loaded
        if (!clients || clients.length === 0) await loadClients();

        // Get start date per client: last_payment OR implementation_date (for teste gratuito) OR created_at
        const getStartDate = (c) => {
            if (c.lastPayment && c.lastPayment !== '-') return c.lastPayment;
            if (c.status === 'Teste Gratuito' && c.implementationDate) return c.implementationDate;
            return null;
        };

        // Conta provas por loja SERVER-SIDE (1 RPC) desde o cutoff de cada cliente (último pagamento /
        // implementação), em vez de baixar dezenas de milhares de linhas e agrupar no navegador.
        const lojasLim = [];
        for (const c of clients) {
            if (c.status === 'Inativo') continue;
            const dom = normalizeDomain(c.website);
            const sd = getStartDate(c);
            if (dom && sd) lojasLim.push({ dom, cutoff: String(sd).split('T')[0] + 'T00:00:00' });
        }
        const countsByDom = await fetchProvasCounts(lojasLim);

        // Build rows
        const rows = [];
        let monitorados = 0, atencao = 0, excedidos = 0;

        for (const c of clients) {
            if (c.status === 'Inativo') continue; // loja inativa não é monitorada em limites
            const dom = normalizeDomain(c.website);
            // Para plano Personalizado, usa limitePersonalizado; senão, usa PLAN_LIMITS
            let basePlanLimit;
            if (c.plan === 'Personalizado') {
                basePlanLimit = (c.limitePersonalizado != null && c.limitePersonalizado > 0) ? c.limitePersonalizado : null;
            } else {
                basePlanLimit = PLAN_LIMITS[c.plan];
            }
            const extras = c.fotosExtras || 0;
            const limit = (basePlanLimit === Infinity) ? Infinity : (basePlanLimit != null ? basePlanLimit + extras : null);
            let limitLabel;
            if (limit === Infinity) {
                limitLabel = 'Ilimitado';
            } else if (limit != null) {
                limitLabel = limit.toLocaleString('pt-BR');
                if (extras > 0) limitLabel += ` (+${extras})`;
            } else {
                limitLabel = '—';
            }
            const startDate = getStartDate(c);
            const isTeste = c.status === 'Teste Gratuito';

            let provasCount, status, statusClass, pctText, pctValue;

            if (!startDate) {
                provasCount = '—';
                pctText = '—';
                pctValue = null;
                status = isTeste ? 'Teste sem data' : 'Sem pagamento';
                statusClass = 'status-pending';
            } else {
                const count = countsByDom[dom] || 0;
                provasCount = count.toLocaleString('pt-BR');
                if (!isTeste) monitorados++;

                if (limit === Infinity) {
                    pctValue = 0;
                    pctText = '—';
                    status = isTeste ? 'Teste · Ilimitado' : 'Ilimitado';
                    statusClass = 'status-permuta';
                } else if (limit) {
                    pctValue = (count / limit) * 100;
                    pctText = pctValue.toFixed(0) + '%';
                    if (pctValue >= 100) {
                        status = isTeste ? 'Teste · Excedido' : 'Excedido';
                        statusClass = 'status-inactive';
                        if (!isTeste) excedidos++;
                    } else if (pctValue >= 80) {
                        status = isTeste ? 'Teste · Atenção' : 'Atenção';
                        statusClass = 'status-pending';
                        if (!isTeste) atencao++;
                    } else {
                        status = isTeste ? 'Teste · OK' : 'OK';
                        statusClass = 'status-active';
                    }
                } else {
                    pctValue = null;
                    pctText = '—';
                    status = isTeste ? 'Teste · Sem limite' : 'Sem limite';
                    statusClass = 'status-permuta';
                }
            }

            rows.push({ c, provasCount, limitLabel, pctText, pctValue, status, statusClass });
        }

        // Sort: excedidos first, then atencao, then by % desc, last for sem-pagamento at bottom
        rows.sort((a, b) => {
            const aHas = a.pctValue != null;
            const bHas = b.pctValue != null;
            if (aHas && !bHas) return -1;
            if (!aHas && bHas) return 1;
            if (aHas && bHas) return b.pctValue - a.pctValue;
            return 0;
        });

        // Update KPIs
        setText('stat-limites-monitorados', monitorados);
        setText('stat-limites-atencao', atencao);
        setText('stat-limites-excedidos', excedidos);

        // Render table
        clearChildren(tbody);
        if (rows.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 8;
            td.style.cssText = 'text-align:center;color:var(--text-muted);padding:30px 0;';
            td.textContent = 'Nenhum cliente cadastrado.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        for (const r of rows) {
            const tr = document.createElement('tr');

            const tdName = document.createElement('td');
            const dn = document.createElement('div'); dn.style.fontWeight = '600'; dn.textContent = r.c.name;
            const de = document.createElement('div'); de.style.cssText = 'color:var(--text-muted);font-size:12px'; de.textContent = r.c.email || '';
            tdName.appendChild(dn); tdName.appendChild(de);

            const tdCompany = document.createElement('td'); tdCompany.textContent = r.c.company || '—';
            const tdPlan = document.createElement('td'); tdPlan.textContent = r.c.plan || '—';
            const tdPay = document.createElement('td');
            tdPay.style.color = 'var(--text-muted)';
            if (r.c.lastPayment && r.c.lastPayment !== '-') {
                tdPay.textContent = formatDate(r.c.lastPayment);
            } else if (r.c.status === 'Teste Gratuito' && r.c.implementationDate) {
                tdPay.textContent = formatDate(r.c.implementationDate) + ' (início teste)';
                tdPay.style.fontStyle = 'italic';
            } else {
                tdPay.textContent = '—';
            }

            const tdProvas = document.createElement('td');
            tdProvas.style.cssText = 'font-weight:600;font-variant-numeric:tabular-nums';
            tdProvas.textContent = r.provasCount;

            const tdLimit = document.createElement('td');
            tdLimit.style.color = 'var(--text-muted)';
            tdLimit.textContent = r.limitLabel;

            const tdPct = document.createElement('td');
            if (r.pctValue == null || r.pctText === '—') {
                tdPct.style.color = 'var(--text-muted)';
                tdPct.textContent = r.pctText;
            } else {
                const pct = Math.min(100, r.pctValue);
                const barColor = r.pctValue >= 100 ? '#ef4444' : r.pctValue >= 80 ? '#f59e0b' : '#10b981';
                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
                const bar = document.createElement('div');
                bar.style.cssText = 'flex:1;height:6px;background:var(--bg-light-alt);border-radius:9999px;overflow:hidden;min-width:60px;max-width:100px;';
                const fill = document.createElement('div');
                fill.style.cssText = `height:100%;width:${pct}%;background:${barColor};border-radius:9999px;`;
                bar.appendChild(fill);
                const lbl = document.createElement('span');
                lbl.style.cssText = 'font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;min-width:42px;text-align:right;';
                lbl.style.color = barColor;
                lbl.textContent = r.pctText;
                wrap.appendChild(bar); wrap.appendChild(lbl);
                tdPct.appendChild(wrap);
            }

            const tdStatus = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'status-badge ' + r.statusClass;
            badge.textContent = r.status;
            tdStatus.appendChild(badge);

            tr.appendChild(tdName);
            tr.appendChild(tdCompany);
            tr.appendChild(tdPlan);
            tr.appendChild(tdPay);
            tr.appendChild(tdProvas);
            tr.appendChild(tdLimit);
            tr.appendChild(tdPct);
            tr.appendChild(tdStatus);
            tbody.appendChild(tr);
        }
    } catch (err) {
        console.error('Erro ao carregar limites:', err);
        clearChildren(tbody);
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 8;
        td.style.cssText = 'text-align:center;color:#ef4444;padding:30px 0;';
        td.textContent = 'Erro ao carregar dados.';
        tr.appendChild(td);
        tbody.appendChild(tr);
    }
}

function renderTryonsMessage(tbody, colspan, text, color) {
    clearChildren(tbody);
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = colspan;
    td.style.cssText = `text-align: center; color: ${color}; padding: 30px 0;`;
    td.textContent = text;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

async function loadTryons() {
    if (!db) return;

    const tbody = document.getElementById('tryons-table-body');
    if (!tbody) return;

    try {
        renderTryonsMessage(tbody, 4, 'Carregando dados...', 'var(--text-dim)');

        const r = await computeProvasCustoTotal();
        const totalTryons = r.totalProvas;
        const provasOculos = r.provasOculos;
        const custoOculos = r.custoOculos;
        const provasRoupa = r.provasRoupa;
        const custoRoupa = r.custoRoupa;
        const custoRoupaPendente = r.custoRoupaPendente;
        const tableData = r.tableData.slice();

        tableData.sort((a, b) => b.count - a.count);

        const statTotal = document.getElementById('stat-total-tryons');
        if (statTotal) statTotal.textContent = totalTryons.toLocaleString('pt-BR');

        const custoTotal = custoOculos + custoRoupa;
        const statCost = document.getElementById('stat-total-tryons-cost');
        if (statCost) statCost.textContent = formatBRL(custoTotal);

        const statOculosCost = document.getElementById('stat-tryons-oculos-cost');
        if (statOculosCost) statOculosCost.textContent = formatBRL(custoOculos);
        const statOculosCount = document.getElementById('stat-tryons-oculos-count');
        if (statOculosCount) statOculosCount.textContent = `${provasOculos.toLocaleString('pt-BR')} provas`;

        const statRoupaCost = document.getElementById('stat-tryons-roupa-cost');
        if (statRoupaCost) statRoupaCost.textContent = custoRoupaPendente ? '—' : formatBRL(custoRoupa);
        const statRoupaCount = document.getElementById('stat-tryons-roupa-count');
        if (statRoupaCount) statRoupaCount.textContent = `${provasRoupa.toLocaleString('pt-BR')} provas`;

        clearChildren(tbody);

        if (tableData.length === 0) {
            renderTryonsMessage(tbody, 4, 'Nenhuma geração encontrada.', 'var(--text-dim)');
            return;
        }

        for (const item of tableData) {
            const tr = document.createElement('tr');
            const isRoupa = item.categoria === 'roupa';
            const badgeBg = isRoupa ? 'rgba(16,185,129,0.15)' : 'rgba(124,58,237,0.15)';
            const badgeColor = isRoupa ? '#34d399' : '#a78bfa';
            const costLabel = item.cost != null ? formatBRL(item.cost) : '—';
            const catLabel = isRoupa ? 'Roupa' : 'Óculos';

            const tdOrigin = document.createElement('td');
            const divName = document.createElement('div');
            divName.style.fontWeight = '600';
            const aLink = document.createElement('a');
            aLink.href = 'https://' + item.origin;
            aLink.target = '_blank';
            aLink.style.color = 'var(--text)';
            aLink.style.textDecoration = 'none';
            aLink.textContent = item.origin + ' ';
            const iExt = document.createElement('i');
            iExt.className = 'fas fa-external-link-alt';
            iExt.style.cssText = 'font-size:10px;margin-left:4px;color:var(--accent)';
            aLink.appendChild(iExt);
            divName.appendChild(aLink);
            tdOrigin.appendChild(divName);

            const tdCat = document.createElement('td');
            const spanCat = document.createElement('span');
            spanCat.className = 'status-badge';
            spanCat.style.cssText = `background: ${badgeBg}; color: ${badgeColor}; font-weight: 600;`;
            spanCat.textContent = catLabel;
            tdCat.appendChild(spanCat);

            const tdCount = document.createElement('td');
            const spanCount = document.createElement('span');
            spanCount.className = 'status-badge';
            spanCount.style.cssText = 'background: rgba(124,58,237,0.15); color: #a78bfa; font-weight: 600;';
            spanCount.textContent = item.count.toLocaleString('pt-BR') + ' provas';
            tdCount.appendChild(spanCount);

            const tdCost = document.createElement('td');
            tdCost.style.cssText = 'color: #ef4444; font-weight: 600;';
            tdCost.textContent = costLabel;

            tr.appendChild(tdOrigin);
            tr.appendChild(tdCat);
            tr.appendChild(tdCount);
            tr.appendChild(tdCost);
            tbody.appendChild(tr);
        }

    } catch (err) {
        console.error('Erro ao carregar provas virtuais:', err);
        renderTryonsMessage(tbody, 4, 'Erro ao carregar os dados.', '#ef4444');
    }
}

// ─── Render ────────────────────────────────────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('dashboard-client-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    const sorted = [...clients].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(client => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';

        let cls = statusClass(client.status);
        const monthlyVal = getClientMonthlyValue(client);
        const value = monthlyVal ? `R$ ${monthlyVal.toLocaleString('pt-BR')}` : '-';
        const planLabel = getClientPlanLabel(client);

        let statusDisplay = client.status;
        if (client.status === 'Teste Gratuito') {
            const impDate = client.implementationDate || client.date;
            const diffTime = new Date() - new Date(impDate);
            const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
            if (diffDays > 7) {
                statusDisplay = `Teste Expirado`;
                cls = 'status-inactive'; // Red tag
            } else {
                statusDisplay = `Teste Gratuito (${diffDays}/7 dias)`;
            }
        }

        tr.innerHTML = `
            <td>
                <div style="font-weight:600">${client.name}</div>
                <div style="color:var(--text-dim);font-size:12px">${client.email}</div>
            </td>
            <td>${client.company}</td>
            <td>
                <span style="opacity:.85">${planLabel}</span>
                ${client.valorPersonalizado ? '<span style="font-size:10px;color:var(--purple-light);margin-left:6px;font-weight:600;">CUSTOM</span>' : ''}
            </td>
            <td style="color:var(--success);font-weight:600">${value}</td>
            <td>${payMethodHTML(client.formaPagamento)}</td>
            <td style="color:var(--text-dim)">${client.lastPayment && client.lastPayment !== '-' ? formatDate(client.lastPayment) : '—'}</td>
            <td><span class="status-badge ${cls}">${statusDisplay}</span></td>
            <td>
                <div style="display:flex;gap:10px">
                    <button data-action="edit"   data-id="${client.id}" style="background:none;border:none;color:var(--text-dim);cursor:pointer" title="Editar"><i class="fas fa-edit"></i></button>
                    <button data-action="delete" data-id="${client.id}" style="background:none;border:none;color:var(--text-dim);cursor:pointer" title="Excluir"><i class="fas fa-trash"></i></button>
                    <button data-action="view"   data-id="${client.id}" style="background:none;border:none;color:var(--text-dim);cursor:pointer" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                </div>
            </td>
        `;


        // Clique na linha → abre detalhes (exceto em botão)
        tr.addEventListener('click', e => {
            if (!e.target.closest('button')) showClientDetailsById(client.id);
        });

        // Botões de ação via delegação
        tr.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                if (action === 'edit') editClientById(id);
                if (action === 'delete') deleteClientById(id);
                if (action === 'view') showClientDetailsById(id);
            });
        });

        tbody.appendChild(tr);
    });
}

var lastGrowthLevel = 0;
var lastRevenueLevel = 0;

function updateProvinha() {
    var active = clients.filter(function(c) { return c.status === 'Ativo'; });
    var activeCount = active.length;
    var mrr = active.reduce(function(sum, c) { return sum + (PLAN_VALUES[c.plan] || 0); }, 0);

    var growthLevel = getLevel(activeCount, GROWTH_LEVELS);
    var revenueLevel = getLevel(mrr, REVENUE_LEVELS);

    // Update SVG — buildProvinhaSVG returns hardcoded SVG strings only (no user input)
    var avatarEl = document.getElementById('provinha-avatar');
    if (avatarEl) {
        // Safe: buildProvinhaSVG only returns hardcoded SVG markup, never user-supplied data
        avatarEl.innerHTML = buildProvinhaSVG(growthLevel.level, revenueLevel.level);

        // Level-up animation
        if ((growthLevel.level > lastGrowthLevel || revenueLevel.level > lastRevenueLevel) && lastGrowthLevel > 0) {
            avatarEl.classList.add('level-up');
            setTimeout(function() { avatarEl.classList.remove('level-up'); }, 1000);
        }
        lastGrowthLevel = growthLevel.level;
        lastRevenueLevel = revenueLevel.level;
    }

    // Stage name
    setText('provinha-stage-name', getStageName(growthLevel, revenueLevel));

    // Growth bar
    var growthPercent = getBarPercent(activeCount, growthLevel);
    var growthNext = getNextThreshold(growthLevel);
    var growthBar = document.getElementById('provinha-growth-bar');
    if (growthBar) growthBar.style.width = growthPercent + '%';
    setText('provinha-growth-text', activeCount + '/' + growthNext + ' lojistas (Nv.' + growthLevel.level + ')');

    // Revenue bar
    var revenuePercent = getBarPercent(mrr, revenueLevel);
    var revenueNext = getNextThreshold(revenueLevel);
    var revenueBar = document.getElementById('provinha-revenue-bar');
    if (revenueBar) revenueBar.style.width = revenuePercent + '%';
    var nextFormatted = revenueNext === 'MAX' ? 'MAX' : 'R$' + revenueNext.toLocaleString('pt-BR');
    setText('provinha-revenue-text', 'R$' + mrr.toLocaleString('pt-BR') + '/' + nextFormatted + ' (Nv.' + revenueLevel.level + ')');

    // Indicators
    setText('provinha-ind-stores', activeCount);
    setText('provinha-ind-mrr', 'R$ ' + mrr.toLocaleString('pt-BR'));
    setText('provinha-ind-affiliates', '-');
}

function updateStats() {
    const active = clients.filter(c => c.status === 'Ativo');
    const potential = clients.filter(c => c.status === 'Ativo' || c.status === 'Teste Gratuito');

    const mrr = active.reduce((sum, c) => sum + getClientMonthlyValue(c), 0);
    const potentialMrr = potential.reduce((sum, c) => sum + getClientMonthlyValue(c), 0);

    const growth = active.length > 0 ? '12%' : '0%';

    setText('stat-active-clients', active.length);
    setText('stat-total-mrr', `R$ ${mrr.toLocaleString('pt-BR')}`);
    setText('stat-potential-mrr', `R$ ${potentialMrr.toLocaleString('pt-BR')}`);
    setText('stat-growth', growth);

    renderLucroLiquido(mrr);
    renderProximosPagamentos();

    ['Starter', 'Inicial', 'Médio', 'Premium', 'Ultra Power'].forEach(plan => {
        const key = plan.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
        const group = clients.filter(c => c.plan === plan && c.status === 'Ativo');
        setText(`pkg-${key}-count`, group.length);
        setText(`pkg-${key}-total`, `R$ ${(group.length * (PLAN_VALUES[plan] || 0)).toLocaleString('pt-BR')}`);
    });

    updateProvinha();
}

// ─── View: Pagamentos ──────────────────────────────────────────────────────────
const PAY_PER_PAGE = 8;
const payState = { tab: 'todos', search: '', page: 1, rows: [], counts: {}, loaded: false };

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
}

function payMethodKind(forma) {
    const f = String(forma || '').toLowerCase();
    if (!f) return null;
    if (f.includes('pix')) return 'pix';
    if (f.includes('boleto')) return 'boleto';
    if (f.includes('cart') || f.includes('credito') || f.includes('crédito')) return 'cartao';
    return 'outro';
}

// SVGs fixos (sem dado do usuário) — usados como ícone da forma de pagamento
function payMethodIconSVG(kind) {
    if (kind === 'pix') {
        return '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path fill="#32BCAD" d="M9.4 3.6a3.7 3.7 0 0 1 5.2 0l2.4 2.4h-1.3c-.8 0-1.6.3-2.2.9L11 9.4a1.4 1.4 0 0 1-2 0L6.5 6.9c-.6-.6-1.4-.9-2.2-.9H3L5.4 3.6a3.7 3.7 0 0 1 4 0Z"/>' +
            '<path fill="#32BCAD" d="M3 8h1.3c.4 0 .8.2 1.1.5L8 11a3.4 3.4 0 0 0 4.8 0l2.5-2.5c.3-.3.7-.5 1.1-.5H18l2.4 2.4a3.7 3.7 0 0 1 0 5.2L18 18h-1.6c-.4 0-.8-.2-1.1-.5L12.8 15a3.4 3.4 0 0 0-4.8 0l-2.5 2.5c-.3.3-.7.5-1.1.5H3L.6 15.6a3.7 3.7 0 0 1 0-5.2L3 8Z" opacity=".35"/>' +
            '<path fill="#32BCAD" d="M9.4 20.4 7 18h1.3c.8 0 1.6-.3 2.2-.9l2.5-2.5a1.4 1.4 0 0 1 2 0l2.5 2.5c.6.6 1.4.9 2.2.9H21l-2.4 2.4a3.7 3.7 0 0 1-5.2 0l-1-1-1 1a3.7 3.7 0 0 1-2 0Z"/>' +
            '</svg>';
    }
    if (kind === 'cartao') {
        return '<svg width="20" height="14" viewBox="0 0 32 20" aria-hidden="true">' +
            '<circle cx="12" cy="10" r="9" fill="#EB001B"/>' +
            '<circle cx="20" cy="10" r="9" fill="#F79E1B" opacity=".85"/>' +
            '</svg>';
    }
    if (kind === 'boleto') {
        return '<svg width="18" height="14" viewBox="0 0 24 18" aria-hidden="true">' +
            '<g fill="#0a0a0a">' +
            '<rect x="2" y="2" width="2" height="14"/><rect x="6" y="2" width="1" height="14"/>' +
            '<rect x="9" y="2" width="2" height="14"/><rect x="13" y="2" width="1" height="14"/>' +
            '<rect x="16" y="2" width="3" height="14"/><rect x="21" y="2" width="1" height="14"/>' +
            '</g></svg>';
    }
    return '<svg width="18" height="14" viewBox="0 0 24 18" aria-hidden="true">' +
        '<rect x="1" y="2" width="22" height="14" rx="3" fill="none" stroke="#888" stroke-width="1.6"/>' +
        '<rect x="1" y="6" width="22" height="3" fill="#888"/></svg>';
}

function payMethodHTML(forma) {
    const kind = payMethodKind(forma);
    if (!kind) {
        return '<div class="pay-method is-empty"><span class="pay-method-icon">' +
            payMethodIconSVG('outro') + '</span><span>Não informado</span></div>';
    }
    const labels = { pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto' };
    const label = labels[kind] || forma;
    return '<div class="pay-method"><span class="pay-method-icon">' +
        payMethodIconSVG(kind) + '</span><span>' + esc(label) + '</span></div>';
}

function addMonths(dateStr, months) {
    const [y, m, d] = String(dateStr).split('T')[0].split('-').map(Number);
    const dt = new Date(y, m - 1 + months, d);
    return dt;
}

function addDays(dateStr, days) {
    const [y, m, d] = String(dateStr).split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, d + days);
}

function daysBetween(a, b) {
    return Math.round((a - b) / 86400000);
}

function payStartDate(c) {
    if (c.lastPayment && c.lastPayment !== '-') return c.lastPayment;
    if (c.status === 'Teste Gratuito' && c.implementationDate) return c.implementationDate;
    return null;
}

function payPlanLimit(c) {
    let base;
    if (c.plan === 'Personalizado') {
        base = (c.limitePersonalizado != null && c.limitePersonalizado > 0) ? c.limitePersonalizado : null;
    } else {
        base = PLAN_LIMITS[c.plan];
    }
    if (base == null) return null;
    return base + (c.fotosExtras || 0);
}

function buildPagamentosRows() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return clients.map(c => {
        const dom = normalizeDomain(c.website);
        const limite = payPlanLimit(c);
        const usadas = payState.counts[dom];
        const pct = (limite && usadas != null) ? (usadas / limite) * 100 : null;
        const valor = getClientMonthlyValue(c);

        let next = null, nextLabel = '—', nextSub = '', atrasado = false;
        if (c.status === 'Teste Gratuito' && c.implementationDate) {
            next = addDays(c.implementationDate, 7);
            nextSub = 'fim do teste';
        } else if (c.lastPayment && c.lastPayment !== '-') {
            next = addMonths(c.lastPayment, 1);
        }
        if (next) {
            nextLabel = next.toLocaleDateString('pt-BR');
            const dif = daysBetween(next, hoje);
            atrasado = dif < 0;
            if (!nextSub) {
                if (dif < 0) nextSub = Math.abs(dif) + ' dia(s) em atraso';
                else if (dif === 0) nextSub = 'vence hoje';
                else if (dif <= 7) nextSub = 'em ' + dif + ' dia(s)';
            }
        }

        let tab, statusLabel, statusCls;
        if (c.status === 'Inativo') {
            tab = 'cancelados'; statusLabel = 'Cancelado'; statusCls = 'status-inactive';
        } else if (c.status === 'Teste Gratuito') {
            tab = 'testes'; statusCls = 'status-pending';
            const inicio = c.implementationDate || c.date;
            const dias = Math.max(0, daysBetween(hoje, new Date(inicio.split('T')[0].replace(/-/g, '/'))));
            statusLabel = dias > 7 ? 'Teste expirado' : `Teste ${dias}/7`;
            if (dias > 7) statusCls = 'status-inactive';
        } else if (c.status === 'Permuta') {
            tab = 'ativos'; statusLabel = 'Permuta'; statusCls = 'status-permuta';
        } else if (atrasado) {
            tab = 'inadimplentes'; statusLabel = 'Inadimplente'; statusCls = 'status-inactive';
        } else if (!next) {
            tab = 'ativos'; statusLabel = 'Sem 1º pgto'; statusCls = 'status-pending';
        } else {
            tab = 'ativos'; statusLabel = 'Ativo'; statusCls = 'status-active';
        }

        const prev = valorPrevisto(c);
        const naReguaDeCobranca = tab === 'ativos' || tab === 'inadimplentes';

        return {
            c, limite, usadas, pct, valor, next, nextLabel, nextSub, atrasado, tab, statusLabel, statusCls,
            previsto: prev.valor, excedente: prev.excedente, provasExtras: prev.provasExtras,
            diasParaVencer: next ? daysBetween(next, hoje) : null,
            aReceber: naReguaDeCobranca && next != null
        };
    });
}

function payFilteredRows() {
    const q = payState.search.trim().toLowerCase();
    const filtradas = payState.rows.filter(r => {
        if (payState.tab === 'areceber') {
            if (!r.aReceber || r.diasParaVencer > 30) return false;
        } else if (payState.tab !== 'todos' && r.tab !== payState.tab) {
            return false;
        }
        if (!q) return true;
        return [r.c.name, r.c.company, r.c.email, r.c.website, r.c.plan]
            .some(v => String(v || '').toLowerCase().includes(q));
    });

    // Na régua de cobrança a ordem é por vencimento; nas outras, por quem está
    // mais perto de estourar o limite
    if (payState.tab === 'areceber') {
        return filtradas.sort((a, b) => a.diasParaVencer - b.diasParaVencer);
    }
    return filtradas.sort((a, b) => {
        const pa = a.pct == null ? -1 : a.pct;
        const pb = b.pct == null ? -1 : b.pct;
        if (pb !== pa) return pb - pa;
        return (b.usadas || 0) - (a.usadas || 0);
    });
}

const PAY_AVATAR_COLORS = [
    ['rgba(124,58,237,0.12)', '#7c3aed'],
    ['rgba(16,185,129,0.12)', '#059669'],
    ['rgba(59,130,246,0.12)', '#2563eb'],
    ['rgba(245,158,11,0.14)', '#b45309'],
    ['rgba(236,72,153,0.12)', '#db2777']
];

function payAvatar(nome) {
    const txt = String(nome || '?').trim();
    const parts = txt.split(/\s+/).filter(Boolean);
    const initials = ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    let h = 0;
    for (let i = 0; i < txt.length; i++) h = (h * 31 + txt.charCodeAt(i)) % 997;
    const [bg, fg] = PAY_AVATAR_COLORS[h % PAY_AVATAR_COLORS.length];
    return `<span class="pay-avatar" style="background:${bg};color:${fg}">${esc(initials)}</span>`;
}

function renderPagamentos() {
    const list = document.getElementById('pay-list');
    if (!list) return;

    // Contadores das abas
    const byTab = { todos: payState.rows.length, ativos: 0, inadimplentes: 0, testes: 0, cancelados: 0, areceber: 0 };
    payState.rows.forEach(r => {
        byTab[r.tab] = (byTab[r.tab] || 0) + 1;
        if (r.aReceber && r.diasParaVencer <= 30) byTab.areceber++;
    });
    Object.keys(byTab).forEach(k => setText('pay-count-' + k, `(${byTab[k]})`));

    // Resumo do a receber aparece só quando a aba está aberta
    const resumo = document.getElementById('rec-resumo');
    if (resumo) {
        const naRegua = payState.rows.filter(r => r.aReceber && r.diasParaVencer <= 30);
        resumo.style.display = payState.tab === 'areceber' ? '' : 'none';
        if (payState.tab === 'areceber') {
            const soma = arr => arr.reduce((s, r) => s + r.previsto, 0);
            const vencidos = naRegua.filter(r => r.diasParaVencer < 0);
            const semana = naRegua.filter(r => r.diasParaVencer >= 0 && r.diasParaVencer <= 7);
            const comExc = naRegua.filter(r => r.excedente > 0);
            setText('rec-kpi-vencido', `${formatBRL(soma(vencidos))} · ${vencidos.length}`);
            setText('rec-kpi-semana', `${formatBRL(soma(semana))} · ${semana.length}`);
            setText('rec-kpi-excedente', `${formatBRL(comExc.reduce((s, r) => s + r.excedente, 0))} · ${comExc.length}`);
            setText('rec-kpi-total', formatBRL(soma(naRegua)));
        }
    }

    // KPIs
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let mrr = 0, pagantes = 0, aReceber = 0, aReceberN = 0, atraso = 0, atrasoN = 0, testes = 0, testesFim = 0;
    payState.rows.forEach(r => {
        if (r.tab === 'ativos' || r.tab === 'inadimplentes') { mrr += r.valor; pagantes++; }
        if (r.tab === 'inadimplentes') { atraso += r.valor; atrasoN++; }
        if (r.tab === 'ativos' && r.next) {
            const dif = daysBetween(r.next, hoje);
            if (dif >= 0 && dif <= 7) { aReceber += r.valor; aReceberN++; }
        }
        if (r.tab === 'testes') {
            testes++;
            if (r.next && daysBetween(r.next, hoje) <= 2) testesFim++;
        }
    });
    setText('pay-kpi-mrr', 'R$ ' + mrr.toLocaleString('pt-BR'));
    setText('pay-kpi-mrr-sub', `${pagantes} cliente(s) na régua de cobrança`);

    // Paginação
    const filtered = payFilteredRows();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAY_PER_PAGE));
    if (payState.page > totalPages) payState.page = totalPages;
    const start = (payState.page - 1) * PAY_PER_PAGE;
    const pageRows = filtered.slice(start, start + PAY_PER_PAGE);

    if (!filtered.length) {
        list.innerHTML = '<div class="pay-empty">Nenhum cliente encontrado com esse filtro.</div>';
    } else {
        list.innerHTML = pageRows.map(r => {
            const c = r.c;
            const planLabel = getClientPlanLabel(c);
            const limTxt = r.limite != null ? r.limite.toLocaleString('pt-BR') : '∞';
            const usoTxt = r.usadas != null ? r.usadas.toLocaleString('pt-BR') : '—';
            let barra = '<div class="pay-usage-bottom"><span class="pay-usage-pct" style="color:var(--text-muted)">—</span></div>';
            if (r.pct != null) {
                const cor = r.pct >= 100 ? 'var(--red)' : r.pct >= 80 ? 'var(--yellow)' : 'var(--purple)';
                barra = `<div class="pay-usage-bottom">
                        <div class="pay-usage-track"><div class="pay-usage-fill" style="width:${Math.min(100, r.pct)}%;background:${cor}"></div></div>
                        <span class="pay-usage-pct" style="color:${cor}">${r.pct.toFixed(0)}%</span>
                    </div>`;
            }
            return `
            <div class="pay-row" data-id="${esc(c.id)}">
                <div class="pay-client">
                    ${payAvatar(c.company || c.name)}
                    <div style="min-width:0">
                        <div class="pay-client-name">${esc(c.company || c.name)}</div>
                        <div class="pay-client-email">${esc(c.email || c.website || '')}</div>
                    </div>
                </div>
                <div>
                    <div class="pay-plan-name">${esc(planLabel)}</div>
                    <div class="pay-plan-price">R$ ${r.valor.toLocaleString('pt-BR')}/mês</div>
                </div>
                <div>
                    <div class="pay-usage-nums">${usoTxt} / ${limTxt}</div>
                    ${barra}
                </div>
                <div>${payMethodHTML(c.formaPagamento)}</div>
                <div>
                    <div class="pay-next ${r.atrasado ? 'is-late' : ''}">${esc(r.nextLabel)}</div>
                    ${r.nextSub ? `<div class="pay-next-sub">${esc(r.nextSub)}</div>` : ''}
                </div>
                <div class="pay-previsto">
                    ${r.aReceber ? `<div class="pay-previsto-valor ${r.atrasado ? 'is-late' : ''}">${formatBRL(r.previsto)}</div>
                    ${r.excedente > 0
                        ? `<div class="pay-previsto-sub is-extra">+${formatBRL(r.excedente)} de ${r.provasExtras.toLocaleString('pt-BR')} extras</div>`
                        : '<div class="pay-previsto-sub">mensalidade</div>'}` : '<span style="color:var(--text-muted)">—</span>'}
                </div>
                <div><span class="status-badge ${r.statusCls}">${esc(r.statusLabel)}</span></div>
                <div class="pay-actions">
                    <button class="pay-kebab" data-kebab="${esc(c.id)}" title="Ações"><i class="fas fa-ellipsis-vertical"></i></button>
                </div>
            </div>`;
        }).join('');
    }

    setText('pay-range', filtered.length
        ? `Mostrando ${start + 1} a ${start + pageRows.length} de ${filtered.length} clientes`
        : 'Nenhum cliente');

    // Pager
    const pager = document.getElementById('pay-pager');
    if (pager) {
        let html = `<button data-page="${payState.page - 1}" ${payState.page === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
        for (let p = 1; p <= totalPages; p++) {
            if (totalPages > 7 && p > 2 && p < totalPages - 1 && Math.abs(p - payState.page) > 1) {
                if (p === 3) html += '<span>…</span>';
                continue;
            }
            html += `<button data-page="${p}" class="${p === payState.page ? 'active' : ''}">${p}</button>`;
        }
        html += `<button data-page="${payState.page + 1}" ${payState.page === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        pager.innerHTML = html;
    }
}

// ─── Gráficos: evolução do MRR e composição por plano ──────────────────────────
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Reconstrói o MRR de cada mês: cliente entra no MRR a partir do created_at e sai
// um mês depois do último pagamento quando está Inativo. Testes e permutas não contam.
function buildMrrSeries(meses) {
    const hoje = new Date();
    const pts = [];
    for (let i = meses - 1; i >= 0; i--) {
        const ini = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const fim = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 0);
        let mrr = 0, ativos = 0;
        clients.forEach(c => {
            if (c.status === 'Teste Gratuito' || c.status === 'Permuta') return;
            const criado = new Date(String(c.date).split('T')[0].replace(/-/g, '/'));
            if (criado > fim) return;
            if (c.status === 'Inativo') {
                if (!c.lastPayment || c.lastPayment === '-') return;
                if (addMonths(c.lastPayment, 1) < ini) return;
            }
            const v = getClientMonthlyValue(c);
            if (v <= 0) return;
            mrr += v;
            ativos++;
        });
        pts.push({ label: MES_CURTO[ini.getMonth()] + '/' + String(ini.getFullYear()).slice(2), mrr, ativos });
    }
    // Corta os meses vazios do começo (antes do 1º cliente pagante)
    while (pts.length > 1 && pts[0].mrr === 0) pts.shift();
    return pts;
}

function renderMrrChart(meses) {
    const box = document.getElementById('mrr-chart');
    const badge = document.getElementById('mrr-delta-badge');
    if (!box) return;

    const pts = buildMrrSeries(meses);
    if (!pts.length || pts.every(p => p.mrr === 0)) {
        box.innerHTML = '<div class="chart-empty">Sem dados de MRR ainda.</div>';
        return;
    }

    const W = 760, H = 260, padL = 8, padR = 8, padT = 34, padB = 40;
    const max = Math.max(...pts.map(p => p.mrr)) * 1.18 || 1;
    const faixa = (W - padL - padR) / pts.length;
    const larg = Math.min(46, faixa * 0.56);

    let barras = '';
    pts.forEach((p, i) => {
        const alt = (p.mrr / max) * (H - padT - padB);
        const x = padL + faixa * i + (faixa - larg) / 2;
        const y = H - padB - alt;
        const antes = i > 0 ? pts[i - 1].mrr : null;
        const dif = antes != null ? p.mrr - antes : null;
        const cor = i === pts.length - 1 ? 'var(--purple)' : 'rgba(124,58,237,0.45)';
        barras += `<g class="chart-bar">
            <title>${esc(p.label)}: R$ ${p.mrr.toLocaleString('pt-BR')} · ${p.ativos} cliente(s)${dif != null ? ' · ' + (dif >= 0 ? '+' : '') + 'R$ ' + dif.toLocaleString('pt-BR') + ' vs mês anterior' : ''}</title>
            <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${larg.toFixed(1)}" height="${Math.max(2, alt).toFixed(1)}" rx="6" fill="${cor}"></rect>
            <text x="${(x + larg / 2).toFixed(1)}" y="${(y - 18).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--text)">${p.mrr >= 1000 ? (p.mrr / 1000).toFixed(1).replace('.', ',') + 'k' : p.mrr}</text>
            ${dif != null && dif !== 0 ? `<text x="${(x + larg / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="${dif > 0 ? 'var(--green)' : 'var(--red)'}">${dif > 0 ? '▲' : '▼'} ${Math.abs(dif) >= 1000 ? (Math.abs(dif) / 1000).toFixed(1).replace('.', ',') + 'k' : Math.abs(dif)}</text>` : ''}
            <text x="${(x + larg / 2).toFixed(1)}" y="${H - padB + 18}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${esc(p.label)}</text>
        </g>`;
    });

    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução do MRR mês a mês">
        <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="var(--border)" stroke-width="1"></line>
        ${barras}
    </svg>`;

    if (badge) {
        const ult = pts[pts.length - 1].mrr;
        const pen = pts.length > 1 ? pts[pts.length - 2].mrr : 0;
        const dif = ult - pen;
        const pctTxt = pen > 0 ? ` (${dif >= 0 ? '+' : ''}${((dif / pen) * 100).toFixed(1).replace('.', ',')}%)` : '';
        badge.className = 'chart-badge ' + (dif > 0 ? 'is-up' : dif < 0 ? 'is-down' : '');
        badge.textContent = `${dif >= 0 ? '▲' : '▼'} R$ ${Math.abs(dif).toLocaleString('pt-BR')}${pctTxt} no mês`;
    }
}

function renderMrrPorPlano() {
    const box = document.getElementById('mrr-plan-chart');
    if (!box) return;

    const porPlano = {};
    clients.forEach(c => {
        if (c.status !== 'Ativo') return;
        const v = getClientMonthlyValue(c);
        if (v <= 0) return;
        const nome = c.valorPersonalizado ? 'Personalizado' : (c.plan || '—');
        if (!porPlano[nome]) porPlano[nome] = { total: 0, n: 0 };
        porPlano[nome].total += v;
        porPlano[nome].n++;
    });

    const linhas = Object.entries(porPlano).sort((a, b) => b[1].total - a[1].total);
    if (!linhas.length) {
        box.innerHTML = '<div class="chart-empty">Nenhum cliente ativo pagante.</div>';
        return;
    }

    const max = linhas[0][1].total;
    const totalGeral = linhas.reduce((s, l) => s + l[1].total, 0);
    box.innerHTML = linhas.map(([nome, d]) => {
        const pct = (d.total / totalGeral) * 100;
        return `<div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;margin-bottom:5px">
                <span style="font-weight:600">${esc(nome)} <span style="color:var(--text-muted);font-weight:400">· ${d.n}</span></span>
                <span style="font-variant-numeric:tabular-nums;color:var(--text-sub)">R$ ${d.total.toLocaleString('pt-BR')} <span style="color:var(--text-muted);font-size:11px">${pct.toFixed(0)}%</span></span>
            </div>
            <div class="pay-usage-track" style="width:100%;max-width:none;height:8px">
                <div class="pay-usage-fill" style="width:${(d.total / max) * 100}%;background:linear-gradient(90deg,var(--purple),var(--purple-light))"></div>
            </div>
        </div>`;
    }).join('');
}

function renderPayCharts() {
    const sel = document.getElementById('mrr-range');
    renderMrrChart(parseInt(sel && sel.value, 10) || 12);
    renderMrrPorPlano();
}

// ─── Ícones de traço ───────────────────────────────────────────────────────────
// Desenho próprio, grade de 24, traço 1.75. Ícone cheio em 10px fica borrado;
// traço uniforme mantém a forma legível em qualquer tamanho.
const ICONES = {
    entrada: '<path d="M3 16.5 9 10.5l4 4 7-7"/><path d="M20 11.5v-4h-4"/>',
    provas: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m3 14 4-4 3 3 4-4 7 6"/><circle cx="8.5" cy="8.5" r="1.2"/>',
    lucro: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5z"/><path d="M3 8.5V7a2 2 0 0 1 2-2h11"/><path d="M16.5 12.5h.01"/>',
    margem: '<path d="m19 5-14 14"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    recorrencia: '<path d="M20.5 9a8 8 0 0 0-14.2-2.3L4 9"/><path d="M4 4.5V9h4.5"/><path d="M3.5 15a8 8 0 0 0 14.2 2.3L20 15"/><path d="M20 19.5V15h-4.5"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>',
    barras: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    recibo: '<path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.4L10 21l-2.5-1.6L5 21z"/><path d="M9 8h6M9 12h6"/>',
    balanca: '<path d="M12 4v16M7 20h10M4 8h16"/><path d="m4 8-2.5 5.5a3 3 0 0 0 5 0z"/><path d="m20 8-2.5 5.5a3 3 0 0 0 5 0z"/>',
    transferencia: '<path d="M4 8h15"/><path d="m16 5 3 3-3 3"/><path d="M20 16H5"/><path d="m8 13-3 3 3 3"/>',
    pulso: '<path d="M3 12h3.5l2.5 7 4-15 2.5 8H21"/>',
    camadas: '<path d="m12 3 8.5 4.5L12 12 3.5 7.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/>',
    lista: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.2h.01"/>',
    teste: '<path d="M9 3h6"/><path d="M10 3v6.5L4.7 18a2 2 0 0 0 1.7 3h11.2a2 2 0 0 0 1.7-3L14 9.5V3"/><path d="M7 15h10"/>',
    cancelado: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
    moedas: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4"/><ellipse cx="15" cy="13" rx="6" ry="3"/>',
    check: '<path d="m4 12.5 5 5L20 6.5"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/>',
    alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    chama: '<path d="M12 3c3.5 4 5.5 6.5 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 10.7 7.5 9 9 7.5c0 2 1 3 2 3.5.5-3 1-5.5 1-8z"/>'
};

function svgIcone(nome) {
    const corpo = ICONES[nome];
    if (!corpo) return '';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
}

// Troca todo [data-ic] pelo desenho correspondente
function aplicarIcones(raiz) {
    (raiz || document).querySelectorAll('[data-ic]').forEach(el => {
        if (el.firstElementChild) return;
        el.innerHTML = svgIcone(el.dataset.ic);
    });
}

// ─── Saúde do Negócio ──────────────────────────────────────────────────────────
const saudeState = { pagamentos: [], custos: {}, provas: {}, categorias: {}, carregado: false, carregando: false };

// Custo médio de geração por prova. Óculos domina o volume, então é a base da
// estimativa; meses com custo real lançado em fluxo_caixa_mensal usam o valor real.
const CUSTO_MEDIO_PROVA = 0.28;

function mesLabel(mes) {
    const [y, m] = mes.split('-');
    return MES_CURTO[parseInt(m, 10) - 1] + '/' + y.slice(2);
}

function mesesEntre(inicio, fim) {
    const out = [];
    let [y, m] = inicio.split('-').map(Number);
    const [fy, fm] = fim.split('-').map(Number);
    while (y < fy || (y === fy && m <= fm)) {
        out.push(`${y}-${String(m).padStart(2, '0')}`);
        m++; if (m > 12) { m = 1; y++; }
    }
    return out;
}

async function carregarPagamentosSaude(forcar) {
    if (!db) return [];
    if (saudeState.carregado && !forcar) return saudeState.pagamentos;
    const { data, error } = await db
        .from('pagamentos_clientes')
        .select('store_id, tipo, valor, data_pagamento, descricao')
        .order('data_pagamento', { ascending: true });
    if (error) throw error;
    saudeState.pagamentos = (data || []).map(p => ({
        store: p.store_id,
        tipo: p.tipo,
        valor: parseFloat(p.valor) || 0,
        data: String(p.data_pagamento).slice(0, 10),
        mes: String(p.data_pagamento).slice(0, 7),
        descricao: p.descricao || ''
    }));
    saudeState.carregado = true;
    return saudeState.pagamentos;
}

// Custo por mês: usa o valor real lançado no fluxo de caixa quando existe;
// senão estima contando as provas do mês (count server-side, não baixa linhas).
async function carregarCustos(meses) {
    if (!db) return;
    try {
        const { data } = await db.from('fluxo_caixa_mensal').select('mes, custo_provas, custo_ferramentas, tarifas, receita_liquida, categorias, fechado');
        (data || []).forEach(r => {
            saudeState.custos[r.mes] = {
                provas: parseFloat(r.custo_provas) || 0,
                ferramentas: (parseFloat(r.custo_ferramentas) || 0) + (parseFloat(r.tarifas) || 0),
                real: true
            };
            if (r.categorias && r.categorias.categorias) saudeState.categorias[r.mes] = r.categorias;
        });
    } catch (e) { console.warn('fluxo_caixa_mensal indisponível:', e); }

    const faltando = meses.filter(m => !saudeState.custos[m] || !saudeState.custos[m].provas);
    for (const mes of faltando) {
        try {
            const [y, m] = mes.split('-').map(Number);
            const ini = `${mes}-01T00:00:00-03:00`;
            const prox = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
            const fim = `${prox}-01T00:00:00-03:00`;
            const { count, error } = await db
                .from('geracoes_provou_levou')
                .select('id', { count: 'exact', head: true })
                .gte('created_at', ini)
                .lt('created_at', fim);
            if (error) throw error;
            saudeState.provas[mes] = count || 0;
            saudeState.custos[mes] = {
                provas: (count || 0) * CUSTO_MEDIO_PROVA,
                ferramentas: (saudeState.custos[mes] || {}).ferramentas || 0,
                real: false
            };
        } catch (e) {
            console.warn('contagem de provas falhou em', mes, e);
        }
    }
}

function custoDoMes(mes) {
    const c = saudeState.custos[mes];
    if (!c) return { total: 0, real: false, provas: 0 };
    return { total: c.provas + (c.ferramentas || 0), real: c.real, provas: c.provas };
}

const CORES_CATEGORIA = {
    'Geração de provas (Google)': '#7c3aed',
    'Ferramentas e software': '#a78bfa',
    'Anúncios e marketing': '#3b82f6',
    'Estornos e cancelamentos': '#f59e0b',
    'Retiradas do sócio': '#ef4444',
    'PIX a pessoas': '#fb7185',
    'Alimentação': '#fbbf24',
    'Moradia e contas': '#34d399',
    'Transporte': '#60a5fa',
    'Saúde e pets': '#c084fc',
    'Compras diversas': '#94a3b8'
};

// Saídas do mês separadas em operação x pessoal, lidas do extrato do Mercado Pago
function renderCustosCategoria(mes) {
    const box = document.getElementById('sa-custos-cat');
    const badge = document.getElementById('sa-custos-total');
    const sub = document.getElementById('sa-custos-sub');
    if (!box) return;

    const cat = saudeState.categorias[mes];
    if (!cat || !cat.categorias) {
        box.innerHTML = `<div class="chart-empty">Sem extrato de ${esc(mesLabel(mes))} ainda.<br>
            <span style="font-size:12px">Baixe o extrato do Mercado Pago do mês fechado para ver as saídas por categoria.</span></div>`;
        if (badge) badge.textContent = '—';
        return;
    }

    const linhas = Object.entries(cat.categorias)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);
    const totalNegocio = linhas.filter(([k]) => cat.negocio[k]).reduce((s, l) => s + l[1], 0);
    const totalPessoal = linhas.filter(([k]) => !cat.negocio[k]).reduce((s, l) => s + l[1], 0);
    const max = linhas[0] ? linhas[0][1] : 1;

    const bloco = (titulo, itens, total, cor) => {
        if (!itens.length) return '';
        return `<div style="margin-bottom:18px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
                <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${cor}">${titulo}</span>
                <span style="font-size:14px;font-weight:600;font-variant-numeric:tabular-nums">${formatBRL(total)}</span>
            </div>
            ${itens.map(([nome, val]) => `
                <div style="margin-bottom:9px">
                    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                        <span>${esc(nome)}</span>
                        <span style="font-variant-numeric:tabular-nums;color:var(--text-sub)">${formatBRL(val)}</span>
                    </div>
                    <div class="pay-usage-track" style="width:100%;max-width:none;height:7px">
                        <div class="pay-usage-fill" style="width:${(val / max) * 100}%;background:${CORES_CATEGORIA[nome] || 'var(--text-muted)'}"></div>
                    </div>
                </div>`).join('')}
        </div>`;
    };

    box.innerHTML =
        bloco('Custo da operação', linhas.filter(([k]) => cat.negocio[k]), totalNegocio, 'var(--purple)') +
        bloco('Gasto pessoal', linhas.filter(([k]) => !cat.negocio[k]), totalPessoal, 'var(--red)');

    if (badge) badge.textContent = formatBRL(totalNegocio + totalPessoal);
    if (sub) sub.textContent = `Saídas de ${mesLabel(mes)}, do extrato do Mercado Pago`;
}

// ─── A receber: agenda das próximas cobranças ──────────────────────────────────

// O previsto é a mensalidade do plano mais as provas que passaram da franquia
// desde o último pagamento. O preço da prova excedente é o próprio plano dividido
// pela franquia — quem contratou 3.000 fotos por R$ 2.200 paga R$ 0,73 por prova a mais.
function valorPrevisto(c) {
    const plano = getClientMonthlyValue(c);
    const limite = payPlanLimit(c);
    const usadas = payState.counts[normalizeDomain(c.website)];

    if (!limite || limite === Infinity || usadas == null) {
        return { valor: plano, plano, excedente: 0, provasExtras: 0, usadas, limite };
    }
    const provasExtras = Math.max(0, usadas - limite);
    const precoProva = plano / limite;
    const excedente = provasExtras * precoProva;
    return {
        valor: plano + excedente,
        plano, excedente, provasExtras, usadas, limite, precoProva
    };
}

function agendaRecebimentos() {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const itens = [];
    clients.forEach(c => {
        if (c.status === 'Inativo' || c.status === 'Teste Gratuito' || c.status === 'Permuta') return;
        if (!c.lastPayment || c.lastPayment === '-') return;
        const venc = addMonths(c.lastPayment, 1);
        const dias = daysBetween(venc, hoje);
        const p = valorPrevisto(c);
        if (p.valor <= 0) return;
        itens.push({ c, venc, dias, ...p });
    });
    return itens.sort((a, b) => a.venc - b.venc);
}

// Quanto cada cliente pagou no período, do maior para o menor
function renderFaturamentoDetalhado(meses) {
    const box = document.getElementById('sa-detalhado');
    if (!box) return;
    const dentro = new Set(meses);

    const porStore = {};
    saudeState.pagamentos.forEach(p => {
        if (!dentro.has(p.mes)) return;
        if (!porStore[p.store]) porStore[p.store] = { total: 0, mens: 0, extra: 0 };
        porStore[p.store].total += p.valor;
        if (p.tipo === 'mensalidade') porStore[p.store].mens += p.valor;
        else porStore[p.store].extra += p.valor;
    });

    const linhas = Object.entries(porStore).sort((a, b) => b[1].total - a[1].total);
    const total = linhas.reduce((s, l) => s + l[1].total, 0);
    const rotulo = meses.length === 1 ? mesLabel(meses[0]) : `${mesLabel(meses[0])} a ${mesLabel(meses[meses.length - 1])}`;

    setText('det-sub', `${linhas.length} cliente(s) pagaram em ${rotulo}`);
    setText('det-total', formatBRL(total));

    if (!linhas.length) {
        box.innerHTML = '<div class="chart-empty">Nenhum pagamento no período.</div>';
        return;
    }

    const max = linhas[0][1].total;
    box.innerHTML = linhas.map(([store, d]) => {
        const c = clients.find(x => String(x.id) === String(store));
        const nome = c ? (c.company || c.name) : 'Cliente removido';
        const fatia = (d.total / total) * 100;
        return `<div class="det-row" title="${esc(nome)}: ${formatBRL(d.total)} (${fatia.toFixed(1)}% do total)">
            <div class="det-nome">${esc(nome)}</div>
            <div class="det-barra">
                <div class="det-fill" style="width:${(d.total / max) * 100}%"></div>
                ${d.extra > 0 ? `<div class="det-fill-extra" style="width:${(d.extra / max) * 100}%"></div>` : ''}
            </div>
            <div class="det-valor">${formatBRL(d.total)}<span class="det-pct">${fatia.toFixed(0)}%</span></div>
        </div>`;
    }).join('');
}

// Quanto cada cliente custa no ciclo atual (provas desde o último pagamento)
function renderCustoPorCliente() {
    const tbody = document.getElementById('cli-custo-body');
    if (!tbody) return;

    const linhas = [];
    clients.forEach(c => {
        if (c.status === 'Inativo') return;
        const usadas = payState.counts[normalizeDomain(c.website)];
        if (usadas == null) return;
        const custoUnit = getCategoryCost(c.categoria) != null
            ? (c.categoria === 'roupa' ? 0.37 : 0.28)
            : 0.28;
        const custo = usadas * custoUnit;
        const prev = valorPrevisto(c);
        const receita = c.status === 'Teste Gratuito' ? 0 : prev.valor;
        const sobra = receita - custo;
        const margem = receita > 0 ? (sobra / receita) * 100 : null;
        linhas.push({ c, usadas, custo, receita, sobra, margem, custoUnit });
    });

    linhas.sort((a, b) => b.custo - a.custo);
    const totalCusto = linhas.reduce((s, l) => s + l.custo, 0);
    const totalSobra = linhas.reduce((s, l) => s + l.sobra, 0);
    setText('cli-total', `${formatBRL(totalCusto)} de custo`);
    setText('cli-sub', `${linhas.length} loja(s) com provas medidas · sobra ${formatBRL(totalSobra)} no total`);

    if (!linhas.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px 0;">Sem contagem de provas ainda.</td></tr>';
        return;
    }

    tbody.innerHTML = linhas.map(l => {
        const corMargem = l.margem == null ? 'var(--text-muted)'
            : l.margem >= 60 ? 'var(--green)' : l.margem >= 30 ? 'var(--yellow)' : 'var(--red)';
        const teste = l.c.status === 'Teste Gratuito';
        return `<tr>
            <td style="font-weight:600">${esc(l.c.company || l.c.name)}${teste ? ' <span class="status-badge status-pending" style="margin-left:6px">teste</span>' : ''}</td>
            <td style="color:var(--text-muted)">${l.c.categoria === 'roupa' ? 'Roupa' : 'Óculos'} · R$ ${l.custoUnit.toFixed(2).replace('.', ',')}/prova</td>
            <td style="font-variant-numeric:tabular-nums">${l.usadas.toLocaleString('pt-BR')}</td>
            <td style="color:var(--red);font-weight:600;font-variant-numeric:tabular-nums">${formatBRL(l.custo)}</td>
            <td style="font-variant-numeric:tabular-nums">${teste ? '—' : formatBRL(l.receita)}</td>
            <td style="font-weight:600;font-variant-numeric:tabular-nums;color:${l.sobra >= 0 ? 'var(--green)' : 'var(--red)'}">${formatBRL(l.sobra)}</td>
            <td style="font-weight:600;color:${corMargem}">${l.margem == null ? '—' : l.margem.toFixed(0) + '%'}</td>
        </tr>`;
    }).join('');
}

// ─── Previsão de fechamento do mês ─────────────────────────────────────────────

// Custo fixo da operação fora as provas (ferramentas, anúncios). Usa a média dos
// meses com extrato, ignorando estorno, que é evento pontual.
function custoFixoMedio() {
    const meses = Object.keys(saudeState.categorias);
    if (!meses.length) return 0;
    const valores = meses.map(m => {
        const cat = saudeState.categorias[m];
        return Object.entries(cat.categorias)
            .filter(([k]) => cat.negocio[k] && !/provas|estorno/i.test(k))
            .reduce((s, l) => s + l[1], 0);
    });
    return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function renderPrevisao() {
    const mes = new Date().toISOString().slice(0, 7);
    const hoje = new Date();
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const diaAtual = hoje.getDate();
    const fimDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), diasNoMes);

    // receita: o que já entrou no mês + as cobranças que vencem até o fim dele
    const entrou = saudeState.pagamentos.filter(p => p.mes === mes).reduce((s, p) => s + p.valor, 0);
    const agenda = agendaRecebimentos();
    const aReceber = agenda.filter(i => i.venc <= fimDoMes);
    const somaReceber = aReceber.reduce((s, i) => s + i.valor, 0);
    const atrasados = aReceber.filter(i => i.dias < 0).length;
    const faturamento = entrou + somaReceber;

    // custo: provas do mês projetadas até o fim + fixo médio
    const provasAteAgora = saudeState.provas[mes];
    const custoReal = saudeState.custos[mes];
    let custoProvas, baseProvas;
    if (provasAteAgora != null) {
        const projetadas = Math.round(provasAteAgora / diaAtual * diasNoMes);
        custoProvas = projetadas * CUSTO_MEDIO_PROVA;
        baseProvas = `${projetadas.toLocaleString('pt-BR')} provas projetadas`;
    } else if (custoReal) {
        custoProvas = custoReal.provas;
        baseProvas = 'custo lançado do mês';
    } else {
        custoProvas = 0;
        baseProvas = 'sem medição de provas';
    }
    const fixo = custoFixoMedio();
    const custo = custoProvas + fixo;
    const lucro = faturamento - custo;
    const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0;

    setText('prev-entrou', formatBRL(entrou));
    setText('prev-entrou-sub', `até ${diaAtual}/${String(hoje.getMonth() + 1).padStart(2, '0')}`);
    setText('prev-receber', formatBRL(somaReceber));
    setText('prev-receber-sub', `(${aReceber.length} cobrança${aReceber.length === 1 ? '' : 's'}${atrasados ? `, ${atrasados} em atraso` : ''})`);
    setText('prev-faturamento', formatBRL(faturamento));
    setText('prev-custo', formatBRL(custo));
    setText('prev-custo-var', formatBRL(custoProvas));
    setText('prev-custo-fixo', formatBRL(fixo));
    setText('prev-custo-sub', `(${baseProvas})`);
    setText('prev-lucro', formatBRL(lucro));
    setText('prev-lucro-sub', `Margem prevista de ${margem.toFixed(1).replace('.', ',')}%`);

    const badge = document.getElementById('prev-margem');
    if (badge) {
        badge.className = 'chart-badge ' + (margem >= 50 ? 'is-up' : margem < 20 ? 'is-down' : '');
        badge.textContent = `margem prevista ${margem.toFixed(0)}%`;
    }
    setText('prev-sub', `Fechamento de ${mesLabel(mes)} · faltam ${diasNoMes - diaAtual} dia(s)`);
}

// Faturamento x custo x lucro, lado a lado, com a linha de lucro por cima
function renderLucroPorMes(meses) {
    const box = document.getElementById('sa-chart-lucro');
    const badge = document.getElementById('sa-delta-lucro');
    if (!box) return;

    const mesCorrente = new Date().toISOString().slice(0, 7);
    const dados = meses.map(mes => {
        const receita = saudeState.pagamentos.filter(p => p.mes === mes).reduce((s, p) => s + p.valor, 0);
        const c = custoDoMes(mes);
        return { mes, receita, custo: c.total, real: c.real, lucro: receita - c.total, parcial: mes === mesCorrente };
    });
    if (!dados.length) { box.innerHTML = '<div class="chart-empty">Sem dados no período.</div>'; return; }

    // Proporção mais alta: o gráfico divide a linha com a previsão
    const W = 520, H = 340, padL = 8, padR = 8, padT = 38, padB = 42;
    const max = Math.max(...dados.map(d => Math.max(d.receita, d.custo, d.lucro))) * 1.2 || 1;
    const faixa = (W - padL - padR) / dados.length;
    const larg = Math.min(22, faixa * 0.3);
    const alturaUtil = H - padT - padB;
    const y = v => H - padB - (Math.max(0, v) / max) * alturaUtil;
    const fmt = v => v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : v.toFixed(0);

    const barras = dados.map((d, i) => {
        const cx = padL + faixa * i + faixa / 2;
        const op = d.parcial ? 0.45 : 1;
        return `<g class="chart-bar">
            <title>${esc(mesLabel(d.mes))}
Faturamento: ${formatBRL(d.receita)}
Custo: ${formatBRL(d.custo)}${d.real ? ' (real)' : ' (estimado)'}
Lucro: ${formatBRL(d.lucro)}${d.receita > 0 ? ' · margem ' + ((d.lucro / d.receita) * 100).toFixed(0) + '%' : ''}</title>
            <rect x="${(cx - larg - 2).toFixed(1)}" y="${y(d.receita).toFixed(1)}" width="${larg}" height="${(H - padB - y(d.receita)).toFixed(1)}" rx="4" fill="var(--purple)" opacity="${op}"></rect>
            <rect x="${(cx + 2).toFixed(1)}" y="${y(d.custo).toFixed(1)}" width="${larg}" height="${(H - padB - y(d.custo)).toFixed(1)}" rx="4" fill="var(--red)" opacity="${op * 0.8}"></rect>
            <text x="${cx.toFixed(1)}" y="${(Math.min(y(d.receita), y(d.lucro)) - 20).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--text)">${fmt(d.receita)}</text>
            <text x="${cx.toFixed(1)}" y="${H - padB + 18}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${esc(mesLabel(d.mes))}</text>
            <text x="${cx.toFixed(1)}" y="${H - padB + 32}" text-anchor="middle" font-size="10" fill="${d.real ? 'var(--text-muted)' : 'var(--yellow)'}">${d.real ? 'custo real' : 'estimado'}</text>
        </g>`;
    }).join('');

    const pontos = dados.map((d, i) => `${(padL + faixa * i + faixa / 2).toFixed(1)},${y(d.lucro).toFixed(1)}`).join(' ');
    const bolinhas = dados.map((d, i) => {
        const cx = padL + faixa * i + faixa / 2;
        return `<circle cx="${cx.toFixed(1)}" cy="${y(d.lucro).toFixed(1)}" r="4" fill="var(--green)"></circle>
        <text x="${cx.toFixed(1)}" y="${(y(d.lucro) - 10).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--green)">${fmt(d.lucro)}</text>`;
    }).join('');

    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Faturamento, custo e lucro por mês">
        <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="var(--border)"></line>
        ${barras}
        <polyline points="${pontos}" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linejoin="round"></polyline>
        ${bolinhas}
    </svg>`;

    if (badge) {
        const fechados = dados.filter(d => !d.parcial);
        if (fechados.length) {
            const u = fechados[fechados.length - 1];
            const margem = u.receita > 0 ? (u.lucro / u.receita) * 100 : 0;
            badge.className = 'chart-badge ' + (margem >= 50 ? 'is-up' : margem < 20 ? 'is-down' : '');
            badge.textContent = `${mesLabel(u.mes)}: margem ${margem.toFixed(0)}%`;
        }
    }
}

function periodoSelecionado() {
    return (document.getElementById('saude-periodo') || {}).value || '6';
}

function mesRelativo(delta) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    return d.toISOString().slice(0, 7);
}

// Os gráficos sempre mostram contexto (6 meses no mínimo); um gráfico de uma
// barra só não diz nada sobre tendência.
function janelaSaude() {
    const pagos = saudeState.pagamentos;
    if (!pagos.length) return [];
    const todos = mesesEntre(pagos[0].mes, pagos[pagos.length - 1].mes);
    const p = periodoSelecionado();
    const n = (p === 'mes-atual' || p === 'mes-passado') ? 6 : (parseInt(p, 10) || 6);
    return todos.slice(Math.max(0, todos.length - n));
}

// Já os números do mês (KPIs, ranking, concentração) seguem o filtro escolhido.
function janelaAnalise() {
    const p = periodoSelecionado();
    if (p === 'mes-atual') return [mesRelativo(0)];
    if (p === 'mes-passado') return [mesRelativo(-1)];
    return janelaSaude();
}

function renderKPIsSaude(meses) {
    const mesAtual = meses[meses.length - 1];
    const doMes = saudeState.pagamentos.filter(p => p.mes === mesAtual);
    const recebido = doMes.reduce((s, p) => s + p.valor, 0);
    const pagantes = new Set(doMes.map(p => p.store)).size;
    // Com extrato do mês, o custo da operação vem das categorias reais; sem ele, estima
    const cat = saudeState.categorias[mesAtual];
    const c = cat && cat.categorias
        ? {
            total: Object.entries(cat.categorias).filter(([k]) => cat.negocio[k]).reduce((s, l) => s + l[1], 0),
            real: true
        }
        : custoDoMes(mesAtual);
    const lucro = recebido - c.total;
    const margem = recebido > 0 ? (lucro / recebido) * 100 : 0;
    const provas = saudeState.provas[mesAtual];

    setText('sa-recebido', formatBRL(recebido));
    setText('sa-recebido-sub', `${mesLabel(mesAtual)} · ${pagantes} cliente(s)`);
    setText('sa-custo', formatBRL(c.total));
    setText('sa-custo-sub', c.real
        ? 'custo real do mês'
        : (provas != null ? `${provas.toLocaleString('pt-BR')} provas × R$ ${CUSTO_MEDIO_PROVA.toFixed(2).replace('.', ',')}` : 'estimativa'));
    setText('sa-lucro', formatBRL(lucro));
    setText('sa-lucro-sub', 'faturamento menos custo de provas');
    setText('sa-margem', `${margem.toFixed(0)}%`);
    setText('sa-margem-sub', margem >= 50 ? 'operação saudável' : margem >= 20 ? 'margem apertada' : 'atenção: margem baixa');
    const el = document.getElementById('sa-margem');
    // tons escuros: o verde e o amarelo claros nao alcancam 4,5:1 sobre branco
    if (el) el.style.color = margem >= 50 ? '#047857' : margem >= 20 ? '#b45309' : '#b91c1c';

    // Régua: a fatia do faturamento que virou custo e a que sobrou
    const regua = document.getElementById('sa-regua');
    if (regua) {
        const pCusto = recebido > 0 ? Math.min(100, (c.total / recebido) * 100) : 0;
        regua.querySelector('.r-custo').style.width = pCusto + '%';
        regua.querySelector('.r-lucro').style.width = Math.max(0, 100 - pCusto) + '%';
        regua.title = `De cada R$ 100 que entraram, R$ ${pCusto.toFixed(0)} foram custo e R$ ${(100 - pCusto).toFixed(0)} sobraram`;
    }
}

function renderSaude() {
    const meses = janelaSaude();
    if (!meses.length) return;
    const analise = janelaAnalise();
    renderKPIsSaude(analise);
    renderFaturamentoDetalhado(analise);
    renderCustoPorCliente();
    renderCustosCategoria(analise[analise.length - 1]);
    renderPrevisao();
    renderLucroPorMes(meses);
}

async function loadSaude(forcar) {
    if (saudeState.carregando) return;
    saudeState.carregando = true;
    const btn = document.getElementById('btn-saude-refresh');
    if (btn) btn.querySelector('i').classList.add('fa-spin');
    try {
        if (!clients || clients.length === 0) await loadClients();
        await carregarPagamentosSaude(forcar);
        renderSaude();
        await carregarCustos(janelaSaude());
        renderSaude();
    } catch (err) {
        console.error('Erro ao montar Saúde do Negócio:', err);
        const box = document.getElementById('sa-chart-receita');
        if (box) box.innerHTML = `<div class="chart-empty" style="color:var(--red)">Não deu pra carregar: ${esc(err.message || err)}</div>`;
    } finally {
        saudeState.carregando = false;
        if (btn) btn.querySelector('i').classList.remove('fa-spin');
    }
}

function setupSaudeUI() {
    const sel = document.getElementById('saude-periodo');
    if (sel) sel.addEventListener('change', renderSaude);
    const btn = document.getElementById('btn-saude-refresh');
    if (btn) btn.addEventListener('click', () => loadSaude(true));
}

function closePayMenus() {
    document.querySelectorAll('.pay-menu').forEach(m => m.remove());
}

function openPayMenu(btn, id) {
    const aberto = btn.parentElement.querySelector('.pay-menu');
    closePayMenus();
    if (aberto) return;
    const menu = document.createElement('div');
    menu.className = 'pay-menu';
    menu.innerHTML = `
        <button data-act="edit"><i class="fas fa-pen"></i> Editar cliente</button>
        <button data-act="hist"><i class="fas fa-receipt"></i> Histórico de pagamentos</button>
        <button data-act="view"><i class="fas fa-eye"></i> Ver detalhes</button>
        <button data-act="site"><i class="fas fa-arrow-up-right-from-square"></i> Abrir loja</button>
        <button data-act="del" class="is-danger"><i class="fas fa-trash"></i> Excluir</button>`;
    menu.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        e.stopPropagation();
        const act = b.dataset.act;
        closePayMenus();
        if (act === 'hist') openPagamentosModal(clients.find(c => String(c.id) === String(id)).id);
        if (act === 'edit') editClientById(id);
        if (act === 'view') showClientDetailsById(id);
        if (act === 'del') deleteClientById(id);
        if (act === 'site') {
            const c = clients.find(cl => String(cl.id) === String(id));
            const url = c && c.website ? (c.website.startsWith('http') ? c.website : 'https://' + c.website) : null;
            if (url) window.open(url, '_blank', 'noopener');
        }
    });
    btn.parentElement.appendChild(menu);
}

function exportPagamentosCSV() {
    const rows = payFilteredRows();
    const head = ['Cliente', 'Empresa', 'Email', 'Plano', 'Valor mensal', 'Provas usadas', 'Limite', 'Uso %', 'Forma de pagamento', 'Ultimo pagamento', 'Proxima cobranca', 'Status'];
    const linhas = rows.map(r => [
        r.c.name, r.c.company, r.c.email, getClientPlanLabel(r.c), r.valor,
        r.usadas != null ? r.usadas : '', r.limite != null ? r.limite : '',
        r.pct != null ? r.pct.toFixed(0) : '',
        r.c.formaPagamento || '', r.c.lastPayment && r.c.lastPayment !== '-' ? r.c.lastPayment : '',
        r.nextLabel, r.statusLabel
    ]);
    const csv = [head, ...linhas]
        .map(l => l.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(';'))
        .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pagamentos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

async function loadPagamentosView() {
    const list = document.getElementById('pay-list');
    if (!list) return;
    if (!clients || clients.length === 0) await loadClients();

    payState.rows = buildPagamentosRows();
    renderPagamentos();
    renderPayCharts();

    // Provas por loja desde o último pagamento (RPC server-side)
    if (db && !payState.loaded) {
        try {
            const lojas = [];
            for (const c of clients) {
                if (c.status === 'Inativo') continue;
                const dom = normalizeDomain(c.website);
                const sd = payStartDate(c);
                if (dom && sd) lojas.push({ dom, cutoff: String(sd).split('T')[0] + 'T00:00:00' });
            }
            payState.counts = await fetchProvasCounts(lojas);
            payState.loaded = true;
            payState.rows = buildPagamentosRows();
            renderPagamentos();
            renderCustoPorCliente();
        } catch (err) {
            console.warn('Pagamentos: contagem de provas falhou:', err);
        }
    }
}

function setupPagamentosUI() {
    const tabs = document.getElementById('pay-tabs');
    if (tabs) {
        tabs.addEventListener('click', e => {
            const b = e.target.closest('.pay-tab');
            if (!b) return;
            tabs.querySelectorAll('.pay-tab').forEach(t => t.classList.toggle('active', t === b));
            payState.tab = b.dataset.tab;
            payState.page = 1;
            renderPagamentos();
        });
    }

    const search = document.getElementById('pay-search');
    if (search) {
        search.addEventListener('input', () => {
            payState.search = search.value;
            payState.page = 1;
            renderPagamentos();
        });
    }

    const exportBtn = document.getElementById('btn-pay-export');
    if (exportBtn) exportBtn.addEventListener('click', exportPagamentosCSV);

    const mrrRange = document.getElementById('mrr-range');
    if (mrrRange) mrrRange.addEventListener('change', renderPayCharts);

    const list = document.getElementById('pay-list');
    if (list) {
        list.addEventListener('click', e => {
            const kebab = e.target.closest('[data-kebab]');
            if (kebab) {
                e.stopPropagation();
                openPayMenu(kebab, kebab.dataset.kebab);
                return;
            }
            if (e.target.closest('.pay-menu')) return;
            const row = e.target.closest('.pay-row');
            if (row) editClientById(row.dataset.id);
        });
    }

    const pager = document.getElementById('pay-pager');
    if (pager) {
        pager.addEventListener('click', e => {
            const b = e.target.closest('button[data-page]');
            if (!b || b.disabled) return;
            const p = parseInt(b.dataset.page, 10);
            if (!isNaN(p) && p >= 1) { payState.page = p; renderPagamentos(); }
        });
    }

    document.addEventListener('click', () => closePayMenus());
}

const VIEW_PADRAO = 'dashboard';
const VIEW_STORAGE_KEY = 'gestaoViewAtual';

// Guarda a aba aberta para o F5 não jogar o usuário de volta pro início
function lembrarView(viewId) {
    try { localStorage.setItem(VIEW_STORAGE_KEY, viewId); } catch (e) { /* modo privado */ }
    if (location.hash.slice(1) !== viewId) {
        history.replaceState(null, '', '#' + viewId);
    }
}

function viewInicial() {
    const daUrl = location.hash.slice(1);
    let salva = null;
    try { salva = localStorage.getItem(VIEW_STORAGE_KEY); } catch (e) { /* modo privado */ }
    const alvo = daUrl || salva || VIEW_PADRAO;
    return document.getElementById(alvo) ? alvo : VIEW_PADRAO;
}

function switchView(viewId) {
    lembrarView(viewId);
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.view === viewId);
    });
    document.querySelectorAll('.view').forEach(el => {
        el.classList.toggle('active', el.id === viewId);
    });
    if (viewId === 'dashboard') { updateStats(); renderTable(); }
    if (viewId === 'provinha') { updateProvinha(); }
    if (viewId === 'tryons') { loadTryons(); }
    if (viewId === 'limites') { loadLimites(); }
    if (viewId === 'pagamentos') { loadPagamentosView(); loadSaude(); }
    if (viewId === 'faturamento') { loadFaturamentoView(); }
    if (viewId === 'fluxo') { loadFluxoCaixa(); }
}

// ─── Fluxo de Caixa & Custos ─────────────────────────────────────────────────
const FLUXO_RATE = { oculos: 0.28, roupa: 0.37 };  // R$ por prova (real, billing Google)
let _fluxoData = [];

function fmtBRL2(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fluxoMesLabel(m) {
    const p = String(m).split('-'); const nomes = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return (nomes[parseInt(p[1], 10)] || m) + '/' + p[0];
}

async function loadFluxoCaixa() {
    if (db) {
        try {
            const { data, error } = await db.from('fluxo_caixa_mensal').select('*').order('mes', { ascending: false });
            if (error) throw error;
            _fluxoData = data || [];
        } catch (e) { console.warn('[fluxo] tabela fluxo_caixa_mensal ausente?', e); _fluxoData = []; }
    }
    const sel = document.getElementById('fluxo-mes-select');
    if (sel) {
        sel.innerHTML = '';
        if (!_fluxoData.length) {
            const o = document.createElement('option'); o.textContent = 'Rode database/fluxo_caixa.sql'; sel.appendChild(o);
        }
        _fluxoData.forEach(r => {
            const o = document.createElement('option'); o.value = r.mes;
            o.textContent = fluxoMesLabel(r.mes) + (r.fechado ? '' : ' (parcial)');
            sel.appendChild(o);
        });
    }
    renderFluxoMes();
    renderFluxoLojas();
}

function renderFluxoMes() {
    const sel = document.getElementById('fluxo-mes-select');
    const mes = sel ? sel.value : (_fluxoData[0] || {}).mes;
    const r = _fluxoData.find(x => x.mes === mes) || {};
    setText('fx-receita', fmtBRL2(r.receita_liquida));
    setText('fx-provas', fmtBRL2(r.custo_provas));
    setText('fx-lucro', fmtBRL2(r.lucro_negocio));
    setText('fx-pessoal', fmtBRL2(r.gastos_pessoais));
    setText('fx-saldo', fmtBRL2(r.saldo_final));
    setText('fluxo-mes-obs', r.obs || '');
    const cats = r.categorias || {};
    const NEG = { provas: 'Provas (Google Cloud)', ferramentas: 'Ferramentas (SaaS/APIs)', anuncios: 'Anúncios (Meta/Google)', tarifas: 'Tarifas MP / IOF' };
    const PES = { aluguel: 'Aluguel', alimentacao: 'Alimentação / delivery', compras_pessoais: 'Compras pessoais', pessoal_outros: 'Outros pessoais', retirada_lucas: 'Retiradas (pró-labore)', pix_terceiros: 'PIX a terceiros', reembolso: 'Reembolso a cliente' };
    renderFluxoCatList('fx-negocio-list', 'fx-negocio-total', cats, NEG);
    renderFluxoCatList('fx-pessoal-list', 'fx-pessoal-total', cats, PES);
}

function renderFluxoCatList(listId, totalId, cats, map) {
    const el = document.getElementById(listId); if (!el) return;
    el.innerHTML = ''; let tot = 0;
    Object.keys(map).forEach(k => {
        if (cats[k] != null) {
            tot += Number(cats[k]);
            const row = document.createElement('div'); row.className = 'action-item';
            const info = document.createElement('div'); info.className = 'action-info';
            const n = document.createElement('div'); n.className = 'action-name'; n.textContent = map[k];
            info.appendChild(n); row.appendChild(info);
            const v = document.createElement('span'); v.style.cssText = 'font-weight:600;'; v.textContent = fmtBRL2(cats[k]);
            row.appendChild(v); el.appendChild(row);
        }
    });
    if (!el.children.length) { const d = document.createElement('div'); d.className = 'action-empty'; d.textContent = 'Sem dados'; el.appendChild(d); }
    setText(totalId, fmtBRL2(tot));
}

async function renderFluxoLojas() {
    const body = document.getElementById('fx-lojas-body'); if (!body) return;
    const now = new Date();
    const monthStart = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01T00:00:00';
    const cmap = {};
    (clients || []).forEach(c => { const d = normalizeDomain(c.website || c.domain || c.origem || ''); if (d) cmap[d] = c; });
    // Conta provas do mês corrente por loja SERVER-SIDE (1 RPC) em vez de baixar dezenas de milhares de linhas.
    const counts = await fetchProvasCounts(Object.keys(cmap).map(dom => ({ dom, cutoff: monthStart })));
    const rows = [];
    Object.keys(counts).forEach(dom => {
        const provas = counts[dom] || 0;
        if (!provas) return;
        const c = cmap[dom];
        const cat = (c && c.categoria) || 'oculos';
        const custo = provas * (FLUXO_RATE[cat] || 0.28);
        const mensal = c ? getClientMonthlyValue(c) : null;
        rows.push({ dom, cat, provas, custo, mensal, lucro: (mensal != null ? mensal - custo : null) });
    });
    rows.sort((a, b) => b.custo - a.custo);
    body.innerHTML = '';
    if (!rows.length) { body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);">Sem provas no mês</td></tr>'; return; }
    rows.forEach(r => {
        const tr = document.createElement('tr');
        const cells = [r.dom, r.cat, String(r.provas), fmtBRL2(r.custo), (r.mensal != null ? fmtBRL2(r.mensal) : '—'), (r.lucro != null ? fmtBRL2(r.lucro) : '—')];
        cells.forEach((val, i) => {
            const td = document.createElement('td'); td.textContent = val;
            if (i === 5 && r.lucro != null) td.style.color = r.lucro >= 0 ? 'var(--success)' : 'var(--danger)';
            tr.appendChild(td);
        });
        body.appendChild(tr);
    });
}

// ─── Utilitários ───────────────────────────────────────────────────────────────
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatDate(str) {
    if (!str || str === '-') return '-';
    const [y, m, d] = str.split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusClass(status) {
    if (status === 'Ativo') return 'status-active';
    if (status === 'Teste Gratuito') return 'status-pending';
    if (status === 'Permuta') return 'status-permuta';
    return 'status-inactive';
}

// ─── Inicialização ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

    // 1. Inicializa Supabase
    try {
        const sdk = window.supabase;
        if (sdk && typeof sdk.createClient === 'function' && SUPABASE_URL && SUPABASE_KEY) {
            db = sdk.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('✅ Supabase conectado com sucesso.');
        } else {
            const errorDiv = document.getElementById('login-error');
            if (errorDiv) {
                errorDiv.innerHTML = `<strong>Erro de Configuração:</strong><br>As chaves do Supabase não foram encontradas.<br>Verifique as variáveis de ambiente no Easypanel.`;
                errorDiv.style.display = 'block';
            }
            console.warn('⚠️ Credenciais do Supabase incompletas ou SDK ausente.');
        }
    } catch (e) {
        console.error('❌ Falha ao inicializar Supabase:', e);
    }

    // --- Autenticação ---
    const loginView = document.getElementById('login-view');
    const appView = document.getElementById('app-view');
    const loginForm = document.getElementById('login-form');
    const logoutBtns = document.querySelectorAll('.logout-btn');

    async function checkAuth() {
        if (!db) {
            // Em modo offline, checa se o usuário "logou" localmente para teste
            const isLocalAuth = localStorage.getItem('local_auth_test');
            if (isLocalAuth) {
                loginView.style.display = 'none';
                appView.style.display = 'flex';
                loadClients();
                switchView(viewInicial());
            } else {
                loginView.style.display = 'flex';
                appView.style.display = 'none';
            }
            return;
        }

        const { data: { session }, error } = await db.auth.getSession();

        if (session) {
            const email = session.user && session.user.email;
            if (!isAdminEmail(email)) {
                const errorDiv = document.getElementById('login-error');
                if (errorDiv) {
                    errorDiv.textContent = 'Acesso restrito. Este painel é exclusivo para administradores.';
                    errorDiv.style.display = 'block';
                }
                loginView.style.display = 'flex';
                appView.style.display = 'none';
                await db.auth.signOut();
                return;
            }

            loginView.style.display = 'none';
            appView.style.display = 'flex';

            const userEmailEl = document.querySelector('.user-name');
            if (userEmailEl) userEmailEl.textContent = email;

            loadClients();
            switchView(viewInicial());
        } else {
            loginView.style.display = 'flex';
            appView.style.display = 'none';
        }
    }

    // Escuta mudanças na autenticação
    if (db) {
        db.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
                checkAuth();
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const errorDiv = document.getElementById('login-error');
            const btn = document.getElementById('btn-login');

            errorDiv.style.display = 'none';
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
            btn.disabled = true;

            if (!db) {
                // Modo offline: apenas para teste local real (quando LOCAL_SUPABASE_URL está vazio)
                if (!SUPABASE_URL || SUPABASE_URL === 'undefined') {
                    console.log('Login offline simulado');
                    localStorage.setItem('local_auth_test', 'true');
                    setTimeout(() => {
                        checkAuth();
                        btn.innerHTML = '<i class="fas fa-sign-in-alt" style="margin-right: 8px;"></i> Entrar';
                        btn.disabled = false;
                    }, 500);
                    return;
                }

                errorDiv.textContent = 'Erro de conexão com o banco de dados. Verifique as configurações.';
                errorDiv.style.display = 'block';
                btn.innerHTML = '<i class="fas fa-sign-in-alt" style="margin-right: 8px;"></i> Entrar';
                btn.disabled = false;
                return;
            }

            // Login direto via signInWithPassword (mesmo método do dashboard lojista).
            // Segurança: RLS admins_only bloqueia dados de não-admins + checkAuth faz
            // signOut() de quem não é admin (ver isAdminEmail em checkAuth).
            const _resetBtn = () => { btn.innerHTML = '<i class="fas fa-sign-in-alt" style="margin-right: 8px;"></i> Entrar'; btn.disabled = false; };
            try {
                // Bloqueio de email não-admin antes de autenticar (camada client extra)
                if (!isAdminEmail(email)) {
                    errorDiv.textContent = 'Acesso restrito. Este painel é exclusivo para administradores.';
                    errorDiv.style.display = 'block';
                    _resetBtn();
                    return;
                }

                const { data, error } = await db.auth.signInWithPassword({
                    email: email,
                    password: password,
                });

                if (error || !data || !data.session) {
                    console.warn('[login] erro:', error);
                    errorDiv.textContent = 'Credenciais inválidas. Tente novamente.';
                    errorDiv.style.display = 'block';
                    _resetBtn();
                    return;
                }

                _resetBtn();
                await checkAuth(); // força navegação independente de onAuthStateChange
            } catch (err) {
                console.error('[login] erro no fluxo:', err);
                errorDiv.textContent = 'Erro de conexão. Tente novamente.';
                errorDiv.style.display = 'block';
                _resetBtn();
            }
        });
    }

    logoutBtns.forEach(btn => {
        // Ignorar os botões de fechar modais (eles usam .logout-btn de classe tbm)
        if (btn.id === 'btn-fechar-detalhes' || btn.id === 'btn-close-apikey') return;

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('Saindo...');

            if (db) {
                const { error } = await db.auth.signOut();
                if (error) {
                    console.error('Erro ao sair:', error.message);
                    alert('Erro ao sair: ' + error.message);
                }
                localStorage.removeItem('local_auth_test');
                window.location.reload();
            } else {
                // Modo offline: apenas recarrega para voltar à tela inicial
                localStorage.removeItem('local_auth_test');
                window.location.reload();
            }
        });
    });

    // Checa autenticação inicial
    await checkAuth();

    // 2. Botão "Novo Cliente"
    const btnNovoCliente = document.getElementById('btn-novo-cliente');
    if (btnNovoCliente) {
        btnNovoCliente.addEventListener('click', () => openModal('registration-modal'));
    }

    // 3. Botões de fechar modal
    const btnCloseReg = document.getElementById('btn-close-registration');
    if (btnCloseReg) btnCloseReg.addEventListener('click', window.closeRegistrationModal);

    const btnCloseClient = document.getElementById('btn-close-client');
    if (btnCloseClient) btnCloseClient.addEventListener('click', window.closeModal);

    const btnFecharDetalhes = document.getElementById('btn-fechar-detalhes');
    if (btnFecharDetalhes) btnFecharDetalhes.addEventListener('click', window.closeModal);

    // Modal de pagamentos
    const btnClosePgto = document.getElementById('btn-close-pagamentos');
    if (btnClosePgto) btnClosePgto.addEventListener('click', closePagamentosModal);
    const btnSavePgto = document.getElementById('btn-salvar-pagamento');
    if (btnSavePgto) btnSavePgto.addEventListener('click', salvarPagamento);

    // Plano personalizado: bloqueia/desbloqueia dropdown de plano em tempo real
    const planoCustomInput = document.getElementById('plano_personalizado');
    if (planoCustomInput) planoCustomInput.addEventListener('input', syncPersonalizadoLock);

    // 4. Fechar modal ao clicar no overlay (fundo escuro) ou pressionar ESC
    document.addEventListener('click', e => {
        if (e.target.id === 'registration-modal') window.closeRegistrationModal();
        if (e.target.id === 'client-modal') window.closeModal();
        if (e.target.id === 'pagamentos-modal') closePagamentosModal();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const regModal = document.getElementById('registration-modal');
            const clientModal = document.getElementById('client-modal');

            if (regModal && regModal.classList.contains('active')) {
                window.closeRegistrationModal();
            }
            if (clientModal && clientModal.classList.contains('active')) {
                window.closeModal();
            }
        }
    });

    // 5. Navegação sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            const viewId = item.dataset.view;
            if (viewId) switchView(viewId);
        });
    });

    // 6. Formulário de cadastro
    const form = document.getElementById('client-form');
    if (form) form.addEventListener('submit', addClient);

    // Select status de cadastro
    const statusSelect = document.getElementById('status');
    if (statusSelect) {
        statusSelect.addEventListener('change', (e) => {
            const wrapper = document.getElementById('implementation-date-wrapper');
            if (wrapper) {
                wrapper.style.display = e.target.value === 'Teste Gratuito' ? 'block' : 'none';
                if (e.target.value === 'Teste Gratuito' && !document.getElementById('implementation_date').value) {
                    document.getElementById('implementation_date').value = new Date().toISOString().split('T')[0];
                }
            }
        });
    }

    // 7. Botões de filtro (já têm onclick inline, mas garantimos via delegação também)
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // 9. Botão atualizar provas
    const btnRefreshTryons = document.getElementById('btn-refresh-tryons');
    if (btnRefreshTryons) {
        btnRefreshTryons.addEventListener('click', loadTryons);
    }

    const btnRefreshLimites = document.getElementById('btn-refresh-limites');
    if (btnRefreshLimites) {
        btnRefreshLimites.addEventListener('click', loadLimites);
    }

    const btnRefreshFatView = document.getElementById('btn-refresh-faturamento-view');
    if (btnRefreshFatView) {
        btnRefreshFatView.addEventListener('click', refreshFaturamentoView);
    }

    // 9b. Tela de Pagamentos (abas, busca, exportar, menus de ação)
    setupPagamentosUI();
    setupSaudeUI();
    aplicarIcones();

    // 10. Lógica do Modal da API Key Gerada
    const btnCloseApiKey = document.getElementById('btn-close-apikey');
    if (btnCloseApiKey) btnCloseApiKey.addEventListener('click', window.closeApiKeyModal);

    const btnToggleKey = document.getElementById('btn-toggle-key');
    if (btnToggleKey) {
        btnToggleKey.addEventListener('click', () => {
            const input = document.getElementById('revealed-api-key');
            const icon = document.getElementById('icon-toggle-key');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    }

    const btnCopyKey = document.getElementById('btn-copy-key');
    if (btnCopyKey) {
        btnCopyKey.addEventListener('click', () => {
            const input = document.getElementById('revealed-api-key');
            const wasPassword = input.type === 'password';

            // Para copiar, precisamos tornar o input tipo text temporariamente
            input.type = 'text';
            input.select();
            input.setSelectionRange(0, 99999); // Para mobile

            try {
                navigator.clipboard.writeText(input.value).then(() => {
                    btnCopyKey.innerHTML = '<i class="fas fa-check" style="margin-right: 8px;"></i> Chave Copiada!';
                    btnCopyKey.style.background = 'var(--success)';

                    setTimeout(() => {
                        btnCopyKey.innerHTML = '<i class="fas fa-copy" style="margin-right: 8px;"></i> Copiar Chave';
                        btnCopyKey.style.background = '';
                    }, 3000);
                }).catch(err => {
                    document.execCommand('copy');
                });
            } catch (err) {
                document.execCommand('copy');
            }

            // Volta pro que estava antes
            if (wasPassword) input.type = 'password';
        });
    }

});
