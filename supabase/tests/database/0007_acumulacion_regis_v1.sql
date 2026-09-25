begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(59);

select has_table('public', 'reglas_regis', 'Existen las reglas versionadas de REGIS');
select has_table(
  'public',
  'configuraciones_riesgo_regis',
  'Existe la configuración separada de riesgo'
);
select has_table(
  'public',
  'movimientos_regis',
  'Existe el ledger de movimientos REGIS'
);
select has_table('public', 'saldos_regis', 'Existe el resumen de saldos REGIS');
select has_table('public', 'alertas_riesgo', 'Existen las alertas internas de riesgo');
select has_column(
  'public',
  'compras',
  'regla_regis_id',
  'La compra conserva la regla REGIS aplicada'
);
select ok(
  to_regprocedure('public.acreditar_regis_compra(uuid)') is not null,
  'Existe la función interna de acreditación'
);
select ok(
  to_regprocedure('public.consultar_saldo_regis(uuid,uuid)') is not null,
  'Existe la consulta segura de saldo'
);
select is(
  (
    select tasa_acumulacion_bp
    from public.reglas_regis
    where negocio_id is null and version = 1
  ),
  500,
  'La regla global acredita el 5 por ciento'
);
select is(
  (
    select valor_regis_clp
    from public.reglas_regis
    where negocio_id is null and version = 1
  ),
  50,
  'Un REGIS equivale a 50 CLP'
);
select is(
  (
    select monto_minimo_compra_clp
    from public.reglas_regis
    where negocio_id is null and version = 1
  ),
  1000,
  'La compra mínima elegible es de 1000 CLP'
);
select is(
  (
    select porcentaje_maximo_canje_bp
    from public.reglas_regis
    where negocio_id is null and version = 1
  ),
  2000,
  'La regla conserva el máximo general de canje del 20 por ciento'
);
select ok(
  (
    select monto_compra_revision_clp is null
      and max_acumulaciones_ventana is null
    from public.configuraciones_riesgo_regis
    where negocio_id is null and version = 1
  ),
  'Los umbrales reales de riesgo permanecen desactivados hasta su aprobación'
);
select has_trigger(
  'public',
  'movimientos_regis',
  'movimientos_regis_inmutables',
  'El ledger bloquea actualizaciones y eliminaciones'
);
select ok(
  not has_table_privilege('authenticated', 'public.movimientos_regis', 'INSERT'),
  'El frontend no inserta movimientos directamente'
);
select ok(
  not has_table_privilege('authenticated', 'public.movimientos_regis', 'UPDATE'),
  'El frontend no actualiza movimientos directamente'
);
select ok(
  not has_table_privilege('authenticated', 'public.movimientos_regis', 'DELETE'),
  'El frontend no elimina movimientos directamente'
);
select ok(
  not has_table_privilege('authenticated', 'public.saldos_regis', 'INSERT'),
  'El frontend no inserta saldos directamente'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.consultar_saldo_regis(uuid,uuid)',
    'EXECUTE'
  ),
  'Los usuarios autenticados pueden consultar saldos autorizados'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.consultar_saldo_regis(uuid,uuid)',
    'EXECUTE'
  ),
  'Los usuarios anónimos no consultan saldos'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.acreditar_regis_compra(uuid)',
    'EXECUTE'
  ),
  'La acreditación no puede invocarse directamente desde el frontend'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000e701',
    'cajero-a-regis@pruebas.local',
    '{"nombre":"Cajero A Regis"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000e702',
    'cajero-b-regis@pruebas.local',
    '{"nombre":"Cajero B Regis"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000e703',
    'vecino-regis@pruebas.local',
    '{"nombre":"Vecino Regis"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000e704',
    'vecino-ajeno-regis@pruebas.local',
    '{"nombre":"Vecino Ajeno Regis"}'::jsonb
  );

select is(
  (
    select count(*)
    from public.perfiles
    where id::text like '00000000-0000-0000-0000-00000000e70%'
  ),
  4::bigint,
  'Auth creó los perfiles del flujo REGIS'
);

insert into public.negocios (id, nombre, slug, rut, rubro, estado)
values
  (
    '71000000-0000-4000-8000-000000000001',
    'Negocio A Regis',
    'negocio-a-regis',
    '99999993K',
    'Almacén',
    'activo'
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    'Negocio B Regis',
    'negocio-b-regis',
    '999999921',
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
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Sucursal A Regis',
    'Calle A 701',
    'Santiago',
    'activa'
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'Sucursal B Regis',
    'Calle B 702',
    'Santiago',
    'activa'
  );

insert into public.cajas (id, sucursal_id, nombre, codigo, estado)
values
  (
    '73000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    'Caja A Regis',
    'CAJA-REGIS-A',
    'activa'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    'Caja B Regis',
    'CAJA-REGIS-B',
    'activa'
  );

insert into public.miembros_negocio (negocio_id, usuario_id, rol, estado)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000e701',
    'propietario',
    'activo'
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-00000000e702',
    'propietario',
    'activo'
  );

