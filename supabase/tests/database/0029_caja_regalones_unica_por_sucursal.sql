begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select ok(
  to_regprocedure('public.preparar_caja_regalones(uuid)') is not null,
  'Existe preparar_caja_regalones'
);

select ok(
  to_regprocedure('public.mover_terminal_pwa(uuid,text,text)') is not null,
  'Existe mover_terminal_pwa'
);

insert into auth.users (
  id,
  email,
  raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-00000000e229',
  'propietario-caja-regalones@pruebas.local',
  '{"nombre":"Propietario Caja Regalones"}'::jsonb
);

insert into public.negocios (
  id,
  nombre,
  slug,
  rubro,
  estado
)
values (
  '51000000-0000-0000-0000-00000000e229',
  'Negocio Caja Regalones',
  'negocio-caja-regalones',
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
  '52000000-0000-0000-0000-00000000e229',
  '51000000-0000-0000-0000-00000000e229',
  'Sucursal Caja Regalones',
  'Calle Piloto 229',
  'La Serena',
  'activa'
);

insert into public.miembros_negocio (
  negocio_id,
  usuario_id,
  rol,
  estado
)
values (
  '51000000-0000-0000-0000-00000000e229',
  '00000000-0000-0000-0000-00000000e229',
  'propietario',
  'activo'
);

set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000e229';

do $$
declare
  v_caja_id uuid;
begin
  select resultado.caja_id
  into v_caja_id
  from public.preparar_caja_regalones(
    '52000000-0000-0000-0000-00000000e229'
  ) as resultado;

  perform set_config(
    'prueba.caja_regalones_id',
    v_caja_id::text,
    true
  );
end;
$$;

reset role;

select is(
  (
    select count(*)
    from public.cajas
    where sucursal_id = '52000000-0000-0000-0000-00000000e229'
      and estado = 'activa'
  ),
  1::bigint,
  'La preparación crea una sola Caja Regalones activa'
);

select is(
  (
    select nombre
    from public.cajas
    where id = current_setting('prueba.caja_regalones_id')::uuid
  ),
  'Caja Regalones',
  'La caja lógica usa el nombre Caja Regalones'
);

set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000e229';

select lives_ok(
  $$
    select *
    from public.preparar_caja_regalones(
      '52000000-0000-0000-0000-00000000e229'
    )
  $$,
  'Preparar de nuevo reutiliza la Caja Regalones existente'
);

select lives_ok(
  format(
    'select * from public.registrar_terminal_pwa(%L::uuid, %L, %L)',
    current_setting('prueba.caja_regalones_id'),
    'Equipo piloto original',
    '1.0.0'
  ),
  'Se puede instalar la primera Terminal'
);

do $$
declare
  v_terminal_id uuid;
begin
  select terminal.id
  into v_terminal_id
  from public.terminales as terminal
  where terminal.caja_id =
    current_setting('prueba.caja_regalones_id')::uuid
    and terminal.estado = 'activa'
  limit 1;

  perform set_config(
    'prueba.terminal_anterior_id',
    v_terminal_id::text,
    true
  );
end;
$$;

select lives_ok(
  format(
    'select * from public.mover_terminal_pwa(%L::uuid, %L, %L)',
    current_setting('prueba.caja_regalones_id'),
    'Equipo piloto nuevo',
    '1.0.1'
  ),
  'Mover Terminal registra el nuevo dispositivo'
);

reset role;

select is(
  (
    select estado::text
    from public.terminales
    where id = current_setting('prueba.terminal_anterior_id')::uuid
  ),
  'revocada',
  'La Terminal anterior queda revocada'
);

select is(
  (
    select count(*)
    from public.terminales
    where caja_id = current_setting('prueba.caja_regalones_id')::uuid
      and estado <> 'revocada'
  ),
  1::bigint,
  'Solo queda una Terminal no revocada en la Caja Regalones'
);

select throws_ok(
  format(
    'insert into public.cajas (sucursal_id, nombre, estado) values (%L::uuid, %L, %L)',
    '52000000-0000-0000-0000-00000000e229',
    'Otra caja activa',
    'activa'
  ),
  '23505',
  'Esta sucursal ya tiene una Caja Regalones activa',
  'No se permite una segunda caja activa en la sucursal'
);

select * from finish();
rollback;
