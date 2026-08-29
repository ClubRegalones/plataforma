begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(18);

select has_function('public', 'terminal_listar_beneficios_canje', array['uuid', 'uuid', 'text']);
select has_function('public', 'terminal_consultar_canje_qr', array['text', 'uuid', 'uuid', 'text']);
select has_function('public', 'terminal_reservar_canje_llavero', array['text', 'uuid', 'text', 'uuid', 'uuid', 'text']);
select has_function('public', 'terminal_confirmar_compra_con_canje', array['uuid', 'integer', 'uuid', 'uuid', 'text', 'text', 'text']);
select has_function('public', 'terminal_cancelar_canje', array['uuid', 'uuid', 'uuid', 'text']);
select has_function('public', 'terminal_listar_historial_canjes', array['uuid', 'uuid', 'text', 'integer']);
select has_function('public', 'terminal_marcar_canje_leido', array['uuid', 'uuid', 'uuid', 'text']);

select ok(has_function_privilege('anon', 'public.terminal_listar_beneficios_canje(uuid,uuid,text)', 'EXECUTE'), 'La Terminal sin sesión puede listar beneficios');
select ok(has_function_privilege('anon', 'public.terminal_consultar_canje_qr(text,uuid,uuid,text)', 'EXECUTE'), 'La Terminal sin sesión puede revisar QR');
select ok(has_function_privilege('anon', 'public.terminal_reservar_canje_llavero(text,uuid,text,uuid,uuid,text)', 'EXECUTE'), 'La Terminal sin sesión puede reservar con llavero');
select ok(has_function_privilege('anon', 'public.terminal_confirmar_compra_con_canje(uuid,integer,uuid,uuid,text,text,text)', 'EXECUTE'), 'La Terminal sin sesión puede confirmar canjes');
select ok(has_function_privilege('anon', 'public.terminal_cancelar_canje(uuid,uuid,uuid,text)', 'EXECUTE'), 'La Terminal sin sesión puede cancelar reservas');
select ok(has_function_privilege('anon', 'public.terminal_listar_historial_canjes(uuid,uuid,text,integer)', 'EXECUTE'), 'La Terminal sin sesión puede consultar su historial');
select ok(has_function_privilege('anon', 'public.terminal_marcar_canje_leido(uuid,uuid,uuid,text)', 'EXECUTE'), 'La Terminal sin sesión puede marcar historial revisado');

select ok(not has_function_privilege('anon', 'public.crear_reserva_canje_regis_interna(uuid,uuid,public.origen_canje_regis,text,uuid,uuid,text)', 'EXECUTE'), 'El helper de reserva sigue siendo privado');
select ok(not has_function_privilege('anon', 'public.confirmar_compra_con_canje(uuid,uuid,integer,text,text)', 'EXECUTE'), 'El RPC comercial antiguo no se expone a anon');
select ok(not has_function_privilege('anon', 'public.listar_historial_canjes_negocio(uuid,uuid,integer)', 'EXECUTE'), 'El historial comercial autenticado no se expone a anon');
select ok(not has_function_privilege('anon', 'public.marcar_canje_regis_leido(uuid,public.destino_notificacion_canje_regis)', 'EXECUTE'), 'El marcador autenticado no se expone a anon');

select * from finish();
rollback;
