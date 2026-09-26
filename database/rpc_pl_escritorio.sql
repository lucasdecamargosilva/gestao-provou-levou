-- Escritório 3D (escritorio.html): todos os números da empresa numa chamada só.
-- SECURITY DEFINER porque junta tabelas com RLS diferentes; a trava é o e-mail do JWT
-- (mesma lista de admins das policies admins_read). Rodar como supabase_admin.
CREATE OR REPLACE FUNCTION public.pl_escritorio()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quem text := lower(coalesce(auth.jwt() ->> 'email', ''));
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  ini_mes date := date_trunc('month', hoje)::date;
  ini_mes_ant date := (date_trunc('month', hoje) - interval '1 month')::date;
  dia_do_mes int := extract(day FROM hoje)::int;
  r json;
BEGIN
  IF quem NOT IN ('lucasdecamargo2015@gmail.com', 'rafaelwassef@gmail.com') THEN
    RAISE EXCEPTION 'sem permissao' USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'gerado_em', now(),
    'financeiro', (
      SELECT json_build_object(
        'receita_mes', coalesce(sum(valor) FILTER (WHERE data_pagamento >= ini_mes), 0),
        -- mesmo recorte de dias do mês anterior (compara maçã com maçã)
        'receita_mes_ant_ate_hoje', coalesce(sum(valor) FILTER (WHERE data_pagamento >= ini_mes_ant AND data_pagamento < ini_mes_ant + dia_do_mes), 0),
        'receita_mes_ant', coalesce(sum(valor) FILTER (WHERE data_pagamento >= ini_mes_ant AND data_pagamento < ini_mes), 0),
        'recebido_30d', coalesce(sum(valor) FILTER (WHERE data_pagamento > hoje - 30), 0),
        'pagamentos_mes', count(*) FILTER (WHERE data_pagamento >= ini_mes),
        'por_dia', (SELECT coalesce(json_agg(json_build_object('d', d, 'v', v) ORDER BY d), '[]'::json) FROM (
            SELECT data_pagamento AS d, sum(valor) AS v FROM pagamentos_clientes
            WHERE data_pagamento > hoje - 30 GROUP BY 1) x),
        'lucro_ultimo_mes', (SELECT lucro_negocio FROM fluxo_caixa_mensal WHERE mes < to_char(hoje, 'YYYY-MM') ORDER BY mes DESC LIMIT 1),
        'meta_mrr', (SELECT meta_mrr FROM crm_metas WHERE periodo = to_char(hoje, 'YYYY-MM') LIMIT 1),
        'meta_recebimentos', (SELECT meta_recebimentos FROM crm_metas WHERE periodo = to_char(hoje, 'YYYY-MM') LIMIT 1)
      ) FROM pagamentos_clientes
    ),
    'provador', (
      SELECT json_build_object(
        'provas_hoje', count(*) FILTER (WHERE created_at >= hoje::timestamp AT TIME ZONE 'America/Sao_Paulo'),
        'provas_7d', count(*) FILTER (WHERE created_at > now() - interval '7 days'),
        'provas_30d', count(*) FILTER (WHERE created_at > now() - interval '30 days'),
        'provas_30d_ant', count(*) FILTER (WHERE created_at <= now() - interval '30 days' AND created_at > now() - interval '60 days'),
        'lojas_com_prova_7d', count(DISTINCT regexp_replace(lower(origin), '^https?://(www\.)?', '')) FILTER (WHERE created_at > now() - interval '7 days'),
        'custo_30d', round(0.25 * count(*) FILTER (WHERE created_at > now() - interval '30 days'), 2)
      ) FROM geracoes_provou_levou WHERE created_at > now() - interval '60 days'
    ),
    'marketing', json_build_object(
      'seo', (
        SELECT json_build_object(
          'cliques_28d', coalesce(sum(clicks) FILTER (WHERE date > hoje - 28), 0),
          'cliques_28d_ant', coalesce(sum(clicks) FILTER (WHERE date <= hoje - 28 AND date > hoje - 56), 0),
          'impressoes_28d', coalesce(sum(impressions) FILTER (WHERE date > hoje - 28), 0),
          'posicao_media', round(avg(avg_position) FILTER (WHERE date > hoje - 28), 1),
          'ultimo_dia', max(date)
        ) FROM gsc_daily WHERE date > hoje - 56
      ),
      'ads', (
        SELECT json_build_object(
          'gasto_7d', coalesce(sum(spend) FILTER (WHERE dia > hoje - 7), 0),
          'gasto_7d_ant', coalesce(sum(spend) FILTER (WHERE dia <= hoje - 7 AND dia > hoje - 14), 0),
          'leads_7d', coalesce(sum(leads) FILTER (WHERE dia > hoje - 7), 0),
          'leads_7d_ant', coalesce(sum(leads) FILTER (WHERE dia <= hoje - 7 AND dia > hoje - 14), 0),
          'cliques_7d', coalesce(sum(link_clicks) FILTER (WHERE dia > hoje - 7), 0)
        ) FROM meta_ads_insights WHERE dia > hoje - 14
      )
    ),
    'comercial', json_build_object(
      'leads_30d', (SELECT count(DISTINCT lead_phone) FROM bot_leads_conversa WHERE created_at > now() - interval '30 days'),
      'leads_30d_ant', (SELECT count(DISTINCT lead_phone) FROM bot_leads_conversa WHERE created_at <= now() - interval '30 days' AND created_at > now() - interval '60 days'),
      'em_teste', (SELECT count(*) FROM provou_levou_stores WHERE status ILIKE 'teste%'),
      'testes_novos_30d', (SELECT count(*) FROM provou_levou_stores WHERE status ILIKE 'teste%' AND created_at > now() - interval '30 days'),
      'clientes_novos_30d', (SELECT count(*) FROM (SELECT store_id, min(data_pagamento) p FROM pagamentos_clientes GROUP BY 1) f WHERE p > hoje - 30),
      'clientes_novos_30d_ant', (SELECT count(*) FROM (SELECT store_id, min(data_pagamento) p FROM pagamentos_clientes GROUP BY 1) f WHERE p <= hoje - 30 AND p > hoje - 60)
    ),
    'atendimento', json_build_object(
      'lojas_ativas', (SELECT count(*) FROM provou_levou_stores WHERE status = 'Ativo'),
      'lojas_inativas', (SELECT count(*) FROM provou_levou_stores WHERE status = 'Inativo'),
      'disparos_7d', (SELECT count(*) FROM whatsapp_send_log WHERE sent_at > now() - interval '7 days' AND status IN ('sent','delivered','read')),
      'entregues_7d', (SELECT count(*) FROM whatsapp_send_log WHERE sent_at > now() - interval '7 days' AND status IN ('delivered','read')),
      'respostas_7d', (SELECT count(*) FROM whatsapp_mensagens WHERE created_at > now() - interval '7 days' AND direction IN ('in','inbound'))
    )
  ) INTO r;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.pl_escritorio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pl_escritorio() TO authenticated;
