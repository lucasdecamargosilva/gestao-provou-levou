# Custo de Gerações — Implementation Plan

**Goal:** Add cost tracking (R$ 0,20 per generation) to the gestão dashboard. Display total cost across all stores as a KPI card + per-client cost in the clients table. Update the existing "Provas Virtuais" view to use the new R$ 0,20 rate.

**Architecture:** Extend `computeFaturamentoPosProva` to also count provas per loja and compute cost. Add `COST_PER_PROVA` constant (0.20) used by both this function and the existing `loadTryons` view. Cache structure changes from `porEmail: {email -> number}` to `porEmail: {email -> {faturamento, provas, custo}}`.

---

## File Structure

| File | Change |
|---|---|
| `script.js` | Add COST_PER_PROVA constant, refactor cache shape, extend computeFaturamentoPosProva, update loadTryons rate, add custo render + table cell |
| `index.html` | Add 6th KPI card "Custo Gerações" + table column header "Custo Gerações" |

---

### Task 1: Add COST_PER_PROVA constant + update loadTryons rate

**File:** `script.js`

- [ ] **Step 1:** After `PLAN_VALUES` const (around line 17), add:

```js
const COST_PER_PROVA = 0.20;
```

- [ ] **Step 2:** Replace `0.3` with `COST_PER_PROVA` in two places:
  - Line ~757: `(totalTryons * 0.3)` → `(totalTryons * COST_PER_PROVA)`
  - Line ~769: `item.count * 0.3` → `item.count * COST_PER_PROVA`

- [ ] **Step 3:** Commit:
```bash
git add script.js
git commit -m "feat: add COST_PER_PROVA constant (R\$ 0,20) and update tryons view rate"
```

---

### Task 2: Refactor `computeFaturamentoPosProva` to also compute custo per loja

**File:** `script.js`

The current cache shape is `{updatedAt, totalGeral, porEmail: {email -> number}}`. Change to:

```js
{
    updatedAt,
    totalGeral,         // sum of faturamento pós-prova (existing)
    totalProvas,        // sum of all provas across all configured lojas
    totalCusto,         // totalProvas * COST_PER_PROVA
    porEmail: {
        email -> { faturamento: number, provas: number, custo: number }
    }
}
```

- [ ] **Step 1:** Inside `computeFaturamentoPosProva`, modify the per-lojista loop. After computing `lojaTotal` (faturamento), add count and cost. Replace:

```js
            porEmail[loj.email] = lojaTotal;
            totalGeral += lojaTotal;
```

with:

```js
            const provasCount = lojProvas.length;
            const custo = provasCount * COST_PER_PROVA;
            porEmail[loj.email] = { faturamento: lojaTotal, provas: provasCount, custo };
            totalGeral += lojaTotal;
```

- [ ] **Step 2:** Also update the "no provas" early-continue branch. Replace:
```js
            if (lojProvas.length === 0) {
                porEmail[loj.email] = 0;
                continue;
            }
```

with:
```js
            if (lojProvas.length === 0) {
                porEmail[loj.email] = { faturamento: 0, provas: 0, custo: 0 };
                continue;
            }
```

- [ ] **Step 3:** Update the catch branch. Replace:
```js
            porEmail[loj.email] = 0;
```

with:
```js
            porEmail[loj.email] = { faturamento: 0, provas: 0, custo: 0 };
```

- [ ] **Step 4:** Update the totals computation at the end. Add `totalProvas` and `totalCusto`:

Find the `return { updatedAt, totalGeral, porEmail }` and replace with:

```js
    let totalProvas = 0;
    for (const v of Object.values(porEmail)) totalProvas += v.provas || 0;
    const totalCusto = totalProvas * COST_PER_PROVA;

    return {
        updatedAt: new Date().toISOString(),
        totalGeral,
        totalProvas,
        totalCusto,
        porEmail
    };
```

- [ ] **Step 5:** Commit:
```bash
git add script.js
git commit -m "feat: extend computeFaturamentoPosProva to include provas count and custo per loja"
```

---

### Task 3: Add KPI card "Custo Gerações" + change grid to 6 columns

**File:** `index.html`

