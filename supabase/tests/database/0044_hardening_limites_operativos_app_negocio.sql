begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select no_plan();


-- ============================================================================
-- HARDENING 1D-A
--
-- Intentamos usar una RPC real de App Negocio bajo contextos manipulados:
--
--   - credencial corta
--   - token incorrecto
--   - Terminal de otro negocio
--   - turno cerrado
--   - cajero deshabilitado
--   - cajero ya no asignado
--   - Terminal revocada
--   - caja inactiva
--   - sucursal inactiva
--   - negocio suspendido
--
-- La RPC elegida es terminal_listar_solicitudes_app_negocio porque entra
-- exactamente por validar_turno_terminal_interno y no necesita generar dinero,
-- REGIS ni datos ficticios de compras para comprobar esta frontera.
-- ============================================================================


-- ============================================================================
-- CONTRATO
-- ============================================================================

select has_function(
  'public',
  'terminal_listar_solicitudes_app_negocio',
  array['uuid','uuid','text'],
  'Existe una RPC operativa de App Negocio para probar el límite'
);


select ok(
  has_function_privilege(
    'anon',
    'public.terminal_listar_solicitudes_app_negocio(uuid,uuid,text)',
    'EXECUTE'
  ),
  'La App Negocio puede ejecutar la RPC pública'
);


select ok(
  not has_function_privilege(
    'anon',
    'public.validar_turno_terminal_interno(uuid,uuid,text)',
    'EXECUTE'
  ),
  'anon no puede ejecutar directamente el validador interno de turno'
);


select ok(
  not has_function_privilege(
    'anon',
    'public.validar_credencial_terminal_interna(uuid,text)',
    'EXECUTE'
  ),
  'anon no puede ejecutar directamente el validador interno de Terminal'
);


-- ============================================================================
-- NEGOCIO A
-- ============================================================================

