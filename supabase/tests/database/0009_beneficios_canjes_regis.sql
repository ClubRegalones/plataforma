begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table(
  'public',
  'beneficios_regis',
  'Existe la identidad estable de los beneficios'
);
select has_table(
  'public',
  'versiones_beneficio_regis',
  'Existen versiones históricas de cada beneficio'
);
select has_table(
  'public',
  'canjes_regis',
  'Existe el ciclo de reservas y canjes'
);
select has_column(
  'public',
  'compras',
  'monto_bruto_clp',
  'La compra conserva su monto bruto'
);
select has_column(
  'public',
  'compras',
  'descuento_total_clp',
  'La compra conserva el descuento aplicado'
);
select has_column(
  'public',
  'compras',
  'aporte_promocional_clp',
  'La compra conserva el aporte promocional del negocio'
);
select has_column(
  'public',
  'compras',
  'regis_utilizados',
  'La compra conserva los REGIS utilizados'
);

select ok(
  to_regprocedure(
    'public.crear_beneficio_regis(uuid,text,text,public.tipo_beneficio_regis,integer,integer,integer,integer,integer,integer,integer,timestamptz,timestamptz,boolean,text,boolean)'
  ) is not null,
  'Existe la creación controlada de beneficios'
);
select ok(
  to_regprocedure(
    'public.versionar_beneficio_regis(uuid,text,public.tipo_beneficio_regis,integer,integer,integer,integer,integer,integer,integer,timestamptz,timestamptz,boolean,text,boolean)'
  ) is not null,
  'Existe el versionado controlado de beneficios'
);
select ok(
  to_regprocedure('public.reservar_canje_regis_qr(uuid,text,text)') is not null,
  'Existe la reserva digital mediante QR'
);
select ok(
  to_regprocedure(
    'public.reservar_canje_regis_llavero(text,uuid,uuid,text)'
  ) is not null,
  'Existe la reserva asistida mediante llavero'
);
select ok(
  to_regprocedure(
    'public.confirmar_compra_con_canje(uuid,uuid,integer,text,text)'
  ) is not null,
  'Existe la confirmación atómica de compra y canje'
);
select ok(
  to_regprocedure('public.cancelar_reserva_canje_regis(uuid)') is not null,
  'Existe la cancelación segura de reservas'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.canjes_regis',
    'INSERT'
  ),
  'El frontend no inserta canjes directamente'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.canjes_regis',
    'UPDATE'
  ),
  'El frontend no modifica canjes directamente'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.canjes_regis',
    'qr_token_hash',
    'SELECT'
  ),
  'El hash secreto del QR no se expone al frontend'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.expirar_reservas_canje_regis()',
    'EXECUTE'
  ),
  'La expiración interna no puede invocarse desde el frontend'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.crear_reserva_canje_regis_interna(uuid,uuid,public.origen_canje_regis,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'La reserva interna no puede saltarse los flujos públicos'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.reservar_canje_regis_qr(uuid,text,text)',
    'EXECUTE'
  ),
  'El vecino autenticado puede iniciar el flujo QR'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.reservar_canje_regis_qr(uuid,text,text)',
    'EXECUTE'
  ),
  'Una sesión anónima no puede reservar REGIS'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000f901',
    'propietario-a-canjes@pruebas.local',
    '{"nombre":"Propietario A Canjes"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f902',
    'propietario-b-canjes@pruebas.local',
    '{"nombre":"Propietario B Canjes"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f903',
    'vecino-uno-canjes@pruebas.local',
    '{"nombre":"Vecino Uno Canjes"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f904',
    'vecino-dos-canjes@pruebas.local',
    '{"nombre":"Vecino Dos Canjes"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f905',
    'vecino-tres-canjes@pruebas.local',
    '{"nombre":"Vecino Tres Canjes"}'::jsonb
  );

