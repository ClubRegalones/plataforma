-- Expone el límite económico que realmente se aplica a cada promoción.
-- La interfaz puede explicar el descuento antes de que el vecino reserve o
-- el comercio confirme el canje.

drop function if exists public.listar_beneficios_regis_disponibles(uuid);

create function public.listar_beneficios_regis_disponibles(
  p_negocio_id uuid default null
)
returns table (
  beneficio_id uuid,
  beneficio_version_id uuid,
  negocio_id uuid,
  nombre_negocio text,
  nombre_beneficio text,
  descripcion text,
  tipo public.tipo_beneficio_regis,
  porcentaje_descuento_bp integer,
  monto_descuento_fijo_clp integer,
  costo_regis integer,
  compra_minima_clp integer,
  tope_descuento_clp integer,
  porcentaje_maximo_canje_bp integer,
  cupos_disponibles integer,
  mostrar_cupos boolean,
  saldo_disponible integer,
  puede_reservar boolean,
  vigencia_hasta timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vecino_id uuid := (select auth.uid());
begin
  if v_vecino_id is null then
    raise exception 'Debes iniciar sesión para consultar beneficios'
      using errcode = '42501';
  end if;

  perform public.expirar_reservas_canje_regis();

  return query
  with ocupacion as (
    select
      canje.beneficio_id,
      count(*) filter (
        where canje.estado = 'confirmado'
          or (canje.estado = 'reservado' and canje.expira_en > now())
      )::integer as total,
      count(*) filter (
        where canje.vecino_id = v_vecino_id
          and (
            canje.estado = 'confirmado'
            or (canje.estado = 'reservado' and canje.expira_en > now())
          )
      )::integer as total_vecino
    from public.canjes_regis as canje
    group by canje.beneficio_id
  )
  select
    beneficio.id,
    version.id,
    beneficio.negocio_id,
    negocio.nombre::text,
    version.nombre::text,
    version.descripcion,
    version.tipo,
    version.porcentaje_descuento_bp,
    version.monto_descuento_fijo_clp,
    version.costo_regis,
    version.compra_minima_clp,
    version.tope_descuento_clp,
    version.porcentaje_maximo_canje_bp,
    case
      when version.cupos_totales is null then null
      else greatest(version.cupos_totales - coalesce(ocupacion.total, 0), 0)
    end,
    version.mostrar_cupos,
    coalesce(saldo.disponibles, 0),
    coalesce(saldo.disponibles, 0) >= version.costo_regis
      and (
        version.cupos_totales is null
        or coalesce(ocupacion.total, 0) < version.cupos_totales
      )
      and coalesce(ocupacion.total_vecino, 0) < version.limite_por_vecino,
    version.vigencia_hasta
  from public.versiones_beneficio_regis as version
  join public.beneficios_regis as beneficio
    on beneficio.id = version.beneficio_id
  join public.negocios as negocio
    on negocio.id = beneficio.negocio_id
  left join public.saldos_regis as saldo
    on saldo.vecino_id = v_vecino_id
    and saldo.negocio_id = beneficio.negocio_id
  left join ocupacion
    on ocupacion.beneficio_id = beneficio.id
  where version.estado = 'activo'
    and version.vigencia_desde <= now()
    and (version.vigencia_hasta is null or version.vigencia_hasta > now())
    and negocio.estado = 'activo'
    and (p_negocio_id is null or beneficio.negocio_id = p_negocio_id)
  order by negocio.nombre, version.nombre;
end;
$$;

drop function if exists public.consultar_canje_regis_qr(text, uuid);

create function public.consultar_canje_regis_qr(
  p_qr_token text,
  p_caja_id uuid
)
returns table (
  canje_id uuid,
  codigo_publico text,
  estado public.estado_canje_regis,
  nombre_beneficio text,
  costo_regis integer,
  compra_minima_clp integer,
  tipo public.tipo_beneficio_regis,
  porcentaje_descuento_bp integer,
  monto_descuento_fijo_clp integer,
  tope_descuento_clp integer,
  porcentaje_maximo_canje_bp integer,
  expira_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid;
  v_token_hash text;
begin
  select negocio.id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal on sucursal.id = caja.sucursal_id
  join public.negocios as negocio on negocio.id = sucursal.negocio_id
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

  perform public.expirar_reservas_canje_regis();

  v_token_hash := encode(
    extensions.digest(
      convert_to(btrim(coalesce(p_qr_token, '')), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  return query
  select
    canje.id,
    canje.codigo_publico::text,
    canje.estado,
    version.nombre::text,
    canje.costo_regis,
    version.compra_minima_clp,
    version.tipo,
    version.porcentaje_descuento_bp,
    version.monto_descuento_fijo_clp,
    version.tope_descuento_clp,
    version.porcentaje_maximo_canje_bp,
    canje.expira_en
  from public.canjes_regis as canje
  join public.versiones_beneficio_regis as version
    on version.id = canje.beneficio_version_id
  where canje.qr_token_hash = v_token_hash
    and canje.negocio_id = v_negocio_id
    and canje.origen = 'qr';

  if not found then
    raise exception 'Canje QR no encontrado para este negocio'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.listar_beneficios_regis_disponibles(uuid)
  from public, anon;
revoke all on function public.consultar_canje_regis_qr(text, uuid)
  from public, anon;

grant execute on function public.listar_beneficios_regis_disponibles(uuid)
  to authenticated;
grant execute on function public.consultar_canje_regis_qr(text, uuid)
  to authenticated;

comment on function public.listar_beneficios_regis_disponibles(uuid) is
  'Lista promociones y expone el porcentaje máximo real aplicable al canje.';
comment on function public.consultar_canje_regis_qr(text, uuid) is
  'Consulta una reserva QR e incluye todas las reglas necesarias para anticipar el descuento final.';
