begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table(
  'public',
  'sesiones_lector_movil',
  'Existen las sesiones temporales del celular lector'
);
select has_table(
  'public',
  'lecturas_llavero_terminal',
  'Existen las lecturas efímeras enviadas a la terminal'
);
select ok(
  to_regprocedure(
    'public.crear_vinculacion_lector_terminal(uuid,text,text)'
  ) is not null,
  'La Terminal PWA puede crear una vinculación'
);
select ok(
  to_regprocedure('public.vincular_lector_movil(text,text)') is not null,
  'El celular puede canjear una vinculación de uso único'
);
select ok(
  to_regprocedure('public.registrar_lectura_llavero_terminal(text,text)') is not null,
  'El celular puede transmitir una lectura NFC'
);
select ok(
  to_regprocedure('public.consumir_lectura_llavero_terminal(uuid)') is not null,
  'La terminal puede consumir la lectura una sola vez'
);
select ok(
  not has_table_privilege('anon', 'public.sesiones_lector_movil', 'SELECT'),
  'El celular anónimo no puede leer las sesiones directamente'
);
select ok(
  not has_table_privilege('anon', 'public.lecturas_llavero_terminal', 'SELECT'),
  'El celular anónimo no puede leer las lecturas directamente'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.crear_vinculacion_lector_terminal(uuid,text,text)',
    'EXECUTE'
  ),
  'Un celular anónimo no puede crear vinculaciones'
);
select ok(
  has_function_privilege(
    'anon',
    'public.registrar_lectura_llavero_terminal(text,text)',
    'EXECUTE'
  ),
  'El celular solo puede usar la función limitada de lectura'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.consumir_lectura_llavero_terminal(uuid)',
    'EXECUTE'
  ),
  'El celular no puede consumir ni operar la lectura como terminal'
);
select ok(
  position(
    'vecino_id' in pg_get_function_result(
      'public.registrar_lectura_llavero_terminal(text,text)'::regprocedure
    )
  ) = 0,
  'La respuesta al celular no expone el ID del vecino'
);
select ok(
  position(
    'nombre_vecino' in pg_get_function_result(
      'public.registrar_lectura_llavero_terminal(text,text)'::regprocedure
    )
  ) = 0,
  'La respuesta al celular no expone el nombre del vecino'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000e101',
    'cajero-lector-a@pruebas.local',
    '{"nombre":"Cajero lector A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000e102',
    'cajero-lector-b@pruebas.local',
    '{"nombre":"Cajero lector B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000e103',
    'vecino-lector@pruebas.local',
    '{"nombre":"Vecino lector","apellido":"Prueba"}'::jsonb
  );

