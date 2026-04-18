# Faturamento via Provador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a KPI card and per-client column in the gestão dashboard showing faturamento pós-prova (revenue from orders made after the customer used the provador), aggregated across all configured lojistas.

**Architecture:** Pure client-side JS. New function `computeFaturamentoPosProva()` paginates `geracoes_provou_levou` + each lojista's orders table via Supabase REST, cross-references by phone, and applies the pós-prova timestamp rule. Result cached in `localStorage`; manual refresh via button.

**Tech Stack:** Vanilla JS (no test framework), Supabase JS client (already loaded), HTML/CSS in existing files.

**Spec:** `docs/superpowers/specs/2026-04-18-faturamento-provador-design.md`

**Security note:** All new DOM writes use safe APIs (`createElement`, `textContent`, `appendChild`) per Regra 5 do skill `regras-dash-provou-levou`.

---

## File Structure

| File | Change |
|---|---|
| `script.js` | Add helpers + `computeFaturamentoPosProva()` + cache logic + UI updates |
| `index.html` | Add KPI card (5th column in stats grid) + table column header |
| `style.css` | Add `.btn-icon` style for refresh button |

No new files. All logic lives in `script.js` to follow existing pattern (single SPA file).

---

### Task 1: Helpers — phone/domain normalization, timestamp comparison, relative time

**Files:**
- Modify: `script.js` (add at top of file, after `PLAN_VALUES` definition around line 17)

- [ ] **Step 1: Add helper functions to `script.js`**

Insert after line 17 (after `PLAN_VALUES` const):

```js
// ─── Helpers para Faturamento Pós-Prova ─────────────────────────────────────
function normalizePhone(p) {
    let n = String(p || '').replace(/\D/g, '');
    if (n.startsWith('55') && n.length > 11) n = n.slice(2);
    if (n.startsWith('0')) n = n.slice(1);
    return n;
}

function normalizeDomain(o) {
    let s = String(o || '').toLowerCase().trim();
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    return s;
}

function isOrderAfterProva(orderTs, ph, minDateMap, minTsMap) {
    if (!orderTs || !ph) return false;
    const provaDate = minDateMap[ph];
    if (!provaDate) return false;
    const orderDate = String(orderTs).slice(0, 10);
    const hasRealTime = String(orderTs).includes('T') && !String(orderTs).includes('T00:00:00');
    if (hasRealTime) {
        const provaTs = minTsMap[ph] || '';
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
```

- [ ] **Step 2: Manual sanity check in browser console**

Open the dashboard locally, open DevTools console, run:

