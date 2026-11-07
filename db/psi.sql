-- ============================================================================================
-- PSI — o consultório da psicóloga (06/11/2026). Área separada dentro do sistema da escola (/psi).
--
-- COMO APLICAR: Supabase > SQL Editor > colar este arquivo inteiro > Run. Pode rodar mais de uma vez
-- (tudo usa "if not exists" / "or replace" / "drop ... if exists").
--
-- AS REGRAS DESTE BANCO
--  · Toda tabela começa com psi_ e tem owner_id = a dona (o login dela). A RLS só deixa cada login
--    ver e gravar as PRÓPRIAS linhas (owner_id = auth.uid()). Ninguém da escola enxerga nada daqui
--    pelo sistema; só quem tem a chave de serviço do Supabase (o Guto), pelo painel do Supabase.
--  · O navegador lê com a chave pública + o login dela. A chave de serviço NUNCA é usada aqui.
--  · Prontuário não some: evolução não tem DELETE (apagar = marcar como apagada, com motivo), e toda
--    edição guarda a versão anterior em psi_evolucoes_versoes. Paciente também não é apagado: é
--    encerrado (status). A resolução do CFP pede guarda mínima de 5 anos.
--  · Trilha de auditoria (psi_auditoria): cada criar/alterar/apagar em paciente, evolução,
--    atendimento, documento e anexo grava QUEM, QUANDO e QUAIS CAMPOS mudaram — nunca o texto
--    clínico. "Abriu o prontuário" e "exportou relatório" entram pela função psi_registrar().
--    A auditoria só aceita inserir: não dá pra editar nem apagar.
--  · WhatsApp / lembretes / Maia: as tabelas estão aqui, mas DESLIGADAS (psi_config.lembretes_ligados
--    = false, maia_ligada = false). Nada no sistema lê essas filas hoje.
-- ============================================================================================

create extension if not exists pgcrypto;

-- ---------- A PROFISSIONAL (dados que vão nos documentos) ----------
create table if not exists psi_perfil (
  owner_id      uuid primary key default auth.uid() references auth.users(id),
  nome          text not null default '',
  crp           text not null default '',          -- ex.: 07/12345
  telefone      text,
  email         text,
  cidade        text,                               -- cidade que vai no "local e data" dos documentos
  endereco      text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- LOCAIS DE ATENDIMENTO (APAE, Conecta, SESM, Mercado Montanha...) ----------
create table if not exists psi_locais (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users(id),
  nome            text not null,
  tipo            text not null default 'clinica' check (tipo in ('instituicao','clinica','empresa','particular','online')),
  cidade          text,
  valor_sessao    numeric(10,2),                    -- opcional: quanto ela recebe por sessão realizada
  forma_pagamento text,                             -- opcional: "repasse mensal", "pix do paciente"...
  cobra_falta     boolean not null default false,   -- falta sem aviso entra no "a receber"?
  cor             text not null default '#a27b5c',
  ativo           boolean not null default true,
  ordem           int not null default 0,
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- ---------- A ROTINA FIXA DA SEMANA (blocos por local, na agenda) ----------
-- Ex.: APAE seg e sex 07:30–11:30. Sem horário = só o DIA do local (SESM, Conecta): cada paciente tem o seu.
create table if not exists psi_blocos (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id),
  local_id      uuid not null references psi_locais(id) on delete cascade,
  dia_semana    int not null check (dia_semana between 0 and 6),   -- 0 = domingo, 1 = segunda...
  hora_inicio   time,
  hora_fim      time,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- PACIENTES (com o cabeçalho do prontuário) ----------
create table if not exists psi_pacientes (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid() references auth.users(id),
  local_id               uuid references psi_locais(id),
  nome                   text not null,
  nome_social            text,
  data_nascimento        date,
  cpf                    text,
  telefone               text,
  email                  text,
  endereco               text,
  responsavel_nome       text,                       -- menores / APAE
  responsavel_parentesco text,
  responsavel_telefone   text,
  data_inicio            date,
  status                 text not null default 'ativo' check (status in ('ativo','pausa','alta','encerrado')),
  recorrente             boolean not null default false,   -- sessão fixa toda semana (aparece sozinha na agenda)
  dia_semana             int check (dia_semana between 0 and 6),   -- dia fixo (0 = domingo)
  hora_fixa              time,
  modalidade             text not null default 'presencial' check (modalidade in ('presencial','online')),
  observacoes            text,                       -- observação administrativa (não clínica)
  -- prontuário: o conteúdo mínimo da Res. CFP 001/2009 (alterada pela 05/2010)
  demanda                text,                       -- demanda / queixa (avaliação de demanda)
  objetivos              text,                       -- objetivos do trabalho
  historico              text,                       -- história / anamnese
  procedimentos          text,                       -- técnicas e procedimentos utilizados
  encerramento_em        date,
  encerramento_motivo    text,                       -- alta, abandono, encaminhamento...
  encerramento_texto     text,                       -- registro do encaminhamento ou encerramento
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);

-- ---------- ATENDIMENTOS (cada sessão, agendada ou acontecida) ----------
create table if not exists psi_atendimentos (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id),
  paciente_id   uuid not null references psi_pacientes(id),
  local_id      uuid references psi_locais(id),
  data          date not null,                      -- o dia no fuso de Brasília (nunca UTC)
  hora          time,
  duracao_min   int not null default 50,
  presenca      text not null default 'realizado' check (presenca in ('agendado','realizado','faltou','desmarcou','remarcado')),
  modalidade    text not null default 'presencial' check (modalidade in ('presencial','online')),
  valor         numeric(10,2),                      -- copiado do local na hora de registrar (pode mudar)
  pago          boolean not null default false,
  observacao    text,                               -- administrativa (ex.: "remarcado pra quinta")
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- EVOLUÇÕES (o registro de cada sessão) ----------
create table if not exists psi_evolucoes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id),
  paciente_id    uuid not null references psi_pacientes(id),
  atendimento_id uuid references psi_atendimentos(id),
  local_id       uuid references psi_locais(id),
  data           date not null,
  tipo           text not null default 'sessao' check (tipo in ('sessao','avaliacao','devolutiva','contato','encerramento','anotacao')),
  texto          text not null,
  versao         int not null default 1,
  apagada_em     timestamptz,                        -- "apagar" = esconder com motivo; a linha fica
  apagada_motivo text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- cada edição de evolução guarda aqui a versão ANTERIOR, inteira
create table if not exists psi_evolucoes_versoes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id),
  evolucao_id    uuid not null references psi_evolucoes(id),
  versao         int not null,
  data           date not null,
  tipo           text not null,
  texto          text not null,
  apagada_em     timestamptz,
  apagada_motivo text,
  substituida_em timestamptz not null default now()
);

