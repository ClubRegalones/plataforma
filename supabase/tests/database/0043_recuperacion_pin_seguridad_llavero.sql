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

select has_table(
  'public',
  'recuperaciones_pin_llavero',
  'Existe auditoría de recuperación del PIN'
);


select has_function(
  'public',
  'terminal_iniciar_recuperacion_pin_llavero',
  array['uuid','boolean','text','uuid','uuid','text'],
  'Existe inicio de recuperación desde App Negocio'
);


select has_function(
  'public',
  'aprobar_recuperacion_pin_llavero',
  array['uuid'],
  'Existe aprobación protegida'
);


select has_function(
  'public',
  'terminal_completar_recuperacion_pin_llavero',
  array['uuid','text','uuid','uuid','text'],
  'Existe finalización del cambio de PIN'
);


select ok(
  not has_table_privilege(
    'anon',
    'public.recuperaciones_pin_llavero',
    'SELECT'
  ),
  'anon no puede leer directamente recuperaciones'
);


select ok(
  not has_table_privilege(
    'authenticated',
    'public.recuperaciones_pin_llavero',
    'UPDATE'
  ),
  'authenticated no puede falsificar aprobaciones directamente'
);


select ok(
  not has_function_privilege(
    'anon',
    'public.aprobar_recuperacion_pin_llavero(uuid)',
    'EXECUTE'
  ),
  'anon no puede aprobar recuperaciones'
);


select ok(
  not has_function_privilege(
    'anon',
    'public.cancelar_reservas_llavero_por_cambio_pin_interno(uuid)',
    'EXECUTE'
  ),
  'El helper de cancelación permanece privado'
);


-- ============================================================================
-- USUARIOS
-- ============================================================================

insert into auth.users (
  id,
  email,
  raw_user_meta_data
)
values
(
  '00000000-0000-0000-0000-00000000f431',
  'propietario-recuperacion@pruebas.local',
  '{"nombre":"Propietario","apellido":"Recuperación"}'::jsonb
),
(
  '00000000-0000-0000-0000-00000000f432',
  'externo-recuperacion@pruebas.local',
  '{"nombre":"Usuario","apellido":"Externo"}'::jsonb
),
(
  '00000000-0000-0000-0000-00000000f433',
  'vecino-recuperacion@pruebas.local',
  '{"nombre":"Vecina","apellido":"Recuperación"}'::jsonb
);


