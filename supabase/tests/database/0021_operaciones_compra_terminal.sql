begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

-- ============================================================================
-- CONTRATO DE API
-- ============================================================================

select has_function(
  'public',
  'validar_turno_terminal_interno',
  array['uuid', 'uuid', 'text'],
  'Existe el validador interno de turno'
);

select has_function(
  'public',
  'obtener_solicitud_terminal_interna',
  array['uuid', 'uuid', 'uuid', 'text'],
  'Existe el resolvedor interno de solicitudes'
);

select has_function(
  'public',
  'terminal_informar_monto',
  array['uuid', 'integer', 'uuid', 'uuid', 'text'],
  'La Terminal puede informar montos'
);

select has_function(
  'public',
  'terminal_corregir_monto',
  array['uuid', 'integer', 'text', 'uuid', 'uuid', 'text'],
  'La Terminal puede corregir montos'
);

select has_function(
  'public',
  'terminal_solicitar_reingreso_monto',
  array['uuid', 'text', 'uuid', 'uuid', 'text'],
  'La Terminal puede pedir reingreso de monto'
);

select has_function(
  'public',
  'terminal_rechazar_compra',
  array['uuid', 'text', 'uuid', 'uuid', 'text'],
  'La Terminal puede rechazar solicitudes'
);

select has_function(
  'public',
  'terminal_aprobar_compra',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'origen_compra'],
  'La Terminal puede aprobar compras'
);


-- ============================================================================
-- TRAZABILIDAD
-- ============================================================================

select is(
  (
    select column_name::text
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'compras'
      and column_name = 'turno_caja_id'
  ),
  'turno_caja_id',
  'Las compras conservan el turno de caja'
);

select is(
  (
    select is_nullable::text
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'compras'
      and column_name = 'cajero_id'
  ),
  'YES',
  'cajero_id puede ser null cuando la identidad humana proviene del turno'
);


-- ============================================================================
-- SEGURIDAD
-- ============================================================================

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_informar_monto(uuid,integer,uuid,uuid,text)',
    'EXECUTE'
  ),
  'La Terminal puede informar monto con su credencial física'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_corregir_monto(uuid,integer,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'La Terminal puede corregir monto con su credencial física'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_rechazar_compra(uuid,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'La Terminal puede rechazar desde un turno válido'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_aprobar_compra(uuid,uuid,uuid,text,text,origen_compra)',
    'EXECUTE'
  ),
  'La Terminal puede aprobar desde un turno válido'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.validar_turno_terminal_interno(uuid,uuid,text)',
    'EXECUTE'
  ),
  'El validador de turnos permanece interno'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.obtener_solicitud_terminal_interna(uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  'El resolvedor de solicitudes permanece interno'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.compras',
    'SELECT'
  ),
  'La Terminal sigue sin acceso directo a compras'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.solicitudes_compra',
    'SELECT'
  ),
  'La Terminal sigue sin acceso directo a solicitudes'
);

select * from finish();

rollback;