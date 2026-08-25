begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(44);

select has_column(
  'public',
  'solicitudes_compra',
  'llavero_id',
  'Las solicitudes de compra registran el llavero utilizado'
);
select ok(
  exists (
    select 1
    from pg_constraint as restriccion
    join pg_attribute as atributo
      on atributo.attrelid = restriccion.conrelid
      and atributo.attnum = any (restriccion.conkey)
    where restriccion.conrelid = 'public.solicitudes_compra'::regclass
      and restriccion.contype = 'f'
      and atributo.attname = 'llavero_id'
      and restriccion.confrelid = 'public.llaveros_nfc'::regclass
  ),
  'llavero_id referencia a llaveros_nfc'
);
select ok(
  to_regclass('public.solicitudes_compra_llavero_creado_idx') is not null,
  'Existe el índice de historial de compras por llavero'
);
select ok(
  to_regclass('public.solicitudes_compra_llavero_abierta_idx') is not null,
  'Existe el índice que evita compras asistidas simultáneas'
);
select has_trigger(
  'public',
  'solicitudes_compra',
  'solicitudes_compra_validar_llavero',
  'Existe el trigger de integridad entre solicitud y llavero'
);
select ok(
  to_regprocedure(
    'public.crear_solicitud_compra_asistida(text,uuid,integer,text)'
  ) is not null,
  'Existe crear_solicitud_compra_asistida'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.crear_solicitud_compra_asistida(text,uuid,integer,text)',
    'EXECUTE'
  ),
  'Los usuarios autenticados pueden invocar la compra asistida'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.crear_solicitud_compra_asistida(text,uuid,integer,text)',
    'EXECUTE'
  ),
  'Los usuarios anónimos no pueden invocar la compra asistida'
);
select ok(
  position(
    'token_hash' in pg_get_function_result(
      'public.crear_solicitud_compra_asistida(text,uuid,integer,text)'::regprocedure
    )
  ) = 0,
  'La función no devuelve el hash secreto del llavero'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000f001',
    'cajero-a-asistido@pruebas.local',
    '{"nombre":"Cajero A Asistido"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f002',
    'cajero-b-asistido@pruebas.local',
    '{"nombre":"Cajero B Asistido"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f003',
    'vecino-asistido@pruebas.local',
    '{"nombre":"Vecino Asistido"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f004',
    'usuario-ajeno-asistido@pruebas.local',
    '{"nombre":"Usuario Ajeno"}'::jsonb
  );

select is(
  (
    select count(*)
    from public.perfiles
    where id::text like '00000000-0000-0000-0000-00000000f00%'
  ),
  4::bigint,
  'Auth creó los perfiles del flujo asistido'
);

insert into public.negocios (id, nombre, slug, rubro, estado)
values
  (
    '31000000-0000-0000-0000-00000000f001',
    'Negocio A Asistido',
    'negocio-a-asistido',
    'Almacén',
    'activo'
  ),
  (
    '31000000-0000-0000-0000-00000000f002',
    'Negocio B Asistido',
    'negocio-b-asistido',
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
    '32000000-0000-0000-0000-00000000f001',
    '31000000-0000-0000-0000-00000000f001',
    'Sucursal A Asistida',
    'Calle A 100',
    'Santiago',
    'activa'
  ),
  (
    '32000000-0000-0000-0000-00000000f002',
    '31000000-0000-0000-0000-00000000f002',
    'Sucursal B Asistida',
    'Calle B 200',
    'Santiago',
    'activa'
  );

insert into public.cajas (id, sucursal_id, nombre, codigo, estado)
values
  (
    '33000000-0000-0000-0000-00000000f001',
    '32000000-0000-0000-0000-00000000f001',
    'Caja A Asistida',
    'CAJA-AS-A',
    'activa'
  ),
  (
    '33000000-0000-0000-0000-00000000f002',
    '32000000-0000-0000-0000-00000000f002',
    'Caja B Asistida',
    'CAJA-AS-B',
    'activa'
  );

