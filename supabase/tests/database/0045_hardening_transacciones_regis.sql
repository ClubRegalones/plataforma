begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select no_plan();

-- ============================================================================
-- HARDENING 1D-B
-- TRANSACCIONES REGIS / REPLAY / DOBLE GASTO / IDEMPOTENCIA
--
-- Objetivo:
--   - replay de reserva no duplica REGIS
--   - idempotency_key no puede reutilizarse para otra operación
--   - negocio/terminal cruzados no pueden confirmar un canje ajeno
--   - doble confirmación no duplica compra ni movimiento
--   - un canje confirmado no puede cancelarse
--   - dos reservas distintas no pueden gastar el mismo saldo
--   - F12/frontend no puede escribir saldo o ledger directamente
--
-- Este archivo SOLO prueba comportamiento existente.
-- No contiene correcciones de producción.
-- ============================================================================


-- ============================================================================
-- CONTRATO / FRONTERAS
-- ============================================================================

select has_function(
  'public',
  'terminal_reservar_canje_llavero_app_negocio',
  array['uuid','uuid','text','text','uuid','uuid','text'],
  'Existe la reserva de canje con PIN de App Negocio'
);

select has_function(
  'public',
  'terminal_confirmar_compra_con_canje',
  array['uuid','integer','uuid','uuid','text','text','text'],
  'Existe la confirmación transaccional del canje'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.crear_reserva_canje_regis_interna(uuid,uuid,public.origen_canje_regis,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'anon no puede saltarse las RPC públicas usando el helper interno'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.movimientos_regis',
    'INSERT'
  ),
  'El frontend no puede insertar directamente en el ledger REGIS'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.movimientos_regis',
    'UPDATE'
  ),
  'El frontend no puede modificar movimientos REGIS'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.saldos_regis',
    'INSERT'
  ),
  'El frontend no puede fabricar saldos REGIS'
);

select ok(
  position(
    'for update'
    in lower(
      pg_get_functiondef(
        'public.crear_reserva_canje_regis_interna(uuid,uuid,public.origen_canje_regis,text,uuid,uuid,text)'::regprocedure
      )
    )
  ) > 0,
  'La reserva bloquea filas antes de descontar saldo'
);

select ok(
  position(
    'for update'
    in lower(
      pg_get_functiondef(
        'public.terminal_confirmar_compra_con_canje(uuid,integer,uuid,uuid,text,text,text)'::regprocedure
      )
    )
  ) > 0,
  'La confirmación bloquea el canje para evitar doble procesamiento'
);


-- ============================================================================
-- VECINO
-- ============================================================================

insert into auth.users (
  id,
  email,
  raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-00000000d451',
  'vecino-hardening-1db@pruebas.local',
  '{"nombre":"Vecino","apellido":"Hardening"}'::jsonb
);


-- ============================================================================
-- NEGOCIO A
-- ============================================================================

