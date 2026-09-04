begin;

create function public.listar_saldos_regis_propios()
returns table (
  negocio_id uuid,
  nombre_negocio text,
  disponibles integer,
  reservados integer,
  pendientes integer,
  canjeados integer,
  remanente_valor_clp numeric,
  actualizado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vecino_id uuid := (select auth.uid());
begin
  if v_vecino_id is null then
    raise exception 'Debes iniciar sesión para consultar REGIS'
      using errcode = '42501';
  end if;

  return query
  select
    saldo.negocio_id,
    negocio.nombre::text,
    saldo.disponibles,
    saldo.reservados,
    saldo.pendientes,
    saldo.canjeados,
    saldo.remanente_valor_clp,
    saldo.actualizado_en
  from public.saldos_regis as saldo
  join public.negocios as negocio
    on negocio.id = saldo.negocio_id
  where saldo.vecino_id = v_vecino_id
  order by negocio.nombre, saldo.negocio_id;
end;
$$;

create function public.consultar_saldo_regis_llavero(
  p_token text,
  p_caja_id uuid
)
returns table (
  negocio_id uuid,
  nombre_negocio text,
  disponibles integer,
  reservados integer,
  pendientes integer,
  canjeados integer,
  remanente_valor_clp numeric,
  actualizado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid;
  v_nombre_negocio text;
  v_vecino_id uuid;
  v_token text := btrim(coalesce(p_token, ''));
begin
  select negocio.id, negocio.nombre
  into v_negocio_id, v_nombre_negocio
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  join public.negocios as negocio
    on negocio.id = sucursal.negocio_id
  where caja.id = p_caja_id
    and caja.estado = 'activa'
    and sucursal.estado = 'activa'
    and negocio.estado = 'activo';

  if v_negocio_id is null
    or not public.es_miembro_negocio(v_negocio_id)
  then
    raise exception 'No tienes acceso a la caja indicada'
      using errcode = '42501';
  end if;

  if char_length(v_token) < 8 or char_length(v_token) > 500 then
    raise exception 'El token del llavero no es válido'
      using errcode = '22023';
  end if;

  select llavero.vecino_id
  into v_vecino_id
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
  where llavero.token_hash = encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    )
    and llavero.estado = 'activo'
    and perfil.estado = 'activo'
  limit 1;

  if v_vecino_id is null then
    raise exception 'No encontramos un llavero activo'
      using errcode = 'P0002';
  end if;

  return query
  select
    v_negocio_id,
    v_nombre_negocio,
    coalesce(saldo.disponibles, 0),
    coalesce(saldo.reservados, 0),
    coalesce(saldo.pendientes, 0),
    coalesce(saldo.canjeados, 0),
    coalesce(saldo.remanente_valor_clp, 0::numeric),
    saldo.actualizado_en
  from (values (1)) as unica(fila)
  left join public.saldos_regis as saldo
    on saldo.vecino_id = v_vecino_id
    and saldo.negocio_id = v_negocio_id;
end;
$$;

revoke all on function public.listar_saldos_regis_propios()
  from public, anon, authenticated;
revoke all on function public.consultar_saldo_regis_llavero(text, uuid)
  from public, anon, authenticated;

grant execute on function public.listar_saldos_regis_propios()
  to authenticated;
grant execute on function public.consultar_saldo_regis_llavero(text, uuid)
  to authenticated;

comment on function public.listar_saldos_regis_propios() is
  'Lista exclusivamente los saldos REGIS del usuario autenticado, separados por negocio.';
comment on function public.consultar_saldo_regis_llavero(text, uuid) is
  'Devuelve a un operador autorizado el saldo del llavero activo únicamente en el negocio de la caja indicada, sin exponer el token, su hash ni el ID del vecino.';

commit;
