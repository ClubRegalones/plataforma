begin;

-- ==========================================================
-- UNA SOLA CAJA REGALONES ACTIVA POR SUCURSAL
-- ==========================================================
--
-- Conservamos la tabla public.cajas porque contiene historial y es
-- referencia de compras, canjes, turnos, NFC y Terminales.
-- Para el piloto, una sucursal solo puede mantener una caja activa.
--
-- No se desactivan registros heredados automáticamente: si una sucursal
-- ya posee más de una caja activa, la preparación de la Caja Regalones
-- falla con un mensaje explícito para que esos datos se revisen antes.

create or replace function public.validar_caja_regalones_unica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = 'activa'::public.estado_caja then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.sucursal_id::text, 0)
    );

    if exists (
      select 1
      from public.cajas as caja
      where caja.sucursal_id = new.sucursal_id
        and caja.estado = 'activa'::public.estado_caja
        and caja.id <> new.id
    ) then
      raise exception 'Esta sucursal ya tiene una Caja Regalones activa'
        using errcode = '23505';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists cajas_regalones_activa_unica
on public.cajas;

create trigger cajas_regalones_activa_unica
before insert or update of sucursal_id, estado
on public.cajas
for each row
execute function public.validar_caja_regalones_unica();

comment on function public.validar_caja_regalones_unica() is
  'Impide crear o reactivar una segunda caja activa en la misma sucursal. Las cajas inactivas se conservan como historial.';


-- ==========================================================
-- PREPARAR / RESOLVER LA CAJA REGALONES DE UNA SUCURSAL
-- ==========================================================

create or replace function public.preparar_caja_regalones(
  p_sucursal_id uuid
)
returns table (
  caja_id uuid,
  caja_nombre text,
  caja_creada boolean,
  terminal_id uuid,
  terminal_identificador text,
  terminal_nombre_dispositivo text,
  terminal_estado public.estado_terminal
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_negocio_id uuid;
  v_caja_id uuid;
  v_caja_nombre text;
  v_total_cajas_activas integer;
  v_caja_creada boolean := false;
  v_terminal public.terminales;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para configurar la Caja Regalones'
      using errcode = '42501';
  end if;

  select sucursal.negocio_id
  into v_negocio_id
  from public.sucursales as sucursal
  join public.negocios as negocio
    on negocio.id = sucursal.negocio_id
  where sucursal.id = p_sucursal_id
    and sucursal.estado = 'activa'::public.estado_sucursal
    and negocio.estado = 'activo'::public.estado_negocio
  for update of sucursal;

  if v_negocio_id is null then
    raise exception 'La sucursal no existe o no está activa'
      using errcode = 'P0002';
  end if;

  if not public.es_miembro_negocio(
    v_negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  ) then
    raise exception 'Solo el propietario o administrador puede configurar la Caja Regalones'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_sucursal_id::text, 0)
  );

  select count(*)::integer
  into v_total_cajas_activas
  from public.cajas as caja
  where caja.sucursal_id = p_sucursal_id
    and caja.estado = 'activa'::public.estado_caja;

  if v_total_cajas_activas > 1 then
    raise exception 'Esta sucursal tiene más de una caja activa heredada. Revísalas antes de configurar la Caja Regalones única.'
      using errcode = '55000';
  end if;

  if v_total_cajas_activas = 0 then
    insert into public.cajas (
      sucursal_id,
      nombre,
      codigo,
      estado
    ) values (
      p_sucursal_id,
      'Caja Regalones',
      null,
      'activa'::public.estado_caja
    )
    returning id, nombre::text
    into v_caja_id, v_caja_nombre;

    v_caja_creada := true;
  else
    select caja.id, caja.nombre::text
    into v_caja_id, v_caja_nombre
    from public.cajas as caja
    where caja.sucursal_id = p_sucursal_id
      and caja.estado = 'activa'::public.estado_caja
    limit 1;

    if v_caja_nombre <> 'Caja Regalones' then
      update public.cajas as caja
      set
        nombre = 'Caja Regalones',
        actualizado_en = clock_timestamp()
      where caja.id = v_caja_id;

      v_caja_nombre := 'Caja Regalones';
    end if;
  end if;

  select terminal.*
  into v_terminal
  from public.terminales as terminal
  where terminal.caja_id = v_caja_id
    and terminal.estado <> 'revocada'::public.estado_terminal
  order by terminal.creado_en desc
  limit 1;

  return query
  select
    v_caja_id,
    v_caja_nombre,
    v_caja_creada,
    v_terminal.id,
    v_terminal.identificador_publico::text,
    v_terminal.nombre_dispositivo::text,
    v_terminal.estado;
