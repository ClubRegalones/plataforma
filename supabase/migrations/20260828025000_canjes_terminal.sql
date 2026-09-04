begin;

-- API de canjes exclusiva de la Terminal PWA.
-- No modifica los RPC autenticados usados por Portal Comercio o Portal Vecino.

create function public.terminal_listar_beneficios_canje(
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
  vigencia_hasta timestamptz
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

  perform public.expirar_reservas_canje_regis();

  return query
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
    version.vigencia_hasta
  from public.versiones_beneficio_regis as version
  join public.beneficios_regis as beneficio
    on beneficio.id = version.beneficio_id
  where beneficio.negocio_id = v_turno.negocio_id
    and version.estado = 'activo'
    and version.vigencia_desde <= clock_timestamp()
    and (
      version.vigencia_hasta is null
      or version.vigencia_hasta > clock_timestamp()
    )
  order by version.costo_regis, version.nombre;
end;
$$;

create function public.terminal_consultar_canje_qr(
  p_qr_token text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  canje_id uuid,
  codigo_publico text,
  estado public.estado_canje_regis,
  nombre_beneficio text,
  costo_regis integer,
  compra_minima_clp integer,
  tipo public.tipo_beneficio_regis,
  porcentaje_descuento_bp integer,
  monto_descuento_fijo_clp integer,
  tope_descuento_clp integer,
  porcentaje_maximo_canje_bp integer,
  expira_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_token_hash text;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  perform public.expirar_reservas_canje_regis();

  v_token_hash := encode(
    extensions.digest(
      convert_to(btrim(coalesce(p_qr_token, '')), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  return query
  select
    canje.id,
    canje.codigo_publico::text,
    canje.estado,
    version.nombre::text,
    canje.costo_regis,
    version.compra_minima_clp,
    version.tipo,
    version.porcentaje_descuento_bp,
    version.monto_descuento_fijo_clp,
    version.tope_descuento_clp,
    version.porcentaje_maximo_canje_bp,
    canje.expira_en
  from public.canjes_regis as canje
  join public.versiones_beneficio_regis as version
    on version.id = canje.beneficio_version_id
  where canje.qr_token_hash = v_token_hash
    and canje.negocio_id = v_turno.negocio_id
    and canje.origen = 'qr';

  if not found then
    raise exception 'Canje QR no encontrado para este negocio'
      using errcode = 'P0002';
  end if;
end;
$$;

create function public.terminal_reservar_canje_llavero(
  p_token_llavero text,
  p_beneficio_version_id uuid,
  p_idempotency_key text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  canje_id uuid,
  codigo_publico text,
  estado public.estado_canje_regis,
  expira_en timestamptz,
  costo_regis integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_llavero public.llaveros_nfc;
  v_canje public.canjes_regis;
  v_token text := btrim(coalesce(p_token_llavero, ''));
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if not exists (
    select 1
    from public.versiones_beneficio_regis as version
    join public.beneficios_regis as beneficio
      on beneficio.id = version.beneficio_id
    where version.id = p_beneficio_version_id
      and beneficio.negocio_id = v_turno.negocio_id
  ) then
    raise exception 'El beneficio no pertenece al negocio de la Terminal'
      using errcode = '42501';
  end if;

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
  where llavero.token_hash = encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    )
    and llavero.estado = 'activo'
    and perfil.estado = 'activo'
  for share of llavero;

  if not found then
    raise exception 'El llavero no existe, no está activo o su cuenta está inactiva'
      using errcode = 'P0002';
  end if;

  v_canje := public.crear_reserva_canje_regis_interna(
    v_llavero.vecino_id,
    p_beneficio_version_id,
    'llavero',
    null,
    v_turno.caja_id,
    v_llavero.id,
    p_idempotency_key
  );

  update public.canjes_regis
  set turno_caja_id = v_turno.id
  where id = v_canje.id
  returning * into v_canje;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  return query
  select
    v_canje.id,
    v_canje.codigo_publico::text,
    v_canje.estado,
    v_canje.expira_en,
    v_canje.costo_regis;
end;
$$;

create function public.terminal_confirmar_compra_con_canje(
  p_canje_id uuid,
  p_monto_bruto_clp integer,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text,
  p_folio_boleta text default null,
  p_qr_token text default null
)
returns table (
  canje_id uuid,
  estado public.estado_canje_regis,
  compra_id uuid,
  monto_compra_bruto_clp integer,
  descuento_total_clp integer,
  valor_financiado_regis_clp integer,
  aporte_promocional_negocio_clp integer,
  monto_final_pagado_clp integer,
  regis_utilizados integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_sucursal_id uuid;
  v_canje public.canjes_regis;
  v_version public.versiones_beneficio_regis;
  v_solicitud public.solicitudes_compra;
  v_compra public.compras;
  v_descuento_teorico integer;
  v_limite_general integer;
  v_descuento integer;
  v_valor_financiado integer;
  v_aporte_promocional integer;
  v_monto_final integer;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  select caja.sucursal_id
  into v_sucursal_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = v_turno.caja_id
    and sucursal.negocio_id = v_turno.negocio_id;

  if not found then
    raise exception 'La caja del turno no pertenece al negocio de la Terminal'
      using errcode = '42501';
  end if;

  perform public.expirar_reservas_canje_regis();

  select canje.*
  into v_canje
  from public.canjes_regis as canje
  where canje.id = p_canje_id
  for update;

  if not found then
    raise exception 'Canje no encontrado'
      using errcode = 'P0002';
  end if;

  if v_canje.negocio_id <> v_turno.negocio_id then
    raise exception 'El canje no pertenece al negocio de la Terminal'
      using errcode = '42501';
  end if;

  if v_canje.origen = 'llavero'
    and v_canje.caja_id <> v_turno.caja_id
  then
    raise exception 'El canje asistido pertenece a otra caja'
      using errcode = '42501';
  end if;

  if v_canje.origen = 'qr'
    and v_canje.qr_token_hash is distinct from encode(
      extensions.digest(
        convert_to(btrim(coalesce(p_qr_token, '')), 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  then
    raise exception 'El token QR no autoriza este canje'
      using errcode = '42501';
  end if;

  if v_canje.estado = 'confirmado' then
    if v_canje.turno_caja_id is distinct from v_turno.id then
      raise exception 'El canje ya fue confirmado en otro turno'
        using errcode = '23514';
    end if;

    return query select
      v_canje.id,
      v_canje.estado,
      v_canje.compra_id,
      v_canje.monto_compra_bruto_clp,
      v_canje.descuento_total_clp,
      v_canje.valor_financiado_regis_clp,
      v_canje.aporte_promocional_negocio_clp,
      v_canje.monto_final_pagado_clp,
      v_canje.costo_regis;
    return;
  end if;

  if v_canje.estado <> 'reservado'
    or v_canje.expira_en <= clock_timestamp()
  then
    raise exception 'El canje ya no está disponible para confirmar'
      using errcode = '23514';
  end if;

  if p_monto_bruto_clp is null or p_monto_bruto_clp <= 0 then
    raise exception 'El monto de la compra debe ser mayor que cero'
      using errcode = '22023';
  end if;

  select version.*
  into v_version
  from public.versiones_beneficio_regis as version
  where version.id = v_canje.beneficio_version_id;

  if p_monto_bruto_clp < v_version.compra_minima_clp then
    raise exception 'La compra no alcanza el mínimo del beneficio'
      using errcode = '23514';
  end if;

  v_descuento_teorico := case
    when v_version.tipo = 'porcentaje_descuento' then floor(
      p_monto_bruto_clp::numeric
      * v_version.porcentaje_descuento_bp::numeric
      / 10000::numeric
    )::integer
    else v_version.monto_descuento_fijo_clp
  end;

  v_limite_general := floor(
    p_monto_bruto_clp::numeric
    * v_version.porcentaje_maximo_canje_bp::numeric
    / 10000::numeric
  )::integer;

  v_descuento := least(
    v_descuento_teorico,
    coalesce(v_version.tope_descuento_clp, v_descuento_teorico),
    v_limite_general,
    p_monto_bruto_clp
  );
  v_valor_financiado := v_canje.costo_regis * v_canje.valor_regis_clp;

  if v_descuento < v_valor_financiado then
    raise exception 'El descuento calculado es menor que el valor de los REGIS reservados'
      using errcode = '23514';
  end if;

  v_aporte_promocional := v_descuento - v_valor_financiado;
  v_monto_final := p_monto_bruto_clp - v_descuento;

  if v_monto_final <= 0 then
    raise exception 'El beneficio no puede cubrir la compra completa'
      using errcode = '23514';
  end if;

  insert into public.solicitudes_compra (
    vecino_id,
    caja_id,
    llavero_id,
    monto_informado,
    informado_por,
    estado,
    expira_en,
    idempotency_key,
    turno_caja_id
  ) values (
    v_canje.vecino_id,
    v_turno.caja_id,
    v_canje.llavero_id,
    v_monto_final,
    'cajero',
    'aprobada',
    clock_timestamp() + interval '15 minutes',
    'canje:' || v_canje.id::text || ':solicitud',
    v_turno.id
  )
  returning * into v_solicitud;

  insert into public.compras (
    solicitud_id,
    negocio_id,
    sucursal_id,
    caja_id,
    vecino_id,
    cajero_id,
    monto_final,
    folio_boleta,
    origen,
    monto_bruto_clp,
    descuento_total_clp,
    aporte_promocional_clp,
    regis_utilizados,
    turno_caja_id
  ) values (
    v_solicitud.id,
    v_turno.negocio_id,
    v_sucursal_id,
    v_turno.caja_id,
    v_canje.vecino_id,
    null,
    v_monto_final,
    nullif(btrim(p_folio_boleta), ''),
    case
      when v_canje.origen = 'llavero'
        then 'asistido'::public.origen_compra
      else 'autoservicio'::public.origen_compra
    end,
    p_monto_bruto_clp,
    v_descuento,
    v_aporte_promocional,
    v_canje.costo_regis,
    v_turno.id
  )
  returning * into v_compra;

  update public.canjes_regis
  set
    caja_id = v_turno.caja_id,
    compra_id = v_compra.id,
    estado = 'confirmado',
    monto_compra_bruto_clp = p_monto_bruto_clp,
    descuento_total_clp = v_descuento,
    valor_financiado_regis_clp = v_valor_financiado,
    aporte_promocional_negocio_clp = v_aporte_promocional,
    monto_final_pagado_clp = v_monto_final,
    confirmado_en = clock_timestamp(),
    turno_caja_id = v_turno.id
  where id = v_canje.id
  returning * into v_canje;

  update public.saldos_regis
  set
    reservados = reservados - v_canje.costo_regis,
    canjeados = canjeados + v_canje.costo_regis,
    actualizado_en = clock_timestamp()
  where vecino_id = v_canje.vecino_id
    and negocio_id = v_canje.negocio_id
    and reservados >= v_canje.costo_regis;

  if not found then
    raise exception 'El saldo reservado del canje es inconsistente'
      using errcode = '23514';
  end if;

  insert into public.movimientos_regis (
    vecino_id,
    negocio_id,
    tipo,
    cantidad,
    estado,
    compra_id,
    canje_id,
    regla_regis_id,
    monto_base_clp,
    valor_regis_clp,
    valor_recompensa_clp,
    idempotency_key,
    metadata
  ) values (
    v_canje.vecino_id,
    v_canje.negocio_id,
    'canje',
    -v_canje.costo_regis,
    'canjeado',
    v_compra.id,
    v_canje.id,
    v_canje.regla_regis_id,
    p_monto_bruto_clp,
    v_canje.valor_regis_clp,
    v_valor_financiado,
    'canje:' || v_canje.id::text || ':movimiento',
    jsonb_build_object(
      'beneficio_id', v_canje.beneficio_id,
      'beneficio_version_id', v_canje.beneficio_version_id,
      'descuento_total_clp', v_descuento,
      'aporte_promocional_negocio_clp', v_aporte_promocional,
      'turno_caja_id', v_turno.id
    )
  );

  insert into public.vecinos_negocios (
    vecino_id,
    negocio_id,
    primera_compra_en,
    ultima_compra_en
  ) values (
    v_canje.vecino_id,
    v_canje.negocio_id,
    v_compra.creado_en,
    v_compra.creado_en
  )
  on conflict (vecino_id, negocio_id) do update
  set ultima_compra_en = excluded.ultima_compra_en;

  perform public.acreditar_regis_compra(v_compra.id);

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  return query select
    v_canje.id,
    v_canje.estado,
    v_canje.compra_id,
    v_canje.monto_compra_bruto_clp,
    v_canje.descuento_total_clp,
    v_canje.valor_financiado_regis_clp,
    v_canje.aporte_promocional_negocio_clp,
    v_canje.monto_final_pagado_clp,
    v_canje.costo_regis;
end;
$$;

create function public.terminal_cancelar_canje(
  p_canje_id uuid,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  canje_id uuid,
  estado public.estado_canje_regis,
  costo_regis integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_canje public.canjes_regis;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  perform public.expirar_reservas_canje_regis();

  select canje.*
  into v_canje
  from public.canjes_regis as canje
  where canje.id = p_canje_id
    and canje.negocio_id = v_turno.negocio_id
  for update;

  if not found then
    raise exception 'Canje no encontrado para el negocio de esta Terminal'
      using errcode = 'P0002';
  end if;

  if v_canje.estado = 'confirmado' then
    raise exception 'Un canje confirmado no se puede cancelar'
      using errcode = '23514';
  end if;

  if v_canje.estado = 'reservado' then
    update public.saldos_regis
    set
      disponibles = disponibles + v_canje.costo_regis,
      reservados = reservados - v_canje.costo_regis,
      actualizado_en = clock_timestamp()
    where vecino_id = v_canje.vecino_id
      and negocio_id = v_canje.negocio_id
      and reservados >= v_canje.costo_regis;

    if not found then
      raise exception 'El saldo reservado del canje es inconsistente'
        using errcode = '23514';
    end if;

    update public.canjes_regis
    set
      estado = 'cancelado',
      cancelado_en = clock_timestamp(),
      turno_caja_id = v_turno.id
    where id = v_canje.id
    returning * into v_canje;
  end if;

  return query
  select v_canje.id, v_canje.estado, v_canje.costo_regis;
end;
$$;

create function public.terminal_listar_historial_canjes(
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text,
  p_limite integer default 100
)
returns table (
  canje_id uuid,
  codigo_publico text,
  beneficio_id uuid,
  beneficio_version_id uuid,
  negocio_id uuid,
  nombre_negocio text,
  nombre_beneficio text,
  origen public.origen_canje_regis,
  costo_regis integer,
  monto_compra_bruto_clp integer,
  descuento_total_clp integer,
  monto_final_pagado_clp integer,
  confirmado_en timestamptz,
  leido boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_limite integer := least(greatest(coalesce(p_limite, 100), 1), 500);
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  return query
  select
    canje.id,
    canje.codigo_publico::text,
    canje.beneficio_id,
    canje.beneficio_version_id,
    canje.negocio_id,
    negocio.nombre::text,
    version.nombre::text,
    canje.origen,
    canje.costo_regis,
    canje.monto_compra_bruto_clp,
    canje.descuento_total_clp,
    canje.monto_final_pagado_clp,
    canje.confirmado_en,
    canje.leido_negocio_en is not null
  from public.canjes_regis as canje
  join public.negocios as negocio
    on negocio.id = canje.negocio_id
  join public.versiones_beneficio_regis as version
    on version.id = canje.beneficio_version_id
  where canje.negocio_id = v_turno.negocio_id
    and canje.estado = 'confirmado'
  order by canje.confirmado_en desc, canje.id desc
  limit v_limite;
end;
$$;

create function public.terminal_marcar_canje_leido(
  p_canje_id uuid,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  canje_id uuid,
  destino public.destino_notificacion_canje_regis,
  leido_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_leido_en timestamptz := clock_timestamp();
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  update public.canjes_regis
  set leido_negocio_en = coalesce(leido_negocio_en, v_leido_en)
  where id = p_canje_id
    and negocio_id = v_turno.negocio_id
    and estado = 'confirmado'
  returning leido_negocio_en into v_leido_en;

  if not found then
    raise exception 'Canje confirmado no encontrado para este negocio'
      using errcode = 'P0002';
  end if;

  return query select
    p_canje_id,
    'negocio'::public.destino_notificacion_canje_regis,
    v_leido_en;
end;
$$;

revoke all on function public.terminal_listar_beneficios_canje(
  uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.terminal_consultar_canje_qr(
  text, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.terminal_reservar_canje_llavero(
  text, uuid, text, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.terminal_confirmar_compra_con_canje(
  uuid, integer, uuid, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function public.terminal_cancelar_canje(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.terminal_listar_historial_canjes(
  uuid, uuid, text, integer
) from public, anon, authenticated;
revoke all on function public.terminal_marcar_canje_leido(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.terminal_listar_beneficios_canje(
  uuid, uuid, text
) to anon, authenticated;
grant execute on function public.terminal_consultar_canje_qr(
  text, uuid, uuid, text
) to anon, authenticated;
grant execute on function public.terminal_reservar_canje_llavero(
  text, uuid, text, uuid, uuid, text
) to anon, authenticated;
grant execute on function public.terminal_confirmar_compra_con_canje(
  uuid, integer, uuid, uuid, text, text, text
) to anon, authenticated;
grant execute on function public.terminal_cancelar_canje(
  uuid, uuid, uuid, text
) to anon, authenticated;
grant execute on function public.terminal_listar_historial_canjes(
  uuid, uuid, text, integer
) to anon, authenticated;
grant execute on function public.terminal_marcar_canje_leido(
  uuid, uuid, uuid, text
) to anon, authenticated;

comment on function public.terminal_confirmar_compra_con_canje(
  uuid, integer, uuid, uuid, text, text, text
) is
  'Confirma compra y canje sin sesión humana. La caja y el negocio se derivan exclusivamente de Terminal + turno.';

commit;
