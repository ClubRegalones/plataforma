begin;

-- ============================================================================
-- CLUB REGALONES
-- HARDENING 1B - TURNO + CAJERO APP NEGOCIO
--
-- Una operación sensible de App Negocio no puede depender únicamente de que
-- exista un turno abierto.
--
-- Cuando el turno pertenece a App Negocio (cajero_negocio_id no nulo),
-- Supabase vuelve a comprobar en cada validación que:
--
--   1. el cajero siga activo;
--   2. siga perteneciendo al mismo negocio;
--   3. siga asignado a la sucursal de la Terminal.
--
-- Los turnos heredados de Terminal PWA conservan cajero_negocio_id = null
-- y continúan funcionando como antes.
-- ============================================================================

create or replace function public.validar_turno_terminal_interno(
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
  v_terminal public.terminales;
  v_turno public.turnos_caja;
  v_sucursal_id uuid;
  v_negocio_id uuid;
begin
  v_terminal := public.validar_credencial_terminal_interna(
    p_terminal_id,
    p_token_terminal
  );

  select
    caja.sucursal_id,
    sucursal.negocio_id
  into
    v_sucursal_id,
    v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = v_terminal.caja_id
    and caja.estado = 'activa'
    and sucursal.estado = 'activa';

  if not found then
    raise exception
      'La caja o sucursal de esta Terminal ya no está activa'
      using errcode = '42501';
  end if;

  select turno.*
  into v_turno
  from public.turnos_caja as turno
  where turno.id = p_turno_id
    and turno.terminal_id = v_terminal.id
    and turno.caja_id = v_terminal.caja_id
    and turno.negocio_id = v_negocio_id
    and turno.estado = 'abierto'
  for update;

  if not found then
    raise exception
      'Debes iniciar un turno válido en esta Terminal'
      using errcode = '42501';
  end if;

  -- --------------------------------------------------------------------------
  -- APP NEGOCIO
  --
  -- Si existe cajero_negocio_id, el turno pertenece al modelo operativo nuevo.
  -- El cajero debe seguir habilitado en la misma sucursal.
  -- --------------------------------------------------------------------------

  if v_turno.cajero_negocio_id is not null then

    if not exists (
      select 1
      from public.cajeros_negocio as cajero
      join public.cajeros_sucursales as asignacion
        on asignacion.cajero_id = cajero.id
      where cajero.id = v_turno.cajero_negocio_id
        and cajero.negocio_id = v_turno.negocio_id
        and cajero.estado = 'activo'
        and asignacion.sucursal_id = v_sucursal_id
    ) then
      raise exception
        'El cajero de este turno ya no está habilitado en esta sucursal'
        using errcode = '42501';
    end if;

  end if;

  return v_turno;
end;
$$;


-- Sigue siendo helper exclusivamente interno.

revoke all on function
  public.validar_turno_terminal_interno(
    uuid,
    uuid,
    text
  )
from public, anon, authenticated;


comment on function
  public.validar_turno_terminal_interno(
    uuid,
    uuid,
    text
  )
is
  'Valida credencial física, turno, caja y negocio. En turnos App Negocio también exige que el cajero siga activo y asignado a la sucursal.';


commit;