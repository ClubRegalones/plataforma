begin;

alter table public.solicitudes_compra
add column monto_corregido integer;

alter table public.solicitudes_compra
add constraint solicitudes_compra_monto_corregido_valido
check (
  monto_corregido is null
  or (monto_corregido > 0 and monto_informado is not null)
);

comment on column public.solicitudes_compra.monto_informado is
  'Último monto ingresado por el vecino o, en asistencia, por el cajero.';

comment on column public.solicitudes_compra.monto_corregido is
  'Monto alternativo corregido directamente por el cajero; no reemplaza el informado.';

create or replace function public.corregir_solicitud_compra(
  p_solicitud_id uuid,
  p_monto integer,
  p_motivo text
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
  v_negocio_id uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto corregido debe ser mayor que cero'
      using errcode = '22003';
  end if;

  if char_length(v_motivo) < 3 or char_length(v_motivo) > 500 then
    raise exception 'El motivo debe tener entre 3 y 500 caracteres'
      using errcode = '22023';
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud de compra no encontrada'
      using errcode = 'P0002';
  end if;

  select sucursal.negocio_id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = v_solicitud.caja_id;

  if not public.es_miembro_negocio(v_negocio_id) then
    raise exception 'No tienes permisos para corregir esta solicitud'
      using errcode = '42501';
  end if;

  if v_solicitud.estado not in ('esperando_cajero', 'pendiente_validacion') then
    raise exception 'La solicitud no admite correcciones'
      using errcode = '23514';
  end if;

  if v_solicitud.expira_en <= now() then
    raise exception 'La solicitud está vencida'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set
    monto_corregido = p_monto,
    motivo_correccion = v_motivo,
    estado = 'pendiente_validacion'
  where id = p_solicitud_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

create or replace function public.solicitar_reingreso_monto(
  p_solicitud_id uuid,
  p_motivo text
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
  v_negocio_id uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if char_length(v_motivo) < 3 or char_length(v_motivo) > 500 then
    raise exception 'El motivo debe tener entre 3 y 500 caracteres'
      using errcode = '22023';
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud de compra no encontrada'
      using errcode = 'P0002';
  end if;

  select sucursal.negocio_id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = v_solicitud.caja_id;

  if not public.es_miembro_negocio(v_negocio_id) then
    raise exception 'No tienes permisos para solicitar la corrección'
      using errcode = '42501';
  end if;

  if v_solicitud.estado not in ('esperando_cajero', 'pendiente_validacion') then
    raise exception 'La solicitud no admite el reingreso del monto'
      using errcode = '23514';
  end if;

  if v_solicitud.expira_en <= now() then
    raise exception 'La solicitud está vencida'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set
    monto_informado = null,
    monto_corregido = null,
    informado_por = null,
    motivo_correccion = v_motivo,
    estado = 'esperando_monto'
  where id = p_solicitud_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

create or replace function public.aprobar_compra(
  p_solicitud_id uuid,
  p_folio_boleta text default null,
  p_origen public.origen_compra default 'autoservicio'
)
returns public.compras
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
  v_compra public.compras;
  v_sucursal_id uuid;
  v_negocio_id uuid;
begin
  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud de compra no encontrada'
      using errcode = 'P0002';
  end if;

  select caja.sucursal_id, sucursal.negocio_id
  into v_sucursal_id, v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  join public.negocios as negocio
    on negocio.id = sucursal.negocio_id
  where caja.id = v_solicitud.caja_id
    and caja.estado = 'activa'
    and sucursal.estado = 'activa'
    and negocio.estado = 'activo';

  if not found then
    raise exception 'La caja, sucursal o negocio no están activos'
      using errcode = '23514';
  end if;

  if not public.es_miembro_negocio(v_negocio_id) then
    raise exception 'No tienes permisos para aprobar esta compra'
      using errcode = '42501';
  end if;

  select compra.*
  into v_compra
  from public.compras as compra
  where compra.solicitud_id = p_solicitud_id;

  if found then
    return v_compra;
  end if;

  if v_solicitud.estado not in ('esperando_cajero', 'pendiente_validacion') then
    raise exception 'La solicitud no está lista para aprobación'
      using errcode = '23514';
  end if;

  if v_solicitud.expira_en <= now() then
    raise exception 'La solicitud está vencida'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set estado = 'aprobada'
  where id = p_solicitud_id
  returning * into v_solicitud;

  insert into public.compras (
    solicitud_id,
    negocio_id,
    sucursal_id,
    caja_id,
    vecino_id,
    cajero_id,
    monto_final,
    folio_boleta,
    origen
  )
  values (
    v_solicitud.id,
    v_negocio_id,
    v_sucursal_id,
    v_solicitud.caja_id,
    v_solicitud.vecino_id,
    (select auth.uid()),
    coalesce(v_solicitud.monto_corregido, v_solicitud.monto_informado),
    nullif(btrim(p_folio_boleta), ''),
    p_origen
  )
  returning * into v_compra;

  insert into public.vecinos_negocios (
    vecino_id,
    negocio_id,
    primera_compra_en,
    ultima_compra_en
  )
  values (
    v_solicitud.vecino_id,
    v_negocio_id,
    v_compra.creado_en,
    v_compra.creado_en
  )
  on conflict (vecino_id, negocio_id) do update
  set ultima_compra_en = excluded.ultima_compra_en;

  return v_compra;
end;
$$;

commit;
