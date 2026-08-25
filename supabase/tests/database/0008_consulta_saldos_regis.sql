begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(18);

select ok(
  to_regprocedure('public.listar_saldos_regis_propios()') is not null,
  'Existe la consulta de saldos propios'
);
select ok(
  to_regprocedure('public.consultar_saldo_regis_llavero(text,uuid)') is not null,
  'Existe la consulta de saldo mediante llavero y caja'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.listar_saldos_regis_propios()',
    'EXECUTE'
  ),
  'Los usuarios autenticados pueden consultar sus saldos'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.listar_saldos_regis_propios()',
    'EXECUTE'
  ),
  'Los usuarios anónimos no consultan saldos propios'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.consultar_saldo_regis_llavero(text,uuid)',
    'EXECUTE'
  ),
  'Los operadores autenticados pueden consultar un llavero'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.consultar_saldo_regis_llavero(text,uuid)',
    'EXECUTE'
  ),
  'Los usuarios anónimos no consultan saldos por llavero'
);
select ok(
  position(
    'vecino_id' in pg_get_function_result(
      'public.consultar_saldo_regis_llavero(text,uuid)'::regprocedure
    )
  ) = 0,
  'La terminal no recibe el ID interno del vecino'
);
select ok(
  position(
    'token' in pg_get_function_result(
      'public.consultar_saldo_regis_llavero(text,uuid)'::regprocedure
    )
  ) = 0,
  'La terminal no recibe el token ni su hash'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000f801',
    'cajero-a-saldos@pruebas.local',
    '{"nombre":"Cajero A Saldos"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f802',
    'cajero-b-saldos@pruebas.local',
    '{"nombre":"Cajero B Saldos"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f803',
    'vecino-saldos@pruebas.local',
    '{"nombre":"Vecino Saldos"}'::jsonb
  );

insert into public.negocios (id, nombre, slug, rubro, estado)
values
  (
    '81000000-0000-4000-8000-000000000001',
    'Almacén Saldo A',
    'almacen-saldo-a',
    'Almacén',
    'activo'
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    'Panadería Saldo B',
    'panaderia-saldo-b',
    'Panadería',
    'activo'
  );

insert into public.sucursales (
  id,
  negocio_id,
  nombre,
  direccion,
  comuna,
  estado
)
values
  (
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'Sucursal Saldo A',
    'Calle A 801',
    'Santiago',
    'activa'
  ),
  (
    '82000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    'Sucursal Saldo B',
    'Calle B 802',
    'Santiago',
    'activa'
  );

insert into public.cajas (id, sucursal_id, nombre, codigo, estado)
values
  (
    '83000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    'Caja Saldo A',
    'CAJA-SALDO-A',
    'activa'
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000002',
    'Caja Saldo B',
    'CAJA-SALDO-B',
    'activa'
  );

insert into public.miembros_negocio (negocio_id, usuario_id, rol, estado)
values
  (
    '81000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000f801',
    'cajero',
    'activo'
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-00000000f802',
    'cajero',
    'activo'
  );

insert into public.llaveros_nfc (
  id,
  vecino_id,
  token_hash,
  codigo_publico,
  estado,
  asignado_en,
  asignado_por,
  preparado_en,
  preparado_por,
  activado_en,
  activado_por,
  caja_activacion_id,
  metodo_verificacion_activacion
)
values (
  '84000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-00000000f803',
  encode(
    extensions.digest(convert_to('llavero-consulta-saldo-001', 'UTF8'), 'sha256'),
    'hex'
  ),
  'CR-SALDO-001',
  'activo',
  now(),
  '00000000-0000-0000-0000-00000000f801',
  now(),
  '00000000-0000-0000-0000-00000000f801',
  now(),
  '00000000-0000-0000-0000-00000000f801',
  '83000000-0000-4000-8000-000000000001',
  'cedula'
);

insert into public.saldos_regis (
  vecino_id,
  negocio_id,
  disponibles,
  reservados,
  pendientes,
  canjeados,
  remanente_valor_clp
)
values
  (
    '00000000-0000-0000-0000-00000000f803',
    '81000000-0000-4000-8000-000000000001',
    12,
    2,
    3,
    4,
    25
  ),
  (
    '00000000-0000-0000-0000-00000000f803',
    '81000000-0000-4000-8000-000000000002',
    7,
    0,
    0,
    1,
    10
  );

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f803';

select is(
  (select count(*) from public.listar_saldos_regis_propios()),
  2::bigint,
  'El vecino obtiene un saldo separado por cada negocio'
);
select is(
  (
    select disponibles
    from public.listar_saldos_regis_propios()
    where negocio_id = '81000000-0000-4000-8000-000000000001'
  ),
  12,
  'El portal devuelve los REGIS disponibles del negocio A'
);
select is(
  (
    select nombre_negocio
    from public.listar_saldos_regis_propios()
    where negocio_id = '81000000-0000-4000-8000-000000000002'
  ),
  'Panadería Saldo B',
  'El portal devuelve el nombre legible del negocio'
);

select throws_ok(
  $$
    select *
    from public.consultar_saldo_regis_llavero(
      'llavero-consulta-saldo-001',
      '83000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'No tienes acceso a la caja indicada',
  'Un vecino sin membresía no consulta saldos desde una caja'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f801';

select is(
  (
    select disponibles
    from public.consultar_saldo_regis_llavero(
      'llavero-consulta-saldo-001',
      '83000000-0000-4000-8000-000000000001'
    )
  ),
  12,
  'La caja A obtiene solo el saldo del negocio A'
);
select is(
  (
    select pendientes
    from public.consultar_saldo_regis_llavero(
      'llavero-consulta-saldo-001',
      '83000000-0000-4000-8000-000000000001'
    )
  ),
  3,
  'La terminal también recibe los REGIS pendientes del negocio A'
);
select is(
  (
    select nombre_negocio
    from public.consultar_saldo_regis_llavero(
      'llavero-consulta-saldo-001',
      '83000000-0000-4000-8000-000000000001'
    )
  ),
  'Almacén Saldo A',
  'La terminal identifica el negocio del saldo mostrado'
);
select throws_ok(
  $$
    select *
    from public.consultar_saldo_regis_llavero(
      'llavero-consulta-saldo-001',
      '83000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  'No tienes acceso a la caja indicada',
  'El cajero A no puede consultar usando la caja B'
);
select throws_ok(
  $$
    select *
    from public.consultar_saldo_regis_llavero(
      'llavero-inexistente-saldo-999',
      '83000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0002',
  'No encontramos un llavero activo',
  'La consulta rechaza un llavero inexistente o inactivo'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f802';

select is(
  (
    select disponibles
    from public.consultar_saldo_regis_llavero(
      'llavero-consulta-saldo-001',
      '83000000-0000-4000-8000-000000000002'
    )
  ),
  7,
  'La caja B obtiene el saldo independiente del negocio B'
);

select * from finish();
rollback;
