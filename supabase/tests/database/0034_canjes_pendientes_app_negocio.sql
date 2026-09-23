begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(3);

select has_function(
  'public',
  'terminal_listar_canjes_pendientes',
  array['uuid', 'uuid', 'text', 'integer']
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_listar_canjes_pendientes(uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'App Negocio puede listar canjes pendientes'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.terminal_listar_canjes_pendientes(uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'Authenticated puede ejecutar el RPC'
);

select * from finish();

rollback;