-- ---------- ANEXOS (arquivo no Storage privado psi-anexos) ----------
create table if not exists psi_anexos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id),
  paciente_id uuid not null references psi_pacientes(id),
  nome        text not null,
  caminho     text not null,                         -- <owner_id>/<paciente_id>/<arquivo> no bucket psi-anexos
  tipo_mime   text,
  tamanho     bigint,
  descricao   text,
  apagado_em  timestamptz,
  criado_em   timestamptz not null default now()
);

-- ---------- DOCUMENTOS EMITIDOS (cópia do que saiu: declaração, atestado, relatório) ----------
create table if not exists psi_documentos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id),
  paciente_id uuid not null references psi_pacientes(id),
  tipo        text not null check (tipo in ('declaracao','atestado','relatorio','outro')),
  titulo      text not null,
  campos      jsonb not null default '{}',           -- o que foi preenchido (pra refazer igual)
  texto       text not null,                         -- o texto final do documento
  emitido_em  date not null,
  criado_em   timestamptz not null default now()
);

-- ---------- TRILHA DE AUDITORIA (só inserir; nunca o texto clínico) ----------
create table if not exists psi_auditoria (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null references auth.users(id),
  usuario_id  uuid,                                  -- quem fez (auth.uid() do momento)
  acao        text not null,                         -- criar | alterar | apagar | ver | exportar | documento | entrar
  tabela      text,
  registro_id uuid,
  paciente_id uuid,
  campos      text[],                                -- QUAIS campos mudaram (só o nome)
  detalhe     text,                                  -- curto e sem conteúdo clínico
  quando      timestamptz not null default now()
);

-- ============================================================================================
-- O FUTURO (DESLIGADO): WhatsApp, consentimento e a Maia
-- ============================================================================================

-- interruptores de cada profissional. Tudo nasce DESLIGADO.
create table if not exists psi_config (
  owner_id               uuid primary key default auth.uid() references auth.users(id),
  lembretes_ligados      boolean not null default false,
  lembrete_horas_antes   int not null default 24,
  lembrete_modelo        text,                       -- nome do modelo aprovado no WhatsApp (fora das 24h só modelo)
  maia_ligada            boolean not null default false,
  maia_pode              text[] not null default '{}', -- ex.: {'confirmar_sessao','remarcar'} — NUNCA prontuário
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);

