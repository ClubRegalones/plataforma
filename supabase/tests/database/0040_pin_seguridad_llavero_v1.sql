begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select no_plan();


-- ============================================================================
-- ESTRUCTURA
-- ============================================================================

select has_column(
  'public',
  'llaveros_nfc',
  'pin_seguridad_hash',
  'Existe un PIN de seguridad independiente'
);


select has_column(
  'public',
  'llaveros_nfc',
  'pin_seguridad_intentos_fallidos',
  'Existe contador independiente de intentos'
);


select has_column(
  'public',
  'llaveros_nfc',
  'pin_seguridad_bloqueado_hasta',
  'Existe bloqueo temporal independiente'
);


select has_function(
  'public',
  'establecer_pin_seguridad_llavero_interno',
  array['uuid', 'text'],
  'Existe el setter interno del PIN'
);


select has_function(
  'public',
  'validar_pin_seguridad_llavero_interno',
  array['uuid', 'text'],
  'Existe el validador interno del PIN'
);


-- ============================================================================
-- PERMISOS
-- ============================================================================

select ok(
  not has_function_privilege(
    'anon',
    'public.establecer_pin_seguridad_llavero_interno(uuid,text)',
    'EXECUTE'
  ),
  'anon no puede establecer PIN'
);


select ok(
  not has_function_privilege(
    'authenticated',
    'public.establecer_pin_seguridad_llavero_interno(uuid,text)',
    'EXECUTE'
  ),
  'authenticated no puede saltarse activación/restablecimiento'
);


select ok(
  not has_function_privilege(
    'anon',
    'public.validar_pin_seguridad_llavero_interno(uuid,text)',
    'EXECUTE'
  ),
  'anon no puede ejecutar directamente el validador'
);


select ok(
  not has_function_privilege(
    'authenticated',
    'public.validar_pin_seguridad_llavero_interno(uuid,text)',
    'EXECUTE'
  ),
  'authenticated no puede ejecutar directamente el validador'
);


select ok(
  not has_column_privilege(
    'authenticated',
    'public.llaveros_nfc',
    'pin_seguridad_hash',
    'SELECT'
  ),
  'El frontend no puede leer el hash del PIN'
);


-- ============================================================================
-- FIXTURE
-- ============================================================================

insert into auth.users (
  id,
  email,
  raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-00000000f401',
  'vecino-pin-seguridad@pruebas.local',
  '{"nombre":"Vecino PIN Seguridad"}'::jsonb
);



insert into public.llaveros_nfc (
  id,
  vecino_id,
  token_hash,
  codigo_publico,
  estado,
  asignado_en,
  asignado_por,
  pin_activacion_hash
)
values (
  'a4000000-0000-4000-8000-000000000040',
  '00000000-0000-0000-0000-00000000f401',
  repeat('b', 64),
  'LLAVERO-SEGURIDAD-0040',
  'activo',
  clock_timestamp(),
  '00000000-0000-0000-0000-00000000f401',

  -- PIN histórico DELIBERADAMENTE distinto.
  extensions.crypt(
    '2468',
    extensions.gen_salt('bf', 10)
  )
);


-- ============================================================================
-- EL PIN HISTÓRICO NO SE REUTILIZA
-- ============================================================================

select ok(
  (
    select
      pin_activacion_hash is not null
      and pin_seguridad_hash is null
    from public.llaveros_nfc
    where id =
      'a4000000-0000-4000-8000-000000000040'
  ),
  'El PIN legacy no se hereda como PIN de seguridad'
);


-- ============================================================================
-- FORMATO
-- ============================================================================

select throws_ok(
  $$
    select public.establecer_pin_seguridad_llavero_interno(
      'a4000000-0000-4000-8000-000000000040',
      '12345'
    )
  $$,
  '22023',
  'El PIN de seguridad debe tener exactamente 4 dígitos',
  'Un PIN de cinco dígitos es rechazado'
);


select throws_ok(
  $$
    select public.establecer_pin_seguridad_llavero_interno(
      'a4000000-0000-4000-8000-000000000040',
      '12a4'
    )
  $$,
  '22023',
  'El PIN de seguridad debe tener exactamente 4 dígitos',
  'El PIN acepta solamente números'
);


-- ============================================================================
-- CONFIGURAR PIN
-- ============================================================================

select lives_ok(
  $$
    select public.establecer_pin_seguridad_llavero_interno(
      'a4000000-0000-4000-8000-000000000040',
      '1357'
    )
  $$,
  'Puede establecerse un PIN válido mediante el helper interno'
);


select ok(
  (
    select
      pin_seguridad_hash is not null
      and pin_seguridad_hash <> '1357'
      and char_length(pin_seguridad_hash) >= 32
    from public.llaveros_nfc
    where id =
      'a4000000-0000-4000-8000-000000000040'
  ),
  'Nunca se almacena el PIN en texto plano'
);


