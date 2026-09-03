begin;

-- ============================================================================
-- CLUB REGALONES
-- COMPRAS DETECTADAS PARA TERMINAL
-- ============================================================================

create function public.terminal_listar_compras_detectadas(
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  solicitud_id uuid,
  vecino_id uuid,
  nombre_vecino text,
  monto_informado integer,
  monto_corregido integer,
  monto_vigente integer,
  informado_por public.informado_por,
  estado public.estado_solicitud_compra,
  creado_en timestamptz
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
    concat_ws(
      ' ',
      perfil.nombre,
      perfil.apellido
    )::text,
    solicitud.monto_informado,
    solicitud.monto_corregido,
    coalesce(
      solicitud.monto_corregido,
      solicitud.monto_informado
    )::integer,
    solicitud.informado_por,
    solicitud.estado,
    solicitud.creado_en
  from public.solicitudes_compra as solicitud
  join public.perfiles as perfil
    on perfil.id = solicitud.vecino_id
  where solicitud.caja_id = v_turno.caja_id
    and perfil.estado = 'activo'
    and solicitud.informado_por = 'vecino'
    and solicitud.monto_informado is not null
    and solicitud.estado in (
      'esperando_cajero',
      'pendiente_validacion'
    )
    and solicitud.expira_en > clock_timestamp()
  order by solicitud.creado_en asc;
end;
$$;

revoke all on function public.terminal_listar_compras_detectadas(
  uuid,
  uuid,
  text
)
from public, anon, authenticated;

grant execute on function public.terminal_listar_compras_detectadas(
  uuid,
  uuid,
  text
)
to anon, authenticated;

comment on function public.terminal_listar_compras_detectadas(
  uuid,
  uuid,
  text
) is
  'Lista compras informadas por vecinos para la caja de una Terminal y turno validados, incluyendo nombre y monto para revisión.';

commit;