begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table('public', 'tickets_soporte', 'Existe la bandeja de asistencia');
select has_table(
  'public',
  'mensajes_ticket_soporte',
  'Existe la conversación de asistencia'
);
select ok(
  to_regprocedure(
    'public.crear_ticket_soporte(uuid,public.categoria_ticket_soporte,text,text,uuid)'
  ) is not null,
  'Existe la apertura atómica de solicitudes'
);
select ok(
  to_regprocedure('public.responder_ticket_soporte(uuid,text)') is not null,
  'Existe la respuesta controlada de solicitudes'
);
select ok(
  to_regprocedure(
    'public.cambiar_estado_ticket_soporte(uuid,public.estado_ticket_soporte)'
  ) is not null,
  'Existe el cambio de estado controlado'
);
select ok(
  not has_table_privilege('authenticated', 'public.tickets_soporte', 'INSERT'),
  'El frontend no inserta tickets directamente'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.mensajes_ticket_soporte',
    'INSERT'
  ),
  'El frontend no inserta mensajes directamente'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000fb01',
    'propietario-soporte@pruebas.local',
    '{"nombre":"Propietario Soporte"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fb02',
    'cajero-soporte@pruebas.local',
    '{"nombre":"Cajero Soporte"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fb03',
    'otro-cajero-soporte@pruebas.local',
    '{"nombre":"Otro Cajero Soporte"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fb04',
    'otro-negocio-soporte@pruebas.local',
    '{"nombre":"Otro Negocio Soporte"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fb05',
    'admin-soporte@pruebas.local',
    '{"nombre":"Admin Soporte"}'::jsonb
  );

update public.perfiles
set rol_plataforma = 'admin_regalones'
where id = '00000000-0000-0000-0000-00000000fb05';

insert into public.negocios (id, nombre, slug, rubro, estado)
values
  (
    '97000000-0000-4000-8000-000000000001',
    'Comercio Soporte',
    'comercio-soporte',
    'Almacén',
    'activo'
  ),
  (
    '97000000-0000-4000-8000-000000000002',
    'Otro Comercio Soporte',
    'otro-comercio-soporte',
    'Panadería',
    'activo'
  );

insert into public.miembros_negocio (negocio_id, usuario_id, rol, estado)
values
  (
    '97000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000fb01',
    'propietario',
    'activo'
  ),
  (
    '97000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000fb02',
    'cajero',
    'activo'
  ),
  (
    '97000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000fb03',
    'cajero',
    'activo'
  ),
  (
    '97000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-00000000fb04',
    'propietario',
    'activo'
  );

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fb02';

select lives_ok(
  $$
    select public.crear_ticket_soporte(
      '97000000-0000-4000-8000-000000000001',
      'compras',
      'Problema en la terminal',
      'La terminal no permite confirmar una compra.',
      null
    )
  $$,
  'Un cajero puede solicitar asistencia operativa'
);
select is(
  (select count(*) from public.tickets_soporte),
  1::bigint,
  'El creador puede leer su solicitud'
);
select is(
  (select count(*) from public.mensajes_ticket_soporte),
  1::bigint,
  'La apertura crea el primer mensaje'
);
select is(
  (select origen::text from public.mensajes_ticket_soporte limit 1),
  'comercio',
  'El primer mensaje queda identificado como comercio'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fb03';

select is(
  (select count(*) from public.tickets_soporte),
  0::bigint,
  'Otro cajero no ve conversaciones ajenas'
);
select is(
  (select count(*) from public.mensajes_ticket_soporte),
  0::bigint,
  'Otro cajero no ve mensajes ajenos'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fb01';

select is(
  (select count(*) from public.tickets_soporte),
  1::bigint,
  'El propietario ve las solicitudes de su negocio'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fb04';

select is(
  (select count(*) from public.tickets_soporte),
  0::bigint,
  'Otro negocio no ve la solicitud'
);
select throws_ok(
  $$
    select public.responder_ticket_soporte(
      (
        select id
        from public.tickets_soporte
        where negocio_id = '97000000-0000-4000-8000-000000000001'
      ),
      'Intento de respuesta desde otro negocio.'
    )
  $$,
  'P0002',
  'Solicitud de asistencia no encontrada',
  'RLS impide que otro negocio obtenga el identificador del ticket'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fb05';

select is(
  (select count(*) from public.tickets_soporte),
  1::bigint,
  'Regalones recibe las nuevas solicitudes'
);
select lives_ok(
  $$
    select public.responder_ticket_soporte(
      (select id from public.tickets_soporte limit 1),
      'Revisamos el problema y necesitamos una nueva prueba.'
    )
  $$,
  'Regalones puede responder al comercio'
);
select is(
  (select estado::text from public.tickets_soporte limit 1),
  'esperando_comercio',
  'La respuesta administrativa queda esperando al comercio'
);
select is(
  (
    select origen::text
    from public.mensajes_ticket_soporte
    order by creado_en desc
    limit 1
  ),
  'regalones',
  'La respuesta se identifica como Regalones'
);
select lives_ok(
  $$
    select public.cambiar_estado_ticket_soporte(
      (select id from public.tickets_soporte limit 1),
      'en_revision'
    )
  $$,
  'Regalones puede gestionar el estado de la solicitud'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fb02';

select is(
  (select count(*) from public.mensajes_ticket_soporte),
  2::bigint,
  'El creador recibe la respuesta de Regalones'
);
select throws_ok(
  $$
    select public.cambiar_estado_ticket_soporte(
      (select id from public.tickets_soporte limit 1),
      'en_revision'
    )
  $$,
  '42501',
  'El comercio solo puede reabrir o cerrar su solicitud',
  'El comercio no suplanta los estados internos de Regalones'
);
select lives_ok(
  $$
    select public.cambiar_estado_ticket_soporte(
      (select id from public.tickets_soporte limit 1),
      'cerrado'
    )
  $$,
  'El creador puede cerrar su solicitud'
);
select ok(
  (select cerrado_en is not null from public.tickets_soporte limit 1),
  'El cierre conserva su fecha'
);

reset role;

select * from finish();
rollback;
