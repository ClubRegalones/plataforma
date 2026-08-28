begin;

-- ============================================================================
-- CORRECCIONES API TERMINAL INDEPENDIENTE
-- ============================================================================


-- ============================================================================
-- 1. CIERRE DE TURNO
-- cerrar_turno_terminal devuelve un registro turnos_caja completo.
-- ============================================================================

create or replace function public.terminal_cerrar_turno(
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.turnos_caja
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
begin
  select *
  into v_turno
  from public.cerrar_turno_terminal(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  return v_turno;
end;
$$;


-- ============================================================================
-- 2. LISTAR SOLICITUDES
-- No necesitamos guardar el turno completo.
-- Solo comprobar que pertenece a la Terminal y sigue abierto.
-- ============================================================================

create or replace function public.terminal_listar_solicitudes(
  p_terminal_id uuid,
  p_token_terminal text,
  p_turno_id uuid
)
returns setof public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.terminales;
begin
  v_terminal := public.validar_credencial_terminal_interna(
    p_terminal_id,
    p_token_terminal
  );

  if not exists (
    select 1
    from public.turnos_caja as turno
    where turno.id = p_turno_id
      and turno.terminal_id = v_terminal.id
      and turno.caja_id = v_terminal.caja_id
      and turno.estado = 'abierto'
  ) then
    raise exception 'Debes iniciar un turno válido para consultar las solicitudes'
      using errcode = '42501';
  end if;

  return query
  select solicitud.*
  from public.solicitudes_compra as solicitud
  where solicitud.caja_id = v_terminal.caja_id
    and solicitud.estado in (
      'esperando_monto',
      'esperando_cajero',
      'pendiente_validacion'
    )
    and solicitud.expira_en > clock_timestamp()
  order by solicitud.creado_en desc;
end;
$$;


comment on function public.terminal_cerrar_turno(uuid, uuid, text) is
  'Cierra el turno activo validando la identidad física de la Terminal PWA.';

comment on function public.terminal_listar_solicitudes(uuid, text, uuid) is
  'Lista exclusivamente las solicitudes abiertas pertenecientes a la caja física vinculada a la Terminal y exige un turno activo.';


commit;