begin;

-- ============================================================================
-- CLUB REGALONES
-- HARDENING 1C-B2B
-- ACTIVACION DE LLAVERO + CREACION DEL PIN DE SEGURIDAD
--
-- Cualquier cajero activo de App Negocio puede realizar la activación si:
--   - existe un turno válido y abierto;
--   - la Terminal pertenece a la caja/sucursal/negocio;
--   - el cajero sigue activo y asignado a esa sucursal;
--   - el llavero fue entregado al vecino;
--   - se declara revisión presencial de la cédula;
--   - el vecino crea su PIN de seguridad de exactamente 4 dígitos.
--
-- La responsabilidad queda trazada mediante turno_caja_activacion_id.
--
-- NO se almacena RUT.
-- NO se fotografía la cédula.
-- NO se almacena información del documento.
-- ============================================================================


-- ============================================================================
-- 1. GUARD DE BASE DE DATOS
--
-- También protege frente a una llamada a la RPC legacy desde App Negocio.
-- Si el turno tiene cajero_negocio_id, no se puede pasar a ACTIVO sin:
--   - cajero válido;
--   - PIN de seguridad;
--   - verificación por cédula.
--
-- Terminal legacy mantiene cajero_negocio_id = null y no cambia.
-- ============================================================================

create function public.validar_activacion_llavero_app_negocio_interna()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_sucursal_id uuid;
begin

  -- Solo protegemos la transición inicial hacia ACTIVO.
  if tg_op = 'UPDATE'
    and old.estado = 'activo'
  then
    return new;
  end if;


  if new.estado <> 'activo'
    or new.turno_caja_activacion_id is null
  then
    return new;
  end if;


  select turno.*
  into v_turno
  from public.turnos_caja as turno
  where turno.id = new.turno_caja_activacion_id;


  if not found then
    raise exception
      'El turno de activación no existe'
      using errcode = '23514';
  end if;


  -- Terminal PWA heredada.
  if v_turno.cajero_negocio_id is null then
    return new;
  end if;


  if v_turno.estado <> 'abierto' then
    raise exception
      'La activación requiere un turno de App Negocio abierto'
      using errcode = '42501';
  end if;


  select caja.sucursal_id
  into v_sucursal_id
  from public.cajas as caja
  where caja.id = v_turno.caja_id
    and caja.estado = 'activa';


  if v_sucursal_id is null then
    raise exception
      'La caja del turno ya no está activa'
      using errcode = '42501';
  end if;


  -- Cualquier cajero sirve, pero debe continuar activo,
  -- pertenecer al mismo negocio y estar asignado a la sucursal.

  if not exists (
    select 1
    from public.cajeros_negocio as cajero
    join public.cajeros_sucursales as asignacion
      on asignacion.cajero_id = cajero.id
    where cajero.id = v_turno.cajero_negocio_id
      and cajero.negocio_id = v_turno.negocio_id
      and cajero.estado = 'activo'
      and asignacion.sucursal_id = v_sucursal_id
  ) then
    raise exception
      'El cajero del turno ya no está habilitado en esta sucursal'
      using errcode = '42501';
  end if;


  if new.pin_seguridad_hash is null
    or new.pin_seguridad_configurado_en is null
    or new.pin_seguridad_actualizado_en is null
  then
    raise exception
      'App Negocio no puede activar un llavero sin crear su PIN de seguridad'
      using errcode = '42501';
  end if;


  if new.metodo_verificacion_activacion
    is distinct from 'cedula'::public.metodo_verificacion_llavero
  then
    raise exception
      'La activación presencial requiere revisión de cédula'
      using errcode = '42501';
  end if;


  return new;

end;
$$;


drop trigger if exists
  llaveros_nfc_validar_activacion_app_negocio
on public.llaveros_nfc;


create trigger llaveros_nfc_validar_activacion_app_negocio
before insert
or update of
  estado,
  turno_caja_activacion_id,
  caja_activacion_id,
  metodo_verificacion_activacion,
  pin_seguridad_hash
on public.llaveros_nfc
for each row
execute function public.validar_activacion_llavero_app_negocio_interna();


-- ============================================================================
-- 2. CONSULTAR LLAVERO PARA ACTIVACION
--
-- Solo devuelve información mínima para comparar presencialmente:
--   nombre + código público + estado + entrega.
--
-- No devuelve RUT, teléfono, hashes ni datos del documento.
-- ============================================================================

