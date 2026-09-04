begin;

-- ============================================================================
-- CLUB REGALONES
-- OPERACIONES DE COMPRA EXCLUSIVAS DE TERMINAL PWA
--
-- El Portal Comercio conserva sus RPC autenticadas existentes.
--
-- La Terminal trabaja mediante:
--   terminal_id + token_terminal + turno_id
--
-- Supabase resuelve siempre:
--   Terminal -> Caja -> Sucursal -> Negocio
--
-- El frontend NO determina libremente el negocio/caja de una operación.
-- ============================================================================


-- ============================================================================
-- 1. TRAZABILIDAD DEL CAJERO
--
-- Las compras hechas desde Portal pueden continuar usando cajero_id = auth.uid().
--
-- Las compras hechas desde Terminal se identifican por turno_caja_id.
-- El nombre humano del cajero queda almacenado en turnos_caja.nombre_cajero.
-- ============================================================================

alter table public.compras
  alter column cajero_id drop not null;

comment on column public.compras.cajero_id is
  'Usuario autenticado que aprobó la compra cuando corresponde. En Terminal PWA puede ser null; la atribución humana se realiza mediante turno_caja_id y turnos_caja.nombre_cajero.';


-- ============================================================================
-- 2. VALIDAR TURNO INTERNO
-- ============================================================================

