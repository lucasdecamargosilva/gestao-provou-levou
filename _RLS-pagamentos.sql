-- Painel de gestão: permitir que o admin logado leia e lance pagamentos.
-- Rodar no SQL Editor do Supabase (self-hosted). Seguro: só vale para
-- usuários autenticados, a chave anon pública continua sem acesso.

alter table public.pagamentos_clientes enable row level security;

drop policy if exists "gestao le pagamentos"      on public.pagamentos_clientes;
drop policy if exists "gestao insere pagamentos"  on public.pagamentos_clientes;
drop policy if exists "gestao atualiza pagamentos" on public.pagamentos_clientes;
drop policy if exists "gestao apaga pagamentos"   on public.pagamentos_clientes;

create policy "gestao le pagamentos"
  on public.pagamentos_clientes for select to authenticated using (true);

create policy "gestao insere pagamentos"
  on public.pagamentos_clientes for insert to authenticated with check (true);

create policy "gestao atualiza pagamentos"
  on public.pagamentos_clientes for update to authenticated using (true) with check (true);

create policy "gestao apaga pagamentos"
  on public.pagamentos_clientes for delete to authenticated using (true);

-- O painel também grava o último pagamento na ficha da loja
drop policy if exists "gestao le lojas"      on public.provou_levou_stores;
drop policy if exists "gestao atualiza lojas" on public.provou_levou_stores;

create policy "gestao le lojas"
  on public.provou_levou_stores for select to authenticated using (true);

create policy "gestao atualiza lojas"
  on public.provou_levou_stores for update to authenticated using (true) with check (true);

-- Conferir o resultado
select tablename, policyname, cmd, roles
from pg_policies
where tablename in ('pagamentos_clientes','provou_levou_stores')
order by tablename, cmd;
