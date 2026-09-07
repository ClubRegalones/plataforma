begin;

-- ============================================================================
-- CLUB REGALONES
-- ADMINISTRACIÓN DE EQUIPO DESDE APP NEGOCIO
--
-- Separa operación diaria de administración. Los cajeros siguen siendo perfiles
-- operativos sin cuenta propia; solo propietario/administrador autenticado puede
-- agregarlos, deshabilitarlos, reactivarlos o cambiar la forma de identificación.
-- Los perfiles nunca se borran físicamente, para conservar historial y reportes.
-- ============================================================================

create type public.origen_creacion_cajero as enum (
  'activacion_app',
  'app_negocio',
  'portal_comercio'
);

alter table public.cajeros_negocio
  add column origen_creacion public.origen_creacion_cajero
    not null default 'portal_comercio',
  add column deshabilitado_en timestamptz,
  add column deshabilitado_por uuid references auth.users (id) on delete set null;

update public.cajeros_negocio
set origen_creacion = 'activacion_app'
where creado_por is null;

create function public.inferir_origen_cajero_negocio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.creado_por is null
    and new.origen_creacion = 'portal_comercio'
  then
    new.origen_creacion := 'activacion_app';
  end if;

  return new;
end;
$$;

create trigger cajeros_negocio_inferir_origen
before insert on public.cajeros_negocio
for each row execute function public.inferir_origen_cajero_negocio();

comment on column public.cajeros_negocio.origen_creacion is
  'Canal administrativo que originó el perfil: activación inicial, App Negocio o Portal Comercio.';
comment on column public.cajeros_negocio.deshabilitado_en is
  'Momento en que el perfil dejó de aparecer para nuevos turnos. El historial se conserva.';

create function public.crear_cajero_negocio_app(
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
  v_pin text := nullif(btrim(coalesce(p_pin, '')), '');
  v_cajero public.cajeros_negocio;
  v_requiere_pin boolean;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión como propietario o administrador'
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
      or sucursal.estado <> 'activa'
  ) then
    raise exception 'Todas las sucursales deben estar activas y pertenecer al negocio'
      using errcode = '23514';
  end if;

  select exists (
    select 1
    from public.sucursales as sucursal
    where sucursal.id = any(p_sucursal_ids)
      and sucursal.modo_identificacion_cajero = 'nombre_pin'
  ) into v_requiere_pin;

  if v_requiere_pin and coalesce(v_pin, '') !~ '^[0-9]{4,6}$' then
    raise exception 'Este equipo requiere un PIN de 4 a 6 dígitos para el cajero'
      using errcode = '22023';
  end if;

  if v_pin is not null and v_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe contener entre 4 y 6 dígitos'
      using errcode = '22023';
  end if;

  insert into public.cajeros_negocio (
    negocio_id,
    nombre,
    apellido,
    rol,
    pin_hash,
    estado,
    creado_por,
    origen_creacion
  ) values (
    p_negocio_id,
    v_nombre,
    v_apellido,
    coalesce(p_rol, 'cajero'::public.rol_cajero_negocio),
    case
      when v_pin is null then null
      else extensions.crypt(v_pin, extensions.gen_salt('bf', 10))
    end,
    'activo',
    v_usuario_id,
    'app_negocio'
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

create function public.deshabilitar_cajero_negocio(
  p_cajero_id uuid
)
returns public.cajeros_negocio
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_cajero public.cajeros_negocio;
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

  if v_usuario_id is null
    or (
      not public.es_admin_regalones()
      and not public.es_miembro_negocio(
        v_cajero.negocio_id,
        array[
          'propietario'::public.rol_miembro_negocio,
          'administrador'::public.rol_miembro_negocio
        ]
      )
    )
  then
    raise exception 'No tienes permisos para deshabilitar este cajero'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.turnos_caja as turno
    where turno.cajero_negocio_id = v_cajero.id
      and turno.estado = 'abierto'
  ) then
    raise exception 'Cierra el turno activo antes de deshabilitar al cajero'
      using errcode = '23514';
  end if;

  update public.cajeros_negocio
  set
    estado = 'inactivo',
    deshabilitado_en = coalesce(deshabilitado_en, clock_timestamp()),
    deshabilitado_por = v_usuario_id
  where id = v_cajero.id
  returning * into v_cajero;

  return v_cajero;
