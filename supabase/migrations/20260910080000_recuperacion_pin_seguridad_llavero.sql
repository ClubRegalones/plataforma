begin;

-- ============================================================================
-- CLUB REGALONES
-- HARDENING 1C-B3
-- RECUPERACION SEGURA DEL PIN DEL LLAVERO
--
-- Flujo:
--
-- Cajero + turno App Negocio + revisión física de cédula
--        ↓
-- Solicitud pendiente
--        ↓
-- Propietario / administrador autenticado aprueba
--        ↓
-- Vecino crea PIN nuevo
--        ↓
-- Se invalidan reservas de canje hechas con autorización anterior
--
-- La recuperación por sí sola JAMÁS autoriza un canje.
-- ============================================================================


create type public.estado_recuperacion_pin_llavero as enum (
  'pendiente',
  'aprobada',
  'completada',
  'expirada'
);


create table public.recuperaciones_pin_llavero (
  id uuid primary key default gen_random_uuid(),

  llavero_id uuid not null
    references public.llaveros_nfc (id) on delete restrict,

  vecino_id uuid not null
    references public.perfiles (id) on delete restrict,

  negocio_id uuid not null
    references public.negocios (id) on delete restrict,

  sucursal_id uuid not null
    references public.sucursales (id) on delete restrict,

  caja_id uuid not null
    references public.cajas (id) on delete restrict,

  turno_caja_id uuid not null
    references public.turnos_caja (id) on delete restrict,

  cajero_negocio_id uuid not null
    references public.cajeros_negocio (id) on delete restrict,

  estado public.estado_recuperacion_pin_llavero
    not null default 'pendiente',

  identidad_verificada_en timestamptz not null,

  idempotency_key text not null unique,

  solicitada_en timestamptz not null default clock_timestamp(),
  expira_en timestamptz not null,

  aprobada_por uuid
    references auth.users (id) on delete restrict,

  aprobada_en timestamptz,
  completar_antes timestamptz,

  completada_en timestamptz,

  actualizado_en timestamptz not null default clock_timestamp(),

  constraint recuperaciones_pin_idempotencia_valida
    check (
      char_length(btrim(idempotency_key)) between 8 and 200
    ),

  constraint recuperaciones_pin_vigencia_valida
    check (
      expira_en > solicitada_en
    ),

  constraint recuperaciones_pin_estado_consistente
    check (
      (
        estado = 'pendiente'
        and aprobada_por is null
        and aprobada_en is null
        and completar_antes is null
        and completada_en is null
      )
      or
      (
        estado = 'aprobada'
        and aprobada_por is not null
        and aprobada_en is not null
        and completar_antes is not null
        and completada_en is null
      )
      or
      (
        estado = 'completada'
        and aprobada_por is not null
        and aprobada_en is not null
        and completar_antes is not null
        and completada_en is not null
      )
      or
      estado = 'expirada'
    )
);


create unique index recuperaciones_pin_llavero_vigente_unica
  on public.recuperaciones_pin_llavero (llavero_id)
  where estado in ('pendiente', 'aprobada');


create index recuperaciones_pin_negocio_estado_idx
  on public.recuperaciones_pin_llavero (
    negocio_id,
    estado,
    solicitada_en desc
  );


create index recuperaciones_pin_turno_idx
  on public.recuperaciones_pin_llavero (
    turno_caja_id,
    solicitada_en desc
  );


alter table public.recuperaciones_pin_llavero
  enable row level security;


revoke all
on table public.recuperaciones_pin_llavero
from public, anon, authenticated;


comment on table public.recuperaciones_pin_llavero is
  'Auditoría del flujo Olvidé mi PIN. Registra cajero, turno, negocio y aprobación administrativa, pero nunca guarda el PIN ni datos de la cédula.';


-- ============================================================================
-- EXPIRACION INTERNA
-- ============================================================================

create function public.expirar_recuperaciones_pin_llavero_interno()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_ahora timestamptz := clock_timestamp();
begin

  update public.recuperaciones_pin_llavero as recuperacion
  set
    estado = 'expirada',
    actualizado_en = v_ahora

  where recuperacion.estado = 'pendiente'
    and recuperacion.expira_en <= v_ahora

     or recuperacion.estado = 'aprobada'
    and recuperacion.completar_antes <= v_ahora;


  get diagnostics v_total = row_count;

  return v_total;

