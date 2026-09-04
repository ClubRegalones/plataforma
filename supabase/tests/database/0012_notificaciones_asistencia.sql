begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_column(
  'public',
  'tickets_soporte',
  'leido_comercio_en',
  'El ticket conserva la lectura del comercio'
);
select has_column(
  'public',
  'tickets_soporte',
  'leido_regalones_en',
  'El ticket conserva la lectura de Regalones'
);
select ok(
  to_regprocedure('public.marcar_ticket_soporte_leido(uuid)') is not null,
  'Existe la confirmación segura de lectura'
);
select ok(
  to_regprocedure('public.contar_tickets_soporte_no_leidos()') is not null,
  'Existe el contador seguro de mensajes pendientes'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.marcar_ticket_soporte_leido(uuid)',
    'EXECUTE'
  ),
  'Los usuarios autenticados pueden marcar conversaciones accesibles'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.contar_tickets_soporte_no_leidos()',
    'EXECUTE'
  ),
  'Los usuarios autenticados pueden consultar su contador'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000fc01',
    'propietario-notificaciones@pruebas.local',
    '{"nombre":"Propietario Notificaciones"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fc02',
    'cajero-notificaciones@pruebas.local',
    '{"nombre":"Cajero Notificaciones"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fc03',
    'otro-cajero-notificaciones@pruebas.local',
    '{"nombre":"Otro Cajero Notificaciones"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fc04',
    'otro-negocio-notificaciones@pruebas.local',
    '{"nombre":"Otro Negocio Notificaciones"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fc05',
    'admin-notificaciones@pruebas.local',
    '{"nombre":"Admin Notificaciones"}'::jsonb
  );

update public.perfiles
set rol_plataforma = 'admin_regalones'
where id = '00000000-0000-0000-0000-00000000fc05';

insert into public.negocios (id, nombre, slug, rubro, estado)
values
  (
    '98000000-0000-4000-8000-000000000001',
    'Comercio Notificaciones',
    'comercio-notificaciones',
    'Almacén',
    'activo'
  ),
  (
    '98000000-0000-4000-8000-000000000002',
    'Segundo Comercio Notificaciones',
    'segundo-comercio-notificaciones',
    'Panadería',
    'activo'
  );

insert into public.miembros_negocio (negocio_id, usuario_id, rol, estado)
values
  (
    '98000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000fc01',
    'propietario',
    'activo'
  ),
  (
    '98000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000fc02',
    'cajero',
    'activo'
  ),
  (
    '98000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000fc03',
    'cajero',
    'activo'
  ),
  (
    '98000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-00000000fc04',
    'propietario',
    'activo'
  );

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fc02';

select lives_ok(
  $$
    select public.crear_ticket_soporte(
      '98000000-0000-4000-8000-000000000001',
      'compras',
      'Consulta con notificación',
      'Necesitamos ayuda con una operación del terminal.',
      null
    )
  $$,
  'El comercio abre una conversación notificable'
);

select set_config(
  'prueba.ticket_notificaciones_id',
  (select id::text from public.tickets_soporte limit 1),
  true
);

select ok(
  (
    select leido_comercio_en is not null
      and leido_regalones_en is null
    from public.tickets_soporte
    limit 1
  ),
  'El mensaje propio queda leído y pendiente para Regalones'
);
select is(
  public.contar_tickets_soporte_no_leidos(),
  0::bigint,
  'El comercio no recibe una alerta por su propio mensaje'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fc03';

select is(
  public.contar_tickets_soporte_no_leidos(),
  0::bigint,
  'Otro cajero no recibe alertas de una conversación ajena'
);
select throws_ok(
  format(
    'select public.marcar_ticket_soporte_leido(%L::uuid)',
    current_setting('prueba.ticket_notificaciones_id')
  ),
  '42501',
  'No tienes permisos para revisar esta solicitud',
  'Otro cajero no puede marcar la conversación como leída'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fc05';

select is(
  public.contar_tickets_soporte_no_leidos(),
  1::bigint,
  'Administración recibe la alerta del nuevo mensaje comercial'
);
select lives_ok(
  format(
    'select public.marcar_ticket_soporte_leido(%L::uuid)',
    current_setting('prueba.ticket_notificaciones_id')
  ),
  'Administración puede marcar la conversación como leída'
);
select is(
  public.contar_tickets_soporte_no_leidos(),
  0::bigint,
  'La alerta administrativa desaparece al revisar la conversación'
);
select lives_ok(
  format(
    'select public.responder_ticket_soporte(%L::uuid, %L)',
    current_setting('prueba.ticket_notificaciones_id'),
    'Revisamos la consulta y necesitamos una nueva prueba.'
  ),
  'Administración responde y notifica al comercio'
);
select ok(
  (
    select leido_regalones_en is not null
      and leido_comercio_en is null
    from public.tickets_soporte
    where id = current_setting('prueba.ticket_notificaciones_id')::uuid
  ),
  'La respuesta administrativa queda pendiente para el comercio'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fc01';

select is(
  public.contar_tickets_soporte_no_leidos(),
  1::bigint,
  'El propietario recibe la alerta del mensaje de Regalones'
);
select lives_ok(
  format(
    'select public.marcar_ticket_soporte_leido(%L::uuid)',
    current_setting('prueba.ticket_notificaciones_id')
  ),
  'El propietario puede confirmar la lectura del comercio'
);
select is(
  public.contar_tickets_soporte_no_leidos(),
  0::bigint,
  'La alerta comercial desaparece al revisar la conversación'
);
select lives_ok(
  format(
    'select public.responder_ticket_soporte(%L::uuid, %L)',
    current_setting('prueba.ticket_notificaciones_id'),
    'La prueba solicitada ya fue realizada correctamente.'
  ),
  'La respuesta del comercio vuelve a notificar a Regalones'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fc04';

select is(
  public.contar_tickets_soporte_no_leidos(),
  0::bigint,
  'Un negocio diferente no recibe alertas ajenas'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fc05';

select is(
  public.contar_tickets_soporte_no_leidos(),
  1::bigint,
  'Regalones recibe la nueva respuesta del primer comercio'
);
select lives_ok(
  format(
    'select public.marcar_ticket_soporte_leido(%L::uuid)',
    current_setting('prueba.ticket_notificaciones_id')
  ),
  'Regalones limpia la segunda alerta'
);
select lives_ok(
  $$
    select public.crear_ticket_soporte(
      '98000000-0000-4000-8000-000000000002',
      'beneficios',
      'Aviso al segundo comercio',
      'Necesitamos revisar una condición antes de publicar.',
      null
    )
  $$,
  'Administración puede contactar a otro negocio del directorio'
);
select is(
  public.contar_tickets_soporte_no_leidos(),
  0::bigint,
  'Administración no recibe una alerta por su propio contacto'
);
select is(
  (
    select count(*)
    from public.negocios
    where id in (
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002'
    )
  ),
  2::bigint,
  'Administración puede consultar todos los negocios del directorio'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fc04';

select is(
  public.contar_tickets_soporte_no_leidos(),
  1::bigint,
  'El segundo negocio recibe el contacto iniciado por Regalones'
);

reset role;

select * from finish();
rollback;
