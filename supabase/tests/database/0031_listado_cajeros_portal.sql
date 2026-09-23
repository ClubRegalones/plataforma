begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(3);

select ok(
  to_regprocedure('public.listar_cajeros_negocio_gestion(uuid)') is not null,
  'Existe listar_cajeros_negocio_gestion'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.listar_cajeros_negocio_gestion(uuid)',
    'EXECUTE'
  ),
  'authenticated puede ejecutar listar_cajeros_negocio_gestion'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.listar_cajeros_negocio_gestion(uuid)',
    'EXECUTE'
  ),
  'anon no puede ejecutar listar_cajeros_negocio_gestion'
);

select * from finish();
rollback;
