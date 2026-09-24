begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select no_plan();

-- ============================================================================
-- REGISTRO Y ACCESO DE VECINOS POR RUT · V1
-- ============================================================================


-- 1. Contrato ----------------------------------------------------------------
select has_table('public', 'contactos_vecino', 'existe contactos_vecino');
select has_table('public', 'versiones_consentimiento', 'existe versiones_consentimiento');
select has_table('public', 'consentimientos_vecino', 'existe consentimientos_vecino');
select has_table('public', 'bloqueos_intentos', 'existe bloqueos_intentos');

select is(
  (select count(*)::integer from public.versiones_consentimiento where obligatorio),
  1,
  'solo términos y privacidad es obligatorio'
);


-- 2. Solo service_role ejecuta las funciones de identidad --------------------
select ok(
  not has_function_privilege('anon', 'public.rut_registrado(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.rut_registrado(text)', 'execute')
  and has_function_privilege('service_role', 'public.rut_registrado(text)', 'execute'),
  'rut_registrado solo para service_role'
);

select ok(
  not has_function_privilege('anon', 'public.completar_registro_vecino(uuid, text, text, text, text, text, public.canal_consentimiento, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.completar_registro_vecino(uuid, text, text, text, text, text, public.canal_consentimiento, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.completar_registro_vecino(uuid, text, text, text, text, text, public.canal_consentimiento, jsonb)', 'execute'),
  'completar_registro_vecino solo para service_role'
);

select ok(
  not has_function_privilege('anon', 'public.obtener_usuario_id_acceso_por_rut(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.obtener_usuario_id_acceso_por_rut(text)', 'execute')
  and has_function_privilege('service_role', 'public.obtener_usuario_id_acceso_por_rut(text)', 'execute'),
  'obtener_usuario_id_acceso_por_rut solo para service_role'
);

select ok(
  not has_function_privilege('anon', 'public.registrar_intento_fallido(text, integer, interval, interval)', 'execute')
  and not has_function_privilege('authenticated', 'public.registrar_intento_fallido(text, integer, interval, interval)', 'execute')
  and not has_function_privilege('anon', 'public.intento_bloqueado(text)', 'execute')
  and not has_function_privilege('anon', 'public.limpiar_intentos(text)', 'execute'),
  'bloqueo de intentos cerrado al cliente'
);

select ok(
  not has_table_privilege('authenticated', 'public.contactos_vecino', 'INSERT')
  and not has_table_privilege('authenticated', 'public.contactos_vecino', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.consentimientos_vecino', 'INSERT')
  and not has_table_privilege('authenticated', 'public.consentimientos_vecino', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.consentimientos_vecino', 'DELETE')
  and not has_table_privilege('anon', 'public.bloqueos_intentos', 'SELECT')
  and not has_table_privilege('authenticated', 'public.bloqueos_intentos', 'SELECT'),
  'el cliente no escribe contactos ni consentimientos ni lee bloqueos'
);


-- 3. Perfil automático ---------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000e0471', 'v-11111111-aaaa@cuentas.clubregalones.cl', '{"rut":"12.345.678-5"}'::jsonb),
  ('00000000-0000-0000-0000-0000000e0472', 'v-22222222-bbbb@cuentas.clubregalones.cl', '{"nombre":"Juan","apellido":"Pérez"}'::jsonb),
  ('00000000-0000-0000-0000-0000000e0473', 'v-33333333-cccc@cuentas.clubregalones.cl', '{"nombre":"Ana"}'::jsonb);

select is(
  (select rut from public.perfiles where id = '00000000-0000-0000-0000-0000000e0471'),
  null,
  'el trigger ignora un RUT enviado en los metadatos'
);

select is(
  (select nombre::text from public.perfiles where id = '00000000-0000-0000-0000-0000000e0471'),
  'Vecino',
  'el correo técnico no se usa como nombre'
);


-- 4. Registro ------------------------------------------------------------------
select throws_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0472', '12.345.678-9', 'Juan', 'Pérez',
       null, null, 'web', '{"terminos_privacidad": {"version": "2026-09-provisoria", "otorgado": true}}'::jsonb) $$,
  '22023', 'RUT_INVALIDO',
  'rechaza RUT con DV incorrecto'
);

select throws_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0472', '12.345.678-5', 'Juan', 'Pérez',
       null, null, 'web', '{}'::jsonb) $$,
  '22023', 'TERMINOS_REQUERIDOS',
  'exige aceptar términos y privacidad'
);

select throws_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0472', '12.345.678-5', 'Juan', 'Pérez',
       null, null, 'web', '{"terminos_privacidad": true}'::jsonb) $$,
  '22023', 'CONSENTIMIENTO_MAL_FORMADO',
  'un booleano suelto no dice qué versión vio el vecino'
);

select throws_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0472', '12.345.678-5', 'Juan', 'Pérez',
       null, null, 'web',
       '{"terminos_privacidad": {"version": "2026-09-provisoria", "otorgado": false}}'::jsonb) $$,
  '22023', 'TERMINOS_REQUERIDOS',
  'términos no aceptados'
);