-- consentimento do paciente (ou do responsável) pra receber mensagem. Sem linha aceita = não manda.
create table if not exists psi_consentimentos (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id),
  paciente_id    uuid not null references psi_pacientes(id),
  canal          text not null default 'whatsapp' check (canal in ('whatsapp','email','sms')),
  finalidade     text not null default 'lembrete_sessao',   -- lembrete_sessao | confirmar_sessao | atendente_ia
  telefone       text,                                       -- o número autorizado (pode ser do responsável)
  quem_autorizou text not null default 'paciente' check (quem_autorizou in ('paciente','responsavel')),
  como           text,                                       -- "assinou termo em papel", "respondeu SIM no WhatsApp"...
  aceito_em      timestamptz,
  revogado_em    timestamptz,
  criado_em      timestamptz not null default now()
);

-- fila de lembretes (ninguém processa hoje). Quando ligar: um motor no servidor lê 'pendente'
-- com enviar_em <= agora, confere consentimento + psi_config.lembretes_ligados e manda.
create table if not exists psi_lembretes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id),
  atendimento_id uuid not null references psi_atendimentos(id),
  paciente_id    uuid not null references psi_pacientes(id),
  canal          text not null default 'whatsapp',
  enviar_em      timestamptz not null,
  status         text not null default 'desligado' check (status in ('desligado','pendente','enviado','falhou','cancelado')),
  resposta       text,                                -- 'confirmou' | 'desmarcou' | texto livre
  erro           text,
  criado_em      timestamptz not null default now(),
  enviado_em     timestamptz
);

-- o ponto de integração com a Maia: uma caixa de saída de eventos SEM dado clínico (só agenda).
-- Ex.: {tipo:'sessao_agendada', atendimento_id, data, hora, local} — a Maia lê daqui quando for ligada.
create table if not exists psi_eventos_integracao (
  id            bigint generated always as identity primary key,
  owner_id      uuid not null default auth.uid() references auth.users(id),
  tipo          text not null,
  dados         jsonb not null default '{}',
  criado_em     timestamptz not null default now(),
  processado_em timestamptz
);

-- ============================================================================================
-- ÍNDICES
-- ============================================================================================
create index if not exists psi_locais_owner        on psi_locais (owner_id, ordem);
create index if not exists psi_blocos_owner        on psi_blocos (owner_id, dia_semana);
create index if not exists psi_pacientes_owner     on psi_pacientes (owner_id, status, nome);
create index if not exists psi_pacientes_local     on psi_pacientes (local_id);
create index if not exists psi_atend_owner_data    on psi_atendimentos (owner_id, data);
create index if not exists psi_atend_paciente      on psi_atendimentos (paciente_id, data);
create index if not exists psi_atend_local_data    on psi_atendimentos (local_id, data);
create index if not exists psi_evol_paciente       on psi_evolucoes (paciente_id, data desc);
create index if not exists psi_evol_atendimento    on psi_evolucoes (atendimento_id);
create index if not exists psi_evolv_evolucao      on psi_evolucoes_versoes (evolucao_id, versao);
create index if not exists psi_anexos_paciente     on psi_anexos (paciente_id);
create index if not exists psi_docs_paciente       on psi_documentos (paciente_id, emitido_em desc);
create index if not exists psi_audit_owner_quando  on psi_auditoria (owner_id, quando desc);
create index if not exists psi_audit_paciente      on psi_auditoria (paciente_id, quando desc);
create index if not exists psi_consent_paciente    on psi_consentimentos (paciente_id);
create index if not exists psi_lembretes_fila      on psi_lembretes (status, enviar_em);
create index if not exists psi_eventos_fila        on psi_eventos_integracao (owner_id, processado_em);

