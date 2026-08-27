begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_type(
  'public',
  'destino_notificacion_canje_regis',
  'Existe el destinatario tipado de las notificaciones de canje'
);
select has_column(
  'public',
  'canjes_regis',
  'leido_vecino_en',
  'El canje conserva la lectura del vecino'
);
select has_column(
  'public',
  'canjes_regis',
  'leido_negocio_en',
  'El canje conserva la lectura compartida del negocio'
);
select has_column(
  'public',
  'canjes_regis',
  'leido_admin_regalones_en',
  'El canje conserva la lectura de Regalones'
);
select ok(
  to_regprocedure('public.listar_historial_canjes_vecino(integer)') is not null,
  'Existe el historial privado del vecino'
);
select ok(
  to_regprocedure(
    'public.listar_historial_canjes_negocio(uuid,uuid,integer)'
  ) is not null,
  'Existe el historial seguro del negocio'
);
select ok(
  to_regprocedure(
    'public.listar_historial_canjes_admin(uuid,uuid,integer)'
  ) is not null,
  'Existe el historial global de administración'
);
select ok(
  to_regprocedure(
    'public.marcar_canje_regis_leido(uuid,destino_notificacion_canje_regis)'
  ) is not null,
  'Existe la confirmación de lectura por destinatario'
);
select ok(
  to_regprocedure(
    'public.contar_notificaciones_canjes_regis(destino_notificacion_canje_regis,uuid)'
  ) is not null,
  'Existe el contador de canjes nuevos'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000fd01',
    'vecino-historial@pruebas.local',
    '{"nombre":"Vecino Historial"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fd02',
    'cajero-historial@pruebas.local',
    '{"nombre":"Cajero Historial"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fd03',
    'admin-historial@pruebas.local',
    '{"nombre":"Admin Historial"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000fd04',
    'ajeno-historial@pruebas.local',
    '{"nombre":"Usuario Ajeno"}'::jsonb
  );

update public.perfiles
set rol_plataforma = 'admin_regalones'
where id = '00000000-0000-0000-0000-00000000fd03';

insert into public.negocios (id, nombre, slug, rubro, estado)
values (
  '99000000-0000-4000-8000-000000000001',
  'Comercio Historial',
  'comercio-historial-canjes',
  'Almacén',
  'activo'
);

insert into public.sucursales (
  id, negocio_id, nombre, direccion, comuna, estado
)
values (
  '99000000-0000-4000-8000-000000000002',
  '99000000-0000-4000-8000-000000000001',
  'Sucursal Historial',
  'Calle Historial 100',
  'Santiago',
  'activa'
);

insert into public.cajas (id, sucursal_id, nombre, codigo, estado)
values (
  '99000000-0000-4000-8000-000000000003',
  '99000000-0000-4000-8000-000000000002',
  'Caja Historial',
  'CAJA-HIST',
  'activa'
);

insert into public.miembros_negocio (negocio_id, usuario_id, rol, estado)
values (
  '99000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-00000000fd02',
  'cajero',
  'activo'
);

insert into public.reglas_regis (
  id, negocio_id, version, tasa_acumulacion_bp, valor_regis_clp,
  monto_minimo_compra_clp, porcentaje_maximo_canje_bp,
  conservar_remanente, activa
)
values (
  '99000000-0000-4000-8000-000000000004',
  '99000000-0000-4000-8000-000000000001',
  1,
  500,
  50,
  1000,
  5000,
  true,
  true
);

insert into public.beneficios_regis (
  id, negocio_id, codigo, creado_por
)
values (
  '99000000-0000-4000-8000-000000000005',
  '99000000-0000-4000-8000-000000000001',
  'beneficio-historial',
  '00000000-0000-0000-0000-00000000fd02'
);

insert into public.versiones_beneficio_regis (
  id, beneficio_id, version, nombre, descripcion, tipo,
  monto_descuento_fijo_clp, costo_regis, compra_minima_clp,
  cupos_totales, limite_por_vecino, mostrar_cupos, regla_regis_id,
  valor_regis_clp, porcentaje_maximo_canje_bp, estado,
  vigencia_desde, vigencia_hasta, publicado_en, creado_por
)
values (
  '99000000-0000-4000-8000-000000000006',
  '99000000-0000-4000-8000-000000000005',
  1,
  'Descuento historial',
  'Beneficio utilizado para probar los avisos',
  'monto_fijo',
  500,
  10,
  10000,
  20,
  2,
  true,
  '99000000-0000-4000-8000-000000000004',
  50,
  5000,
  'activo',
  now() - interval '1 hour',
  now() + interval '1 day',
  now() - interval '1 hour',
  '00000000-0000-0000-0000-00000000fd02'
);

insert into public.solicitudes_compra (
  id, vecino_id, caja_id, monto_informado, informado_por,
  estado, expira_en, idempotency_key
)
values (
  '99000000-0000-4000-8000-000000000007',
  '00000000-0000-0000-0000-00000000fd01',
  '99000000-0000-4000-8000-000000000003',
  9500,
  'cajero',
  'aprobada',
  now() + interval '15 minutes',
  'historial-solicitud-001'
);

