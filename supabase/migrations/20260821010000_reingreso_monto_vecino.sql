begin;

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
    monto_informado = p_monto,
    informado_por = 'cajero',
    motivo_correccion = v_motivo,
    estado = 'pendiente_validacion'
  where id = p_solicitud_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

create function public.solicitar_reingreso_monto(
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
    informado_por = null,
    motivo_correccion = v_motivo,
    estado = 'esperando_monto'
  where id = p_solicitud_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

revoke all on function public.solicitar_reingreso_monto(uuid, text)
  from public, anon;

grant execute on function public.solicitar_reingreso_monto(uuid, text)
  to authenticated;

comment on function public.solicitar_reingreso_monto(uuid, text) is
  'Permite al comercio devolver una solicitud al vecino para reingresar el monto.';

commit;
