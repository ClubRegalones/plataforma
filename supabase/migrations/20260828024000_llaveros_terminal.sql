begin;

-- ============================================================================
-- CLUB REGALONES
-- LLAVEROS NFC PARA TERMINAL PWA INDEPENDIENTE
--
-- La Terminal trabaja mediante:
--   turno_id + terminal_id + token_terminal
--
-- La caja y el negocio se derivan siempre del turno validado.
-- ============================================================================


-- ============================================================================
-- 1. AUDITORÍA DE ACTIVACIÓN POR TURNO
-- ============================================================================

alter table public.llaveros_nfc
  add column turno_caja_activacion_id uuid
    references public.turnos_caja (id) on delete restrict;

create index llaveros_turno_activacion_idx
  on public.llaveros_nfc (turno_caja_activacion_id)
  where turno_caja_activacion_id is not null;

alter table public.llaveros_nfc
  drop constraint if exists llaveros_nfc_activacion_auditada;

alter table public.llaveros_nfc
  add constraint llaveros_nfc_activacion_auditada check (
    activado_en is null
    or (
      activado_en is not null
      and caja_activacion_id is not null
      and metodo_verificacion_activacion is not null
      and (
        activado_por is not null
        or turno_caja_activacion_id is not null
      )
    )
  ) not valid;

comment on column public.llaveros_nfc.turno_caja_activacion_id is
  'Turno de caja que realizó la activación cuando ésta fue efectuada desde una Terminal PWA sin sesión humana de Supabase Auth.';


-- ============================================================================
-- 2. CONSISTENCIA TURNO <-> CAJA DE ACTIVACIÓN
-- ============================================================================

create function public.validar_turno_activacion_llavero()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_caja_turno uuid;
begin
  if new.turno_caja_activacion_id is null then
    return new;
  end if;

  select turno.caja_id
  into v_caja_turno
  from public.turnos_caja as turno
  where turno.id = new.turno_caja_activacion_id;

  if v_caja_turno is null
    or new.caja_activacion_id is distinct from v_caja_turno
  then
    raise exception 'El turno de activación no corresponde a la caja registrada'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger llaveros_validar_turno_activacion
before insert or update of turno_caja_activacion_id, caja_activacion_id
on public.llaveros_nfc
for each row
execute function public.validar_turno_activacion_llavero();


-- ============================================================================
-- 3. CONSULTAR LLAVERO DESDE TERMINAL
-- ============================================================================

