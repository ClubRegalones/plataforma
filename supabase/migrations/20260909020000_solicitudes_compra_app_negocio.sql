begin;

create function public.terminal_listar_solicitudes_app_negocio(
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  id uuid,
  vecino_id uuid,
  nombre_vecino text,
  avatar_vecino text,
  caja_id uuid,
  monto_informado integer,
  monto_corregido integer,
  informado_por public.informado_por,
  motivo_correccion text,
  motivo_rechazo text,
  estado public.estado_solicitud_compra,
  expira_en timestamptz,
  idempotency_key text,
  creado_en timestamptz,
  actualizado_en timestamptz,
  lectura_terminal_id uuid,
  llavero_id uuid,
  turno_caja_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  return query
  select
    solicitud.id,
    solicitud.vecino_id,
    btrim(
      concat_ws(
        ' ',
        perfil.nombre,
        perfil.apellido
      )
    )::text,
    perfil.avatar_url,
    solicitud.caja_id,
    solicitud.monto_informado,
    solicitud.monto_corregido,
    solicitud.informado_por,
    solicitud.motivo_correccion,
    solicitud.motivo_rechazo,
    solicitud.estado,
    solicitud.expira_en,
    solicitud.idempotency_key,
    solicitud.creado_en,
    solicitud.actualizado_en,
    solicitud.lectura_terminal_id,
    solicitud.llavero_id,
    solicitud.turno_caja_id
  from public.solicitudes_compra as solicitud
  join public.perfiles as perfil
    on perfil.id = solicitud.vecino_id
  where solicitud.caja_id = v_turno.caja_id
    and solicitud.estado in (
      'esperando_monto',
      'esperando_cajero',
      'pendiente_validacion'
    )
    and solicitud.expira_en > clock_timestamp()
  order by solicitud.creado_en desc;
end;
$$;

revoke all on function public.terminal_listar_solicitudes_app_negocio(
  uuid,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.terminal_listar_solicitudes_app_negocio(
  uuid,
  uuid,
  text
) to anon, authenticated;

comment on function public.terminal_listar_solicitudes_app_negocio(
  uuid,
  uuid,
  text
) is
  'Lista solicitudes pendientes de la caja para App Negocio incluyendo identidad visual del vecino.';

commit;