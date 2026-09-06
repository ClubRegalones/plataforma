begin;

-- ============================================================================
-- CLUB REGALONES
-- CAJEROS OPERATIVOS PARA APP NEGOCIO
--
-- El cajero de operación no necesita una cuenta propia de Supabase Auth.
-- El propietario/administrador lo crea desde Portal Comercio y el cajero
-- selecciona su nombre + PIN al iniciar turno en App Negocio.
--
-- La Terminal PWA existente continúa funcionando exactamente como antes:
-- sus turnos pueden mantener cajero_negocio_id = null y nombre_cajero libre.
-- ============================================================================

create type public.estado_cajero_negocio as enum (
  'activo',
  'inactivo'
);

create type public.rol_cajero_negocio as enum (
  'cajero',
  'supervisor'
);

create table public.cajeros_negocio (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null
    references public.negocios (id) on delete cascade,
  nombre varchar(100) not null,
  apellido varchar(100),
  rol public.rol_cajero_negocio not null default 'cajero',
  pin_hash text not null,
  estado public.estado_cajero_negocio not null default 'activo',
  intentos_pin_fallidos smallint not null default 0,
  pin_bloqueado_hasta timestamptz,
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default clock_timestamp(),
  constraint cajeros_negocio_nombre_valido check (
    char_length(btrim(nombre)) between 2 and 100
  ),
  constraint cajeros_negocio_apellido_valido check (
    apellido is null
    or char_length(btrim(apellido)) between 2 and 100
  ),
  constraint cajeros_negocio_pin_hash_valido check (
    char_length(pin_hash) >= 32
  ),
  constraint cajeros_negocio_intentos_pin_validos check (
    intentos_pin_fallidos between 0 and 5
  )
);

create index cajeros_negocio_negocio_estado_idx
  on public.cajeros_negocio (negocio_id, estado, nombre);

create table public.cajeros_sucursales (
  cajero_id uuid not null
    references public.cajeros_negocio (id) on delete cascade,
  sucursal_id uuid not null
    references public.sucursales (id) on delete restrict,
  asignado_en timestamptz not null default clock_timestamp(),
  primary key (cajero_id, sucursal_id)
);

create index cajeros_sucursales_sucursal_idx
  on public.cajeros_sucursales (sucursal_id, cajero_id);

create trigger cajeros_negocio_establecer_actualizado_en
before update on public.cajeros_negocio
for each row execute function public.establecer_actualizado_en();

create function public.validar_cajero_sucursal_mismo_negocio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_negocio_cajero uuid;
  v_negocio_sucursal uuid;
begin
  select cajero.negocio_id
  into v_negocio_cajero
  from public.cajeros_negocio as cajero
  where cajero.id = new.cajero_id;

  select sucursal.negocio_id
  into v_negocio_sucursal
  from public.sucursales as sucursal
  where sucursal.id = new.sucursal_id;

  if v_negocio_cajero is null
    or v_negocio_sucursal is null
    or v_negocio_cajero <> v_negocio_sucursal
  then
    raise exception 'El cajero y la sucursal deben pertenecer al mismo negocio'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger cajeros_sucursales_validar_negocio
before insert or update of cajero_id, sucursal_id
on public.cajeros_sucursales
for each row execute function public.validar_cajero_sucursal_mismo_negocio();

alter table public.turnos_caja
  add column cajero_negocio_id uuid
    references public.cajeros_negocio (id) on delete restrict;

create index turnos_caja_cajero_iniciado_idx
  on public.turnos_caja (cajero_negocio_id, iniciado_en desc)
  where cajero_negocio_id is not null;

comment on column public.turnos_caja.cajero_negocio_id is
  'Perfil operativo del cajero cuando el turno se inicia desde App Negocio. Puede ser null en la Terminal PWA heredada, que conserva nombre_cajero.';