create function public.validar_turno_terminal_interno(
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.turnos_caja
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.terminales;
  v_turno public.turnos_caja;
  v_negocio_id uuid;
begin
  v_terminal := public.validar_credencial_terminal_interna(
    p_terminal_id,
    p_token_terminal
  );

  select sucursal.negocio_id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = v_terminal.caja_id;

  select turno.*
  into v_turno
  from public.turnos_caja as turno
  where turno.id = p_turno_id
    and turno.terminal_id = v_terminal.id
    and turno.caja_id = v_terminal.caja_id
    and turno.negocio_id = v_negocio_id
    and turno.estado = 'abierto'
  for update;

  if not found then
    raise exception 'Debes iniciar un turno válido en esta Terminal'
      using errcode = '42501';
  end if;

  return v_turno;
end;
$$;


-- ============================================================================
-- 3. OBTENER SOLICITUD DE LA CAJA DEL TURNO
-- ============================================================================

create function public.obtener_solicitud_terminal_interna(
  p_solicitud_id uuid,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_solicitud public.solicitudes_compra;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.id = p_solicitud_id
    and solicitud.caja_id = v_turno.caja_id
  for update;

  if not found then
    raise exception 'La solicitud no existe o no pertenece a la caja de esta Terminal'
      using errcode = '42501';
  end if;

  return v_solicitud;
end;
$$;


-- ============================================================================
-- 4. INFORMAR MONTO DESDE TERMINAL
-- ============================================================================

create function public.terminal_informar_monto(
  p_solicitud_id uuid,
  p_monto integer,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto informado debe ser mayor que cero'
      using errcode = '22003';
  end if;

  v_solicitud := public.obtener_solicitud_terminal_interna(
    p_solicitud_id,
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if v_solicitud.estado <> 'esperando_monto' then
    raise exception 'La solicitud ya recibió un monto o fue procesada'
      using errcode = '23514';
  end if;

  if v_solicitud.expira_en <= clock_timestamp() then
    raise exception 'La solicitud está vencida'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set
    monto_informado = p_monto,
    monto_corregido = null,
    informado_por = 'cajero',
    estado = 'pendiente_validacion',
    turno_caja_id = p_turno_id
  where id = p_solicitud_id
  returning * into v_solicitud;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = p_turno_id;

  return v_solicitud;
end;
$$;


-- ============================================================================
-- 5. CORREGIR MONTO DESDE TERMINAL
--
-- monto_informado se conserva.
-- monto_corregido guarda la modificación hecha por caja.
-- ============================================================================

create function public.terminal_corregir_monto(
  p_solicitud_id uuid,
  p_monto integer,
  p_motivo text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
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

  v_solicitud := public.obtener_solicitud_terminal_interna(
    p_solicitud_id,
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if v_solicitud.estado not in (
    'esperando_cajero',
    'pendiente_validacion'
  ) then
    raise exception 'La solicitud no admite correcciones'
      using errcode = '23514';
  end if;

  if v_solicitud.monto_informado is null then
    raise exception 'La solicitud todavía no tiene un monto informado'
      using errcode = '23514';
  end if;

  if v_solicitud.expira_en <= clock_timestamp() then
    raise exception 'La solicitud está vencida'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set
    monto_corregido = p_monto,
    motivo_correccion = v_motivo,
    estado = 'pendiente_validacion',
    turno_caja_id = p_turno_id
  where id = p_solicitud_id
  returning * into v_solicitud;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = p_turno_id;

  return v_solicitud;
end;
$$;


-- ============================================================================
-- 6. PEDIR AL VECINO QUE REINGRESE EL MONTO
-- ============================================================================

create function public.terminal_solicitar_reingreso_monto(
  p_solicitud_id uuid,
  p_motivo text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if char_length(v_motivo) < 3 or char_length(v_motivo) > 500 then
    raise exception 'El motivo debe tener entre 3 y 500 caracteres'
      using errcode = '22023';
  end if;

  v_solicitud := public.obtener_solicitud_terminal_interna(
    p_solicitud_id,
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if v_solicitud.llavero_id is not null then
    raise exception 'Las compras asistidas con llavero no utilizan reingreso remoto'
      using errcode = '23514';
  end if;

  if v_solicitud.estado not in (
    'esperando_cajero',
    'pendiente_validacion'
  ) then
    raise exception 'La solicitud no admite el reingreso del monto'
      using errcode = '23514';
  end if;

  if v_solicitud.expira_en <= clock_timestamp() then
    raise exception 'La solicitud está vencida'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set
    monto_informado = null,
    monto_corregido = null,
    informado_por = null,
    motivo_correccion = v_motivo,
    estado = 'esperando_monto',
    turno_caja_id = p_turno_id
  where id = p_solicitud_id
  returning * into v_solicitud;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = p_turno_id;

  return v_solicitud;
end;
$$;


-- ============================================================================
-- 7. RECHAZAR SOLICITUD DESDE TERMINAL
-- ============================================================================

create function public.terminal_rechazar_compra(
  p_solicitud_id uuid,
  p_motivo text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if char_length(v_motivo) < 3 or char_length(v_motivo) > 500 then
    raise exception 'El motivo debe tener entre 3 y 500 caracteres'
      using errcode = '22023';
  end if;

  v_solicitud := public.obtener_solicitud_terminal_interna(
    p_solicitud_id,
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if v_solicitud.estado in (
    'aprobada',
    'rechazada',
    'vencida',
    'cancelada'
  ) then
    raise exception 'La solicitud ya fue procesada'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set
    estado = 'rechazada',
    motivo_rechazo = v_motivo,
    turno_caja_id = p_turno_id
  where id = p_solicitud_id
  returning * into v_solicitud;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = p_turno_id;

  return v_solicitud;
end;
$$;


-- ============================================================================
-- 8. APROBAR COMPRA DESDE TERMINAL
--
-- Esta función replica las reglas de aprobación actuales sin depender
-- de auth.uid() ni miembros_negocio.
--
-- IMPORTANTE:
-- - caja y negocio se obtienen desde la Terminal/turno.
-- - cajero_id queda null.
-- - turno_caja_id conserva la trazabilidad humana.
-- - se mantiene la acreditación REGIS existente.
-- ============================================================================

create function public.terminal_aprobar_compra(
  p_solicitud_id uuid,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text,
  p_folio_boleta text default null,
  p_origen public.origen_compra default 'autoservicio'
)
returns public.compras
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_solicitud public.solicitudes_compra;
  v_compra public.compras;
  v_sucursal_id uuid;
  v_negocio_id uuid;
  v_monto_final integer;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  v_solicitud := public.obtener_solicitud_terminal_interna(
    p_solicitud_id,
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  select
    caja.sucursal_id,
    sucursal.negocio_id
  into
    v_sucursal_id,
    v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  join public.negocios as negocio
    on negocio.id = sucursal.negocio_id
  where caja.id = v_turno.caja_id
    and caja.estado = 'activa'
    and sucursal.estado = 'activa'
    and negocio.estado = 'activo';

  if not found or v_negocio_id <> v_turno.negocio_id then
    raise exception 'La caja, sucursal o negocio de la Terminal no están activos'
      using errcode = '23514';
  end if;

  select compra.*
  into v_compra
  from public.compras as compra
  where compra.solicitud_id = p_solicitud_id;

  if found then
    if v_compra.turno_caja_id = v_turno.id then
      return v_compra;
    end if;

    raise exception 'La solicitud ya fue aprobada fuera de este turno'
      using errcode = '23514';
  end if;

  if v_solicitud.llavero_id is not null
    and not exists (
      select 1
      from public.llaveros_nfc as llavero
      where llavero.id = v_solicitud.llavero_id
        and llavero.vecino_id = v_solicitud.vecino_id
        and llavero.estado = 'activo'
    )
  then
    raise exception 'El llavero de la compra asistida ya no está activo'
      using errcode = '23514';
  end if;

  if v_solicitud.estado not in (
    'esperando_cajero',
    'pendiente_validacion'
  ) then
    raise exception 'La solicitud no está lista para aprobación'
      using errcode = '23514';
  end if;

  if v_solicitud.expira_en <= clock_timestamp() then
    raise exception 'La solicitud está vencida'
      using errcode = '23514';
  end if;

  v_monto_final := coalesce(
    v_solicitud.monto_corregido,
    v_solicitud.monto_informado
  );

  if v_monto_final is null or v_monto_final <= 0 then
    raise exception 'La solicitud no tiene un monto válido para aprobar'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set
    estado = 'aprobada',
    turno_caja_id = v_turno.id
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
    origen,
    turno_caja_id
  )
  values (
    v_solicitud.id,
    v_negocio_id,
    v_sucursal_id,
    v_turno.caja_id,
    v_solicitud.vecino_id,
    null,
    v_monto_final,
    nullif(btrim(p_folio_boleta), ''),
    case
      when v_solicitud.llavero_id is not null
        then 'asistido'::public.origen_compra
      else p_origen
    end,
    v_turno.id
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

  perform public.acreditar_regis_compra(v_compra.id);

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  select compra.*
  into v_compra
  from public.compras as compra
  where compra.id = v_compra.id;

  return v_compra;
end;
$$;


-- ============================================================================
-- 9. PERMISOS
--
-- Helpers internos: nunca expuestos.
-- API Terminal: ejecutable con rol anon o authenticated.
-- ============================================================================

revoke all on function public.validar_turno_terminal_interno(
  uuid,
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.obtener_solicitud_terminal_interna(
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated;


revoke all on function public.terminal_informar_monto(
  uuid,
  integer,
  uuid,
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.terminal_corregir_monto(
  uuid,
  integer,
  text,
  uuid,
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.terminal_solicitar_reingreso_monto(
  uuid,
  text,
  uuid,
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.terminal_rechazar_compra(
  uuid,
  text,
  uuid,
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.terminal_aprobar_compra(
  uuid,
  uuid,
  uuid,
  text,
  text,
  public.origen_compra
) from public, anon, authenticated;


grant execute on function public.terminal_informar_monto(
  uuid,
  integer,
  uuid,
  uuid,
  text
) to anon, authenticated;

grant execute on function public.terminal_corregir_monto(
  uuid,
  integer,
  text,
  uuid,
  uuid,
  text
) to anon, authenticated;

grant execute on function public.terminal_solicitar_reingreso_monto(
  uuid,
  text,
  uuid,
  uuid,
  text
) to anon, authenticated;

grant execute on function public.terminal_rechazar_compra(
  uuid,
  text,
  uuid,
  uuid,
  text
) to anon, authenticated;

grant execute on function public.terminal_aprobar_compra(
  uuid,
  uuid,
  uuid,
  text,
  text,
  public.origen_compra
) to anon, authenticated;


comment on function public.terminal_aprobar_compra(
  uuid,
  uuid,
  uuid,
  text,
  text,
  public.origen_compra
) is
  'Aprueba una compra desde una Terminal PWA identificada físicamente. Negocio, sucursal y caja se derivan del dispositivo y del turno, no del frontend.';

commit;