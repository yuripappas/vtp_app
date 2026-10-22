-- Marketing › Relacionamento › Contatos — base de clientes espelhada do Cardápio Web.
--
-- Cadastro: GET /merchant/customers (Edge Function crm-sync, uma passada por dia).
-- Comportamento (pedidos, ticket, última compra, RFV): calculado aqui por
-- crm_recalcular() a partir de cw_pedidos — a API do CW não expõe esses números.
-- O histórico de 12 meses (limite do GET /orders/history) é completado pela
-- crm-sync através da fila crm_backfill_fila.
--
-- Segurança: o login do VTP não usa Supabase Auth (o navegador só tem a anon key),
-- então a leitura segue o mesmo nível de cw_pedidos e atd_contatos: liberada para anon.
-- Escrita do cadastro só pela Edge Function (service_role).

create table if not exists crm_clientes (
  id                 bigint primary key,           -- id do cliente no CW
  nome               text,
  email              text,
  telefone           text,                         -- ddi+telefone, só dígitos (mesmo formato de cw_pedidos.customer_phone)
  data_nascimento    date,
  genero             text,                         -- female | male | non-binary | other
  cw_criado_em       timestamptz,
  pontos             integer not null default 0,
  pontos_expiram_em  date,
  cashback           numeric not null default 0,
  cashback_expira_em date,
  aceita_whatsapp    boolean not null default true, -- notifications_enabled do CW
  ativo              boolean not null default true, -- false quando some da listagem do CW (bloqueado ou inativo)
  visto_em           timestamptz,                   -- última passada do sync em que o cliente apareceu
  -- calculados por crm_recalcular()
  qtd_pedidos        integer not null default 0,
  total_gasto        numeric not null default 0,
  ticket_medio       numeric not null default 0,
  primeiro_pedido    timestamptz,
  ultimo_pedido      timestamptz,
  canal_cadastro     text,                          -- sales_channel do 1º pedido (o CW não expõe o canal de cadastro)
  rfv_r              smallint,
  rfv_f              smallint,
  rfv_v              smallint,
  rfv_grupo          text,
  calculado_em       timestamptz
);

create index if not exists crm_clientes_telefone_idx on crm_clientes (telefone);
create index if not exists crm_clientes_rfv_idx      on crm_clientes (rfv_grupo);
create index if not exists crm_clientes_ultimo_idx   on crm_clientes (ultimo_pedido desc);
create index if not exists cw_pedidos_customer_id_idx on cw_pedidos (customer_id);

-- Marca os pedidos cujo cliente já foi lido do detalhe do CW (os de antes de
-- 27/06/2026 foram gravados sem cliente e entram no backfill da crm-sync).
alter table cw_pedidos add column if not exists cliente_verificado_em timestamptz;

alter table crm_clientes enable row level security;
create policy "anon_read_crm_clientes" on crm_clientes for select using (true);

-- Parâmetros RFV (linha única). Limites inferiores das notas 5, 4, 3 e 2 —
-- abaixo do último limite a nota é 1. Padrão = parâmetros atuais da loja no CW.
create table if not exists crm_rfv_config (
  id          smallint primary key default 1 check (id = 1),
  recencia    integer[] not null default '{10,20,30,40}',     -- nota 5: até 10 dias … nota 2: até 40 dias
  frequencia  integer[] not null default '{12,9,5,2}',        -- nota 5: a partir de 12 pedidos … nota 2: a partir de 2
  valor       numeric[] not null default '{100,80,50,30}',    -- nota 5: ticket a partir de R$ 100 … nota 2: a partir de R$ 30
  atualizado_em timestamptz not null default now()
);
insert into crm_rfv_config (id) values (1) on conflict do nothing;

alter table crm_rfv_config enable row level security;
create policy "anon_read_crm_rfv_config"   on crm_rfv_config for select using (true);
create policy "anon_update_crm_rfv_config" on crm_rfv_config for update using (true) with check (true);

