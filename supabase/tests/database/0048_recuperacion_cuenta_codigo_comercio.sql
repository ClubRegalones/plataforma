begin;

create extension if not exists pgtap
with schema extensions;

set local search_path =
  extensions,
  public,
  pg_catalog;

select no_plan();

-- ============================================================================
-- CÓDIGO DE COMERCIO + RECUPERACIÓN DE CUENTA · V1
-- ============================================================================


-- ============================================================================
-- 1. CONTRATO
-- ============================================================================

select has_table(
  'public',
  'recuperaciones_cuenta',
  'existe recuperaciones_cuenta'
);

select ok(
  to_regprocedure(
    'public.obtener_vecino_recuperacion_por_rut(text,uuid,uuid,text)'
  ) is not null,
  'existe búsqueda segura del vecino para recuperación'
);

select ok(
  to_regprocedure(
    'public.crear_recuperacion_codigo_comercio(text,public.motivo_recuperacion_cuenta,text,uuid,uuid,text,boolean)'
  ) is not null,
  'existe creación de Código de Comercio'
);

select ok(
  to_regprocedure(
    'public.validar_codigo_comercio_recuperacion(text,text,text)'
  ) is not null,
  'existe validación del Código de Comercio'
);

select ok(
  to_regprocedure(
    'public.preparar_cambio_contrasena_recuperacion(uuid,text)'
  ) is not null,
  'existe preparación segura del cambio de contraseña'
);

select ok(
  to_regprocedure(
    'public.liberar_cambio_contrasena_recuperacion(uuid,text)'
  ) is not null,
  'existe liberación ante fallo de Auth'
);

select ok(
  to_regprocedure(
    'public.completar_recuperacion_cuenta(uuid,text)'
  ) is not null,
  'existe finalización de recuperación'
);


-- ============================================================================
-- 2. PERMISOS
-- ============================================================================

select ok(
  not has_table_privilege(
    'anon',
    'public.recuperaciones_cuenta',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.recuperaciones_cuenta',
    'SELECT'
  ),
  'clientes no pueden leer recuperaciones directamente'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.recuperaciones_cuenta',
    'INSERT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.recuperaciones_cuenta',
    'UPDATE'
  ),
  'clientes no pueden crear ni modificar recuperaciones directamente'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.crear_recuperacion_codigo_comercio(text,public.motivo_recuperacion_cuenta,text,uuid,uuid,text,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.crear_recuperacion_codigo_comercio(text,public.motivo_recuperacion_cuenta,text,uuid,uuid,text,boolean)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.crear_recuperacion_codigo_comercio(text,public.motivo_recuperacion_cuenta,text,uuid,uuid,text,boolean)',
    'EXECUTE'
  ),
  'solo service_role puede emitir Códigos de Comercio'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.validar_codigo_comercio_recuperacion(text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.validar_codigo_comercio_recuperacion(text,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.validar_codigo_comercio_recuperacion(text,text,text)',
    'EXECUTE'
  ),
  'solo service_role puede validar Códigos de Comercio'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.completar_recuperacion_cuenta(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.completar_recuperacion_cuenta(uuid,text)',
    'EXECUTE'
  ),
  'el cliente no puede completar recuperaciones directamente'
);


-- ============================================================================
-- 3. VECINO
-- ============================================================================

insert into auth.users (
  id,
  email,
  raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-00000000f481',
  'v-recuperacion-0048@cuentas.clubregalones.cl',
  '{"nombre":"Camila","apellido":"Vecina"}'::jsonb
);

update public.perfiles
set
  rut = '123456785',
  nombre = 'Camila',
  apellido = 'Vecina',
  telefono = '+56911111111'
where id = '00000000-0000-0000-0000-00000000f481';

insert into public.contactos_vecino (
  vecino_id,
  tipo,
  valor
)
values
(
  '00000000-0000-0000-0000-00000000f481',
  'correo',
  'camila@pruebas.local'
),
(
  '00000000-0000-0000-0000-00000000f481',
  'telefono',
  '+56911111111'
);


