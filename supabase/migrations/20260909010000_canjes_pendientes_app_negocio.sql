begin;

create function public.terminal_listar_canjes_pendientes(
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text,
  p_limite integer default 100
)
returns table (
  canje_id uuid,
  codigo_publico text,
  vecino_id uuid,
  nombre_vecino text,
  avatar_vecino text,
  beneficio_id uuid,
  beneficio_version_id uuid,
  nombre_beneficio text,
  descripcion_beneficio text,
  origen public.origen_canje_regis,
  estado public.estado_canje_regis,
  costo_regis integer,
  compra_minima_clp integer,
  tipo public.tipo_beneficio_regis,
  porcentaje_descuento_bp integer,
  monto_descuento_fijo_clp integer,
  tope_descuento_clp integer,
  porcentaje_maximo_canje_bp integer,
  reservado_en timestamptz,
  expira_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_limite integer := least(
    greatest(coalesce(p_limite, 100), 1),
    200
  );
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  perform public.expirar_reservas_canje_regis();

  return query
  select
    canje.id,
    canje.codigo_publico::text,
    canje.vecino_id,
    btrim(
      concat_ws(' ', perfil.nombre, perfil.apellido)
    )::text,
    perfil.avatar_url,
    canje.beneficio_id,
    canje.beneficio_version_id,
    version.nombre::text,
    version.descripcion,
    canje.origen,
    canje.estado,
    canje.costo_regis,
    version.compra_minima_clp,
    version.tipo,
    version.porcentaje_descuento_bp,
    version.monto_descuento_fijo_clp,
    version.tope_descuento_clp,
    version.porcentaje_maximo_canje_bp,
    canje.reservado_en,
    canje.expira_en
  from public.canjes_regis as canje
  join public.versiones_beneficio_regis as version
    on version.id = canje.beneficio_version_id
  join public.perfiles as perfil
    on perfil.id = canje.vecino_id
  where canje.negocio_id = v_turno.negocio_id
    and canje.estado = 'reservado'
    and canje.expira_en > clock_timestamp()
    and (
      canje.caja_id is null
      or canje.caja_id = v_turno.caja_id
    )
  order by
    canje.reservado_en asc,
    canje.id
  limit v_limite;
end;
$$;

revoke all on function public.terminal_listar_canjes_pendientes(
  uuid,
  uuid,
  text,
  integer
) from public, anon, authenticated;

grant execute on function public.terminal_listar_canjes_pendientes(
  uuid,
  uuid,
  text,
  integer
) to anon, authenticated;

comment on function public.terminal_listar_canjes_pendientes(
  uuid,
  uuid,
  text,
  integer
) is
  'Lista reservas de canje vigentes para Solicitudes de App Negocio.';

commit;