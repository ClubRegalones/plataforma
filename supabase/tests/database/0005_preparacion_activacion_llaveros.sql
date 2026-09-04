begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(54);

select ok(
  to_regtype('public.metodo_verificacion_llavero') is not null,
  'Existe el tipo de método de verificación'
);
select ok(
  to_regprocedure('public.preparar_llavero(uuid,text,text,text)') is not null,
  'Existe preparar_llavero'
);
select ok(
  to_regprocedure('public.registrar_entrega_llavero(uuid)') is not null,
  'Existe registrar_entrega_llavero'
);
select ok(
  to_regprocedure('public.consultar_llavero_activacion(text,uuid)') is not null,
  'Existe consultar_llavero_activacion'
);
select ok(
  to_regprocedure(
    'public.activar_llavero_primer_uso(text,uuid,metodo_verificacion_llavero,text,boolean)'
  ) is not null,
  'Existe activar_llavero_primer_uso'
);
select ok(
  to_regprocedure('public.listar_gestion_llaveros_detalle()') is not null,
  'Existe listar_gestion_llaveros_detalle'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.preparar_llavero(uuid,text,text,text)',
    'EXECUTE'
  ),
  'Los usuarios autenticados pueden invocar preparar_llavero'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.preparar_llavero(uuid,text,text,text)',
    'EXECUTE'
  ),
  'Los usuarios anónimos no pueden invocar preparar_llavero'
);
select ok(
  position(
    'token_hash' in pg_get_function_result(
      'public.listar_gestion_llaveros_detalle()'::regprocedure
    )
  ) = 0,
  'El listado administrativo detallado no devuelve token_hash'
);
select ok(
  position(
    'pin_activacion_hash' in pg_get_function_result(
      'public.consultar_llavero_activacion(text,uuid)'::regprocedure
    )
  ) = 0,
  'La consulta de activación no devuelve el hash del PIN'
);
select ok(
  position(
    'pin_activacion_hash' in pg_get_function_result(
      'public.activar_llavero_primer_uso(text,uuid,metodo_verificacion_llavero,text,boolean)'::regprocedure
    )
  ) = 0,
  'La activación no devuelve el hash del PIN'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000e001',
    'admin-activacion@pruebas.local',
    '{"nombre":"Admin Activación"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000e002',
    'vecino-activacion@pruebas.local',
    '{"nombre":"Vecino Activación"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000e003',
    'cajero-activacion@pruebas.local',
    '{"nombre":"Cajero Activación"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000e004',
    'vecino-pin@pruebas.local',
    '{"nombre":"Vecino PIN"}'::jsonb
  );

update public.perfiles
set rol_plataforma = 'admin_regalones'
where id = '00000000-0000-0000-0000-00000000e001';

update public.perfiles
set modalidad_atencion = 'asistida'
where id in (
  '00000000-0000-0000-0000-00000000e002',
  '00000000-0000-0000-0000-00000000e004'
);

