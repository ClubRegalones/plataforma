begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(41);

select ok(
  to_regprocedure('public.cancelar_solicitud_llavero(uuid)') is not null,
  'Existe cancelar_solicitud_llavero'
);
select ok(
  to_regprocedure('public.programar_entrega_llavero(uuid,timestamp with time zone,text)') is not null,
  'Existe programar_entrega_llavero'
);
select ok(
  to_regprocedure('public.entregar_llavero(uuid,text,text)') is not null,
  'Existe entregar_llavero'
);
select ok(
  to_regprocedure('public.cambiar_estado_llavero(uuid,estado_llavero_nfc)') is not null,
  'Existe cambiar_estado_llavero'
);
select ok(
  to_regprocedure('public.listar_gestion_llaveros()') is not null,
  'Existe listar_gestion_llaveros'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.entregar_llavero(uuid,text,text)',
    'EXECUTE'
  ),
  'Los usuarios autenticados pueden invocar entregar_llavero'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.entregar_llavero(uuid,text,text)',
    'EXECUTE'
  ),
  'Los usuarios anónimos no pueden invocar entregar_llavero'
);
select ok(
  position(
    'token_hash' in pg_get_function_result(
      'public.listar_gestion_llaveros()'::regprocedure
    )
  ) = 0,
  'El listado administrativo no devuelve token_hash'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000f001',
    'admin-flujo-llaveros@pruebas.local',
    '{"nombre":"Admin Flujo"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f002',
    'vecino-flujo-llaveros@pruebas.local',
    '{"nombre":"Vecino Flujo"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000f003',
    'otro-flujo-llaveros@pruebas.local',
    '{"nombre":"Otro Vecino"}'::jsonb
  );

update public.perfiles
set rol_plataforma = 'admin_regalones'
where id = '00000000-0000-0000-0000-00000000f001';

update public.perfiles
set modalidad_atencion = 'asistida'
where id = '00000000-0000-0000-0000-00000000f002';