-- Estado das rotinas da crm-sync (passada diária de clientes, backfill de pedidos).
create table if not exists crm_sync_estado (
  chave         text primary key,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table crm_sync_estado enable row level security;
create policy "anon_read_crm_sync_estado" on crm_sync_estado for select using (true);

-- Pedidos do histórico do CW que ainda precisam do detalhe (cliente, total, itens).
create table if not exists crm_backfill_fila (
  id        bigint primary key,   -- id do pedido no CW
  criado_em timestamptz
);
alter table crm_backfill_fila enable row level security;

-- ── RFV ──────────────────────────────────────────────────────────────────
-- Grupo pela matriz Recência × média(Frequência, Valor), a mesma do CW.
create or replace function crm_rfv_grupo(r integer, fv numeric) returns text
language sql immutable as $$
  select case
    when r is null then null
    when r = 1 then case when fv > 4 then 'nao_posso_perder' when fv > 2 then 'em_risco' else 'perdidos' end
    when r = 2 then case when fv > 2 then 'em_risco' when fv > 1 then 'hibernando' else 'perdidos' end
    when r = 3 then case when fv > 3 then 'fieis' when fv > 2 then 'precisam_atencao' else 'quase_dormentes' end
    when r = 4 then case when fv > 3 then 'fieis' when fv > 1 then 'em_potencial' else 'promissores' end
    else            case when fv > 4 then 'campeoes' when fv > 3 then 'fieis' when fv > 1 then 'em_potencial' else 'novos' end
  end
$$;

create or replace function crm_recalcular() returns integer
language plpgsql security definer set search_path = public as $$
declare
  cfg crm_rfv_config;
  atualizados integer;
begin
  select * into cfg from crm_rfv_config where id = 1;

  with ped as (
    select customer_id,
           count(*)                                         as qtd,
           sum(total)                                       as gasto,
           min(cw_created_at)                               as primeiro,
           max(cw_created_at)                               as ultimo,
           (array_agg(sales_channel order by cw_created_at))[1] as canal
      from cw_pedidos
     where customer_id is not null
       and status not in ('canceled', 'canceling')
     group by customer_id
  ), base as (
    select c.id,
           coalesce(p.qtd, 0)   as qtd,
           coalesce(p.gasto, 0) as gasto,
           case when coalesce(p.qtd, 0) > 0 then round(p.gasto / p.qtd, 2) else 0 end as ticket,
           p.primeiro, p.ultimo, p.canal,
           ((now() at time zone 'America/Maceio')::date - (p.ultimo at time zone 'America/Maceio')::date) as dias
      from crm_clientes c
      left join ped p on p.customer_id = c.id
  ), notas as (
    select b.*,
           case when b.ultimo is null           then 1
                when b.dias <= cfg.recencia[1]  then 5
                when b.dias <= cfg.recencia[2]  then 4
                when b.dias <= cfg.recencia[3]  then 3
                when b.dias <= cfg.recencia[4]  then 2
                else 1 end as r,
           case when b.qtd >= cfg.frequencia[1] then 5
                when b.qtd >= cfg.frequencia[2] then 4
                when b.qtd >= cfg.frequencia[3] then 3
                when b.qtd >= cfg.frequencia[4] then 2
                else 1 end as f,
           case when b.ticket >= cfg.valor[1]   then 5
                when b.ticket >= cfg.valor[2]   then 4
                when b.ticket >= cfg.valor[3]   then 3
                when b.ticket >= cfg.valor[4]   then 2
                else 1 end as v
      from base b
  )
  update crm_clientes c
     set qtd_pedidos     = x.qtd,
         total_gasto     = x.gasto,
         ticket_medio    = x.ticket,
         primeiro_pedido = x.primeiro,
         ultimo_pedido   = x.ultimo,
         canal_cadastro  = x.canal,
         rfv_r           = x.r,
         rfv_f           = x.f,
         rfv_v           = x.v,
         rfv_grupo       = crm_rfv_grupo(x.r, (x.f + x.v) / 2.0),
         calculado_em    = now()
    from notas x
   where x.id = c.id;

  get diagnostics atualizados = row_count;
  return atualizados;
end $$;

grant execute on function crm_recalcular() to anon;

-- Tempo entre pedidos por ciclo (1º→2º, 2º→3º …), para a Análise da base.
create or replace function crm_tempo_entre_pedidos()
returns table (ciclo integer, media numeric, mediana numeric, minimo integer, maximo integer, clientes bigint)
language sql stable security definer set search_path = public as $$
  with ped as (
    select customer_id, cw_created_at,
           row_number() over (partition by customer_id order by cw_created_at) as n,
           lag(cw_created_at) over (partition by customer_id order by cw_created_at) as anterior
      from cw_pedidos
     where customer_id is not null and status not in ('canceled', 'canceling')
  ), gaps as (
    select n - 1 as ciclo, extract(epoch from (cw_created_at - anterior)) / 86400.0 as dias
      from ped where anterior is not null
  )
  select ciclo,
         round(avg(dias)::numeric, 1),
         round((percentile_cont(0.5) within group (order by dias))::numeric, 1),
         floor(min(dias))::integer,
         floor(max(dias))::integer,
         count(*)
    from gaps
   group by ciclo
   order by ciclo
$$;

grant execute on function crm_tempo_entre_pedidos() to anon;

-- ── Agendamentos ─────────────────────────────────────────────────────────
-- crm-sync a cada minuto: decide sozinha se há passada de clientes ou backfill
-- a fazer (sem trabalho pendente, só retorna). Mesmo padrão do cw-sync-job.
do $$ begin perform cron.unschedule('crm-sync-job'); exception when others then null; end $$;
select cron.schedule(
  'crm-sync-job',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://wdfecydgdzwwxxrncdqx.supabase.co/functions/v1/crm-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZmVjeWRnZHp3d3h4cm5jZHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1ODAwOTUsImV4cCI6MjA5NTE1NjA5NX0.sVVljppHf0g7zU-kCuvGxxw67wqAFlVVGRpqjgUBaEA',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 60000
  );
  $$
);

-- RFV muda todo dia (recência) e a cada pedido: recalcula a cada 30 min.
do $$ begin perform cron.unschedule('crm-recalcular-job'); exception when others then null; end $$;
select cron.schedule('crm-recalcular-job', '*/30 * * * *', $$ select crm_recalcular(); $$);
