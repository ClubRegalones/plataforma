begin;

-- ============================================================================
-- La consulta REGIS de Terminal valida un turno activo y utiliza
-- clock_timestamp(), por lo que debe conservar la volatilidad por defecto.
-- ============================================================================

alter function public.terminal_obtener_regla_acumulacion(
  uuid,
  uuid,
  text
) volatile;

comment on function public.terminal_obtener_regla_acumulacion(
  uuid,
  uuid,
  text
) is
  'Devuelve la regla REGIS vigente del negocio derivado de una Terminal y su turno activo. Se declara VOLATILE porque valida estado operacional en tiempo real.';

commit;