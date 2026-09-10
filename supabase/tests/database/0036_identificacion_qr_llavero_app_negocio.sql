begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select plan(3);

select has_function(
  'public',
  'terminal_identificar_llavero_qr',
  array['text', 'uuid', 'uuid', 'text']
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_identificar_llavero_qr(text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'App Negocio puede identificar QR fisico de llavero'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.terminal_identificar_llavero_qr(text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'Authenticated puede identificar QR fisico de llavero'
);

select * from finish();

rollback;