insert into public.miembros_negocio (
  negocio_id,
  usuario_id,
  rol,
  estado
)
values
  (
    '31000000-0000-0000-0000-00000000f001',
    '00000000-0000-0000-0000-00000000f001',
    'cajero',
    'activo'
  ),
  (
    '31000000-0000-0000-0000-00000000f002',
    '00000000-0000-0000-0000-00000000f002',
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
values
  (
    '34000000-0000-0000-0000-00000000f001',
    '00000000-0000-0000-0000-00000000f003',
    encode(extensions.digest(convert_to('llavero-asistido-activo-001', 'UTF8'), 'sha256'), 'hex'),
    'CR-ASISTIDO-001',
    'activo',
    now(),
    '00000000-0000-0000-0000-00000000f001',
    now(),
    '00000000-0000-0000-0000-00000000f001',
    now(),
    '00000000-0000-0000-0000-00000000f001',
    '33000000-0000-0000-0000-00000000f001',
    'cedula'
  ),
  (
    '34000000-0000-0000-0000-00000000f002',
    '00000000-0000-0000-0000-00000000f004',
    encode(extensions.digest(convert_to('llavero-asistido-inactivo-002', 'UTF8'), 'sha256'), 'hex'),
    'CR-ASISTIDO-002',
    'sin_asignar',
    null,
    null,
    now(),
    '00000000-0000-0000-0000-00000000f001',
    null,
    null,
    null,
    null
  );

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f004';

select throws_ok(
  $$
    select public.crear_solicitud_compra_asistida(
      'llavero-asistido-activo-001',
      '33000000-0000-0000-0000-00000000f001',
      12500,
      'asistida-ajeno-001'
    )
  $$,
  '42501',
  'No tienes acceso a la caja indicada',
  'Un usuario ajeno no inicia compras en una caja'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f001';

select throws_ok(
  $$
    select public.crear_solicitud_compra_asistida(
      'llavero-asistido-activo-001',
      '33000000-0000-0000-0000-00000000f001',
      0,
      'asistida-monto-invalido-001'
    )
  $$,
  '22003',
  'El monto debe ser un número entero mayor que cero',
  'La compra asistida rechaza montos inválidos'
);

select throws_ok(
  $$
    select public.crear_solicitud_compra_asistida(
      'llavero-asistido-inactivo-002',
      '33000000-0000-0000-0000-00000000f001',
      12500,
      'asistida-inactivo-001'
    )
  $$,
  'P0002',
  'El llavero no existe, no está activo o su cuenta está inactiva',
  'Un llavero inactivo no puede iniciar compras'
);

select lives_ok(
  $$
    select public.crear_solicitud_compra_asistida(
      'llavero-asistido-activo-001',
      '33000000-0000-0000-0000-00000000f001',
      12500,
      'asistida-negocio-a-001'
    )
  $$,
  'El cajero crea una compra asistida con un llavero activo'
);

reset role;

do $$
begin
  perform set_config(
    'prueba.compra_asistida_a_id',
    (
      select id::text
      from public.solicitudes_compra
      where idempotency_key = 'asistida-negocio-a-001'
    ),
    true
  );
end;
$$;

select is(
  (select count(*) from public.solicitudes_compra where idempotency_key = 'asistida-negocio-a-001'),
  1::bigint,
  'La compra asistida crea una sola solicitud'
);
select is(
  (select vecino_id from public.solicitudes_compra where idempotency_key = 'asistida-negocio-a-001'),
  '00000000-0000-0000-0000-00000000f003'::uuid,
  'La solicitud pertenece al vecino identificado por el llavero'
);
select is(
  (select llavero_id from public.solicitudes_compra where idempotency_key = 'asistida-negocio-a-001'),
  '34000000-0000-0000-0000-00000000f001'::uuid,
  'La solicitud conserva la referencia histórica al llavero'
);
select is(
  (select caja_id from public.solicitudes_compra where idempotency_key = 'asistida-negocio-a-001'),
  '33000000-0000-0000-0000-00000000f001'::uuid,
  'La solicitud queda asociada a la caja utilizada'
);
select is(
  (select monto_informado from public.solicitudes_compra where idempotency_key = 'asistida-negocio-a-001'),
  12500,
  'La solicitud conserva el monto informado por el cajero'
);
select is(
  (select informado_por::text from public.solicitudes_compra where idempotency_key = 'asistida-negocio-a-001'),
  'cajero',
  'La auditoría identifica al cajero como informante'
);
select is(
  (select estado::text from public.solicitudes_compra where idempotency_key = 'asistida-negocio-a-001'),
  'pendiente_validacion',
  'La solicitud exige aprobación explícita antes de confirmar la compra'
);
select ok(
  (
    select expira_en > now() and expira_en <= now() + interval '16 minutes'
    from public.solicitudes_compra
    where idempotency_key = 'asistida-negocio-a-001'
  ),
  'La solicitud asistida tiene una vigencia breve'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f001';

select lives_ok(
  $$
    select public.crear_solicitud_compra_asistida(
      'llavero-asistido-activo-001',
      '33000000-0000-0000-0000-00000000f001',
      12500,
      'asistida-negocio-a-001'
    )
  $$,
  'Repetir la misma petición es idempotente'
);

reset role;
select is(
  (select count(*) from public.solicitudes_compra where idempotency_key = 'asistida-negocio-a-001'),
  1::bigint,
  'La repetición idempotente no duplica solicitudes'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f001';

select throws_ok(
  $$
    select public.crear_solicitud_compra_asistida(
      'llavero-asistido-activo-001',
      '33000000-0000-0000-0000-00000000f001',
      13000,
      'asistida-negocio-a-001'
    )
  $$,
  '23505',
  'idempotency_key ya está en uso',
  'Una clave idempotente no puede reutilizarse con otro monto'
);

select throws_ok(
  $$
    select public.crear_solicitud_compra_asistida(
      'llavero-asistido-activo-001',
      '33000000-0000-0000-0000-00000000f001',
      12500,
      'asistida-negocio-a-002'
    )
  $$,
  '23505',
  'Ya existe una compra asistida pendiente para este llavero',
  'Un llavero no crea dos compras pendientes simultáneas'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f002';

select throws_ok(
  $$
    select public.aprobar_compra(
      current_setting('prueba.compra_asistida_a_id')::uuid
    )
  $$,
  '42501',
  'No tienes permisos para aprobar esta compra',
  'Un cajero de otro negocio no aprueba la compra asistida'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f001';

select lives_ok(
  $$
    select public.aprobar_compra(
      current_setting('prueba.compra_asistida_a_id')::uuid,
      null,
      'integracion_pos'
    )
  $$,
  'El cajero del negocio aprueba la compra asistida'
);

reset role;

select is(
  (
    select count(*)
    from public.compras as compra
    join public.solicitudes_compra as solicitud
      on solicitud.id = compra.solicitud_id
    where solicitud.idempotency_key = 'asistida-negocio-a-001'
  ),
  1::bigint,
  'La aprobación crea una sola compra'
);
select is(
  (
    select compra.origen::text
    from public.compras as compra
    join public.solicitudes_compra as solicitud
      on solicitud.id = compra.solicitud_id
    where solicitud.idempotency_key = 'asistida-negocio-a-001'
  ),
  'asistido',
  'La compra registra el origen asistido aunque el cliente intente cambiarlo'
);
select is(
  (
    select compra.monto_final
    from public.compras as compra
    join public.solicitudes_compra as solicitud
      on solicitud.id = compra.solicitud_id
    where solicitud.idempotency_key = 'asistida-negocio-a-001'
  ),
  12500,
  'La compra confirmada conserva el monto final'
);
select is(
  (
    select count(*)
    from public.vecinos_negocios
    where vecino_id = '00000000-0000-0000-0000-00000000f003'
      and negocio_id = '31000000-0000-0000-0000-00000000f001'
  ),
  1::bigint,
  'La compra relaciona al vecino con el comercio A'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f001';

select lives_ok(
  $$
    select public.aprobar_compra(
      current_setting('prueba.compra_asistida_a_id')::uuid
    )
  $$,
  'Repetir la aprobación es idempotente'
);

reset role;
select is(
  (
    select count(*)
    from public.compras as compra
    join public.solicitudes_compra as solicitud
      on solicitud.id = compra.solicitud_id
    where solicitud.idempotency_key = 'asistida-negocio-a-001'
  ),
  1::bigint,
  'La aprobación repetida no duplica compras'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f002';

select lives_ok(
  $$
    select public.crear_solicitud_compra_asistida(
      'llavero-asistido-activo-001',
      '33000000-0000-0000-0000-00000000f002',
      5900,
      'asistida-negocio-b-001'
    )
  $$,
  'El mismo llavero activo puede comprar después en otro comercio'
);
select is(
  (select count(*) from public.solicitudes_compra where idempotency_key = 'asistida-negocio-b-001'),
  1::bigint,
  'El comercio B ve su solicitud asistida'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f001';
select is(
  (select count(*) from public.solicitudes_compra where idempotency_key = 'asistida-negocio-b-001'),
  0::bigint,
  'El comercio A no ve la solicitud pendiente del comercio B'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f002';
select is(
  (select count(*) from public.solicitudes_compra where idempotency_key = 'asistida-negocio-b-001'),
  1::bigint,
  'El aislamiento RLS conserva la solicitud para el comercio B'
);

reset role;

select throws_ok(
  $$
    insert into public.solicitudes_compra (
      vecino_id,
      caja_id,
      llavero_id,
      monto_informado,
      informado_por,
      estado,
      expira_en,
      idempotency_key
    ) values (
      '00000000-0000-0000-0000-00000000f004',
      '33000000-0000-0000-0000-00000000f002',
      '34000000-0000-0000-0000-00000000f001',
      1000,
      'cajero',
      'pendiente_validacion',
      now() + interval '15 minutes',
      'asistida-contexto-invalido-001'
    )
  $$,
  '23514',
  'El llavero no pertenece al vecino de la compra',
  'El trigger impide asociar el llavero a otro vecino'
);

update public.llaveros_nfc
set estado = 'bloqueado', bloqueado_en = now()
where id = '34000000-0000-0000-0000-00000000f001';

select is(
  (select estado::text from public.llaveros_nfc where id = '34000000-0000-0000-0000-00000000f001'),
  'bloqueado',
  'El llavero queda bloqueado antes de aprobar otra compra'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f002';

select throws_ok(
  format(
    'select public.aprobar_compra(%L::uuid)',
    (
      select id
      from public.solicitudes_compra
      where idempotency_key = 'asistida-negocio-b-001'
    )
  ),
  '23514',
  'El llavero de la compra asistida ya no está activo',
  'Una compra pendiente no se aprueba si el llavero fue bloqueado'
);

select lives_ok(
  format(
    'select public.rechazar_solicitud_compra(%L::uuid, %L)',
    (
      select id
      from public.solicitudes_compra
      where idempotency_key = 'asistida-negocio-b-001'
    ),
    'Prueba de bloqueo posterior'
  ),
  'El comercio B cierra su solicitud pendiente'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f002';

select throws_ok(
  $$
    select public.crear_solicitud_compra_asistida(
      'llavero-asistido-activo-001',
      '33000000-0000-0000-0000-00000000f002',
      2000,
      'asistida-bloqueado-001'
    )
  $$,
  'P0002',
  'El llavero no existe, no está activo o su cuenta está inactiva',
  'Un llavero bloqueado no puede iniciar nuevas compras'
);

select is(
  (select count(*) from public.solicitudes_compra where idempotency_key = 'asistida-bloqueado-001'),
  0::bigint,
  'El intento con llavero bloqueado no deja una solicitud'
);

select * from finish();
rollback;