-- ============================================================================
-- NEGOCIO / TERMINAL / CAJERO
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
  'b1100000-0000-4000-8000-000000000043',
  'Negocio Recuperación 0043',
  'negocio-recuperacion-0043',
  '99999993K',
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
  'b1100000-0000-4000-8000-000000000043',
  '00000000-0000-0000-0000-00000000f431',
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
  'b1200000-0000-4000-8000-000000000043',
  'b1100000-0000-4000-8000-000000000043',
  'Sucursal Recuperación 0043',
  'Dirección Recuperación 0043',
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
  'b1300000-0000-4000-8000-000000000043',
  'b1200000-0000-4000-8000-000000000043',
  'Caja Recuperación',
  'REC-0043',
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
  'b1400000-0000-4000-8000-000000000043',
  'b1300000-0000-4000-8000-000000000043',
  'TERMINAL-RECUPERACION-0043',

  encode(
    extensions.digest(
      convert_to(
        'terminal-recuperacion-segura-0043-credencial',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),

  'Equipo Recuperación 0043',
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
  'b1500000-0000-4000-8000-000000000043',
  'b1100000-0000-4000-8000-000000000043',
  'Camila',
  'Cajera',
  'cajero',
  null,
  'activo'
);


insert into public.cajeros_sucursales (
  cajero_id,
  sucursal_id
)
values (
  'b1500000-0000-4000-8000-000000000043',
  'b1200000-0000-4000-8000-000000000043'
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
  'b1600000-0000-4000-8000-000000000043',
  'b1400000-0000-4000-8000-000000000043',
  'b1300000-0000-4000-8000-000000000043',
  'b1100000-0000-4000-8000-000000000043',
  'Camila Cajera',
  'b1500000-0000-4000-8000-000000000043',
  'abierto'
);


-- ============================================================================
-- LLAVERO ACTIVO CON PIN ANTIGUO
-- ============================================================================

insert into public.llaveros_nfc (
  id,
  vecino_id,
  token_hash,
  codigo_publico,
  estado,
  asignado_en,
  asignado_por
)
values (
  'b1700000-0000-4000-8000-000000000043',
  '00000000-0000-0000-0000-00000000f433',

  encode(
    extensions.digest(
      convert_to(
        'llavero-recuperacion-token-0043',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),

  'LLAVERO-REC-0043',
  'activo',
  clock_timestamp(),
  '00000000-0000-0000-0000-00000000f431'
);


select lives_ok(
  $$
    select public.establecer_pin_seguridad_llavero_interno(
      'b1700000-0000-4000-8000-000000000043',
      '1357'
    )
  $$,
  'El llavero comienza con PIN 1357'
);


-- ============================================================================
-- BENEFICIO + SALDO
-- ============================================================================

insert into public.reglas_regis (
  id,
  negocio_id,
  version,
  tasa_acumulacion_bp,
  valor_regis_clp,
  monto_minimo_compra_clp,
  porcentaje_maximo_canje_bp,
  conservar_remanente,
  activa,
  vigencia_desde
)
values (
  'b1800000-0000-4000-8000-000000000043',
  'b1100000-0000-4000-8000-000000000043',
  1,
  1000,
  50,
  0,
  5000,
  true,
  true,
  clock_timestamp() - interval '1 day'
);


insert into public.beneficios_regis (
  id,
  negocio_id,
  codigo
)
values (
  'b1900000-0000-4000-8000-000000000043',
  'b1100000-0000-4000-8000-000000000043',
  'recuperacion-pin-0043'
);


insert into public.versiones_beneficio_regis (
  id,
  beneficio_id,
  version,
  nombre,
  descripcion,
  tipo,
  porcentaje_descuento_bp,
  monto_descuento_fijo_clp,
  costo_regis,
  compra_minima_clp,
  tope_descuento_clp,
  cupos_totales,
  limite_por_vecino,
  mostrar_cupos,
  regla_regis_id,
  valor_regis_clp,
  porcentaje_maximo_canje_bp,
  estado,
  vigencia_desde,
  vigencia_hasta,
  publicado_en
)
values (
  'b2000000-0000-4000-8000-000000000043',
  'b1900000-0000-4000-8000-000000000043',
  1,
  'Descuento recuperación',
  'Prueba B3',
  'monto_fijo',
  null,
  3000,
  50,
  10000,
  null,
  10,
  5,
  false,
  'b1800000-0000-4000-8000-000000000043',
  50,
  5000,
  'activo',
  clock_timestamp() - interval '1 minute',
  clock_timestamp() + interval '1 day',
  clock_timestamp()
);


insert into public.saldos_regis (
  vecino_id,
  negocio_id,
  disponibles,
  reservados,
  pendientes,
  canjeados,
  remanente_valor_clp
)
values (
  '00000000-0000-0000-0000-00000000f433',
  'b1100000-0000-4000-8000-000000000043',
  100,
  0,
  0,
  0,
  0
);


-- Dejamos una reserva hecha con el PIN antiguo.

set local role anon;


select is(
  (
    select autorizado
    from public.terminal_reservar_canje_llavero_app_negocio(
      'b1700000-0000-4000-8000-000000000043',
      'b2000000-0000-4000-8000-000000000043',
      '1357',
      'b3-reserva-antigua-0043',
      'b1600000-0000-4000-8000-000000000043',
      'b1400000-0000-4000-8000-000000000043',
      'terminal-recuperacion-segura-0043-credencial'
    )
  ),
  true,
  'El PIN antiguo tiene una reserva válida antes de la recuperación'
);


reset role;


select ok(
  (
    select
      disponibles = 50
      and reservados = 50
    from public.saldos_regis
    where vecino_id =
      '00000000-0000-0000-0000-00000000f433'
      and negocio_id =
        'b1100000-0000-4000-8000-000000000043'
  ),
  'Existen REGIS reservados antes del cambio de PIN'
);


-- ============================================================================
-- NO BASTA F12 + BOOLEAN FALSE
-- ============================================================================

set local role anon;


select throws_ok(
  $$
    select *
    from public.terminal_iniciar_recuperacion_pin_llavero(
      'b1700000-0000-4000-8000-000000000043',
      false,
      'b3-recuperacion-0043-falsa',
      'b1600000-0000-4000-8000-000000000043',
      'b1400000-0000-4000-8000-000000000043',
      'terminal-recuperacion-segura-0043-credencial'
    )
  $$,
  '42501',
  'Debes confirmar la revisión presencial de la cédula',
  'La UI exige confirmar la revisión de cédula'
);


-- ============================================================================
-- CAJERO INICIA SOLICITUD
-- ============================================================================

select lives_ok(
  $$
    select set_config(
      'prueba.recuperacion_pin_id',
      recuperacion_id::text,
      true
    )
    from public.terminal_iniciar_recuperacion_pin_llavero(
      'b1700000-0000-4000-8000-000000000043',
      true,
      'b3-recuperacion-real-0043',
      'b1600000-0000-4000-8000-000000000043',
      'b1400000-0000-4000-8000-000000000043',
      'terminal-recuperacion-segura-0043-credencial'
    )
  $$,
  'El cajero puede iniciar recuperación con turno activo'
);


reset role;


select is(
  (
    select estado::text
    from public.recuperaciones_pin_llavero
    where id =
      current_setting('prueba.recuperacion_pin_id')::uuid
  ),
  'pendiente',
  'La recuperación comienza pendiente'
);


select is(
  (
    select cajero_negocio_id
    from public.recuperaciones_pin_llavero
    where id =
      current_setting('prueba.recuperacion_pin_id')::uuid
  ),
  'b1500000-0000-4000-8000-000000000043'::uuid,
  'La solicitud registra al cajero responsable'
);


-- ============================================================================
-- NO SE PUEDE CAMBIAR PIN ANTES DE APROBACION
-- ============================================================================

set local role anon;


select is(
  (
    select actualizado
    from public.terminal_completar_recuperacion_pin_llavero(
      current_setting('prueba.recuperacion_pin_id')::uuid,
      '8642',
      'b1600000-0000-4000-8000-000000000043',
      'b1400000-0000-4000-8000-000000000043',
      'terminal-recuperacion-segura-0043-credencial'
    )
  ),
  false,
  'El cajero no puede cambiar el PIN antes de aprobación'
);


reset role;


select ok(
  (
    select
      extensions.crypt(
        '1357',
        pin_seguridad_hash
      ) = pin_seguridad_hash
    from public.llaveros_nfc
    where id =
      'b1700000-0000-4000-8000-000000000043'
  ),
  'El PIN antiguo sigue intacto antes de aprobación'
);


-- ============================================================================
-- USUARIO AJENO NO PUEDE APROBAR
-- ============================================================================

set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000f432';


select throws_ok(
  format(
    'select * from public.aprobar_recuperacion_pin_llavero(%L::uuid)',
    current_setting('prueba.recuperacion_pin_id')
  ),
  '42501',
  'No tienes permisos para aprobar esta recuperación',
  'Un usuario ajeno no puede aprobar'
);


-- ============================================================================
-- PROPIETARIO VE Y APRUEBA
-- ============================================================================

reset role;
set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000f431';


select is(
  (
    select count(*)::integer
    from public.listar_recuperaciones_pin_llavero_pendientes(
      'b1100000-0000-4000-8000-000000000043'
    )
  ),
  1,
  'El propietario ve la recuperación pendiente'
);


select is(
  (
    select aprobada
    from public.aprobar_recuperacion_pin_llavero(
      current_setting('prueba.recuperacion_pin_id')::uuid
    )
  ),
  true,
  'El propietario aprueba la recuperación'
);


reset role;


select ok(
  (
    select
      estado = 'aprobada'
      and aprobada_por =
        '00000000-0000-0000-0000-00000000f431'
      and aprobada_en is not null
      and completar_antes is not null

    from public.recuperaciones_pin_llavero
    where id =
      current_setting('prueba.recuperacion_pin_id')::uuid
  ),
  'La aprobación queda auditada'
);


-- ============================================================================
-- APP NEGOCIO VE LA APROBACION
-- ============================================================================

set local role anon;


select is(
  (
    select puede_completar
    from public.terminal_consultar_recuperacion_pin_llavero(
      current_setting('prueba.recuperacion_pin_id')::uuid,
      'b1600000-0000-4000-8000-000000000043',
      'b1400000-0000-4000-8000-000000000043',
      'terminal-recuperacion-segura-0043-credencial'
    )
  ),
  true,
  'La App Negocio detecta la aprobación'
);


select throws_ok(
  format(
    'select * from public.terminal_completar_recuperacion_pin_llavero(%L::uuid,%L,%L::uuid,%L::uuid,%L)',
    current_setting('prueba.recuperacion_pin_id'),
    '12345',
    'b1600000-0000-4000-8000-000000000043',
    'b1400000-0000-4000-8000-000000000043',
    'terminal-recuperacion-segura-0043-credencial'
  ),
  '22023',
  'El PIN de seguridad debe tener exactamente 4 dígitos',
  'El PIN nuevo también debe tener cuatro dígitos'
);


-- ============================================================================
-- VECINO CREA PIN NUEVO
-- ============================================================================

select is(
  (
    select actualizado
    from public.terminal_completar_recuperacion_pin_llavero(
      current_setting('prueba.recuperacion_pin_id')::uuid,
      '8642',
      'b1600000-0000-4000-8000-000000000043',
      'b1400000-0000-4000-8000-000000000043',
      'terminal-recuperacion-segura-0043-credencial'
    )
  ),
  true,
  'La recuperación aprobada permite crear el PIN nuevo'
);


reset role;


select ok(
  (
    select
      estado = 'completada'
      and completada_en is not null
      and aprobada_por =
        '00000000-0000-0000-0000-00000000f431'
      and cajero_negocio_id =
        'b1500000-0000-4000-8000-000000000043'

    from public.recuperaciones_pin_llavero
    where id =
      current_setting('prueba.recuperacion_pin_id')::uuid
  ),
  'La recuperación conserva aprobación y cajero para auditoría'
);


select ok(
  (
    select
      extensions.crypt(
        '8642',
        pin_seguridad_hash
      ) = pin_seguridad_hash

      and extensions.crypt(
        '1357',
        pin_seguridad_hash
      ) <> pin_seguridad_hash

      and pin_seguridad_intentos_fallidos = 0
      and pin_seguridad_bloqueado_hasta is null

    from public.llaveros_nfc
    where id =
      'b1700000-0000-4000-8000-000000000043'
  ),
  'El PIN anterior deja de servir y el nuevo queda activo'
);


-- ============================================================================
-- LA RESERVA AUTORIZADA POR EL PIN ANTIGUO QUEDA INVALIDADA
-- ============================================================================

select is(
  (
    select estado::text
    from public.canjes_regis
    where idempotency_key =
      'b3-reserva-antigua-0043'
  ),
  'cancelado',
  'La reserva autorizada con el PIN antiguo queda cancelada'
);


select ok(
  (
    select
      disponibles = 100
      and reservados = 0
    from public.saldos_regis
    where vecino_id =
      '00000000-0000-0000-0000-00000000f433'
      and negocio_id =
        'b1100000-0000-4000-8000-000000000043'
  ),
  'Los REGIS de la reserva anterior vuelven a estar disponibles'
);


select is(
  (
    select count(*)::integer
    from public.canjes_regis
    where llavero_id =
      'b1700000-0000-4000-8000-000000000043'
      and estado = 'reservado'
  ),
  0,
  'Recuperar PIN no deja ningún canje previamente autorizado'
);


-- ============================================================================
-- EL PIN ANTIGUO YA NO AUTORIZA GASTO
-- ============================================================================

set local role anon;


select is(
  (
    select autorizado
    from public.terminal_reservar_canje_llavero_app_negocio(
      'b1700000-0000-4000-8000-000000000043',
      'b2000000-0000-4000-8000-000000000043',
      '1357',
      'b3-pin-antiguo-falla-0043',
      'b1600000-0000-4000-8000-000000000043',
      'b1400000-0000-4000-8000-000000000043',
      'terminal-recuperacion-segura-0043-credencial'
    )
  ),
  false,
  'El PIN antiguo ya no puede reservar REGIS'
);


select is(
  (
    select autorizado
    from public.terminal_reservar_canje_llavero_app_negocio(
      'b1700000-0000-4000-8000-000000000043',
      'b2000000-0000-4000-8000-000000000043',
      '8642',
      'b3-pin-nuevo-ok-0043',
      'b1600000-0000-4000-8000-000000000043',
      'b1400000-0000-4000-8000-000000000043',
      'terminal-recuperacion-segura-0043-credencial'
    )
  ),
  true,
  'Solo ingresando el PIN nuevo se vuelve a autorizar un canje'
);


reset role;


select ok(
  (
    select
      disponibles = 50
      and reservados = 50
    from public.saldos_regis
    where vecino_id =
      '00000000-0000-0000-0000-00000000f433'
      and negocio_id =
        'b1100000-0000-4000-8000-000000000043'
  ),
  'El nuevo canje reserva REGIS únicamente después de escribir el PIN nuevo'
);


select * from finish();

rollback;