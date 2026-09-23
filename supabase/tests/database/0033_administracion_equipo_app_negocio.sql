begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cajeros_negocio'
      and column_name = 'origen_creacion'
  ),
  'Cajeros registra el origen de creación'
);

select ok(
  to_regprocedure('public.crear_cajero_negocio_app(uuid,text,text,text,uuid[],public.rol_cajero_negocio)') is not null,
  'Existe creación administrativa desde App Negocio'
);

select ok(
  to_regprocedure('public.deshabilitar_cajero_negocio(uuid)') is not null,
  'Existe deshabilitación sin borrado'
);

select ok(
  to_regprocedure('public.reactivar_cajero_negocio(uuid)') is not null,
  'Existe reactivación del perfil histórico'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-00000000f033',
  'propietario-admin-equipo@pruebas.local',
  '{"nombre":"Propietario Equipo"}'::jsonb
);

insert into public.negocios (id, nombre, slug, rubro, estado)
values (
  '61000000-0000-0000-0000-00000000f033',
  'Negocio Equipo',
  'negocio-equipo',
  'Almacén',
  'activo'
);

insert into public.sucursales (
  id,
  negocio_id,
  nombre,
  direccion,
  comuna,
  estado,
  modo_identificacion_cajero
) values (
  '62000000-0000-0000-0000-00000000f033',
  '61000000-0000-0000-0000-00000000f033',
  'Sucursal Equipo',
  'Calle Equipo 3333',
  'La Serena',
  'activa',
  'solo_nombre'
);

insert into public.cajas (id, sucursal_id, nombre, codigo, estado)
values (
  '63000000-0000-0000-0000-00000000f033',
  '62000000-0000-0000-0000-00000000f033',
  'Caja Regalones',
  'REGALONES-33',
  'activa'
);

insert into public.miembros_negocio (
  negocio_id, usuario_id, rol, estado
) values (
  '61000000-0000-0000-0000-00000000f033',
  '00000000-0000-0000-0000-00000000f033',
  'propietario',
  'activo'
);

insert into public.terminales (
  id,
  caja_id,
  identificador_publico,
  token_hash,
  nombre_dispositivo,
  version_app,
  estado
) values (
  '64000000-0000-0000-0000-00000000f033',
  '63000000-0000-0000-0000-00000000f033',
  'APP-NEGOCIO-EQUIPO-0033',
  encode(
    extensions.digest(
      convert_to('regalones-equipo-token-0033-seguro', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'Teléfono equipo',
  '1.0.0',
  'activa'
);

set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000f033';

select set_config(
  'prueba.cajero_equipo_id',
  (
    select id::text
    from public.crear_cajero_negocio_app(
      '61000000-0000-0000-0000-00000000f033',
      'Camila',
      'Equipo',
      null,
      array['62000000-0000-0000-0000-00000000f033'::uuid],
      'cajero'
    )
  ),
  true
);

reset role;

select is(
  (
    select origen_creacion::text
    from public.cajeros_negocio
    where id = current_setting('prueba.cajero_equipo_id')::uuid
  ),
  'app_negocio',
  'El cajero creado desde App Negocio registra su origen'
);

select is(
  (
    select estado::text
    from public.cajeros_negocio
    where id = current_setting('prueba.cajero_equipo_id')::uuid
  ),
  'activo',
  'El cajero nuevo queda activo'
);

set local role anon;
select is(
  (
    select count(*)
    from public.negocio_listar_cajeros_dispositivo(
      '64000000-0000-0000-0000-00000000f033',
      'regalones-equipo-token-0033-seguro'
    )
    where cajero_id = current_setting('prueba.cajero_equipo_id')::uuid
  ),
  1::bigint,
  'El cajero activo aparece en la selección diaria de App Negocio'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000f033';

select is(
  (
    select estado::text
    from public.deshabilitar_cajero_negocio(
      current_setting('prueba.cajero_equipo_id')::uuid
    )
  ),
  'inactivo',
  'El propietario puede deshabilitar sin eliminar el perfil'
);

reset role;

select ok(
  exists (
    select 1
    from public.cajeros_negocio
    where id = current_setting('prueba.cajero_equipo_id')::uuid
      and estado = 'inactivo'
      and deshabilitado_en is not null
  ),
  'El perfil deshabilitado permanece en base para historial y reportes'
);

set local role anon;
select is(
  (
    select count(*)
    from public.negocio_listar_cajeros_dispositivo(
      '64000000-0000-0000-0000-00000000f033',
      'regalones-equipo-token-0033-seguro'
    )
    where cajero_id = current_setting('prueba.cajero_equipo_id')::uuid
  ),
  0::bigint,
  'El cajero deshabilitado desaparece de la selección de nuevos turnos'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000f033';

select is(
  (
    select estado::text
    from public.reactivar_cajero_negocio(
      current_setting('prueba.cajero_equipo_id')::uuid
    )
  ),
  'activo',
  'El mismo perfil puede reactivarse sin perder identidad histórica'
);

select is(
  (
    select count(*)
    from public.listar_cajeros_negocio_administracion(
      '61000000-0000-0000-0000-00000000f033'
    )
    where cajero_id = current_setting('prueba.cajero_equipo_id')::uuid
      and estado = 'activo'
      and origen_creacion = 'app_negocio'
  ),
  1::bigint,
  'La administración autenticada ve el mismo perfil y su estado actual'
);

reset role;

select * from finish();
rollback;
