begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

select has_column(
  'public', 'sesiones_lector_movil', 'turno_caja_id',
  'La sesión del lector conserva el turno operativo'
);
select col_is_null(
  'public', 'sesiones_lector_movil', 'creada_por',
  'El lector de Terminal no requiere usuario creador'
);

select has_function('public', 'terminal_crear_vinculacion_lector',
  array['uuid', 'uuid', 'text', 'text']);
select has_function('public', 'terminal_listar_lecturas_lector',
  array['uuid', 'uuid', 'text']);
select has_function('public', 'terminal_reclamar_lectura_lector',
  array['uuid', 'uuid', 'uuid', 'text']);
select has_function('public', 'terminal_activar_llavero_desde_lectura',
  array['uuid', 'metodo_verificacion_llavero', 'text', 'boolean', 'uuid', 'uuid', 'text']);
select has_function('public', 'terminal_crear_compra_desde_lectura',
  array['uuid', 'integer', 'text', 'uuid', 'uuid', 'text']);
select has_function('public', 'terminal_reservar_canje_desde_lectura',
  array['uuid', 'uuid', 'text', 'uuid', 'uuid', 'text']);
select has_function('public', 'terminal_cerrar_lector',
  array['uuid', 'uuid', 'text']);

select function_privs_are(
  'public', 'terminal_crear_vinculacion_lector',
  array['uuid', 'uuid', 'text', 'text'], 'anon', array['EXECUTE']);
select function_privs_are(
  'public', 'terminal_listar_lecturas_lector',
  array['uuid', 'uuid', 'text'], 'anon', array['EXECUTE']);
select function_privs_are(
  'public', 'terminal_reclamar_lectura_lector',
  array['uuid', 'uuid', 'uuid', 'text'], 'anon', array['EXECUTE']);
select function_privs_are(
  'public', 'terminal_activar_llavero_desde_lectura',
  array['uuid', 'metodo_verificacion_llavero', 'text', 'boolean', 'uuid', 'uuid', 'text'],
  'anon', array['EXECUTE']);
select function_privs_are(
  'public', 'terminal_crear_compra_desde_lectura',
  array['uuid', 'integer', 'text', 'uuid', 'uuid', 'text'],
  'anon', array['EXECUTE']);
select function_privs_are(
  'public', 'terminal_reservar_canje_desde_lectura',
  array['uuid', 'uuid', 'text', 'uuid', 'uuid', 'text'],
  'anon', array['EXECUTE']);
select function_privs_are(
  'public', 'terminal_cerrar_lector',
  array['uuid', 'uuid', 'text'], 'anon', array['EXECUTE']);

select function_privs_are(
  'public', 'validar_lectura_terminal_turno_interna',
  array['uuid', 'uuid', 'uuid', 'text'], 'anon', array[]::text[]);
select function_privs_are(
  'public', 'consumir_lectura_terminal_turno_interna',
  array['uuid'], 'anon', array[]::text[]);

select has_trigger(
  'public', 'turnos_caja', 'turnos_caja_cerrar_lector',
  'Cerrar un turno cierra su lector móvil'
);

select function_returns(
  'public', 'terminal_crear_compra_desde_lectura',
  array['uuid', 'integer', 'text', 'uuid', 'uuid', 'text'],
  'solicitudes_compra'
);

select matches(
  pg_get_functiondef('public.terminal_crear_vinculacion_lector(uuid,uuid,text,text)'::regprocedure),
  'validar_turno_terminal_interno',
  'La vinculación valida credencial permanente y turno'
);
select matches(
  pg_get_functiondef('public.terminal_reservar_canje_desde_lectura(uuid,uuid,text,uuid,uuid,text)'::regprocedure),
  'crear_reserva_canje_regis_interna',
  'El canje NFC reserva REGIS en backend'
);
select matches(
  pg_get_functiondef('public.terminal_crear_compra_desde_lectura(uuid,integer,text,uuid,uuid,text)'::regprocedure),
  'turno_caja_id',
  'La compra NFC conserva el turno'
);
select matches(
  pg_get_functiondef('public.cerrar_lector_al_cerrar_turno()'::regprocedure),
  'turno_caja_id = new.id',
  'El cierre automático se limita al lector del turno'
);

select * from finish();
rollback;
