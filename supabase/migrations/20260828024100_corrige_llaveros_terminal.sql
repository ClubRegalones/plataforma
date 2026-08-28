begin;

-- ============================================================================
-- CLUB REGALONES
-- CORRECCIONES DE LINT EN API DE LLAVEROS TERMINAL
-- ============================================================================


-- ============================================================================
-- 1. CONSULTA DE LLAVERO
--
-- La validación del turno se ejecuta, pero no necesitamos conservar
-- el registro retornado.
-- ============================================================================

create or replace function public.terminal_consultar_llavero(
  p_token text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  codigo_publico text,
  nombre_vecino text,
  estado public.estado_llavero_nfc,
  entregado boolean,
  puede_activar boolean,
  tiene_pin boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := btrim(coalesce(p_token, ''));
begin
  perform public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if char_length(v_token) < 8 or char_length(v_token) > 500 then
    raise exception 'El token del llavero no es válido'
      using errcode = '22023';
  end if;

  return query
  select
    llavero.codigo_publico::text,
    concat_ws(' ', perfil.nombre, perfil.apellido)::text,
    llavero.estado,
    solicitud.estado = 'entregada',
    llavero.estado = 'sin_asignar'
      and solicitud.estado = 'entregada',
    llavero.pin_activacion_hash is not null
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
    and perfil.estado = 'activo'
  join public.solicitudes_llavero as solicitud
    on solicitud.id = llavero.solicitud_id
  where llavero.token_hash = encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    )
  limit 1;
end;
$$;


-- ============================================================================
-- 2. ACTIVACIÓN DE LLAVERO
--
-- Se califican explícitamente las columnas del llavero anterior para evitar
-- ambigüedad con los nombres de columnas devueltos por RETURNS TABLE.
-- ============================================================================

create or replace function public.terminal_activar_llavero(
  p_token text,
  p_metodo public.metodo_verificacion_llavero,
  p_pin text,
  p_identidad_verificada boolean,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  activado boolean,
  mensaje text,
  codigo_publico text,
  estado public.estado_llavero_nfc,
  activado_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_llavero public.llaveros_nfc;
  v_llavero_anterior public.llaveros_nfc;
  v_solicitud public.solicitudes_llavero;
  v_token text := btrim(coalesce(p_token, ''));
  v_pin text := btrim(coalesce(p_pin, ''));
  v_intentos smallint;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if char_length(v_token) < 8 or char_length(v_token) > 500 then
    raise exception 'El token del llavero no es válido'
      using errcode = '22023';
  end if;

  if p_metodo is null then
    raise exception 'Debes indicar un método de verificación'
      using errcode = '22023';
  end if;

  if p_metodo = 'sms' then
    raise exception 'La verificación por SMS todavía no está habilitada'
      using errcode = '0A000';
  end if;

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  where llavero.token_hash = encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    )
  for update;

  if not found then
    raise exception 'Llavero no encontrado'
      using errcode = 'P0002';
  end if;

  if v_llavero.estado = 'activo' then
    return query
    select
      true,
      'El llavero ya estaba activo'::text,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en;
    return;
  end if;

  if v_llavero.estado <> 'sin_asignar' then
    return query
    select
      false,
      'El estado del llavero no permite activarlo'::text,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en;
    return;
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_llavero as solicitud
  where solicitud.id = v_llavero.solicitud_id
  for update;

  if not found or v_solicitud.estado <> 'entregada' then
    return query
    select
      false,
      'El llavero todavía no figura como entregado'::text,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en;
    return;
  end if;

  if p_metodo = 'cedula' and not p_identidad_verificada then
    return query
    select
      false,
      'Debes confirmar la revisión presencial de la cédula'::text,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en;
    return;
  end if;

  if p_metodo = 'pin' then
    if v_llavero.pin_activacion_hash is null then
      return query
      select
        false,
        'Este llavero no tiene un PIN configurado'::text,
        v_llavero.codigo_publico::text,
        v_llavero.estado,
        v_llavero.activado_en;
      return;
    end if;

    if v_llavero.pin_bloqueado_hasta is not null
      and v_llavero.pin_bloqueado_hasta > clock_timestamp()
    then
      return query
      select
        false,
        'El PIN está bloqueado temporalmente por intentos fallidos'::text,
        v_llavero.codigo_publico::text,
        v_llavero.estado,
        v_llavero.activado_en;
      return;
    end if;

    if v_pin !~ '^[0-9]{4,6}$'
      or extensions.crypt(v_pin, v_llavero.pin_activacion_hash)
        <> v_llavero.pin_activacion_hash
    then
      v_intentos := least(v_llavero.intentos_pin_fallidos + 1, 3);

      update public.llaveros_nfc as llavero_fallido
      set
        intentos_pin_fallidos = v_intentos,
        pin_bloqueado_hasta = case
          when v_intentos >= 3
            then clock_timestamp() + interval '15 minutes'
          else null
        end
      where llavero_fallido.id = v_llavero.id
      returning * into v_llavero;

      return query
      select
        false,
        case
          when v_intentos >= 3
            then 'PIN incorrecto. El llavero quedó bloqueado por 15 minutos.'
          else 'El PIN no es correcto.'
        end::text,
        v_llavero.codigo_publico::text,
        v_llavero.estado,
        v_llavero.activado_en;
      return;
    end if;
  end if;

  select llavero.*
  into v_llavero_anterior
  from public.llaveros_nfc as llavero
  where llavero.vecino_id = v_llavero.vecino_id
    and llavero.id <> v_llavero.id
    and llavero.reemplazado_por_id is null
    and llavero.estado in ('activo', 'bloqueado', 'perdido')
  order by coalesce(
    llavero.activado_en,
    llavero.asignado_en,
    llavero.creado_en
  ) desc
  limit 1
  for update;

  if v_llavero_anterior.id is not null then
    update public.llaveros_nfc as anterior
    set
      estado = case
        when anterior.estado = 'activo'
          then 'reemplazado'::public.estado_llavero_nfc
        else anterior.estado
      end,
      bloqueado_en = coalesce(
        anterior.bloqueado_en,
        clock_timestamp()
      ),
      reemplazado_por_id = v_llavero.id
    where anterior.id = v_llavero_anterior.id;
  end if;

  update public.llaveros_nfc as objetivo
  set
    estado = 'activo',
    asignado_en = clock_timestamp(),
    asignado_por = null,
    activado_en = clock_timestamp(),
    activado_por = null,
    caja_activacion_id = v_turno.caja_id,
    turno_caja_activacion_id = v_turno.id,
    metodo_verificacion_activacion = p_metodo,
    intentos_pin_fallidos = 0,
    pin_bloqueado_hasta = null
  where objetivo.id = v_llavero.id
  returning * into v_llavero;

  update public.turnos_caja as turno
  set ultima_actividad_en = clock_timestamp()
  where turno.id = v_turno.id;

  return query
  select
    true,
    'Llavero activado correctamente'::text,
    v_llavero.codigo_publico::text,
    v_llavero.estado,
    v_llavero.activado_en;
end;
$$;

comment on function public.terminal_consultar_llavero(
  text,
  uuid,
  uuid,
  text
) is
  'Consulta un llavero desde una Terminal PWA después de validar la credencial física y el turno activo.';

comment on function public.terminal_activar_llavero(
  text,
  public.metodo_verificacion_llavero,
  text,
  boolean,
  uuid,
  uuid,
  text
) is
  'Activa un llavero desde una Terminal PWA y registra el turno de caja responsable.';

commit;