begin;

create function public.terminal_listar_beneficios_canje_desde_lectura(
  p_lectura_id uuid,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  id uuid,
  beneficio_id uuid,
  nombre text,
  descripcion text,
  tipo public.tipo_beneficio_regis,
  porcentaje_descuento_bp integer,
  monto_descuento_fijo_clp integer,
  costo_regis integer,
  compra_minima_clp integer,
  tope_descuento_clp integer,
  porcentaje_maximo_canje_bp integer,
  cupos_totales integer,
  vigencia_hasta timestamptz,
  limite_por_vecino integer,
  usos_vecino integer,
  canjes_confirmados_vecino integer,
  saldo_disponible integer,
  estado_disponibilidad text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_lectura public.lecturas_llavero_terminal;
  v_llavero public.llaveros_nfc;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  v_lectura := public.validar_lectura_terminal_turno_interna(
    p_lectura_id,
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
  where llavero.id = v_lectura.llavero_id
    and llavero.estado = 'activo'
    and perfil.estado = 'activo';

  if not found then
    raise exception 'El llavero no está activo o su cuenta está inactiva'
      using errcode = 'P0002';
  end if;

  perform public.expirar_reservas_canje_regis();

  return query
  with ocupacion as (
    select
      canje.beneficio_id,

      count(*) filter (
        where canje.estado = 'confirmado'
          or (
            canje.estado = 'reservado'
            and canje.expira_en > clock_timestamp()
          )
      )::integer as total,

      count(*) filter (
        where canje.vecino_id = v_llavero.vecino_id
          and (
            canje.estado = 'confirmado'
            or (
              canje.estado = 'reservado'
              and canje.expira_en > clock_timestamp()
            )
          )
      )::integer as total_vecino,

      count(*) filter (
        where canje.vecino_id = v_llavero.vecino_id
          and canje.estado = 'confirmado'
      )::integer as confirmados_vecino

    from public.canjes_regis as canje
    where canje.negocio_id = v_turno.negocio_id
    group by canje.beneficio_id
  )
  select
    version.id,
    version.beneficio_id,
    version.nombre::text,
    version.descripcion,
    version.tipo,
    version.porcentaje_descuento_bp,
    version.monto_descuento_fijo_clp,
    version.costo_regis,
    version.compra_minima_clp,
    version.tope_descuento_clp,
    version.porcentaje_maximo_canje_bp,
    version.cupos_totales,
    version.vigencia_hasta,
    version.limite_por_vecino,
    coalesce(ocupacion.total_vecino, 0),
    coalesce(ocupacion.confirmados_vecino, 0),
    coalesce(saldo.disponibles, 0),

    case
      when coalesce(ocupacion.total_vecino, 0) >= version.limite_por_vecino
        then 'limite_alcanzado'

      when version.cupos_totales is not null
        and coalesce(ocupacion.total, 0) >= version.cupos_totales
        then 'agotado'

      when coalesce(saldo.disponibles, 0) < version.costo_regis
        then 'saldo_insuficiente'

      else 'disponible'
    end::text

  from public.versiones_beneficio_regis as version
  join public.beneficios_regis as beneficio
    on beneficio.id = version.beneficio_id

  left join public.saldos_regis as saldo
    on saldo.vecino_id = v_llavero.vecino_id
    and saldo.negocio_id = beneficio.negocio_id

  left join ocupacion
    on ocupacion.beneficio_id = beneficio.id

  where beneficio.negocio_id = v_turno.negocio_id
    and version.estado = 'activo'
    and version.vigencia_desde <= clock_timestamp()
    and (
      version.vigencia_hasta is null
      or version.vigencia_hasta > clock_timestamp()
    )

  order by
    case
      when coalesce(ocupacion.total_vecino, 0) < version.limite_por_vecino
        and (
          version.cupos_totales is null
          or coalesce(ocupacion.total, 0) < version.cupos_totales
        )
        and coalesce(saldo.disponibles, 0) >= version.costo_regis
        then 0
      else 1
    end,
    version.costo_regis,
    version.nombre;
end;
$$;

revoke all on function public.terminal_listar_beneficios_canje_desde_lectura(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.terminal_listar_beneficios_canje_desde_lectura(
  uuid, uuid, uuid, text
) to anon, authenticated;

comment on function public.terminal_listar_beneficios_canje_desde_lectura(
  uuid, uuid, uuid, text
) is
  'Lista beneficios del negocio para el vecino identificado por una lectura NFC del turno, indicando disponibilidad, saldo y límites sin confiar en IDs enviados por el cliente.';

commit;