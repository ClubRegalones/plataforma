begin;

-- ============================================================================
-- CLUB REGALONES
-- HARDENING 1C-B2A
-- CANJE CON LLAVERO AUTORIZADO POR PIN EN APP NEGOCIO
--
-- El llavero identifica.
-- El PIN autoriza el gasto.
--
-- Terminal legacy conserva su flujo histórico.
-- App Vecino con QR temporal conserva su autorización por token QR.
-- ============================================================================


-- ============================================================================
-- 1. EVIDENCIA DE AUTORIZACION
-- ============================================================================

alter table public.canjes_regis
  add column pin_seguridad_autorizado_en timestamptz,
  add column pin_seguridad_turno_id uuid
    references public.turnos_caja (id) on delete restrict;


alter table public.canjes_regis
  add constraint canjes_pin_seguridad_evidencia_valida
  check (
    (
      pin_seguridad_autorizado_en is null
      and pin_seguridad_turno_id is null
    )
    or
    (
      origen = 'llavero'
      and pin_seguridad_autorizado_en is not null
      and pin_seguridad_turno_id is not null
    )
  );


comment on column public.canjes_regis.pin_seguridad_autorizado_en is
  'Momento en que el vecino autorizó mediante PIN el gasto de REGIS con llavero. No almacena el PIN.';

comment on column public.canjes_regis.pin_seguridad_turno_id is
  'Turno de App Negocio en que se validó el PIN. La confirmación debe permanecer en ese mismo turno.';


-- ============================================================================
-- 2. GUARD DEFINITIVO PARA APP NEGOCIO
-- ============================================================================