insert into public.negocios (id, nombre, slug, rubro, estado)
values (
  '21000000-0000-0000-0000-00000000e001',
  'Negocio Activación',
  'negocio-activacion',
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
values (
  '22000000-0000-0000-0000-00000000e001',
  '21000000-0000-0000-0000-00000000e001',
  'Sucursal Activación',
  'Calle de prueba 123',
  'Santiago',
  'activa'
);

insert into public.cajas (id, sucursal_id, nombre, codigo, estado)
values (
  '23000000-0000-0000-0000-00000000e001',
  '22000000-0000-0000-0000-00000000e001',
  'Caja Activación',
  'CAJA-ACT-01',
  'activa'
);

insert into public.miembros_negocio (
  negocio_id,
  usuario_id,
  rol,
  estado
)
values (
  '21000000-0000-0000-0000-00000000e001',
  '00000000-0000-0000-0000-00000000e003',
  'cajero',
  'activo'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e002';

select lives_ok(
  $$
    insert into public.solicitudes_llavero (
      vecino_id,
      negocio_solicitud_id,
      observaciones
    ) values (
      '00000000-0000-0000-0000-00000000e002',
      '21000000-0000-0000-0000-00000000e001',
      'Activación con cédula'
    )
  $$,
  'El vecino solicita el llavero que se activará con cédula'
);

reset role;
do $$
begin
  perform set_config(
    'prueba.activacion_cedula_solicitud_id',
    (
      select id::text
      from public.solicitudes_llavero
      where observaciones = 'Activación con cédula'
    ),
    true
  );
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e002';

select throws_ok(
  $$
    select *
    from public.preparar_llavero(
      current_setting('prueba.activacion_cedula_solicitud_id')::uuid,
      'token-activacion-cedula-001',
      'CR-CEDULA-001',
      '2468'
    )
  $$,
  '42501',
  'Solo un administrador de Club Regalones puede preparar llaveros',
  'El vecino no puede preparar su propio llavero'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e001';

select lives_ok(
  $$
    select *
    from public.preparar_llavero(
      current_setting('prueba.activacion_cedula_solicitud_id')::uuid,
      'token-activacion-cedula-001',
      'cr-cedula-001',
      '2468'
    )
  $$,
  'El administrador prepara el llavero sin activarlo'
);

reset role;

select is(
  (
    select estado::text
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  'sin_asignar',
  'El llavero preparado permanece inactivo'
);
select is(
  (
    select estado::text
    from public.solicitudes_llavero
    where id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  'pendiente',
  'Preparar el llavero no registra una entrega inexistente'
);
select isnt(
  (
    select token_hash
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  'token-activacion-cedula-001',
  'El token preparado nunca se almacena en texto plano'
);
select is(
  (
    select token_hash
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  encode(
    extensions.digest(
      convert_to('token-activacion-cedula-001', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'El token preparado usa el hash SHA-256 esperado'
);
select isnt(
  (
    select pin_activacion_hash
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  '2468',
  'El PIN nunca se almacena en texto plano'
);
select ok(
  (
    select extensions.crypt('2468', pin_activacion_hash) = pin_activacion_hash
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  'El PIN correcto coincide con su hash seguro'
);
select is(
  (
    select preparado_por
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  '00000000-0000-0000-0000-00000000e001'::uuid,
  'La preparación registra al administrador responsable'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e001';

select lives_ok(
  $$
    select *
    from public.preparar_llavero(
      current_setting('prueba.activacion_cedula_solicitud_id')::uuid,
      'token-distinto-que-no-se-usara',
      'CR-DISTINTO',
      null
    )
  $$,
  'Preparar nuevamente la misma solicitud es idempotente'
);

reset role;
select is(
  (
    select count(*)
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  1::bigint,
  'La preparación idempotente no crea duplicados'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e001';

select lives_ok(
  $$
    select *
    from public.programar_entrega_llavero(
      current_setting('prueba.activacion_cedula_solicitud_id')::uuid,
      now() + interval '1 day',
      'Entrega de llavero inactivo'
    )
  $$,
  'El administrador programa la entrega del llavero preparado'
);
select lives_ok(
  $$
    select *
    from public.registrar_entrega_llavero(
      current_setting('prueba.activacion_cedula_solicitud_id')::uuid
    )
  $$,
  'El administrador registra la entrega física'
);

reset role;
select is(
  (
    select estado::text
    from public.solicitudes_llavero
    where id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  'entregada',
  'La solicitud queda entregada'
);
select is(
  (
    select estado::text
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  'sin_asignar',
  'Registrar la entrega no activa anticipadamente el llavero'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e003';

select is(
  (
    select count(*)
    from public.consultar_llavero_activacion(
      'token-activacion-cedula-001',
      '23000000-0000-0000-0000-00000000e001'
    )
  ),
  1::bigint,
  'El cajero autorizado puede leer el contexto limitado del llavero'
);
select is(
  (
    select nombre_vecino
    from public.consultar_llavero_activacion(
      'token-activacion-cedula-001',
      '23000000-0000-0000-0000-00000000e001'
    )
  ),
  'Vecino Activación',
  'El terminal muestra el nombre necesario para revisar la cédula'
);
select ok(
  (
    select puede_activar
    from public.consultar_llavero_activacion(
      'token-activacion-cedula-001',
      '23000000-0000-0000-0000-00000000e001'
    )
  ),
  'El terminal informa que el llavero entregado puede activarse'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e004';

select throws_ok(
  $$
    select *
    from public.consultar_llavero_activacion(
      'token-activacion-cedula-001',
      '23000000-0000-0000-0000-00000000e001'
    )
  $$,
  '42501',
  'No tienes acceso a la caja indicada',
  'Un usuario ajeno al negocio no consulta llaveros en esa caja'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e003';

select is(
  (
    select activado
    from public.activar_llavero_primer_uso(
      'token-activacion-cedula-001',
      '23000000-0000-0000-0000-00000000e001',
      'cedula',
      null,
      false
    )
  ),
  false,
  'No se activa con cédula si el cajero no confirma la revisión'
);

reset role;
select is(
  (
    select estado::text
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  'sin_asignar',
  'La verificación incompleta conserva el llavero inactivo'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e003';

select is(
  (
    select activado
    from public.activar_llavero_primer_uso(
      'token-activacion-cedula-001',
      '23000000-0000-0000-0000-00000000e001',
      'cedula',
      null,
      true
    )
  ),
  true,
  'La revisión presencial de cédula activa el llavero'
);

reset role;
select is(
  (
    select estado::text
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  'activo',
  'El llavero queda activo después de verificar la identidad'
);
select is(
  (
    select metodo_verificacion_activacion::text
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  'cedula',
  'La auditoría registra la verificación por cédula'
);
select is(
  (
    select activado_por
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  '00000000-0000-0000-0000-00000000e003'::uuid,
  'La auditoría registra al cajero que activó el llavero'
);
select is(
  (
    select caja_activacion_id
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  '23000000-0000-0000-0000-00000000e001'::uuid,
  'La auditoría registra la caja de activación'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e003';

select is(
  (
    select activado
    from public.activar_llavero_primer_uso(
      'token-activacion-cedula-001',
      '23000000-0000-0000-0000-00000000e001',
      'cedula',
      null,
      true
    )
  ),
  true,
  'Repetir la activación es idempotente'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e001';

select is(
  (
    select correo_vecino
    from public.listar_gestion_llaveros_detalle()
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  'vecino-activacion@pruebas.local',
  'El administrador identifica la cuenta por correo'
);
select is(
  (
    select vecino_id
    from public.listar_gestion_llaveros_detalle()
    where solicitud_id = current_setting('prueba.activacion_cedula_solicitud_id')::uuid
  ),
  '00000000-0000-0000-0000-00000000e002'::uuid,
  'El administrador identifica la cuenta por UUID'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e002';

select lives_ok(
  $$
    insert into public.solicitudes_llavero (
      vecino_id,
      negocio_solicitud_id,
      observaciones
    ) values (
      '00000000-0000-0000-0000-00000000e002',
      '21000000-0000-0000-0000-00000000e001',
      'Solicitud posterior sin llavero preparado'
    )
  $$,
  'Un vecino con un llavero anterior puede crear una nueva solicitud de reposición'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e001';

select is(
  (
    select llavero_id
    from public.listar_gestion_llaveros_detalle()
    where observaciones = 'Solicitud posterior sin llavero preparado'
  ),
  null::uuid,
  'Una solicitud nueva no hereda el llavero activo de una solicitud anterior'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.llaveros_nfc',
    'pin_activacion_hash',
    'SELECT'
  ),
  'El hash del PIN no queda disponible para el frontend'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e004';

select lives_ok(
  $$
    insert into public.solicitudes_llavero (
      vecino_id,
      negocio_solicitud_id,
      observaciones
    ) values (
      '00000000-0000-0000-0000-00000000e004',
      '21000000-0000-0000-0000-00000000e001',
      'Activación con PIN'
    )
  $$,
  'El segundo vecino solicita un llavero para activarlo con PIN'
);

reset role;
do $$
begin
  perform set_config(
    'prueba.activacion_pin_solicitud_id',
    (
      select id::text
      from public.solicitudes_llavero
      where observaciones = 'Activación con PIN'
    ),
    true
  );
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e001';

select throws_ok(
  $$
    select *
    from public.preparar_llavero(
      current_setting('prueba.activacion_pin_solicitud_id')::uuid,
      'token-activacion-pin-002',
      'CR-PIN-002',
      '12ab'
    )
  $$,
  '22023',
  'El PIN debe contener entre 4 y 6 dígitos',
  'La preparación rechaza un PIN con formato inseguro'
);
select lives_ok(
  $$
    select *
    from public.preparar_llavero(
      current_setting('prueba.activacion_pin_solicitud_id')::uuid,
      'token-activacion-pin-002',
      'CR-PIN-002',
      '1357'
    )
  $$,
  'El administrador prepara el llavero con un PIN válido'
);
select lives_ok(
  $$
    select *
    from public.programar_entrega_llavero(
      current_setting('prueba.activacion_pin_solicitud_id')::uuid,
      now() + interval '2 days',
      'Entrega para activar con PIN'
    )
  $$,
  'El administrador programa la entrega del segundo llavero'
);
select lives_ok(
  $$
    select *
    from public.registrar_entrega_llavero(
      current_setting('prueba.activacion_pin_solicitud_id')::uuid
    )
  $$,
  'El administrador registra la segunda entrega'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e003';

select is(
  (
    select activado
    from public.activar_llavero_primer_uso(
      'token-activacion-pin-002',
      '23000000-0000-0000-0000-00000000e001',
      'pin',
      '9999',
      false
    )
  ),
  false,
  'Un PIN incorrecto no activa el llavero'
);

reset role;
select is(
  (
    select intentos_pin_fallidos
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_pin_solicitud_id')::uuid
  ),
  1::smallint,
  'El intento de PIN fallido queda registrado'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e003';

select is(
  (
    select activado
    from public.activar_llavero_primer_uso(
      'token-activacion-pin-002',
      '23000000-0000-0000-0000-00000000e001',
      'pin',
      '1357',
      false
    )
  ),
  true,
  'El PIN correcto activa el llavero'
);

reset role;
select is(
  (
    select metodo_verificacion_activacion::text
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_pin_solicitud_id')::uuid
  ),
  'pin',
  'La auditoría registra la activación mediante PIN'
);
select is(
  (
    select intentos_pin_fallidos
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.activacion_pin_solicitud_id')::uuid
  ),
  0::smallint,
  'Una activación correcta reinicia los intentos fallidos'
);

select * from finish();
rollback;