create function public.validar_cajero_turno_mismo_negocio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_negocio_cajero uuid;
begin
  if new.cajero_negocio_id is null then
    return new;
  end if;

  select cajero.negocio_id
  into v_negocio_cajero
  from public.cajeros_negocio as cajero
  where cajero.id = new.cajero_negocio_id;

  if v_negocio_cajero is null or v_negocio_cajero <> new.negocio_id then
    raise exception 'El cajero del turno no pertenece al negocio indicado'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger turnos_caja_validar_cajero_negocio
before insert or update of cajero_negocio_id, negocio_id
on public.turnos_caja
for each row execute function public.validar_cajero_turno_mismo_negocio();

-- ============================================================================
-- GESTIÓN DESDE PORTAL COMERCIO
-- ============================================================================

create function public.crear_cajero_negocio(
  p_negocio_id uuid,
  p_nombre text,
  p_apellido text,
  p_pin text,
  p_sucursal_ids uuid[],
  p_rol public.rol_cajero_negocio default 'cajero'
)
returns public.cajeros_negocio
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_apellido text := nullif(btrim(coalesce(p_apellido, '')), '');
  v_pin text := btrim(coalesce(p_pin, ''));
  v_cajero public.cajeros_negocio;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para crear cajeros'
      using errcode = '42501';
  end if;

  if not public.es_admin_regalones()
    and not public.es_miembro_negocio(
      p_negocio_id,
      array[
        'propietario'::public.rol_miembro_negocio,
        'administrador'::public.rol_miembro_negocio
      ]
    )
  then
    raise exception 'No tienes permisos para administrar cajeros de este negocio'
      using errcode = '42501';
  end if;

  if char_length(v_nombre) not between 2 and 100 then
    raise exception 'El nombre del cajero debe tener entre 2 y 100 caracteres'
      using errcode = '22023';
  end if;

  if v_apellido is not null and char_length(v_apellido) not between 2 and 100 then
    raise exception 'El apellido del cajero debe tener entre 2 y 100 caracteres'
      using errcode = '22023';
  end if;

  if v_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe contener entre 4 y 6 dígitos'
      using errcode = '22023';
  end if;

  if coalesce(array_length(p_sucursal_ids, 1), 0) = 0 then
    raise exception 'Asigna al cajero al menos a una sucursal'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_sucursal_ids) as seleccion(sucursal_id)
    left join public.sucursales as sucursal
      on sucursal.id = seleccion.sucursal_id
    where sucursal.id is null
      or sucursal.negocio_id <> p_negocio_id
  ) then
    raise exception 'Todas las sucursales deben pertenecer al negocio del cajero'
      using errcode = '23514';
  end if;

  insert into public.cajeros_negocio (
    negocio_id,
    nombre,
    apellido,
    rol,
    pin_hash,
    creado_por
  ) values (
    p_negocio_id,
    v_nombre,
    v_apellido,
    coalesce(p_rol, 'cajero'::public.rol_cajero_negocio),
    extensions.crypt(v_pin, extensions.gen_salt('bf', 10)),
    v_usuario_id
  )
  returning * into v_cajero;

  insert into public.cajeros_sucursales (cajero_id, sucursal_id)
  select v_cajero.id, sucursal_id
  from (
    select distinct unnest(p_sucursal_ids) as sucursal_id
  ) as sucursales;

  return v_cajero;
end;
$$;