insert into public.negocios (
  id,
  nombre,
  slug,
  rut,
  rubro,
  estado
)
values (
  'd1100000-0000-4000-8000-000000000044',
  'Negocio Seguridad A 0044',
  'negocio-seguridad-a-0044',
  '99999993K',
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
  'd1200000-0000-4000-8000-000000000044',
  'd1100000-0000-4000-8000-000000000044',
  'Sucursal Seguridad A',
  'Dirección Seguridad A',
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
  'd1300000-0000-4000-8000-000000000044',
  'd1200000-0000-4000-8000-000000000044',
  'Caja Seguridad A',
  'SEG-A-0044',
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
  'd1400000-0000-4000-8000-000000000044',
  'd1300000-0000-4000-8000-000000000044',
  'TERMINAL-SEGURIDAD-A-0044',

  encode(
    extensions.digest(
      convert_to(
        'terminal-seguridad-a-0044-credencial-valida',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),

  'Terminal Seguridad A',
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
  'd1500000-0000-4000-8000-000000000044',
  'd1100000-0000-4000-8000-000000000044',
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
  'd1500000-0000-4000-8000-000000000044',
  'd1200000-0000-4000-8000-000000000044'
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
  'd1600000-0000-4000-8000-000000000044',
  'd1400000-0000-4000-8000-000000000044',
  'd1300000-0000-4000-8000-000000000044',
  'd1100000-0000-4000-8000-000000000044',
  'Cajera Seguridad',
  'd1500000-0000-4000-8000-000000000044',
  'abierto'
);


-- ============================================================================
-- NEGOCIO B
--
-- Segunda Terminal real con credencial válida.
-- Se usa para intentar mezclar:
--
--   turno del negocio A + Terminal del negocio B
-- ============================================================================

insert into public.negocios (
  id,
  nombre,
  slug,
  rut,
  rubro,
  estado
)
values (
  'd2100000-0000-4000-8000-000000000044',
  'Negocio Seguridad B 0044',
  'negocio-seguridad-b-0044',
  '999999921',
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
  'd2200000-0000-4000-8000-000000000044',
  'd2100000-0000-4000-8000-000000000044',
  'Sucursal Seguridad B',
  'Dirección Seguridad B',
  'Coquimbo',
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
  'd2300000-0000-4000-8000-000000000044',
  'd2200000-0000-4000-8000-000000000044',
  'Caja Seguridad B',
  'SEG-B-0044',
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
  'd2400000-0000-4000-8000-000000000044',
  'd2300000-0000-4000-8000-000000000044',
  'TERMINAL-SEGURIDAD-B-0044',

  encode(
    extensions.digest(
      convert_to(
        'terminal-seguridad-b-0044-credencial-valida',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),

  'Terminal Seguridad B',
  'activa'
);


-- ============================================================================
-- CONTROL: TODO CORRECTO
-- ============================================================================

set local role anon;


select lives_ok(
  $$
    select *
    from public.terminal_listar_solicitudes_app_negocio(
      'd1600000-0000-4000-8000-000000000044',
      'd1400000-0000-4000-8000-000000000044',
      'terminal-seguridad-a-0044-credencial-valida'
    )
  $$,
  'Una Terminal válida con turno y cajero activos funciona normalmente'
);


-- ============================================================================
-- ATAQUE 1: TOKEN DEMASIADO CORTO
-- ============================================================================

select throws_ok(
  $$
    select *
    from public.terminal_listar_solicitudes_app_negocio(
      'd1600000-0000-4000-8000-000000000044',
      'd1400000-0000-4000-8000-000000000044',
      'token-corto'
    )
  $$,
  '42501',
  'La credencial de la Terminal PWA no es válida',
  'Un token corto no puede hacerse pasar por la Terminal'
);


-- ============================================================================
-- ATAQUE 2: TOKEN LARGO PERO INCORRECTO
-- ============================================================================

select throws_ok(
  $$
    select *
    from public.terminal_listar_solicitudes_app_negocio(
      'd1600000-0000-4000-8000-000000000044',
      'd1400000-0000-4000-8000-000000000044',
      'terminal-seguridad-a-0044-token-falso-largo'
    )
  $$,
  '42501',
  'La Terminal no existe, fue revocada o su credencial no es válida',
  'Conocer terminal_id sin conocer su token no autoriza operaciones'
);


-- ============================================================================
-- ATAQUE 3: TERMINAL DE OTRO NEGOCIO + TURNO A
-- ============================================================================

select throws_ok(
  $$
    select *
    from public.terminal_listar_solicitudes_app_negocio(
      'd1600000-0000-4000-8000-000000000044',
      'd2400000-0000-4000-8000-000000000044',
      'terminal-seguridad-b-0044-credencial-valida'
    )
  $$,
  '42501',
  'Debes iniciar un turno válido en esta Terminal',
  'Una Terminal válida de otro negocio no puede reutilizar el turno A'
);


reset role;


-- ============================================================================
-- ATAQUE 4: TURNO CERRADO
-- ============================================================================

update public.turnos_caja
set
  estado = 'cerrado',
  cerrado_en = clock_timestamp()
where id =
  'd1600000-0000-4000-8000-000000000044';


set local role anon;


select throws_ok(
  $$
    select *
    from public.terminal_listar_solicitudes_app_negocio(
      'd1600000-0000-4000-8000-000000000044',
      'd1400000-0000-4000-8000-000000000044',
      'terminal-seguridad-a-0044-credencial-valida'
    )
  $$,
  '42501',
  'Debes iniciar un turno válido en esta Terminal',
  'F12 no puede seguir operando después de cerrar el turno'
);


reset role;


update public.turnos_caja
set
  estado = 'abierto',
  cerrado_en = null
where id =
  'd1600000-0000-4000-8000-000000000044';


-- ============================================================================
-- ATAQUE 5: CAJERO DESHABILITADO DURANTE EL TURNO
-- ============================================================================

update public.cajeros_negocio
set estado = 'inactivo'
where id =
  'd1500000-0000-4000-8000-000000000044';


set local role anon;


select throws_ok(
  $$
    select *
    from public.terminal_listar_solicitudes_app_negocio(
      'd1600000-0000-4000-8000-000000000044',
      'd1400000-0000-4000-8000-000000000044',
      'terminal-seguridad-a-0044-credencial-valida'
    )
  $$,
  '42501',
  'El cajero de este turno ya no está habilitado en esta sucursal',
  'Deshabilitar al cajero invalida inmediatamente su capacidad operativa'
);


reset role;


update public.cajeros_negocio
set estado = 'activo'
where id =
  'd1500000-0000-4000-8000-000000000044';


-- ============================================================================
-- ATAQUE 6: CAJERO YA NO ASIGNADO A LA SUCURSAL
-- ============================================================================

delete from public.cajeros_sucursales
where cajero_id =
    'd1500000-0000-4000-8000-000000000044'
  and sucursal_id =
    'd1200000-0000-4000-8000-000000000044';


set local role anon;


select throws_ok(
  $$
    select *
    from public.terminal_listar_solicitudes_app_negocio(
      'd1600000-0000-4000-8000-000000000044',
      'd1400000-0000-4000-8000-000000000044',
      'terminal-seguridad-a-0044-credencial-valida'
    )
  $$,
  '42501',
  'El cajero de este turno ya no está habilitado en esta sucursal',
  'Un cajero removido de la sucursal pierde acceso incluso con turno abierto'
);


reset role;


insert into public.cajeros_sucursales (
  cajero_id,
  sucursal_id
)
values (
  'd1500000-0000-4000-8000-000000000044',
  'd1200000-0000-4000-8000-000000000044'
);


-- ============================================================================
-- ATAQUE 7: TERMINAL REVOCADA
-- ============================================================================

update public.terminales
set estado = 'revocada'
where id =
  'd1400000-0000-4000-8000-000000000044';


set local role anon;


select throws_ok(
  $$
    select *
    from public.terminal_listar_solicitudes_app_negocio(
      'd1600000-0000-4000-8000-000000000044',
      'd1400000-0000-4000-8000-000000000044',
      'terminal-seguridad-a-0044-credencial-valida'
    )
  $$,
  '42501',
  'La Terminal no existe, fue revocada o su credencial no es válida',
  'Una Terminal revocada deja de operar aunque conserve su token'
);


reset role;


update public.terminales
set estado = 'activa'
where id =
  'd1400000-0000-4000-8000-000000000044';


-- ============================================================================
-- ATAQUE 8: CAJA INACTIVA
-- ============================================================================

update public.cajas
set estado = 'inactiva'
where id =
  'd1300000-0000-4000-8000-000000000044';


set local role anon;


select throws_ok(
  $$
    select *
    from public.terminal_listar_solicitudes_app_negocio(
      'd1600000-0000-4000-8000-000000000044',
      'd1400000-0000-4000-8000-000000000044',
      'terminal-seguridad-a-0044-credencial-valida'
    )
  $$,
  '42501',
  'La Terminal no existe, fue revocada o su credencial no es válida',
  'Una caja inactiva invalida el contexto operativo de la Terminal'
);


reset role;


update public.cajas
set estado = 'activa'
where id =
  'd1300000-0000-4000-8000-000000000044';


-- ============================================================================
-- ATAQUE 9: SUCURSAL INACTIVA
-- ============================================================================

update public.sucursales
set estado = 'inactiva'
where id =
  'd1200000-0000-4000-8000-000000000044';


set local role anon;


select throws_ok(
  $$
    select *
    from public.terminal_listar_solicitudes_app_negocio(
      'd1600000-0000-4000-8000-000000000044',
      'd1400000-0000-4000-8000-000000000044',
      'terminal-seguridad-a-0044-credencial-valida'
    )
  $$,
  '42501',
  'La Terminal no existe, fue revocada o su credencial no es válida',
  'Una sucursal inactiva bloquea sus Terminales'
);


reset role;


update public.sucursales
set estado = 'activa'
where id =
  'd1200000-0000-4000-8000-000000000044';


-- ============================================================================
-- ATAQUE 10: NEGOCIO SUSPENDIDO
-- ============================================================================

update public.negocios
set estado = 'suspendido'
where id =
  'd1100000-0000-4000-8000-000000000044';


set local role anon;


select throws_ok(
  $$
    select *
    from public.terminal_listar_solicitudes_app_negocio(
      'd1600000-0000-4000-8000-000000000044',
      'd1400000-0000-4000-8000-000000000044',
      'terminal-seguridad-a-0044-credencial-valida'
    )
  $$,
  '42501',
  'La Terminal no existe, fue revocada o su credencial no es válida',
  'Suspender el negocio bloquea inmediatamente la Terminal'
);


reset role;


update public.negocios
set estado = 'activo'
where id =
  'd1100000-0000-4000-8000-000000000044';


-- ============================================================================
-- CONTROL FINAL
--
-- Restauramos todos los estados y comprobamos que los ataques anteriores no
-- dejaron dañado el contexto válido.
-- ============================================================================

set local role anon;


select lives_ok(
  $$
    select *
    from public.terminal_listar_solicitudes_app_negocio(
      'd1600000-0000-4000-8000-000000000044',
      'd1400000-0000-4000-8000-000000000044',
      'terminal-seguridad-a-0044-credencial-valida'
    )
  $$,
  'Después de restaurar el contexto, la operación legítima vuelve a funcionar'
);


reset role;


select * from finish();

rollback;