-- Metas comerciais mensais do painel interno de gestão.
create table if not exists public.crm_metas (
    periodo             text primary key check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    meta_clientes       integer not null default 0 check (meta_clientes >= 0),
    meta_mrr            numeric(12,2) not null default 0 check (meta_mrr >= 0),
    meta_recebimentos   numeric(12,2) not null default 0 check (meta_recebimentos >= 0),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

alter table public.crm_metas enable row level security;

drop policy if exists "gestao le metas" on public.crm_metas;
drop policy if exists "gestao insere metas" on public.crm_metas;
drop policy if exists "gestao atualiza metas" on public.crm_metas;

create policy "gestao le metas"
  on public.crm_metas for select to authenticated using (true);

create policy "gestao insere metas"
  on public.crm_metas for insert to authenticated with check (true);

create policy "gestao atualiza metas"
  on public.crm_metas for update to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