end;
$$;

revoke all
on function public.preparar_caja_regalones(uuid)
from public, anon;

grant execute
on function public.preparar_caja_regalones(uuid)
to authenticated;

comment on function public.preparar_caja_regalones(uuid) is
  'Devuelve la única Caja Regalones activa de una sucursal o la crea internamente si todavía no existe. También informa la Terminal actualmente instalada.';


-- ==========================================================
-- MOVER LA TERMINAL A ESTE DISPOSITIVO
-- ==========================================================
--
-- La acción es deliberadamente distinta de registrar_terminal_pwa:
-- solo se invoca después de una confirmación explícita del propietario
-- o administrador. Conserva la Terminal anterior como historial, cierra
-- su turno abierto y reemplaza cualquier lector móvil aún vinculado.

create or replace function public.mover_terminal_pwa(
  p_caja_id uuid,
  p_nombre_dispositivo text,
  p_version_app text default null
)
returns table (
  terminal_id uuid,
  caja_id uuid,
  identificador_publico text,
  token_terminal text,
  nombre_dispositivo text,
  estado public.estado_terminal
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_negocio_id uuid;
  v_terminal_anterior_id uuid;
  v_ahora timestamptz := clock_timestamp();
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para mover la Terminal'
      using errcode = '42501';
  end if;

  select sucursal.negocio_id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  join public.negocios as negocio
    on negocio.id = sucursal.negocio_id
  where caja.id = p_caja_id
    and caja.estado = 'activa'::public.estado_caja
    and sucursal.estado = 'activa'::public.estado_sucursal
    and negocio.estado = 'activo'::public.estado_negocio;

  if v_negocio_id is null then
    raise exception 'La Caja Regalones no existe o no está activa'
      using errcode = 'P0002';
  end if;

  if not public.es_miembro_negocio(
    v_negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  ) then
    raise exception 'Solo el propietario o administrador puede mover la Terminal'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_caja_id::text, 0)
  );

  select terminal.id
  into v_terminal_anterior_id
  from public.terminales as terminal
  where terminal.caja_id = p_caja_id
    and terminal.estado <> 'revocada'::public.estado_terminal
  order by terminal.creado_en desc
  limit 1
  for update;

  if v_terminal_anterior_id is not null then
    update public.lecturas_llavero_terminal as lectura
    set estado = 'rechazada'
    where lectura.terminal_id = v_terminal_anterior_id
      and lectura.estado = 'pendiente';

    update public.sesiones_lector_movil as sesion
    set
      estado = 'reemplazada',
      token_vinculacion_hash = null,
      token_lector_hash = null,
      cerrada_en = v_ahora
    where sesion.terminal_id = v_terminal_anterior_id
      and sesion.estado in ('pendiente_vinculacion', 'vinculada');

    update public.turnos_caja as turno
    set
      estado = 'cerrado_automaticamente',
      cerrado_en = v_ahora,
      ultima_actividad_en = v_ahora
    where turno.terminal_id = v_terminal_anterior_id
      and turno.estado = 'abierto';

    update public.terminales as terminal
    set
      estado = 'revocada',
      actualizado_en = v_ahora
    where terminal.id = v_terminal_anterior_id;
  end if;

  return query
  select
    registro.terminal_id,
    registro.caja_id,
    registro.identificador_publico,
    registro.token_terminal,
    registro.nombre_dispositivo,
    registro.estado
  from public.registrar_terminal_pwa(
    p_caja_id,
    p_nombre_dispositivo,
    p_version_app
  ) as registro;
end;
$$;

revoke all
on function public.mover_terminal_pwa(uuid, text, text)
from public, anon;

grant execute
on function public.mover_terminal_pwa(uuid, text, text)
to authenticated;

comment on function public.mover_terminal_pwa(uuid, text, text) is
  'Traslada la Caja Regalones a un nuevo dispositivo: revoca la Terminal anterior, cierra su turno y lector activos, conserva el historial y registra una nueva Terminal.';

commit;
