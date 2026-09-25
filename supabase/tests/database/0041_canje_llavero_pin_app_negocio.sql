begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select no_plan();


-- ============================================================================
-- CONTRATO B2A
-- ============================================================================

select has_column(
  'public',
  'canjes_regis',
  'pin_seguridad_autorizado_en',
  'El canje registra cuándo fue autorizado por PIN'
);


select has_column(
  'public',
  'canjes_regis',
  'pin_seguridad_turno_id',
  'El canje registra el turno que validó el PIN'
);


select has_function(
  'public',
  'terminal_reservar_canje_llavero_app_negocio',
  array[
    'uuid',
    'uuid',
    'text',
    'text',
    'uuid',
    'uuid',
    'text'
  ],
  'Existe la reserva segura de canje con PIN para App Negocio'
);


select ok(
  has_function_privilege(
    'anon',
    'public.terminal_reservar_canje_llavero_app_negocio(uuid,uuid,text,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'App Negocio puede llamar la RPC segura con su credencial de Terminal'
);


select ok(
  not has_function_privilege(
    'anon',
    'public.validar_canje_llavero_app_negocio_con_pin_interno(public.origen_canje_regis,public.estado_canje_regis,uuid,timestamptz,uuid)',
    'EXECUTE'
  ),
  'El guard de autorización permanece privado'
);


select ok(
  not has_column_privilege(
    'authenticated',
    'public.canjes_regis',
    'pin_seguridad_autorizado_en',
    'UPDATE'
  ),
  'El frontend no puede falsificar una autorización PIN'
);


-- ============================================================================
-- FIXTURE
-- ============================================================================

insert into auth.users (
  id,
  email,
  raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-00000000f411',
  'vecino-canje-pin@pruebas.local',
  '{"nombre":"Vecino","apellido":"PIN"}'::jsonb
);


insert into public.negocios (
  id,
  nombre,
  slug,
  rut,
  rubro,
  estado
)
values (
  '91100000-0000-4000-8000-000000000041',
  'Negocio PIN 0041',
  'negocio-pin-0041',
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
  '92100000-0000-4000-8000-000000000041',
  '91100000-0000-4000-8000-000000000041',
  'Sucursal PIN 0041',
  'Dirección PIN 0041',
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
  '93100000-0000-4000-8000-000000000041',
  '92100000-0000-4000-8000-000000000041',
  'Caja PIN 0041',
  'PIN-0041',
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
  '94100000-0000-4000-8000-000000000041',
  '93100000-0000-4000-8000-000000000041',
  'TERMINAL-PIN-0041',

  encode(
    extensions.digest(
      convert_to(
        'terminal-pin-credencial-segura-0041',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),

  'Equipo PIN 0041',
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
  '95100000-0000-4000-8000-000000000041',
  '91100000-0000-4000-8000-000000000041',
  'Cajera',
  'PIN',
  'cajero',
  null,
  'activo'
);


insert into public.cajeros_sucursales (
  cajero_id,
  sucursal_id
)
values (
  '95100000-0000-4000-8000-000000000041',
  '92100000-0000-4000-8000-000000000041'
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
  '96100000-0000-4000-8000-000000000041',
  '94100000-0000-4000-8000-000000000041',
  '93100000-0000-4000-8000-000000000041',
  '91100000-0000-4000-8000-000000000041',
  'Cajera PIN',
  '95100000-0000-4000-8000-000000000041',
  'abierto'
);


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
  'a4100000-0000-4000-8000-000000000041',
  '00000000-0000-0000-0000-00000000f411',

  encode(
    extensions.digest(
      convert_to(
        'llavero-pin-token-0041',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),

  'LLAVERO-PIN-0041',
  'activo',
  clock_timestamp(),
  '00000000-0000-0000-0000-00000000f411'
);


-- Configuramos el futuro PIN del vecino mediante el helper interno.

select lives_ok(
  $$
    select public.establecer_pin_seguridad_llavero_interno(
      'a4100000-0000-4000-8000-000000000041',
      '1357'
    )
  $$,
  'El fixture tiene PIN de seguridad'
);


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
  '97100000-0000-4000-8000-000000000041',
  '91100000-0000-4000-8000-000000000041',
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
  '98100000-0000-4000-8000-000000000041',
  '91100000-0000-4000-8000-000000000041',
  'beneficio-pin-0041'
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
  '99100000-0000-4000-8000-000000000041',
  '98100000-0000-4000-8000-000000000041',
  1,
  'Tres mil pesos de descuento',
  'Beneficio de seguridad B2A',
  'monto_fijo',
  null,
  3000,
  50,
  10000,
  null,
  10,
  5,
  false,
  '97100000-0000-4000-8000-000000000041',
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
  '00000000-0000-0000-0000-00000000f411',
  '91100000-0000-4000-8000-000000000041',
  100,
  0,
  0,
  0,
  0
);


-- ============================================================================
-- PIN INCORRECTO
-- ============================================================================

set local role anon;


select is(
  (
    select autorizado
    from public.terminal_reservar_canje_llavero_app_negocio(
      'a4100000-0000-4000-8000-000000000041',
      '99100000-0000-4000-8000-000000000041',
      '0000',
      'b2a-intento-incorrecto-0041',
      '96100000-0000-4000-8000-000000000041',
      '94100000-0000-4000-8000-000000000041',
      'terminal-pin-credencial-segura-0041'
    )
  ),
  false,
  'Un PIN incorrecto no autoriza una reserva'
);


reset role;


select is(
  (
    select pin_seguridad_intentos_fallidos
    from public.llaveros_nfc
    where id =
      'a4100000-0000-4000-8000-000000000041'
  ),
  1::smallint,
  'El intento incorrecto queda registrado'
);


select is(
  (
    select count(*)::integer
    from public.canjes_regis
    where idempotency_key =
      'b2a-intento-incorrecto-0041'
  ),
  0,
  'PIN incorrecto no crea canje'
);


select is(
  (
    select disponibles
    from public.saldos_regis
    where vecino_id =
      '00000000-0000-0000-0000-00000000f411'
      and negocio_id =
        '91100000-0000-4000-8000-000000000041'
  ),
  100,
  'PIN incorrecto no mueve REGIS'
);


-- ============================================================================
-- PIN CORRECTO
-- ============================================================================

set local role anon;


select is(
  (
    select autorizado
    from public.terminal_reservar_canje_llavero_app_negocio(
      'a4100000-0000-4000-8000-000000000041',
      '99100000-0000-4000-8000-000000000041',
      '1357',
      'b2a-reserva-segura-0041',
      '96100000-0000-4000-8000-000000000041',
      '94100000-0000-4000-8000-000000000041',
      'terminal-pin-credencial-segura-0041'
    )
  ),
  true,
  'El PIN correcto autoriza la reserva'
);


reset role;


select ok(
  (
    select
      estado = 'reservado'
      and origen = 'llavero'
      and turno_caja_id =
        '96100000-0000-4000-8000-000000000041'
      and pin_seguridad_autorizado_en is not null
      and pin_seguridad_turno_id =
        '96100000-0000-4000-8000-000000000041'

    from public.canjes_regis
    where idempotency_key =
      'b2a-reserva-segura-0041'
  ),
  'El canje conserva evidencia del PIN y del turno'
);


select ok(
  (
    select
      disponibles = 50
      and reservados = 50
    from public.saldos_regis
    where vecino_id =
      '00000000-0000-0000-0000-00000000f411'
      and negocio_id =
        '91100000-0000-4000-8000-000000000041'
  ),
  'Solo después del PIN correcto se reservan REGIS'
);


-- Guardamos ID para la confirmación.

do $$
declare
  v_canje_id uuid;
begin

  select id
  into v_canje_id
  from public.canjes_regis
  where idempotency_key =
    'b2a-reserva-segura-0041';

  perform set_config(
    'prueba.b2a_canje_id',
    v_canje_id::text,
    true
  );

end;
$$;


-- ============================================================================
-- LA RPC LEGACY NO PUEDE SALTARSE EL PIN EN APP NEGOCIO
-- ============================================================================

set local role anon;


select throws_ok(
  $$
    select *
    from public.terminal_reservar_canje_llavero(
      'llavero-pin-token-0041',
      '99100000-0000-4000-8000-000000000041',
      'b2a-bypass-legacy-0041',
      '96100000-0000-4000-8000-000000000041',
      '94100000-0000-4000-8000-000000000041',
      'terminal-pin-credencial-segura-0041'
    )
  $$,
  '42501',
  'Los canjes con llavero en App Negocio requieren PIN de seguridad autorizado en el mismo turno',
  'La RPC legacy no permite saltarse el PIN en App Negocio'
);


reset role;


select is(
  (
    select count(*)::integer
    from public.canjes_regis
    where idempotency_key =
      'b2a-bypass-legacy-0041'
  ),
  0,
  'El bypass legacy fallido no deja una reserva huérfana'
);


select ok(
  (
    select
      disponibles = 50
      and reservados = 50
    from public.saldos_regis
    where vecino_id =
      '00000000-0000-0000-0000-00000000f411'
      and negocio_id =
        '91100000-0000-4000-8000-000000000041'
  ),
  'El bypass fallido tampoco mueve REGIS'
);


-- ============================================================================
-- CONFIRMACION DEL CANJE YA AUTORIZADO
-- ============================================================================

set local role anon;


select lives_ok(
  format(
    'select * from public.terminal_confirmar_compra_con_canje(%L::uuid,15000,%L::uuid,%L::uuid,%L,%L,null)',
    current_setting('prueba.b2a_canje_id'),
    '96100000-0000-4000-8000-000000000041',
    '94100000-0000-4000-8000-000000000041',
    'terminal-pin-credencial-segura-0041',
    'BOLETA-PIN-0041'
  ),
  'El canje autorizado puede confirmarse en el mismo turno'
);


reset role;


select is(
  (
    select estado::text
    from public.canjes_regis
    where id =
      current_setting('prueba.b2a_canje_id')::uuid
  ),
  'confirmado',
  'El canje termina confirmado'
);


select ok(
  (
    select
      pin_seguridad_autorizado_en is not null
      and pin_seguridad_turno_id =
        turno_caja_id
    from public.canjes_regis
    where id =
      current_setting('prueba.b2a_canje_id')::uuid
  ),
  'La evidencia PIN permanece asociada al mismo turno'
);


select ok(
  (
    select
      reservados = 0
      and canjeados = 50
    from public.saldos_regis
    where vecino_id =
      '00000000-0000-0000-0000-00000000f411'
      and negocio_id =
        '91100000-0000-4000-8000-000000000041'
  ),
  'Al confirmar, los REGIS pasan de reservados a canjeados'
);


-- ============================================================================
-- TERMINAL LEGACY SIGUE FUNCIONANDO
-- ============================================================================

update public.turnos_caja
set cajero_negocio_id = null
where id =
  '96100000-0000-4000-8000-000000000041';


set local role anon;


select lives_ok(
  $$
    select *
    from public.terminal_reservar_canje_llavero(
      'llavero-pin-token-0041',
      '99100000-0000-4000-8000-000000000041',
      'b2a-terminal-legacy-0041',
      '96100000-0000-4000-8000-000000000041',
      '94100000-0000-4000-8000-000000000041',
      'terminal-pin-credencial-segura-0041'
    )
  $$,
  'Terminal legacy conserva su flujo histórico'
);


select throws_ok(
  $$
    select *
    from public.terminal_reservar_canje_llavero_app_negocio(
      'a4100000-0000-4000-8000-000000000041',
      '99100000-0000-4000-8000-000000000041',
      '1357',
      'b2a-no-app-negocio-0041',
      '96100000-0000-4000-8000-000000000041',
      '94100000-0000-4000-8000-000000000041',
      'terminal-pin-credencial-segura-0041'
    )
  $$,
  '42501',
  'Esta operación requiere un turno de App Negocio',
  'La RPC nueva no se usa accidentalmente como Terminal legacy'
);


reset role;


select * from finish();

rollback;