begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select ok(
  to_regprocedure(
    'public.reclamar_lectura_llavero_terminal(uuid,uuid,text)'
  ) is not null,
  'La Terminal PWA puede reclamar una lectura'
);
select ok(
  to_regprocedure(
    'public.activar_llavero_desde_lectura(uuid,uuid,text,public.metodo_verificacion_llavero,text,boolean)'
  ) is not null,
  'Existe la activación atómica desde una lectura'
);
select ok(
  to_regprocedure(
    'public.crear_solicitud_compra_desde_lectura(uuid,uuid,text,integer,text)'
  ) is not null,
  'Existe la compra asistida atómica desde una lectura'
);
select ok(
  to_regprocedure(
    'public.reservar_canje_regis_desde_lectura(uuid,uuid,text,uuid,text)'
  ) is not null,
  'Existe la reserva de canje atómica desde una lectura'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.consumir_lectura_llavero_terminal(uuid)',
    'EXECUTE'
  ),
  'La lectura ya no se consume separadamente de la operación'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.crear_solicitud_compra_desde_lectura(uuid,uuid,text,integer,text)',
    'EXECUTE'
  ),
  'El celular lector anónimo no puede crear compras'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-00000000e301',
    'cajero-atomico@pruebas.local',
    '{"nombre":"Cajero Atómico"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000e302',
    'vecino-activo-atomico@pruebas.local',
    '{"nombre":"Vecino Activo","apellido":"Atómico"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-00000000e303',
    'vecino-activar-atomico@pruebas.local',
    '{"nombre":"Vecino Activar","apellido":"Atómico"}'::jsonb
  );

insert into public.negocios (id, nombre, slug, rubro, estado)
values (
  '61000000-0000-0000-0000-00000000e301',
  'Negocio operaciones atómicas',
  'negocio-operaciones-atomicas',
  'Almacén',
  'activo'
);

insert into public.sucursales (
  id, negocio_id, nombre, direccion, comuna, estado
)
values (
  '62000000-0000-0000-0000-00000000e301',
  '61000000-0000-0000-0000-00000000e301',
  'Sucursal operaciones atómicas',
  'Calle Atómica 301',
  'Santiago',
  'activa'
);

insert into public.cajas (id, sucursal_id, nombre, codigo, estado)
values (
  '63000000-0000-0000-0000-00000000e301',
  '62000000-0000-0000-0000-00000000e301',
  'Caja operaciones atómicas',
  'CAJA-ATOMICA-301',
  'activa'
);

insert into public.miembros_negocio (negocio_id, usuario_id, rol, estado)
values (
  '61000000-0000-0000-0000-00000000e301',
  '00000000-0000-0000-0000-00000000e301',
  'cajero',
  'activo'
);