-- ============================================================================
-- 4. NEGOCIO / TERMINAL / CAJERO
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
  'c1100000-0000-4000-8000-000000000048',
  'Negocio Código Comercio 0048',
  'codigo-comercio-0048',
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
  'c1200000-0000-4000-8000-000000000048',
  'c1100000-0000-4000-8000-000000000048',
  'Sucursal Código Comercio',
  'Dirección prueba 0048',
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
  'c1300000-0000-4000-8000-000000000048',
  'c1200000-0000-4000-8000-000000000048',
  'Caja Recuperación',
  'REC-0048',
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
  'c1400000-0000-4000-8000-000000000048',
  'c1300000-0000-4000-8000-000000000048',
  'TERMINAL-CODIGO-0048',
  encode(
    extensions.digest(
      convert_to(
        'terminal-codigo-comercio-0048-credencial-segura',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'Equipo Código Comercio',
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
  'c1500000-0000-4000-8000-000000000048',
  'c1100000-0000-4000-8000-000000000048',
  'Carla',
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
  'c1500000-0000-4000-8000-000000000048',
  'c1200000-0000-4000-8000-000000000048'
);


-- ============================================================================
-- 5. UN TURNO LEGACY NO PUEDE EMITIR CÓDIGOS DE COMERCIO
-- ============================================================================

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
  'c1600000-0000-4000-8000-000000000048',
  'c1400000-0000-4000-8000-000000000048',
  'c1300000-0000-4000-8000-000000000048',
  'c1100000-0000-4000-8000-000000000048',
  'Terminal Legacy',
  null,
  'abierto'
);

select throws_ok(
  $$
    select *
    from public.crear_recuperacion_codigo_comercio(
      '12.345.678-5',
      'olvido_sin_contacto',
      repeat('a', 64),
      'c1600000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura',
      true
    )
  $$,
  '42501',
  'Esta operación requiere un turno de App Negocio',
  'un turno legacy no puede generar Código de Comercio'
);

update public.turnos_caja
set
  estado = 'cerrado',
  cerrado_en = clock_timestamp()
where id = 'c1600000-0000-4000-8000-000000000048';


-- Turno real de App Negocio.

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
  'c1610000-0000-4000-8000-000000000048',
  'c1400000-0000-4000-8000-000000000048',
  'c1300000-0000-4000-8000-000000000048',
  'c1100000-0000-4000-8000-000000000048',
  'Carla Cajera',
  'c1500000-0000-4000-8000-000000000048',
  'abierto'
);


-- ============================================================================
-- 6. BÚSQUEDA DE IDENTIDAD
-- ============================================================================

select is(
  (
    select vecino_id
    from public.obtener_vecino_recuperacion_por_rut(
      '12.345.678-5',
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura'
    )
  ),
  '00000000-0000-0000-0000-00000000f481'::uuid,
  'el RUT válido encuentra la cuenta correcta'
);

select ok(
  (
    select rut_enmascarado <> '123456785'
    from public.obtener_vecino_recuperacion_por_rut(
      '12.345.678-5',
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura'
    )
  ),
  'la App Negocio recibe el RUT enmascarado'
);

select throws_ok(
  $$
    select *
    from public.obtener_vecino_recuperacion_por_rut(
      '12.345.678-9',
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura'
    )
  $$,
  '22023',
  'RUT_INVALIDO',
  'rechaza un RUT con DV incorrecto'
);


-- Auditoría de búsquedas desde App Negocio.

select has_table(
  'public',
  'auditoria_busquedas_recuperacion',
  'existe la tabla de auditoría de búsquedas de recuperación'
);

select hasnt_column(
  'public',
  'auditoria_busquedas_recuperacion',
  'rut',
  'la auditoría no almacena el RUT consultado en claro'
);

select ok(
  (
    select
      relrowsecurity
      and not has_table_privilege(
        'anon',
        'public.auditoria_busquedas_recuperacion',
        'SELECT'
      )
    from pg_class
    where oid =
      'public.auditoria_busquedas_recuperacion'::regclass
  ),
  'la auditoría tiene RLS y no puede leerse como anon'
);

