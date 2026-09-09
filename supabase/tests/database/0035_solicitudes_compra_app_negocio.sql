begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(3);

select has_function(
  'public',
  'terminal_listar_solicitudes_app_negocio',
  array['uuid', 'uuid', 'text']
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_listar_solicitudes_app_negocio(uuid,uuid,text)',
    'EXECUTE'
  ),
  'App Negocio puede listar solicitudes enriquecidas'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.terminal_listar_solicitudes_app_negocio(uuid,uuid,text)',
    'EXECUTE'
  ),
  'Authenticated puede ejecutar el listado enriquecido'
);

select * from finish();

rollback;