end;
$$;

create function public.reactivar_cajero_negocio(
  p_cajero_id uuid
)
returns public.cajeros_negocio
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_cajero public.cajeros_negocio;
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

  if v_usuario_id is null
    or (
      not public.es_admin_regalones()
      and not public.es_miembro_negocio(
        v_cajero.negocio_id,
        array[
          'propietario'::public.rol_miembro_negocio,
          'administrador'::public.rol_miembro_negocio
        ]
      )
    )
  then
    raise exception 'No tienes permisos para reactivar este cajero'
      using errcode = '42501';
  end if;

  update public.cajeros_negocio
  set
    estado = 'activo',
    deshabilitado_en = null,
    deshabilitado_por = null
  where id = v_cajero.id
  returning * into v_cajero;

  return v_cajero;
end;
$$;

create function public.listar_cajeros_negocio_administracion(
  p_negocio_id uuid
)
returns table (
  cajero_id uuid,
  nombre text,
  apellido text,
  rol public.rol_cajero_negocio,
  estado public.estado_cajero_negocio,
  sucursal_ids uuid[],
  origen_creacion public.origen_creacion_cajero,
  tiene_pin boolean,
  creado_en timestamptz,
  deshabilitado_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para administrar el equipo'
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
    raise exception 'No tienes permisos para administrar este negocio'
      using errcode = '42501';
  end if;

  return query
  select
    cajero.id,
    cajero.nombre::text,
    cajero.apellido::text,
    cajero.rol,
    cajero.estado,
    coalesce(
      array_agg(asignacion.sucursal_id order by asignacion.sucursal_id)
        filter (where asignacion.sucursal_id is not null),
      '{}'::uuid[]
    ),
    cajero.origen_creacion,
    cajero.pin_hash is not null,
    cajero.creado_en,
    cajero.deshabilitado_en
  from public.cajeros_negocio as cajero
  left join public.cajeros_sucursales as asignacion
    on asignacion.cajero_id = cajero.id
  where cajero.negocio_id = p_negocio_id
  group by
    cajero.id,
    cajero.nombre,
    cajero.apellido,
    cajero.rol,
    cajero.estado,
    cajero.origen_creacion,
    cajero.pin_hash,
    cajero.creado_en,
    cajero.deshabilitado_en
  order by
    case when cajero.estado = 'activo' then 0 else 1 end,
    cajero.nombre,
    cajero.apellido nulls first;
end;
$$;

revoke all on function public.inferir_origen_cajero_negocio()
  from public, anon, authenticated;
revoke all on function public.crear_cajero_negocio_app(
  uuid, text, text, text, uuid[], public.rol_cajero_negocio
) from public, anon, authenticated;
revoke all on function public.deshabilitar_cajero_negocio(uuid)
  from public, anon, authenticated;
revoke all on function public.reactivar_cajero_negocio(uuid)
  from public, anon, authenticated;
revoke all on function public.listar_cajeros_negocio_administracion(uuid)
  from public, anon, authenticated;

grant execute on function public.crear_cajero_negocio_app(
  uuid, text, text, text, uuid[], public.rol_cajero_negocio
) to authenticated;
grant execute on function public.deshabilitar_cajero_negocio(uuid)
  to authenticated;
grant execute on function public.reactivar_cajero_negocio(uuid)
  to authenticated;
grant execute on function public.listar_cajeros_negocio_administracion(uuid)
  to authenticated;

comment on function public.deshabilitar_cajero_negocio(uuid) is
  'Oculta al cajero de nuevos turnos sin borrar su historial. Requiere propietario, administrador o admin de plataforma.';
comment on function public.reactivar_cajero_negocio(uuid) is
  'Devuelve un perfil histórico al equipo activo sin crear una identidad nueva.';

commit;
