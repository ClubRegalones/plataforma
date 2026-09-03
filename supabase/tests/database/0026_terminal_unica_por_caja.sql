begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

-- ==========================================================
-- ESTRUCTURA
-- ==========================================================

select ok(
  to_regclass(
    'public.terminales_caja_no_revocada_unica'
  ) is not null,
  'Existe la protección de una sola terminal no revocada por caja'
);


-- ==========================================================
-- DATOS DE PRUEBA
-- ==========================================================

insert into auth.users (
  id,
  email,
  raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-00000000e226',
  'propietario-terminal-unica@pruebas.local',
  '{"nombre":"Propietario Terminal Única"}'::jsonb
);

insert into public.negocios (
  id,
  nombre,
  slug,
  rubro,
  estado
)
values (
  '51000000-0000-0000-0000-00000000e226',
  'Negocio Terminal Única',
  'negocio-terminal-unica',
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
  '52000000-0000-0000-0000-00000000e226',
  '51000000-0000-0000-0000-00000000e226',
  'Sucursal Terminal Única',
  'Calle Terminal 226',
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
  '53000000-0000-0000-0000-00000000e226',
  '52000000-0000-0000-0000-00000000e226',
  'Caja principal',
  'CAJA-UNICA-226',
  'activa'
);

insert into public.miembros_negocio (
  negocio_id,
  usuario_id,
  rol,
  estado
)
values (
  '51000000-0000-0000-0000-00000000e226',
  '00000000-0000-0000-0000-00000000e226',
  'propietario',
  'activo'
);


-- ==========================================================
-- PRIMERA TERMINAL
-- ==========================================================

set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000e226';

do $$
declare
  v_terminal_id uuid;
begin
  select registro.terminal_id
  into v_terminal_id
  from public.registrar_terminal_pwa(
    '53000000-0000-0000-0000-00000000e226',
    'Primer equipo de caja',
    '1.0.0'
  ) as registro;

  perform set_config(
    'prueba.terminal_unica_primera',
    v_terminal_id::text,
    true
  );
end;
$$;

reset role;

select is(
  (
    select estado::text
    from public.terminales
    where id =
      current_setting(
        'prueba.terminal_unica_primera'
      )::uuid
  ),
  'activa',
  'La primera terminal queda activa'
);


-- ==========================================================
-- NO PERMITE UNA SEGUNDA TERMINAL
-- ==========================================================

set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000e226';

select throws_ok(
  $$
    select *
    from public.registrar_terminal_pwa(
      '53000000-0000-0000-0000-00000000e226',
      'Segundo equipo de caja',
      '1.0.0'
    )
  $$,
  '23505',
  'Esta caja ya está vinculada a otra Terminal. Revoca la Terminal anterior antes de registrar una nueva.',
  'Una caja activa no admite una segunda terminal'
);

reset role;


-- ==========================================================
-- BLOQUEADA TAMBIÉN MANTIENE OCUPADA LA CAJA
-- ==========================================================

update public.terminales
set estado = 'bloqueada'
where id =
  current_setting(
    'prueba.terminal_unica_primera'
  )::uuid;

set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000e226';

select throws_ok(
  $$
    select *
    from public.registrar_terminal_pwa(
      '53000000-0000-0000-0000-00000000e226',
      'Equipo mientras anterior está bloqueado',
      '1.0.0'
    )
  $$,
  '23505',
  'Esta caja ya está vinculada a otra Terminal. Revoca la Terminal anterior antes de registrar una nueva.',
  'Una terminal bloqueada sigue reservando su caja'
);

reset role;


-- ==========================================================
-- REVOCAR LIBERA LA CAJA
-- ==========================================================

update public.terminales
set estado = 'revocada'
where id =
  current_setting(
    'prueba.terminal_unica_primera'
  )::uuid;

set local role authenticated;
set local request.jwt.claim.sub =
  '00000000-0000-0000-0000-00000000e226';

do $$
declare
  v_terminal_id uuid;
begin
  select registro.terminal_id
  into v_terminal_id
  from public.registrar_terminal_pwa(
    '53000000-0000-0000-0000-00000000e226',
    'Nueva terminal después de revocar',
    '1.0.1'
  ) as registro;

  perform set_config(
    'prueba.terminal_unica_nueva',
    v_terminal_id::text,
    true
  );
end;
$$;

reset role;


-- ==========================================================
-- RESULTADO FINAL
-- ==========================================================

select isnt(
  current_setting(
    'prueba.terminal_unica_primera'
  ),
  current_setting(
    'prueba.terminal_unica_nueva'
  ),
  'La nueva vinculación genera una terminal distinta'
);

select is(
  (
    select count(*)
    from public.terminales
    where caja_id =
      '53000000-0000-0000-0000-00000000e226'
  ),
  2::bigint,
  'Se conserva el historial de ambas terminales'
);

select is(
  (
    select count(*)
    from public.terminales
    where caja_id =
      '53000000-0000-0000-0000-00000000e226'
      and estado <> 'revocada'
  ),
  1::bigint,
  'Solo existe una terminal no revocada para la caja'
);

select is(
  (
    select estado::text
    from public.terminales
    where id =
      current_setting(
        'prueba.terminal_unica_nueva'
      )::uuid
  ),
  'activa',
  'La nueva terminal queda activa después de revocar la anterior'
);

select * from finish();

rollback;