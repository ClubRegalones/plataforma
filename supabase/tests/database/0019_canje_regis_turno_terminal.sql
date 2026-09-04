begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

-- ---------------------------------------------------------------------------
-- Contrato del flujo canje + turno
-- ---------------------------------------------------------------------------

select has_function(
  'public',
  'confirmar_compra_con_canje_en_turno',
  array['uuid', 'uuid', 'integer', 'uuid', 'uuid', 'text', 'text', 'text'],
  'Existe la confirmación de canje protegida por turno'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.confirmar_compra_con_canje_en_turno(uuid,uuid,integer,uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'Una sesión autenticada puede confirmar canjes mediante una Terminal autorizada'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.confirmar_compra_con_canje_en_turno(uuid,uuid,integer,uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'Un usuario anónimo no puede confirmar canjes desde la Terminal'
);

-- ---------------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000f191',
    'propietario-canje-turno@pruebas.local',
    '{"nombre":"Propietario Canje Turno"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f192',
    'vecino-canje-turno@pruebas.local',
    '{"nombre":"Vecino","apellido":"Canje Turno"}'::jsonb
  );

insert into public.negocios (id, nombre, slug, rubro, estado)
values (
  '81100000-0000-4000-8000-000000000191',
  'Negocio Canje Turno',
  'negocio-canje-turno',
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
  '81100000-0000-4000-8000-000000000191',
  '00000000-0000-0000-0000-00000000f191',
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
  '82100000-0000-4000-8000-000000000191',
  '81100000-0000-4000-8000-000000000191',
  'Sucursal Canje Turno',
  'Calle Canje Turno 191',
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
  '83100000-0000-4000-8000-000000000191',
  '82100000-0000-4000-8000-000000000191',
  'Caja Canje Turno 01',
  'CAJA-CANJE-TURNO-01',
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
  '84100000-0000-4000-8000-000000000191',
  '83100000-0000-4000-8000-000000000191',
  'TERMINAL-CANJE-TURNO-01',
  encode(
    extensions.digest(
      convert_to('terminal-canje-turno-credencial-001', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'Terminal Canje Turno 01',
  'activa'
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
  '00000000-0000-0000-0000-00000000f192',
  '81100000-0000-4000-8000-000000000191',
  100,
  0,
  0,
  0,
  0
);

-- ---------------------------------------------------------------------------
-- El comercio publica un beneficio válido
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f191';

select lives_ok(
  $$
    select public.crear_beneficio_regis(
      '81100000-0000-4000-8000-000000000191',
      'descuento-canje-turno',
      'Mil pesos de descuento',
      'monto_fijo',
      20,
      5000,
      null,
      1000,
      null,
      10,
      3,
      now(),
      now() + interval '1 day',
      true,
      'Beneficio para probar el vínculo entre canje y turno',
      false
    )
  $$,
  'El comercio publica el beneficio utilizado en la prueba'
);

-- ---------------------------------------------------------------------------
-- La Terminal inicia turno
-- ---------------------------------------------------------------------------

do $$
declare
  v_turno_id uuid;
begin
  select turno.turno_id
  into v_turno_id
  from public.iniciar_turno_terminal(
    '84100000-0000-4000-8000-000000000191',
    'terminal-canje-turno-credencial-001',
    'Camila Rojas'
  ) as turno;

  perform set_config('prueba.canje_turno_id', v_turno_id::text, true);
end;
$$;

select is(
  (
    select nombre_cajero::text
    from public.turnos_caja
    where id = current_setting('prueba.canje_turno_id')::uuid
  ),
  'Camila Rojas',
  'El turno queda abierto a nombre del cajero'
);

-- ---------------------------------------------------------------------------
-- El vecino reserva el beneficio mediante QR
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f192';

select lives_ok(
  $$
    select set_config('prueba.canje_id', canje_id::text, true)
    from public.reservar_canje_regis_qr(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'descuento-canje-turno'
          and version_beneficio.estado = 'activo'
      ),
      'qr-canje-turno-001',
      'reserva-canje-turno-001'
    )
  $$,
  'El vecino reserva el beneficio y genera un QR temporal'
);

select is(
  (
    select estado::text
    from public.canjes_regis
    where id = current_setting('prueba.canje_id')::uuid
  ),
  'reservado',
  'El canje permanece reservado antes de pasar por caja'
);

select is(
  (
    select reservados
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000f192'
      and negocio_id = '81100000-0000-4000-8000-000000000191'
  ),
  20,
  'Los REGIS del beneficio quedan reservados antes de confirmar'
);

-- ---------------------------------------------------------------------------
-- Confirmación protegida por turno
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f191';

select throws_ok(
  format(
    'select * from public.confirmar_compra_con_canje_en_turno(%L::uuid,%L::uuid,%s,%L::uuid,%L::uuid,%L,%L,%L)',
    current_setting('prueba.canje_id'),
    '83100000-0000-4000-8000-000000000191',
    10000,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '84100000-0000-4000-8000-000000000191',
    'terminal-canje-turno-credencial-001',
    'BOLETA-CANJE-TURNO-INVALIDA',
    'qr-canje-turno-001'
  ),
  '42501',
  'Debes iniciar un turno válido antes de confirmar canjes',
  'No se puede confirmar un canje usando un turno inexistente'
);

select is(
  (
    select estado::text
    from public.canjes_regis
    where id = current_setting('prueba.canje_id')::uuid
  ),
  'reservado',
  'El intento con un turno inválido no consume la reserva'
);

select lives_ok(
  format(
    'select * from public.confirmar_compra_con_canje_en_turno(%L::uuid,%L::uuid,%s,%L::uuid,%L::uuid,%L,%L,%L)',
    current_setting('prueba.canje_id'),
    '83100000-0000-4000-8000-000000000191',
    10000,
    current_setting('prueba.canje_turno_id'),
    '84100000-0000-4000-8000-000000000191',
    'terminal-canje-turno-credencial-001',
    'BOLETA-CANJE-TURNO-001',
    'qr-canje-turno-001'
  ),
  'El cajero confirma el canje desde el turno activo'
);

-- Las comprobaciones siguientes inspeccionan directamente el estado interno.
-- canjes_regis mantiene permisos de columna restringidos para no exponer
-- información sensible (por ejemplo, hashes QR) al frontend.
reset role;

select is(
  (
    select estado::text
    from public.canjes_regis
    where id = current_setting('prueba.canje_id')::uuid
  ),
  'confirmado',
  'El canje termina confirmado'
);

select is(
  (
    select turno_caja_id
    from public.canjes_regis
    where id = current_setting('prueba.canje_id')::uuid
  ),
  current_setting('prueba.canje_turno_id')::uuid,
  'El canje queda asociado al turno que lo confirmó'
);

select is(
  (
    select turno_caja_id
    from public.compras
    where folio_boleta = 'BOLETA-CANJE-TURNO-001'
  ),
  current_setting('prueba.canje_turno_id')::uuid,
  'La compra generada por el canje queda asociada al mismo turno'
);

select ok(
  (
    select
      monto_bruto_clp = 10000
      and descuento_total_clp = 1000
      and monto_final = 9000
      and regis_utilizados = 20
    from public.compras
    where folio_boleta = 'BOLETA-CANJE-TURNO-001'
  ),
  'La compra conserva correctamente el resultado económico del beneficio'
);

select is(
  (
    select reservados
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000f192'
      and negocio_id = '81100000-0000-4000-8000-000000000191'
  ),
  0,
  'Al confirmar el canje ya no quedan REGIS reservados'
);

select is(
  (
    select canjeados
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000f192'
      and negocio_id = '81100000-0000-4000-8000-000000000191'
  ),
  20,
  'Los REGIS utilizados pasan al saldo canjeado'
);

select ok(
  (
    select ultima_actividad_en >= iniciado_en
    from public.turnos_caja
    where id = current_setting('prueba.canje_turno_id')::uuid
  ),
  'Confirmar el canje registra actividad en el turno'
);

-- ---------------------------------------------------------------------------
-- Un turno cerrado no puede seguir operando
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f191';

select lives_ok(
  format(
    'select public.cerrar_turno_terminal(%L::uuid,%L::uuid,%L)',
    current_setting('prueba.canje_turno_id'),
    '84100000-0000-4000-8000-000000000191',
    'terminal-canje-turno-credencial-001'
  ),
  'El cajero puede finalizar el turno después del canje'
);

select is(
  (
    select estado::text
    from public.turnos_caja
    where id = current_setting('prueba.canje_turno_id')::uuid
  ),
  'cerrado',
  'El turno usado para el canje queda correctamente cerrado'
);

select * from finish();
rollback;
