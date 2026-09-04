begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_column(
  'public',
  'llaveros_nfc',
  'turno_caja_activacion_id',
  'Los llaveros registran el turno de activación'
);

select has_function(
  'public',
  'terminal_consultar_llavero',
  array['text', 'uuid', 'uuid', 'text'],
  'Existe la consulta de llavero para Terminal'
);

select has_function(
  'public',
  'terminal_consultar_saldo_llavero',
  array['text', 'uuid', 'uuid', 'text'],
  'Existe la consulta de saldo de llavero para Terminal'
);

select has_function(
  'public',
  'terminal_activar_llavero',
  array[
    'text',
    'metodo_verificacion_llavero',
    'text',
    'boolean',
    'uuid',
    'uuid',
    'text'
  ],
  'Existe la activación de llavero para Terminal'
);

select has_function(
  'public',
  'terminal_crear_compra_asistida',
  array['text', 'integer', 'text', 'uuid', 'uuid', 'text'],
  'Existe la compra asistida manual para Terminal'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_consultar_llavero(text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'La Terminal puede consultar llaveros sin login diario'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_consultar_saldo_llavero(text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'La Terminal puede consultar saldo sin login diario'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_activar_llavero(text,metodo_verificacion_llavero,text,boolean,uuid,uuid,text)',
    'EXECUTE'
  ),
  'La Terminal puede activar llaveros con su credencial física'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_crear_compra_asistida(text,integer,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'La Terminal puede crear compras asistidas con su credencial física'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.llaveros_nfc',
    'SELECT'
  ),
  'La Terminal no obtiene acceso directo a llaveros_nfc'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.saldos_regis',
    'SELECT'
  ),
  'La Terminal no obtiene acceso directo a saldos_regis'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.validar_turno_activacion_llavero()',
    'EXECUTE'
  ),
  'El validador de auditoría permanece interno'
);

select throws_ok(
  $$
    select *
    from public.terminal_consultar_llavero(
      'LLAVERO-DE-PRUEBA',
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      'token-terminal-invalido-de-prueba-123456789'
    )
  $$,
  '42501',
  null,
  'Una Terminal inválida no puede consultar llaveros'
);

select * from finish();

rollback;