select ok(
  (
    select
      count(*) = 2
      and bool_and(encontrado)
      and bool_and(
        negocio_id =
          'c1100000-0000-4000-8000-000000000048'
      )
      and bool_and(
        sucursal_id =
          'c1200000-0000-4000-8000-000000000048'
      )
      and bool_and(
        caja_id =
          'c1300000-0000-4000-8000-000000000048'
      )
      and bool_and(
        terminal_id =
          'c1400000-0000-4000-8000-000000000048'
      )
      and bool_and(
        cajero_id =
          'c1500000-0000-4000-8000-000000000048'
      )
      and bool_and(
        turno_id =
          'c1610000-0000-4000-8000-000000000048'
      )
      and bool_and(
        vecino_id =
          '00000000-0000-0000-0000-00000000f481'
      )
    from public.auditoria_busquedas_recuperacion
  ),
  'las búsquedas de recuperación quedan auditadas con su contexto real'
);

select lives_ok(
  $$
    select *
    from public.obtener_vecino_recuperacion_por_rut(
      '11.111.111-1',
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura'
    )
  $$,
  'una búsqueda válida sin coincidencia se procesa sin inventar un vecino'
);

select ok(
  (
    select
      count(*) = 3
      and count(*) filter (
        where encontrado = false
          and vecino_id is null
      ) = 1
    from public.auditoria_busquedas_recuperacion
  ),
  'una búsqueda válida sin coincidencia también queda auditada sin guardar identidad'
);

-- ============================================================================
-- 7. CÉDULA PRESENCIAL OBLIGATORIA
-- ============================================================================

select throws_ok(
  $$
    select *
    from public.crear_recuperacion_codigo_comercio(
      '12.345.678-5',
      'olvido_sin_contacto',
      repeat('a', 64),
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura',
      false
    )
  $$,
  '42501',
  'IDENTIDAD_NO_VERIFICADA',
  'no se puede emitir código sin confirmar revisión de cédula'
);


-- ============================================================================
-- 8. EMISIÓN Y REEMPLAZO DE CÓDIGO
-- ============================================================================

select lives_ok(
  $$
    select set_config(
      'prueba.recuperacion1',
      recuperacion_id::text,
      true
    )
    from public.crear_recuperacion_codigo_comercio(
      '12.345.678-5',
      'olvido_sin_contacto',
      repeat('a', 64),
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura',
      true
    )
  $$,
  'se puede emitir un Código de Comercio'
);

select ok(
  (
    select
      estado = 'pendiente'
      and identidad_verificada
      and identidad_verificada_en is not null
      and cajero_id = 'c1500000-0000-4000-8000-000000000048'
      and negocio_id = 'c1100000-0000-4000-8000-000000000048'
      and sucursal_id = 'c1200000-0000-4000-8000-000000000048'
      and caja_id = 'c1300000-0000-4000-8000-000000000048'
      and terminal_id = 'c1400000-0000-4000-8000-000000000048'
      and turno_id = 'c1610000-0000-4000-8000-000000000048'
    from public.recuperaciones_cuenta
    where id = current_setting('prueba.recuperacion1')::uuid
  ),
  'la emisión queda completamente auditada'
);

select ok(
  (
    select expira_en
      between clock_timestamp() + interval '29 minutes'
          and clock_timestamp() + interval '31 minutes'
    from public.recuperaciones_cuenta
    where id = current_setting('prueba.recuperacion1')::uuid
  ),
  'el Código de Comercio dura aproximadamente 30 minutos'
);


select lives_ok(
  $$
    select set_config(
      'prueba.recuperacion2',
      recuperacion_id::text,
      true
    )
    from public.crear_recuperacion_codigo_comercio(
      '12.345.678-5',
      'activacion_digital',
      repeat('b', 64),
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura',
      true
    )
  $$,
  'un código nuevo puede reemplazar uno pendiente'
);

select is(
  (
    select estado::text
    from public.recuperaciones_cuenta
    where id = current_setting('prueba.recuperacion1')::uuid
  ),
  'invalidada',
  'el código pendiente anterior queda invalidado'
);


-- ============================================================================
-- 9. CINCO INTENTOS
-- ============================================================================

select is(
  (
    select intentos_restantes
    from public.validar_codigo_comercio_recuperacion(
      '12.345.678-5',
      repeat('9', 64),
      repeat('e', 64)
    )
  ),
  4::smallint,
  'primer error deja cuatro intentos'
);

select is(
  (
    select intentos_restantes
    from public.validar_codigo_comercio_recuperacion(
      '12.345.678-5',
      repeat('9', 64),
      repeat('e', 64)
    )
  ),
  3::smallint,
  'segundo error deja tres intentos'
);

