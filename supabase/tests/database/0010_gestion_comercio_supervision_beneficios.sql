begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table(
  'public',
  'registro_supervision_beneficios',
  'Existe la bitácora de supervisión de beneficios'
);
select ok(
  to_regprocedure(
    'public.cambiar_estado_beneficio_regis(uuid,public.estado_beneficio_regis,text)'
  ) is not null,
  'Existe el cambio de estado controlado de beneficios'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.registro_supervision_beneficios',
    'INSERT'
  ),
  'El frontend no puede escribir la bitácora directamente'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000fa01',
    'propietario-beneficios@pruebas.local',
    '{"nombre":"Propietario Beneficios"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fa02',
    'administrador-beneficios@pruebas.local',
    '{"nombre":"Administrador Beneficios"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fa03',
    'cajero-beneficios@pruebas.local',
    '{"nombre":"Cajero Beneficios"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fa04',
    'propietario-otro-beneficio@pruebas.local',
    '{"nombre":"Propietario Otro Beneficio"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fa05',
    'supervisor-regalones@pruebas.local',
    '{"nombre":"Supervisor Regalones"}'::jsonb
  );

update public.perfiles
set rol_plataforma = 'admin_regalones'
where id = '00000000-0000-0000-0000-00000000fa05';

insert into public.negocios (id, nombre, slug, rut, rubro, estado)
values
  (
    '96000000-0000-4000-8000-000000000001',
    'Comercio Gestión Beneficios',
    'comercio-gestion-beneficios',
    '99999993K',
    'Almacén',
    'activo'
  ),
  (
    '96000000-0000-4000-8000-000000000002',
    'Otro Comercio Gestión Beneficios',
    'otro-comercio-gestion-beneficios',
    '999999921',
    'Panadería',
    'activo'
  );

insert into public.miembros_negocio (negocio_id, usuario_id, rol, estado)
values
  (
    '96000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000fa01',
    'propietario',
    'activo'
  ),
  (
    '96000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000fa02',
    'administrador',
    'activo'
  ),
  (
    '96000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-00000000fa03',
    'cajero',
    'activo'
  ),
  (
    '96000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-00000000fa04',
    'propietario',
    'activo'
  );

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fa01';

select lives_ok(
  $$
    select public.crear_beneficio_regis(
      '96000000-0000-4000-8000-000000000001',
      'descuento-gestion-mvp',
      '$500 de descuento MVP',
      'monto_fijo',
      10,
      10000,
      null,
      500,
      null,
      100,
      1,
      now(),
      now() + interval '30 days',
      true,
      'Beneficio creado por el comercio',
      true
    )
  $$,
  'El propietario publica directamente un beneficio válido'
);
select is(
  (
    select accion::text
    from public.registro_supervision_beneficios
    where beneficio_id = (
      select id from public.beneficios_regis
      where codigo = 'descuento-gestion-mvp'
    )
    order by creado_en desc
    limit 1
  ),
  'publicado',
  'La publicación queda registrada para supervisión'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fa03';

select throws_ok(
  $$
    select public.crear_beneficio_regis(
      '96000000-0000-4000-8000-000000000001',
      'beneficio-cajero-prohibido',
      'Beneficio del cajero',
      'monto_fijo',
      10,
      10000,
      null,
      500,
      null,
      10,
      1,
      now(),
      now() + interval '1 day',
      true,
      null,
      false
    )
  $$,
  '42501',
  'No tienes permisos para crear beneficios en este negocio',
  'El cajero no puede crear beneficios'
);
select throws_ok(
  $$
    select public.cambiar_estado_beneficio_regis(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'descuento-gestion-mvp'
          and version_beneficio.estado = 'activo'
      ),
      'pausado',
      'Intento del cajero'
    )
  $$,
  '42501',
  'No tienes permisos para administrar este beneficio',
  'El cajero no puede modificar el estado del beneficio'
);
select is(
  (
    select count(*)
    from public.registro_supervision_beneficios
    where negocio_id = '96000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'El cajero no puede leer la bitácora de supervisión'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fa02';

select lives_ok(
  $$
    select public.cambiar_estado_beneficio_regis(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'descuento-gestion-mvp'
          and version_beneficio.estado = 'activo'
      ),
      'pausado',
      'Pausa solicitada por el comercio'
    )
  $$,
  'El administrador del comercio puede pausar su beneficio'
);
select lives_ok(
  $$
    select public.cambiar_estado_beneficio_regis(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'descuento-gestion-mvp'
          and version_beneficio.estado = 'pausado'
      ),
      'activo',
      'Reactivación solicitada por el comercio'
    )
  $$,
  'El administrador del comercio puede reactivar su beneficio'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fa04';

select throws_ok(
  $$
    select public.cambiar_estado_beneficio_regis(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'descuento-gestion-mvp'
          and version_beneficio.estado = 'activo'
      ),
      'pausado',
      'Intento desde otro comercio'
    )
  $$,
  '42501',
  'No tienes permisos para administrar este beneficio',
  'Otro comercio no puede pausar un beneficio ajeno'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fa05';

select lives_ok(
  $$
    select public.cambiar_estado_beneficio_regis(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'descuento-gestion-mvp'
          and version_beneficio.estado = 'activo'
      ),
      'pausado',
      'Condiciones engañosas detectadas'
    )
  $$,
  'Regalones puede pausar un beneficio por supervisión'
);
select is(
  (
    select motivo
    from public.registro_supervision_beneficios
    where beneficio_id = (
      select id from public.beneficios_regis
      where codigo = 'descuento-gestion-mvp'
    )
      and accion = 'pausado'
    order by creado_en desc
    limit 1
  ),
  'Condiciones engañosas detectadas',
  'La pausa administrativa conserva su motivo'
);
select throws_ok(
  $$
    select public.cambiar_estado_beneficio_regis(
      (
        select version_beneficio.id
        from public.versiones_beneficio_regis as version_beneficio
        join public.beneficios_regis as beneficio
          on beneficio.id = version_beneficio.beneficio_id
        where beneficio.codigo = 'descuento-gestion-mvp'
          and version_beneficio.estado = 'pausado'
      ),
      'activo',
      'Reactivación desde Regalones'
    )
  $$,
  '42501',
  'La supervisión de Regalones solo puede pausar beneficios',
  'Regalones no sustituye al comercio al reactivar beneficios'
);

reset role;

select * from finish();
rollback;
