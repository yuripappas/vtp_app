-- crm_recalcular() regravava os ~12 mil clientes a cada 30 min mesmo sem
-- mudança (~480 mil updates/dia), o que estourava o Disk IO e o CPU do banco
-- (e o Realtime tinha que decodificar todo esse WAL). Agora só grava quem teve
-- algum número alterado; calculado_em passa a marcar a última mudança.

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
  ), calc as (
    select n.*, crm_rfv_grupo(n.r, (n.f + n.v) / 2.0) as grupo
      from notas n
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
         rfv_grupo       = x.grupo,
         calculado_em    = now()
    from calc x
   where x.id = c.id
     and (c.qtd_pedidos, c.total_gasto, c.ticket_medio, c.primeiro_pedido, c.ultimo_pedido,
          c.canal_cadastro, c.rfv_r, c.rfv_f, c.rfv_v, c.rfv_grupo)
         is distinct from
         (x.qtd, x.gasto, x.ticket, x.primeiro, x.ultimo,
          x.canal, x.r::smallint, x.f::smallint, x.v::smallint, x.grupo);

  get diagnostics atualizados = row_count;
  return atualizados;
end $$;
