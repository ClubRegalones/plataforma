begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select ok(
  to_regprocedure('public.registrar_terminal_pwa(uuid,text,text)') is not null,
  'Existe el registro seguro de la Terminal PWA'
);
select ok(
  to_regprocedure('public.validar_terminal_pwa(uuid,text,text)') is not null,
  'Existe la validación de la credencial local de la terminal'
);
select ok(
  to_regprocedure(
    'public.crear_vinculacion_lector_terminal(uuid,text,text)'
  ) is not null,
  'Existe la vinculación protegida por la credencial de terminal'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.crear_vinculacion_lector_movil(uuid,text)',
    'EXECUTE'
  ),
  'La vinculación anterior sin credencial ya no es pública'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.registrar_terminal_pwa(uuid,text,text)',
    'EXECUTE'
  ),
  'Un usuario anónimo no registra terminales'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000e201',
    'propietario-terminal@pruebas.local',
    '{"nombre":"Propietario Terminal"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000e202',
    'cajero-terminal@pruebas.local',
    '{"nombre":"Cajero Terminal"}'::jsonb
  );

insert into public.negocios (id, nombre, slug, rubro, estado)
values (
  '51000000-0000-0000-0000-00000000e201',
  'Negocio Terminal PWA',
  'negocio-terminal-pwa',
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
  '52000000-0000-0000-0000-00000000e201',
  '51000000-0000-0000-0000-00000000e201',
  'Sucursal Terminal PWA',
  'Calle PWA 201',
  'Santiago',
  'activa'
);

insert into public.cajas (id, sucursal_id, nombre, codigo, estado)
values (
  '53000000-0000-0000-0000-00000000e201',
  '52000000-0000-0000-0000-00000000e201',
  'Caja Terminal PWA',
  'CAJA-PWA-201',
  'activa'
);

insert into public.miembros_negocio (negocio_id, usuario_id, rol, estado)
values
  (
    '51000000-0000-0000-0000-00000000e201',
    '00000000-0000-0000-0000-00000000e201',
    'propietario',
    'activo'
  ),
  (
    '51000000-0000-0000-0000-00000000e201',
    '00000000-0000-0000-0000-00000000e202',
    'cajero',
    'activo'
  );

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e202';

select throws_ok(
  $$
    select * from public.registrar_terminal_pwa(
      '53000000-0000-0000-0000-00000000e201',
      'Equipo del cajero',
      '1.0.0'
    )
  $$,
  '42501',
  'Solo el propietario o administrador puede registrar una terminal',
  'Un cajero no registra nuevos equipos'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e201';

do $$
declare
  v_terminal_id uuid;
  v_token text;
begin
  select registro.terminal_id, registro.token_terminal
  into v_terminal_id, v_token
  from public.registrar_terminal_pwa(
    '53000000-0000-0000-0000-00000000e201',
    'Caja principal PWA',
    '1.0.0'
  ) as registro;

  perform set_config('prueba.pwa_terminal_id', v_terminal_id::text, true);
  perform set_config('prueba.pwa_terminal_token', v_token, true);
end;
$$;

reset role;

select is(
  (
    select estado::text
    from public.terminales
    where id = current_setting('prueba.pwa_terminal_id')::uuid
  ),
  'activa',
  'El propietario registra el navegador como terminal activa'
);
select ok(
  (
    select token_hash <> current_setting('prueba.pwa_terminal_token')
    from public.terminales
    where id = current_setting('prueba.pwa_terminal_id')::uuid
  ),
  'Supabase solo conserva el hash de la credencial'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e201';

select is(
  (
    select count(*)
    from public.validar_terminal_pwa(
      current_setting('prueba.pwa_terminal_id')::uuid,
      current_setting('prueba.pwa_terminal_token'),
      '1.0.1'
    )
    where valida
  ),
  1::bigint,
  'La credencial guardada localmente valida la terminal'
);
select throws_ok(
  format(
    'select * from public.validar_terminal_pwa(%L::uuid, %L, %L)',
    current_setting('prueba.pwa_terminal_id'),
    'token-terminal-incorrecto-que-no-debe-validar',
    '1.0.1'
  ),
  '42501',
  'La terminal no existe, fue revocada o no pertenece al comercio',
  'Una credencial incorrecta no valida el equipo'
);
select lives_ok(
  format(
    'select * from public.crear_vinculacion_lector_terminal(%L::uuid, %L, %L)',
    current_setting('prueba.pwa_terminal_id'),
    current_setting('prueba.pwa_terminal_token'),
    'Celular lector del turno'
  ),
  'La terminal registrada puede crear el QR del lector'
);
select throws_ok(
  format(
    'select * from public.crear_vinculacion_lector_terminal(%L::uuid, %L, %L)',
    current_setting('prueba.pwa_terminal_id'),
    'token-terminal-incorrecto-que-no-debe-validar',
    'Celular no autorizado'
  ),
  '42501',
  'La credencial de la terminal no es válida',
  'No se genera un QR sin la credencial local correcta'
);

select * from finish();
rollback;
