-- Seu 2027 (mapa do ano, R$ 37, pagamento pela Kiwify). Rodar UMA vez no Supabase da escola (pode rodar de novo sem estragar nada).
-- Só o servidor mexe nesta tabela (chave de serviço): o RLS fica ligado e sem regra pública, então ninguém de fora lê.
create table if not exists public.seu2027_pedidos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,                       -- S27-XXXXXXX (vai pra Kiwify no ?sck= e volta no aviso de compra)
  status text not null default 'aguardando_pagamento', -- aguardando_pagamento | pago | falta_dados | gerando | pronto | erro | reembolsado
  nome text not null default '',
  email text not null default '',
  nascimento date,                                   -- pode ficar vazio quando a compra chega sem passar pelo nosso formulário
  foco text,                                         -- amor | trabalho | dinheiro | emocional | familia
  preco numeric(10,2) not null default 37,
  origem jsonb not null default '{}'::jsonb,         -- utm, fbp, fbc, ip, navegador (pra API de Conversões)
  kiwify_pedido text,                                -- order_id da Kiwify
  kiwify jsonb,                                      -- o último aviso da Kiwify (como chegou)
  produtos text[] not null default '{}',             -- nomes dos produtos do pedido na Kiwify (pra ver bump/upsell)
  forma_pagamento text,
  valor_pago numeric(10,2),
  pago_em timestamptz,
  numeros jsonb,                                     -- as contas (lib/seu2027/calculos.ts)
  textos jsonb,                                      -- o texto que a IA escreveu
  modelo text,
  uso_ia jsonb,
  gerando_desde timestamptz,
  pronto_em timestamptz,
  email_enviado_em timestamptz,
  capi_enviado_em timestamptz,
  audio_path text,                                   -- áudio narrado (fica pra depois)
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists seu2027_pedidos_email_idx on public.seu2027_pedidos (lower(email), criado_em desc);
create index if not exists seu2027_pedidos_kiwify_idx on public.seu2027_pedidos (kiwify_pedido);
create index if not exists seu2027_pedidos_status_idx on public.seu2027_pedidos (status, criado_em desc);
alter table public.seu2027_pedidos enable row level security;