select is(
  (
    select intentos_restantes
    from public.validar_codigo_comercio_recuperacion(
      '12.345.678-5',
      repeat('9', 64),
      repeat('e', 64)
    )
  ),
  2::smallint,
  'tercer error deja dos intentos'
);

select is(
  (
    select intentos_restantes
    from public.validar_codigo_comercio_recuperacion(
      '12.345.678-5',
      repeat('9', 64),
      repeat('e', 64)
    )
  ),
  1::smallint,
  'cuarto error deja un intento'
);

select is(
  (
    select resultado
    from public.validar_codigo_comercio_recuperacion(
      '12.345.678-5',
      repeat('9', 64),
      repeat('e', 64)
    )
  ),
  'CODIGO_BLOQUEADO',
  'el quinto error bloquea el código'
);

select ok(
  (
    select
      estado = 'bloqueada'
      and intentos_fallidos = 5
      and bloqueado_en is not null
    from public.recuperaciones_cuenta
    where id = current_setting('prueba.recuperacion2')::uuid
  ),
  'el bloqueo queda registrado'
);


-- ============================================================================
-- 10. EXPIRACIÓN
-- ============================================================================

select lives_ok(
  $$
    select set_config(
      'prueba.recuperacion3',
      recuperacion_id::text,
      true
    )
    from public.crear_recuperacion_codigo_comercio(
      '12.345.678-5',
      'olvido_sin_contacto',
      repeat('c', 64),
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura',
      true
    )
  $$,
  'después de un bloqueo puede emitirse un código nuevo'
);

update public.recuperaciones_cuenta
set
  creado_en = clock_timestamp() - interval '40 minutes',
  expira_en = clock_timestamp() - interval '1 minute'
where id = current_setting('prueba.recuperacion3')::uuid;

select is(
  (
    select resultado
    from public.validar_codigo_comercio_recuperacion(
      '12.345.678-5',
      repeat('c', 64),
      repeat('e', 64)
    )
  ),
  'CODIGO_EXPIRADO',
  'un código pasado de 30 minutos no puede utilizarse'
);

select is(
  (
    select estado::text
    from public.recuperaciones_cuenta
    where id = current_setting('prueba.recuperacion3')::uuid
  ),
  'expirada',
  'la expiración queda auditada'
);


-- ============================================================================
-- 11. VALIDACIÓN CORRECTA + TOKEN TEMPORAL
-- ============================================================================

select lives_ok(
  $$
    select set_config(
      'prueba.recuperacion4',
      recuperacion_id::text,
      true
    )
    from public.crear_recuperacion_codigo_comercio(
      '12.345.678-5',
      'traspaso_identidad',
      repeat('d', 64),
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura',
      true
    )
  $$,
  'se emite recuperación para traspaso de identidad'
);

select is(
  (
    select resultado
    from public.validar_codigo_comercio_recuperacion(
      '12.345.678-5',
      repeat('d', 64),
      repeat('e', 64)
    )
  ),
  'CODIGO_VALIDO',
  'el Código de Comercio correcto se valida'
);

select ok(
  (
    select
      estado = 'validada'
      and validado_en is not null
      and token_recuperacion_hash = repeat('e', 64)
      and token_recuperacion_expira_en
        between clock_timestamp() + interval '14 minutes'
            and clock_timestamp() + interval '16 minutes'
    from public.recuperaciones_cuenta
    where id = current_setting('prueba.recuperacion4')::uuid
  ),
  'el código genera una autorización temporal de aproximadamente 15 minutos'
);

select is(
  (
    select resultado
    from public.validar_codigo_comercio_recuperacion(
      '12.345.678-5',
      repeat('d', 64),
      repeat('f', 64)
    )
  ),
  'CODIGO_INVALIDO',
  'el Código de Comercio no puede reutilizarse'
);

select throws_ok(
  $$
    select *
    from public.crear_recuperacion_codigo_comercio(
      '12.345.678-5',
      'olvido_sin_contacto',
      repeat('f', 64),
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura',
      true
    )
  $$,
  '23514',
  'RECUPERACION_EN_PROCESO',
  'una recuperación ya validada no puede ser pisada'
);


-- ============================================================================
-- 12. CONSUMO ATÓMICO DEL TOKEN
-- ============================================================================