insert into public.configuraciones_riesgo_regis (
  negocio_id,
  version,
  monto_compra_revision_clp,
  max_acumulaciones_ventana,
  ventana_acumulaciones_minutos,
  vigencia_desde
)
values (
  '71000000-0000-4000-8000-000000000001',
  1,
  10000,
  null,
  null,
  statement_timestamp() - interval '1 minute'
);

insert into public.solicitudes_compra (
  id,
  vecino_id,
  caja_id,
  monto_informado,
  informado_por,
  estado,
  expira_en,
  idempotency_key
)
values
  (
    '74000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000e703',
    '73000000-0000-4000-8000-000000000001',
    999,
    'vecino',
    'pendiente_validacion',
    now() + interval '20 minutes',
    'regis-compra-999'
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-00000000e703',
    '73000000-0000-4000-8000-000000000001',
    8600,
    'vecino',
    'pendiente_validacion',
    now() + interval '20 minutes',
    'regis-compra-8600'
  ),
  (
    '74000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-00000000e703',
    '73000000-0000-4000-8000-000000000001',
    1400,
    'vecino',
    'pendiente_validacion',
    now() + interval '20 minutes',
    'regis-compra-1400'
  ),
  (
    '74000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-00000000e703',
    '73000000-0000-4000-8000-000000000002',
    1000,
    'vecino',
    'pendiente_validacion',
    now() + interval '20 minutes',
    'regis-compra-b-1000'
  ),
  (
    '74000000-0000-4000-8000-000000000005',
    '00000000-0000-0000-0000-00000000e703',
    '73000000-0000-4000-8000-000000000001',
    12000,
    'vecino',
    'pendiente_validacion',
    now() + interval '20 minutes',
    'regis-compra-riesgo'
  );

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e701';

select lives_ok(
  $$select public.aprobar_compra('74000000-0000-4000-8000-000000000001')$$,
  'Se aprueba la compra inferior al mínimo sin impedir la venta'
);
select lives_ok(
  $$select public.aprobar_compra('74000000-0000-4000-8000-000000000002')$$,
  'Se aprueba la compra de 8600 CLP'
);
select lives_ok(
  $$select public.aprobar_compra('74000000-0000-4000-8000-000000000003')$$,
  'Se aprueba la compra que completa el remanente'
);

