begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

-- ---------------------------------------------------------------------------
-- Contrato estructural
-- ---------------------------------------------------------------------------

select has_table(
  'public',
  'turnos_caja',
  'Existe la tabla de turnos de caja'
);

select has_column(
  'public',
  'solicitudes_compra',
  'turno_caja_id',
  'Las solicitudes registran el turno'
);

select has_column(
  'public',
  'compras',
  'turno_caja_id',
  'Las compras registran el turno'
);

select has_column(
  'public',
  'canjes_regis',
  'turno_caja_id',
  'Los canjes registran el turno'
);

select has_function(
  'public',
  'iniciar_turno_terminal',
  array['uuid', 'text', 'text'],
  'La Terminal PWA puede iniciar un turno'
);

select has_function(
  'public',
  'consultar_turno_terminal',
  array['uuid', 'text'],
  'La Terminal PWA puede consultar el turno'
);

select has_function(
  'public',
  'cerrar_turno_terminal',
  array['uuid', 'uuid', 'text'],
  'La Terminal PWA puede cerrar el turno'
);

select has_function(
  'public',
  'aprobar_compra_en_turno',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'origen_compra'],
  'La aprobación puede quedar asociada a un turno'
);

select has_function(
  'public',
  'rechazar_solicitud_compra_en_turno',
  array['uuid', 'text', 'uuid', 'uuid', 'text'],
  'El rechazo puede quedar asociado a un turno'
);

select has_function(
  'public',
  'confirmar_compra_con_canje_en_turno',
  array['uuid', 'uuid', 'integer', 'uuid', 'uuid', 'text', 'text', 'text'],
  'El canje puede quedar asociado a un turno'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.iniciar_turno_terminal(uuid,text,text)',
    'EXECUTE'
  ),
  'Una sesión autenticada puede iniciar turno usando la credencial de terminal'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.iniciar_turno_terminal(uuid,text,text)',
    'EXECUTE'
  ),
  'Un usuario anónimo no puede iniciar turnos'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.aprobar_compra_en_turno(uuid,uuid,uuid,text,text,public.origen_compra)',
    'EXECUTE'
  ),
  'Una sesión autenticada puede usar la aprobación protegida por turno'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.aprobar_compra_en_turno(uuid,uuid,uuid,text,text,public.origen_compra)',
    'EXECUTE'
  ),
  'Un anónimo no puede aprobar compras desde la terminal'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'turnos_caja_terminal_abierto_unico'
  ),
  'Solo puede existir un turno abierto por terminal'
);

select col_is_null(
  'public',
  'compras',
  'turno_caja_id',
  'El turno es opcional para conservar el historial anterior'
);

-- ---------------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000f181',
    'propietario-turnos@pruebas.local',
    '{"nombre":"Propietario Turnos"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f182',
    'vecino-turnos@pruebas.local',
    '{"nombre":"Vecino","apellido":"Turnos"}'::jsonb
  );

insert into public.negocios (id, nombre, slug, rubro, estado)
values (
  '81000000-0000-4000-8000-000000000181',
  'Negocio Turnos',
  'negocio-turnos',
  'Almacén',
  'activo'
);

insert into public.miembros_negocio (
  negocio_id,
  usuario_id,
  rol,
  estado
)
values (
  '81000000-0000-4000-8000-000000000181',
  '00000000-0000-0000-0000-00000000f181',
  'propietario',
  'activo'
);

insert into public.sucursales (
  id,
  negocio_id,
  nombre,
  direccion,
  comuna,
  estado
)
values (
  '82000000-0000-4000-8000-000000000181',
  '81000000-0000-4000-8000-000000000181',
  'Sucursal Turnos',
  'Calle Turnos 181',
  'Santiago',
  'activa'
);

insert into public.cajas (
  id,
  sucursal_id,
  nombre,
  codigo,
  estado
)
values (
  '83000000-0000-4000-8000-000000000181',
  '82000000-0000-4000-8000-000000000181',
  'Caja Turnos 01',
  'CAJA-TURNOS-01',
  'activa'
);

