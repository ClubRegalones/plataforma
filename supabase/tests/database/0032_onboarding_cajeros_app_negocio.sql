begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sucursales'
      and column_name = 'modo_identificacion_cajero'
  ),
  'Sucursales define el modo de identificación de cajeros'
);

select ok(
  to_regprocedure('public.negocio_configurar_equipo_inicial(uuid,text,public.modo_identificacion_cajero,jsonb)') is not null,
  'Existe la configuración inicial desde App Negocio'
);

select ok(
  to_regprocedure('public.configurar_modo_identificacion_cajeros(uuid,public.modo_identificacion_cajero)') is not null,
  'Existe el cambio administrado de modo de identificación'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-00000000f032',
  'propietario-onboarding@pruebas.local',
  '{"nombre":"Propietario Onboarding"}'::jsonb
);

insert into public.negocios (id, nombre, slug, rut, rubro, estado)
values (
  '61000000-0000-0000-0000-00000000f032',
  'Negocio Onboarding',
  'negocio-onboarding',
  '99999993K',
  'Almacén',
  'activo'
);

insert into public.sucursales (
  id, negocio_id, nombre, direccion, comuna, estado
) values (
  '62000000-0000-0000-0000-00000000f032',
  '61000000-0000-0000-0000-00000000f032',
  'Sucursal Onboarding',
  'Calle Piloto 3232',
  'La Serena',
  'activa'
);

insert into public.cajas (id, sucursal_id, nombre, codigo, estado)
values (
  '63000000-0000-0000-0000-00000000f032',
  '62000000-0000-0000-0000-00000000f032',
  'Caja Regalones',
  'REGALONES-32',
  'activa'
);

insert into public.miembros_negocio (
  negocio_id, usuario_id, rol, estado
) values (
  '61000000-0000-0000-0000-00000000f032',
  '00000000-0000-0000-0000-00000000f032',
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
  estado,
  creado_en
) values (
  '64000000-0000-0000-0000-00000000f032',
  '63000000-0000-0000-0000-00000000f032',
  'APP-NEGOCIO-ONBOARDING-0032',
  encode(
    extensions.digest(
      convert_to('regalones-onboarding-token-0032-seguro', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'Teléfono onboarding',
  '1.0.0',
  'activa',
  clock_timestamp()
);

set local role anon;

select is(
  (
    select cajeros_creados
    from public.negocio_configurar_equipo_inicial(
      '64000000-0000-0000-0000-00000000f032',
      'regalones-onboarding-token-0032-seguro',
      'solo_nombre',
      '[
        {"id":"65000000-0000-0000-0000-00000000f032","nombre":"Anita","apellido":"Piloto","rol":"supervisor"},
        {"id":"65000000-0000-0000-0000-00000000f033","nombre":"Pedro","rol":"cajero"}
      ]'::jsonb
    )
  ),
  2,
  'La activación inicial crea los cajeros indicados'
);

reset role;

select is(
  (
    select modo_identificacion_cajero::text
    from public.sucursales
    where id = '62000000-0000-0000-0000-00000000f032'
  ),
  'solo_nombre',
  'La sucursal queda configurada en modo solo nombre'
);

select is(
  (
    select count(*)
    from public.cajeros_negocio
    where negocio_id = '61000000-0000-0000-0000-00000000f032'
      and pin_hash is null
  ),
  2::bigint,
  'Los cajeros de modo simple no requieren PIN guardado'
);

set local role anon;

select is(
  (
    select count(*)
    from public.negocio_listar_cajeros_dispositivo(
      '64000000-0000-0000-0000-00000000f032',
      'regalones-onboarding-token-0032-seguro'
    )
    where requiere_pin = false
  ),
  2::bigint,
  'App Negocio informa que esos cajeros no requieren PIN'
);

select is(
  (
    select autenticado
    from public.negocio_iniciar_turno(
      '64000000-0000-0000-0000-00000000f032',
      'regalones-onboarding-token-0032-seguro',
      '65000000-0000-0000-0000-00000000f032',
      ''
    )
  ),
  true,
  'En modo solo nombre el cajero inicia turno sin PIN'
);

reset role;

select is(
  (
    select cajero_negocio_id
    from public.turnos_caja
    where terminal_id = '64000000-0000-0000-0000-00000000f032'
      and estado = 'abierto'
  ),
  '65000000-0000-0000-0000-00000000f032'::uuid,
  'El turno conserva la identidad del cajero aun sin PIN'
);

select * from finish();
rollback;
