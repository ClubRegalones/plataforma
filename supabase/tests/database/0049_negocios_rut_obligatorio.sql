begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select no_plan();

-- ============================================================================
-- RUT OBLIGATORIO PARA NEGOCIOS
-- ============================================================================


-- ============================================================================
-- 1. CONTRATO
-- ============================================================================

select ok(
  to_regprocedure(
    'public.crear_negocio(text,text,text,text,text,text)'
  ) is not null,
  'crear_negocio conserva su firma de seis argumentos'
);

select ok(
  (
    select attnotnull
    from pg_attribute
    where attrelid = 'public.negocios'::regclass
      and attname = 'rut'
      and not attisdropped
  ),
  'negocios.rut es NOT NULL'
);

select ok(
  (
    select convalidated
    from pg_constraint
    where conrelid = 'public.negocios'::regclass
      and conname = 'negocios_rut_canonico_valido'
  ),
  'la restricción de RUT canónico del negocio está validada'
);

select is(
  (
    select pronargdefaults::integer
    from pg_proc
    where oid =
      'public.crear_negocio(text,text,text,text,text,text)'::regprocedure
  ),
  2,
  'solo descripcion y logo_url conservan default; p_rut es obligatorio'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.crear_negocio(text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated puede ejecutar crear_negocio'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.crear_negocio(text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'anon no puede ejecutar crear_negocio'
);


-- ============================================================================
-- 2. USUARIO DE PRUEBA
-- ============================================================================

insert into auth.users (
  id,
  email,
  raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-00000000f491',
  'propietaria-rut-0049@cuentas.clubregalones.cl',
  '{"nombre":"Daniela","apellido":"Comerciante"}'::jsonb
);


-- ============================================================================
-- 3. AUTENTICACION OBLIGATORIA
-- ============================================================================

select throws_ok(
  $$
    select *
    from public.crear_negocio(
      'Negocio Sin Sesión 0049',
      'negocio-sin-sesion-0049',
      'Almacén',
      '12.345.678-5',
      null,
      null
    )
  $$,
  '42501',
  'Debes iniciar sesión para crear un negocio',
  'crear_negocio sigue exigiendo una sesión autenticada'
);


-- Simulamos el JWT de una persona autenticada.
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-00000000f491',
  true
);

select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

set local role authenticated;


-- ============================================================================
-- 4. RUT OBLIGATORIO Y VALIDO
-- ============================================================================

select throws_ok(
  $$
    select *
    from public.crear_negocio(
      'Negocio RUT Nulo 0049',
      'negocio-rut-nulo-0049',
      'Almacén',
      null,
      null,
      null
    )
  $$,
  '23502',
  'El RUT del negocio es obligatorio',
  'crear_negocio rechaza RUT null'
);

select throws_ok(
  $$
    select *
    from public.crear_negocio(
      'Negocio RUT Vacío 0049',
      'negocio-rut-vacio-0049',
      'Almacén',
      '   ',
      null,
      null
    )
  $$,
  '23502',
  'El RUT del negocio es obligatorio',
  'crear_negocio rechaza RUT vacío'
);

select throws_ok(
  $$
    select *
    from public.crear_negocio(
      'Negocio RUT Inválido 0049',
      'negocio-rut-invalido-0049',
      'Almacén',
      '12.345.678-9',
      null,
      null
    )
  $$,
  '23514',
  'El RUT del negocio no es válido',
  'crear_negocio rechaza un RUT con DV incorrecto'
);

select throws_ok(
  $$
    select *
    from public.crear_negocio(
      'Negocio RUT Basura 0049',
      'negocio-rut-basura-0049',
      'Almacén',
      'abc12.345.678-5xyz',
      null,
      null
    )
  $$,
  '23514',
  'El RUT del negocio no es válido',
  'crear_negocio rechaza caracteres ajenos al formato RUT'
);

select lives_ok(
  $$
    select *
    from public.crear_negocio(
      'Negocio RUT Válido 0049',
      'negocio-rut-valido-0049',
      'Almacén',
      '12.345.678-5',
      'Negocio creado para validar RUT obligatorio',
      null
    )
  $$,
  'crear_negocio acepta un RUT válido con formato humano'
);

reset role;


-- ============================================================================
-- 5. NORMALIZACION Y PROPIETARIO
-- ============================================================================

select is(
  (
    select rut::text
    from public.negocios
    where slug = 'negocio-rut-valido-0049'
  ),
  '123456785',
  'el RUT se almacena en formato canónico'
);

select ok(
  exists (
    select 1
    from public.miembros_negocio as miembro
    join public.negocios as negocio
      on negocio.id = miembro.negocio_id
    where negocio.slug = 'negocio-rut-valido-0049'
      and miembro.usuario_id =
        '00000000-0000-0000-0000-00000000f491'
      and miembro.rol = 'propietario'
  ),
  'crear_negocio registra al usuario autenticado como propietario'
);


-- ============================================================================
-- 6. RUT UNICO
-- ============================================================================

set local role authenticated;

select throws_ok(
  $$
    select *
    from public.crear_negocio(
      'Segundo Negocio Mismo RUT 0049',
      'segundo-negocio-mismo-rut-0049',
      'Panadería',
      '123456785',
      null,
      null
    )
  $$,
  '23505',
  'Ya existe un negocio registrado con este RUT',
  'crear_negocio entrega un error específico ante RUT duplicado'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.negocios
    where rut = '123456785'
  ),
  1,
  'el intento con RUT duplicado no deja un segundo negocio'
);


select * from finish();

rollback;