create function public.actualizar_cajero_negocio(
  p_cajero_id uuid,
  p_nombre text,
  p_apellido text,
  p_sucursal_ids uuid[],
  p_rol public.rol_cajero_negocio,
  p_estado public.estado_cajero_negocio
)
returns public.cajeros_negocio
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cajero public.cajeros_negocio;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_apellido text := nullif(btrim(coalesce(p_apellido, '')), '');
begin
  select cajero.*
  into v_cajero
  from public.cajeros_negocio as cajero
  where cajero.id = p_cajero_id
  for update;

  if not found then
    raise exception 'Cajero no encontrado'
      using errcode = 'P0002';
  end if;

  if not public.es_admin_regalones()
    and not public.es_miembro_negocio(
      v_cajero.negocio_id,
      array[
        'propietario'::public.rol_miembro_negocio,
        'administrador'::public.rol_miembro_negocio
      ]
    )
  then
    raise exception 'No tienes permisos para administrar este cajero'
      using errcode = '42501';
  end if;

  if char_length(v_nombre) not between 2 and 100
    or (v_apellido is not null and char_length(v_apellido) not between 2 and 100)
  then
    raise exception 'El nombre o apellido del cajero no es válido'
      using errcode = '22023';
  end if;

  if coalesce(array_length(p_sucursal_ids, 1), 0) = 0 then
    raise exception 'Asigna al cajero al menos a una sucursal'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_sucursal_ids) as seleccion(sucursal_id)
    left join public.sucursales as sucursal
      on sucursal.id = seleccion.sucursal_id
    where sucursal.id is null
      or sucursal.negocio_id <> v_cajero.negocio_id
  ) then
    raise exception 'Todas las sucursales deben pertenecer al negocio del cajero'
      using errcode = '23514';
  end if;

  if p_estado = 'inactivo'
    and exists (
      select 1
      from public.turnos_caja as turno
      where turno.cajero_negocio_id = v_cajero.id
        and turno.estado = 'abierto'
    )
  then
    raise exception 'Cierra el turno activo antes de desactivar al cajero'
      using errcode = '23514';
  end if;

  update public.cajeros_negocio
  set
    nombre = v_nombre,
    apellido = v_apellido,
    rol = coalesce(p_rol, rol),
    estado = coalesce(p_estado, estado)
  where id = v_cajero.id
  returning * into v_cajero;

  delete from public.cajeros_sucursales
  where cajero_id = v_cajero.id;

  insert into public.cajeros_sucursales (cajero_id, sucursal_id)
  select v_cajero.id, sucursal_id
  from (
    select distinct unnest(p_sucursal_ids) as sucursal_id
  ) as sucursales;

  return v_cajero;
end;
$$;

create function public.cambiar_pin_cajero_negocio(
  p_cajero_id uuid,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cajero public.cajeros_negocio;
  v_pin text := btrim(coalesce(p_pin, ''));
begin
  select cajero.*
  into v_cajero
  from public.cajeros_negocio as cajero
  where cajero.id = p_cajero_id
  for update;

  if not found then
    raise exception 'Cajero no encontrado'
      using errcode = 'P0002';
  end if;

  if not public.es_admin_regalones()
    and not public.es_miembro_negocio(
      v_cajero.negocio_id,
      array[
        'propietario'::public.rol_miembro_negocio,
        'administrador'::public.rol_miembro_negocio
      ]
    )
  then
    raise exception 'No tienes permisos para cambiar este PIN'
      using errcode = '42501';
  end if;

  if v_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe contener entre 4 y 6 dígitos'
      using errcode = '22023';
  end if;

  update public.cajeros_negocio
  set
    pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 10)),
    intentos_pin_fallidos = 0,
    pin_bloqueado_hasta = null
  where id = v_cajero.id;

  return true;
end;
$$;

-- ============================================================================
-- API DE DISPOSITIVO PARA APP NEGOCIO
-- Reutiliza la credencial física terminal_id + token_terminal y la Caja
-- Regalones de la sucursal. No expone PIN hashes ni cuentas del propietario.
-- ============================================================================

