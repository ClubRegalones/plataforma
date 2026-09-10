begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select plan(10);


-- ============================================================================
-- CONTRATO DE SEGURIDAD
-- ============================================================================

select ok(
  to_regprocedure(
    'public.validar_canje_llavero_app_negocio_interno(public.origen_canje_regis,public.estado_canje_regis,uuid)'
  ) is not null,
  'Existe el guard interno para canje con llavero'
);


select ok(
  exists (
    select 1
    from pg_trigger t
    join pg_class c
      on c.oid = t.tgrelid
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'canjes_regis'
      and t.tgname =
        'canjes_regis_bloquear_llavero_app_negocio_sin_pin'
      and not t.tgisinternal
  ),
  'El bloqueo está instalado directamente en canjes_regis'
);


select ok(
  not has_function_privilege(
    'anon',
    'public.validar_canje_llavero_app_negocio_interno(public.origen_canje_regis,public.estado_canje_regis,uuid)',
    'EXECUTE'
  ),
  'anon no puede ejecutar el guard interno'
);


select ok(
  not has_function_privilege(
    'authenticated',
    'public.validar_canje_llavero_app_negocio_interno(public.origen_canje_regis,public.estado_canje_regis,uuid)',
    'EXECUTE'
  ),
  'authenticated no puede ejecutar el guard interno'
);


-- ============================================================================
-- FIXTURE MINIMA DE TURNO APP NEGOCIO
-- ============================================================================

insert into public.negocios (
  id,
  nombre,
  slug,
  rubro,
  estado
)
values (
  '91000000-0000-4000-8000-000000000039',
  'Negocio Seguridad 0039',
  'seguridad-canje-0039',
  'Almacén',
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
  '92000000-0000-4000-8000-000000000039',
  '91000000-0000-4000-8000-000000000039',
  'Sucursal Seguridad 0039',
  'Dirección Seguridad 39',
  'La Serena',
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
  '93000000-0000-4000-8000-000000000039',
  '92000000-0000-4000-8000-000000000039',
  'Caja Seguridad 0039',
  'SEG-0039',
  'activa'
);


insert into public.terminales (
  id,
  caja_id,
  identificador_publico,
  token_hash,
  nombre_dispositivo,
  version_app,
  estado
)
values (
  '94000000-0000-4000-8000-000000000039',
  '93000000-0000-4000-8000-000000000039',
  'SEGURIDAD-CANJE-0039',
  repeat('a', 64),
  'Dispositivo Seguridad 0039',
  '1.0.0',
  'activa'
);


insert into public.cajeros_negocio (
  id,
  negocio_id,
  nombre,
  apellido,
  rol,
  pin_hash,
  estado
)
values (
  '95000000-0000-4000-8000-000000000039',
  '91000000-0000-4000-8000-000000000039',
  'Cajera',
  'Seguridad',
  'cajero',
  null,
  'activo'
);


insert into public.cajeros_sucursales (
  cajero_id,
  sucursal_id
)
values (
  '95000000-0000-4000-8000-000000000039',
  '92000000-0000-4000-8000-000000000039'
);


insert into public.turnos_caja (
  id,
  terminal_id,
  caja_id,
  negocio_id,
  nombre_cajero,
  cajero_negocio_id,
  estado
)
values (
  '96000000-0000-4000-8000-000000000039',
  '94000000-0000-4000-8000-000000000039',
  '93000000-0000-4000-8000-000000000039',
  '91000000-0000-4000-8000-000000000039',
  'Cajera Seguridad',
  '95000000-0000-4000-8000-000000000039',
  'abierto'
);


-- ============================================================================
-- APP NEGOCIO
-- ============================================================================

select lives_ok(
  $$
    select public.validar_canje_llavero_app_negocio_interno(
      'qr',
      'reservado',
      '96000000-0000-4000-8000-000000000039'
    )
  $$,
  'QR App Vecino sigue permitido dentro de App Negocio'
);


select throws_ok(
  $$
    select public.validar_canje_llavero_app_negocio_interno(
      'llavero',
      'reservado',
      '96000000-0000-4000-8000-000000000039'
    )
  $$,
  '42501',
  'Los canjes con llavero en App Negocio requieren autorización PIN del vecino',
  'App Negocio no puede reservar REGIS con llavero sin PIN'
);


select throws_ok(
  $$
    select public.validar_canje_llavero_app_negocio_interno(
      'llavero',
      'confirmado',
      '96000000-0000-4000-8000-000000000039'
    )
  $$,
  '42501',
  'Los canjes con llavero en App Negocio requieren autorización PIN del vecino',
  'App Negocio no puede confirmar gasto de REGIS con llavero sin PIN'
);


-- Cancelar/expirar debe seguir siendo posible para limpieza.

select lives_ok(
  $$
    select public.validar_canje_llavero_app_negocio_interno(
      'llavero',
      'cancelado',
      '96000000-0000-4000-8000-000000000039'
    )
  $$,
  'Un canje con llavero puede cancelarse aunque pertenezca a App Negocio'
);


-- ============================================================================
-- TERMINAL LEGACY
-- ============================================================================

update public.turnos_caja
set cajero_negocio_id = null
where id =
  '96000000-0000-4000-8000-000000000039';


select lives_ok(
  $$
    select public.validar_canje_llavero_app_negocio_interno(
      'llavero',
      'reservado',
      '96000000-0000-4000-8000-000000000039'
    )
  $$,
  'Terminal legacy conserva reserva de canje con llavero'
);


select lives_ok(
  $$
    select public.validar_canje_llavero_app_negocio_interno(
      'llavero',
      'confirmado',
      '96000000-0000-4000-8000-000000000039'
    )
  $$,
  'Terminal legacy conserva confirmación de canje con llavero'
);


select * from finish();

rollback;