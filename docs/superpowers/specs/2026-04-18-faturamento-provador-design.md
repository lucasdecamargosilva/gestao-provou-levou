# Faturamento via Provador no Dashboard de Gestão

## Objetivo

Adicionar visualização do faturamento pós-prova (orders feitos depois que o cliente usou o provador) gerado por todos os clientes Provou Levou, exibido no dashboard interno de gestão (`provou-levou-gestao`).

Hoje o dashboard só mostra MRR (o que os lojistas pagam para Provou Levou). A nova feature mostra **GMV pós-prova** — quanto cada loja efetivamente faturou através do provador.

## Escopo

- Card de KPI agregado no topo do dashboard.
- Coluna nova na tabela de clientes com o valor por cliente.
- Cache em `localStorage` com botão manual de atualização.
- **Não** inclui: faturamento total da loja, faturamento de quem provou (sem filtro pós-prova), gráficos, histórico mensal.

## Mudanças no UI (`index.html`)

### Card de KPI
Posição: dentro do `stats-grid` existente (linha 92), virando uma 5ª coluna.

```html
<div class="stat-card glass">
    <div class="stat-label">
        Faturamento via Provador
        <button id="btn-refresh-faturamento" class="btn-icon">
            <i class="fas fa-sync-alt"></i>
        </button>
    </div>
    <div id="stat-faturamento-provador" class="stat-value">R$ 0</div>
    <div id="stat-faturamento-updated" class="stat-trend trend-up">
        <i class="fas fa-clock"></i> Nunca calculado
    </div>
</div>
```

Mudar `grid-template-columns: repeat(4, 1fr)` para `repeat(5, 1fr)`.

### Coluna na tabela
Posição: entre "Status" e "Ações" no `<thead>` e nas rows renderizadas em `script.js:587`.

```html
<th>Faturado via Provador</th>
```

Conteúdo da célula: `R$ X.XXX,XX` se cliente tem mapeamento + dado calculado; `—` caso contrário.

## Pipeline de cálculo (`script.js`)

Função nova: `computeFaturamentoPosProva()` em `script.js`.

### Passo 1 — Buscar configs de lojistas
Query única em `lojistas` filtrando `tabela_pedidos != ''`. Campos necessários:

```
email, origem, tabela_pedidos,
campo_telefone_pedido, campo_total_pedido,
campo_data_pedido, campo_status_pedido,
valores_status_pago
```

Lojistas com `tabela_pedidos` vazio (Buda, Trendup, Closet Digital, Muse) ficam fora — eles aparecem na tabela como "—".

### Passo 2 — Mapear gestão → lojistas
Para cada cliente em `clients` (já carregado de `provou_levou_stores`), procurar lojista por `email` (case-insensitive). Cliente sem match: pula.

### Passo 3 — Carregar todas as provas (paginadas)
Query `geracoes_provou_levou` com `select=telefone_cliente, created_at, origin`, paginada em 1000/página até esgotar (Regra 1 do skill `regras-dash-provou-levou`). Ordenar por `created_at desc` para paginação estável (Regra 6).

### Passo 4 — Por lojista, calcular faturamento pós-prova
Para cada lojista mapeado:

1. **Filtrar provas dessa loja**: normalizar `origin` (remover `https?://`, `www.`, trailing `/`) e comparar com `lojista.origem` normalizado. `String.includes` em ambas as direções (algumas origens estão como `https://www.coletivoemaus.com`, outras como `cacifebrand.com.br`).

2. **Construir mapas por telefone normalizado**:
   - `minDateMap[ph]` = data mais antiga de prova (`created_at.slice(0,10)`)
   - `minTsMap[ph]` = timestamp mais antigo de prova
   - `provaPhones` = Set de telefones únicos
   - `earliestProvaDate` = menor data global da loja

3. **Buscar pedidos pagos paginados**:
   - Tabela: `lojista.tabela_pedidos`
   - Select: `${campo_telefone_pedido}, ${campo_total_pedido}, ${campo_data_pedido}, ${campo_status_pedido}`
   - Filtros: `campo_status_pedido=in.(...valores_status_pago)` e `campo_data_pedido (ou created_at se ausente) >= earliestProvaDate` (Regra 2)
   - Paginar 1000/página (Regra 1)

4. **Somar pós-prova**: para cada pedido, normalizar telefone, verificar se está em `provaPhones`, aplicar `isOrderAfterProva(orderTs, ph)` (Regra 4 — comparar timestamp se tem hora real, senão data), somar `valor` se passar.

### Passo 5 — Retornar resultado
```js
{
    updatedAt: '2026-04-18T...',
    totalGeral: 81664.29,
    porEmail: {
        'cacifebrand@outlook.com': 41743.60,
        'sac@usemarianacardoso.com.br': 21089.37,
        ...
    }
}
```

### Helpers reutilizáveis
- `normalize(p)` — telefone, sem filtro de comprimento (Regra 3)
- `normalizeDomain(o)` — remove protocol/www/trailing slash
- `isOrderAfterProva(orderTs, ph, minDateMap, minTsMap)` — copiado de `login/index.html:2297`

## Cache em localStorage

**Key**: `faturamentoPosProvaCache`

**Valor**:
```json
{
    "updatedAt": "2026-04-18T15:30:00.000Z",
    "totalGeral": 81664.29,
    "porEmail": { "email1": 41743.60, ... }
}
```

**Comportamento**:
- No load do dashboard: ler cache → renderizar imediatamente (card + coluna).
- Sem cache: card mostra "Clique para calcular", coluna mostra "—".
- Botão refresh: dispara `computeFaturamentoPosProva()`, mostra spinner no ícone, ao terminar atualiza UI + grava cache.

**Sem TTL automático** — refresh é manual, conforme combinado.

## Texto "atualizado há X"

Helper `formatRelativeTime(iso)`:
- `< 1 min` → "agora"
- `< 60 min` → "X min atrás"
- `< 24 h` → "X h atrás"
- `>= 24 h` → "X dias atrás"

## Tratamento de erros

- Se query de `lojistas` falha: card mostra erro, computação aborta.
- Se uma loja específica falha (tabela inexistente, campo inválido): pula essa loja, soma o resto, loga warning no console.
- `valores_status_pago` vazio ou null: pula a loja (não dá pra filtrar pedidos pagos sem essa lista).

## Sanity check

Resultado esperado em 2026-04-18 (do skill `regras-dash-provou-levou`):

| Loja | Esperado |
|---|---|
| Cacifé | R$ 41.743,60 |
| Mariana | R$ 21.089,37 |
| Calmo Store | R$ 11.113,38 |
| Califa | R$ 5.961,21 |
| Dope Tees | R$ 2.035,36 |
| Emaus | R$ 764,21 |
| Next Sport | R$ 294,16 |
| Midas Touch | R$ 0,00 |
| **TOTAL** | **R$ 83.001,29** |

Se divergir >5%, revisar regras (paginação, normalização de telefone, comparação de timestamp).

## Arquivos modificados

- `index.html` — adicionar card e coluna
- `script.js` — `computeFaturamentoPosProva()`, helpers, integração com `loadClients()`/`updateStats()`/`renderClientTable()`
- `style.css` — estilo do `.btn-icon` no card (se necessário)

## Não faz parte

- View dedicada com gráficos
- Faturamento histórico por mês
- Drill-down por cliente (lista de pedidos)
- Notificação push quando faturamento muda
- Job automático de recálculo