select throws_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0472', '12.345.678-5', 'Juan', 'Pérez',
       null, null, 'web',
       '{"terminos_privacidad": {"version": "no-existe", "otorgado": true}}'::jsonb) $$,
  '22023', 'VERSION_CONSENTIMIENTO_INVALIDA',
  'rechaza una versión que no existe'
);

select throws_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0472', '12.345.678-5', 'Juan', 'Pérez',
       null, null, 'web',
       '{"terminos_privacidad": {"version": "2026-09-provisoria", "otorgado": true},
         "otra_cosa": {"version": "2026-09-provisoria", "otorgado": true}}'::jsonb) $$,
  '22023', 'CONSENTIMIENTO_DESCONOCIDO',
  'rechaza tipos de consentimiento desconocidos'
);

select throws_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0472', '12.345.678-5', 'Juan', 'Pérez',
       'otro@cuentas.clubregalones.cl', null, 'web', '{"terminos_privacidad": {"version": "2026-09-provisoria", "otorgado": true}}'::jsonb) $$,
  '22023', 'CORREO_INVALIDO',
  'un correo técnico no puede ser contacto'
);

select throws_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0472', '12.345.678-5', 'Juan', 'Pérez',
       null, '123', 'web', '{"terminos_privacidad": {"version": "2026-09-provisoria", "otorgado": true}}'::jsonb) $$,
  '22023', 'TELEFONO_INVALIDO',
  'rechaza teléfono inválido'
);

select throws_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0472', '12.345.678-5', 'Juan', null,
       null, null, 'web', '{"terminos_privacidad": {"version": "2026-09-provisoria", "otorgado": true}}'::jsonb) $$,
  '22023', 'APELLIDO_INVALIDO',
  'exige apellido'
);

select throws_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0472', '12.345.678-5', 'Juan', '   ',
       null, null, 'web', '{"terminos_privacidad": {"version": "2026-09-provisoria", "otorgado": true}}'::jsonb) $$,
  '22023', 'APELLIDO_INVALIDO',
  'rechaza apellido vacío'
);

select lives_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0472', '12.345.678-5', 'Juan', 'Pérez',
       ' Juan@Correo.CL ', '9 1234 5678', 'web',
       '{"terminos_privacidad": {"version": "2026-09-provisoria", "otorgado": true}, "avisos_comerciales": {"version": "2026-09-provisoria", "otorgado": true}}'::jsonb) $$,
  'registro válido'
);

select is(
  (select rut from public.perfiles where id = '00000000-0000-0000-0000-0000000e0472'),
  '123456785',
  'el RUT queda en formato canónico'
);

select is(
  (select modalidad_atencion::text from public.perfiles where id = '00000000-0000-0000-0000-0000000e0472'),
  'digital',
  'registro web queda en modalidad digital'
);

select set_eq(
  $$ select tipo::text, valor::text from public.contactos_vecino
     where vecino_id = '00000000-0000-0000-0000-0000000e0472' $$,
  $$ values ('correo', 'juan@correo.cl'), ('telefono', '+56912345678') $$,
  'contactos normalizados'
);

select set_eq(
  $$ select v.tipo::text, c.otorgado
     from public.consentimientos_vecino as c
     join public.versiones_consentimiento as v on v.id = c.version_id
     where c.vecino_id = '00000000-0000-0000-0000-0000000e0472' $$,
  $$ values ('terminos_privacidad', true), ('avisos_comerciales', true) $$,
  'se registran exactamente los consentimientos que el vecino vio'
);

select throws_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0472', '7.654.321-6', 'Juan', 'Pérez',
       null, null, 'web', '{"terminos_privacidad": {"version": "2026-09-provisoria", "otorgado": true}}'::jsonb) $$,
  '23505', 'PERFIL_YA_TIENE_RUT',
  'un perfil no puede recibir un segundo RUT'
);

select throws_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0473', '12345678-5', 'Ana', 'Soto',
       null, null, 'web', '{"terminos_privacidad": {"version": "2026-09-provisoria", "otorgado": true}}'::jsonb) $$,
  '23505', 'RUT_DUPLICADO',
  'un RUT existente nunca crea una segunda cuenta'
);

select is(
  (select count(*)::integer from public.perfiles where rut = '123456785'),
  1,
  'sigue existiendo una sola cuenta con ese RUT'
);

-- Se publica una versión nueva mientras Ana tenía abierto el formulario con
-- la anterior: debe quedar registrada la versión que ella vio.
insert into public.versiones_consentimiento (tipo, version, obligatorio)
values ('terminos_privacidad', '2026-10-prueba', true);

select is(
  (select version::text from public.versiones_consentimiento_vigentes
   where tipo = 'terminos_privacidad'),
  '2026-10-prueba',
  'la vista muestra la versión vigente'
);

select lives_ok(
  $$ select public.completar_registro_vecino(
       '00000000-0000-0000-0000-0000000e0473', '7.654.321-6', 'Ana', 'Soto',
       'juan@correo.cl', null, 'app_vecino', '{"terminos_privacidad": {"version": "2026-09-provisoria", "otorgado": true}}'::jsonb) $$,
  'el mismo correo de contacto puede estar en otra cuenta (familia)'
);