create function public.negocio_listar_cajeros_dispositivo(
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  cajero_id uuid,
  nombre text,
  apellido text,
  rol public.rol_cajero_negocio
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.terminales;
  v_sucursal_id uuid;
begin
  v_terminal := public.validar_credencial_terminal_interna(
    p_terminal_id,
    p_token_terminal
  );

  select caja.sucursal_id
  into v_sucursal_id
  from public.cajas as caja
  where caja.id = v_terminal.caja_id;

  return query
  select
    cajero.id,
    cajero.nombre::text,
    cajero.apellido::text,
    cajero.rol
  from public.cajeros_negocio as cajero
  join public.cajeros_sucursales as asignacion
    on asignacion.cajero_id = cajero.id
  where asignacion.sucursal_id = v_sucursal_id
    and cajero.estado = 'activo'
  order by cajero.nombre, cajero.apellido nulls first;
end;
$$;

create function public.negocio_iniciar_turno(
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

  select caja.sucursal_id, sucursal.negocio_id
  into v_sucursal_id, v_negocio_id
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

create function public.negocio_consultar_turno(
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
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
begin
  v_terminal := public.validar_credencial_terminal_interna(
    p_terminal_id,
    p_token_terminal
  );

  return query
  select
    turno.id,
    turno.terminal_id,
    turno.caja_id,
    turno.negocio_id,
    turno.cajero_negocio_id,
    turno.nombre_cajero::text,
    turno.estado,
    turno.iniciado_en
  from public.turnos_caja as turno
  where turno.terminal_id = v_terminal.id
    and turno.estado = 'abierto'
  order by turno.iniciado_en desc
  limit 1;
end;
$$;

-- ============================================================================
-- RLS Y PERMISOS
-- ============================================================================

alter table public.cajeros_negocio enable row level security;
alter table public.cajeros_sucursales enable row level security;

create policy cajeros_negocio_leer_gestion
on public.cajeros_negocio
for select
to authenticated
using (
  public.es_admin_regalones()
  or public.es_miembro_negocio(
    negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
);

create policy cajeros_sucursales_leer_gestion
on public.cajeros_sucursales
for select
to authenticated
using (
  exists (
    select 1
    from public.cajeros_negocio as cajero
    where cajero.id = cajeros_sucursales.cajero_id
      and (
        public.es_admin_regalones()
        or public.es_miembro_negocio(
          cajero.negocio_id,
          array[
            'propietario'::public.rol_miembro_negocio,
            'administrador'::public.rol_miembro_negocio
          ]
        )
      )
  )
);

revoke all on table public.cajeros_negocio from anon, authenticated;
revoke all on table public.cajeros_sucursales from anon, authenticated;
grant select on table public.cajeros_negocio to authenticated;
grant select on table public.cajeros_sucursales to authenticated;

revoke all on function public.validar_cajero_sucursal_mismo_negocio()
  from public, anon, authenticated;
revoke all on function public.validar_cajero_turno_mismo_negocio()
  from public, anon, authenticated;

revoke all on function public.crear_cajero_negocio(
  uuid, text, text, text, uuid[], public.rol_cajero_negocio
) from public, anon, authenticated;
revoke all on function public.actualizar_cajero_negocio(
  uuid, text, text, uuid[], public.rol_cajero_negocio,
  public.estado_cajero_negocio
) from public, anon, authenticated;
revoke all on function public.cambiar_pin_cajero_negocio(uuid, text)
  from public, anon, authenticated;
revoke all on function public.negocio_listar_cajeros_dispositivo(uuid, text)
  from public, anon, authenticated;
revoke all on function public.negocio_iniciar_turno(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.negocio_consultar_turno(uuid, text)
  from public, anon, authenticated;

grant execute on function public.crear_cajero_negocio(
  uuid, text, text, text, uuid[], public.rol_cajero_negocio
) to authenticated;
grant execute on function public.actualizar_cajero_negocio(
  uuid, text, text, uuid[], public.rol_cajero_negocio,
  public.estado_cajero_negocio
) to authenticated;
grant execute on function public.cambiar_pin_cajero_negocio(uuid, text)
  to authenticated;
grant execute on function public.negocio_listar_cajeros_dispositivo(uuid, text)
  to anon, authenticated;
grant execute on function public.negocio_iniciar_turno(uuid, text, uuid, text)
  to anon, authenticated;
grant execute on function public.negocio_consultar_turno(uuid, text)
  to anon, authenticated;

comment on table public.cajeros_negocio is
  'Perfiles operativos de caja creados por el comercio. No requieren cuenta de Supabase Auth y se identifican en App Negocio mediante PIN.';
comment on table public.cajeros_sucursales is
  'Sucursales en las que cada cajero operativo puede iniciar turno.';
comment on function public.negocio_iniciar_turno(uuid, text, uuid, text) is
  'Inicia o recupera un turno de App Negocio validando dispositivo, sucursal, cajero y PIN sin exponer el hash del PIN.';

commit;
