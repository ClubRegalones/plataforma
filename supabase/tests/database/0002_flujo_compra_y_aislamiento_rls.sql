begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(29);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000a001',
    'propietario-a@pruebas.local',
    '{"nombre":"Propietario A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000b001',
    'propietario-b@pruebas.local',
    '{"nombre":"Propietario B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000c001',
    'vecino-a@pruebas.local',
    '{"nombre":"Vecino A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000d001',
    'vecino-b@pruebas.local',
    '{"nombre":"Vecino B"}'::jsonb
  );

select is(
  (select count(*) from public.perfiles),
  4::bigint,
  'El trigger de Auth crea los cuatro perfiles de prueba'
);

insert into public.negocios (id, nombre, slug, rubro, estado)
values
  (
    '10000000-0000-0000-0000-00000000a001',
    'Negocio A',
    'negocio-a',
    'Almacén',
    'activo'
  ),
  (
    '10000000-0000-0000-0000-00000000b001',
    'Negocio B',
    'negocio-b',
    'Panadería',
    'activo'
  );

insert into public.miembros_negocio (
  id,
  negocio_id,
  usuario_id,
  rol
)
values
  (
    '20000000-0000-0000-0000-00000000a001',
    '10000000-0000-0000-0000-00000000a001',
    '00000000-0000-0000-0000-00000000a001',
    'propietario'
  ),
  (
    '20000000-0000-0000-0000-00000000b001',
    '10000000-0000-0000-0000-00000000b001',
    '00000000-0000-0000-0000-00000000b001',
    'propietario'
  );

insert into public.sucursales (
  id,
  negocio_id,
  nombre,
  direccion,
  comuna
)
values
  (
    '30000000-0000-0000-0000-00000000a001',
    '10000000-0000-0000-0000-00000000a001',
    'Sucursal A',
    'Calle A 100',
    'Santiago'
  ),
  (
    '30000000-0000-0000-0000-00000000b001',
    '10000000-0000-0000-0000-00000000b001',
    'Sucursal B',
    'Calle B 200',
    'Santiago'
  );

insert into public.cajas (id, sucursal_id, nombre, codigo)
values
  (
    '40000000-0000-0000-0000-00000000a001',
    '30000000-0000-0000-0000-00000000a001',
    'Caja A',
    'CAJA-A'
  ),
  (
    '40000000-0000-0000-0000-00000000b001',
    '30000000-0000-0000-0000-00000000b001',
    'Caja B',
    'CAJA-B'
  );

insert into public.etiquetas_nfc (
  id,
  tipo,
  token_hash,
  negocio_id,
  sucursal_id,
  caja_id,
  estado,
  instalado_en
)
values
  (
    '50000000-0000-0000-0000-00000000a001',
    'compra',
    encode(extensions.digest('token-prueba-a', 'sha256'), 'hex'),
    '10000000-0000-0000-0000-00000000a001',
    '30000000-0000-0000-0000-00000000a001',
    '40000000-0000-0000-0000-00000000a001',
    'activa',
    now()
  ),
  (
    '50000000-0000-0000-0000-00000000b001',
    'compra',
    encode(extensions.digest('token-prueba-b', 'sha256'), 'hex'),
    '10000000-0000-0000-0000-00000000b001',
    '30000000-0000-0000-0000-00000000b001',
    '40000000-0000-0000-0000-00000000b001',
    'activa',
    now()
  );

set local role anon;

