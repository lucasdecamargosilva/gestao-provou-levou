# Tamagotchi "Provinha" — Design Spec

## Resumo

Mascote interativo no dashboard de gestao que evolui visualmente com base em metricas reais do negocio. Dois eixos independentes controlam a aparencia: **Crescimento** (corpo) e **Receita** (roupa).

## Localizacao

Secao dedicada abaixo dos 4 KPI cards existentes (Active Clients, MRR, Potential Revenue, Growth %), acima dos Package cards. Card central com fundo glassmorphism seguindo o design system existente.

## Eixos

### Crescimento → Corpo do Provinha

Calculado a partir de: total de lojistas ativos na tabela `provou_levou_stores` (status = "Ativo") + dados de afiliados do Supabase.

| Nivel | Lojistas ativos | Visual |
|-------|----------------|--------|
| 1 | 0-3 | Ovo com olhinhos |
| 2 | 4-10 | Mini cabide com rosto fofo |
| 3 | 11-25 | Cabide medio com bracinhos |
| 4 | 26-50 | Manequim completo, pose confiante |
| 5 | 51+ | Manequim dourado, brilhando |

### Receita → Roupa do Provinha

Calculado a partir de: MRR (soma dos valores mensais de lojistas ativos). Planos: Starter R$97, Inicial R$197, Medio R$397, Premium R$797.

| Nivel | MRR (R$) | Visual |
|-------|----------|--------|
| 1 | 0-200 | Pelado, expressao envergonhada |
| 2 | 201-1.000 | Camiseta basica |
| 3 | 1.001-5.000 | Roupa casual (calca + camisa) |
| 4 | 5.001-15.000 | Roupa elegante (blazer + acessorios) |
| 5 | 15.001+ | Terno premium com brilho dourado |

### Estado atual (abril 2026)

- 6 lojistas ativos → Nivel 2 (Mini cabide)
- MRR R$394 → Nivel 2 (Camiseta basica)

## Layout do Card

```
+----------------------------------------------------------+
|                    Provinha Status                         |
|                                                          |
|              [Ilustracao SVG do Provinha]                 |
|              corpo nivel X + roupa nivel Y               |
|                                                          |
|              "Mini Cabide de Camiseta"                   |
|                  (nome do estagio)                        |
|                                                          |
|  Crescimento ████████░░░░░░░░  6/11 lojistas  (Nv.2)   |
|  Receita     ████░░░░░░░░░░░░  R$394/R$1k    (Nv.2)   |
|                                                          |
|  +------------+  +------------+  +------------+          |
|  | Lojistas   |  | MRR        |  | Afiliados  |          |
|  | 6 ativos   |  | R$ 394     |  | X ativos   |          |
|  +------------+  +------------+  +------------+          |
+----------------------------------------------------------+
```

## Componentes Visuais (SVG)

O Provinha e composto por camadas SVG sobrepostas:

1. **Camada base (corpo)** — 5 variantes SVG inline, uma por nivel de crescimento
2. **Camada roupa** — 5 variantes SVG inline, uma por nivel de receita
3. **Olhos e expressao** — sempre presente, expressao muda conforme combinacao

Total: 10 assets SVG (5 corpos + 5 roupas), combinaveis entre si.

Cada SVG e inline no HTML (sem arquivos externos), desenhado com formas simples e cores do design system (--primary #7c3aed, --secondary gradients).

## Barras de Progresso

Duas barras horizontais abaixo do Provinha:

- **Crescimento** (roxa, var(--primary)): preenchimento proporcional dentro da faixa atual. Ex: 6 lojistas no nivel 2 (4-10) = 33% preenchido. Mostra "6/11 lojistas" e "(Nv.2)".
- **Receita** (verde, #10b981): preenchimento proporcional dentro da faixa atual. Ex: R$394 no nivel 2 (201-1000) = ~24% preenchido. Mostra "R$394/R$1k" e "(Nv.2)".

## Mini Indicadores

3 mini cards abaixo das barras:
- Lojistas ativos (contagem de status "Ativo" em provou_levou_stores)
- MRR (soma calculada dos planos ativos)
- Afiliados ativos (contagem da tabela de afiliados)

## Fonte de Dados

### Tabelas consultadas

1. **`provou_levou_stores`** — ja carregada pelo dashboard
   - Contagem de lojistas por status
   - Soma de MRR (plan → valor fixo do plano)
   
2. **Tabela de afiliados** (nome a confirmar no Supabase)
   - Contagem de afiliados ativos

### Calculo

Toda logica roda no frontend (script.js), sem tabela nova no Supabase. Os dados ja sao carregados pelo `loadClients()` existente — o Tamagotchi usa os mesmos dados.

```javascript
// Faixas de crescimento
const GROWTH_LEVELS = [
  { min: 0, max: 3, name: 'Ovo', level: 1 },
  { min: 4, max: 10, name: 'Mini Cabide', level: 2 },
  { min: 11, max: 25, name: 'Cabide Medio', level: 3 },
  { min: 26, max: 50, name: 'Manequim', level: 4 },
  { min: 51, max: Infinity, name: 'Manequim Premium', level: 5 },
];

// Faixas de receita
const REVENUE_LEVELS = [
  { min: 0, max: 200, name: 'Pelado', level: 1 },
  { min: 201, max: 1000, name: 'Camiseta Basica', level: 2 },
  { min: 1001, max: 5000, name: 'Roupa Casual', level: 3 },
  { min: 5001, max: 15000, name: 'Roupa Elegante', level: 4 },
  { min: 15001, max: Infinity, name: 'Terno Dourado', level: 5 },
];
```

## Implementacao

### Arquivos modificados

1. **`index.html`** — adicionar secao do Tamagotchi entre KPI stats e package cards
2. **`style.css`** — estilos do card, barras de progresso, SVGs
3. **`script.js`** — funcoes de calculo de nivel e renderizacao do Provinha

### Sem dependencias novas

- SVGs inline (sem biblioteca de ilustracao)
- CSS animations para transicoes de nivel
- Nenhuma lib externa alem das ja existentes (Supabase SDK)

## Interacoes

- **Hover** no Provinha mostra tooltip com detalhes do estagio
- **Animacao sutil** — Provinha balanca levemente (CSS animation idle)
- **Transicao de nivel** — quando muda de nivel, breve animacao de "brilho" ou "pulo"

## Combinacoes de Nome

O nome exibido combina corpo + roupa:
- "Ovo Pelado" (1+1)
- "Mini Cabide de Camiseta" (2+2) ← estado atual
- "Manequim Elegante" (4+4)
- "Manequim Premium Dourado" (5+5)
- "Ovo de Camiseta" (1+2) — crescimento baixo, receita ok
- "Manequim Pelado" (4+1) — muito lojista, pouca receita