insert into public.terminales (
  id,
  caja_id,
  identificador_publico,
  token_hash,
  nombre_dispositivo,
  estado
)
values (
  '84000000-0000-4000-8000-000000000181',
  '83000000-0000-4000-8000-000000000181',
  'TERMINAL-TURNOS-01',
  encode(
    extensions.digest(
      convert_to('terminal-turnos-credencial-segura-001', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'Terminal Turnos 01',
  'activa'
);

insert into public.etiquetas_nfc (
  id,
  tipo,
  token_hash,
  negocio_id,
  sucursal_id,
  caja_id,
  estado,
  instalado_en
)
values (
  '85000000-0000-4000-8000-000000000181',
  'compra',
  encode(
    extensions.digest(
      convert_to('etiqueta-turnos-compra-001', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  '81000000-0000-4000-8000-000000000181',
  '82000000-0000-4000-8000-000000000181',
  '83000000-0000-4000-8000-000000000181',
  'activa',
  now()
);

-- ---------------------------------------------------------------------------
-- Inicio del turno
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f181';

select throws_ok(
  $$
    select *
    from public.iniciar_turno_terminal(
      '84000000-0000-4000-8000-000000000181',
      'terminal-turnos-credencial-segura-001',
      ' '
    )
  $$,
  '22023',
  'Escribe el nombre de quien inicia el turno',
  'No se puede iniciar un turno sin nombre de cajero'
);

select throws_ok(
  $$
    select *
    from public.iniciar_turno_terminal(
      '84000000-0000-4000-8000-000000000181',
      'credencial-incorrecta',
      'María González'
    )
  $$,
  '42501',
  'La credencial de la Terminal PWA no es válida',
  'Una credencial de terminal incorrecta no puede iniciar turno'
);

select lives_ok(
  $$
    select *
    from public.iniciar_turno_terminal(
      '84000000-0000-4000-8000-000000000181',
      'terminal-turnos-credencial-segura-001',
      '  María González  '
    )
  $$,
  'La terminal inicia un turno con el nombre del cajero'
);

do $$
declare
  v_turno_id uuid;
begin
  select turno.turno_id
  into v_turno_id
  from public.iniciar_turno_terminal(
    '84000000-0000-4000-8000-000000000181',
    'terminal-turnos-credencial-segura-001',
    'María González'
  ) as turno;

  perform set_config('prueba.turno_id', v_turno_id::text, true);
end;
$$;

select is(
  (
    select count(*)
    from public.turnos_caja
    where terminal_id = '84000000-0000-4000-8000-000000000181'
      and estado = 'abierto'
  ),
  1::bigint,
  'Existe un solo turno abierto para la terminal'
);

select is(
  (
    select nombre_cajero::text
    from public.turnos_caja
    where id = current_setting('prueba.turno_id')::uuid
  ),
  'María González',
  'El nombre del cajero se guarda limpio, sin espacios sobrantes'
);

select is(
  (
    select caja_id
    from public.turnos_caja
    where id = current_setting('prueba.turno_id')::uuid
  ),
  '83000000-0000-4000-8000-000000000181'::uuid,
  'El turno queda asociado a la caja de la terminal'
);

select is(
  (
    select negocio_id
    from public.turnos_caja
    where id = current_setting('prueba.turno_id')::uuid
  ),
  '81000000-0000-4000-8000-000000000181'::uuid,
  'El turno queda asociado al negocio correcto'
);

select is(
  (
    select turno_id
    from public.consultar_turno_terminal(
      '84000000-0000-4000-8000-000000000181',
      'terminal-turnos-credencial-segura-001'
    )
  ),
  current_setting('prueba.turno_id')::uuid,
  'La terminal puede recuperar su turno abierto'
);

select lives_ok(
  $$
    select *
    from public.iniciar_turno_terminal(
      '84000000-0000-4000-8000-000000000181',
      'terminal-turnos-credencial-segura-001',
      'María González'
    )
  $$,
  'Repetir el inicio con el mismo nombre recupera el turno existente'
);

select is(
  (
    select count(*)
    from public.turnos_caja
    where terminal_id = '84000000-0000-4000-8000-000000000181'
      and estado = 'abierto'
  ),
  1::bigint,
  'Reintentar el inicio no duplica el turno'
);

select throws_ok(
  $$
    select *
    from public.iniciar_turno_terminal(
      '84000000-0000-4000-8000-000000000181',
      'terminal-turnos-credencial-segura-001',
      'Pedro Soto'
    )
  $$,
  '23514',
  'Ya hay un turno abierto por María González. Ciérralo antes de iniciar otro',
  'Otro cajero no puede reemplazar un turno que sigue abierto'
);

-- ---------------------------------------------------------------------------
-- Una compra real debe quedar asociada al turno
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f182';

select lives_ok(
  $$
    select public.crear_solicitud_compra(
      'etiqueta-turnos-compra-001',
      'solicitud-turnos-compra-001',
      now() + interval '10 minutes',
      12990
    )
  $$,
  'El vecino crea una solicitud de compra para la caja del turno'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f181';

do $$
begin
  perform set_config(
    'prueba.solicitud_id',
    (
      select id::text
      from public.solicitudes_compra
      where idempotency_key = 'solicitud-turnos-compra-001'
    ),
    true
  );
end;
$$;

select lives_ok(
  format(
    'select public.aprobar_compra_en_turno(%L::uuid,%L::uuid,%L::uuid,%L)',
    current_setting('prueba.solicitud_id'),
    current_setting('prueba.turno_id'),
    '84000000-0000-4000-8000-000000000181',
    'terminal-turnos-credencial-segura-001'
  ),
  'La compra se aprueba usando un turno abierto y una terminal válida'
);

select is(
  (
    select turno_caja_id
    from public.solicitudes_compra
    where id = current_setting('prueba.solicitud_id')::uuid
  ),
  current_setting('prueba.turno_id')::uuid,
  'La solicitud conserva el turno que la aprobó'
);

select is(
  (
    select compra.turno_caja_id
    from public.compras as compra
    where compra.solicitud_id = current_setting('prueba.solicitud_id')::uuid
  ),
  current_setting('prueba.turno_id')::uuid,
  'La compra queda asociada al turno del cajero'
);

select is(
  (
    select compra.monto_final
    from public.compras as compra
    where compra.solicitud_id = current_setting('prueba.solicitud_id')::uuid
  ),
  12990,
  'La aprobación por turno conserva el monto real de la compra'
);

select ok(
  (
    select ultima_actividad_en >= iniciado_en
    from public.turnos_caja
    where id = current_setting('prueba.turno_id')::uuid
  ),
  'La actividad de compra actualiza la actividad del turno'
);

-- ---------------------------------------------------------------------------
-- Aislamiento RLS del turno
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f182';

select is(
  (
    select count(*)
    from public.turnos_caja
    where id = current_setting('prueba.turno_id')::uuid
  ),
  0::bigint,
  'Un vecino no puede leer el turno interno del comercio'
);

-- ---------------------------------------------------------------------------
-- Cierre del turno
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f181';

select throws_ok(
  format(
    'select public.cerrar_turno_terminal(%L::uuid,%L::uuid,%L)',
    current_setting('prueba.turno_id'),
    '84000000-0000-4000-8000-000000000181',
    'credencial-incorrecta'
  ),
  '42501',
  'La credencial de la Terminal PWA no es válida',
  'Una credencial incorrecta no puede cerrar el turno'
);

select lives_ok(
  format(
    'select public.cerrar_turno_terminal(%L::uuid,%L::uuid,%L)',
    current_setting('prueba.turno_id'),
    '84000000-0000-4000-8000-000000000181',
    'terminal-turnos-credencial-segura-001'
  ),
  'La terminal puede cerrar el turno actual'
);

select is(
  (
    select estado::text
    from public.turnos_caja
    where id = current_setting('prueba.turno_id')::uuid
  ),
  'cerrado',
  'El turno cambia a estado cerrado'
);

select ok(
  (
    select cerrado_en is not null
    from public.turnos_caja
    where id = current_setting('prueba.turno_id')::uuid
  ),
  'El cierre registra fecha y hora'
);

select is(
  (
    select count(*)
    from public.consultar_turno_terminal(
      '84000000-0000-4000-8000-000000000181',
      'terminal-turnos-credencial-segura-001'
    )
  ),
  0::bigint,
  'Después de cerrar no existe un turno activo para consultar'
);

select throws_ok(
  format(
    'select public.cerrar_turno_terminal(%L::uuid,%L::uuid,%L)',
    current_setting('prueba.turno_id'),
    '84000000-0000-4000-8000-000000000181',
    'terminal-turnos-credencial-segura-001'
  ),
  'P0002',
  'El turno no existe o ya fue cerrado',
  'Un turno no puede cerrarse dos veces'
);

select lives_ok(
  $$
    select *
    from public.iniciar_turno_terminal(
      '84000000-0000-4000-8000-000000000181',
      'terminal-turnos-credencial-segura-001',
      'Pedro Soto'
    )
  $$,
  'Después del cierre otro cajero puede iniciar un nuevo turno'
);

select is(
  (
    select count(*)
    from public.turnos_caja
    where terminal_id = '84000000-0000-4000-8000-000000000181'
      and estado = 'abierto'
      and nombre_cajero = 'Pedro Soto'
  ),
  1::bigint,
  'El siguiente cajero queda correctamente a cargo de la caja'
);

select * from finish();
rollback;