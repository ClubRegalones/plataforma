begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

-- ---------------------------------------------------------------------------
-- Contrato de la API independiente
-- ---------------------------------------------------------------------------

select has_function(
  'public',
  'validar_credencial_terminal_interna',
  array['uuid', 'text'],
  'Existe el validador interno de la credencial física'
);

select has_function(
  'public',
  'terminal_obtener_contexto',
  array['uuid', 'text', 'text'],
  'La Terminal puede resolver oficialmente negocio, sucursal y caja'
);

select has_function(
  'public',
  'terminal_iniciar_turno',
  array['uuid', 'text', 'text'],
  'La API independiente puede iniciar turnos'
);

select has_function(
  'public',
  'terminal_consultar_turno',
  array['uuid', 'text'],
  'La API independiente puede consultar el turno activo'
);

select has_function(
  'public',
  'terminal_cerrar_turno',
  array['uuid', 'uuid', 'text'],
  'La API independiente puede cerrar turnos'
);

select has_function(
  'public',
  'terminal_listar_solicitudes',
  array['uuid', 'text', 'uuid'],
  'La Terminal puede listar únicamente las solicitudes de su caja'
);


-- ---------------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_obtener_contexto(uuid,text,text)',
    'EXECUTE'
  ),
  'La Terminal sin sesión diaria puede obtener su contexto mediante su secreto'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_iniciar_turno(uuid,text,text)',
    'EXECUTE'
  ),
  'La Terminal puede iniciar turno sin login diario'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_listar_solicitudes(uuid,text,uuid)',
    'EXECUTE'
  ),
  'La Terminal puede consultar su cola mediante la API limitada'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.validar_credencial_terminal_interna(uuid,text)',
    'EXECUTE'
  ),
  'El validador interno no está expuesto directamente'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.solicitudes_compra',
    'SELECT'
  ),
  'La Terminal no recibe acceso directo a solicitudes_compra'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.terminales',
    'SELECT'
  ),
  'La Terminal no recibe acceso directo a la tabla terminales'
);


select * from finish();

rollback;