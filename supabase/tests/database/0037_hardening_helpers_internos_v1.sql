begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select plan(18);


-- ============================================================================
-- HELPERS INTERNOS
--
-- Es valido que:
-- A) no existan en este entorno, o
-- B) existan pero anon/authenticated no puedan ejecutarlos.
-- ============================================================================

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and has_function_privilege(
        'anon',
        p.oid,
        'EXECUTE'
      )
  ),
  'anon no ejecuta rls_auto_enable'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      )
  ),
  'authenticated no ejecuta rls_auto_enable'
);


select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'validar_caja_regalones_unica'
      and has_function_privilege(
        'anon',
        p.oid,
        'EXECUTE'
      )
  ),
  'anon no ejecuta validar_caja_regalones_unica'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'validar_caja_regalones_unica'
      and has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      )
  ),
  'authenticated no ejecuta validar_caja_regalones_unica'
);


select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'cerrar_lector_al_cerrar_turno'
      and has_function_privilege(
        'anon',
        p.oid,
        'EXECUTE'
      )
  ),
  'anon no ejecuta cerrar_lector_al_cerrar_turno'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'cerrar_lector_al_cerrar_turno'
      and has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      )
  ),
  'authenticated no ejecuta cerrar_lector_al_cerrar_turno'
);


-- ============================================================================
-- COMPRA POR TELEFONO LEGACY
--
-- La función legacy se conserva internamente, pero ya no está expuesta
-- al cliente Terminal.
-- ============================================================================

select ok(
  not has_function_privilege(
    'anon',
    'public.terminal_crear_solicitud_compra_por_telefono(text,integer,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'compra por teléfono legacy queda cerrada al cliente'
);


-- ============================================================================
-- OPERACIONES PRODUCTIVAS NO SE ROMPEN
-- ============================================================================

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_aprobar_compra(uuid,uuid,uuid,text,text,public.origen_compra)',
    'EXECUTE'
  ),
  'Terminal conserva aprobar compra'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_confirmar_compra_con_canje(uuid,integer,uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'Terminal conserva confirmar canje'
);


-- ============================================================================
-- RLS EN LAS 9 TABLAS CRITICAS
-- ============================================================================

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.cajeros_negocio'::regclass
  ),
  'RLS activo en cajeros_negocio'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.canjes_regis'::regclass
  ),
  'RLS activo en canjes_regis'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.compras'::regclass
  ),
  'RLS activo en compras'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.llaveros_nfc'::regclass
  ),
  'RLS activo en llaveros_nfc'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.movimientos_regis'::regclass
  ),
  'RLS activo en movimientos_regis'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.saldos_regis'::regclass
  ),
  'RLS activo en saldos_regis'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.solicitudes_compra'::regclass
  ),
  'RLS activo en solicitudes_compra'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.terminales'::regclass
  ),
  'RLS activo en terminales'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.turnos_caja'::regclass
  ),
  'RLS activo en turnos_caja'
);


select * from finish();

rollback;