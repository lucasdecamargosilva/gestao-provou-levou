// ─── Configuração Supabase ─────────────────────────────────────────────────────
const SUPABASE_URL = '%%SUPABASE_URL%%';
const SUPABASE_KEY = '%%SUPABASE_KEY%%';

// ─── Estado Global ─────────────────────────────────────────────────────────────
const PLAN_VALUES = {
    'Starter': 97,
    'Inicial': 197,
    'Médio': 397,
    'Premium': 797
};

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
        domain: document.getElementById('website').value.trim() || `loja-${Date.now()}.com`
    };

    if (!clientId) {
        payload.last_payment = null;
    }

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

    ['Starter', 'Inicial', 'Médio', 'Premium'].forEach(plan => {
        const key = plan.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const group = clients.filter(c => c.plan === plan && c.status === 'Ativo');
        setText(`pkg-${key}-count`, group.length);
        setText(`pkg-${key}-total`, `R$ ${(group.length * (PLAN_VALUES[plan] || 0)).toLocaleString('pt-BR')}`);
    });
}

function switchView(viewId) {
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.view === viewId);
    });
    document.querySelectorAll('.view').forEach(el => {
        el.classList.toggle('active', el.id === viewId);
    });
    if (viewId === 'dashboard') { updateStats(); renderTable(); }
    if (viewId === 'tryons') { loadTryons(); }
}

// ─── Utilitários ───────────────────────────────────────────────────────────────
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatDate(str) {
    if (!str || str === '-') return '-';
    return new Date(str).toLocaleDateString('pt-BR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusClass(status) {
    if (status === 'Ativo') return 'status-active';
    if (status === 'Teste Gratuito') return 'status-pending';
    return 'status-inactive';
}

// ─── Inicialização ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

    // 1. Inicializa Supabase (usando `db` para não conflitar com window.supabase do SDK CDN)
    try {
        const sdk = window.supabase; // o SDK expõe window.supabase
        if (sdk && typeof sdk.createClient === 'function') {
            db = sdk.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('✅ Supabase conectado.');
        } else {
            console.warn('⚠️ Supabase SDK não encontrado. Modo offline.');
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
                // Modo offline: permite entrar com qualquer coisa
                console.log('Login offline simulado');
                localStorage.setItem('local_auth_test', 'true');
                setTimeout(() => {
                    checkAuth();
                    btn.innerHTML = '<i class="fas fa-sign-in-alt" style="margin-right: 8px;"></i> Entrar';
                    btn.disabled = false;
                }, 500);
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

});