insert into public.negocios (id, nombre, slug, rut, rubro, estado)
values (
  '20000000-0000-0000-0000-00000000f001',
  'Negocio Flujo Llaveros',
  'negocio-flujo-llaveros',
  '99999993K',
  'Almacén',
  'activo'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f002';

select lives_ok(
  $$
    insert into public.solicitudes_llavero (
      vecino_id,
      negocio_solicitud_id,
      observaciones
    ) values (
      '00000000-0000-0000-0000-00000000f002',
      '20000000-0000-0000-0000-00000000f001',
      'Solicitud que será cancelada'
    )
  $$,
  'El vecino crea una solicitud para cancelarla'
);
select throws_ok(
  $$select * from public.listar_gestion_llaveros()$$,
  '42501',
  'Solo un administrador de Club Regalones puede gestionar llaveros',
  'Un vecino no puede abrir el listado administrativo'
);
select is(
  (
    select estado::text
    from public.cancelar_solicitud_llavero(
      (
        select id
        from public.solicitudes_llavero
        where observaciones = 'Solicitud que será cancelada'
      )
    )
  ),
  'cancelada',
  'El vecino cancela su propia solicitud activa'
);
select is(
  (
    select estado::text
    from public.solicitudes_llavero
    where observaciones = 'Solicitud que será cancelada'
  ),
  'cancelada',
  'La cancelación queda persistida'
);
select is(
  (
    select estado::text
    from public.cancelar_solicitud_llavero(
      (
        select id
        from public.solicitudes_llavero
        where observaciones = 'Solicitud que será cancelada'
      )
    )
  ),
  'cancelada',
  'Cancelar nuevamente es idempotente'
);
select lives_ok(
  $$
    insert into public.solicitudes_llavero (
      vecino_id,
      negocio_solicitud_id,
      observaciones
    ) values (
      '00000000-0000-0000-0000-00000000f002',
      '20000000-0000-0000-0000-00000000f001',
      'Primera entrega'
    )
  $$,
  'El vecino crea una nueva solicitud después de cancelar'
);

reset role;
do $$
begin
  perform set_config(
    'prueba.solicitud_primera_entrega_id',
    (
      select id::text
      from public.solicitudes_llavero
      where observaciones = 'Primera entrega'
    ),
    true
  );
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f002';

select throws_ok(
  $$
    select *
    from public.programar_entrega_llavero(
      current_setting('prueba.solicitud_primera_entrega_id')::uuid,
      now() + interval '1 day',
      null
    )
  $$,
  '42501',
  'Solo un administrador de Club Regalones puede programar entregas',
  'Un vecino no puede programar la entrega'
);
select throws_ok(
  $$
    select *
    from public.entregar_llavero(
      current_setting('prueba.solicitud_primera_entrega_id')::uuid,
      'token-no-autorizado-001',
      'CR-NO-AUTORIZADO'
    )
  $$,
  '42501',
  'Solo un administrador de Club Regalones puede entregar llaveros',
  'Un vecino no puede asignar un llavero'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f001';

select throws_ok(
  $$
    select *
    from public.programar_entrega_llavero(
      current_setting('prueba.solicitud_primera_entrega_id')::uuid,
      now() - interval '1 minute',
      null
    )
  $$,
  '22023',
  'La fecha de entrega debe ser futura',
  'La entrega no puede programarse en el pasado'
);
select lives_ok(
  $$
    select *
    from public.programar_entrega_llavero(
      current_setting('prueba.solicitud_primera_entrega_id')::uuid,
      now() + interval '1 day',
      'Entrega coordinada'
    )
  $$,
  'El administrador programa la entrega'
);
select is(
  (
    select estado::text
    from public.solicitudes_llavero
    where id = current_setting('prueba.solicitud_primera_entrega_id')::uuid
  ),
  'programada_entrega',
  'La solicitud queda programada'
);
select lives_ok(
  $$
    select *
    from public.entregar_llavero(
      current_setting('prueba.solicitud_primera_entrega_id')::uuid,
      'token-fisico-primero-001',
      'cr-publico-001'
    )
  $$,
  'El administrador entrega el primer llavero'
);
select is(
  (
    select estado::text
    from public.solicitudes_llavero
    where id = current_setting('prueba.solicitud_primera_entrega_id')::uuid
  ),
  'entregada',
  'La solicitud queda entregada en la misma operación'
);

reset role;

select isnt(
  (
    select token_hash
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.solicitud_primera_entrega_id')::uuid
  ),
  'token-fisico-primero-001',
  'El token físico nunca se almacena en texto plano'
);
select is(
  (
    select token_hash
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.solicitud_primera_entrega_id')::uuid
  ),
  encode(
    extensions.digest(
      convert_to('token-fisico-primero-001', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'La entrega almacena el hash SHA-256 correcto'
);
select is(
  (
    select codigo_publico::text
    from public.llaveros_nfc
    where solicitud_id = current_setting('prueba.solicitud_primera_entrega_id')::uuid
  ),
  'CR-PUBLICO-001',
  'El código público se normaliza a mayúsculas'
);
select is(
  (
    select count(*)
    from public.llaveros_nfc
    where vecino_id = '00000000-0000-0000-0000-00000000f002'
      and estado = 'activo'
  ),
  1::bigint,
  'El vecino queda con un único llavero activo'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f001';

select lives_ok(
  $$
    select *
    from public.entregar_llavero(
      current_setting('prueba.solicitud_primera_entrega_id')::uuid,
      'otro-token-que-no-se-usara',
      'OTRO-CODIGO'
    )
  $$,
  'Repetir la entrega devuelve el llavero ya asignado'
);

reset role;

select is(
  (
    select count(*)
    from public.llaveros_nfc
    where vecino_id = '00000000-0000-0000-0000-00000000f002'
  ),
  1::bigint,
  'La entrega idempotente no crea duplicados'
);

reset role;
do $$
begin
  perform set_config(
    'prueba.llavero_anterior_id',
    (
      select id::text
      from public.llaveros_nfc
      where solicitud_id = current_setting('prueba.solicitud_primera_entrega_id')::uuid
    ),
    true
  );
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f002';

select is(
  (select count(codigo_publico) from public.llaveros_nfc),
  1::bigint,
  'El vecino consulta los datos básicos de su llavero'
);
select throws_ok(
  $$
    select *
    from public.cambiar_estado_llavero(
      current_setting('prueba.llavero_anterior_id')::uuid,
      'perdido'
    )
  $$,
  '42501',
  'Solo un administrador de Club Regalones puede cambiar el estado del llavero',
  'El vecino no puede cambiar directamente el estado del llavero'
);
select lives_ok(
  $$
    insert into public.solicitudes_llavero (
      vecino_id,
      negocio_solicitud_id,
      observaciones
    ) values (
      '00000000-0000-0000-0000-00000000f002',
      '20000000-0000-0000-0000-00000000f001',
      'Reemplazo por pérdida'
    )
  $$,
  'El vecino solicita un reemplazo después de la entrega'
);

reset role;
do $$
begin
  perform set_config(
    'prueba.solicitud_reemplazo_id',
    (
      select id::text
      from public.solicitudes_llavero
      where observaciones = 'Reemplazo por pérdida'
    ),
    true
  );
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f001';

select lives_ok(
  $$
    select *
    from public.programar_entrega_llavero(
      current_setting('prueba.solicitud_reemplazo_id')::uuid,
      now() + interval '2 days',
      'Reposición coordinada'
    )
  $$,
  'El administrador programa la reposición'
);
select lives_ok(
  $$
    select *
    from public.cambiar_estado_llavero(
      current_setting('prueba.llavero_anterior_id')::uuid,
      'perdido'
    )
  $$,
  'El administrador marca el llavero anterior como perdido'
);
select throws_ok(
  $$
    select *
    from public.cambiar_estado_llavero(
      current_setting('prueba.llavero_anterior_id')::uuid,
      'bloqueado'
    )
  $$,
  '23514',
  'La transición de estado del llavero no está permitida',
  'Un llavero perdido no vuelve al estado bloqueado'
);
select lives_ok(
  $$
    select *
    from public.entregar_llavero(
      current_setting('prueba.solicitud_reemplazo_id')::uuid,
      'token-fisico-reemplazo-002',
      'CR-PUBLICO-002'
    )
  $$,
  'La reposición se entrega de forma atómica'
);

reset role;

select is(
  (
    select count(*)
    from public.llaveros_nfc
    where vecino_id = '00000000-0000-0000-0000-00000000f002'
      and estado = 'activo'
  ),
  1::bigint,
  'La reposición mantiene un solo llavero activo'
);
select is(
  (
    select estado::text
    from public.llaveros_nfc
    where id = current_setting('prueba.llavero_anterior_id')::uuid
  ),
  'perdido',
  'El llavero anterior conserva su estado histórico de pérdida'
);
select ok(
  (
    select reemplazado_por_id is not null
    from public.llaveros_nfc
    where id = current_setting('prueba.llavero_anterior_id')::uuid
  ),
  'El llavero anterior apunta a su reemplazo'
);
select is(
  (
    select estado::text
    from public.solicitudes_llavero
    where id = current_setting('prueba.solicitud_reemplazo_id')::uuid
  ),
  'entregada',
  'La solicitud de reposición queda entregada'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000f001';

select is(
  (select count(*) from public.listar_gestion_llaveros()),
  3::bigint,
  'El administrador ve todo el historial de solicitudes'
);
select is(
  (
    select nombre_vecino
    from public.listar_gestion_llaveros()
    limit 1
  ),
  'Vecino Flujo',
  'El listado identifica al vecino sin exponer secretos del llavero'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.llaveros_nfc',
    'token_hash',
    'SELECT'
  ),
  'El nuevo flujo mantiene token_hash fuera del frontend'
);

reset role;
select * from finish();
rollback;