- [ ] **Step 1:** Change line ~92 grid from 5 to 6 columns:
```html
<div class="stats-grid" style="grid-template-columns: repeat(5, 1fr);">
```
→
```html
<div class="stats-grid" style="grid-template-columns: repeat(6, 1fr);">
```

- [ ] **Step 2:** Insert new card immediately AFTER the "Faturamento via Provador" card (right before the closing `</div>` of the stats-grid):

```html
                    <div class="stat-card glass">
                        <div class="stat-label">Custo Gerações</div>
                        <div id="stat-custo-geracoes" class="stat-value">R$ 0</div>
                        <div id="stat-custo-provas" class="stat-trend trend-up" style="color: #ef4444;">
                            <i class="fas fa-image"></i> 0 provas
                        </div>
                    </div>
```

- [ ] **Step 3:** Commit:
```bash
git add index.html
git commit -m "feat: add Custo Gerações KPI card to dashboard"
```

---

### Task 4: Add table column header "Custo Gerações"

**File:** `index.html`

- [ ] **Step 1:** In the `<thead>` block, add `<th>Custo Gerações</th>` between `<th>Faturado via Provador</th>` and `<th>Ações</th>`. Final order:
```
Cliente | Empresa | Plano | Valor Mensal | Último Pagamento | Status | Faturado via Provador | Custo Gerações | Ações
```

- [ ] **Step 2:** Commit:
```bash
git add index.html
git commit -m "feat: add Custo Gerações column header to client table"
```

---

### Task 5: Update render functions for new cache shape + new card + new column

**File:** `script.js`

- [ ] **Step 1:** Update `renderFaturamentoCard` to also render the custo card. Replace the current function body with:

```js
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
```

- [ ] **Step 2:** Update `renderTable` to read the new cache shape. Find the lines:

```js
    const fatCache = readFaturamentoCache();
    const fatPorEmail = (fatCache && fatCache.porEmail) || {};
```

(no change needed — `fatPorEmail` still holds per-email entries; just the values are now objects).

Then find the per-row faturamento population and update to handle the new shape. Replace:

```js
        const fatValue = fatPorEmail[client.email];
        const fatCell = tr.querySelector('.cell-faturamento');
        if (fatCell) {
            fatCell.textContent = (typeof fatValue === 'number') ? formatBRL(fatValue) : '—';
            fatCell.style.color = (typeof fatValue === 'number') ? 'var(--accent)' : 'var(--text-dim)';
            fatCell.style.fontWeight = '600';
        }
```

with:

```js
        const fatEntry = fatPorEmail[client.email];
        const fatValue = (fatEntry && typeof fatEntry === 'object') ? fatEntry.faturamento : (typeof fatEntry === 'number' ? fatEntry : undefined);
        const custoValue = (fatEntry && typeof fatEntry === 'object') ? fatEntry.custo : undefined;

        const fatCell = tr.querySelector('.cell-faturamento');
        if (fatCell) {
            fatCell.textContent = (typeof fatValue === 'number') ? formatBRL(fatValue) : '—';
            fatCell.style.color = (typeof fatValue === 'number') ? 'var(--accent)' : 'var(--text-dim)';
            fatCell.style.fontWeight = '600';
        }
        const custoCell = tr.querySelector('.cell-custo-geracoes');
        if (custoCell) {
            custoCell.textContent = (typeof custoValue === 'number') ? formatBRL(custoValue) : '—';
            custoCell.style.color = (typeof custoValue === 'number') ? '#ef4444' : 'var(--text-dim)';
            custoCell.style.fontWeight = '600';
        }
```

The fallback `typeof fatEntry === 'number'` handles old cache from the previous version.

- [ ] **Step 3:** Add the placeholder cell for custo in the `tr.innerHTML` template. Find the line:

```js
            <td class="cell-faturamento"></td>
```

Add immediately after:

```js
            <td class="cell-custo-geracoes"></td>
```

- [ ] **Step 4:** Commit:
```bash
git add script.js
git commit -m "feat: render custo geracoes in card and per-client column"
```

---

### Task 6: Push to git

- [ ] **Step 1:** Push all commits:
```bash
git push
```
