begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select no_plan();


-- ============================================================================
-- CONTRATO
-- ============================================================================

select has_function(
  'public',
  'terminal_consultar_activacion_llavero_app_negocio',
  array['text','uuid','uuid','text'],
  'Existe consulta de activación para App Negocio'
);


select has_function(
  'public',
  'terminal_activar_llavero_app_negocio',
  array['text','text','boolean','uuid','uuid','text'],
  'Existe activación de llavero con PIN'
);


select ok(
  has_function_privilege(
    'anon',
    'public.terminal_activar_llavero_app_negocio(text,text,boolean,uuid,uuid,text)',
    'EXECUTE'
  ),
  'App Negocio puede llamar la activación con su credencial de Terminal'
);


select ok(
  not has_function_privilege(
    'anon',
    'public.validar_activacion_llavero_app_negocio_interna()',
    'EXECUTE'
  ),
  'El guard interno no se expone a anon'
);


select ok(
  not has_function_privilege(
    'authenticated',
    'public.validar_activacion_llavero_app_negocio_interna()',
    'EXECUTE'
  ),
  'El guard interno tampoco se expone a authenticated'
);


-- ============================================================================
-- USUARIOS
-- Los perfiles son creados automáticamente por el trigger de auth.users.
-- ============================================================================

insert into auth.users (
  id,
  email,
  raw_user_meta_data
)
values
(
  '00000000-0000-0000-0000-00000000f421',
  'vecino-activacion-pin@pruebas.local',
  '{"nombre":"Vecina","apellido":"Activación"}'::jsonb
),
(
  '00000000-0000-0000-0000-00000000f422',
  'vecino-bypass-activacion@pruebas.local',
  '{"nombre":"Vecino","apellido":"Bypass"}'::jsonb
),
(
  '00000000-0000-0000-0000-00000000f423',
  'vecino-legacy-activacion@pruebas.local',
  '{"nombre":"Vecino","apellido":"Legacy"}'::jsonb
);


-- ============================================================================
-- NEGOCIO
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
  'a1100000-0000-4000-8000-000000000042',
  'Negocio Activación 0042',
  'negocio-activacion-0042',
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
  'a1200000-0000-4000-8000-000000000042',
  'a1100000-0000-4000-8000-000000000042',
  'Sucursal Activación 0042',
  'Dirección Activación 0042',
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
  'a1300000-0000-4000-8000-000000000042',
  'a1200000-0000-4000-8000-000000000042',
  'Caja Activación 0042',
  'ACT-0042',
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
  'a1400000-0000-4000-8000-000000000042',
  'a1300000-0000-4000-8000-000000000042',
  'TERMINAL-ACTIVACION-0042',

  encode(
    extensions.digest(
      convert_to(
        'terminal-activacion-segura-0042-credencial',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),

  'Equipo Activación 0042',
  '1.0.0',
  'activa'
);


-- ============================================================================
-- CAJERO NORMAL
--
-- No es supervisor.
-- Esto comprueba explícitamente la decisión de producto:
-- cualquier cajero activo y asignado puede activar.
-- ============================================================================

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
  'a1500000-0000-4000-8000-000000000042',
  'a1100000-0000-4000-8000-000000000042',
  'Cajera',
  'Normal',
  'cajero',
  null,
  'activo'
);


insert into public.cajeros_sucursales (
  cajero_id,
  sucursal_id
)
values (
  'a1500000-0000-4000-8000-000000000042',
  'a1200000-0000-4000-8000-000000000042'
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
  'a1700000-0000-4000-8000-000000000042',
  'a1400000-0000-4000-8000-000000000042',
  'a1300000-0000-4000-8000-000000000042',
  'a1100000-0000-4000-8000-000000000042',
  'Cajera Normal',
  'a1500000-0000-4000-8000-000000000042',
  'abierto'
);


-- ============================================================================
-- SOLICITUDES ENTREGADAS
-- ============================================================================

insert into public.solicitudes_llavero (
  id,
  vecino_id,
  negocio_solicitud_id,
  estado,
  entregado_en
)
values
(
  'a1800000-0000-4000-8000-000000000042',
  '00000000-0000-0000-0000-00000000f421',
  'a1100000-0000-4000-8000-000000000042',
  'entregada',
  clock_timestamp()
),
(
  'a1900000-0000-4000-8000-000000000042',
  '00000000-0000-0000-0000-00000000f422',
  'a1100000-0000-4000-8000-000000000042',
  'entregada',
  clock_timestamp()
),
(
  'a2000000-0000-4000-8000-000000000042',
  '00000000-0000-0000-0000-00000000f423',
  'a1100000-0000-4000-8000-000000000042',
  'entregada',
  clock_timestamp()
);