insert into public.compras (
  id, solicitud_id, negocio_id, sucursal_id, caja_id, vecino_id,
  cajero_id, monto_final, origen, monto_bruto_clp,
  descuento_total_clp, aporte_promocional_clp, regis_utilizados
)
values (
  '99000000-0000-4000-8000-000000000008',
  '99000000-0000-4000-8000-000000000007',
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  '99000000-0000-4000-8000-000000000003',
  '00000000-0000-0000-0000-00000000fd01',
  '00000000-0000-0000-0000-00000000fd02',
  9500,
  'autoservicio',
  10000,
  500,
  0,
  10
);

insert into public.canjes_regis (
  id, beneficio_id, beneficio_version_id, negocio_id, vecino_id,
  caja_id, compra_id, origen, estado, codigo_publico, qr_token_hash,
  costo_regis, valor_regis_clp, regla_regis_id,
  monto_compra_bruto_clp, descuento_total_clp,
  valor_financiado_regis_clp, aporte_promocional_negocio_clp,
  monto_final_pagado_clp, idempotency_key, reservado_en, expira_en,
  confirmado_en
)
values (
  '99000000-0000-4000-8000-000000000009',
  '99000000-0000-4000-8000-000000000005',
  '99000000-0000-4000-8000-000000000006',
  '99000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-00000000fd01',
  '99000000-0000-4000-8000-000000000003',
  '99000000-0000-4000-8000-000000000008',
  'qr',
  'confirmado',
  'CRJ-HISTORIAL-001',
  repeat('a', 64),
  10,
  50,
  '99000000-0000-4000-8000-000000000004',
  10000,
  500,
  500,
  0,
  9500,
  'historial-canje-001',
  now() - interval '2 minutes',
  now() + interval '8 minutes',
  now()
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fd01';

select is(
  (select count(*) from public.listar_historial_canjes_vecino()),
  1::bigint,
  'El vecino recibe el canje confirmado en su historial'
);
select is(
  public.contar_notificaciones_canjes_regis('vecino', null),
  1::bigint,
  'El canje nuevo genera una notificación para el vecino'
);
select lives_ok(
  $$
    select public.marcar_canje_regis_leido(
      '99000000-0000-4000-8000-000000000009',
      'vecino'
    )
  $$,
  'El vecino marca su aviso como revisado'
);
select is(
  public.contar_notificaciones_canjes_regis('vecino', null),
  0::bigint,
  'La notificación del vecino desaparece después de revisarla'
);
select throws_ok(
  $$
    select public.marcar_canje_regis_leido(
      '99000000-0000-4000-8000-000000000009',
      'negocio'
    )
  $$,
  '42501',
  'No perteneces al negocio de este canje',
  'El vecino no puede limpiar la notificación del negocio'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fd02';

select is(
  (
    select count(*)
    from public.listar_historial_canjes_negocio(
      '99000000-0000-4000-8000-000000000001',
      '99000000-0000-4000-8000-000000000005',
      100
    )
  ),
  1::bigint,
  'El negocio consulta el historial filtrado por beneficio'
);
select is(
  public.contar_notificaciones_canjes_regis(
    'negocio',
    '99000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'El negocio recibe su notificación compartida'
);
select lives_ok(
  $$
    select public.marcar_canje_regis_leido(
      '99000000-0000-4000-8000-000000000009',
      'negocio'
    )
  $$,
  'El negocio puede marcar el canje como revisado'
);
select is(
  public.contar_notificaciones_canjes_regis(
    'negocio',
    '99000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'El aviso compartido del negocio queda limpio'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fd03';

select is(
  (select count(*) from public.listar_historial_canjes_admin()),
  1::bigint,
  'Regalones consulta el historial global de canjes'
);
select is(
  public.contar_notificaciones_canjes_regis('admin_regalones', null),
  1::bigint,
  'Regalones recibe la notificación del canje confirmado'
);
select lives_ok(
  $$
    select public.marcar_canje_regis_leido(
      '99000000-0000-4000-8000-000000000009',
      'admin_regalones'
    )
  $$,
  'Regalones marca la notificación como revisada'
);
select is(
  public.contar_notificaciones_canjes_regis('admin_regalones', null),
  0::bigint,
  'El aviso administrativo queda limpio'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fd04';

select is(
  (select count(*) from public.listar_historial_canjes_vecino()),
  0::bigint,
  'Un vecino ajeno no ve el canje de otra persona'
);
select throws_ok(
  $$
    select *
    from public.listar_historial_canjes_negocio(
      '99000000-0000-4000-8000-000000000001',
      null,
      100
    )
  $$,
  '42501',
  'No tienes acceso a los canjes de este negocio',
  'Un usuario ajeno no consulta el historial del negocio'
);
select throws_ok(
  $$ select * from public.listar_historial_canjes_admin() $$,
  '42501',
  'Solo Regalones puede consultar todos los canjes',
  'Un usuario común no consulta el historial administrativo'
);

reset role;

select * from finish();
rollback;