-- ============================================================================================
-- RLS: cada login só vê e grava o que é dele
-- ============================================================================================
do $$
declare t text;
begin
  foreach t in array array['psi_perfil','psi_locais','psi_blocos','psi_pacientes','psi_atendimentos','psi_evolucoes',
    'psi_evolucoes_versoes','psi_anexos','psi_documentos','psi_auditoria','psi_config',
    'psi_consentimentos','psi_lembretes','psi_eventos_integracao']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('drop policy if exists dono_ve on %I', t);
    execute format('drop policy if exists dono_cria on %I', t);
    execute format('drop policy if exists dono_altera on %I', t);
    execute format('drop policy if exists dono_apaga on %I', t);
    execute format('create policy dono_ve on %I for select to authenticated using (owner_id = auth.uid())', t);
  end loop;

  -- criar: em todas, menos versões e auditoria (essas só os gatilhos/funções escrevem)
  foreach t in array array['psi_perfil','psi_locais','psi_blocos','psi_pacientes','psi_atendimentos','psi_evolucoes',
    'psi_anexos','psi_documentos','psi_config','psi_consentimentos','psi_lembretes','psi_eventos_integracao']
  loop
    execute format('create policy dono_cria on %I for insert to authenticated with check (owner_id = auth.uid())', t);
  end loop;

  -- alterar: nunca em documentos emitidos, versões e auditoria
  foreach t in array array['psi_perfil','psi_locais','psi_blocos','psi_pacientes','psi_atendimentos','psi_evolucoes',
    'psi_anexos','psi_config','psi_consentimentos','psi_lembretes']
  loop
    execute format('create policy dono_altera on %I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;

  -- apagar de verdade: só local (sem uso), atendimento lançado por engano e lembrete.
  -- Paciente, evolução, documento, anexo, versões e auditoria NÃO têm delete.
  foreach t in array array['psi_locais','psi_blocos','psi_atendimentos','psi_lembretes']
  loop
    execute format('create policy dono_apaga on %I for delete to authenticated using (owner_id = auth.uid())', t);
  end loop;
end $$;

-- ============================================================================================
-- GATILHOS
-- ============================================================================================

-- atualizado_em sempre certo
create or replace function psi_tocar_atualizado() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['psi_perfil','psi_locais','psi_blocos','psi_pacientes','psi_atendimentos','psi_evolucoes','psi_config']
  loop
    execute format('drop trigger if exists psi_atualizado on %I', t);
    execute format('create trigger psi_atualizado before update on %I for each row execute function psi_tocar_atualizado()', t);
  end loop;
end $$;

-- ninguém troca o dono de uma linha
create or replace function psi_dono_fixo() returns trigger language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then raise exception 'owner_id não pode mudar'; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['psi_locais','psi_blocos','psi_pacientes','psi_atendimentos','psi_evolucoes','psi_anexos','psi_consentimentos','psi_lembretes']
  loop
    execute format('drop trigger if exists psi_dono on %I', t);
    execute format('create trigger psi_dono before update on %I for each row execute function psi_dono_fixo()', t);
  end loop;
end $$;

-- evolução: antes de mudar, guarda a versão anterior e sobe o número da versão
create or replace function psi_evolucao_versionar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.texto is distinct from old.texto or new.data is distinct from old.data
     or new.tipo is distinct from old.tipo or new.apagada_em is distinct from old.apagada_em then
    insert into psi_evolucoes_versoes (owner_id, evolucao_id, versao, data, tipo, texto, apagada_em, apagada_motivo)
    values (old.owner_id, old.id, old.versao, old.data, old.tipo, old.texto, old.apagada_em, old.apagada_motivo);
    new.versao := old.versao + 1;
  end if;
  return new;
end $$;

drop trigger if exists psi_evol_versao on psi_evolucoes;
create trigger psi_evol_versao before update on psi_evolucoes for each row execute function psi_evolucao_versionar();

-- auditoria automática: quem, quando, quais campos (nunca os valores)
create or replace function psi_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  campos text[];
  novo jsonb; velho jsonb;
  acao text;
  pac uuid;
  reg uuid;
  dono uuid;
begin
  if tg_op = 'INSERT' then
    novo := to_jsonb(new); acao := 'criar';
  elsif tg_op = 'UPDATE' then
    novo := to_jsonb(new); velho := to_jsonb(old); acao := 'alterar';
    select array_agg(k) into campos from jsonb_object_keys(novo) k
     where k not in ('atualizado_em','versao') and novo->k is distinct from velho->k;
    if campos is null then return new; end if;
    if (velho->>'apagada_em') is null and (novo->>'apagada_em') is not null then acao := 'apagar'; end if;
    if (velho->>'apagado_em') is null and (novo->>'apagado_em') is not null then acao := 'apagar'; end if;
  else
    velho := to_jsonb(old); acao := 'apagar';
  end if;
  reg  := coalesce(novo, velho)->>'id';
  dono := coalesce(novo, velho)->>'owner_id';
  pac  := case when tg_table_name = 'psi_pacientes' then reg else (coalesce(novo, velho)->>'paciente_id')::uuid end;
  insert into psi_auditoria (owner_id, usuario_id, acao, tabela, registro_id, paciente_id, campos)
  values (dono, auth.uid(), acao, tg_table_name, reg, pac, campos);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['psi_pacientes','psi_atendimentos','psi_evolucoes','psi_anexos','psi_documentos','psi_consentimentos']
  loop
    execute format('drop trigger if exists psi_audit on %I', t);
    execute format('create trigger psi_audit after insert or update or delete on %I for each row execute function psi_auditar()', t);
  end loop;
end $$;

-- o que o navegador pode registrar por conta própria: abriu prontuário, exportou, gerou documento, entrou.
-- Só grava pra quem está logado e só no nome dele; o paciente tem que ser dele.
create or replace function psi_registrar(p_acao text, p_paciente uuid default null, p_detalhe text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'precisa estar logado'; end if;
  if p_acao not in ('ver','exportar','documento','entrar','compartilhar') then raise exception 'ação inválida'; end if;
  if p_paciente is not null and not exists (select 1 from psi_pacientes where id = p_paciente and owner_id = auth.uid()) then
    raise exception 'paciente não encontrado';
  end if;
  insert into psi_auditoria (owner_id, usuario_id, acao, tabela, paciente_id, detalhe)
  values (auth.uid(), auth.uid(), p_acao, case when p_paciente is null then null else 'psi_pacientes' end, p_paciente, left(p_detalhe, 200));
end $$;

revoke all on function psi_registrar(text, uuid, text) from public, anon;
grant execute on function psi_registrar(text, uuid, text) to authenticated;

-- ============================================================================================
-- STORAGE: bucket PRIVADO pros anexos. Cada arquivo fica em <owner_id>/<paciente_id>/<nome>.
-- Sem link público: o app pede um link assinado que vale 5 minutos.
-- ============================================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('psi-anexos', 'psi-anexos', false, 20971520)   -- 20 MB por arquivo
on conflict (id) do update set public = false;

drop policy if exists psi_anexos_ve    on storage.objects;
drop policy if exists psi_anexos_cria  on storage.objects;
create policy psi_anexos_ve on storage.objects for select to authenticated
  using (bucket_id = 'psi-anexos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy psi_anexos_cria on storage.objects for insert to authenticated
  with check (bucket_id = 'psi-anexos' and (storage.foldername(name))[1] = auth.uid()::text);
-- sem update/delete no storage: anexo de prontuário não é trocado nem apagado pelo app.

-- ============================================================================================
-- DEPOIS DE CRIAR O LOGIN DELA (Authentication > Users > Add user), os 4 locais iniciais.
-- Troque o e-mail abaixo pelo dela e rode só este bloco. (O app também cria os 4 sozinho no
-- primeiro acesso, se a lista estiver vazia — então este bloco é opcional.)
-- ============================================================================================
-- insert into psi_locais (owner_id, nome, tipo, cidade, ordem, cor)
-- select u.id, l.nome, l.tipo, l.cidade, l.ordem, l.cor
--   from auth.users u,
--        (values ('APAE','instituicao',null,1,'#b07a5e'),
--                ('Clínica Conecta','clinica','Estrela',2,'#c08f8b'),
--                ('SESM','clinica','Lajeado',3,'#8c9877'),
--                ('Mercado Montanha','empresa',null,4,'#6f8796')) as l(nome,tipo,cidade,ordem,cor)
--  where u.email = 'EMAIL-DELA@exemplo.com'
--    and not exists (select 1 from psi_locais x where x.owner_id = u.id);
--
-- e a rotina fixa da semana (rode depois do bloco acima; o app também cria sozinho no primeiro acesso):
-- insert into psi_blocos (owner_id, local_id, dia_semana, hora_inicio, hora_fim)
-- select l.owner_id, l.id, b.dia, b.ini::time, b.fim::time
--   from psi_locais l
--   join (values ('APAE',1,'07:30','11:30'), ('APAE',5,'07:30','11:30'),
--                ('Mercado Montanha',2,'08:00','15:00'),
--                ('SESM',3,null,null),                  -- sem horário fixo: depende dos pacientes
--                ('Clínica Conecta',4,null,null)) as b(nome,dia,ini,fim) on b.nome = l.nome
--   join auth.users u on u.id = l.owner_id and u.email = 'EMAIL-DELA@exemplo.com'
--  where not exists (select 1 from psi_blocos x where x.owner_id = l.owner_id);
