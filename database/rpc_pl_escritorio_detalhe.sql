-- Escritório 3D: "afunilar" o dado. Área -> tópico -> lista; loja -> ficha da loja.
-- Mesma trava de admin da pl_escritorio(). Rodar como supabase_admin (via /pg/query).
CREATE OR REPLACE FUNCTION public.pl_host(u text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  -- catálogo mora em provoulevou.com.br/catalogo/<slug>: mantém o slug pra não virar tudo "provoulevou.com.br"
  SELECT CASE WHEN x ~ '^provoulevou\.com\.br/catalogo/[^/?#]+' THEN substring(x from '^provoulevou\.com\.br/(catalogo/[^/?#]+)')
              ELSE regexp_replace(x, '[/?#].*$', '') END
  FROM (SELECT lower(regexp_replace(coalesce(u,''), '^https?://(www\.)?', '')) x) t
$$;

CREATE OR REPLACE FUNCTION public.pl_escritorio_detalhe(p_topico text)
RETURNS json
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  quem text := lower(coalesce(auth.jwt() ->> 'email', ''));
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  ini_mes date := date_trunc('month', hoje)::date;
  r json;
BEGIN
  IF quem NOT IN ('lucasdecamargo2015@gmail.com', 'rafaelwassef@gmail.com') THEN
    RAISE EXCEPTION 'sem permissao' USING ERRCODE = '42501';
  END IF;

  -- provas por loja (30d), reaproveitado em vários tópicos
  CREATE TEMP TABLE IF NOT EXISTS _pv ON COMMIT DROP AS
    SELECT pl_host(origin) h,
           count(*) FILTER (WHERE created_at > now() - interval '30 days') p30,
           count(*) FILTER (WHERE created_at > now() - interval '7 days') p7,
           count(*) FILTER (WHERE created_at >= hoje::timestamp AT TIME ZONE 'America/Sao_Paulo') phoje,
           max(created_at) ultima
    FROM geracoes_provou_levou WHERE created_at > now() - interval '30 days' GROUP BY 1;

  IF p_topico = 'fin_pagamentos' THEN
    SELECT json_agg(x ORDER BY x.data DESC) INTO r FROM (
      SELECT p.data_pagamento AS data, p.valor, p.tipo, s.id AS loja_id, pl_host(s.domain) AS loja, s.plan AS plano
      FROM pagamentos_clientes p LEFT JOIN provou_levou_stores s ON s.id = p.store_id
      WHERE p.data_pagamento >= ini_mes) x;
  ELSIF p_topico = 'fin_meses' THEN
    SELECT json_agg(x ORDER BY x.mes) INTO r FROM (
      SELECT to_char(data_pagamento, 'YYYY-MM') mes, sum(valor) total, count(DISTINCT store_id) clientes
      FROM pagamentos_clientes WHERE data_pagamento > hoje - 365 GROUP BY 1) x;
  ELSIF p_topico = 'fin_fluxo' THEN
    SELECT json_agg(x ORDER BY x.mes DESC) INTO r FROM (
      SELECT mes, receita_bruta, custo_provas, custo_ferramentas, tarifas, lucro_negocio, saldo_final, fechado
      FROM fluxo_caixa_mensal ORDER BY mes DESC LIMIT 12) x;
  ELSIF p_topico = 'fin_atrasados' THEN
    SELECT json_agg(x ORDER BY x.dias DESC) INTO r FROM (
      SELECT s.id AS loja_id, pl_host(s.domain) loja, s.plan plano, s.last_payment ultimo_pagamento,
             (hoje - nullif(s.last_payment,'')::date) dias, coalesce(pv.p7, 0) provas_7d
      FROM provou_levou_stores s LEFT JOIN _pv pv ON pv.h = pl_host(s.domain)
      WHERE s.status = 'Ativo' AND nullif(s.last_payment,'') IS NOT NULL AND nullif(s.last_payment,'')::date < hoje - 31) x;

  ELSIF p_topico = 'prov_lojas' THEN
    SELECT json_agg(x ORDER BY x.provas_30d DESC) INTO r FROM (
      SELECT s.id AS loja_id, pv.h AS loja, pv.p30 provas_30d, pv.p7 provas_7d, pv.phoje provas_hoje,
             round(pv.p30 * 0.25, 2) custo_30d, s.plan plano, s.status
      FROM _pv pv LEFT JOIN LATERAL (SELECT * FROM provou_levou_stores s WHERE pl_host(s.domain) = pv.h ORDER BY (s.status = 'Ativo') DESC LIMIT 1) s ON true) x;
  ELSIF p_topico = 'prov_dias' THEN
    SELECT json_agg(x ORDER BY x.dia) INTO r FROM (
      SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date dia, count(*) provas
      FROM geracoes_provou_levou WHERE created_at > now() - interval '30 days' GROUP BY 1) x;

  ELSIF p_topico = 'mk_campanhas' THEN
    SELECT json_agg(x ORDER BY x.gasto DESC) INTO r FROM (
      SELECT campaign_name campanha, sum(spend) gasto, sum(leads) leads, sum(link_clicks) cliques,
             CASE WHEN sum(leads) > 0 THEN round(sum(spend) / sum(leads), 2) END custo_por_lead,
             max(dia) ultimo_dia
      FROM meta_ads_insights WHERE dia > hoje - 30 GROUP BY 1) x;
  ELSIF p_topico = 'mk_consultas' THEN
    SELECT json_agg(x) INTO r FROM (SELECT query consulta, clicks cliques, impressions impressoes, avg_position posicao FROM gsc_top_queries ORDER BY clicks DESC, impressions DESC LIMIT 40) x;
  ELSIF p_topico = 'mk_paginas' THEN
    SELECT json_agg(x) INTO r FROM (SELECT page pagina, clicks cliques, impressions impressoes, avg_position posicao FROM gsc_top_pages ORDER BY clicks DESC, impressions DESC LIMIT 40) x;
  ELSIF p_topico = 'mk_seo_dias' THEN
    SELECT json_agg(x ORDER BY x.dia) INTO r FROM (SELECT date dia, clicks cliques, impressions impressoes FROM gsc_daily WHERE date > hoje - 90) x;

  ELSIF p_topico = 'com_testes' THEN
    SELECT json_agg(x ORDER BY x.provas_7d DESC, x.dias) INTO r FROM (
      SELECT s.id AS loja_id, pl_host(s.domain) loja, s.created_at::date inicio, (hoje - s.created_at::date) dias,
             coalesce(pv.p7, 0) provas_7d, coalesce(pv.p30, 0) provas_30d, s.platform plataforma
      FROM provou_levou_stores s LEFT JOIN _pv pv ON pv.h = pl_host(s.domain)
      WHERE s.status ILIKE 'teste%') x;
  ELSIF p_topico = 'com_novos' THEN
    SELECT json_agg(x ORDER BY x.primeiro_pagamento DESC) INTO r FROM (
      SELECT s.id AS loja_id, pl_host(s.domain) loja, f.p primeiro_pagamento, s.plan plano, f.total pago_ate_hoje
      FROM (SELECT store_id, min(data_pagamento) p, sum(valor) total FROM pagamentos_clientes GROUP BY 1) f
      JOIN provou_levou_stores s ON s.id = f.store_id WHERE f.p > hoje - 90) x;
  ELSIF p_topico = 'com_leads_dias' THEN
    SELECT json_agg(x ORDER BY x.dia) INTO r FROM (
      SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date dia, count(DISTINCT lead_phone) leads
      FROM bot_leads_conversa WHERE created_at > now() - interval '30 days' GROUP BY 1) x;

  ELSIF p_topico = 'at_ativas' THEN
    SELECT json_agg(x ORDER BY x.provas_7d DESC) INTO r FROM (
      SELECT s.id AS loja_id, pl_host(s.domain) loja, s.plan plano, s.last_payment ultimo_pagamento,
             coalesce(pv.p7, 0) provas_7d, pv.ultima ultima_prova
      FROM provou_levou_stores s LEFT JOIN _pv pv ON pv.h = pl_host(s.domain) WHERE s.status = 'Ativo') x;
  ELSIF p_topico = 'at_risco' THEN
    SELECT json_agg(x ORDER BY x.provas_7d, x.loja) INTO r FROM (
      SELECT s.id AS loja_id, pl_host(s.domain) loja, s.plan plano, coalesce(pv.p7, 0) provas_7d, pv.ultima ultima_prova,
             CASE WHEN coalesce(pv.p7, 0) = 0 THEN 'sem provas na semana' ELSE 'pagamento atrasado' END motivo
      FROM provou_levou_stores s LEFT JOIN _pv pv ON pv.h = pl_host(s.domain)
      WHERE s.status = 'Ativo' AND (coalesce(pv.p7, 0) = 0 OR nullif(s.last_payment,'')::date < hoje - 35)) x;
  ELSIF p_topico = 'at_saidas' THEN
    SELECT json_agg(x ORDER BY x.atualizado DESC) INTO r FROM (
      SELECT s.id AS loja_id, pl_host(s.domain) loja, s.plan plano, s.last_payment ultimo_pagamento, s.updated_at::date atualizado
      FROM provou_levou_stores s WHERE s.status = 'Inativo') x;
  ELSIF p_topico = 'at_whatsapp' THEN
    SELECT json_agg(x ORDER BY x.enviados DESC) INTO r FROM (
      SELECT l.email, count(*) FILTER (WHERE l.status IN ('sent','delivered','read')) enviados,
             count(*) FILTER (WHERE l.status IN ('delivered','read')) entregues,
             count(*) FILTER (WHERE l.status = 'read') lidos,
             count(*) FILTER (WHERE l.status = 'failed') falharam
      FROM whatsapp_send_log l WHERE l.sent_at > now() - interval '7 days' GROUP BY 1) x;
  ELSE
    RAISE EXCEPTION 'topico desconhecido: %', p_topico;
  END IF;
  RETURN coalesce(r, '[]'::json);
END;
$$;

-- Ficha de uma loja (último nível do funil)
CREATE OR REPLACE FUNCTION public.pl_escritorio_loja(p_loja_id uuid)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  quem text := lower(coalesce(auth.jwt() ->> 'email', ''));
  s record; r json;
BEGIN
  IF quem NOT IN ('lucasdecamargo2015@gmail.com', 'rafaelwassef@gmail.com') THEN
    RAISE EXCEPTION 'sem permissao' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM provou_levou_stores WHERE id = p_loja_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT json_build_object(
    'loja', pl_host(s.domain), 'contato', s.name, 'email', s.email, 'plano', s.plan, 'status', s.status,
    'plataforma', s.platform, 'categoria', s.categoria, 'desde', s.created_at::date, 'ultimo_pagamento', s.last_payment,
    'valor_personalizado', s.valor_personalizado, 'fotos_extras', s.fotos_extras,
    'pagamentos', (SELECT coalesce(json_agg(json_build_object('data', data_pagamento, 'valor', valor, 'tipo', tipo) ORDER BY data_pagamento DESC), '[]'::json) FROM pagamentos_clientes WHERE store_id = s.id),
    'provas_dias', (SELECT coalesce(json_agg(json_build_object('dia', d, 'provas', n) ORDER BY d), '[]'::json) FROM (
        SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date d, count(*) n FROM geracoes_provou_levou
        WHERE created_at > now() - interval '30 days' AND pl_host(origin) = pl_host(s.domain) GROUP BY 1) x),
    'provas_30d', (SELECT count(*) FROM geracoes_provou_levou WHERE created_at > now() - interval '30 days' AND pl_host(origin) = pl_host(s.domain))
  ) INTO r;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.pl_escritorio_detalhe(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pl_escritorio_loja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pl_escritorio_detalhe(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pl_escritorio_loja(uuid) TO authenticated;
