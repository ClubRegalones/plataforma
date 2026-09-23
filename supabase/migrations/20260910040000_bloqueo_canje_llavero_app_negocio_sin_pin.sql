begin;

-- ============================================================================
-- CLUB REGALONES
-- HARDENING 1C-A
-- BLOQUEO TEMPORAL DE CANJE CON LLAVERO EN APP NEGOCIO
--
-- Regla:
--
-- Un llavero puede identificar al vecino, pero NO autoriza por sí solo
-- el gasto de REGIS.
--
-- Mientras se implementa el PIN de autorización del vecino:
--
--   App Negocio + llavero + reservado/confirmado = BLOQUEADO
--   App Negocio + QR temporal App Vecino         = PERMITIDO
--   Terminal PWA legacy + llavero                = PERMITIDO
--
-- La defensa se aplica en canjes_regis para que no dependa del frontend
-- ni de una RPC concreta.
-- ============================================================================


create function public.validar_canje_llavero_app_negocio_interno(
  p_origen public.origen_canje_regis,
  p_estado public.estado_canje_regis,
  p_turno_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin

  if p_origen <> 'llavero'
    or p_turno_id is null
    or p_estado not in (
      'reservado'::public.estado_canje_regis,
      'confirmado'::public.estado_canje_regis
    )
  then
    return;
  end if;


  if exists (
    select 1
    from public.turnos_caja as turno
    where turno.id = p_turno_id
      and turno.cajero_negocio_id is not null
  ) then
    raise exception
      'Los canjes con llavero en App Negocio requieren autorización PIN del vecino'
      using errcode = '42501';
  end if;

end;
$$;


create function public.aplicar_bloqueo_canje_llavero_app_negocio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  perform public.validar_canje_llavero_app_negocio_interno(
    new.origen,
    new.estado,
    new.turno_caja_id
  );

  return new;

end;
$$;


drop trigger if exists
  canjes_regis_bloquear_llavero_app_negocio_sin_pin
on public.canjes_regis;


create trigger canjes_regis_bloquear_llavero_app_negocio_sin_pin
before insert or update of origen, estado, turno_caja_id
on public.canjes_regis
for each row
execute function public.aplicar_bloqueo_canje_llavero_app_negocio();


-- Ambos helpers son exclusivamente internos.

revoke all on function
  public.validar_canje_llavero_app_negocio_interno(
    public.origen_canje_regis,
    public.estado_canje_regis,
    uuid
  )
from public, anon, authenticated;


revoke all on function
  public.aplicar_bloqueo_canje_llavero_app_negocio()
from public, anon, authenticated;


comment on function
  public.validar_canje_llavero_app_negocio_interno(
    public.origen_canje_regis,
    public.estado_canje_regis,
    uuid
  )
is
  'Bloquea reservas y confirmaciones con llavero desde App Negocio hasta que exista autorización PIN del vecino. No afecta QR ni Terminal legacy.';


comment on trigger
  canjes_regis_bloquear_llavero_app_negocio_sin_pin
on public.canjes_regis
is
  'Fail closed temporal para impedir gasto de REGIS mediante llavero en App Negocio sin PIN.';


commit;