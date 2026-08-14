-- Campos novos na ficha do cliente (painel de gestão): forma de pagamento e observações.
-- Rodar no SQL Editor do Supabase.

alter table public.provou_levou_stores
  add column if not exists forma_pagamento text,
  add column if not exists observacao      text;

-- Só os três meios que a operação usa hoje. O NULL fica valendo para
-- "não informado", que é o estado de quase toda a base neste momento.
alter table public.provou_levou_stores
  drop constraint if exists provou_levou_stores_forma_pagamento_check;

alter table public.provou_levou_stores
  add constraint provou_levou_stores_forma_pagamento_check
  check (forma_pagamento is null or forma_pagamento in ('PIX', 'Cartão de Crédito', 'Boleto'));

-- Conferência:
--   select forma_pagamento, count(*)
--   from provou_levou_stores group by forma_pagamento order by 2 desc;