select throws_ok(
  format(
    'select * from public.preparar_cambio_contrasena_recuperacion(%L::uuid,%L)',
    current_setting('prueba.recuperacion4'),
    repeat('f', 64)
  ),
  '42501',
  'RECUPERACION_INVALIDA',
  'un token incorrecto no autoriza cambio de contraseña'
);

select is(
  (
    select vecino_id
    from public.preparar_cambio_contrasena_recuperacion(
      current_setting('prueba.recuperacion4')::uuid,
      repeat('e', 64)
    )
  ),
  '00000000-0000-0000-0000-00000000f481'::uuid,
  'el token correcto reserva el cambio para el vecino correcto'
);

select throws_ok(
  format(
    'select * from public.preparar_cambio_contrasena_recuperacion(%L::uuid,%L)',
    current_setting('prueba.recuperacion4'),
    repeat('e', 64)
  ),
  '42501',
  'RECUPERACION_INVALIDA',
  'el mismo token no puede iniciar dos cambios simultáneos'
);

select lives_ok(
  format(
    'select public.liberar_cambio_contrasena_recuperacion(%L::uuid,%L)',
    current_setting('prueba.recuperacion4'),
    repeat('e', 64)
  ),
  'si Auth falla el token puede liberarse'
);

select is(
  (
    select token_recuperacion_consumido_en
    from public.recuperaciones_cuenta
    where id = current_setting('prueba.recuperacion4')::uuid
  ),
  null,
  'la liberación deja el token disponible nuevamente'
);

select lives_ok(
  format(
    'select * from public.preparar_cambio_contrasena_recuperacion(%L::uuid,%L)',
    current_setting('prueba.recuperacion4'),
    repeat('e', 64)
  ),
  'el token liberado puede reservarse otra vez'
);


-- Una reserva abandonada puede retomarse después de 60 segundos sin esperar
-- realmente en el test. El token sigue siendo el mismo y continúa vigente.
update public.recuperaciones_cuenta
set token_recuperacion_consumido_en = clock_timestamp() - interval '61 seconds'
where id = current_setting('prueba.recuperacion4')::uuid;

select lives_ok(
  format(
    'select * from public.preparar_cambio_contrasena_recuperacion(%L::uuid,%L)',
    current_setting('prueba.recuperacion4'),
    repeat('e', 64)
  ),
  'una reserva antigua puede retomarse con el mismo token vigente'
);


-- ============================================================================
-- 13. REGIS QUE DEBEN SOBREVIVIR AL TRASPASO
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
  '00000000-0000-0000-0000-00000000f481',
  'c1100000-0000-4000-8000-000000000048',
  77,
  0,
  0,
  0,
  0
);


-- ============================================================================
-- 14. COMPLETAR TRASPASO DE IDENTIDAD
-- ============================================================================

select is(
  public.completar_recuperacion_cuenta(
    current_setting('prueba.recuperacion4')::uuid,
    repeat('e', 64)
  )::text,
  'traspaso_identidad',
  'el traspaso se completa'
);

select ok(
  (
    select
      estado = 'completada'
      and completado_en is not null
      and token_recuperacion_hash is null
      and token_recuperacion_expira_en is null
    from public.recuperaciones_cuenta
    where id = current_setting('prueba.recuperacion4')::uuid
  ),
  'la recuperación completada elimina el secreto temporal'
);

select is(
  (
    select count(*)::integer
    from public.contactos_vecino
    where vecino_id = '00000000-0000-0000-0000-00000000f481'
  ),
  0,
  'el traspaso elimina los contactos de recuperación anteriores'
);

select is(
  (
    select telefono::text
    from public.perfiles
    where id = '00000000-0000-0000-0000-00000000f481'
  ),
  null,
  'el traspaso limpia el teléfono histórico del perfil'
);

select is(
  (
    select rut::text
    from public.perfiles
    where id = '00000000-0000-0000-0000-00000000f481'
  ),
  '123456785',
  'el traspaso conserva la identidad RUT de la cuenta'
);

select is(
  (
    select disponibles
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000f481'
      and negocio_id = 'c1100000-0000-4000-8000-000000000048'
  ),
  77,
  'el traspaso conserva los REGIS del vecino'
);


-- ============================================================================
-- 15. RECUPERACIÓN NORMAL NO ELIMINA CONTACTOS
-- ============================================================================

