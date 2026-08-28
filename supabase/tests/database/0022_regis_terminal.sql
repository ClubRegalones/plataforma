begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_function(
  'public',
  'terminal_obtener_regla_acumulacion',
  array['uuid', 'uuid', 'text'],
  'Existe la consulta REGIS exclusiva de Terminal'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_obtener_regla_acumulacion(uuid,uuid,text)',
    'EXECUTE'
  ),
  'La Terminal puede consultar su regla REGIS con credencial física'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.terminal_obtener_regla_acumulacion(uuid,uuid,text)',
    'EXECUTE'
  ),
  'La RPC también funciona durante procesos autenticados de configuración'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.reglas_regis',
    'SELECT'
  ),
  'La Terminal no obtiene acceso directo a reglas_regis'
);

select throws_ok(
  $$
    select public.terminal_obtener_regla_acumulacion(
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      'token-terminal-invalido-de-prueba-123456789'
    )
  $$,
  '42501',
  null,
  'Una credencial de Terminal inválida no puede consultar reglas REGIS'
);

select is(
  (
    select procedimiento.provolatile::text
    from pg_catalog.pg_proc as procedimiento
    join pg_catalog.pg_namespace as esquema
      on esquema.oid = procedimiento.pronamespace
    where esquema.nspname = 'public'
      and procedimiento.proname = 'terminal_obtener_regla_acumulacion'
      and procedimiento.pronargs = 3
    limit 1
  ),
  'v',
  'La consulta REGIS de Terminal está correctamente declarada VOLATILE'
);

select * from finish();

rollback;