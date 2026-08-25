begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(44);

select has_table('public', 'perfiles', 'Existe la tabla perfiles');
select has_table('public', 'planes', 'Existe la tabla planes');
select has_table('public', 'negocios', 'Existe la tabla negocios');
select has_table('public', 'suscripciones', 'Existe la tabla suscripciones');
select has_table('public', 'sucursales', 'Existe la tabla sucursales');
select has_table('public', 'cajas', 'Existe la tabla cajas');
select has_table(
  'public',
  'miembros_negocio',
  'Existe la tabla miembros_negocio'
);
select has_table('public', 'terminales', 'Existe la tabla terminales');
select has_table('public', 'etiquetas_nfc', 'Existe la tabla etiquetas_nfc');
select has_table(
  'public',
  'vecinos_negocios',
  'Existe la tabla vecinos_negocios'
);
select has_table(
  'public',
  'solicitudes_compra',
  'Existe la tabla solicitudes_compra'
);
select has_table('public', 'compras', 'Existe la tabla compras');

select has_column(
  'public',
  'solicitudes_compra',
  'monto_corregido',
  'Las solicitudes preservan por separado el monto corregido'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.perfiles'::regclass
  ),
  'perfiles tiene RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.planes'::regclass
  ),
  'planes tiene RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.negocios'::regclass
  ),
  'negocios tiene RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.suscripciones'::regclass
  ),
  'suscripciones tiene RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.sucursales'::regclass
  ),
  'sucursales tiene RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.cajas'::regclass
  ),
  'cajas tiene RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.miembros_negocio'::regclass
  ),
  'miembros_negocio tiene RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.terminales'::regclass
  ),
  'terminales tiene RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.etiquetas_nfc'::regclass
  ),
  'etiquetas_nfc tiene RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.vecinos_negocios'::regclass
  ),
  'vecinos_negocios tiene RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.solicitudes_compra'::regclass
  ),
  'solicitudes_compra tiene RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.compras'::regclass
  ),
  'compras tiene RLS'
);

select hasnt_table(
  'public',
  'beneficios',
  'Beneficios queda para el Hito D'
);
select hasnt_table('public', 'canjes', 'Canjes queda para el Hito D');
select has_table(
  'public',
  'movimientos_regis',
  'Existe el ledger inmutable de REGIS del Hito C'
);
select has_table(
  'public',
  'saldos_regis',
  'Existen los saldos derivados del Hito C'
);

select ok(
  to_regprocedure(
    'public.crear_negocio(text,text,text,text,text,text)'
  ) is not null,
  'Existe la RPC crear_negocio'
);
select ok(
  to_regprocedure('public.resolver_etiqueta(text)') is not null,
  'Existe la RPC resolver_etiqueta'
);
select ok(
  to_regprocedure(
    'public.crear_solicitud_compra(text,text,timestamptz,integer)'
  ) is not null,
  'Existe la RPC crear_solicitud_compra'
);
select ok(
  to_regprocedure('public.informar_monto_vecino(uuid,integer)') is not null,
  'Existe la RPC informar_monto_vecino'
);
select ok(
  to_regprocedure('public.informar_monto_cajero(uuid,integer)') is not null,
  'Existe la RPC informar_monto_cajero'
);
select ok(
  to_regprocedure(
    'public.corregir_solicitud_compra(uuid,integer,text)'
  ) is not null,
  'Existe la RPC corregir_solicitud_compra'
);
select ok(
  to_regprocedure(
    'public.solicitar_reingreso_monto(uuid,text)'
  ) is not null,
  'Existe la RPC solicitar_reingreso_monto'
);
select ok(
  to_regprocedure(
    'public.aprobar_compra(uuid,text,public.origen_compra)'
  ) is not null,
  'Existe la RPC aprobar_compra'
);
select ok(
  to_regprocedure('public.rechazar_solicitud_compra(uuid,text)') is not null,
  'Existe la RPC rechazar_solicitud_compra'
);

select policies_are(
  'public',
  'solicitudes_compra',
  array['solicitudes_compra_leer_participantes'],
  'Las solicitudes solo se leen mediante la política prevista'
);
select policies_are(
  'public',
  'compras',
  array['compras_leer_participantes'],
  'Las compras solo se leen mediante la política prevista'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.solicitudes_compra',
    'INSERT'
  ),
  'El frontend no inserta solicitudes directamente'
);
select ok(
  not has_table_privilege('authenticated', 'public.compras', 'INSERT'),
  'El frontend no inserta compras directamente'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.terminales',
    'token_hash',
    'SELECT'
  ),
  'El frontend no puede leer hashes de terminales'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.etiquetas_nfc',
    'token_hash',
    'SELECT'
  ),
  'El frontend no puede leer hashes NFC'
);

select * from finish();
rollback;
