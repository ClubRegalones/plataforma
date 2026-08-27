begin;

create type public.destino_notificacion_canje_regis as enum (
  'vecino',
  'negocio',
  'admin_regalones'
);

alter table public.canjes_regis
  add column leido_vecino_en timestamptz,
  add column leido_negocio_en timestamptz,
  add column leido_admin_regalones_en timestamptz;

create index canjes_regis_no_leidos_vecino_idx
  on public.canjes_regis (vecino_id, confirmado_en desc)
  where estado = 'confirmado' and leido_vecino_en is null;

create index canjes_regis_no_leidos_negocio_idx
  on public.canjes_regis (negocio_id, confirmado_en desc)
  where estado = 'confirmado' and leido_negocio_en is null;

create index canjes_regis_no_leidos_admin_idx
  on public.canjes_regis (confirmado_en desc)
  where estado = 'confirmado' and leido_admin_regalones_en is null;

create function public.listar_historial_canjes_vecino(
  p_limite integer default 50
)
returns table (
  canje_id uuid,
  codigo_publico text,
  beneficio_id uuid,
  beneficio_version_id uuid,
  negocio_id uuid,
  nombre_negocio text,
  nombre_beneficio text,
  origen public.origen_canje_regis,
  costo_regis integer,
  monto_compra_bruto_clp integer,
  descuento_total_clp integer,
  monto_final_pagado_clp integer,
  confirmado_en timestamptz,
  leido boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vecino_id uuid := (select auth.uid());
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
begin
  if v_vecino_id is null then
    raise exception 'Debes iniciar sesión para consultar tus canjes'
      using errcode = '42501';
  end if;

  return query
  select
    canje.id,
    canje.codigo_publico::text,
    canje.beneficio_id,
    canje.beneficio_version_id,
    canje.negocio_id,
    negocio.nombre::text,
    version.nombre::text,
    canje.origen,
    canje.costo_regis,
    canje.monto_compra_bruto_clp,
    canje.descuento_total_clp,
    canje.monto_final_pagado_clp,
    canje.confirmado_en,
    canje.leido_vecino_en is not null
  from public.canjes_regis as canje
  join public.negocios as negocio
    on negocio.id = canje.negocio_id
  join public.versiones_beneficio_regis as version
    on version.id = canje.beneficio_version_id
  where canje.vecino_id = v_vecino_id
    and canje.estado = 'confirmado'
  order by canje.confirmado_en desc, canje.id desc
  limit v_limite;
end;
$$;

create function public.listar_historial_canjes_negocio(
  p_negocio_id uuid,
  p_beneficio_id uuid default null,
  p_limite integer default 100
)
returns table (
  canje_id uuid,
  codigo_publico text,
  beneficio_id uuid,
  beneficio_version_id uuid,
  negocio_id uuid,
  nombre_negocio text,
  nombre_beneficio text,
  origen public.origen_canje_regis,
  costo_regis integer,
  monto_compra_bruto_clp integer,
  descuento_total_clp integer,
  monto_final_pagado_clp integer,
  confirmado_en timestamptz,
  leido boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_limite integer := least(greatest(coalesce(p_limite, 100), 1), 500);
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para consultar los canjes del negocio'
      using errcode = '42501';
  end if;

  if not public.es_miembro_negocio(p_negocio_id)
    and not public.es_admin_regalones()
  then
    raise exception 'No tienes acceso a los canjes de este negocio'
      using errcode = '42501';
  end if;

  return query
  select
    canje.id,
    canje.codigo_publico::text,
    canje.beneficio_id,
    canje.beneficio_version_id,
    canje.negocio_id,
    negocio.nombre::text,
    version.nombre::text,
    canje.origen,
    canje.costo_regis,
    canje.monto_compra_bruto_clp,
    canje.descuento_total_clp,
    canje.monto_final_pagado_clp,
    canje.confirmado_en,
    canje.leido_negocio_en is not null
  from public.canjes_regis as canje
  join public.negocios as negocio
    on negocio.id = canje.negocio_id
  join public.versiones_beneficio_regis as version
    on version.id = canje.beneficio_version_id
  where canje.negocio_id = p_negocio_id
    and canje.estado = 'confirmado'
    and (p_beneficio_id is null or canje.beneficio_id = p_beneficio_id)
  order by canje.confirmado_en desc, canje.id desc
  limit v_limite;
end;
$$;

create function public.listar_historial_canjes_admin(
  p_negocio_id uuid default null,
  p_beneficio_id uuid default null,
  p_limite integer default 200
)
returns table (
  canje_id uuid,
  codigo_publico text,
  beneficio_id uuid,
  beneficio_version_id uuid,
  negocio_id uuid,
  nombre_negocio text,
  nombre_beneficio text,
  origen public.origen_canje_regis,
  costo_regis integer,
  monto_compra_bruto_clp integer,
  descuento_total_clp integer,
  monto_final_pagado_clp integer,
  confirmado_en timestamptz,
  leido boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000);
begin
  if not public.es_admin_regalones() then
    raise exception 'Solo Regalones puede consultar todos los canjes'
      using errcode = '42501';
  end if;

  return query
  select
    canje.id,
    canje.codigo_publico::text,
    canje.beneficio_id,
    canje.beneficio_version_id,
    canje.negocio_id,
    negocio.nombre::text,
    version.nombre::text,
    canje.origen,
    canje.costo_regis,
    canje.monto_compra_bruto_clp,
    canje.descuento_total_clp,
    canje.monto_final_pagado_clp,
    canje.confirmado_en,
    canje.leido_admin_regalones_en is not null
  from public.canjes_regis as canje
  join public.negocios as negocio
    on negocio.id = canje.negocio_id
  join public.versiones_beneficio_regis as version
    on version.id = canje.beneficio_version_id
  where canje.estado = 'confirmado'
    and (p_negocio_id is null or canje.negocio_id = p_negocio_id)
    and (p_beneficio_id is null or canje.beneficio_id = p_beneficio_id)
  order by canje.confirmado_en desc, canje.id desc
  limit v_limite;
end;
$$;

create function public.marcar_canje_regis_leido(
  p_canje_id uuid,
  p_destino public.destino_notificacion_canje_regis
)
returns table (
  canje_id uuid,
  destino public.destino_notificacion_canje_regis,
  leido_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_canje public.canjes_regis;
  v_leido_en timestamptz := clock_timestamp();
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para revisar la notificación'
      using errcode = '42501';
  end if;

  select canje.*
  into v_canje
  from public.canjes_regis as canje
  where canje.id = p_canje_id
    and canje.estado = 'confirmado'
  for update;

  if not found then
    raise exception 'Canje confirmado no encontrado'
      using errcode = 'P0002';
  end if;

  if p_destino = 'vecino' then
    if v_canje.vecino_id <> v_usuario_id then
      raise exception 'No puedes revisar una notificación de otro vecino'
        using errcode = '42501';
    end if;

    update public.canjes_regis
    set leido_vecino_en = coalesce(leido_vecino_en, v_leido_en)
    where id = p_canje_id
    returning leido_vecino_en into v_leido_en;
  elsif p_destino = 'negocio' then
    if not public.es_miembro_negocio(v_canje.negocio_id) then
      raise exception 'No perteneces al negocio de este canje'
        using errcode = '42501';
    end if;

    update public.canjes_regis
    set leido_negocio_en = coalesce(leido_negocio_en, v_leido_en)
    where id = p_canje_id
    returning leido_negocio_en into v_leido_en;
  elsif p_destino = 'admin_regalones' then
    if not public.es_admin_regalones() then
      raise exception 'Solo Regalones puede revisar esta notificación'
        using errcode = '42501';
    end if;

    update public.canjes_regis
    set leido_admin_regalones_en = coalesce(
      leido_admin_regalones_en,
      v_leido_en
    )
    where id = p_canje_id
    returning leido_admin_regalones_en into v_leido_en;
  end if;

  return query select v_canje.id, p_destino, v_leido_en;
end;
$$;

create function public.contar_notificaciones_canjes_regis(
  p_destino public.destino_notificacion_canje_regis,
  p_negocio_id uuid default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_total bigint;
begin
  if v_usuario_id is null then
    return 0;
  end if;

  if p_destino = 'vecino' then
    select count(*)
    into v_total
    from public.canjes_regis as canje
    where canje.vecino_id = v_usuario_id
      and canje.estado = 'confirmado'
      and canje.leido_vecino_en is null;
  elsif p_destino = 'negocio' then
    if p_negocio_id is null
      or not public.es_miembro_negocio(p_negocio_id)
    then
      raise exception 'No tienes acceso a las notificaciones del negocio'
        using errcode = '42501';
    end if;

    select count(*)
    into v_total
    from public.canjes_regis as canje
    where canje.negocio_id = p_negocio_id
      and canje.estado = 'confirmado'
      and canje.leido_negocio_en is null;
  elsif p_destino = 'admin_regalones' then
    if not public.es_admin_regalones() then
      raise exception 'Solo Regalones puede consultar estas notificaciones'
        using errcode = '42501';
    end if;

    select count(*)
    into v_total
    from public.canjes_regis as canje
    where canje.estado = 'confirmado'
      and canje.leido_admin_regalones_en is null;
  end if;

  return coalesce(v_total, 0);
end;
$$;

revoke all on function public.listar_historial_canjes_vecino(integer)
  from public, anon;
revoke all on function public.listar_historial_canjes_negocio(
  uuid, uuid, integer
) from public, anon;
revoke all on function public.listar_historial_canjes_admin(
  uuid, uuid, integer
) from public, anon;
revoke all on function public.marcar_canje_regis_leido(
  uuid, public.destino_notificacion_canje_regis
) from public, anon;
revoke all on function public.contar_notificaciones_canjes_regis(
  public.destino_notificacion_canje_regis, uuid
) from public, anon;

grant execute on function public.listar_historial_canjes_vecino(integer)
  to authenticated;
grant execute on function public.listar_historial_canjes_negocio(
  uuid, uuid, integer
) to authenticated;
grant execute on function public.listar_historial_canjes_admin(
  uuid, uuid, integer
) to authenticated;
grant execute on function public.marcar_canje_regis_leido(
  uuid, public.destino_notificacion_canje_regis
) to authenticated;
grant execute on function public.contar_notificaciones_canjes_regis(
  public.destino_notificacion_canje_regis, uuid
) to authenticated;

comment on column public.canjes_regis.leido_vecino_en is
  'Confirma que el vecino revisó el aviso y detalle de este canje.';
comment on column public.canjes_regis.leido_negocio_en is
  'Confirma que el equipo del negocio revisó el aviso compartido del canje.';
comment on column public.canjes_regis.leido_admin_regalones_en is
  'Confirma que la administración de Regalones revisó el aviso del canje.';
comment on function public.listar_historial_canjes_vecino(integer) is
  'Entrega al vecino su historial confirmado y el estado de lectura de cada aviso.';
comment on function public.listar_historial_canjes_negocio(uuid, uuid, integer) is
  'Entrega al negocio su historial de canjes, opcionalmente filtrado por beneficio.';
comment on function public.listar_historial_canjes_admin(uuid, uuid, integer) is
  'Entrega a Regalones el historial global de canjes para supervisión.';

commit;