select ok(
  (
    select
      pin_seguridad_configurado_en is not null
      and pin_seguridad_actualizado_en is not null
    from public.llaveros_nfc
    where id =
      'a4000000-0000-4000-8000-000000000040'
  ),
  'La configuración queda fechada'
);


select ok(
  (
    select
      extensions.crypt(
        '2468',
        pin_activacion_hash
      ) = pin_activacion_hash

      and

      extensions.crypt(
        '1357',
        pin_seguridad_hash
      ) = pin_seguridad_hash

    from public.llaveros_nfc
    where id =
      'a4000000-0000-4000-8000-000000000040'
  ),
  'PIN legacy y PIN de seguridad permanecen técnicamente independientes'
);


-- ============================================================================
-- VALIDACIÓN CORRECTA
-- ============================================================================

select is(
  (
    select autorizado
    from public.validar_pin_seguridad_llavero_interno(
      'a4000000-0000-4000-8000-000000000040',
      '1357'
    )
  ),
  true,
  'El PIN correcto autoriza'
);


-- ============================================================================
-- INTENTOS FALLIDOS
-- ============================================================================

select is(
  (
    select autorizado
    from public.validar_pin_seguridad_llavero_interno(
      'a4000000-0000-4000-8000-000000000040',
      '0000'
    )
  ),
  false,
  'Primer PIN incorrecto es rechazado'
);


select is(
  (
    select pin_seguridad_intentos_fallidos
    from public.llaveros_nfc
    where id =
      'a4000000-0000-4000-8000-000000000040'
  ),
  1::smallint,
  'Primer intento fallido queda registrado'
);


select is(
  (
    select autorizado
    from public.validar_pin_seguridad_llavero_interno(
      'a4000000-0000-4000-8000-000000000040',
      '1111'
    )
  ),
  false,
  'Segundo PIN incorrecto es rechazado'
);


select is(
  (
    select autorizado
    from public.validar_pin_seguridad_llavero_interno(
      'a4000000-0000-4000-8000-000000000040',
      '2222'
    )
  ),
  false,
  'Tercer PIN incorrecto es rechazado'
);


select ok(
  (
    select
      pin_seguridad_intentos_fallidos = 3
      and pin_seguridad_bloqueado_hasta > clock_timestamp()
    from public.llaveros_nfc
    where id =
      'a4000000-0000-4000-8000-000000000040'
  ),
  'Tres intentos fallidos bloquean el PIN temporalmente'
);


select is(
  (
    select autorizado
    from public.validar_pin_seguridad_llavero_interno(
      'a4000000-0000-4000-8000-000000000040',
      '1357'
    )
  ),
  false,
  'El PIN correcto tampoco funciona mientras existe bloqueo'
);


-- ============================================================================
-- EXPIRACIÓN DEL BLOQUEO
-- ============================================================================

update public.llaveros_nfc
set pin_seguridad_bloqueado_hasta =
  clock_timestamp() - interval '1 second'
where id =
  'a4000000-0000-4000-8000-000000000040';


select is(
  (
    select autorizado
    from public.validar_pin_seguridad_llavero_interno(
      'a4000000-0000-4000-8000-000000000040',
      '1357'
    )
  ),
  true,
  'Después de 15 minutos el PIN correcto puede volver a autorizar'
);


select ok(
  (
    select
      pin_seguridad_intentos_fallidos = 0
      and pin_seguridad_bloqueado_hasta is null
    from public.llaveros_nfc
    where id =
      'a4000000-0000-4000-8000-000000000040'
  ),
  'PIN correcto reinicia contador y bloqueo'
);


-- ============================================================================
-- RESTABLECER PIN
--
-- Aquí solo probamos el motor interno.
-- La autorización presencial se construirá en B3.
-- ============================================================================

select lives_ok(
  $$
    select public.establecer_pin_seguridad_llavero_interno(
      'a4000000-0000-4000-8000-000000000040',
      '8642'
    )
  $$,
  'El helper permite establecer un PIN nuevo para el futuro flujo de recuperación'
);


select is(
  (
    select autorizado
    from public.validar_pin_seguridad_llavero_interno(
      'a4000000-0000-4000-8000-000000000040',
      '1357'
    )
  ),
  false,
  'El PIN anterior deja de autorizar después del restablecimiento'
);


select is(
  (
    select autorizado
    from public.validar_pin_seguridad_llavero_interno(
      'a4000000-0000-4000-8000-000000000040',
      '8642'
    )
  ),
  true,
  'El nuevo PIN autoriza después del restablecimiento'
);


select * from finish();

rollback;