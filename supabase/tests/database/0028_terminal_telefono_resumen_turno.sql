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
  'terminal_buscar_vecino_por_telefono',
  array['text', 'uuid', 'uuid', 'text'],
  'La Terminal puede buscar un vecino por teléfono'
);

select has_function(
  'public',
  'terminal_crear_solicitud_compra_por_telefono',
  array[
    'text',
    'integer',
    'text',
    'uuid',
    'uuid',
    'text'
  ],
  'La Terminal puede crear una venta manual por teléfono'
);

select has_function(
  'public',
  'terminal_resumen_turno',
  array['uuid', 'uuid', 'text'],
  'La Terminal puede consultar el resumen del turno'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_buscar_vecino_por_telefono(text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'El cliente Terminal puede usar la búsqueda estrecha sin leer perfiles directamente'
);

select ok(
  has_function_privilege(
    'anon',
    'public.terminal_resumen_turno(uuid,uuid,text)',
    'EXECUTE'
  ),
  'El cliente Terminal puede consultar únicamente su resumen protegido'
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
    '00000000-0000-0000-0000-00000000f281',
    'propietario-terminal-telefono@pruebas.local',
    '{"nombre":"Propietario","apellido":"Terminal"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f282',
    'vecina-terminal-telefono@pruebas.local',
    '{"nombre":"Vecina","apellido":"Manual"}'::jsonb
  );

insert into public.perfiles (
  id,
  nombre,
  apellido,
  telefono
)
values (
  '00000000-0000-0000-0000-00000000f282',
  'Vecina',
  'Manual',
  '+56911112222'
)
on conflict (id)
do update set
  nombre = excluded.nombre,
  apellido = excluded.apellido,
  telefono = excluded.telefono,
  estado = 'activo';


-- ============================================================================
-- NEGOCIO / SUCURSAL / CAJA / TERMINAL
-- ============================================================================

insert into public.negocios (
  id,
  nombre,
  slug,
  rubro,
  estado
)
values (
  '81200000-0000-4000-8000-000000000281',
  'Negocio Terminal Teléfono',
  'negocio-terminal-telefono',
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
  '81200000-0000-4000-8000-000000000281',
  '00000000-0000-0000-0000-00000000f281',
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
  '82200000-0000-4000-8000-000000000281',
  '81200000-0000-4000-8000-000000000281',
  'Sucursal Terminal Teléfono',
  'Calle Teléfono 281',
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
  '83200000-0000-4000-8000-000000000281',
  '82200000-0000-4000-8000-000000000281',
  'Caja Terminal Teléfono',
  'CAJA-TERMINAL-TELEFONO-01',
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
  '84200000-0000-4000-8000-000000000281',
  '83200000-0000-4000-8000-000000000281',
  'TERMINAL-TELEFONO-01',
  encode(
    extensions.digest(
      convert_to(
        'terminal-telefono-credencial-001',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'Terminal Teléfono',
  'activa'
);


-- ============================================================================
-- TURNO
-- ============================================================================

do $$
declare
  v_turno_id uuid;
begin
  select turno.turno_id
  into v_turno_id
  from public.iniciar_turno_terminal(
    '84200000-0000-4000-8000-000000000281',
    'terminal-telefono-credencial-001',
    'Camila Rojas'
  ) as turno;

  perform set_config(
    'prueba.telefono_turno_id',
    v_turno_id::text,
    true
  );
end;
$$;


-- ============================================================================
-- BUSQUEDA EXACTA
-- ============================================================================

select is(
  (
    select resultado.nombre_vecino
    from public.terminal_buscar_vecino_por_telefono(
      '+56911112222',
      current_setting('prueba.telefono_turno_id')::uuid,
      '84200000-0000-4000-8000-000000000281',
      'terminal-telefono-credencial-001'
    ) as resultado
  ),
  'Vecina Manual',
  'La Terminal encuentra al vecino por su teléfono exacto'
);

select throws_ok(
  format(
    $sql$
      select *
      from public.terminal_buscar_vecino_por_telefono(
        %L,
        %L::uuid,
        %L::uuid,
        %L
      )
    $sql$,
    '911112222',
    current_setting('prueba.telefono_turno_id'),
    '84200000-0000-4000-8000-000000000281',
    'terminal-telefono-credencial-001'
  ),
  '22023',
  'Ingresa un número de teléfono válido',
  'La búsqueda rechaza teléfonos que no estén en formato válido'
);

select throws_ok(
  format(
    $sql$
      select *
      from public.terminal_buscar_vecino_por_telefono(
        %L,
        %L::uuid,
        %L::uuid,
        %L
      )
    $sql$,
    '+56999998888',
    current_setting('prueba.telefono_turno_id'),
    '84200000-0000-4000-8000-000000000281',
    'terminal-telefono-credencial-001'
  ),
  'P0002',
  'No encontramos un Vecino Regalón con ese teléfono',
  'La búsqueda no inventa vecinos inexistentes'
);

select throws_ok(
  format(
    $sql$
      select *
      from public.terminal_buscar_vecino_por_telefono(
        %L,
        %L::uuid,
        %L::uuid,
        %L
      )
    $sql$,
    '+56911112222',
    current_setting('prueba.telefono_turno_id'),
    '84200000-0000-4000-8000-000000000281',
    'credencial-incorrecta'
  ),
  '42501',
  null,
  'Una credencial de Terminal incorrecta no puede buscar vecinos'
);


-- ============================================================================
-- VENTA MANUAL
-- ============================================================================

do $$
declare
  v_solicitud public.solicitudes_compra;
begin
  select *
  into v_solicitud
  from public.terminal_crear_solicitud_compra_por_telefono(
    '+56911112222',
    12990,
    'venta-manual-telefono-001',
    current_setting('prueba.telefono_turno_id')::uuid,
    '84200000-0000-4000-8000-000000000281',
    'terminal-telefono-credencial-001'
  );

  perform set_config(
    'prueba.telefono_solicitud_id',
    v_solicitud.id::text,
    true
  );
end;
$$;

select is(
  (
    select vecino_id
    from public.solicitudes_compra
    where id =
      current_setting(
        'prueba.telefono_solicitud_id'
      )::uuid
  ),
  '00000000-0000-0000-0000-00000000f282'::uuid,
  'La venta manual queda asociada al vecino correcto'
);

select is(
  (
    select monto_informado
    from public.solicitudes_compra
    where id =
      current_setting(
        'prueba.telefono_solicitud_id'
      )::uuid
  ),
  12990,
  'La venta manual conserva el monto informado por el cajero'
);

select is(
  (
    select turno_caja_id
    from public.solicitudes_compra
    where id =
      current_setting(
        'prueba.telefono_solicitud_id'
      )::uuid
  ),
  current_setting(
    'prueba.telefono_turno_id'
  )::uuid,
  'La solicitud manual queda vinculada al turno'
);

select is(
  (
    select estado::text
    from public.solicitudes_compra
    where id =
      current_setting(
        'prueba.telefono_solicitud_id'
      )::uuid
  ),
  'pendiente_validacion',
  'La venta manual queda lista para validación antes de aprobarse'
);


-- ============================================================================
-- IDEMPOTENCIA
-- ============================================================================

select is(
  (
    select solicitud.id
    from public.terminal_crear_solicitud_compra_por_telefono(
      '+56911112222',
      12990,
      'venta-manual-telefono-001',
      current_setting('prueba.telefono_turno_id')::uuid,
      '84200000-0000-4000-8000-000000000281',
      'terminal-telefono-credencial-001'
    ) as solicitud
  ),
  current_setting(
    'prueba.telefono_solicitud_id'
  )::uuid,
  'Reintentar la misma operación no crea una segunda solicitud'
);


-- ============================================================================
-- UNA COMPRA REAL PARA PROBAR EL RESUMEN
--
-- Se aprueba mediante la misma RPC protegida que utiliza la Terminal.
-- ============================================================================

select public.terminal_aprobar_compra(
  current_setting(
    'prueba.telefono_solicitud_id'
  )::uuid,
  current_setting(
    'prueba.telefono_turno_id'
  )::uuid,
  '84200000-0000-4000-8000-000000000281',
  'terminal-telefono-credencial-001',
  null,
  'asistido'
);


-- ============================================================================
-- RESUMEN
-- ============================================================================

select is(
  (
    select resumen.ventas_realizadas
    from public.terminal_resumen_turno(
      current_setting('prueba.telefono_turno_id')::uuid,
      '84200000-0000-4000-8000-000000000281',
      'terminal-telefono-credencial-001'
    ) as resumen
  ),
  1::bigint,
  'El resumen cuenta las ventas reales del turno'
);

select is(
  (
    select resumen.regis_acumulados
    from public.terminal_resumen_turno(
      current_setting('prueba.telefono_turno_id')::uuid,
      '84200000-0000-4000-8000-000000000281',
      'terminal-telefono-credencial-001'
    ) as resumen
  ),
  (
    select coalesce(
      sum(movimiento.cantidad),
      0
    )::bigint
    from public.movimientos_regis as movimiento
    join public.compras as compra
      on compra.id = movimiento.compra_id
    where compra.turno_caja_id =
      current_setting('prueba.telefono_turno_id')::uuid
      and compra.estado <> 'revertida'
      and movimiento.tipo = 'acreditacion_compra'
      and movimiento.estado <> 'revertido'
      and movimiento.cantidad > 0
  ),
  'El resumen informa exactamente los REGIS acreditados en el turno'
);

select is(
  (
    select resumen.canjes_realizados
    from public.terminal_resumen_turno(
      current_setting('prueba.telefono_turno_id')::uuid,
      '84200000-0000-4000-8000-000000000281',
      'terminal-telefono-credencial-001'
    ) as resumen
  ),
  0::bigint,
  'Sin canjes confirmados, el resumen informa cero'
);

select is(
  (
    select resumen.iniciado_en
    from public.terminal_resumen_turno(
      current_setting('prueba.telefono_turno_id')::uuid,
      '84200000-0000-4000-8000-000000000281',
      'terminal-telefono-credencial-001'
    ) as resumen
  ),
  (
    select turno.iniciado_en
    from public.turnos_caja as turno
    where turno.id =
      current_setting(
        'prueba.telefono_turno_id'
      )::uuid
  ),
  'El resumen conserva la hora real de inicio del turno'
);


select * from finish();

rollback;