```js
normalizePhone('+55 (11) 98765-4321')  // Expected: "11987654321"
normalizeDomain('https://www.cacifebrand.com.br/')  // Expected: "cacifebrand.com.br"
formatRelativeTime(new Date(Date.now() - 90 * 60 * 1000).toISOString())  // Expected: "1 h atrás"
isOrderAfterProva('2026-04-15T14:00:00', '11987654321', {'11987654321':'2026-04-10'}, {'11987654321':'2026-04-10T10:00:00'})  // Expected: true
formatBRL(41743.6)  // Expected: "R$ 41.743,60"
```

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat: add helpers for faturamento pós-prova calculation"
```

---

### Task 2: `computeFaturamentoPosProva()` — paginated query and cross-reference

**Files:**
- Modify: `script.js` (add after the helpers from Task 1)

- [ ] **Step 1: Add paginated fetch helper**

```js
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
```

- [ ] **Step 2: Add `computeFaturamentoPosProva()` function**

```js
async function computeFaturamentoPosProva() {
    if (!db) throw new Error('Supabase não conectado');

    // 1. Configs dos lojistas com tabela_pedidos preenchida
    const { data: lojistas, error: lojErr } = await db
        .from('lojistas')
        .select('email, origem, tabela_pedidos, campo_telefone_pedido, campo_total_pedido, campo_data_pedido, campo_status_pedido, valores_status_pago')
        .neq('tabela_pedidos', '');
    if (lojErr) throw lojErr;
    const validLojistas = (lojistas || []).filter(l =>
        l.tabela_pedidos && l.valores_status_pago && l.valores_status_pago.length > 0
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
                if (dom === lojOrigem || dom.includes(lojOrigem) || lojOrigem.includes(dom)) {
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
```

- [ ] **Step 3: Test in browser console**

Open dashboard, open DevTools, run:

```js
const r = await computeFaturamentoPosProva();
console.log('Total:', formatBRL(r.totalGeral));
console.log('Por loja:', r.porEmail);
```

Expected (ref. 2026-04-18 do skill `regras-dash-provou-levou`):
- Total ~R$ 83.001 (acceptable range: 78.000–88.000)
- Cacifé: ~R$ 41.743, Mariana: ~R$ 21.089, Calmo: ~R$ 11.113

If divergence >5%, debug per skill rules (pagination, phone normalize, timestamp comparison).

- [ ] **Step 4: Commit**

```bash
git add script.js
git commit -m "feat: add computeFaturamentoPosProva with paginated queries"
```

---

### Task 3: Cache layer + safe DOM render functions

**Files:**
- Modify: `script.js` (add after `computeFaturamentoPosProva`)

- [ ] **Step 1: Add cache helpers and DOM render**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add script.js
git commit -m "feat: add cache layer and safe DOM render for faturamento card"
```

---

### Task 4: HTML — KPI card with refresh button

**Files:**
- Modify: `index.html` (line 92, then insert block after line 120)

- [ ] **Step 1: Change KPI grid from 4 to 5 columns**

Find line 92:
```html
<div class="stats-grid" style="grid-template-columns: repeat(4, 1fr);">
```

Replace with:
```html
<div class="stats-grid" style="grid-template-columns: repeat(5, 1fr);">
```

- [ ] **Step 2: Add new card after the "Evolução do Mês" card**

Find lines 114-120 (the "Evolução do Mês" stat-card div) and insert immediately AFTER its closing `</div>`:

```html
                    <div class="stat-card glass">
                        <div class="stat-label" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <span>Faturamento via Provador</span>
                            <button id="btn-refresh-faturamento" class="btn-icon" title="Atualizar">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                        </div>
                        <div id="stat-faturamento-provador" class="stat-value">R$ 0</div>
                        <div id="stat-faturamento-updated" class="stat-trend trend-up">
                            <i class="fas fa-clock"></i> Nunca calculado
                        </div>
                    </div>
```

- [ ] **Step 3: Verify visually in browser**

Open `index.html` (with dev server or directly), confirm 5 cards render in a single row, the new card shows "R$ 0" and "Nunca calculado", refresh button is visible.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add Faturamento via Provador KPI card to dashboard"
```

---

### Task 5: HTML — table column header

**Files:**
- Modify: `index.html` (lines 188-198 area)

- [ ] **Step 1: Add column header**

Find the `<thead>` block (around lines 188-199). Add a new `<th>Faturado via Provador</th>` between the existing `<th>Status</th>` and `<th>Ações</th>`. Final order:

```
Cliente | Empresa | Plano | Valor Mensal | Último Pagamento | Status | Faturado via Provador | Ações
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add Faturado via Provador column header to client table"
```

---

### Task 6: CSS — refresh button style

**Files:**
- Modify: `style.css` (append at end of file)

- [ ] **Step 1: Add `.btn-icon` style**

Append:

```css
.btn-icon {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 12px;
    transition: color 0.15s, background 0.15s;
}

.btn-icon:hover {
    color: var(--accent);
    background: rgba(124, 58, 237, 0.1);
}
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "style: add btn-icon for refresh button in KPI card"
```

---

### Task 7: Render the per-client column in the table

**Files:**
- Modify: `script.js` — function `renderTable` (around lines 540-617)

The existing `renderTable` builds rows via a template string. We need to add one cell between Status and Ações, and post-process to append a safe DOM cell with the faturamento value.

**Strategy to avoid mixing safe/unsafe DOM:** Use the existing template (number values are safe — they come from our own `formatBRL`), but add a placeholder cell that we then populate with `textContent`.

- [ ] **Step 1: Read cache once at top of renderTable**

In `renderTable`, immediately before the `clients.forEach(client => {` loop, add:

```js
    const fatCache = readFaturamentoCache();
    const fatPorEmail = (fatCache && fatCache.porEmail) || {};
```

- [ ] **Step 2: Add cell to template + populate via textContent**

Inside the forEach loop, find the Status cell line:

```js
            <td><span class="status-badge ${cls}">${statusDisplay}</span></td>
```

Add a new `<td class="cell-faturamento"></td>` line between Status and the Ações cell. The empty cell will be populated safely after the row is created.

After the row's template assignment but BEFORE `tbody.appendChild(tr);`, add:

```js
        const fatValue = fatPorEmail[client.email];
        const fatCell = tr.querySelector('.cell-faturamento');
        if (fatCell) {
            fatCell.textContent = (typeof fatValue === 'number') ? formatBRL(fatValue) : '—';
            fatCell.style.color = (typeof fatValue === 'number') ? 'var(--accent)' : 'var(--text-dim)';
            fatCell.style.fontWeight = '600';
        }
```

- [ ] **Step 3: Verify column populates**

Reload dashboard. Even with no cache, every row should now have a "—" in the new column. After running refresh, mapped clientes should show R$ values.

- [ ] **Step 4: Commit**

```bash
git add script.js
git commit -m "feat: render faturamento por cliente in table column"
```

---

### Task 8: Wire up initial render and refresh button click

**Files:**
- Modify: `script.js` (in the init flow)

- [ ] **Step 1: Locate init code**

Run:
```bash
grep -n "DOMContentLoaded\|loadClients()" script.js
```

Identify where `loadClients()` is called on startup (likely inside a `DOMContentLoaded` listener or at module level near the bottom).

- [ ] **Step 2: Add init wiring after `loadClients()`**

Right after the line that calls (or awaits) `loadClients()`, add:

```js
// Render cached faturamento on load
renderFaturamentoCard(readFaturamentoCache());

// Wire up refresh button
const btnRefresh = document.getElementById('btn-refresh-faturamento');
if (btnRefresh) {
    btnRefresh.addEventListener('click', refreshFaturamentoPosProva);
}
```

If `loadClients()` is called inside a `DOMContentLoaded` handler, place these lines inside the same handler. If it is at module level, place them right after.

- [ ] **Step 3: End-to-end test in browser**

1. Hard reload (Cmd+Shift+R) to clear cache.
2. Card shows "R$ 0" + "Clique para calcular".
3. Table column shows "—" for all rows.
4. Click the refresh button. Spinner appears, "Calculando..." shows.
5. After 5–15s, card updates to show total (~R$ 83k) and "Atualizado agora".
6. Table column populates: Cacifé ~R$ 41,7k, Mariana ~R$ 21k, Calmo ~R$ 11,1k. Clientes não mapeados ainda mostram "—".
7. Reload page. Card and column should immediately show cached values, with "Atualizado X min atrás".

- [ ] **Step 4: Commit**

```bash
git add script.js
git commit -m "feat: wire up faturamento card and refresh on dashboard load"
```

---

### Task 9: Sanity check vs reference values + push

- [ ] **Step 1: Run final check in console**

```js
const cache = JSON.parse(localStorage.getItem('faturamentoPosProvaCache'));
console.table(cache.porEmail);
console.log('Total:', formatBRL(cache.totalGeral));
```

Expected (ref. skill `regras-dash-provou-levou`):
- Cacifé: R$ 41.743,60 (±5%)
- Mariana: R$ 21.089,37 (±5%)
- Calmo Store: R$ 11.113,38 (±5%)
- Califa: R$ 5.961,21 (±5%)
- Dope Tees: R$ 2.035,36 (±5%)
- Emaus: R$ 764,21 (±5%)
- Next Sport: R$ 294,16 (±5%)
- Midas Touch: R$ 0,00
- TOTAL: ~R$ 83.001 (±5%)

If divergence >5% on any loja, investigate per Regra 9 of `regras-dash-provou-levou` (timestamp rule, pagination, phone normalize).

- [ ] **Step 2: Push to git**

```bash
git push
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ KPI card → Task 4
- ✅ Coluna na tabela → Task 5 (header) + Task 7 (data)
- ✅ Cache localStorage → Task 3
- ✅ Botão refresh → Task 4 (UI) + Task 8 (handler)
- ✅ "Atualizado há X" → Task 1 (`formatRelativeTime`) + Task 3 (`renderFaturamentoCard`)
- ✅ Pipeline de cálculo → Task 2
- ✅ Helpers (normalize, isOrderAfterProva) → Task 1
- ✅ Tratamento de erros (loja com falha) → Task 2 (try/catch per loja)
- ✅ Mapeamento por email → Task 7 (`fatPorEmail[client.email]`)
- ✅ Sanity check vs reference → Task 9
- ✅ Safe DOM (Regra 5) → Task 3 + Task 7 use `textContent` and `createElement`

**Type/name consistency:**
- `normalizePhone` Task 1 → used Task 2 ✓
- `normalizeDomain` Task 1 → used Task 2 ✓
- `isOrderAfterProva` Task 1 → used Task 2 ✓
- `formatRelativeTime` Task 1 → used Task 3 ✓
- `formatBRL` Task 1 → used Task 2, 3, 7, 9 ✓
- `fetchAllPaginated` Task 2 → used Task 2 ✓
- `computeFaturamentoPosProva` Task 2 → used Task 3 ✓
- `setUpdatedLine` Task 3 → used Task 3 ✓
- `readFaturamentoCache` / `writeFaturamentoCache` / `renderFaturamentoCard` / `refreshFaturamentoPosProva` Task 3 → used Task 7, 8 ✓
- HTML IDs (`stat-faturamento-provador`, `stat-faturamento-updated`, `btn-refresh-faturamento`) Task 4 → referenced Task 3, 8 ✓
- CSS class `.btn-icon` Task 6 → used Task 4 ✓
- CSS class `.cell-faturamento` Task 7 → used in same task ✓
