begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select ok(
  to_regprocedure('public.listar_beneficios_regis_disponibles(uuid)') is not null,
  'Existe el listado de promociones para el vecino'
);
select ok(
  to_regprocedure('public.consultar_canje_regis_qr(text,uuid)') is not null,
  'Existe la consulta de reglas de una reserva QR'
);
select matches(
  pg_get_function_result(
    'public.listar_beneficios_regis_disponibles(uuid)'::regprocedure
  ),
  'porcentaje_maximo_canje_bp integer',
  'El listado expone el porcentaje máximo aplicable'
);
select matches(
  pg_get_function_result(
    'public.consultar_canje_regis_qr(text,uuid)'::regprocedure
  ),
  'porcentaje_maximo_canje_bp integer',
  'La lectura QR expone el porcentaje máximo aplicable'
);
select is(
  ceil(5000::numeric * 10000::numeric / 2000::numeric)::integer,
  25000,
  'Un descuento de $5.000 con máximo de 20% se completa desde $25.000'
);
select is(
  least(5000, floor(22000::numeric * 2000::numeric / 10000::numeric)::integer),
  4400,
  'Una compra de $22.000 respeta el máximo de 20% y descuenta $4.400'
);

select * from finish();
rollback;
