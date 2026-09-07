begin;

-- ============================================================================
-- CLUB REGALONES
-- CONFIGURACIÓN INICIAL DE CAJEROS DESDE APP NEGOCIO
--
-- Mantiene el flujo con PIN existente como comportamiento heredado, pero
-- permite que una sucursal opte por un inicio de turno simple tocando el nombre.
-- La configuración inicial se realiza una sola vez desde un dispositivo ya
-- autorizado por propietario/administrador y no requiere cuentas para cajeros.
-- ============================================================================

create type public.modo_identificacion_cajero as enum (
  'solo_nombre',
  'nombre_pin'
);

alter table public.sucursales
  add column modo_identificacion_cajero public.modo_identificacion_cajero
    not null default 'nombre_pin';

comment on column public.sucursales.modo_identificacion_cajero is
  'Define si App Negocio inicia turno al seleccionar el nombre o exige además PIN. El valor heredado por defecto conserva el comportamiento anterior.';

alter table public.cajeros_negocio
  alter column pin_hash drop not null;

alter table public.cajeros_negocio
  drop constraint if exists cajeros_negocio_pin_hash_valido;

alter table public.cajeros_negocio
  add constraint cajeros_negocio_pin_hash_valido check (
    pin_hash is null or char_length(pin_hash) >= 32
  );

-- Cambio administrable desde Portal Comercio en un bloque posterior de UI.
-- Al activar nombre + PIN, todos los cajeros activos de la sucursal deben tener PIN.
create function public.configurar_modo_identificacion_cajeros(
  p_sucursal_id uuid,
  p_modo public.modo_identificacion_cajero
)
returns public.modo_identificacion_cajero
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid;
  v_modo public.modo_identificacion_cajero := coalesce(
    p_modo,
    'solo_nombre'::public.modo_identificacion_cajero
  );
begin
  select sucursal.negocio_id
  into v_negocio_id
  from public.sucursales as sucursal
  where sucursal.id = p_sucursal_id
    and sucursal.estado = 'activa';

  if not found then
    raise exception 'Sucursal activa no encontrada'
      using errcode = 'P0002';
  end if;

  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para cambiar la identificación de cajeros'
      using errcode = '42501';
  end if;

  if not public.es_admin_regalones()
    and not public.es_miembro_negocio(
      v_negocio_id,
      array[
        'propietario'::public.rol_miembro_negocio,
        'administrador'::public.rol_miembro_negocio
      ]
    )
  then
    raise exception 'No tienes permisos para configurar esta sucursal'
      using errcode = '42501';
  end if;

  if v_modo = 'nombre_pin'
    and exists (
      select 1
      from public.cajeros_sucursales as asignacion
      join public.cajeros_negocio as cajero
        on cajero.id = asignacion.cajero_id
      where asignacion.sucursal_id = p_sucursal_id
        and cajero.estado = 'activo'
        and cajero.pin_hash is null
    )
  then
    raise exception 'Todos los cajeros activos deben tener PIN antes de activar nombre + PIN'
      using errcode = '23514';
  end if;

  update public.sucursales
  set modo_identificacion_cajero = v_modo
  where id = p_sucursal_id;

  return v_modo;
end;
$$;