insert into public.negocios (id, nombre, slug, rubro, estado)
values
  (
    '41000000-0000-0000-0000-00000000e101',
    'Negocio lector A',
    'negocio-lector-a',
    'Almacén',
    'activo'
  ),
  (
    '41000000-0000-0000-0000-00000000e102',
    'Negocio lector B',
    'negocio-lector-b',
    'Panadería',
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
values
  (
    '42000000-0000-0000-0000-00000000e101',
    '41000000-0000-0000-0000-00000000e101',
    'Sucursal lector A',
    'Calle A 101',
    'Santiago',
    'activa'
  ),
  (
    '42000000-0000-0000-0000-00000000e102',
    '41000000-0000-0000-0000-00000000e102',
    'Sucursal lector B',
    'Calle B 102',
    'Santiago',
    'activa'
  );

insert into public.cajas (id, sucursal_id, nombre, codigo, estado)
values
  (
    '43000000-0000-0000-0000-00000000e101',
    '42000000-0000-0000-0000-00000000e101',
    'Caja lector A',
    'CAJA-LECTOR-A',
    'activa'
  ),
  (
    '43000000-0000-0000-0000-00000000e102',
    '42000000-0000-0000-0000-00000000e102',
    'Caja lector B',
    'CAJA-LECTOR-B',
    'activa'
  );

insert into public.miembros_negocio (negocio_id, usuario_id, rol, estado)
values
  (
    '41000000-0000-0000-0000-00000000e101',
    '00000000-0000-0000-0000-00000000e101',
    'cajero',
    'activo'
  ),
  (
    '41000000-0000-0000-0000-00000000e102',
    '00000000-0000-0000-0000-00000000e102',
    'cajero',
    'activo'
  );

insert into public.terminales (
  id,
  caja_id,
  identificador_publico,
  token_hash,
  nombre_dispositivo,
  estado
)
values
  (
    '44000000-0000-0000-0000-00000000e101',
    '43000000-0000-0000-0000-00000000e101',
    'TERMINAL-LECTOR-A',
    encode(extensions.digest(convert_to('terminal-lector-a-credencial-segura-001', 'UTF8'), 'sha256'), 'hex'),
    'Terminal lector A',
    'activa'
  ),
  (
    '44000000-0000-0000-0000-00000000e102',
    '43000000-0000-0000-0000-00000000e102',
    'TERMINAL-LECTOR-B',
    encode(extensions.digest(convert_to('terminal-lector-b-credencial-segura-002', 'UTF8'), 'sha256'), 'hex'),
    'Terminal lector B',
    'activa'
  );

insert into public.llaveros_nfc (
  id,
  vecino_id,
  token_hash,
  codigo_publico,
  estado,
  asignado_en,
  asignado_por,
  preparado_en,
  preparado_por,
  activado_en,
  activado_por,
  caja_activacion_id,
  metodo_verificacion_activacion
)
values (
  '45000000-0000-0000-0000-00000000e101',
  '00000000-0000-0000-0000-00000000e103',
  encode(extensions.digest(convert_to('llavero-lector-activo-001', 'UTF8'), 'sha256'), 'hex'),
  'CR-LECTOR-001',
  'activo',
  now(),
  '00000000-0000-0000-0000-00000000e101',
  now(),
  '00000000-0000-0000-0000-00000000e101',
  now(),
  '00000000-0000-0000-0000-00000000e101',
  '43000000-0000-0000-0000-00000000e101',
  'cedula'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e101';

do $$
declare
  v_token text;
  v_sesion_id uuid;
begin
  select vinculacion.sesion_id, vinculacion.token_vinculacion
  into v_sesion_id, v_token
  from public.crear_vinculacion_lector_terminal(
    '44000000-0000-0000-0000-00000000e101',
    'terminal-lector-a-credencial-segura-001',
    'iPhone de caja'
  ) as vinculacion;

  perform set_config('prueba.lector_sesion_id', v_sesion_id::text, true);
  perform set_config('prueba.lector_token_vinculacion', v_token, true);
end;
$$;

reset role;

select is(
  (
    select estado::text
    from public.sesiones_lector_movil
    where id = current_setting('prueba.lector_sesion_id')::uuid
  ),
  'pendiente_vinculacion',
  'La terminal genera una sesión pendiente por cinco minutos'
);
select ok(
  (
    select expira_vinculacion_en <= creado_en + interval '5 minutes 1 second'
    from public.sesiones_lector_movil
    where id = current_setting('prueba.lector_sesion_id')::uuid
  ),
  'El QR de vinculación tiene una vigencia breve'
);
select ok(
  (
    select expira_en <= creado_en + interval '16 hours 1 second'
    from public.sesiones_lector_movil
    where id = current_setting('prueba.lector_sesion_id')::uuid
  ),
  'La sesión del lector dura como máximo un turno de dieciséis horas'
);

set local role anon;

do $$
declare
  v_token_lector text;
begin
  select vinculacion.token_lector
  into v_token_lector
  from public.vincular_lector_movil(
    current_setting('prueba.lector_token_vinculacion'),
    'iPhone de caja'
  ) as vinculacion;

  perform set_config('prueba.lector_token', v_token_lector, true);
end;
$$;

reset role;

select is(
  (
    select estado::text
    from public.sesiones_lector_movil
    where id = current_setting('prueba.lector_sesion_id')::uuid
  ),
  'vinculada',
  'El celular canjea el QR y queda vinculado'
);
select is(
  (
    select token_vinculacion_hash
    from public.sesiones_lector_movil
    where id = current_setting('prueba.lector_sesion_id')::uuid
  ),
  null,
  'El código QR no puede reutilizarse después de vincular'
);

set local role anon;

select throws_ok(
  format(
    'select * from public.vincular_lector_movil(%L, %L)',
    current_setting('prueba.lector_token_vinculacion'),
    'Teléfono atacante'
  ),
  '22023',
  'El código de vinculación no es válido o ya expiró',
  'El código de vinculación es de un solo uso'
);

do $$
declare
  v_lectura_id uuid;
begin
  select lectura.lectura_id
  into v_lectura_id
  from public.registrar_lectura_llavero_terminal(
    current_setting('prueba.lector_token'),
    'llavero-lector-activo-001'
  ) as lectura;

  perform set_config('prueba.lectura_id', v_lectura_id::text, true);
end;
$$;

reset role;

select is(
  (
    select estado::text
    from public.lecturas_llavero_terminal
    where id = current_setting('prueba.lectura_id')::uuid
  ),
  'pendiente',
  'La lectura llega pendiente a la terminal'
);
select ok(
  (
    select expira_en <= leido_en + interval '30 seconds 1 millisecond'
    from public.lecturas_llavero_terminal
    where id = current_setting('prueba.lectura_id')::uuid
  ),
  'La lectura solo permanece utilizable durante treinta segundos'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e102';

select is(
  (
    select count(*)
    from public.listar_lecturas_pendientes_terminal(
      '44000000-0000-0000-0000-00000000e102'
    )
  ),
  0::bigint,
  'El otro comercio no recibe lecturas de la terminal A'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.consumir_lectura_llavero_terminal(uuid)',
    'EXECUTE'
  ),
  'Ningún comercio puede consumir una lectura sin asociarla a una operación'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e101';

select is(
  (
    select count(*)
    from public.listar_lecturas_pendientes_terminal(
      '44000000-0000-0000-0000-00000000e101'
    )
    where codigo_publico_llavero = 'CR-LECTOR-001'
      and nombre_vecino = 'Vecino lector Prueba'
  ),
  1::bigint,
  'La terminal emparejada recibe el llavero y la identidad necesaria'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.consumir_lectura_llavero_terminal(uuid)',
    'EXECUTE'
  ),
  'La Terminal PWA debe activar, comprar o canjear para consumir la lectura'
);

reset role;

select is(
  (
    select estado::text
    from public.lecturas_llavero_terminal
    where id = current_setting('prueba.lectura_id')::uuid
  ),
  'pendiente',
  'Listar la lectura no la consume ni ejecuta movimientos'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e101';

select ok(
  exists (
    select 1
    from public.listar_lecturas_pendientes_terminal(
      '44000000-0000-0000-0000-00000000e101'
    )
    where lectura_id = current_setting('prueba.lectura_id')::uuid
  ),
  'La lectura permanece disponible para una única operación atómica'
);

do $$
declare
  v_nueva_sesion_id uuid;
begin
  select vinculacion.sesion_id
  into v_nueva_sesion_id
  from public.crear_vinculacion_lector_terminal(
    '44000000-0000-0000-0000-00000000e101',
    'terminal-lector-a-credencial-segura-001',
    'Android de reemplazo'
  ) as vinculacion;

  perform set_config('prueba.lector_nueva_sesion_id', v_nueva_sesion_id::text, true);
end;
$$;

reset role;

select is(
  (
    select estado::text
    from public.sesiones_lector_movil
    where id = current_setting('prueba.lector_sesion_id')::uuid
  ),
  'reemplazada',
  'Vincular un nuevo teléfono invalida el anterior'
);
select is(
  (
    select count(*)
    from public.sesiones_lector_movil
    where terminal_id = '44000000-0000-0000-0000-00000000e101'
      and estado in ('pendiente_vinculacion', 'vinculada')
  ),
  1::bigint,
  'Solo existe un lector activo o pendiente por terminal'
);

set local role anon;

select throws_ok(
  format(
    'select * from public.registrar_lectura_llavero_terminal(%L, %L)',
    current_setting('prueba.lector_token'),
    'llavero-lector-activo-001'
  ),
  '42501',
  'La sesión del lector no es válida o expiró',
  'El teléfono reemplazado ya no puede enviar lecturas'
);

reset role;

select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lecturas_llavero_terminal'
  ),
  'Las lecturas están habilitadas para actualización en tiempo real'
);

select * from finish();
rollback;