insert into public.negocios (id, nombre, slug, rubro, estado)
values
  (
    '91000000-0000-4000-8000-000000000001',
    'Panadería Beneficios A',
    'panaderia-beneficios-a',
    'Panadería',
    'activo'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'Almacén Beneficios B',
    'almacen-beneficios-b',
    'Almacén',
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
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'Sucursal Beneficios A',
    'Calle Beneficios A 901',
    'Santiago',
    'activa'
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    'Sucursal Beneficios B',
    'Calle Beneficios B 902',
    'Santiago',
    'activa'
  );

insert into public.cajas (id, sucursal_id, nombre, codigo, estado)
values
  (
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'Caja Beneficios A',
    'CAJA-BENEFICIOS-A',
    'activa'
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002',
    'Caja Beneficios B',
    'CAJA-BENEFICIOS-B',
    'activa'
  );

insert into public.miembros_negocio (negocio_id, usuario_id, rol, estado)
values
  (
    '91000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000f901',
    'propietario',
    'activo'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-00000000f902',
    'propietario',
    'activo'
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
    '00000000-0000-0000-0000-00000000f903',
    '91000000-0000-4000-8000-000000000001',
    100,
    0,
    0,
    0,
    0
  ),
  (
    '00000000-0000-0000-0000-00000000f904',
    '91000000-0000-4000-8000-000000000001',
    100,
    0,
    0,
    0,
    0
  ),
  (
    '00000000-0000-0000-0000-00000000f905',
    '91000000-0000-4000-8000-000000000001',
    100,
    0,
    0,
    0,
    0
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
  '94000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-00000000f903',
  encode(
    extensions.digest(
      convert_to('llavero-canje-activo-001', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'CR-CANJE-001',
  'activo',
  now(),
  '00000000-0000-0000-0000-00000000f901',
  now(),
  '00000000-0000-0000-0000-00000000f901',
  now(),
  '00000000-0000-0000-0000-00000000f901',
  '93000000-0000-4000-8000-000000000001',
  'cedula'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f901';

select lives_ok(
  $$
    select public.crear_beneficio_regis(
      '91000000-0000-4000-8000-000000000001',
      'pan-20-por-ciento',
      '20% en panadería',
      'porcentaje_descuento',
      40,
      10000,
      2000,
      null,
      5000,
      2,
      1,
      now(),
      now() + interval '1 day',
      true,
      'Descuento porcentual con tope para el piloto',
      true
    )
  $$,
  'El propietario publica un beneficio económicamente válido'
);
select is(
  (
    select version
    from public.versiones_beneficio_regis as version_beneficio
    join public.beneficios_regis as beneficio
      on beneficio.id = version_beneficio.beneficio_id
    where beneficio.codigo = 'pan-20-por-ciento'
  ),
  1,
  'El beneficio comienza en la versión 1'
);
select is(
  (
    select valor_regis_clp
    from public.versiones_beneficio_regis as version_beneficio
    join public.beneficios_regis as beneficio
      on beneficio.id = version_beneficio.beneficio_id
    where beneficio.codigo = 'pan-20-por-ciento'
  ),
  50,
  'La versión guarda el valor histórico de un REGIS'
);
select throws_ok(
  $$
    select public.crear_beneficio_regis(
      '91000000-0000-4000-8000-000000000001',
      'beneficio-inviable',
      'Beneficio inviable',
      'porcentaje_descuento',
      500,
      10000,
      2000,
      null,
      5000,
      null,
      1,
      now(),
      now() + interval '1 day',
      true,
      null,
      false
    )
  $$,
  '23514',
  'El costo en REGIS supera el descuento mínimo garantizado',
  'Se rechaza un beneficio cuyo costo supera el descuento garantizado'
);
select lives_ok(
  $$
    select public.crear_beneficio_regis(
      '91000000-0000-4000-8000-000000000001',
      'descuento-fijo',
      'Mil pesos de descuento',
      'monto_fijo',
      20,
      5000,
      null,
      1000,
      null,
      2,
      3,
      now(),
      now() + interval '1 day',
      true,
      'Beneficio fijo para el flujo asistido',
      false
    )
  $$,
  'El propietario publica un beneficio de monto fijo'
);
select lives_ok(
  $$
    select public.versionar_beneficio_regis(
      (
        select id
        from public.beneficios_regis
        where codigo = 'descuento-fijo'
      ),
      'Mil pesos de descuento v2',
      'monto_fijo',
      18,
      5000,
      null,
      1000,
      null,
      2,
      3,
      now(),
      now() + interval '2 days',
      true,
      'Segunda versión con menor costo REGIS',
      false
    )
  $$,
  'Se publica una nueva versión sin editar la anterior'
);
select is(
  (
    select count(*)
    from public.versiones_beneficio_regis as version_beneficio
    join public.beneficios_regis as beneficio
      on beneficio.id = version_beneficio.beneficio_id
    where beneficio.codigo = 'descuento-fijo'
  ),
  2::bigint,
  'El historial conserva ambas versiones'
);
select is(
  (
    select estado::text
    from public.versiones_beneficio_regis as version_beneficio
    join public.beneficios_regis as beneficio
      on beneficio.id = version_beneficio.beneficio_id
    where beneficio.codigo = 'descuento-fijo'
      and version_beneficio.version = 1
  ),
  'finalizado',
  'La versión anterior se finaliza al publicar la siguiente'
);
select is(
  (
    select costo_regis
    from public.versiones_beneficio_regis as version_beneficio
    join public.beneficios_regis as beneficio
      on beneficio.id = version_beneficio.beneficio_id
    where beneficio.codigo = 'descuento-fijo'
      and version_beneficio.version = 2
  ),
  18,
  'La versión nueva conserva sus propias condiciones'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f902';

select throws_ok(
  $$
    select public.crear_beneficio_regis(
      '91000000-0000-4000-8000-000000000001',
      'beneficio-ajeno',
      'Beneficio ajeno',
      'monto_fijo',
      10,
      5000,
      null,
      500,
      null,
      null,
      1,
      now(),
      now() + interval '1 day',
      true,
      null,
      false
    )
  $$,
  '42501',
  'No tienes permisos para crear beneficios en este negocio',
  'Un propietario no administra beneficios de otro negocio'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f903';

select lives_ok(
  $$
    select set_config('prueba.canje_qr_1', canje_id::text, true)
    from public.reservar_canje_regis_qr(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'pan-20-por-ciento'
          and version_beneficio.estado = 'activo'
      ),
      'qr-digital-canjes-vecino-001',
      'reserva-qr-vecino-001'
    )
  $$,
  'El vecino reserva REGIS y genera un QR temporal'
);
select is(
  (
    select estado::text
    from public.canjes_regis
    where id = current_setting('prueba.canje_qr_1')::uuid
  ),
  'reservado',
  'El canje QR comienza reservado'
);
select is(
  (
    select origen::text
    from public.canjes_regis
    where id = current_setting('prueba.canje_qr_1')::uuid
  ),
  'qr',
  'El canje conserva su origen digital'
);
reset role;

select ok(
  (
    select qr_token_hash <> 'qr-digital-canjes-vecino-001'
      and char_length(qr_token_hash) = 64
    from public.canjes_regis
    where id = current_setting('prueba.canje_qr_1')::uuid
  ),
  'La base guarda solamente el hash del token QR'
);
select ok(
  (
    select expira_en > now()
      and expira_en <= now() + interval '10 minutes 5 seconds'
    from public.canjes_regis
    where id = current_setting('prueba.canje_qr_1')::uuid
  ),
  'El QR tiene una vigencia breve de diez minutos'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f903';
select is(
  (
    select disponibles
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000f903'
      and negocio_id = '91000000-0000-4000-8000-000000000001'
  ),
  60,
  'La reserva descuenta REGIS disponibles'
);
select is(
  (
    select reservados
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000f903'
      and negocio_id = '91000000-0000-4000-8000-000000000001'
  ),
  40,
  'La reserva mueve los REGIS al saldo reservado'
);
select lives_ok(
  $$
    select public.reservar_canje_regis_qr(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'pan-20-por-ciento'
          and version_beneficio.estado = 'activo'
      ),
      'qr-digital-canjes-vecino-001',
      'reserva-qr-vecino-001'
    )
  $$,
  'Repetir la misma reserva es idempotente'
);
select is(
  (
    select count(*)
    from public.canjes_regis
    where id = current_setting('prueba.canje_qr_1')::uuid
  ),
  1::bigint,
  'La idempotencia evita duplicar la reserva y el débito'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f902';

select throws_ok(
  $$
    select public.consultar_canje_regis_qr(
      'qr-digital-canjes-vecino-001',
      '93000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0002',
  'Canje QR no encontrado para este negocio',
  'Otro negocio no puede leer el QR reservado'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f901';

select lives_ok(
  $$
    select public.consultar_canje_regis_qr(
      'qr-digital-canjes-vecino-001',
      '93000000-0000-4000-8000-000000000001'
    )
  $$,
  'El negocio correcto puede leer el QR'
);
select throws_ok(
  $$
    select public.confirmar_compra_con_canje(
      current_setting('prueba.canje_qr_1')::uuid,
      '93000000-0000-4000-8000-000000000001',
      25000,
      'BOLETA-QR-SIN-LECTURA',
      'token-qr-incorrecto'
    )
  $$,
  '42501',
  'El token QR no autoriza este canje',
  'El ID interno no basta para confirmar un QR que no fue escaneado'
);
select throws_ok(
  $$
    select public.confirmar_compra_con_canje(
      (
        select id
        from public.canjes_regis
        where id = current_setting('prueba.canje_qr_1')::uuid
      ),
      '93000000-0000-4000-8000-000000000001',
      9999,
      'BOLETA-QR-INVALIDA',
      'qr-digital-canjes-vecino-001'
    )
  $$,
  '23514',
  'La compra no alcanza el mínimo del beneficio',
  'Una compra bajo el mínimo no consume el canje'
);
select is(
  (
    select estado::text
    from public.canjes_regis
    where id = current_setting('prueba.canje_qr_1')::uuid
  ),
  'reservado',
  'Un error de validación mantiene intacta la reserva'
);
select is(
  (
    select count(*)
    from public.compras
    where folio_boleta = 'BOLETA-QR-INVALIDA'
  ),
  0::bigint,
  'La confirmación fallida no crea una compra parcial'
);
select lives_ok(
  $$
    select public.confirmar_compra_con_canje(
      (
        select id
        from public.canjes_regis
        where id = current_setting('prueba.canje_qr_1')::uuid
      ),
      '93000000-0000-4000-8000-000000000001',
      25000,
      'BOLETA-QR-001',
      'qr-digital-canjes-vecino-001'
    )
  $$,
  'El cajero confirma atómicamente el canje QR y la compra'
);
select ok(
  (
    select estado = 'confirmado'
      and monto_compra_bruto_clp = 25000
      and descuento_total_clp = 5000
      and valor_financiado_regis_clp = 2000
      and aporte_promocional_negocio_clp = 3000
      and monto_final_pagado_clp = 20000
    from public.canjes_regis
    where id = current_setting('prueba.canje_qr_1')::uuid
  ),
  'El canje conserva el desglose económico completo'
);
select ok(
  (
    select monto_bruto_clp = 25000
      and monto_final = 20000
      and descuento_total_clp = 5000
      and aporte_promocional_clp = 3000
      and regis_utilizados = 40
      and origen = 'autoservicio'
    from public.compras
    where folio_boleta = 'BOLETA-QR-001'
  ),
  'La compra digital conserva el mismo snapshot económico'
);
select is(
  (
    select disponibles
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000f903'
      and negocio_id = '91000000-0000-4000-8000-000000000001'
  ),
  80,
  'Tras usar 40 REGIS se acreditan 20 por el monto final pagado'
);
select ok(
  (
    select reservados = 0 and canjeados = 40
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000f903'
      and negocio_id = '91000000-0000-4000-8000-000000000001'
  ),
  'La confirmación consume exactamente el saldo reservado'
);
select is(
  (
    select count(*)
    from public.movimientos_regis
    where canje_id = (
      select id
      from public.canjes_regis
      where id = current_setting('prueba.canje_qr_1')::uuid
    )
      and tipo = 'canje'
      and cantidad = -40
  ),
  1::bigint,
  'El ledger registra un débito REGIS inmutable'
);
select is(
  (
    select count(*)
    from public.movimientos_regis as movimiento
    join public.compras as compra on compra.id = movimiento.compra_id
    where compra.folio_boleta = 'BOLETA-QR-001'
      and movimiento.tipo = 'acreditacion_compra'
      and movimiento.cantidad = 20
  ),
  1::bigint,
  'El mismo cierre acredita REGIS sobre el monto pagado'
);
select lives_ok(
  $$
    select public.confirmar_compra_con_canje(
      (
        select id
        from public.canjes_regis
        where id = current_setting('prueba.canje_qr_1')::uuid
      ),
      '93000000-0000-4000-8000-000000000001',
      25000,
      'BOLETA-QR-001',
      'qr-digital-canjes-vecino-001'
    )
  $$,
  'Repetir la confirmación devuelve el mismo resultado'
);
select is(
  (
    select count(*)
    from public.compras
    where folio_boleta = 'BOLETA-QR-001'
  ),
  1::bigint,
  'La confirmación idempotente no duplica la compra'
);
select throws_ok(
  $$
    select public.cancelar_reserva_canje_regis(
      (
        select id
        from public.canjes_regis
        where id = current_setting('prueba.canje_qr_1')::uuid
      )
    )
  $$,
  '23514',
  'Un canje confirmado no se puede cancelar',
  'Un canje confirmado queda protegido contra cancelaciones tardías'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f904';

select lives_ok(
  $$
    select set_config('prueba.canje_qr_2', canje_id::text, true)
    from public.reservar_canje_regis_qr(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'pan-20-por-ciento'
          and version_beneficio.estado = 'activo'
      ),
      'qr-digital-canjes-vecino-002',
      'reserva-qr-vecino-002'
    )
  $$,
  'El segundo vecino ocupa el último cupo del beneficio'
);
select throws_ok(
  $$
    select public.reservar_canje_regis_qr(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'pan-20-por-ciento'
          and version_beneficio.estado = 'activo'
      ),
      'qr-digital-canjes-vecino-002-bis',
      'reserva-qr-vecino-002-bis'
    )
  $$,
  '23514',
  'El beneficio está agotado',
  'Los cupos se evalúan antes del límite individual'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f905';

select throws_ok(
  $$
    select public.reservar_canje_regis_qr(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'pan-20-por-ciento'
          and version_beneficio.estado = 'activo'
      ),
      'qr-digital-canjes-vecino-003',
      'reserva-qr-vecino-003'
    )
  $$,
  '23514',
  'El beneficio está agotado',
  'Un tercer vecino no puede sobrepasar el cupo total'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f904';

select lives_ok(
  $$
    select public.cancelar_reserva_canje_regis(
      (
        select id
        from public.canjes_regis
        where id = current_setting('prueba.canje_qr_2')::uuid
      )
    )
  $$,
  'El vecino cancela su reserva vigente'
);
select ok(
  (
    select disponibles = 100 and reservados = 0
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000f904'
      and negocio_id = '91000000-0000-4000-8000-000000000001'
  ),
  'Cancelar devuelve íntegramente los REGIS reservados'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f905';

select lives_ok(
  $$
    select set_config('prueba.canje_qr_3', canje_id::text, true)
    from public.reservar_canje_regis_qr(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'pan-20-por-ciento'
          and version_beneficio.estado = 'activo'
      ),
      'qr-digital-canjes-vecino-003',
      'reserva-qr-vecino-003'
    )
  $$,
  'Un cupo cancelado vuelve a estar disponible'
);

reset role;

update public.canjes_regis
set
  reservado_en = now() - interval '20 minutes',
  expira_en = now() - interval '10 minutes'
where id = current_setting('prueba.canje_qr_3')::uuid;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f905';

select lives_ok(
  $$select public.listar_beneficios_regis_disponibles(null)$$,
  'Consultar beneficios procesa las reservas vencidas'
);
select is(
  (
    select estado::text
    from public.canjes_regis
    where id = current_setting('prueba.canje_qr_3')::uuid
  ),
  'expirado',
  'La reserva vencida queda marcada como expirada'
);
select ok(
  (
    select disponibles = 100 and reservados = 0
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000f905'
      and negocio_id = '91000000-0000-4000-8000-000000000001'
  ),
  'La expiración libera automáticamente saldo y cupo'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f901';

select throws_ok(
  $$
    select public.confirmar_compra_con_canje(
      current_setting('prueba.canje_qr_3')::uuid,
      '93000000-0000-4000-8000-000000000001',
      25000,
      'BOLETA-QR-EXPIRADA',
      'qr-digital-canjes-vecino-003'
    )
  $$,
  '23514',
  'El canje expiró y debe generarse uno nuevo',
  'Una reserva expirada nunca puede convertirse en compra'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f902';

select throws_ok(
  $$
    select public.reservar_canje_regis_llavero(
      'llavero-canje-activo-001',
      '93000000-0000-4000-8000-000000000002',
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'descuento-fijo'
          and version_beneficio.estado = 'activo'
      ),
      'reserva-llavero-ajena-001'
    )
  $$,
  '42501',
  'El beneficio no pertenece al negocio de la caja',
  'Un comercio no reserva con un beneficio ajeno'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f901';

select lives_ok(
  $$
    select set_config('prueba.canje_llavero_1', canje_id::text, true)
    from public.reservar_canje_regis_llavero(
      'llavero-canje-activo-001',
      '93000000-0000-4000-8000-000000000001',
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'descuento-fijo'
          and version_beneficio.estado = 'activo'
      ),
      'reserva-llavero-vecino-001'
    )
  $$,
  'El cajero reserva el beneficio para un llavero activo'
);
select ok(
  (
    select origen = 'llavero'
      and llavero_id = '94000000-0000-4000-8000-000000000001'
      and costo_regis = 18
    from public.canjes_regis
    where id = current_setting('prueba.canje_llavero_1')::uuid
  ),
  'La reserva asistida queda vinculada al llavero y la versión vigente'
);
select lives_ok(
  $$
    select public.confirmar_compra_con_canje(
      (
        select id
        from public.canjes_regis
        where id = current_setting('prueba.canje_llavero_1')::uuid
      ),
      '93000000-0000-4000-8000-000000000001',
      5000,
      'BOLETA-LLAVERO-001'
    )
  $$,
  'El cajero confirma la compra asistida con llavero'
);
select ok(
  (
    select monto_bruto_clp = 5000
      and descuento_total_clp = 1000
      and monto_final = 4000
      and aporte_promocional_clp = 100
      and regis_utilizados = 18
      and origen = 'asistido'
    from public.compras
    where folio_boleta = 'BOLETA-LLAVERO-001'
  ),
  'La compra asistida aplica el beneficio fijo y su aporte promocional'
);
select ok(
  (
    select disponibles = 66
      and reservados = 0
      and canjeados = 58
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000f903'
      and negocio_id = '91000000-0000-4000-8000-000000000001'
  ),
  'El flujo asistido debita 18 REGIS y acredita 4 por los 4000 CLP pagados'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f902';

select is(
  (
    select count(*)
    from public.canjes_regis
    where negocio_id = '91000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'RLS oculta los canjes de otro negocio'
);
select throws_ok(
  $$
    select public.cancelar_reserva_canje_regis(
      (
        select id
        from public.canjes_regis
        where id = current_setting('prueba.canje_llavero_1')::uuid
      )
    )
  $$,
  'P0002',
  'Canje no encontrado',
  'RLS y la función no permiten operar con un canje ajeno invisible'
);

reset role;

select * from finish();
rollback;
