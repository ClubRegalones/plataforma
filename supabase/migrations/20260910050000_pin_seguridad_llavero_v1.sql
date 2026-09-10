begin;

-- ============================================================================
-- CLUB REGALONES
-- HARDENING 1C-B1
-- PIN DE SEGURIDAD DEL LLAVERO
--
-- Para el vecino existe UN SOLO PIN:
--   "PIN de seguridad del llavero"
--
-- Se crea durante la activación y posteriormente autoriza gasto de REGIS.
--
-- IMPORTANTE:
-- pin_activacion_hash pertenece al flujo histórico/legacy.
-- NO se copia, migra ni reutiliza automáticamente.
-- ============================================================================


alter table public.llaveros_nfc
  add column pin_seguridad_hash text,
  add column pin_seguridad_intentos_fallidos smallint not null default 0,
  add column pin_seguridad_bloqueado_hasta timestamptz,
  add column pin_seguridad_configurado_en timestamptz,
  add column pin_seguridad_actualizado_en timestamptz;


alter table public.llaveros_nfc
  add constraint llaveros_nfc_pin_seguridad_hash_valido
  check (
    pin_seguridad_hash is null
    or char_length(pin_seguridad_hash) >= 32
  ),

  add constraint llaveros_nfc_pin_seguridad_intentos_validos
  check (
    pin_seguridad_intentos_fallidos between 0 and 3
  ),

  add constraint llaveros_nfc_pin_seguridad_consistencia
  check (
    (
      pin_seguridad_hash is null
      and pin_seguridad_configurado_en is null
      and pin_seguridad_actualizado_en is null
      and pin_seguridad_intentos_fallidos = 0
      and pin_seguridad_bloqueado_hasta is null
    )
    or
    (
      pin_seguridad_hash is not null
      and pin_seguridad_configurado_en is not null
      and pin_seguridad_actualizado_en is not null
    )
  );


comment on column public.llaveros_nfc.pin_seguridad_hash is
  'Hash bcrypt del único PIN de seguridad elegido por el vecino para proteger operaciones que gastan REGIS con su llavero.';

comment on column public.llaveros_nfc.pin_seguridad_intentos_fallidos is
  'Cantidad de intentos consecutivos fallidos del PIN de seguridad del llavero.';

comment on column public.llaveros_nfc.pin_seguridad_bloqueado_hasta is
  'Momento hasta el cual se bloquea temporalmente la autorización mediante PIN.';

comment on column public.llaveros_nfc.pin_seguridad_configurado_en is
  'Momento en que el vecino configuró por primera vez su PIN de seguridad.';

comment on column public.llaveros_nfc.pin_seguridad_actualizado_en is
  'Último momento en que el PIN de seguridad fue establecido o restablecido.';


-- ============================================================================
-- HELPER INTERNO PARA ESTABLECER / RESTABLECER EL PIN
--
-- NO se expone al frontend.
--
-- Lo usarán posteriormente:
--   1. la activación segura del llavero;
--   2. el flujo auditado "Olvidé mi PIN".
--
-- Así evitamos crear ahora una RPC pública que permita saltarse esos procesos.
-- ============================================================================

create function public.establecer_pin_seguridad_llavero_interno(
  p_llavero_id uuid,
  p_pin text
)
returns public.llaveros_nfc
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_llavero public.llaveros_nfc;
  v_pin text := btrim(coalesce(p_pin, ''));
  v_ahora timestamptz := clock_timestamp();
begin

  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN de seguridad debe tener exactamente 4 dígitos'
      using errcode = '22023';
  end if;


  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
  where llavero.id = p_llavero_id
    and llavero.vecino_id is not null
    and llavero.estado = 'activo'
    and perfil.estado = 'activo'
  for update of llavero;


  if not found then
    raise exception 'No encontramos un llavero activo para configurar el PIN'
      using errcode = 'P0002';
  end if;


  update public.llaveros_nfc
  set
    pin_seguridad_hash = extensions.crypt(
      v_pin,
      extensions.gen_salt('bf', 10)
    ),

    pin_seguridad_intentos_fallidos = 0,
    pin_seguridad_bloqueado_hasta = null,

    pin_seguridad_configurado_en =
      coalesce(pin_seguridad_configurado_en, v_ahora),

    pin_seguridad_actualizado_en = v_ahora

  where id = v_llavero.id

  returning *
  into v_llavero;


  return v_llavero;

end;
$$;


-- ============================================================================
-- VALIDADOR INTERNO
--
-- Devuelve autorizado=false en vez de lanzar excepción por PIN incorrecto.
--
-- Esto es IMPORTANTÍSIMO:
-- si lanzáramos excepción, PostgreSQL podría revertir también el incremento
-- del contador de intentos dentro de la misma transacción.
-- ============================================================================

