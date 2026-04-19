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
    'Ultra Power': 2200
};

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

async function computeFaturamentoPosProva() {
    if (!db) throw new Error('Supabase não conectado');

    // 1. Configs dos lojistas com tabela_pedidos preenchida
    const { data: lojistas, error: lojErr } = await db
        .from('lojistas')
        .select('email, origem, tabela_pedidos, campo_telefone_pedido, campo_total_pedido, campo_data_pedido, campo_status_pedido, valores_status_pago')
        .neq('tabela_pedidos', '')
        .not('tabela_pedidos', 'is', null);
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
            if (lojProvas.length === 0) {
                porEmail[loj.email] = 0;
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
                { method: 'in', args: [fStatus, loj.valores_status_pago] }
            ];
            if (earliestProvaDate) {
                filters.push({ method: 'gte', args: [fDate, earliestProvaDate + 'T00:00:00-03:00'] });
            }

            const orders = await fetchAllPaginated(loj.tabela_pedidos, select, filters);

            let lojaTotal = 0;
            for (const o of orders) {
                const ph = normalizePhone(o[fPhone]);
                if (!ph || !provaPhones.has(ph)) continue;
                if (!isOrderAfterProva(o[fDate], ph, minDateMap, minTsMap)) continue;
                const val = parseFloat(o[fTotal]) || 0;
                lojaTotal += val;
            }

            porEmail[loj.email] = lojaTotal;
            totalGeral += lojaTotal;
        } catch (err) {
            console.warn(`Erro calculando faturamento para ${loj.email}:`, err);
            porEmail[loj.email] = 0;
        }
    }

    return {
        updatedAt: new Date().toISOString(),
        totalGeral,
        porEmail
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
    if (!valEl || !updEl) return;

    if (!cache) {
        valEl.textContent = 'R$ 0';
        setUpdatedLine(updEl, 'fas fa-clock', 'Clique para calcular');
        return;
    }
    valEl.textContent = formatBRL(cache.totalGeral);
    setUpdatedLine(updEl, 'fas fa-clock', 'Atualizado ' + formatRelativeTime(cache.updatedAt));
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
            implementationDate: s.implementation_date || null
        }));
    } catch (err) {
        console.error('Erro ao carregar clientes:', err);
    }

    updateStats();
    renderTable();
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
        last_payment: document.getElementById('last_payment').value || null
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

    const impWrapper = document.getElementById('implementation-date-wrapper');
    if (c.status === 'Teste Gratuito') {
        if (impWrapper) impWrapper.style.display = 'block';
        document.getElementById('implementation_date').value = c.implementationDate || c.date;
    } else {
        if (impWrapper) impWrapper.style.display = 'none';
        document.getElementById('implementation_date').value = '';
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


async function loadTryons() {
    if (!db) return;

    const tbody = document.getElementById('tryons-table-body');
    if (!tbody) return;

    try {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-dim); padding: 30px 0;"><i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i> Carregando dados...</td></tr>';

        // Fetch tryons
        const { data: tryons, error: tryonsError } = await db
            .from('geracoes_provou_levou')
            .select('*');

        if (tryonsError) throw tryonsError;

        // Group by origin
        const tryonCounts = {};
        if (tryons) {
            for (const t of tryons) {
                let origin = t.origin;
                if (origin) {
                    // Normalize origin
                    origin = origin.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
                    if (origin) {
                        tryonCounts[origin] = (tryonCounts[origin] || 0) + 1;
                    }
                }
            }
        }

        const tableData = [];
        let totalTryons = 0;

        for (const [origin, count] of Object.entries(tryonCounts)) {
            totalTryons += count;

            tableData.push({
                origin: origin,
                count: count
            });
        }

        tableData.sort((a, b) => b.count - a.count);

        // Update stats
        const statTotal = document.getElementById('stat-total-tryons');
        if (statTotal) statTotal.textContent = totalTryons.toLocaleString('pt-BR');

        const statCost = document.getElementById('stat-total-tryons-cost');
        if (statCost) statCost.textContent = `R$ ${(totalTryons * 0.3).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        tbody.innerHTML = '';

        if (tableData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Nenhuma geração encontrada.</td></tr>';
            return;
        }

        for (const item of tableData) {
            const tr = document.createElement('tr');

            const cost = item.count * 0.3;

            tr.innerHTML = `
                <td>
                    <div style="font-weight:600"><a href="https://${item.origin}" target="_blank" style="color:var(--text); text-decoration: none;">${item.origin} <i class="fas fa-external-link-alt" style="font-size:10px;margin-left:4px;color:var(--accent)"></i></a></div>
                </td>
                <td><span class="status-badge" style="background: rgba(124,58,237,0.15); color: #a78bfa; font-weight: 600;">${item.count.toLocaleString('pt-BR')} provas</span></td>
                <td style="color: #ef4444; font-weight: 600;">R$ ${cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            `;

            tbody.appendChild(tr);
        }

    } catch (err) {
        console.error('Erro ao carregar provas virtuais:', err);
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #ef4444; padding: 30px 0;">Erro ao carregar os dados.</td></tr>';
    }
}

// ─── Render ────────────────────────────────────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('dashboard-client-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    const sorted = [...clients].sort((a, b) => new Date(b.date) - new Date(a.date));

    const fatCache = readFaturamentoCache();
    const fatPorEmail = (fatCache && fatCache.porEmail) || {};

    sorted.forEach(client => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';

        let cls = statusClass(client.status);
        const value = PLAN_VALUES[client.plan]
            ? `R$ ${PLAN_VALUES[client.plan].toLocaleString('pt-BR')}`
            : '-';

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
            <td><span style="opacity:.85">${client.plan}</span></td>
            <td style="color:var(--success);font-weight:600">${value}</td>
            <td style="color:var(--text-dim)">${client.lastPayment && client.lastPayment !== '-' ? formatDate(client.lastPayment) : '—'}</td>
            <td><span class="status-badge ${cls}">${statusDisplay}</span></td>
            <td class="cell-faturamento"></td>
            <td>
                <div style="display:flex;gap:10px">
                    <button data-action="edit"   data-id="${client.id}" style="background:none;border:none;color:var(--text-dim);cursor:pointer" title="Editar"><i class="fas fa-edit"></i></button>
                    <button data-action="delete" data-id="${client.id}" style="background:none;border:none;color:var(--text-dim);cursor:pointer" title="Excluir"><i class="fas fa-trash"></i></button>
                    <button data-action="view"   data-id="${client.id}" style="background:none;border:none;color:var(--text-dim);cursor:pointer" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                </div>
            </td>
        `;

        const fatValue = fatPorEmail[client.email];
        const fatCell = tr.querySelector('.cell-faturamento');
        if (fatCell) {
            fatCell.textContent = (typeof fatValue === 'number') ? formatBRL(fatValue) : '—';
            fatCell.style.color = (typeof fatValue === 'number') ? 'var(--accent)' : 'var(--text-dim)';
            fatCell.style.fontWeight = '600';
        }

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

    const mrr = active.reduce((sum, c) => sum + (PLAN_VALUES[c.plan] || 0), 0);
    const potentialMrr = potential.reduce((sum, c) => sum + (PLAN_VALUES[c.plan] || 0), 0);

    const growth = active.length > 0 ? '12%' : '0%';

    setText('stat-active-clients', active.length);
    setText('stat-total-mrr', `R$ ${mrr.toLocaleString('pt-BR')}`);
    setText('stat-potential-mrr', `R$ ${potentialMrr.toLocaleString('pt-BR')}`);
    setText('stat-growth', growth);

    ['Starter', 'Inicial', 'Médio', 'Premium', 'Ultra Power'].forEach(plan => {
        const key = plan.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
        const group = clients.filter(c => c.plan === plan && c.status === 'Ativo');
        setText(`pkg-${key}-count`, group.length);
        setText(`pkg-${key}-total`, `R$ ${(group.length * (PLAN_VALUES[plan] || 0)).toLocaleString('pt-BR')}`);
    });

    updateProvinha();
}

function switchView(viewId) {
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.view === viewId);
    });
    document.querySelectorAll('.view').forEach(el => {
        el.classList.toggle('active', el.id === viewId);
    });
    if (viewId === 'dashboard') { updateStats(); renderTable(); }
    if (viewId === 'provinha') { updateProvinha(); }
    if (viewId === 'tryons') { loadTryons(); }
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
            } else {
                loginView.style.display = 'flex';
                appView.style.display = 'none';
            }
            return;
        }

        const { data: { session }, error } = await db.auth.getSession();

        if (session) {
            loginView.style.display = 'none';
            appView.style.display = 'flex';

            // Atualiza o email na sidebar
            const userEmailEl = document.querySelector('.user-name');
            if (userEmailEl) userEmailEl.textContent = session.user.email;

            loadClients();
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

            const { data, error } = await db.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                errorDiv.textContent = 'Credenciais inválidas. Tente novamente.';
                errorDiv.style.display = 'block';
                btn.innerHTML = '<i class="fas fa-sign-in-alt" style="margin-right: 8px;"></i> Entrar';
                btn.disabled = false;
            }
            // Se der certo, onAuthStateChange vai capturar o evento SIGNED_IN
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

    // 4. Fechar modal ao clicar no overlay (fundo escuro) ou pressionar ESC
    document.addEventListener('click', e => {
        if (e.target.id === 'registration-modal') window.closeRegistrationModal();
        if (e.target.id === 'client-modal') window.closeModal();
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

    // ─── Faturamento via Provador wiring ──────────────────────────────────
    renderFaturamentoCard(readFaturamentoCache());

    const btnRefreshFat = document.getElementById('btn-refresh-faturamento');
    if (btnRefreshFat) {
        btnRefreshFat.addEventListener('click', refreshFaturamentoPosProva);
    }

});
