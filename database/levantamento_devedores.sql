-- Levantamento de devedores (Provou Levou). Rodar no SQL Editor do Supabase.
-- Mesma regra da aba "Inadimplentes" do painel: cliente pagante (status que não
-- seja Inativo, Teste Gratuito ou Permuta) cuja próxima mensalidade
-- (último pagamento + 1 mês) já venceu. O valor devido é a mensalidade do
-- cliente: valor personalizado quando existir, senão o preço do plano.
-- O SQL Editor exibe só o resultado do último comando — rode um bloco por vez.

-- ── Bloco 1: resumo — quantas pessoas estão devendo e quanto ─────────────────
with devedores as (
    select
        s.name,
        s.company,
        coalesce(s.plano_personalizado, s.plan, 'Starter') as plano,
        nullif(s.last_payment::text, '-')::date            as ultimo_pagamento,
        (nullif(s.last_payment::text, '-')::date + interval '1 month')::date as venceu_em,
        current_date - (nullif(s.last_payment::text, '-')::date + interval '1 month')::date as dias_em_atraso,
        coalesce(
            nullif(s.valor_personalizado, 0),
            case coalesce(s.plan, 'Starter')
                when 'Starter'     then 97
                when 'Inicial'     then 197
                when 'Médio'       then 397
                when 'Premium'     then 797
                when 'Ultra Power' then 2200
                when 'Essencial'   then 97
                when 'Crescimento' then 147
                when 'Acelerador'  then 347
                when 'Performance' then 547
                when 'Escala'      then 997
                else 0
            end
        )::numeric as mensalidade
    from public.provou_levou_stores s
    where coalesce(s.status, 'Ativo') not in ('Inativo', 'Teste Gratuito', 'Permuta')
      and nullif(s.last_payment::text, '-') is not null
      and (nullif(s.last_payment::text, '-')::date + interval '1 month')::date < current_date
)
select
    count(*)                          as clientes_devendo,
    to_char(sum(mensalidade), 'FM999G999D00') as total_devido_reais
from devedores;

-- ── Bloco 2: detalhe — quem está devendo, desde quando e quanto ──────────────
with devedores as (
    select
        s.name,
        s.company,
        coalesce(s.plano_personalizado, s.plan, 'Starter') as plano,
        nullif(s.last_payment::text, '-')::date            as ultimo_pagamento,
        (nullif(s.last_payment::text, '-')::date + interval '1 month')::date as venceu_em,
        current_date - (nullif(s.last_payment::text, '-')::date + interval '1 month')::date as dias_em_atraso,
        coalesce(
            nullif(s.valor_personalizado, 0),
            case coalesce(s.plan, 'Starter')
                when 'Starter'     then 97
                when 'Inicial'     then 197
                when 'Médio'       then 397
                when 'Premium'     then 797
                when 'Ultra Power' then 2200
                when 'Essencial'   then 97
                when 'Crescimento' then 147
                when 'Acelerador'  then 347
                when 'Performance' then 547
                when 'Escala'      then 997
                else 0
            end
        )::numeric as mensalidade
    from public.provou_levou_stores s
    where coalesce(s.status, 'Ativo') not in ('Inativo', 'Teste Gratuito', 'Permuta')
      and nullif(s.last_payment::text, '-') is not null
      and (nullif(s.last_payment::text, '-')::date + interval '1 month')::date < current_date
)
select name, company, plano, ultimo_pagamento, venceu_em, dias_em_atraso, mensalidade
from devedores
order by dias_em_atraso desc;