end;
$$;


-- ============================================================================
-- INICIAR RECUPERACION DESDE APP NEGOCIO
-- ============================================================================

create function public.terminal_iniciar_recuperacion_pin_llavero(
  p_llavero_id uuid,
  p_identidad_verificada boolean,
  p_idempotency_key text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  recuperacion_id uuid,
  estado public.estado_recuperacion_pin_llavero,
  nombre_vecino text,
  codigo_publico text,
  solicitada_en timestamptz,
  expira_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_llavero public.llaveros_nfc;
  v_recuperacion public.recuperaciones_pin_llavero;

  v_sucursal_id uuid;
  v_nombre_vecino text;

  v_key text :=
    btrim(coalesce(p_idempotency_key, ''));

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


  if char_length(v_key) < 8
    or char_length(v_key) > 200
  then
    raise exception
      'La clave idempotente no es válida'
      using errcode = '22023';
  end if;


  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero

  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
    and perfil.estado = 'activo'

  where llavero.id = p_llavero_id
    and llavero.estado = 'activo'
    and llavero.pin_seguridad_hash is not null

  for update of llavero;


  if not found then
    raise exception
      'No encontramos un llavero activo con PIN configurado'
      using errcode = 'P0002';
  end if;


  select
    concat_ws(' ', perfil.nombre, perfil.apellido)::text
  into v_nombre_vecino
  from public.perfiles as perfil
  where perfil.id = v_llavero.vecino_id;


  select caja.sucursal_id
  into v_sucursal_id
  from public.cajas as caja
  where caja.id = v_turno.caja_id;


  -- Retry idempotente.

  select recuperacion.*
  into v_recuperacion
  from public.recuperaciones_pin_llavero as recuperacion
  where recuperacion.idempotency_key = v_key;


  if found then

    if v_recuperacion.llavero_id
        is distinct from v_llavero.id
      or v_recuperacion.turno_caja_id
        is distinct from v_turno.id
    then
      raise exception
        'La clave idempotente pertenece a otra recuperación'
        using errcode = '23514';
    end if;


    return query
    select
      v_recuperacion.id,
      v_recuperacion.estado,
      v_nombre_vecino,
      v_llavero.codigo_publico::text,
      v_recuperacion.solicitada_en,
      v_recuperacion.expira_en;

    return;

  end if;


  perform public.expirar_recuperaciones_pin_llavero_interno();


  if exists (
    select 1
    from public.recuperaciones_pin_llavero as recuperacion
    where recuperacion.llavero_id = v_llavero.id
      and recuperacion.estado in ('pendiente', 'aprobada')
  ) then
    raise exception
      'Este llavero ya tiene una recuperación de PIN en curso'
      using errcode = '23505';
  end if;


  insert into public.recuperaciones_pin_llavero (
    llavero_id,
    vecino_id,
    negocio_id,
    sucursal_id,
    caja_id,
    turno_caja_id,
    cajero_negocio_id,
    identidad_verificada_en,
    idempotency_key,
    solicitada_en,
    expira_en
  )
  values (
    v_llavero.id,
    v_llavero.vecino_id,
    v_turno.negocio_id,
    v_sucursal_id,
    v_turno.caja_id,
    v_turno.id,
    v_turno.cajero_negocio_id,
    v_ahora,
    v_key,
    v_ahora,
    v_ahora + interval '15 minutes'
  )
  returning *
  into v_recuperacion;


  update public.turnos_caja
  set ultima_actividad_en = v_ahora
  where id = v_turno.id;


  return query
  select
    v_recuperacion.id,
    v_recuperacion.estado,
    v_nombre_vecino,
    v_llavero.codigo_publico::text,
    v_recuperacion.solicitada_en,
    v_recuperacion.expira_en;

end;
$$;


-- ============================================================================
-- LISTAR PENDIENTES PARA PROPIETARIO / ADMINISTRADOR
-- ============================================================================

create function public.listar_recuperaciones_pin_llavero_pendientes(
  p_negocio_id uuid
)
returns table (
  recuperacion_id uuid,
  codigo_publico text,
  nombre_vecino text,
  nombre_cajero text,
  nombre_sucursal text,
  solicitada_en timestamptz,
  expira_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
begin

  if v_usuario_id is null
    or (
      not public.es_admin_regalones()
      and not public.es_miembro_negocio(
        p_negocio_id,
        array[
          'propietario'::public.rol_miembro_negocio,
          'administrador'::public.rol_miembro_negocio
        ]
      )
    )
  then
    raise exception
      'No tienes permisos para revisar recuperaciones de PIN'
      using errcode = '42501';
  end if;


  perform public.expirar_recuperaciones_pin_llavero_interno();


  return query
  select
    recuperacion.id,
    llavero.codigo_publico::text,

    concat_ws(
      ' ',
      perfil.nombre,
      perfil.apellido
    )::text,

    concat_ws(
      ' ',
      cajero.nombre,
      cajero.apellido
    )::text,

    sucursal.nombre::text,
    recuperacion.solicitada_en,
    recuperacion.expira_en

  from public.recuperaciones_pin_llavero as recuperacion

  join public.llaveros_nfc as llavero
    on llavero.id = recuperacion.llavero_id

  join public.perfiles as perfil
    on perfil.id = recuperacion.vecino_id

  join public.cajeros_negocio as cajero
    on cajero.id = recuperacion.cajero_negocio_id

  join public.sucursales as sucursal
    on sucursal.id = recuperacion.sucursal_id

  where recuperacion.negocio_id = p_negocio_id
    and recuperacion.estado = 'pendiente'

  order by recuperacion.solicitada_en asc;

end;
$$;


-- ============================================================================
-- APROBACION PROTEGIDA POR CUENTA DEL NEGOCIO
-- ============================================================================

create function public.aprobar_recuperacion_pin_llavero(
  p_recuperacion_id uuid
)
returns table (
  aprobada boolean,
  mensaje text,
  recuperacion_id uuid,
  estado public.estado_recuperacion_pin_llavero,
  completar_antes timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_recuperacion public.recuperaciones_pin_llavero;
  v_ahora timestamptz := clock_timestamp();
begin

  if v_usuario_id is null then
    raise exception
      'Debes iniciar sesión como propietario o administrador'
      using errcode = '42501';
  end if;


  select recuperacion.*
  into v_recuperacion
  from public.recuperaciones_pin_llavero as recuperacion
  where recuperacion.id = p_recuperacion_id;


  if not found then
    raise exception
      'Solicitud de recuperación no encontrada'
      using errcode = 'P0002';
  end if;


  if not public.es_admin_regalones()
    and not public.es_miembro_negocio(
      v_recuperacion.negocio_id,
      array[
        'propietario'::public.rol_miembro_negocio,
        'administrador'::public.rol_miembro_negocio
      ]
    )
  then
    raise exception
      'No tienes permisos para aprobar esta recuperación'
      using errcode = '42501';
  end if;


  perform public.expirar_recuperaciones_pin_llavero_interno();


  select recuperacion.*
  into v_recuperacion
  from public.recuperaciones_pin_llavero as recuperacion
  where recuperacion.id = p_recuperacion_id
  for update;


  if v_recuperacion.estado = 'expirada' then

    return query
    select
      false,
      'La solicitud de recuperación expiró.'::text,
      v_recuperacion.id,
      v_recuperacion.estado,
      null::timestamptz;

    return;

  end if;


  if v_recuperacion.estado = 'completada' then

    return query
    select
      false,
      'La recuperación ya fue completada.'::text,
      v_recuperacion.id,
      v_recuperacion.estado,
      v_recuperacion.completar_antes;

    return;

  end if;


  if v_recuperacion.estado = 'aprobada' then

    return query
    select
      true,
      'La recuperación ya estaba aprobada.'::text,
      v_recuperacion.id,
      v_recuperacion.estado,
      v_recuperacion.completar_antes;

    return;

  end if;


  update public.recuperaciones_pin_llavero as recuperacion
  set
    estado = 'aprobada',
    aprobada_por = v_usuario_id,
    aprobada_en = v_ahora,

    completar_antes = least(
      recuperacion.expira_en,
      v_ahora + interval '5 minutes'
    ),

    actualizado_en = v_ahora

  where recuperacion.id = v_recuperacion.id

  returning *
  into v_recuperacion;


  return query
  select
    true,
    'Recuperación aprobada.'::text,
    v_recuperacion.id,
    v_recuperacion.estado,
    v_recuperacion.completar_antes;

end;
$$;


-- ============================================================================
-- CONSULTAR ESTADO DESDE APP NEGOCIO
-- ============================================================================

create function public.terminal_consultar_recuperacion_pin_llavero(
  p_recuperacion_id uuid,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  recuperacion_id uuid,
  estado public.estado_recuperacion_pin_llavero,
  aprobada boolean,
  puede_completar boolean,
  expira_en timestamptz,
  completar_antes timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_recuperacion public.recuperaciones_pin_llavero;
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


  perform public.expirar_recuperaciones_pin_llavero_interno();


  select recuperacion.*
  into v_recuperacion
  from public.recuperaciones_pin_llavero as recuperacion

  where recuperacion.id = p_recuperacion_id
    and recuperacion.turno_caja_id = v_turno.id
    and recuperacion.cajero_negocio_id =
      v_turno.cajero_negocio_id;


  if not found then
    raise exception
      'La recuperación no pertenece a este turno'
      using errcode = '42501';
  end if;


  return query
  select
    v_recuperacion.id,
    v_recuperacion.estado,
    v_recuperacion.estado = 'aprobada',
    (
      v_recuperacion.estado = 'aprobada'
      and v_recuperacion.completar_antes > clock_timestamp()
    ),
    v_recuperacion.expira_en,
    v_recuperacion.completar_antes;

end;
$$;


-- ============================================================================
-- INVALIDAR CANJES RESERVADOS DEL PIN ANTERIOR
--
-- Se cancelan reservas LLAVERO no confirmadas y se devuelven los REGIS.
-- No se tocan compras/canjes ya confirmados.
-- ============================================================================

create function public.cancelar_reservas_llavero_por_cambio_pin_interno(
  p_llavero_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canje public.canjes_regis;
  v_total integer := 0;
  v_ahora timestamptz := clock_timestamp();
begin

  perform public.expirar_reservas_canje_regis();


  for v_canje in

    select canje.*
    from public.canjes_regis as canje

    where canje.llavero_id = p_llavero_id
      and canje.origen = 'llavero'
      and canje.estado = 'reservado'

    for update

  loop

    update public.saldos_regis as saldo
    set
      disponibles =
        saldo.disponibles + v_canje.costo_regis,

      reservados =
        saldo.reservados - v_canje.costo_regis,

      actualizado_en = v_ahora

    where saldo.vecino_id = v_canje.vecino_id
      and saldo.negocio_id = v_canje.negocio_id
      and saldo.reservados >= v_canje.costo_regis;


    if not found then
      raise exception
        'El saldo reservado del canje es inconsistente'
        using errcode = '23514';
    end if;


    update public.canjes_regis as canje
    set
      estado = 'cancelado',
      cancelado_en = v_ahora

    where canje.id = v_canje.id;


    v_total := v_total + 1;

  end loop;


  return v_total;

end;
$$;


-- ============================================================================
-- COMPLETAR RECUPERACION
-- ============================================================================

create function public.terminal_completar_recuperacion_pin_llavero(
  p_recuperacion_id uuid,
  p_nuevo_pin text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  actualizado boolean,
  mensaje text,
  recuperacion_id uuid,
  canjes_cancelados integer,
  pin_actualizado_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_recuperacion public.recuperaciones_pin_llavero;
  v_llavero public.llaveros_nfc;

  v_pin text :=
    btrim(coalesce(p_nuevo_pin, ''));

  v_cancelados integer := 0;
  v_ahora timestamptz := clock_timestamp();
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


  if v_pin !~ '^[0-9]{4}$' then
    raise exception
      'El PIN de seguridad debe tener exactamente 4 dígitos'
      using errcode = '22023';
  end if;


  perform public.expirar_recuperaciones_pin_llavero_interno();


  select recuperacion.*
  into v_recuperacion
  from public.recuperaciones_pin_llavero as recuperacion

  where recuperacion.id = p_recuperacion_id
    and recuperacion.turno_caja_id = v_turno.id
    and recuperacion.cajero_negocio_id =
      v_turno.cajero_negocio_id

  for update;


  if not found then
    raise exception
      'La recuperación no pertenece a este turno'
      using errcode = '42501';
  end if;


  if v_recuperacion.estado = 'pendiente' then

    return query
    select
      false,
      'La recuperación todavía necesita aprobación del propietario o administrador.'::text,
      v_recuperacion.id,
      0,
      null::timestamptz;

    return;

  end if;


  if v_recuperacion.estado = 'expirada' then

    return query
    select
      false,
      'La recuperación expiró. Inicia una nueva solicitud.'::text,
      v_recuperacion.id,
      0,
      null::timestamptz;

    return;

  end if;


  if v_recuperacion.estado = 'completada' then

    return query
    select
      false,
      'La recuperación ya fue utilizada.'::text,
      v_recuperacion.id,
      0,
      v_recuperacion.completada_en;

    return;

  end if;


  if v_recuperacion.completar_antes is null
    or v_recuperacion.completar_antes <= v_ahora
  then

    update public.recuperaciones_pin_llavero
    set
      estado = 'expirada',
      actualizado_en = v_ahora
    where id = v_recuperacion.id;


    return query
    select
      false,
      'La autorización para cambiar el PIN expiró.'::text,
      v_recuperacion.id,
      0,
      null::timestamptz;

    return;

  end if;


  -- Bloqueamos el llavero antes de invalidar reservas.
  -- Una validación concurrente del PIN anterior deberá esperar.

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero

  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
    and perfil.estado = 'activo'

  where llavero.id = v_recuperacion.llavero_id
    and llavero.vecino_id = v_recuperacion.vecino_id
    and llavero.estado = 'activo'
    and llavero.pin_seguridad_hash is not null

  for update of llavero;


  if not found then
    raise exception
      'El llavero ya no está disponible para recuperar el PIN'
      using errcode = '23514';
  end if;


  v_cancelados :=
    public.cancelar_reservas_llavero_por_cambio_pin_interno(
      v_llavero.id
    );


  perform public.establecer_pin_seguridad_llavero_interno(
    v_llavero.id,
    v_pin
  );


  update public.recuperaciones_pin_llavero
  set
    estado = 'completada',
    completada_en = v_ahora,
    actualizado_en = v_ahora

  where id = v_recuperacion.id;


  update public.turnos_caja
  set ultima_actividad_en = v_ahora
  where id = v_turno.id;


  return query
  select
    true,
    'Tu nuevo PIN de seguridad quedó configurado.'::text,
    v_recuperacion.id,
    v_cancelados,
    v_ahora;

end;
$$;


-- ============================================================================
-- PERMISOS
-- ============================================================================

revoke all on function
  public.expirar_recuperaciones_pin_llavero_interno()
from public, anon, authenticated;


revoke all on function
  public.cancelar_reservas_llavero_por_cambio_pin_interno(uuid)
from public, anon, authenticated;


revoke all on function
  public.terminal_iniciar_recuperacion_pin_llavero(
    uuid,
    boolean,
    text,
    uuid,
    uuid,
    text
  )
from public, anon, authenticated;


grant execute on function
  public.terminal_iniciar_recuperacion_pin_llavero(
    uuid,
    boolean,
    text,
    uuid,
    uuid,
    text
  )
to anon, authenticated;


revoke all on function
  public.terminal_consultar_recuperacion_pin_llavero(
    uuid,
    uuid,
    uuid,
    text
  )
from public, anon, authenticated;


grant execute on function
  public.terminal_consultar_recuperacion_pin_llavero(
    uuid,
    uuid,
    uuid,
    text
  )
to anon, authenticated;


revoke all on function
  public.terminal_completar_recuperacion_pin_llavero(
    uuid,
    text,
    uuid,
    uuid,
    text
  )
from public, anon, authenticated;


grant execute on function
  public.terminal_completar_recuperacion_pin_llavero(
    uuid,
    text,
    uuid,
    uuid,
    text
  )
to anon, authenticated;


revoke all on function
  public.listar_recuperaciones_pin_llavero_pendientes(uuid)
from public, anon, authenticated;


grant execute on function
  public.listar_recuperaciones_pin_llavero_pendientes(uuid)
to authenticated;


revoke all on function
  public.aprobar_recuperacion_pin_llavero(uuid)
from public, anon, authenticated;


grant execute on function
  public.aprobar_recuperacion_pin_llavero(uuid)
to authenticated;


commit;