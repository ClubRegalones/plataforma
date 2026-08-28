begin;

-- ============================================================================
-- CLUB REGALONES
-- CONSULTA DE REGLA REGIS PARA TERMINAL PWA
--
-- La Terminal no recibe negocio_id desde el frontend.
-- El negocio se deriva del turno validado y de la Terminal física.
-- ============================================================================

create function public.terminal_obtener_regla_acumulacion(
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.reglas_regis
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_regla public.reglas_regis;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  select regla.*
  into v_regla
  from public.reglas_regis as regla
  where regla.activa
    and (
      regla.negocio_id is null
      or regla.negocio_id = v_turno.negocio_id
    )
    and regla.vigencia_desde <= clock_timestamp()
    and (
      regla.vigencia_hasta is null
      or regla.vigencia_hasta > clock_timestamp()
    )
  order by
    (regla.negocio_id is not null) desc,
    regla.vigencia_desde desc,
    regla.version desc
  limit 1;

  if not found then
    return null;
  end if;

  return v_regla;
end;
$$;


revoke all on function public.terminal_obtener_regla_acumulacion(
  uuid,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.terminal_obtener_regla_acumulacion(
  uuid,
  uuid,
  text
) to anon, authenticated;


comment on function public.terminal_obtener_regla_acumulacion(
  uuid,
  uuid,
  text
) is
  'Devuelve la regla REGIS vigente correspondiente al negocio derivado de una Terminal PWA y su turno activo.';

commit;