insert into public.negocios (
  id,
  nombre,
  slug,
  rubro,
  estado
)
values (
  'e1100000-0000-4000-8000-000000000045',
  'Negocio Seguridad A 0045',
  'negocio-seguridad-a-0045',
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
  'e1200000-0000-4000-8000-000000000045',
  'e1100000-0000-4000-8000-000000000045',
  'Sucursal Seguridad A 0045',
  'Dirección Seguridad A 0045',
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
  'e1300000-0000-4000-8000-000000000045',
  'e1200000-0000-4000-8000-000000000045',
  'Caja Seguridad A 0045',
  'SEG-A-0045',
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
  'e1400000-0000-4000-8000-000000000045',
  'e1300000-0000-4000-8000-000000000045',
  'TERMINAL-SEGURIDAD-A-0045',
  encode(
    extensions.digest(
      convert_to(
        'terminal-seguridad-a-0045-credencial-valida',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'Terminal Seguridad A 0045',
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
  'e1500000-0000-4000-8000-000000000045',
  'e1100000-0000-4000-8000-000000000045',
  'Cajera',
  'Seguridad A',
  'cajero',
  null,
  'activo'
);

insert into public.cajeros_sucursales (
  cajero_id,
  sucursal_id
)
values (
  'e1500000-0000-4000-8000-000000000045',
  'e1200000-0000-4000-8000-000000000045'
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
  'e1600000-0000-4000-8000-000000000045',
  'e1400000-0000-4000-8000-000000000045',
  'e1300000-0000-4000-8000-000000000045',
  'e1100000-0000-4000-8000-000000000045',
  'Cajera Seguridad A',
  'e1500000-0000-4000-8000-000000000045',
  'abierto'
);


-- ============================================================================
-- NEGOCIO B
-- Solo existe para probar terminal/turno cruzado.
-- ============================================================================

insert into public.negocios (
  id,
  nombre,
  slug,
  rubro,
  estado
)
values (
  'e2100000-0000-4000-8000-000000000045',
  'Negocio Seguridad B 0045',
  'negocio-seguridad-b-0045',
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
  'e2200000-0000-4000-8000-000000000045',
  'e2100000-0000-4000-8000-000000000045',
  'Sucursal Seguridad B 0045',
  'Dirección Seguridad B 0045',
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
  'e2300000-0000-4000-8000-000000000045',
  'e2200000-0000-4000-8000-000000000045',
  'Caja Seguridad B 0045',
  'SEG-B-0045',
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
  'e2400000-0000-4000-8000-000000000045',
  'e2300000-0000-4000-8000-000000000045',
  'TERMINAL-SEGURIDAD-B-0045',
  encode(
    extensions.digest(
      convert_to(
        'terminal-seguridad-b-0045-credencial-valida',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'Terminal Seguridad B 0045',
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
  'e2500000-0000-4000-8000-000000000045',
  'e2100000-0000-4000-8000-000000000045',
  'Cajera',
  'Seguridad B',
  'cajero',
  null,
  'activo'
);

insert into public.cajeros_sucursales (
  cajero_id,
  sucursal_id
)
values (
  'e2500000-0000-4000-8000-000000000045',
  'e2200000-0000-4000-8000-000000000045'
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
  'e2600000-0000-4000-8000-000000000045',
  'e2400000-0000-4000-8000-000000000045',
  'e2300000-0000-4000-8000-000000000045',
  'e2100000-0000-4000-8000-000000000045',
  'Cajera Seguridad B',
  'e2500000-0000-4000-8000-000000000045',
  'abierto'
);


-- ============================================================================
-- LLAVERO + PIN
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
  'e3100000-0000-4000-8000-000000000045',
  '00000000-0000-0000-0000-00000000d451',
  encode(
    extensions.digest(
      convert_to(
        'llavero-hardening-0045',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'LLAVERO-HARDENING-0045',
  'activo',
  clock_timestamp(),
  '00000000-0000-0000-0000-00000000d451'
);

select lives_ok(
  $$
    select public.establecer_pin_seguridad_llavero_interno(
      'e3100000-0000-4000-8000-000000000045',
      '2468'
    )
  $$,
  'El fixture tiene PIN de seguridad'
);


-- ============================================================================
-- REGLA
-- El mínimo de acumulación se deja deliberadamente muy alto para que
-- confirmar estas compras no acredite REGIS nuevos y podamos verificar
-- el saldo del test sin ruido contable adicional.
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
  'e4100000-0000-4000-8000-000000000045',
  'e1100000-0000-4000-8000-000000000045',
  1,
  500,
  50,
  1000000,
  5000,
  true,
  true,
  clock_timestamp() - interval '1 day'
);


-- ============================================================================
-- BENEFICIO A1: costo 50 REGIS
-- ============================================================================

insert into public.beneficios_regis (
  id,
  negocio_id,
  codigo
)
values (
  'e4200000-0000-4000-8000-000000000045',
  'e1100000-0000-4000-8000-000000000045',
  'hardening-a1-0045'
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
  'e4300000-0000-4000-8000-000000000045',
  'e4200000-0000-4000-8000-000000000045',
  1,
  'Beneficio Hardening A1',
  'Beneficio para replay y doble confirmación',
  'monto_fijo',
  null,
  3000,
  50,
  10000,
  null,
  100,
  10,
  false,
  'e4100000-0000-4000-8000-000000000045',
  50,
  5000,
  'activo',
  clock_timestamp() - interval '1 minute',
  clock_timestamp() + interval '1 day',
  clock_timestamp()
);


-- ============================================================================
-- BENEFICIO A2: costo 100 REGIS
-- Se usará para intentar gastar dos veces un saldo que solo alcanza una vez.
-- ============================================================================

insert into public.beneficios_regis (
  id,
  negocio_id,
  codigo
)
values (
  'e4400000-0000-4000-8000-000000000045',
  'e1100000-0000-4000-8000-000000000045',
  'hardening-a2-0045'
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
  'e4500000-0000-4000-8000-000000000045',
  'e4400000-0000-4000-8000-000000000045',
  1,
  'Beneficio Hardening A2',
  'Beneficio para doble gasto',
  'monto_fijo',
  null,
  6000,
  100,
  20000,
  null,
  100,
  10,
  false,
  'e4100000-0000-4000-8000-000000000045',
  50,
  5000,
  'activo',
  clock_timestamp() - interval '1 minute',
  clock_timestamp() + interval '1 day',
  clock_timestamp()
);


-- ============================================================================
-- SALDO INICIAL: 200 REGIS
-- ============================================================================

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
  '00000000-0000-0000-0000-00000000d451',
  'e1100000-0000-4000-8000-000000000045',
  200,
  0,
  0,
  0,
  0
);


-- ============================================================================
-- ATAQUE 1: PIN INCORRECTO
-- ============================================================================

set local role anon;

select is(
  (
    select autorizado
    from public.terminal_reservar_canje_llavero_app_negocio(
      'e3100000-0000-4000-8000-000000000045',
      'e4300000-0000-4000-8000-000000000045',
      '0000',
      '1db-pin-incorrecto-0045',
      'e1600000-0000-4000-8000-000000000045',
      'e1400000-0000-4000-8000-000000000045',
      'terminal-seguridad-a-0045-credencial-valida'
    )
  ),
  false,
  'Un PIN incorrecto no autoriza gasto'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.canjes_regis
    where idempotency_key = '1db-pin-incorrecto-0045'
  ),
  0,
  'PIN incorrecto no crea canje'
);

select ok(
  (
    select disponibles = 200
      and reservados = 0
      and canjeados = 0
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000d451'
      and negocio_id = 'e1100000-0000-4000-8000-000000000045'
  ),
  'PIN incorrecto no mueve REGIS'
);


-- ============================================================================
-- ATAQUE 2: RESERVA LEGÍTIMA
-- ============================================================================

set local role anon;

select lives_ok(
  $$
    select *
    from public.terminal_reservar_canje_llavero_app_negocio(
      'e3100000-0000-4000-8000-000000000045',
      'e4300000-0000-4000-8000-000000000045',
      '2468',
      '1db-replay-reserva-0045',
      'e1600000-0000-4000-8000-000000000045',
      'e1400000-0000-4000-8000-000000000045',
      'terminal-seguridad-a-0045-credencial-valida'
    )
  $$,
  'La primera reserva legítima funciona'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.canjes_regis
    where idempotency_key = '1db-replay-reserva-0045'
  ),
  1,
  'La primera reserva crea un solo canje'
);

select ok(
  (
    select disponibles = 150
      and reservados = 50
      and canjeados = 0
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000d451'
      and negocio_id = 'e1100000-0000-4000-8000-000000000045'
  ),
  'La reserva mueve exactamente 50 REGIS'
);


-- ============================================================================
-- ATAQUE 3: REPLAY EXACTO DE LA RESERVA
-- ============================================================================

set local role anon;

select lives_ok(
  $$
    select *
    from public.terminal_reservar_canje_llavero_app_negocio(
      'e3100000-0000-4000-8000-000000000045',
      'e4300000-0000-4000-8000-000000000045',
      '2468',
      '1db-replay-reserva-0045',
      'e1600000-0000-4000-8000-000000000045',
      'e1400000-0000-4000-8000-000000000045',
      'terminal-seguridad-a-0045-credencial-valida'
    )
  $$,
  'Repetir exactamente la misma operación es idempotente'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.canjes_regis
    where idempotency_key = '1db-replay-reserva-0045'
  ),
  1,
  'El replay no crea un segundo canje'
);

select ok(
  (
    select disponibles = 150
      and reservados = 50
      and canjeados = 0
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000d451'
      and negocio_id = 'e1100000-0000-4000-8000-000000000045'
  ),
  'El replay no vuelve a descontar REGIS'
);


-- ============================================================================
-- ATAQUE 4: IDEMPOTENCY_KEY REUTILIZADA PARA OTRO BENEFICIO
-- ============================================================================

set local role anon;

select throws_ok(
  $$
    select *
    from public.terminal_reservar_canje_llavero_app_negocio(
      'e3100000-0000-4000-8000-000000000045',
      'e4500000-0000-4000-8000-000000000045',
      '2468',
      '1db-replay-reserva-0045',
      'e1600000-0000-4000-8000-000000000045',
      'e1400000-0000-4000-8000-000000000045',
      'terminal-seguridad-a-0045-credencial-valida'
    )
  $$,
  '23505',
  'idempotency_key ya está en uso',
  'Una key existente no puede reutilizarse para otro beneficio'
);

reset role;

select ok(
  (
    select disponibles = 150
      and reservados = 50
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000d451'
      and negocio_id = 'e1100000-0000-4000-8000-000000000045'
  ),
  'La reutilización maliciosa de la key no mueve saldo'
);


-- ============================================================================
-- GUARDAMOS EL CANJE A1
-- ============================================================================

do $$
declare
  v_canje_id uuid;
begin
  select id
  into v_canje_id
  from public.canjes_regis
  where idempotency_key = '1db-replay-reserva-0045';

  perform set_config(
    'prueba.canje_1db_a1',
    v_canje_id::text,
    true
  );
end;
$$;


-- ============================================================================
-- ATAQUE 5: CONFIRMAR CANJE A DESDE NEGOCIO B
-- ============================================================================

set local role anon;

select throws_ok(
  format(
    'select * from public.terminal_confirmar_compra_con_canje(%L::uuid,15000,%L::uuid,%L::uuid,%L,%L,null)',
    current_setting('prueba.canje_1db_a1'),
    'e2600000-0000-4000-8000-000000000045',
    'e2400000-0000-4000-8000-000000000045',
    'terminal-seguridad-b-0045-credencial-valida',
    'BOLETA-CRUZADA-0045'
  ),
  '42501',
  'El canje no pertenece al negocio de la Terminal',
  'Un negocio distinto no puede confirmar el canje'
);

reset role;

select ok(
  (
    select estado = 'reservado'
    from public.canjes_regis
    where id = current_setting('prueba.canje_1db_a1')::uuid
  ),
  'El intento cruzado no altera el estado del canje'
);

select ok(
  (
    select disponibles = 150
      and reservados = 50
      and canjeados = 0
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000d451'
      and negocio_id = 'e1100000-0000-4000-8000-000000000045'
  ),
  'El intento cruzado tampoco altera el saldo'
);


-- ============================================================================
-- CONFIRMACIÓN LEGÍTIMA
-- ============================================================================

set local role anon;

select lives_ok(
  format(
    'select * from public.terminal_confirmar_compra_con_canje(%L::uuid,15000,%L::uuid,%L::uuid,%L,%L,null)',
    current_setting('prueba.canje_1db_a1'),
    'e1600000-0000-4000-8000-000000000045',
    'e1400000-0000-4000-8000-000000000045',
    'terminal-seguridad-a-0045-credencial-valida',
    'BOLETA-1DB-0045'
  ),
  'La confirmación legítima funciona'
);

reset role;

do $$
declare
  v_compra_id uuid;
begin
  select compra_id
  into v_compra_id
  from public.canjes_regis
  where id = current_setting('prueba.canje_1db_a1')::uuid;

  perform set_config(
    'prueba.compra_1db_a1',
    v_compra_id::text,
    true
  );
end;
$$;

select is(
  (
    select estado::text
    from public.canjes_regis
    where id = current_setting('prueba.canje_1db_a1')::uuid
  ),
  'confirmado',
  'El canje queda confirmado'
);

select ok(
  (
    select disponibles = 150
      and reservados = 0
      and canjeados = 50
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000d451'
      and negocio_id = 'e1100000-0000-4000-8000-000000000045'
  ),
  'La confirmación consume exactamente los REGIS reservados'
);

select is(
  (
    select count(*)::integer
    from public.movimientos_regis
    where canje_id = current_setting('prueba.canje_1db_a1')::uuid
      and tipo = 'canje'
      and estado = 'canjeado'
  ),
  1,
  'La confirmación genera un solo movimiento de canje'
);


-- ============================================================================
-- ATAQUE 6: DOBLE CONFIRMACIÓN / REPLAY
-- ============================================================================

set local role anon;

select lives_ok(
  format(
    'select * from public.terminal_confirmar_compra_con_canje(%L::uuid,999999,%L::uuid,%L::uuid,%L,%L,null)',
    current_setting('prueba.canje_1db_a1'),
    'e1600000-0000-4000-8000-000000000045',
    'e1400000-0000-4000-8000-000000000045',
    'terminal-seguridad-a-0045-credencial-valida',
    'BOLETA-MANIPULADA-0045'
  ),
  'Repetir una confirmación ya finalizada devuelve el resultado existente'
);

reset role;

select is(
  (
    select compra_id::text
    from public.canjes_regis
    where id = current_setting('prueba.canje_1db_a1')::uuid
  ),
  current_setting('prueba.compra_1db_a1'),
  'El replay conserva la compra original'
);

select is(
  (
    select monto_compra_bruto_clp
    from public.canjes_regis
    where id = current_setting('prueba.canje_1db_a1')::uuid
  ),
  15000,
  'Un replay con monto manipulado no reescribe la operación confirmada'
);

select is(
  (
    select count(*)::integer
    from public.movimientos_regis
    where canje_id = current_setting('prueba.canje_1db_a1')::uuid
      and tipo = 'canje'
  ),
  1,
  'La doble confirmación no duplica el movimiento REGIS'
);

select ok(
  (
    select disponibles = 150
      and reservados = 0
      and canjeados = 50
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000d451'
      and negocio_id = 'e1100000-0000-4000-8000-000000000045'
  ),
  'La doble confirmación no vuelve a gastar REGIS'
);


-- ============================================================================
-- ATAQUE 7: CANCELAR UNA OPERACIÓN YA CONFIRMADA
-- ============================================================================

set local role anon;

select throws_ok(
  format(
    'select * from public.terminal_cancelar_canje(%L::uuid,%L::uuid,%L::uuid,%L)',
    current_setting('prueba.canje_1db_a1'),
    'e1600000-0000-4000-8000-000000000045',
    'e1400000-0000-4000-8000-000000000045',
    'terminal-seguridad-a-0045-credencial-valida'
  ),
  '23514',
  'Un canje confirmado no se puede cancelar',
  'Una operación finalizada no puede volver atrás para recuperar REGIS'
);

reset role;

select ok(
  (
    select estado = 'confirmado'
      and compra_id::text = current_setting('prueba.compra_1db_a1')
    from public.canjes_regis
    where id = current_setting('prueba.canje_1db_a1')::uuid
  ),
  'El intento de cancelar no modifica la operación finalizada'
);


-- ============================================================================
-- ATAQUE 8: DOBLE GASTO CON DOS KEYS DISTINTAS
--
-- Quedan 150 disponibles.
-- El beneficio cuesta 100.
-- La primera reserva deja 50.
-- La segunda intenta gastar otros 100 y debe fallar.
--
-- La función de reserva bloquea la fila de saldo FOR UPDATE, por lo que
-- dos transacciones concurrentes deben serializar el acceso a ese saldo.
-- ============================================================================

set local role anon;

select lives_ok(
  $$
    select *
    from public.terminal_reservar_canje_llavero_app_negocio(
      'e3100000-0000-4000-8000-000000000045',
      'e4500000-0000-4000-8000-000000000045',
      '2468',
      '1db-doble-gasto-a-0045',
      'e1600000-0000-4000-8000-000000000045',
      'e1400000-0000-4000-8000-000000000045',
      'terminal-seguridad-a-0045-credencial-valida'
    )
  $$,
  'La primera reserva de 100 REGIS funciona'
);

reset role;

select ok(
  (
    select disponibles = 50
      and reservados = 100
      and canjeados = 50
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000d451'
      and negocio_id = 'e1100000-0000-4000-8000-000000000045'
  ),
  'Tras la primera reserva solo quedan 50 REGIS disponibles'
);

set local role anon;

select throws_ok(
  $$
    select *
    from public.terminal_reservar_canje_llavero_app_negocio(
      'e3100000-0000-4000-8000-000000000045',
      'e4500000-0000-4000-8000-000000000045',
      '2468',
      '1db-doble-gasto-b-0045',
      'e1600000-0000-4000-8000-000000000045',
      'e1400000-0000-4000-8000-000000000045',
      'terminal-seguridad-a-0045-credencial-valida'
    )
  $$,
  '23514',
  'No tienes REGIS suficientes para este beneficio',
  'Una segunda operación no puede gastar REGIS que ya están reservados'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.canjes_regis
    where idempotency_key in (
      '1db-doble-gasto-a-0045',
      '1db-doble-gasto-b-0045'
    )
  ),
  1,
  'El intento de doble gasto solo deja una reserva'
);


-- ============================================================================
-- INTEGRIDAD FINAL
-- ============================================================================

select ok(
  (
    select
      disponibles = 50
      and reservados = 100
      and pendientes = 0
      and canjeados = 50
      and disponibles + reservados + pendientes + canjeados = 200
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000d451'
      and negocio_id = 'e1100000-0000-4000-8000-000000000045'
  ),
  'La suma contable final conserva los 200 REGIS originales'
);

select is(
  (
    select count(*)::integer
    from public.canjes_regis
    where vecino_id = '00000000-0000-0000-0000-00000000d451'
      and negocio_id = 'e1100000-0000-4000-8000-000000000045'
  ),
  2,
  'Solo existen el canje confirmado y la reserva válida de doble gasto'
);

select is(
  (
    select count(*)::integer
    from public.movimientos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000d451'
      and negocio_id = 'e1100000-0000-4000-8000-000000000045'
      and tipo = 'canje'
  ),
  1,
  'Solo existe un movimiento económico confirmado'
);

select * from finish();

rollback;
