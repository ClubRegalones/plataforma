begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select ok(
  to_regprocedure(
    'public.eliminar_caja_sin_uso(uuid)'
  ) is not null,
  'Existe la eliminación protegida de cajas sin uso'
);

insert into auth.users (
  id,
  email,
  raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-00000000e227',
  'propietario-eliminar-caja@pruebas.local',
  '{"nombre":"Propietario Eliminar Caja"}'::jsonb
);

insert into public.negocios (
  id,
  nombre,
  slug,
  rubro,
  estado
)
values (
  '51000000-0000-0000-0000-00000000e227',
  'Negocio Eliminar Caja',
  'negocio-eliminar-caja',
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
  '52000000-0000-0000-0000-00000000e227',
  '51000000-0000-0000-0000-00000000e227',
  'Sucursal Eliminar Caja',
  'Calle Caja 227',
  'Santiago',
  'activa'
);

insert into public.cajas (
  id,
  sucursal_id,
  nombre,
  estado
)
values
  (
    '53000000-0000-0000-0000-00000000e227',
    '52000000-0000-0000-0000-00000000e227',
    'Caja eliminable',
    'activa'
  ),
  (
    '53000000-0000-0000-0000-00000000e228',
    '52000000-0000-0000-0000-00000000e227',
    'Caja histórica con terminal',
    'inactiva'
  );

insert into public.miembros_negocio (
  negocio_id,
  usuario_id,
  rol,
  estado
)
values (
  '51000000-0000-0000-0000-00000000e227',
  '00000000-0000-0000-0000-00000000e227',
  'propietario',
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
values (
  '54000000-0000-0000-0000-00000000e227',
  '53000000-0000-0000-0000-00000000e228',
  'TPWA-ELIMINAR-CAJA-227',
  repeat('a', 64),
  'Terminal histórica',
  'revocada'
);

set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000e227';

select is(
  public.eliminar_caja_sin_uso(
    '53000000-0000-0000-0000-00000000e227'
  ),
  true,
  'El propietario elimina una caja que nunca fue usada'
);

select throws_ok(
  $$
    select public.eliminar_caja_sin_uso(
      '53000000-0000-0000-0000-00000000e228'
    )
  $$,
  '23503',
  'Esta caja ya tiene historial de Terminales y no puede eliminarse',
  'Una caja con historial de Terminal no puede eliminarse'
);

reset role;

select is(
  (
    select count(*)
    from public.cajas
    where id =
      '53000000-0000-0000-0000-00000000e227'
  ),
  0::bigint,
  'La caja sin uso desaparece de la base de datos'
);

select is(
  (
    select count(*)
    from public.cajas
    where id =
      '53000000-0000-0000-0000-00000000e228'
  ),
  1::bigint,
  'La caja con historial se conserva'
);

select * from finish();

rollback;