create function public.terminal_consultar_llavero(
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
  v_turno public.turnos_caja;
  v_token text := btrim(coalesce(p_token, ''));
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
-- 4. CONSULTAR SALDO REGIS DEL LLAVERO
-- ============================================================================

create function public.terminal_consultar_saldo_llavero(
  p_token text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
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
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_token text := btrim(coalesce(p_token, ''));
  v_vecino_id uuid;
  v_nombre_negocio text;
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

  select negocio.nombre
  into v_nombre_negocio
  from public.negocios as negocio
  where negocio.id = v_turno.negocio_id
    and negocio.estado = 'activo';

  if v_nombre_negocio is null then
    raise exception 'El negocio de la Terminal ya no está activo'
      using errcode = '23514';
  end if;

  return query
  select
    v_turno.negocio_id,
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
    and saldo.negocio_id = v_turno.negocio_id;
end;
$$;


-- ============================================================================
-- 5. ACTIVAR LLAVERO DESDE TERMINAL
-- ============================================================================

create function public.terminal_activar_llavero(
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

      update public.llaveros_nfc
      set
        intentos_pin_fallidos = v_intentos,
        pin_bloqueado_hasta = case
          when v_intentos >= 3
            then clock_timestamp() + interval '15 minutes'
          else null
        end
      where id = v_llavero.id
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
    update public.llaveros_nfc
    set
      estado = case
        when estado = 'activo'
          then 'reemplazado'::public.estado_llavero_nfc
        else estado
      end,
      bloqueado_en = coalesce(bloqueado_en, clock_timestamp()),
      reemplazado_por_id = v_llavero.id
    where id = v_llavero_anterior.id;
  end if;

  update public.llaveros_nfc
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
  where id = v_llavero.id
  returning * into v_llavero;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  return query
  select
    true,
    'Llavero activado correctamente'::text,
    v_llavero.codigo_publico::text,
    v_llavero.estado,
    v_llavero.activado_en;
end;
$$;


-- ============================================================================
-- 6. CREAR COMPRA ASISTIDA MANUAL
-- ============================================================================

create function public.terminal_crear_compra_asistida(
  p_token text,
  p_monto integer,
  p_idempotency_key text,
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
  v_llavero public.llaveros_nfc;
  v_solicitud public.solicitudes_compra;
  v_token text := btrim(coalesce(p_token, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser un número entero mayor que cero'
      using errcode = '22003';
  end if;

  if char_length(v_token) < 8 or char_length(v_token) > 500 then
    raise exception 'El token del llavero no es válido'
      using errcode = '22023';
  end if;

  if char_length(v_idempotency_key) < 8
    or char_length(v_idempotency_key) > 200
  then
    raise exception 'idempotency_key debe tener entre 8 y 200 caracteres'
      using errcode = '22023';
  end if;

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
  where llavero.token_hash = encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    )
    and llavero.estado = 'activo'
    and perfil.estado = 'activo'
  for share of llavero;

  if not found then
    raise exception 'El llavero no existe, no está activo o su cuenta está inactiva'
      using errcode = 'P0002';
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.idempotency_key = v_idempotency_key;

  if found then
    if v_solicitud.vecino_id is distinct from v_llavero.vecino_id
      or v_solicitud.caja_id is distinct from v_turno.caja_id
      or v_solicitud.llavero_id is distinct from v_llavero.id
      or v_solicitud.monto_informado is distinct from p_monto
      or v_solicitud.turno_caja_id is distinct from v_turno.id
    then
      raise exception 'idempotency_key ya está en uso'
        using errcode = '23505';
    end if;

    return v_solicitud;
  end if;

  update public.solicitudes_compra
  set estado = 'vencida'
  where llavero_id = v_llavero.id
    and estado in (
      'esperando_monto',
      'esperando_cajero',
      'pendiente_validacion'
    )
    and expira_en <= clock_timestamp();

  if exists (
    select 1
    from public.solicitudes_compra as solicitud
    where solicitud.llavero_id = v_llavero.id
      and solicitud.estado in (
        'esperando_monto',
        'esperando_cajero',
        'pendiente_validacion'
      )
  ) then
    raise exception 'Ya existe una compra asistida pendiente para este llavero'
      using errcode = '23505';
  end if;

  insert into public.solicitudes_compra (
    vecino_id,
    caja_id,
    llavero_id,
    monto_informado,
    informado_por,
    estado,
    expira_en,
    idempotency_key,
    turno_caja_id
  )
  values (
    v_llavero.vecino_id,
    v_turno.caja_id,
    v_llavero.id,
    p_monto,
    'cajero',
    'pendiente_validacion',
    clock_timestamp() + interval '15 minutes',
    v_idempotency_key,
    v_turno.id
  )
  returning * into v_solicitud;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  return v_solicitud;
end;
$$;


-- ============================================================================
-- 7. PERMISOS
-- ============================================================================

revoke all on function public.validar_turno_activacion_llavero()
  from public, anon, authenticated;

revoke all on function public.terminal_consultar_llavero(
  text, uuid, uuid, text
) from public, anon, authenticated;

revoke all on function public.terminal_consultar_saldo_llavero(
  text, uuid, uuid, text
) from public, anon, authenticated;

revoke all on function public.terminal_activar_llavero(
  text,
  public.metodo_verificacion_llavero,
  text,
  boolean,
  uuid,
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.terminal_crear_compra_asistida(
  text,
  integer,
  text,
  uuid,
  uuid,
  text
) from public, anon, authenticated;


grant execute on function public.terminal_consultar_llavero(
  text, uuid, uuid, text
) to anon, authenticated;

grant execute on function public.terminal_consultar_saldo_llavero(
  text, uuid, uuid, text
) to anon, authenticated;

grant execute on function public.terminal_activar_llavero(
  text,
  public.metodo_verificacion_llavero,
  text,
  boolean,
  uuid,
  uuid,
  text
) to anon, authenticated;

grant execute on function public.terminal_crear_compra_asistida(
  text,
  integer,
  text,
  uuid,
  uuid,
  text
) to anon, authenticated;


comment on function public.terminal_consultar_llavero(
  text, uuid, uuid, text
) is
  'Consulta un llavero desde una Terminal PWA y deriva la caja desde el turno activo.';

comment on function public.terminal_activar_llavero(
  text,
  public.metodo_verificacion_llavero,
  text,
  boolean,
  uuid,
  uuid,
  text
) is
  'Activa un llavero desde una Terminal PWA y audita el turno de caja responsable.';

comment on function public.terminal_crear_compra_asistida(
  text,
  integer,
  text,
  uuid,
  uuid,
  text
) is
  'Crea una compra asistida manual desde una Terminal PWA sin depender de Supabase Auth humano.';

commit;