create function public.validar_canje_llavero_app_negocio_con_pin_interno(
  p_origen public.origen_canje_regis,
  p_estado public.estado_canje_regis,
  p_turno_id uuid,
  p_pin_autorizado_en timestamptz,
  p_pin_turno_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin

  if p_origen <> 'llavero'
    or p_turno_id is null
    or p_estado not in (
      'reservado'::public.estado_canje_regis,
      'confirmado'::public.estado_canje_regis
    )
  then
    return;
  end if;


  -- Solo aplica a App Negocio.
  -- Terminal legacy tiene cajero_negocio_id = null.

  if exists (
    select 1
    from public.turnos_caja as turno
    where turno.id = p_turno_id
      and turno.cajero_negocio_id is not null
  ) then

    if p_pin_autorizado_en is null
      or p_pin_turno_id is distinct from p_turno_id
    then
      raise exception
        'Los canjes con llavero en App Negocio requieren PIN de seguridad autorizado en el mismo turno'
        using errcode = '42501';
    end if;

  end if;

end;
$$;


-- Reemplazamos SOLO la implementación del trigger de 1C-A.
-- El helper antiguo se conserva para mantener su contrato/test fail-closed.

create or replace function public.aplicar_bloqueo_canje_llavero_app_negocio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  perform public.validar_canje_llavero_app_negocio_con_pin_interno(
    new.origen,
    new.estado,
    new.turno_caja_id,
    new.pin_seguridad_autorizado_en,
    new.pin_seguridad_turno_id
  );

  return new;

end;
$$;


drop trigger if exists
  canjes_regis_bloquear_llavero_app_negocio_sin_pin
on public.canjes_regis;


create trigger canjes_regis_bloquear_llavero_app_negocio_sin_pin
before insert
or update of
  origen,
  estado,
  turno_caja_id,
  pin_seguridad_autorizado_en,
  pin_seguridad_turno_id
on public.canjes_regis
for each row
execute function public.aplicar_bloqueo_canje_llavero_app_negocio();


-- ============================================================================
-- 3. RPC SEGURA DE APP NEGOCIO
--
-- Recibe llavero_id porque tanto QR físico como NFC terminan resolviendo
-- el mismo llavero.
--
-- Un PIN incorrecto devuelve autorizado=false.
-- NO lanza excepción después de validar PIN incorrecto para no deshacer
-- el contador de intentos.
-- ============================================================================

create function public.terminal_reservar_canje_llavero_app_negocio(
  p_llavero_id uuid,
  p_beneficio_version_id uuid,
  p_pin text,
  p_idempotency_key text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  autorizado boolean,
  mensaje text,
  bloqueado_hasta timestamptz,
  canje_id uuid,
  codigo_publico text,
  estado public.estado_canje_regis,
  expira_en timestamptz,
  costo_regis integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_llavero public.llaveros_nfc;
  v_canje public.canjes_regis;

  v_autorizado boolean;
  v_mensaje text;
  v_bloqueado_hasta timestamptz;

  v_idempotency_key text :=
    btrim(coalesce(p_idempotency_key, ''));

  v_autorizado_en timestamptz;
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


  if char_length(v_idempotency_key) < 8
    or char_length(v_idempotency_key) > 200
  then
    raise exception 'La clave idempotente no es válida'
      using errcode = '22023';
  end if;


  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
  where llavero.id = p_llavero_id
    and llavero.estado = 'activo'
    and perfil.estado = 'activo';


  if not found then
    raise exception
      'No encontramos un llavero activo asociado al vecino'
      using errcode = 'P0002';
  end if;


  if not exists (
    select 1
    from public.versiones_beneficio_regis as version
    join public.beneficios_regis as beneficio
      on beneficio.id = version.beneficio_id
    where version.id = p_beneficio_version_id
      and beneficio.negocio_id = v_turno.negocio_id
  ) then
    raise exception
      'El beneficio no pertenece al negocio de este turno'
      using errcode = '42501';
  end if;


  -- La validación del PIN mantiene internamente su contador de intentos.

  select
    resultado.autorizado,
    resultado.mensaje,
    resultado.bloqueado_hasta
  into
    v_autorizado,
    v_mensaje,
    v_bloqueado_hasta
  from public.validar_pin_seguridad_llavero_interno(
    v_llavero.id,
    p_pin
  ) as resultado;


  if not coalesce(v_autorizado, false) then

    return query
    select
      false,
      coalesce(
        v_mensaje,
        'No se pudo autorizar el PIN.'
      )::text,
      v_bloqueado_hasta,
      null::uuid,
      null::text,
      null::public.estado_canje_regis,
      null::timestamptz,
      null::integer;

    return;

  end if;


  -- Después del PIN correcto, la reserva sigue usando el motor existente.
  -- No duplicamos saldo, cupos, límites ni reglas REGIS.

  v_canje := public.crear_reserva_canje_regis_interna(
    v_llavero.vecino_id,
    p_beneficio_version_id,
    'llavero',
    null,
    v_turno.caja_id,
    v_llavero.id,
    v_idempotency_key
  );


  -- Si es un retry de una operación ya confirmada,
  -- solo aceptamos exactamente el mismo turno PIN.

  if v_canje.estado = 'confirmado' then

    if v_canje.pin_seguridad_autorizado_en is null
      or v_canje.pin_seguridad_turno_id
        is distinct from v_turno.id
    then
      raise exception
        'La operación idempotente corresponde a otro canje o turno'
        using errcode = '23514';
    end if;


    return query
    select
      true,
      'PIN correcto.'::text,
      null::timestamptz,
      v_canje.id,
      v_canje.codigo_publico::text,
      v_canje.estado,
      v_canje.expira_en,
      v_canje.costo_regis;

    return;

  end if;


  if v_canje.estado <> 'reservado' then
    raise exception
      'El canje ya no está disponible para reservar'
      using errcode = '23514';
  end if;


  v_autorizado_en := clock_timestamp();


  update public.canjes_regis
  set
    turno_caja_id = v_turno.id,

    pin_seguridad_autorizado_en =
      coalesce(
        pin_seguridad_autorizado_en,
        v_autorizado_en
      ),

    pin_seguridad_turno_id =
      coalesce(
        pin_seguridad_turno_id,
        v_turno.id
      )

  where id = v_canje.id

  returning *
  into v_canje;


  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;


  return query
  select
    true,
    'PIN correcto.'::text,
    null::timestamptz,
    v_canje.id,
    v_canje.codigo_publico::text,
    v_canje.estado,
    v_canje.expira_en,
    v_canje.costo_regis;

end;
$$;


-- ============================================================================
-- 4. PERMISOS
-- ============================================================================

revoke select (
  pin_seguridad_autorizado_en,
  pin_seguridad_turno_id
)
on public.canjes_regis
from public, anon, authenticated;


revoke insert (
  pin_seguridad_autorizado_en,
  pin_seguridad_turno_id
)
on public.canjes_regis
from public, anon, authenticated;


revoke update (
  pin_seguridad_autorizado_en,
  pin_seguridad_turno_id
)
on public.canjes_regis
from public, anon, authenticated;


revoke all on function
  public.validar_canje_llavero_app_negocio_con_pin_interno(
    public.origen_canje_regis,
    public.estado_canje_regis,
    uuid,
    timestamptz,
    uuid
  )
from public, anon, authenticated;


revoke all on function
  public.aplicar_bloqueo_canje_llavero_app_negocio()
from public, anon, authenticated;


revoke all on function
  public.terminal_reservar_canje_llavero_app_negocio(
    uuid,
    uuid,
    text,
    text,
    uuid,
    uuid,
    text
  )
from public, anon, authenticated;


grant execute on function
  public.terminal_reservar_canje_llavero_app_negocio(
    uuid,
    uuid,
    text,
    text,
    uuid,
    uuid,
    text
  )
to anon, authenticated;


comment on function
  public.terminal_reservar_canje_llavero_app_negocio(
    uuid,
    uuid,
    text,
    text,
    uuid,
    uuid,
    text
  )
is
  'Reserva un canje con llavero en App Negocio únicamente después de validar el PIN de seguridad del vecino. Reutiliza el motor existente de reservas REGIS.';


commit;