-- Configuración única de una sucursal nueva desde el dispositivo que el dueño
-- acaba de autorizar. La credencial física del dispositivo es el permiso para
-- terminar este onboarding, pero solo mientras todavía no existan cajeros en
-- esa sucursal y el dispositivo sea reciente.
create function public.negocio_configurar_equipo_inicial(
  p_terminal_id uuid,
  p_token_terminal text,
  p_modo public.modo_identificacion_cajero,
  p_cajeros jsonb
)
returns table (
  cajeros_creados integer,
  modo public.modo_identificacion_cajero
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.terminales;
  v_sucursal_id uuid;
  v_negocio_id uuid;
  v_modo public.modo_identificacion_cajero := coalesce(
    p_modo,
    'solo_nombre'::public.modo_identificacion_cajero
  );
  v_elemento jsonb;
  v_id uuid;
  v_nombre text;
  v_apellido text;
  v_rol public.rol_cajero_negocio;
  v_pin text;
  v_total integer := 0;
begin
  v_terminal := public.validar_credencial_terminal_interna(
    p_terminal_id,
    p_token_terminal
  );

  if v_terminal.creado_en < clock_timestamp() - interval '4 hours' then
    raise exception 'La ventana de configuración inicial de este dispositivo venció'
      using errcode = '42501';
  end if;

  select caja.sucursal_id, sucursal.negocio_id
  into v_sucursal_id, v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = v_terminal.caja_id
    and caja.estado = 'activa'
    and sucursal.estado = 'activa';

  if not found then
    raise exception 'La Caja Regalones no pertenece a una sucursal activa'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.cajeros_sucursales as asignacion
    join public.cajeros_negocio as cajero
      on cajero.id = asignacion.cajero_id
    where asignacion.sucursal_id = v_sucursal_id
      and cajero.estado = 'activo'
  ) then
    raise exception 'Esta sucursal ya tiene cajeros configurados'
      using errcode = '23514';
  end if;

  if p_cajeros is null
    or jsonb_typeof(p_cajeros) <> 'array'
    or jsonb_array_length(p_cajeros) < 1
    or jsonb_array_length(p_cajeros) > 30
  then
    raise exception 'Agrega entre 1 y 30 cajeros para terminar la configuración'
      using errcode = '22023';
  end if;

  for v_elemento in
    select value from jsonb_array_elements(p_cajeros)
  loop
    begin
      v_id := (v_elemento ->> 'id')::uuid;
    exception when others then
      raise exception 'Cada cajero debe tener un identificador válido'
        using errcode = '22023';
    end;

    v_nombre := btrim(coalesce(v_elemento ->> 'nombre', ''));
    v_apellido := nullif(btrim(coalesce(v_elemento ->> 'apellido', '')), '');
    v_pin := nullif(btrim(coalesce(v_elemento ->> 'pin', '')), '');

    begin
      v_rol := coalesce(
        nullif(v_elemento ->> 'rol', '')::public.rol_cajero_negocio,
        'cajero'::public.rol_cajero_negocio
      );
    exception when invalid_text_representation then
      raise exception 'El rol del cajero no es válido'
        using errcode = '22023';
    end;

    if char_length(v_nombre) not between 2 and 100 then
      raise exception 'Cada cajero debe tener un nombre de 2 a 100 caracteres'
        using errcode = '22023';
    end if;

    if v_apellido is not null
      and char_length(v_apellido) not between 2 and 100
    then
      raise exception 'El apellido del cajero debe tener entre 2 y 100 caracteres'
        using errcode = '22023';
    end if;

    if v_modo = 'nombre_pin' and coalesce(v_pin, '') !~ '^[0-9]{4,6}$' then
      raise exception 'Cada cajero debe tener un PIN de 4 a 6 dígitos'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.cajeros_negocio as cajero
      where cajero.id = v_id
        and cajero.negocio_id <> v_negocio_id
    ) then
      raise exception 'El identificador de un cajero ya pertenece a otro negocio'
        using errcode = '23505';
    end if;

    insert into public.cajeros_negocio (
      id,
      negocio_id,
      nombre,
      apellido,
      rol,
      pin_hash,
      estado,
      creado_por
    ) values (
      v_id,
      v_negocio_id,
      v_nombre,
      v_apellido,
      v_rol,
      case
        when v_modo = 'nombre_pin'
          then extensions.crypt(v_pin, extensions.gen_salt('bf', 10))
        else null
      end,
      'activo',
      null
    )
    on conflict (id) do update
    set
      nombre = excluded.nombre,
      apellido = excluded.apellido,
      rol = excluded.rol,
      pin_hash = excluded.pin_hash,
      estado = 'activo';

    insert into public.cajeros_sucursales (cajero_id, sucursal_id)
    values (v_id, v_sucursal_id)
    on conflict (cajero_id, sucursal_id) do nothing;

    v_total := v_total + 1;
  end loop;

  update public.sucursales
  set modo_identificacion_cajero = v_modo
  where id = v_sucursal_id;

  update public.terminales
  set ultima_conexion_en = clock_timestamp()
  where id = v_terminal.id;

  return query select v_total, v_modo;
end;
$$;