select is(
  (select v.version::text
   from public.consentimientos_vecino as c
   join public.versiones_consentimiento as v on v.id = c.version_id
   where c.vecino_id = '00000000-0000-0000-0000-0000000e0473'),
  '2026-09-provisoria',
  'se registra la versión que vio, no la publicada después'
);


-- 4b. La tabla se protege sola, aunque alguien inserte sin la RPC ----------
select throws_ok(
  $$ insert into public.contactos_vecino (vecino_id, tipo, valor)
     values ('00000000-0000-0000-0000-0000000e0472', 'correo', 'no-es-correo') $$,
  '23514', null,
  'inserción directa de correo inválido falla'
);

select throws_ok(
  $$ insert into public.contactos_vecino (vecino_id, tipo, valor)
     values ('00000000-0000-0000-0000-0000000e0472', 'telefono', '123') $$,
  '23514', null,
  'inserción directa de teléfono inválido falla'
);

select throws_ok(
  $$ insert into public.contactos_vecino (vecino_id, tipo, valor)
     values ('00000000-0000-0000-0000-0000000e0472', 'correo', 'x@cuentas.clubregalones.cl') $$,
  '23514', null,
  'inserción directa de correo técnico falla'
);

select throws_ok(
  $$ insert into public.contactos_vecino (vecino_id, tipo, valor)
     values ('00000000-0000-0000-0000-0000000e0472', 'correo', 'Mayus@Correo.cl') $$,
  '23514', null,
  'inserción directa de correo sin normalizar falla'
);


-- 5. Acceso ------------------------------------------------------------------
select ok(public.rut_registrado('12.345.678-5'), 'rut_registrado acepta cualquier formato');
select ok(not public.rut_registrado('1-9'), 'rut_registrado falso para RUT sin cuenta');

select is(
  public.obtener_usuario_id_acceso_por_rut('12.345.678-5'),
  '00000000-0000-0000-0000-0000000e0472'::uuid,
  'el RUT resuelve solo al id del perfil'
);

select is(
  public.obtener_usuario_id_acceso_por_rut('1-9'),
  null,
  'RUT sin cuenta no resuelve'
);

select is(
  public.obtener_usuario_id_acceso_por_rut('abc12.345.678-5xyz'),
  null,
  'basura alrededor de un RUT válido no resuelve'
);

select is(
  public.obtener_usuario_id_acceso_por_rut('#12.345.678-5'),
  null,
  'símbolos ajenos no resuelven'
);

select is(
  public.obtener_usuario_id_acceso_por_rut('12,345,678-5'),
  null,
  'comas no resuelven'
);

select hasnt_function(
  'public', 'obtener_correo_acceso_por_rut',
  'no existe una función SQL que entregue el correo técnico'
);

update public.perfiles set estado = 'bloqueado' where id = '00000000-0000-0000-0000-0000000e0472';
select is(
  public.obtener_usuario_id_acceso_por_rut('12.345.678-5'),
  null,
  'un perfil bloqueado no puede acceder'
);
update public.perfiles set estado = 'activo' where id = '00000000-0000-0000-0000-0000000e0472';

select ok(
  (select position('123456785' in email) = 0
   from auth.users where id = '00000000-0000-0000-0000-0000000e0472'),
  'el correo técnico no contiene el RUT'
);


-- 6. Bloqueo de intentos -----------------------------------------------------
select is(public.registrar_intento_fallido('acceso-rut:prueba', 5, '15 minutes', '15 minutes'), null, 'fallo 1 sin bloqueo');
select is(public.registrar_intento_fallido('acceso-rut:prueba', 5, '15 minutes', '15 minutes'), null, 'fallo 2 sin bloqueo');
select is(public.registrar_intento_fallido('acceso-rut:prueba', 5, '15 minutes', '15 minutes'), null, 'fallo 3 sin bloqueo');
select is(public.registrar_intento_fallido('acceso-rut:prueba', 5, '15 minutes', '15 minutes'), null, 'fallo 4 sin bloqueo');
select isnt(public.registrar_intento_fallido('acceso-rut:prueba', 5, '15 minutes', '15 minutes'), null, 'el quinto fallo bloquea');
select isnt(public.intento_bloqueado('acceso-rut:prueba'), null, 'la clave queda bloqueada');

select lives_ok($$ select public.limpiar_intentos('acceso-rut:prueba') $$, 'un acceso exitoso limpia el contador');
select is(public.intento_bloqueado('acceso-rut:prueba'), null, 'la clave queda libre');


-- 7. RLS: cada vecino ve solo lo suyo ---------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000e0473';

select is(
  (select count(*)::integer from public.contactos_vecino),
  1,
  'el vecino ve solo sus contactos'
);

select is(
  (select count(*)::integer from public.consentimientos_vecino),
  1,
  'el vecino ve solo sus consentimientos'
);

select ok(
  (select count(*) > 0 from public.versiones_consentimiento_vigentes),
  'la vista de versiones vigentes es pública'
);

select ok(
  (select count(*) > 0 from public.versiones_consentimiento),
  'las versiones de consentimiento son públicas'
);

reset role;

select * from finish();

rollback;
