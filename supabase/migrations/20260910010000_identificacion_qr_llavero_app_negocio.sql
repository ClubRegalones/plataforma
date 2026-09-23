begin;

-- ============================================================================
-- QR FISICO DEL LLAVERO
--
-- Sirve SOLO para identificar al vecino.
-- No autoriza compras ni canjes y no expone el token NFC.
-- ============================================================================

create function public.terminal_identificar_llavero_qr(
  p_codigo_publico text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  llavero_id uuid,
  vecino_id uuid,
  codigo_publico text,
  nombre_vecino text,
  disponibles integer,
  reservados integer,
  pendientes integer,
  canjeados integer,
  saldo_actualizado_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_codigo text :=
    upper(btrim(coalesce(p_codigo_publico, '')));
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if char_length(v_codigo) < 3
    or char_length(v_codigo) > 80
  then
    raise exception 'El QR del llavero no es valido'
      using errcode = '22023';
  end if;

  return query
  select
    llavero.id,
    llavero.vecino_id,
    llavero.codigo_publico::text,
    concat_ws(
      ' ',
      perfil.nombre,
      perfil.apellido
    )::text,
    coalesce(saldo.disponibles, 0),
    coalesce(saldo.reservados, 0),
    coalesce(saldo.pendientes, 0),
    coalesce(saldo.canjeados, 0),
    saldo.actualizado_en
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
  left join public.saldos_regis as saldo
    on saldo.vecino_id = llavero.vecino_id
    and saldo.negocio_id = v_turno.negocio_id
  where upper(llavero.codigo_publico::text) = v_codigo
    and llavero.estado = 'activo'
    and perfil.estado = 'activo'
  limit 1;

  if not found then
    raise exception
      'No encontramos un llavero activo asociado a ese QR'
      using errcode = 'P0002';
  end if;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;
end;
$$;

comment on function public.terminal_identificar_llavero_qr(
  text,
  uuid,
  uuid,
  text
) is
  'Identifica el vecino de un QR fisico de llavero usando su codigo publico. No autoriza gasto de REGIS.';

revoke all on function public.terminal_identificar_llavero_qr(
  text,
  uuid,
  uuid,
  text
)
from public, anon, authenticated;

grant execute on function public.terminal_identificar_llavero_qr(
  text,
  uuid,
  uuid,
  text
)
to anon, authenticated;

commit;