insert into public.contactos_vecino (
  vecino_id,
  tipo,
  valor
)
values
(
  '00000000-0000-0000-0000-00000000f481',
  'correo',
  'nuevo@pruebas.local'
),
(
  '00000000-0000-0000-0000-00000000f481',
  'telefono',
  '+56922222222'
);

update public.perfiles
set telefono = '+56922222222'
where id = '00000000-0000-0000-0000-00000000f481';

select lives_ok(
  $$
    select set_config(
      'prueba.recuperacion5',
      recuperacion_id::text,
      true
    )
    from public.crear_recuperacion_codigo_comercio(
      '12.345.678-5',
      'olvido_sin_contacto',
      repeat('f', 64),
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura',
      true
    )
  $$,
  'se puede iniciar una recuperación normal después del traspaso'
);

select is(
  (
    select resultado
    from public.validar_codigo_comercio_recuperacion(
      '12.345.678-5',
      repeat('f', 64),
      repeat('1', 64)
    )
  ),
  'CODIGO_VALIDO',
  'la recuperación normal valida su código'
);

select lives_ok(
  format(
    'select * from public.preparar_cambio_contrasena_recuperacion(%L::uuid,%L)',
    current_setting('prueba.recuperacion5'),
    repeat('1', 64)
  ),
  'la recuperación normal prepara el cambio'
);

select is(
  public.completar_recuperacion_cuenta(
    current_setting('prueba.recuperacion5')::uuid,
    repeat('1', 64)
  )::text,
  'olvido_sin_contacto',
  'la recuperación normal se completa'
);

select is(
  (
    select count(*)::integer
    from public.contactos_vecino
    where vecino_id = '00000000-0000-0000-0000-00000000f481'
  ),
  2,
  'olvidar contraseña no elimina los contactos legítimos'
);

select is(
  (
    select telefono::text
    from public.perfiles
    where id = '00000000-0000-0000-0000-00000000f481'
  ),
  '+56922222222',
  'una recuperación normal conserva el teléfono del perfil'
);



-- ============================================================================
-- 16. TOKEN VENCIDO + LEASE ANTIGUO PERMITE NUEVO CODIGO
-- ============================================================================

select lives_ok(
  $$
    select set_config(
      'prueba.recuperacion6',
      recuperacion_id::text,
      true
    )
    from public.crear_recuperacion_codigo_comercio(
      '12.345.678-5',
      'activacion_digital',
      repeat('2', 64),
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura',
      true
    )
  $$,
  'se crea una recuperacion para probar lease vencido'
);

select is(
  (
    select resultado
    from public.validar_codigo_comercio_recuperacion(
      '12.345.678-5',
      repeat('2', 64),
      repeat('3', 64)
    )
  ),
  'CODIGO_VALIDO',
  'la recuperacion queda validada con token temporal'
);

-- Simulamos un proceso abandonado:
-- token ya vencido y lease con mas de 60 segundos.
update public.recuperaciones_cuenta
set
  validado_en = clock_timestamp() - interval '20 minutes',
  token_recuperacion_expira_en = clock_timestamp() - interval '1 minute',
  token_recuperacion_consumido_en = clock_timestamp() - interval '61 seconds'
where id = current_setting('prueba.recuperacion6')::uuid;

select lives_ok(
  $$
    select set_config(
      'prueba.recuperacion7',
      recuperacion_id::text,
      true
    )
    from public.crear_recuperacion_codigo_comercio(
      '12.345.678-5',
      'olvido_sin_contacto',
      repeat('4', 64),
      'c1610000-0000-4000-8000-000000000048',
      'c1400000-0000-4000-8000-000000000048',
      'terminal-codigo-comercio-0048-credencial-segura',
      true
    )
  $$,
  'un token vencido con lease antiguo permite emitir un codigo nuevo'
);

select is(
  (
    select estado::text
    from public.recuperaciones_cuenta
    where id = current_setting('prueba.recuperacion6')::uuid
  ),
  'invalidada',
  'la recuperacion abandonada queda invalidada'
);

select is(
  (
    select estado::text
    from public.recuperaciones_cuenta
    where id = current_setting('prueba.recuperacion7')::uuid
  ),
  'pendiente',
  'el nuevo Codigo de Comercio queda disponible'
);

select * from finish();

rollback;
