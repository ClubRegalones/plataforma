begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select plan(7);


-- ============================================================================
-- FIXTURE
-- ============================================================================

insert into public.negocios (
  id,
  nombre,
  slug,
  rubro,
  estado
)
values (
  '81000000-0000-4000-8000-000000000038',
  'Negocio Seguridad 0038',
  'seguridad-0038',
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
  '82000000-0000-4000-8000-000000000038',
  '81000000-0000-4000-8000-000000000038',
  'Sucursal Seguridad',
  'Dirección Seguridad 38',
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
  '83000000-0000-4000-8000-000000000038',
  '82000000-0000-4000-8000-000000000038',
  'Caja Seguridad',
  'SEG-0038',
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
  '84000000-0000-4000-8000-000000000038',
  '83000000-0000-4000-8000-000000000038',
  'SEGURIDAD-APP-0038',
  encode(
    extensions.digest(
      convert_to(
        'token-seguridad-app-negocio-0038-muy-largo',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'Dispositivo Seguridad',
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
  '85000000-0000-4000-8000-000000000038',
  '81000000-0000-4000-8000-000000000038',
  'Cajera',
  'Segura',
  'cajero',
  null,
  'activo'
);


insert into public.cajeros_sucursales (
  cajero_id,
  sucursal_id
)
values (
  '85000000-0000-4000-8000-000000000038',
  '82000000-0000-4000-8000-000000000038'
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
  '86000000-0000-4000-8000-000000000038',
  '84000000-0000-4000-8000-000000000038',
  '83000000-0000-4000-8000-000000000038',
  '81000000-0000-4000-8000-000000000038',
  'Cajera Segura',
  '85000000-0000-4000-8000-000000000038',
  'abierto'
);


-- ============================================================================
-- 1. APP NEGOCIO: CAJERO ACTIVO + ASIGNADO
-- ============================================================================

select lives_ok(
  $$
    select public.validar_turno_terminal_interno(
      '86000000-0000-4000-8000-000000000038',
      '84000000-0000-4000-8000-000000000038',
      'token-seguridad-app-negocio-0038-muy-largo'
    )
  $$,
  'Turno App Negocio válido funciona con cajero activo y asignado'
);


-- ============================================================================
-- 2. APP NEGOCIO: CAJERO YA NO ASIGNADO
-- ============================================================================

delete from public.cajeros_sucursales
where cajero_id =
  '85000000-0000-4000-8000-000000000038'
and sucursal_id =
  '82000000-0000-4000-8000-000000000038';


select throws_ok(
  $$
    select public.validar_turno_terminal_interno(
      '86000000-0000-4000-8000-000000000038',
      '84000000-0000-4000-8000-000000000038',
      'token-seguridad-app-negocio-0038-muy-largo'
    )
  $$,
  '42501',
  'El cajero de este turno ya no está habilitado en esta sucursal',
  'Una asignación revocada bloquea operaciones del turno App Negocio'
);


-- ============================================================================
-- 3. RESTAURAR ASIGNACION, PERO DESACTIVAR CAJERO
-- ============================================================================

insert into public.cajeros_sucursales (
  cajero_id,
  sucursal_id
)
values (
  '85000000-0000-4000-8000-000000000038',
  '82000000-0000-4000-8000-000000000038'
);


update public.cajeros_negocio
set estado = 'inactivo'
where id =
  '85000000-0000-4000-8000-000000000038';


select throws_ok(
  $$
    select public.validar_turno_terminal_interno(
      '86000000-0000-4000-8000-000000000038',
      '84000000-0000-4000-8000-000000000038',
      'token-seguridad-app-negocio-0038-muy-largo'
    )
  $$,
  '42501',
  'El cajero de este turno ya no está habilitado en esta sucursal',
  'Un cajero inactivo no puede continuar operando App Negocio'
);


-- ============================================================================
-- 4. TERMINAL LEGACY: CAJERO_NEGOCIO_ID NULO SIGUE PERMITIDO
-- ============================================================================

update public.turnos_caja
set
  estado = 'cerrado',
  cerrado_en = clock_timestamp()
where id =
  '86000000-0000-4000-8000-000000000038';


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
  '87000000-0000-4000-8000-000000000038',
  '84000000-0000-4000-8000-000000000038',
  '83000000-0000-4000-8000-000000000038',
  '81000000-0000-4000-8000-000000000038',
  'Terminal Legacy',
  null,
  'abierto'
);


select lives_ok(
  $$
    select public.validar_turno_terminal_interno(
      '87000000-0000-4000-8000-000000000038',
      '84000000-0000-4000-8000-000000000038',
      'token-seguridad-app-negocio-0038-muy-largo'
    )
  $$,
  'Terminal V1 conserva compatibilidad con turno legacy'
);


-- ============================================================================
-- 5. TOKEN INCORRECTO SIGUE BLOQUEADO
-- ============================================================================

select throws_ok(
  $$
    select public.validar_turno_terminal_interno(
      '87000000-0000-4000-8000-000000000038',
      '84000000-0000-4000-8000-000000000038',
      'token-incorrecto-0038-xxxxxxxxxxxxxxxxxxxxxxxx'
    )
  $$,
  '42501',
  'La Terminal no existe, fue revocada o su credencial no es válida',
  'Un token de Terminal incorrecto continúa bloqueado'
);


-- ============================================================================
-- 6. HELPER SIGUE SIN EXPOSICION CLIENTE
-- ============================================================================

select ok(
  not has_function_privilege(
    'anon',
    'public.validar_turno_terminal_interno(uuid,uuid,text)',
    'EXECUTE'
  ),
  'anon no puede ejecutar directamente el helper'
);


select ok(
  not has_function_privilege(
    'authenticated',
    'public.validar_turno_terminal_interno(uuid,uuid,text)',
    'EXECUTE'
  ),
  'authenticated no puede ejecutar directamente el helper'
);


select * from finish();

rollback;