-- El listado del dispositivo informa si esa sucursal exige PIN.
drop function public.negocio_listar_cajeros_dispositivo(uuid, text);

create function public.negocio_listar_cajeros_dispositivo(
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  cajero_id uuid,
  nombre text,
  apellido text,
  rol public.rol_cajero_negocio,
  requiere_pin boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.terminales;
  v_sucursal_id uuid;
  v_requiere_pin boolean;
begin
  v_terminal := public.validar_credencial_terminal_interna(
    p_terminal_id,
    p_token_terminal
  );

  select
    caja.sucursal_id,
    sucursal.modo_identificacion_cajero = 'nombre_pin'
  into v_sucursal_id, v_requiere_pin
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = v_terminal.caja_id;

  return query
  select
    cajero.id,
    cajero.nombre::text,
    cajero.apellido::text,
    cajero.rol,
    v_requiere_pin
  from public.cajeros_negocio as cajero
  join public.cajeros_sucursales as asignacion
    on asignacion.cajero_id = cajero.id
  where asignacion.sucursal_id = v_sucursal_id
    and cajero.estado = 'activo'
  order by cajero.nombre, cajero.apellido nulls first;
end;
$$;

-- Conserva la firma existente para no romper clientes ni Terminal. En modo
-- solo_nombre el parámetro p_pin puede enviarse vacío y no se evalúa.
create or replace function public.negocio_iniciar_turno(
  p_terminal_id uuid,
  p_token_terminal text,
  p_cajero_id uuid,
  p_pin text
)
returns table (
  autenticado boolean,
  mensaje text,
  turno_id uuid,
  terminal_id uuid,
  caja_id uuid,
  negocio_id uuid,
  cajero_negocio_id uuid,
  nombre_cajero text,
  estado public.estado_turno_caja,
  iniciado_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.terminales;
  v_sucursal_id uuid;
  v_negocio_id uuid;
  v_modo public.modo_identificacion_cajero;
  v_cajero public.cajeros_negocio;
  v_turno public.turnos_caja;
  v_pin text := btrim(coalesce(p_pin, ''));
  v_intentos smallint;
  v_nombre_completo text;
begin
  v_terminal := public.validar_credencial_terminal_interna(
    p_terminal_id,
    p_token_terminal
  );

  select
    caja.sucursal_id,
    sucursal.negocio_id,
    sucursal.modo_identificacion_cajero
  into v_sucursal_id, v_negocio_id, v_modo
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = v_terminal.caja_id;

  select cajero.*
  into v_cajero
  from public.cajeros_negocio as cajero
  where cajero.id = p_cajero_id
    and cajero.negocio_id = v_negocio_id
    and cajero.estado = 'activo'
    and exists (
      select 1
      from public.cajeros_sucursales as asignacion
      where asignacion.cajero_id = cajero.id
        and asignacion.sucursal_id = v_sucursal_id
    )
  for update;

  if not found then
    return query select
      false,
      'Este cajero no está disponible en la sucursal.'::text,
      null::uuid, v_terminal.id, v_terminal.caja_id, v_negocio_id,
      null::uuid, null::text, null::public.estado_turno_caja,
      null::timestamptz;
    return;
  end if;

  v_nombre_completo := concat_ws(' ', v_cajero.nombre, v_cajero.apellido);

  if v_modo = 'nombre_pin' then
    if v_cajero.pin_hash is null then
      return query select
        false,
        'Este cajero todavía no tiene PIN configurado.'::text,
        null::uuid, v_terminal.id, v_terminal.caja_id, v_negocio_id,
        v_cajero.id, v_nombre_completo,
        null::public.estado_turno_caja, null::timestamptz;
      return;
    end if;

    if v_cajero.pin_bloqueado_hasta is not null
      and v_cajero.pin_bloqueado_hasta > clock_timestamp()
    then
      return query select
        false,
        'PIN bloqueado temporalmente. Intenta nuevamente más tarde.'::text,
        null::uuid, v_terminal.id, v_terminal.caja_id, v_negocio_id,
        v_cajero.id, v_nombre_completo,
        null::public.estado_turno_caja, null::timestamptz;
      return;
    end if;

    if v_pin !~ '^[0-9]{4,6}$'
      or extensions.crypt(v_pin, v_cajero.pin_hash) <> v_cajero.pin_hash
    then
      v_intentos := least(v_cajero.intentos_pin_fallidos + 1, 5);

      update public.cajeros_negocio
      set
        intentos_pin_fallidos = v_intentos,
        pin_bloqueado_hasta = case
          when v_intentos >= 5
            then clock_timestamp() + interval '15 minutes'
          else null
        end
      where id = v_cajero.id;

      return query select
        false,
        case
          when v_intentos >= 5
            then 'PIN incorrecto. Acceso bloqueado por 15 minutos.'
          else 'PIN incorrecto.'
        end::text,
        null::uuid, v_terminal.id, v_terminal.caja_id, v_negocio_id,
        v_cajero.id, v_nombre_completo,
        null::public.estado_turno_caja, null::timestamptz;
      return;
    end if;

    update public.cajeros_negocio
    set
      intentos_pin_fallidos = 0,
      pin_bloqueado_hasta = null
    where id = v_cajero.id;
  end if;

  select turno.*
  into v_turno
  from public.turnos_caja as turno
  where turno.terminal_id = v_terminal.id
    and turno.estado = 'abierto'
  for update;

  if found then
    if v_turno.cajero_negocio_id = v_cajero.id then
      return query select
        true,
        'Turno recuperado.'::text,
        v_turno.id, v_turno.terminal_id, v_turno.caja_id,
        v_turno.negocio_id, v_turno.cajero_negocio_id,
        v_turno.nombre_cajero::text, v_turno.estado, v_turno.iniciado_en;
      return;
    end if;

    return query select
      false,
      format('Ya hay un turno abierto por %s.', v_turno.nombre_cajero),
      v_turno.id, v_turno.terminal_id, v_turno.caja_id,
      v_turno.negocio_id, v_turno.cajero_negocio_id,
      v_turno.nombre_cajero::text, v_turno.estado, v_turno.iniciado_en;
    return;
  end if;

  insert into public.turnos_caja (
    terminal_id,
    caja_id,
    negocio_id,
    nombre_cajero,
    cajero_negocio_id
  ) values (
    v_terminal.id,
    v_terminal.caja_id,
    v_negocio_id,
    v_nombre_completo,
    v_cajero.id
  )
  returning * into v_turno;

  update public.terminales
  set ultima_conexion_en = clock_timestamp()
  where id = v_terminal.id;

  return query select
    true,
    'Turno iniciado.'::text,
    v_turno.id, v_turno.terminal_id, v_turno.caja_id,
    v_turno.negocio_id, v_turno.cajero_negocio_id,
    v_turno.nombre_cajero::text, v_turno.estado, v_turno.iniciado_en;
end;
$$;

revoke all on function public.configurar_modo_identificacion_cajeros(
  uuid, public.modo_identificacion_cajero
) from public, anon, authenticated;
revoke all on function public.negocio_configurar_equipo_inicial(
  uuid, text, public.modo_identificacion_cajero, jsonb
) from public, anon, authenticated;
revoke all on function public.negocio_listar_cajeros_dispositivo(uuid, text)
  from public, anon, authenticated;
revoke all on function public.negocio_iniciar_turno(uuid, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.configurar_modo_identificacion_cajeros(
  uuid, public.modo_identificacion_cajero
) to authenticated;
grant execute on function public.negocio_configurar_equipo_inicial(
  uuid, text, public.modo_identificacion_cajero, jsonb
) to anon, authenticated;
grant execute on function public.negocio_listar_cajeros_dispositivo(uuid, text)
  to anon, authenticated;
grant execute on function public.negocio_iniciar_turno(uuid, text, uuid, text)
  to anon, authenticated;

comment on function public.negocio_configurar_equipo_inicial(
  uuid, text, public.modo_identificacion_cajero, jsonb
) is
  'Completa el onboarding de una sucursal nueva desde un dispositivo recién autorizado, creando sus cajeros sin cuentas y definiendo si usarán PIN.';

comment on function public.negocio_iniciar_turno(uuid, text, uuid, text) is
  'Inicia o recupera un turno de App Negocio. Exige PIN únicamente cuando la sucursal está configurada en modo nombre + PIN.';

commit;