create function public.validar_pin_seguridad_llavero_interno(
  p_llavero_id uuid,
  p_pin text
)
returns table (
  autorizado boolean,
  mensaje text,
  bloqueado_hasta timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_llavero public.llaveros_nfc;
  v_pin text := btrim(coalesce(p_pin, ''));
  v_intentos smallint;
  v_ahora timestamptz := clock_timestamp();
begin

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
  where llavero.id = p_llavero_id
    and llavero.vecino_id is not null
    and llavero.estado = 'activo'
    and perfil.estado = 'activo'
  for update of llavero;


  if not found then
    return query
    select
      false,
      'No se pudo autorizar el llavero.'::text,
      null::timestamptz;

    return;
  end if;


  if v_llavero.pin_seguridad_hash is null then
    return query
    select
      false,
      'Este llavero todavía no tiene un PIN de seguridad configurado.'::text,
      null::timestamptz;

    return;
  end if;


  -- Bloqueo todavía vigente.

  if v_llavero.pin_seguridad_bloqueado_hasta is not null
    and v_llavero.pin_seguridad_bloqueado_hasta > v_ahora
  then

    return query
    select
      false,
      'El PIN de seguridad está bloqueado temporalmente.'::text,
      v_llavero.pin_seguridad_bloqueado_hasta;

    return;
  end if;


  -- Si el bloqueo anterior ya venció, comienza una nueva ventana.

  if v_llavero.pin_seguridad_bloqueado_hasta is not null
    and v_llavero.pin_seguridad_bloqueado_hasta <= v_ahora
  then

    update public.llaveros_nfc
    set
      pin_seguridad_intentos_fallidos = 0,
      pin_seguridad_bloqueado_hasta = null
    where id = v_llavero.id;

    v_llavero.pin_seguridad_intentos_fallidos := 0;
    v_llavero.pin_seguridad_bloqueado_hasta := null;

  end if;


  -- PIN incorrecto.

  if v_pin !~ '^[0-9]{4}$'
    or extensions.crypt(
      v_pin,
      v_llavero.pin_seguridad_hash
    ) <> v_llavero.pin_seguridad_hash
  then

    v_intentos := least(
      v_llavero.pin_seguridad_intentos_fallidos + 1,
      3
    );


    update public.llaveros_nfc
    set
      pin_seguridad_intentos_fallidos = v_intentos,

      pin_seguridad_bloqueado_hasta = case
        when v_intentos >= 3
          then v_ahora + interval '15 minutes'
        else null
      end

    where id = v_llavero.id

    returning *
    into v_llavero;


    return query
    select
      false,

      case
        when v_intentos >= 3
          then 'PIN incorrecto. Inténtalo nuevamente en 15 minutos.'
        else 'PIN incorrecto.'
      end::text,

      v_llavero.pin_seguridad_bloqueado_hasta;


    return;
  end if;


  -- PIN correcto: limpiamos contador/bloqueo.

  update public.llaveros_nfc
  set
    pin_seguridad_intentos_fallidos = 0,
    pin_seguridad_bloqueado_hasta = null
  where id = v_llavero.id;


  return query
  select
    true,
    'PIN correcto.'::text,
    null::timestamptz;

end;
$$;


-- ============================================================================
-- PERMISOS
--
-- Nadie desde navegador puede leer/escribir el hash ni ejecutar estos helpers.
-- ============================================================================

revoke select (
  pin_seguridad_hash,
  pin_seguridad_intentos_fallidos,
  pin_seguridad_bloqueado_hasta,
  pin_seguridad_configurado_en,
  pin_seguridad_actualizado_en
)
on public.llaveros_nfc
from public, anon, authenticated;


revoke insert (
  pin_seguridad_hash,
  pin_seguridad_intentos_fallidos,
  pin_seguridad_bloqueado_hasta,
  pin_seguridad_configurado_en,
  pin_seguridad_actualizado_en
)
on public.llaveros_nfc
from public, anon, authenticated;


revoke update (
  pin_seguridad_hash,
  pin_seguridad_intentos_fallidos,
  pin_seguridad_bloqueado_hasta,
  pin_seguridad_configurado_en,
  pin_seguridad_actualizado_en
)
on public.llaveros_nfc
from public, anon, authenticated;


revoke all on function
  public.establecer_pin_seguridad_llavero_interno(uuid, text)
from public, anon, authenticated;


revoke all on function
  public.validar_pin_seguridad_llavero_interno(uuid, text)
from public, anon, authenticated;


commit;