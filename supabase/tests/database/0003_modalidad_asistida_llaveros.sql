begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(41);

select has_type('public', 'modalidad_atencion', 'Existe el enum modalidad_atencion');
select has_type('public', 'estado_solicitud_llavero', 'Existe el enum estado_solicitud_llavero');
select has_type('public', 'estado_llavero_nfc', 'Existe el enum estado_llavero_nfc');
select has_column('public', 'perfiles', 'modalidad_atencion', 'perfiles incluye modalidad_atencion');
select has_table('public', 'solicitudes_llavero', 'Existe la tabla solicitudes_llavero');
select has_table('public', 'llaveros_nfc', 'Existe la tabla llaveros_nfc');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.solicitudes_llavero'::regclass),
  'solicitudes_llavero tiene RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.llaveros_nfc'::regclass),
  'llaveros_nfc tiene RLS'
);
select ok(
  to_regclass('public.solicitudes_llavero_activa_por_vecino') is not null,
  'Existe el índice único parcial de solicitudes activas'
);
select ok(
  to_regclass('public.llaveros_nfc_activo_por_vecino') is not null,
  'Existe el índice único parcial de llaveros activos'
);
select ok(
  not has_column_privilege('authenticated', 'public.llaveros_nfc', 'token_hash', 'SELECT'),
  'El frontend nunca puede leer token_hash'
);
select ok(
  not has_table_privilege('authenticated', 'public.llaveros_nfc', 'DELETE'),
  'Ningún usuario autenticado puede eliminar llaveros'
);
select ok(
  not has_table_privilege('authenticated', 'public.solicitudes_llavero', 'DELETE'),
  'Ningún usuario autenticado puede eliminar solicitudes históricas'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000e001', 'admin-regalones@pruebas.local', '{"nombre":"Admin Regalones"}'::jsonb),
  ('00000000-0000-0000-0000-00000000a001', 'propietario-a-llavero@pruebas.local', '{"nombre":"Propietario A"}'::jsonb),
  ('00000000-0000-0000-0000-00000000a002', 'cajero-a-llavero@pruebas.local', '{"nombre":"Cajero A"}'::jsonb),
  ('00000000-0000-0000-0000-00000000b001', 'propietario-b-llavero@pruebas.local', '{"nombre":"Propietario B"}'::jsonb),
  ('00000000-0000-0000-0000-00000000c001', 'vecino-a-llavero@pruebas.local', '{"nombre":"Vecino A"}'::jsonb),
  ('00000000-0000-0000-0000-00000000d001', 'vecino-b-llavero@pruebas.local', '{"nombre":"Vecino B"}'::jsonb);

select is(
  (select count(*) from public.perfiles where modalidad_atencion = 'digital'),
  6::bigint,
  'Los perfiles usan modalidad digital por defecto'
);

update public.perfiles
set rol_plataforma = 'admin_regalones'
where id = '00000000-0000-0000-0000-00000000e001';

insert into public.negocios (id, nombre, slug, rubro, estado)
values
  ('10000000-0000-0000-0000-00000000a001', 'Negocio A Llaveros', 'negocio-a-llaveros', 'Almacén', 'activo'),
  ('10000000-0000-0000-0000-00000000b001', 'Negocio B Llaveros', 'negocio-b-llaveros', 'Panadería', 'activo');

insert into public.miembros_negocio (negocio_id, usuario_id, rol)
values
  ('10000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a001', 'propietario'),
  ('10000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a002', 'cajero'),
  ('10000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b001', 'propietario');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c001';

select lives_ok(
  $$update public.perfiles set modalidad_atencion = 'asistida' where id = '00000000-0000-0000-0000-00000000c001'$$,
  'El vecino puede activar su propia modalidad asistida'
);
select lives_ok(
  $$
    insert into public.solicitudes_llavero (vecino_id, negocio_solicitud_id, observaciones)
    values ('00000000-0000-0000-0000-00000000c001', '10000000-0000-0000-0000-00000000a001', 'Solicitud inicial de prueba')
  $$,
  'El vecino asistido crea una solicitud para sí mismo'
);
select throws_ok(
  $$
    insert into public.solicitudes_llavero (vecino_id, negocio_solicitud_id)
    values ('00000000-0000-0000-0000-00000000c001', '10000000-0000-0000-0000-00000000a001')
  $$,
  '23505',
  'duplicate key value violates unique constraint "solicitudes_llavero_activa_por_vecino"',
  'El vecino no puede mantener dos solicitudes activas'
);
select throws_ok(
  $$
    insert into public.solicitudes_llavero (vecino_id, negocio_solicitud_id)
    values ('00000000-0000-0000-0000-00000000d001', '10000000-0000-0000-0000-00000000a001')
  $$,
  '42501',
  'new row violates row-level security policy for table "solicitudes_llavero"',
  'El vecino no puede solicitar un llavero para otra persona'
);
select is((select count(*) from public.solicitudes_llavero), 1::bigint, 'El vecino solo ve su propia solicitud');
select results_eq(
  $$
    with modificadas as (
      update public.solicitudes_llavero
      set estado = 'entregada', entregado_en = now()
      returning 1
    )
    select count(*) from modificadas
  $$,
  $$ values (0::bigint) $$,
  'El vecino no puede marcar su solicitud como entregada'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';
select is((select count(*) from public.solicitudes_llavero), 1::bigint, 'El propietario ve solicitudes de su negocio');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a002';
select is((select count(*) from public.solicitudes_llavero), 0::bigint, 'El cajero no accede a solicitudes de llaveros');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000b001';
select is((select count(*) from public.solicitudes_llavero), 0::bigint, 'Otro negocio no accede a solicitudes ajenas');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e001';
select is((select count(*) from public.solicitudes_llavero), 1::bigint, 'El administrador ve todas las solicitudes');
select lives_ok(
  $$
    update public.solicitudes_llavero
    set estado = 'programada_entrega', programado_para = now() + interval '1 day'
    where vecino_id = '00000000-0000-0000-0000-00000000c001'
  $$,
  'El administrador programa la entrega'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c001';
select throws_ok(
  $$
    insert into public.solicitudes_llavero (vecino_id, negocio_solicitud_id)
    values ('00000000-0000-0000-0000-00000000c001', '10000000-0000-0000-0000-00000000a001')
  $$,
  '23505',
  'duplicate key value violates unique constraint "solicitudes_llavero_activa_por_vecino"',
  'Una solicitud programada continúa siendo activa'
);

reset role;
do $$
begin
  perform set_config(
    'prueba.solicitud_llavero_a_id',
    (select id::text from public.solicitudes_llavero where vecino_id = '00000000-0000-0000-0000-00000000c001'),
    true
  );
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e001';
select lives_ok(
  $$
    insert into public.llaveros_nfc (
      id, vecino_id, solicitud_id, token_hash, codigo_publico,
      estado, asignado_en, asignado_por
    ) values (
      '60000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000c001',
      current_setting('prueba.solicitud_llavero_a_id')::uuid,
      encode(extensions.digest('llavero-prueba-a-1', 'sha256'), 'hex'),
      'LLAVERO-PRUEBA-A-001', 'activo', now(),
      '00000000-0000-0000-0000-00000000e001'
    )
  $$,
  'El administrador asigna un llavero activo'
);
select lives_ok(
  $$
    update public.solicitudes_llavero
    set estado = 'entregada', entregado_en = now()
    where id = current_setting('prueba.solicitud_llavero_a_id')::uuid
  $$,
  'El administrador registra la entrega sin borrar la solicitud'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c001';
select is((select count(codigo_publico) from public.llaveros_nfc), 1::bigint, 'El vecino consulta la información básica de su llavero');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000d001';
select is((select count(codigo_publico) from public.llaveros_nfc), 0::bigint, 'Otro vecino no ve el llavero ajeno');
select throws_ok(
  $$
    insert into public.llaveros_nfc (id, token_hash, codigo_publico)
    values (
      '60000000-0000-0000-0000-000000000099',
      encode(extensions.digest('llavero-no-autorizado', 'sha256'), 'hex'),
      'LLAVERO-NO-AUTORIZADO'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "llaveros_nfc"',
  'Un vecino no puede crear llaveros físicos'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e001';
select throws_ok(
  $$
    insert into public.llaveros_nfc (
      id, vecino_id, token_hash, codigo_publico, estado, asignado_en, asignado_por
    ) values (
      '60000000-0000-0000-0000-000000000098',
      '00000000-0000-0000-0000-00000000c001',
      encode(extensions.digest('llavero-activo-duplicado', 'sha256'), 'hex'),
      'LLAVERO-ACTIVO-DUPLICADO', 'activo', now(),
      '00000000-0000-0000-0000-00000000e001'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "llaveros_nfc_activo_por_vecino"',
  'Un vecino no puede tener dos llaveros activos'
);
select throws_ok(
  $$
    insert into public.llaveros_nfc (id, solicitud_id, token_hash, codigo_publico)
    values (
      '60000000-0000-0000-0000-000000000097',
      current_setting('prueba.solicitud_llavero_a_id')::uuid,
      encode(extensions.digest('llavero-solicitud-duplicada', 'sha256'), 'hex'),
      'LLAVERO-SOLICITUD-DUPLICADA'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "llaveros_nfc_solicitud_id_key"',
  'Una solicitud no puede asociarse a varios llaveros'
);

select throws_ok(
  $$
    insert into public.llaveros_nfc (
      id, vecino_id, solicitud_id, token_hash, codigo_publico
    ) values (
      '60000000-0000-0000-0000-000000000096',
      '00000000-0000-0000-0000-00000000d001',
      current_setting('prueba.solicitud_llavero_a_id')::uuid,
      encode(extensions.digest('llavero-contexto-invalido', 'sha256'), 'hex'),
      'LLAVERO-CONTEXTO-INVALIDO'
    )
  $$,
  '23514',
  'El llavero y la solicitud pertenecen a vecinos distintos',
  'Un llavero no puede vincularse a la solicitud de otro vecino'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c001';
select lives_ok(
  $$
    insert into public.solicitudes_llavero (vecino_id, negocio_solicitud_id, observaciones)
    values (
      '00000000-0000-0000-0000-00000000c001',
      '10000000-0000-0000-0000-00000000a001',
      'Solicitud de reemplazo'
    )
  $$,
  'Una solicitud entregada no impide solicitar un reemplazo'
);

reset role;
do $$
begin
  perform set_config(
    'prueba.solicitud_reemplazo_id',
    (
      select id::text from public.solicitudes_llavero
      where vecino_id = '00000000-0000-0000-0000-00000000c001'
        and estado = 'pendiente'
    ),
    true
  );
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e001';
select lives_ok(
  $$
    insert into public.llaveros_nfc (
      id, vecino_id, solicitud_id, token_hash, codigo_publico
    ) values (
      '60000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-00000000c001',
      current_setting('prueba.solicitud_reemplazo_id')::uuid,
      encode(extensions.digest('llavero-prueba-a-2', 'sha256'), 'hex'),
      'LLAVERO-PRUEBA-A-002'
    )
  $$,
  'El administrador prepara un llavero de reemplazo'
);
select lives_ok(
  $$
    update public.llaveros_nfc
    set estado = 'perdido', reemplazado_por_id = '60000000-0000-0000-0000-000000000002'
    where codigo_publico = 'LLAVERO-PRUEBA-A-001'
  $$,
  'El llavero anterior conserva el vínculo hacia su reemplazo'
);
select lives_ok(
  $$
    update public.llaveros_nfc
    set estado = 'activo', asignado_en = now(), asignado_por = '00000000-0000-0000-0000-00000000e001'
    where codigo_publico = 'LLAVERO-PRUEBA-A-002'
  $$,
  'El nuevo llavero puede activarse después de reemplazar el anterior'
);

reset role;
select is(
  (
    select count(*) from public.llaveros_nfc
    where vecino_id = '00000000-0000-0000-0000-00000000c001' and estado = 'activo'
  ),
  1::bigint,
  'El vecino mantiene exactamente un llavero activo'
);
select is(
  (select reemplazado_por_id from public.llaveros_nfc where id = '60000000-0000-0000-0000-000000000001'),
  '60000000-0000-0000-0000-000000000002'::uuid,
  'El llavero anterior permanece en el historial con su reemplazo'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e001';

insert into public.llaveros_nfc (id, token_hash, codigo_publico)
values (
  '60000000-0000-0000-0000-000000000003',
  encode(extensions.digest('llavero-prueba-autorreemplazo', 'sha256'), 'hex'),
  'LLAVERO-PRUEBA-AUTORREEMPLAZO'
);

select throws_ok(
  $$
    update public.llaveros_nfc
    set estado = 'reemplazado', reemplazado_por_id = '60000000-0000-0000-0000-000000000003'
    where codigo_publico = 'LLAVERO-PRUEBA-AUTORREEMPLAZO'
  $$,
  '23514',
  'new row for relation "llaveros_nfc" violates check constraint "llaveros_nfc_reemplazo_distinto"',
  'Un llavero no puede reemplazarse por sí mismo'
);

reset role;
select * from finish();
rollback;
