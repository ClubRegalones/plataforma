begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select no_plan();

-- ============================================================================
-- IDENTIDAD RUT V1 · BASE
-- Prueba: normalización, DV, validación (cuerpo 1 a 8 dígitos y sin
-- caracteres ajenos), formato, máscara, RUT de vecino único e inmutable desde
-- el cliente,
-- RUT de negocio canónico y cierre de identificación por teléfono.
-- ============================================================================

-- 1. Normalización -----------------------------------------------------------
select is(public.normalizar_rut('12.345.678-5'), '123456785', 'quita puntos y guion');
select is(public.normalizar_rut('10.000.013-k'), '10000013K', 'K pasa a mayúscula');
select is(public.normalizar_rut(' 012.345.678-5 '), '123456785', 'quita espacios y ceros a la izquierda');
select is(public.normalizar_rut(''), null, 'vacío es null');
select is(public.normalizar_rut(null), null, 'null es null');

-- 2. Dígito verificador ------------------------------------------------------
select is(public.calcular_dv_rut('12345678'), '5', 'DV numérico');
select is(public.calcular_dv_rut('10000013'), 'K', 'DV K');
select is(public.calcular_dv_rut('abc'), null, 'cuerpo no numérico');

-- 3. Validación --------------------------------------------------------------
select ok(public.es_rut_valido('12.345.678-5'), 'válido con puntos y guion');
select ok(public.es_rut_valido('123456785'), 'válido sin formato');
select ok(public.es_rut_valido('7.654.321-6'), 'válido de 7 dígitos');
select ok(public.es_rut_valido('10000013k'), 'válido con k minúscula');
select ok(not public.es_rut_valido('12.345.678-9'), 'DV incorrecto');
select ok(public.es_rut_valido('999.999-K'), 'acepta RUT histórico válido de cuerpo corto (6 dígitos)');
select ok(public.es_rut_valido('1-9'), 'acepta cuerpo de 1 dígito si el DV es correcto');
select ok(not public.es_rut_valido('123456789-0'), 'rechaza cuerpo de más de 8 dígitos');
select ok(not public.es_rut_valido('abc12.345.678-5xyz'), 'rechaza caracteres ajenos al formato RUT');
select ok(not public.es_rut_valido('#12345678-5'), 'rechaza símbolos ajenos al formato RUT');
select ok(not public.es_rut_valido('12,345,678-5'), 'rechaza comas');
select ok(public.es_rut_valido('12 345 678 5'), 'acepta espacios como separador');
select ok(not public.es_rut_valido('12.345.678-K5'), 'K fuera de la posición del DV');
select ok(not public.es_rut_valido(null), 'null no es válido');

-- 4. Formato y máscara -------------------------------------------------------
select is(public.formatear_rut('123456785'), '12.345.678-5', 'formato con puntos');
select is(public.formatear_rut('76543216'), '7.654.321-6', 'formato 7 dígitos');
select is(public.formatear_rut('123456789'), null, 'no formatea inválidos');
select is(public.enmascarar_rut('12.345.678-5'), '•••••678-5', 'máscara para caja');

-- 5. RUT del vecino en perfiles ----------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000e0461', 'rut-a@pruebas.local', '{"nombre":"Rosa"}'::jsonb),
  ('00000000-0000-0000-0000-0000000e0462', 'rut-b@pruebas.local', '{"nombre":"Juan"}'::jsonb);

select lives_ok(
  $$ update public.perfiles set rut = '123456785'
     where id = '00000000-0000-0000-0000-0000000e0461' $$,
  'acepta RUT canónico válido'
);

select throws_ok(
  $$ update public.perfiles set rut = '123456785'
     where id = '00000000-0000-0000-0000-0000000e0462' $$,
  '23505', null,
  'rechaza RUT duplicado'
);

select throws_ok(
  $$ update public.perfiles set rut = '123456789'
     where id = '00000000-0000-0000-0000-0000000e0462' $$,
  '23514', null,
  'rechaza DV inválido'
);

select throws_ok(
  $$ update public.perfiles set rut = '1234567-4'
     where id = '00000000-0000-0000-0000-0000000e0462' $$,
  '23514', null,
  'rechaza formato no canónico'
);

select ok(
  not has_column_privilege('authenticated', 'public.perfiles', 'rut', 'UPDATE'),
  'el vecino no puede cambiar directamente su RUT'
);

select ok(
  not has_column_privilege('authenticated', 'public.perfiles', 'rut', 'INSERT')
  and not has_column_privilege('anon', 'public.perfiles', 'rut', 'UPDATE'),
  'nadie desde el cliente puede escribir el RUT'
);

select lives_ok(
  $$ update public.perfiles set telefono = '+56911111111'
     where id = '00000000-0000-0000-0000-0000000e0461' $$,
  'cambiar teléfono no toca la identidad'
);

select is(
  (select count(*)::integer from public.perfiles where rut = '123456785'),
  1,
  'sigue existiendo una sola cuenta con ese RUT'
);

-- 6. RUT del negocio ---------------------------------------------------------
select ok(
  (select convalidated from pg_constraint
   where conname = 'negocios_rut_canonico_valido'),
  'la restricción de RUT de negocio quedó validada'
);

select ok(
  not exists (
    select 1 from public.negocios
    where rut is not null and btrim(rut) = ''
  ),
  'no quedan RUT de negocio vacíos'
);

-- 7. Sin identificación por teléfono en caja ---------------------------------
select ok(
  not has_function_privilege(
    'anon',
    'public.terminal_buscar_vecino_por_telefono(text, uuid, uuid, text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.terminal_buscar_vecino_por_telefono(text, uuid, uuid, text)',
    'execute'
  ),
  'búsqueda por teléfono cerrada'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.terminal_crear_solicitud_compra_por_telefono(text, integer, text, uuid, uuid, text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.terminal_crear_solicitud_compra_por_telefono(text, integer, text, uuid, uuid, text)',
    'execute'
  ),
  'compra por teléfono cerrada'
);

select * from finish();

rollback;