select is(
  (
    select regis_generados
    from public.compras
    where solicitud_id = '74000000-0000-4000-8000-000000000001'
  ),
  0,
  'Una compra de 999 CLP no genera REGIS'
);
select is(
  (
    select count(*)
    from public.movimientos_regis as movimiento
    join public.compras as compra on compra.id = movimiento.compra_id
    where compra.solicitud_id = '74000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'La compra bajo el mínimo no crea un movimiento de valor cero'
);
select is(
  (
    select disponibles
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000e703'
      and negocio_id = '71000000-0000-4000-8000-000000000001'
  ),
  10,
  'El vecino acumula 10 REGIS en el negocio A'
);
select is(
  (
    select remanente_valor_clp
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000e703'
      and negocio_id = '71000000-0000-4000-8000-000000000001'
  ),
  0::numeric,
  'La segunda compra elegible utiliza completamente el remanente'
);
select is(
  (
    select movimiento.cantidad
    from public.movimientos_regis as movimiento
    join public.compras as compra on compra.id = movimiento.compra_id
    where compra.solicitud_id = '74000000-0000-4000-8000-000000000002'
  ),
  8,
  'La compra de 8600 CLP acredita 8 REGIS'
);
select is(
  (
    select movimiento.valor_recompensa_clp
    from public.movimientos_regis as movimiento
    join public.compras as compra on compra.id = movimiento.compra_id
    where compra.solicitud_id = '74000000-0000-4000-8000-000000000002'
  ),
  430::numeric,
  'El snapshot conserva los 430 CLP de recompensa económica'
);
select is(
  (
    select movimiento.remanente_despues_clp
    from public.movimientos_regis as movimiento
    join public.compras as compra on compra.id = movimiento.compra_id
    where compra.solicitud_id = '74000000-0000-4000-8000-000000000002'
  ),
  30::numeric,
  'La compra conserva 30 CLP como remanente'
);
select is(
  (
    select movimiento.cantidad
    from public.movimientos_regis as movimiento
    join public.compras as compra on compra.id = movimiento.compra_id
    where compra.solicitud_id = '74000000-0000-4000-8000-000000000003'
  ),
  2,
  'La compra de 1400 CLP más el remanente acredita 2 REGIS'
);
select is(
  (
    select movimiento.metadata ->> 'regla_version'
    from public.movimientos_regis as movimiento
    join public.compras as compra on compra.id = movimiento.compra_id
    where compra.solicitud_id = '74000000-0000-4000-8000-000000000002'
  ),
  '1',
  'El movimiento guarda la versión de la regla aplicada'
);
select is(
  (
    select movimiento.estado::text
    from public.movimientos_regis as movimiento
    join public.compras as compra on compra.id = movimiento.compra_id
    where compra.solicitud_id = '74000000-0000-4000-8000-000000000002'
  ),
  'disponible',
  'Una compra normal deja sus REGIS disponibles inmediatamente'
);
select lives_ok(
  $$select public.aprobar_compra('74000000-0000-4000-8000-000000000003')$$,
  'Repetir la aprobación devuelve la misma compra'
);
select is(
  (
    select count(*)
    from public.movimientos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000e703'
      and negocio_id = '71000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'La doble aprobación no duplica movimientos'
);
select is(
  (
    select disponibles
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000e703'
      and negocio_id = '71000000-0000-4000-8000-000000000001'
  ),
  10,
  'La doble aprobación tampoco duplica el saldo'
);

select lives_ok(
  $$select public.aprobar_compra('74000000-0000-4000-8000-000000000005')$$,
  'La compra de monto alto se confirma aunque sus REGIS sean revisados'
);
select is(
  (
    select movimiento.estado::text
    from public.movimientos_regis as movimiento
    join public.compras as compra on compra.id = movimiento.compra_id
    where compra.solicitud_id = '74000000-0000-4000-8000-000000000005'
  ),
  'pendiente',
  'La regla de riesgo de prueba deja la acreditación pendiente'
);
select is(
  (
    select disponibles
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000e703'
      and negocio_id = '71000000-0000-4000-8000-000000000001'
  ),
  10,
  'Los REGIS observados no aumentan el saldo disponible'
);
select is(
  (
    select pendientes
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000e703'
      and negocio_id = '71000000-0000-4000-8000-000000000001'
  ),
  12,
  'Los 12 REGIS observados quedan en el saldo pendiente'
);
select is(
  (
    select count(*)
    from public.alertas_riesgo
    where negocio_id = '71000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'La operación sospechosa crea una alerta auditable'
);
select is(
  (
    select estado::text
    from public.compras
    where solicitud_id = '74000000-0000-4000-8000-000000000005'
  ),
  'confirmada',
  'La compra permanece confirmada aunque los REGIS estén pendientes'
);
select is(
  (
    select riesgo::text
    from public.compras
    where solicitud_id = '74000000-0000-4000-8000-000000000005'
  ),
  'alta',
  'La compra conserva la severidad de riesgo aplicada'
);

reset role;

select throws_ok(
  $$
    update public.movimientos_regis
    set metadata = metadata || '{"alterado":true}'::jsonb
    where vecino_id = '00000000-0000-0000-0000-00000000e703'
  $$,
  '55000',
  'Los movimientos REGIS son inmutables; registra un movimiento compensatorio',
  'Ni una corrección interna modifica el ledger histórico'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e702';

select lives_ok(
  $$select public.aprobar_compra('74000000-0000-4000-8000-000000000004')$$,
  'El negocio B aprueba su propia compra'
);
select is(
  (
    select disponibles
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000e703'
      and negocio_id = '71000000-0000-4000-8000-000000000002'
  ),
  1,
  'La compra mínima acredita 1 REGIS en el negocio B'
);
select is(
  (
    select disponibles
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000e703'
      and negocio_id = '71000000-0000-4000-8000-000000000001'
  ),
  null,
  'El negocio B no puede leer el saldo del negocio A mediante RLS'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e703';

select is(
  (select count(*) from public.saldos_regis),
  2::bigint,
  'El vecino ve sus saldos separados de los dos negocios'
);
select is(
  (
    select disponibles
    from public.consultar_saldo_regis(
      '71000000-0000-4000-8000-000000000001',
      null
    )
  ),
  10,
  'El vecino consulta su saldo disponible del negocio A'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e704';

select is(
  (select count(*) from public.saldos_regis),
  0::bigint,
  'Un vecino ajeno no ve saldos de otra cuenta'
);
select throws_ok(
  $$
    select *
    from public.consultar_saldo_regis(
      '71000000-0000-4000-8000-000000000001',
      '00000000-0000-0000-0000-00000000e703'
    )
  $$,
  '42501',
  'No tienes permisos para consultar este saldo',
  'La RPC también bloquea la consulta de una cuenta ajena'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e702';

select is(
  (select count(*) from public.saldos_regis),
  1::bigint,
  'El negocio B solo ve saldos de su propio negocio'
);
select is(
  (select count(*) from public.alertas_riesgo),
  0::bigint,
  'El negocio B no ve alertas del negocio A'
);
select is(
  (
    select disponibles
    from public.consultar_saldo_regis(
      '71000000-0000-4000-8000-000000000002',
      '00000000-0000-0000-0000-00000000e703'
    )
  ),
  1,
  'El negocio B consulta el saldo necesario para atender al vecino'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e701';

select is(
  (select count(*) from public.saldos_regis),
  1::bigint,
  'El negocio A solo ve su resumen de saldo'
);
select is(
  (select count(*) from public.alertas_riesgo),
  1::bigint,
  'El propietario del negocio A puede revisar su alerta'
);
select is(
  (select count(*) from public.configuraciones_riesgo_regis),
  0::bigint,
  'Los límites sensibles de riesgo no se exponen al negocio'
);

reset role;

select * from finish();
rollback;