create function public.terminal_consultar_activacion_llavero_app_negocio(
  p_codigo_publico text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  llavero_id uuid,
  codigo_publico text,
  nombre_vecino text,
  estado public.estado_llavero_nfc,
  entregado boolean,
  puede_activar boolean,
  tiene_pin_seguridad boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_codigo text :=
    upper(btrim(coalesce(p_codigo_publico, '')));
begin

  -- Esta función ya comprueba Terminal, turno, negocio,
  -- cajero activo y asignación a sucursal.

  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );


  if v_turno.cajero_negocio_id is null then
    raise exception
      'Esta operación requiere un turno de App Negocio'
      using errcode = '42501';
  end if;


  if char_length(v_codigo) < 1
    or char_length(v_codigo) > 80
  then
    raise exception
      'El código del llavero no es válido'
      using errcode = '22023';
  end if;


  return query
  select
    llavero.id,
    llavero.codigo_publico::text,

    concat_ws(
      ' ',
      perfil.nombre,
      perfil.apellido
    )::text,

    llavero.estado,

    solicitud.estado = 'entregada',

    (
      llavero.estado = 'sin_asignar'
      and solicitud.estado = 'entregada'
      and perfil.estado = 'activo'
    ),

    llavero.pin_seguridad_hash is not null

  from public.llaveros_nfc as llavero

  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id

  join public.solicitudes_llavero as solicitud
    on solicitud.id = llavero.solicitud_id

  where upper(llavero.codigo_publico::text) = v_codigo

  limit 1;


  if not found then
    raise exception
      'No encontramos el llavero indicado'
      using errcode = 'P0002';
  end if;


  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

end;
$$;


-- ============================================================================
-- 3. ACTIVACION SEGURA DESDE APP NEGOCIO
--
-- La revisión de la cédula es una comprobación humana.
-- Supabase registra quién estaba operando mediante el turno.
--
-- F12 no entrega una capacidad adicional: el cajero autorizado también podría
-- pulsar el mismo botón en la UI. La responsabilidad queda asociada al turno.
--
-- Activación + PIN se escriben atómicamente.
-- ============================================================================

