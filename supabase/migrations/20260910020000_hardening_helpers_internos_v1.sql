begin;

-- ============================================================================
-- CLUB REGALONES
-- HARDENING V1 - HELPERS INTERNOS
--
-- El Supabase alojado puede contener helpers historicos que no existen
-- en una reconstruccion local desde migraciones.
--
-- Regla:
-- si el helper existe, no debe estar disponible para roles cliente.
-- ============================================================================

do $$
begin

  if to_regprocedure(
    'public.rls_auto_enable()'
  ) is not null then

    execute
      'revoke all on function public.rls_auto_enable()
       from public, anon, authenticated';

  end if;


  if to_regprocedure(
    'public.validar_caja_regalones_unica()'
  ) is not null then

    execute
      'revoke all on function public.validar_caja_regalones_unica()
       from public, anon, authenticated';

  end if;


  if to_regprocedure(
    'public.cerrar_lector_al_cerrar_turno()'
  ) is not null then

    execute
      'revoke all on function public.cerrar_lector_al_cerrar_turno()
       from public, anon, authenticated';

  end if;

end;
$$;

commit;