begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select ok(
  to_regclass('public.cajeros_negocio') is not null,
  'Existe cajeros_negocio'
);
select ok(
  to_regclass('public.cajeros_sucursales') is not null,
  'Existe cajeros_sucursales'
);
select ok(
  to_regprocedure('public.negocio_iniciar_turno(uuid,text,uuid,text)') is not null,
  'Existe negocio_iniciar_turno'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-00000000f030',
  'propietario-app-negocio@pruebas.local',
  '{"nombre":"Propietario App Negocio"}'::jsonb
);

insert into public.negocios (id, nombre, slug, rut, rubro, estado)
values (
  '61000000-0000-0000-0000-00000000f030',
  'Negocio App Móvil',
  'negocio-app-movil',
  '99999993K',
  'Almacén',
  'activo'
);

insert into public.sucursales (
  id, negocio_id, nombre, direccion, comuna, estado
) values (
  '62000000-0000-0000-0000-00000000f030',
  '61000000-0000-0000-0000-00000000f030',
  'Sucursal Piloto',
  'Calle Piloto 3030',
  'La Serena',
  'activa'
);

insert into public.cajas (id, sucursal_id, nombre, codigo, estado)
values (
  '63000000-0000-0000-0000-00000000f030',
  '62000000-0000-0000-0000-00000000f030',
  'Caja Regalones',
  'REGALONES',
  'activa'
);

insert into public.miembros_negocio (
  negocio_id, usuario_id, rol, estado
) values (
  '61000000-0000-0000-0000-00000000f030',
  '00000000-0000-0000-0000-00000000f030',
  'propietario',
  'activo'
);

insert into public.terminales (
  id,
  caja_id,
  identificador_publico,
  token_hash,
  nombre_dispositivo,
  version_app,
  estado
) values (
  '64000000-0000-0000-0000-00000000f030',
  '63000000-0000-0000-0000-00000000f030',
  'APP-NEGOCIO-PILOTO-0030',
  encode(
    extensions.digest(
      convert_to('regalones-app-negocio-token-prueba-0030-seguro', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'Teléfono piloto',
  '1.0.0',
  'activa'
);

set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000f030';

select set_config(
  'prueba.cajero_app_id',
  (
    select cajero.id::text
    from public.crear_cajero_negocio(
      '61000000-0000-0000-0000-00000000f030',
      'Fernanda',
      'Piloto',
      '2468',
      array['62000000-0000-0000-0000-00000000f030'::uuid],
      'cajero'
    ) as cajero
  ),
  true
);

reset role;

select is(
  (
    select count(*)
    from public.cajeros_sucursales
    where cajero_id = current_setting('prueba.cajero_app_id')::uuid
      and sucursal_id = '62000000-0000-0000-0000-00000000f030'
  ),
  1::bigint,
  'El cajero queda asignado a la sucursal piloto'
);

set local role anon;

select is(
  (
    select count(*)
    from public.negocio_listar_cajeros_dispositivo(
      '64000000-0000-0000-0000-00000000f030',
      'regalones-app-negocio-token-prueba-0030-seguro'
    )
    where cajero_id = current_setting('prueba.cajero_app_id')::uuid
  ),
  1::bigint,
  'App Negocio lista únicamente cajeros autorizados para su sucursal'
);

select is(
  (
    select autenticado
    from public.negocio_iniciar_turno(
      '64000000-0000-0000-0000-00000000f030',
      'regalones-app-negocio-token-prueba-0030-seguro',
      current_setting('prueba.cajero_app_id')::uuid,
      '9999'
    )
  ),
  false,
  'Un PIN incorrecto no inicia turno'
);

reset role;

select is(
  (
    select intentos_pin_fallidos
    from public.cajeros_negocio
    where id = current_setting('prueba.cajero_app_id')::uuid
  ),
  1::smallint,
  'El intento fallido de PIN queda registrado'
);

set local role anon;

select set_config(
  'prueba.turno_app_id',
  (
    select turno_id::text
    from public.negocio_iniciar_turno(
      '64000000-0000-0000-0000-00000000f030',
      'regalones-app-negocio-token-prueba-0030-seguro',
      current_setting('prueba.cajero_app_id')::uuid,
      '2468'
    )
    where autenticado
  ),
  true
);

reset role;

select is(
  (
    select cajero_negocio_id
    from public.turnos_caja
    where id = current_setting('prueba.turno_app_id')::uuid
  ),
  current_setting('prueba.cajero_app_id')::uuid,
  'El turno queda vinculado al perfil operativo del cajero'
);

select is(
  (
    select nombre_cajero
    from public.turnos_caja
    where id = current_setting('prueba.turno_app_id')::uuid
  ),
  'Fernanda Piloto',
  'El turno conserva también el nombre legible del cajero'
);

select is(
  (
    select intentos_pin_fallidos
    from public.cajeros_negocio
    where id = current_setting('prueba.cajero_app_id')::uuid
  ),
  0::smallint,
  'Un PIN correcto reinicia los intentos fallidos'
);

set local role anon;

select is(
  (
    select cajero_negocio_id
    from public.negocio_consultar_turno(
      '64000000-0000-0000-0000-00000000f030',
      'regalones-app-negocio-token-prueba-0030-seguro'
    )
  ),
  current_setting('prueba.cajero_app_id')::uuid,
  'App Negocio puede recuperar el turno abierto del dispositivo'
);

select lives_ok(
  format(
    'select * from public.terminal_cerrar_turno(%L::uuid, %L::uuid, %L)',
    current_setting('prueba.turno_app_id'),
    '64000000-0000-0000-0000-00000000f030',
    'regalones-app-negocio-token-prueba-0030-seguro'
  ),
  'La API existente de Terminal puede cerrar el turno de App Negocio'
);

select lives_ok(
  $$
    select *
    from public.terminal_iniciar_turno(
      '64000000-0000-0000-0000-00000000f030',
      'regalones-app-negocio-token-prueba-0030-seguro',
      'Cajero Terminal'
    )
  $$,
  'La Terminal PWA tradicional sigue pudiendo iniciar turnos'
);

reset role;

select is(
  (
    select cajero_negocio_id
    from public.turnos_caja
    where terminal_id = '64000000-0000-0000-0000-00000000f030'
      and estado = 'abierto'
  ),
  null::uuid,
  'Los turnos tradicionales de Terminal conservan cajero_negocio_id nulo'
);

select * from finish();
rollback;