insert into public.terminales (
  id, caja_id, identificador_publico, token_hash,
  nombre_dispositivo, estado
)
values (
  '64000000-0000-0000-0000-00000000e301',
  '63000000-0000-0000-0000-00000000e301',
  'TERMINAL-ATOMICA-301',
  encode(
    extensions.digest(
      convert_to('terminal-atomica-credencial-segura-301', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'Terminal operaciones atómicas',
  'activa'
);

insert into public.solicitudes_llavero (
  id, vecino_id, estado, entregado_en
)
values (
  '65000000-0000-0000-0000-00000000e303',
  '00000000-0000-0000-0000-00000000e303',
  'entregada',
  now()
);

insert into public.llaveros_nfc (
  id, vecino_id, solicitud_id, token_hash, codigo_publico, estado,
  asignado_en, asignado_por, preparado_en, preparado_por,
  activado_en, activado_por, caja_activacion_id,
  metodo_verificacion_activacion
)
values
  (
    '66000000-0000-0000-0000-00000000e302',
    '00000000-0000-0000-0000-00000000e302',
    null,
    encode(
      extensions.digest(convert_to('llavero-atomico-activo-302', 'UTF8'), 'sha256'),
      'hex'
    ),
    'CR-ATOMICO-302',
    'activo',
    now(),
    '00000000-0000-0000-0000-00000000e301',
    now(),
    '00000000-0000-0000-0000-00000000e301',
    now(),
    '00000000-0000-0000-0000-00000000e301',
    '63000000-0000-0000-0000-00000000e301',
    'cedula'
  ),
  (
    '66000000-0000-0000-0000-00000000e303',
    '00000000-0000-0000-0000-00000000e303',
    '65000000-0000-0000-0000-00000000e303',
    encode(
      extensions.digest(convert_to('llavero-atomico-activar-303', 'UTF8'), 'sha256'),
      'hex'
    ),
    'CR-ATOMICO-303',
    'sin_asignar',
    null,
    null,
    now(),
    '00000000-0000-0000-0000-00000000e301',
    null,
    null,
    null,
    null
  );

insert into public.sesiones_lector_movil (
  id, terminal_id, caja_id, creada_por, token_lector_hash,
  nombre_lector, estado, expira_vinculacion_en, vinculada_en, expira_en
)
values (
  '67000000-0000-0000-0000-00000000e301',
  '64000000-0000-0000-0000-00000000e301',
  '63000000-0000-0000-0000-00000000e301',
  '00000000-0000-0000-0000-00000000e301',
  encode(
    extensions.digest(
      convert_to('lector-atomico-credencial-segura-301', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'Celular lector atómico',
  'vinculada',
  now() + interval '5 minutes',
  now(),
  now() + interval '8 hours'
);

insert into public.beneficios_regis (
  id, negocio_id, codigo, creado_por
)
values (
  '68000000-0000-0000-0000-00000000e301',
  '61000000-0000-0000-0000-00000000e301',
  'beneficio-atomico',
  '00000000-0000-0000-0000-00000000e301'
);

insert into public.versiones_beneficio_regis (
  id, beneficio_id, version, nombre, tipo, monto_descuento_fijo_clp,
  costo_regis, compra_minima_clp, limite_por_vecino,
  regla_regis_id, valor_regis_clp, porcentaje_maximo_canje_bp,
  estado, vigencia_desde, publicado_en, creado_por
)
select
  '69000000-0000-0000-0000-00000000e301',
  '68000000-0000-0000-0000-00000000e301',
  1,
  'Beneficio atómico',
  'monto_fijo',
  250,
  5,
  1250,
  3,
  regla.id,
  regla.valor_regis_clp,
  regla.porcentaje_maximo_canje_bp,
  'activo',
  now(),
  now(),
  '00000000-0000-0000-0000-00000000e301'
from public.reglas_regis as regla
where regla.negocio_id is null
  and regla.activa
order by regla.version desc
limit 1;

insert into public.saldos_regis (
  vecino_id, negocio_id, disponibles
)
values (
  '00000000-0000-0000-0000-00000000e302',
  '61000000-0000-0000-0000-00000000e301',
  20
);

set local role anon;

do $$
declare
  v_lectura_id uuid;
begin
  select lectura.lectura_id
  into v_lectura_id
  from public.registrar_lectura_llavero_terminal(
    'lector-atomico-credencial-segura-301',
    'llavero-atomico-activo-302'
  ) as lectura;

  perform set_config('prueba.atomica_lectura_compra', v_lectura_id::text, true);
end;
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e301';

select throws_ok(
  format(
    'select * from public.reclamar_lectura_llavero_terminal(%L::uuid, %L::uuid, %L)',
    current_setting('prueba.atomica_lectura_compra'),
    '64000000-0000-0000-0000-00000000e301',
    'terminal-incorrecta-credencial-segura-000'
  ),
  '42501',
  'La terminal no existe, fue revocada o no pertenece al comercio',
  'Una credencial local incorrecta no reclama la lectura'
);

select is(
  (
    select contexto.codigo_publico
    from public.reclamar_lectura_llavero_terminal(
      current_setting('prueba.atomica_lectura_compra')::uuid,
      '64000000-0000-0000-0000-00000000e301',
      'terminal-atomica-credencial-segura-301'
    ) as contexto
  ),
  'CR-ATOMICO-302',
  'La terminal reclama la identidad correcta'
);
select ok(
  (
    select lectura.reclamada_en is not null
      and lectura.expira_en > clock_timestamp() + interval '4 minutes'
    from public.lecturas_llavero_terminal as lectura
    where lectura.id = current_setting('prueba.atomica_lectura_compra')::uuid
  ),
  'Reclamar extiende el tiempo operativo sin consumir la lectura'
);

do $$
declare
  v_solicitud public.solicitudes_compra;
begin
  v_solicitud := public.crear_solicitud_compra_desde_lectura(
    current_setting('prueba.atomica_lectura_compra')::uuid,
    '64000000-0000-0000-0000-00000000e301',
    'terminal-atomica-credencial-segura-301',
    10000,
    'compra-atomica-301'
  );
  perform set_config('prueba.atomica_solicitud', v_solicitud.id::text, true);
end;
$$;

reset role;

select is(
  (
    select estado::text
    from public.lecturas_llavero_terminal
    where id = current_setting('prueba.atomica_lectura_compra')::uuid
  ),
  'consumida',
  'Crear la compra consume la lectura en la misma transacción'
);
select is(
  (
    select lectura_terminal_id
    from public.solicitudes_compra
    where id = current_setting('prueba.atomica_solicitud')::uuid
  ),
  current_setting('prueba.atomica_lectura_compra')::uuid,
  'La compra conserva la lectura que la originó'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e301';

select is(
  (
    select solicitud.id
    from public.crear_solicitud_compra_desde_lectura(
      current_setting('prueba.atomica_lectura_compra')::uuid,
      '64000000-0000-0000-0000-00000000e301',
      'terminal-atomica-credencial-segura-301',
      10000,
      'compra-atomica-301'
    ) as solicitud
  ),
  current_setting('prueba.atomica_solicitud')::uuid,
  'Reintentar la misma compra devuelve el resultado idempotente'
);

reset role;
set local role anon;

do $$
declare
  v_lectura_id uuid;
begin
  select lectura.lectura_id
  into v_lectura_id
  from public.registrar_lectura_llavero_terminal(
    'lector-atomico-credencial-segura-301',
    'llavero-atomico-activo-302'
  ) as lectura;
  perform set_config('prueba.atomica_lectura_canje', v_lectura_id::text, true);
end;
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e301';

do $$
declare
  v_canje_id uuid;
begin
  select reserva.canje_id
  into v_canje_id
  from public.reservar_canje_regis_desde_lectura(
    current_setting('prueba.atomica_lectura_canje')::uuid,
    '64000000-0000-0000-0000-00000000e301',
    'terminal-atomica-credencial-segura-301',
    '69000000-0000-0000-0000-00000000e301',
    'canje-atomico-301'
  ) as reserva;
  perform set_config('prueba.atomica_canje', v_canje_id::text, true);
end;
$$;

reset role;

select is(
  (
    select lectura_terminal_id
    from public.canjes_regis
    where id = current_setting('prueba.atomica_canje')::uuid
  ),
  current_setting('prueba.atomica_lectura_canje')::uuid,
  'El canje conserva la lectura que lo originó'
);
select is(
  (
    select disponibles
    from public.saldos_regis
    where vecino_id = '00000000-0000-0000-0000-00000000e302'
      and negocio_id = '61000000-0000-0000-0000-00000000e301'
  ),
  15,
  'El canje reserva exactamente los REGIS del beneficio'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e301';

select throws_ok(
  format(
    'select * from public.crear_solicitud_compra_desde_lectura(%L::uuid, %L::uuid, %L, 5000, %L)',
    current_setting('prueba.atomica_lectura_canje'),
    '64000000-0000-0000-0000-00000000e301',
    'terminal-atomica-credencial-segura-301',
    'reutilizacion-lectura-301'
  ),
  '55000',
  'La lectura ya fue utilizada o expiró',
  'Una lectura utilizada para canje no puede crear otra compra'
);

reset role;
set local role anon;

do $$
declare
  v_lectura_id uuid;
begin
  select lectura.lectura_id
  into v_lectura_id
  from public.registrar_lectura_llavero_terminal(
    'lector-atomico-credencial-segura-301',
    'llavero-atomico-activar-303'
  ) as lectura;
  perform set_config('prueba.atomica_lectura_activacion', v_lectura_id::text, true);
end;
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e301';

select is(
  (
    select contexto.estado::text
    from public.reclamar_lectura_llavero_terminal(
      current_setting('prueba.atomica_lectura_activacion')::uuid,
      '64000000-0000-0000-0000-00000000e301',
      'terminal-atomica-credencial-segura-301'
    ) as contexto
    where contexto.puede_activar
  ),
  'sin_asignar',
  'Un llavero entregado puede llegar al flujo de primera activación'
);
select is(
  (
    select resultado.estado::text
    from public.activar_llavero_desde_lectura(
      current_setting('prueba.atomica_lectura_activacion')::uuid,
      '64000000-0000-0000-0000-00000000e301',
      'terminal-atomica-credencial-segura-301',
      'cedula',
      null,
      true
    ) as resultado
    where resultado.activado
  ),
  'activo',
  'La activación y el consumo de la lectura son atómicos'
);

reset role;

select is(
  (
    select lectura_activacion_id
    from public.llaveros_nfc
    where id = '66000000-0000-0000-0000-00000000e303'
  ),
  current_setting('prueba.atomica_lectura_activacion')::uuid,
  'El llavero conserva la lectura de su activación'
);
select is(
  (
    select estado::text
    from public.lecturas_llavero_terminal
    where id = current_setting('prueba.atomica_lectura_activacion')::uuid
  ),
  'consumida',
  'La lectura de activación no puede reutilizarse'
);

select * from finish();
rollback;