select is(
  (
    select count(*)
    from public.resolver_etiqueta('token-prueba-a')
  ),
  1::bigint,
  'Una persona anónima puede resolver una etiqueta activa sin leer su hash'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c001';

select lives_ok(
  $$
    select public.crear_solicitud_compra(
      'token-prueba-a',
      'solicitud-prueba-a',
      now() + interval '10 minutes',
      10000
    )
  $$,
  'El vecino A crea una solicitud para el negocio A'
);

select lives_ok(
  $$
    select public.crear_solicitud_compra(
      'token-prueba-a',
      'solicitud-prueba-a',
      now() + interval '10 minutes',
      10000
    )
  $$,
  'Repetir la misma idempotency_key no duplica la solicitud'
);

select is(
  (
    select count(*)
    from public.solicitudes_compra
    where idempotency_key = 'solicitud-prueba-a'
  ),
  1::bigint,
  'La solicitud idempotente existe una sola vez'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000d001';

select lives_ok(
  $$
    select public.crear_solicitud_compra(
      'token-prueba-b',
      'solicitud-prueba-b',
      now() + interval '10 minutes',
      null
    )
  $$,
  'El vecino B solicita ayuda del cajero para informar el monto'
);

reset role;

do $$
begin
  perform set_config(
    'prueba.solicitud_b_id',
    (
      select id::text
      from public.solicitudes_compra
      where idempotency_key = 'solicitud-prueba-b'
    ),
    true
  );
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';

select is(
  (select count(*) from public.solicitudes_compra),
  1::bigint,
  'El propietario A solo ve solicitudes de su negocio'
);

select throws_ok(
  $$
    select public.aprobar_compra(
      (
        select id
        from public.solicitudes_compra
        where idempotency_key = 'solicitud-prueba-b'
      )
    )
  $$,
  'P0002',
  'Solicitud de compra no encontrada',
  'RLS no permite obtener el ID ajeno mediante una consulta del cliente'
);

select throws_ok(
  $$
    select public.aprobar_compra(
      current_setting('prueba.solicitud_b_id')::uuid
    )
  $$,
  '42501',
  'No tienes permisos para aprobar esta compra',
  'La RPC también rechaza una solicitud ajena aunque se conozca su ID'
);

select throws_ok(
  $$
    select public.solicitar_reingreso_monto(
      current_setting('prueba.solicitud_b_id')::uuid,
      'El monto no coincide'
    )
  $$,
  '42501',
  'No tienes permisos para solicitar la corrección',
  'Un comercio no puede pedir correcciones sobre solicitudes ajenas'
);

select lives_ok(
  $$
    select public.solicitar_reingreso_monto(
      (
        select id
        from public.solicitudes_compra
        where idempotency_key = 'solicitud-prueba-a'
      ),
      'El monto no coincide con la caja'
    )
  $$,
  'El comercio pide al vecino A que reingrese el monto'
);

select is(
  (
    select estado::text
    from public.solicitudes_compra
    where idempotency_key = 'solicitud-prueba-a'
  ),
  'esperando_monto',
  'La solicitud vuelve a esperar un monto del vecino'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c001';

select lives_ok(
  $$
    select public.informar_monto_vecino(
      (
        select id
        from public.solicitudes_compra
        where idempotency_key = 'solicitud-prueba-a'
      ),
      11000
    )
  $$,
  'El vecino A reingresa el monto solicitado'
);

select is(
  (
    select monto_informado
    from public.solicitudes_compra
    where idempotency_key = 'solicitud-prueba-a'
  ),
  11000,
  'El nuevo monto del vecino queda registrado'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';

select lives_ok(
  $$
    select public.corregir_solicitud_compra(
      (
        select id
        from public.solicitudes_compra
        where idempotency_key = 'solicitud-prueba-a'
      ),
      12000,
      'Corrección directa verificada con el vecino'
    )
  $$,
  'El cajero puede corregir directamente el monto'
);

select is(
  (
    select
      estado::text
      || ':' || monto_informado::text
      || ':' || monto_corregido::text
      || ':' || informado_por::text
    from public.solicitudes_compra
    where idempotency_key = 'solicitud-prueba-a'
  ),
  'pendiente_validacion:11000:12000:vecino',
  'La corrección conserva lo informado por el vecino y guarda otro monto'
);

select lives_ok(
  $$
    select public.aprobar_compra(
      (
        select id
        from public.solicitudes_compra
        where idempotency_key = 'solicitud-prueba-a'
      )
    )
  $$,
  'El propietario A aprueba la solicitud de su negocio'
);

select is(
  (
    select compra.monto_final
    from public.compras as compra
    join public.solicitudes_compra as solicitud
      on solicitud.id = compra.solicitud_id
    where solicitud.idempotency_key = 'solicitud-prueba-a'
  ),
  12000,
  'La compra utiliza el monto corregido sin reemplazar el informado'
);

select lives_ok(
  $$
    select public.aprobar_compra(
      (
        select id
        from public.solicitudes_compra
        where idempotency_key = 'solicitud-prueba-a'
      )
    )
  $$,
  'Repetir la aprobación devuelve la misma compra'
);

select is(
  (select count(*) from public.compras),
  1::bigint,
  'Una solicitud solo genera una compra'
);

select is(
  (
    select count(*)
    from public.vecinos_negocios
    where vecino_id = '00000000-0000-0000-0000-00000000c001'
  ),
  1::bigint,
  'La aprobación crea la relación vecino-negocio'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000b001';

select lives_ok(
  $$
    select public.informar_monto_cajero(
      (
        select id
        from public.solicitudes_compra
        where idempotency_key = 'solicitud-prueba-b'
      ),
      20000
    )
  $$,
  'El cajero B informa el monto cuando el vecino necesita ayuda'
);

select is(
  (
    select
      estado::text
      || ':' || monto_informado::text
      || ':' || coalesce(monto_corregido::text, 'sin_correccion')
      || ':' || informado_por::text
    from public.solicitudes_compra
    where idempotency_key = 'solicitud-prueba-b'
  ),
  'pendiente_validacion:20000:sin_correccion:cajero',
  'El monto asistido queda listo para aprobación'
);

select lives_ok(
  $$
    select public.aprobar_compra(
      (
        select id
        from public.solicitudes_compra
        where idempotency_key = 'solicitud-prueba-b'
      )
    )
  $$,
  'El propietario B aprueba la solicitud de su negocio'
);

select is(
  (select count(*) from public.compras),
  1::bigint,
  'El propietario B solo ve la compra de su negocio'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';

select is(
  (select count(*) from public.compras),
  1::bigint,
  'El propietario A sigue aislado de la compra del negocio B'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c001';

select is(
  (select count(*) from public.compras),
  1::bigint,
  'El vecino A solo ve su propia compra'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000d001';

select is(
  (select count(*) from public.compras),
  1::bigint,
  'El vecino B solo ve su propia compra'
);

reset role;

select is(
  (
    select count(*)
    from public.solicitudes_compra
    where estado = 'aprobada'
  ),
  2::bigint,
  'Las dos solicitudes finalizaron aprobadas'
);

select * from finish();
rollback;