-- ============================================================================
-- LLAVEROS SIN ACTIVAR
-- ============================================================================

insert into public.llaveros_nfc (
  id,
  vecino_id,
  solicitud_id,
  token_hash,
  codigo_publico,
  estado,
  preparado_en
)
values
(
  'a2100000-0000-4000-8000-000000000042',
  '00000000-0000-0000-0000-00000000f421',
  'a1800000-0000-4000-8000-000000000042',

  encode(
    extensions.digest(
      convert_to(
        'token-llavero-activacion-0042-principal',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),

  'LLAVERO-ACT-0042',
  'sin_asignar',
  clock_timestamp()
),
(
  'a2200000-0000-4000-8000-000000000042',
  '00000000-0000-0000-0000-00000000f422',
  'a1900000-0000-4000-8000-000000000042',

  encode(
    extensions.digest(
      convert_to(
        'token-llavero-activacion-0042-bypass',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),

  'LLAVERO-ACT-BYPASS-0042',
  'sin_asignar',
  clock_timestamp()
),
(
  'a2300000-0000-4000-8000-000000000042',
  '00000000-0000-0000-0000-00000000f423',
  'a2000000-0000-4000-8000-000000000042',

  encode(
    extensions.digest(
      convert_to(
        'token-llavero-activacion-0042-legacy',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),

  'LLAVERO-ACT-LEGACY-0042',
  'sin_asignar',
  clock_timestamp()
);


-- ============================================================================
-- CAJERO NORMAL PUEDE CONSULTAR
-- ============================================================================

set local role anon;


select lives_ok(
  $$
    select *
    from public.terminal_consultar_activacion_llavero_app_negocio(
      'LLAVERO-ACT-0042',
      'a1700000-0000-4000-8000-000000000042',
      'a1400000-0000-4000-8000-000000000042',
      'terminal-activacion-segura-0042-credencial'
    )
  $$,
  'Un cajero normal con turno activo puede consultar el llavero'
);


select is(
  (
    select puede_activar
    from public.terminal_consultar_activacion_llavero_app_negocio(
      'LLAVERO-ACT-0042',
      'a1700000-0000-4000-8000-000000000042',
      'a1400000-0000-4000-8000-000000000042',
      'terminal-activacion-segura-0042-credencial'
    )
  ),
  true,
  'El llavero entregado figura listo para activación'
);


-- ============================================================================
-- SIN REVISION DE CEDULA NO ACTIVA
-- ============================================================================

select throws_ok(
  $$
    select *
    from public.terminal_activar_llavero_app_negocio(
      'LLAVERO-ACT-0042',
      '1357',
      false,
      'a1700000-0000-4000-8000-000000000042',
      'a1400000-0000-4000-8000-000000000042',
      'terminal-activacion-segura-0042-credencial'
    )
  $$,
  '42501',
  'Debes confirmar la revisión presencial de la cédula',
  'La activación exige confirmar la revisión presencial'
);


select throws_ok(
  $$
    select *
    from public.terminal_activar_llavero_app_negocio(
      'LLAVERO-ACT-0042',
      '12345',
      true,
      'a1700000-0000-4000-8000-000000000042',
      'a1400000-0000-4000-8000-000000000042',
      'terminal-activacion-segura-0042-credencial'
    )
  $$,
  '22023',
  'El PIN de seguridad debe tener exactamente 4 dígitos',
  'El PIN debe tener exactamente cuatro números'
);


-- ============================================================================
-- CAJERO NORMAL + TURNO ACTIVO = ACTIVACION CORRECTA
-- ============================================================================

select is(
  (
    select activado
    from public.terminal_activar_llavero_app_negocio(
      'LLAVERO-ACT-0042',
      '1357',
      true,
      'a1700000-0000-4000-8000-000000000042',
      'a1400000-0000-4000-8000-000000000042',
      'terminal-activacion-segura-0042-credencial'
    )
  ),
  true,
  'Un cajero normal puede activar con turno válido, cédula y PIN'
);


reset role;


-- ============================================================================
-- AUDITORIA
-- ============================================================================

select ok(
  (
    select
      estado = 'activo'
      and pin_seguridad_hash is not null
      and pin_seguridad_hash <> '1357'
      and pin_seguridad_configurado_en is not null
      and pin_seguridad_actualizado_en is not null

      and turno_caja_activacion_id =
        'a1700000-0000-4000-8000-000000000042'

      and caja_activacion_id =
        'a1300000-0000-4000-8000-000000000042'

      and metodo_verificacion_activacion = 'cedula'

      and activado_por is null

    from public.llaveros_nfc
    where id =
      'a2100000-0000-4000-8000-000000000042'
  ),
  'La activación queda vinculada al turno, caja, cajero y método presencial'
);


select is(
  (
    select cajero_negocio_id
    from public.turnos_caja
    where id =
      'a1700000-0000-4000-8000-000000000042'
  ),
  'a1500000-0000-4000-8000-000000000042'::uuid,
  'El turno identifica exactamente qué cajero realizó la activación'
);


select ok(
  (
    select
      extensions.crypt(
        '1357',
        pin_seguridad_hash
      ) = pin_seguridad_hash

    from public.llaveros_nfc
    where id =
      'a2100000-0000-4000-8000-000000000042'
  ),
  'El PIN queda almacenado únicamente como hash'
);


select is(
  (
    select autorizado
    from public.validar_pin_seguridad_llavero_interno(
      'a2100000-0000-4000-8000-000000000042',
      '1357'
    )
  ),
  true,
  'El PIN creado en la activación sirve para autorizar gasto'
);


-- ============================================================================
-- REACTIVAR NO PUEDE CAMBIAR PIN
-- ============================================================================

set local role anon;


select is(
  (
    select activado
    from public.terminal_activar_llavero_app_negocio(
      'LLAVERO-ACT-0042',
      '8642',
      true,
      'a1700000-0000-4000-8000-000000000042',
      'a1400000-0000-4000-8000-000000000042',
      'terminal-activacion-segura-0042-credencial'
    )
  ),
  false,
  'Reactivar un llavero existente no permite cambiar su PIN'
);


reset role;


select is(
  (
    select autorizado
    from public.validar_pin_seguridad_llavero_interno(
      'a2100000-0000-4000-8000-000000000042',
      '1357'
    )
  ),
  true,
  'El PIN original continúa vigente'
);


select is(
  (
    select autorizado
    from public.validar_pin_seguridad_llavero_interno(
      'a2100000-0000-4000-8000-000000000042',
      '8642'
    )
  ),
  false,
  'El intento de reactivación no reemplazó el PIN'
);


update public.llaveros_nfc
set
  pin_seguridad_intentos_fallidos = 0,
  pin_seguridad_bloqueado_hasta = null
where id =
  'a2100000-0000-4000-8000-000000000042';


-- ============================================================================
-- RPC LEGACY NO PUEDE SALTARSE PIN DESDE APP NEGOCIO
-- ============================================================================

set local role anon;


select throws_ok(
  $$
    select *
    from public.terminal_activar_llavero(
      'token-llavero-activacion-0042-bypass',
      'cedula',
      null,
      true,
      'a1700000-0000-4000-8000-000000000042',
      'a1400000-0000-4000-8000-000000000042',
      'terminal-activacion-segura-0042-credencial'
    )
  $$,
  '42501',
  'App Negocio no puede activar un llavero sin crear su PIN de seguridad',
  'La RPC legacy no permite saltarse el PIN desde App Negocio'
);


reset role;


select ok(
  (
    select
      estado = 'sin_asignar'
      and pin_seguridad_hash is null
    from public.llaveros_nfc
    where id =
      'a2200000-0000-4000-8000-000000000042'
  ),
  'El intento de bypass no deja cambios parciales'
);


-- ============================================================================
-- TERMINAL LEGACY CONSERVA COMPATIBILIDAD
-- ============================================================================

update public.turnos_caja
set cajero_negocio_id = null
where id =
  'a1700000-0000-4000-8000-000000000042';


set local role anon;


select lives_ok(
  $$
    select *
    from public.terminal_activar_llavero(
      'token-llavero-activacion-0042-legacy',
      'cedula',
      null,
      true,
      'a1700000-0000-4000-8000-000000000042',
      'a1400000-0000-4000-8000-000000000042',
      'terminal-activacion-segura-0042-credencial'
    )
  $$,
  'Terminal legacy continúa utilizando su flujo histórico'
);


reset role;


select ok(
  (
    select
      estado = 'activo'
      and pin_seguridad_hash is null
    from public.llaveros_nfc
    where id =
      'a2300000-0000-4000-8000-000000000042'
  ),
  'El nuevo guard no rompe activaciones de Terminal legacy'
);


select * from finish();

rollback;