create function public.terminal_activar_llavero_app_negocio(
  p_codigo_publico text,
  p_pin_seguridad text,
  p_identidad_verificada boolean,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  activado boolean,
  mensaje text,
  llavero_id uuid,
  codigo_publico text,
  estado public.estado_llavero_nfc,
  activado_en timestamptz,
  pin_configurado boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_llavero public.llaveros_nfc;
  v_anterior public.llaveros_nfc;
  v_solicitud public.solicitudes_llavero;

  v_codigo text :=
    upper(btrim(coalesce(p_codigo_publico, '')));

  v_pin text :=
    btrim(coalesce(p_pin_seguridad, ''));

  v_ahora timestamptz :=
    clock_timestamp();
begin

  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );


  if v_turno.cajero_negocio_id is null then
    raise exception
      'Esta operación requiere un turno de App Negocio'
      using errcode = '42501';
  end if;


  if not coalesce(p_identidad_verificada, false) then
    raise exception
      'Debes confirmar la revisión presencial de la cédula'
      using errcode = '42501';
  end if;


  if v_pin !~ '^[0-9]{4}$' then
    raise exception
      'El PIN de seguridad debe tener exactamente 4 dígitos'
      using errcode = '22023';
  end if;


  if char_length(v_codigo) < 1
    or char_length(v_codigo) > 80
  then
    raise exception
      'El código del llavero no es válido'
      using errcode = '22023';
  end if;


  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero

  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
    and perfil.estado = 'activo'

  where upper(llavero.codigo_publico::text) = v_codigo

  for update of llavero;


  if not found then
    raise exception
      'Llavero no encontrado o vecino inactivo'
      using errcode = 'P0002';
  end if;


  -- Esta ruta jamás sirve para cambiar el PIN de un llavero activo.

  if v_llavero.estado = 'activo' then

    return query
    select
      false,
      'El llavero ya está activo. Si olvidaste tu PIN, utiliza el flujo de recuperación.'::text,
      v_llavero.id,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en,
      v_llavero.pin_seguridad_hash is not null;

    return;

  end if;


  if v_llavero.estado <> 'sin_asignar' then

    return query
    select
      false,
      'El estado del llavero no permite activarlo.'::text,
      v_llavero.id,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en,
      v_llavero.pin_seguridad_hash is not null;

    return;

  end if;


  select solicitud.*
  into v_solicitud
  from public.solicitudes_llavero as solicitud
  where solicitud.id = v_llavero.solicitud_id
  for update;


  if not found
    or v_solicitud.estado <> 'entregada'
  then

    return query
    select
      false,
      'El llavero todavía no figura como entregado.'::text,
      v_llavero.id,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en,
      false;

    return;

  end if;


  -- Un vecino mantiene solo un llavero activo.

  select anterior.*
  into v_anterior
  from public.llaveros_nfc as anterior
  where anterior.vecino_id = v_llavero.vecino_id
    and anterior.id <> v_llavero.id
    and anterior.reemplazado_por_id is null
    and anterior.estado in (
      'activo',
      'bloqueado',
      'perdido'
    )
  order by coalesce(
    anterior.activado_en,
    anterior.asignado_en,
    anterior.creado_en
  ) desc
  limit 1
  for update;


  if v_anterior.id is not null then

    update public.llaveros_nfc as anterior
    set
      estado = case
        when anterior.estado = 'activo'
          then 'reemplazado'::public.estado_llavero_nfc
        else anterior.estado
      end,

      bloqueado_en =
        coalesce(anterior.bloqueado_en, v_ahora),

      reemplazado_por_id =
        v_llavero.id

    where anterior.id = v_anterior.id;

  end if;


  -- Activación + PIN + auditoría del turno en una sola transacción.

  update public.llaveros_nfc
  set
    estado = 'activo',

    asignado_en = v_ahora,
    asignado_por = null,

    activado_en = v_ahora,
    activado_por = null,

    caja_activacion_id =
      v_turno.caja_id,

    turno_caja_activacion_id =
      v_turno.id,

    metodo_verificacion_activacion =
      'cedula',

    -- Estado legacy se limpia, pero NO reutilizamos pin_activacion_hash.
    intentos_pin_fallidos = 0,
    pin_bloqueado_hasta = null,

    pin_seguridad_hash =
      extensions.crypt(
        v_pin,
        extensions.gen_salt('bf', 10)
      ),

    pin_seguridad_intentos_fallidos = 0,
    pin_seguridad_bloqueado_hasta = null,

    pin_seguridad_configurado_en =
      coalesce(
        pin_seguridad_configurado_en,
        v_ahora
      ),

    pin_seguridad_actualizado_en =
      v_ahora

  where id = v_llavero.id

  returning *
  into v_llavero;


  update public.turnos_caja
  set ultima_actividad_en = v_ahora
  where id = v_turno.id;


  return query
  select
    true,
    'Llavero activado. Tu PIN de seguridad quedó configurado.'::text,
    v_llavero.id,
    v_llavero.codigo_publico::text,
    v_llavero.estado,
    v_llavero.activado_en,
    true;

end;
$$;


-- ============================================================================
-- 4. PERMISOS
-- ============================================================================

revoke all on function
  public.validar_activacion_llavero_app_negocio_interna()
from public, anon, authenticated;


revoke all on function
  public.terminal_consultar_activacion_llavero_app_negocio(
    text,
    uuid,
    uuid,
    text
  )
from public, anon, authenticated;


grant execute on function
  public.terminal_consultar_activacion_llavero_app_negocio(
    text,
    uuid,
    uuid,
    text
  )
to anon, authenticated;


revoke all on function
  public.terminal_activar_llavero_app_negocio(
    text,
    text,
    boolean,
    uuid,
    uuid,
    text
  )
from public, anon, authenticated;


grant execute on function
  public.terminal_activar_llavero_app_negocio(
    text,
    text,
    boolean,
    uuid,
    uuid,
    text
  )
to anon, authenticated;


comment on function
  public.terminal_activar_llavero_app_negocio(
    text,
    text,
    boolean,
    uuid,
    uuid,
    text
  )
is
  'Activa un llavero entregado desde App Negocio con cajero activo, turno válido, revisión presencial de cédula y creación atómica del PIN de seguridad de 4 dígitos.';


commit;