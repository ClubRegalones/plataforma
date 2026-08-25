begin;

create type public.tipo_movimiento_regis as enum (
  'acreditacion_compra',
  'canje',
  'reversa',
  'ajuste',
  'bonificacion'
);

create type public.estado_movimiento_regis as enum (
  'pendiente',
  'disponible',
  'canjeado',
  'revertido',
  'bloqueado'
);

create type public.estado_alerta_riesgo as enum (
  'abierta',
  'en_revision',
  'resuelta',
  'descartada'
);

create table public.reglas_regis (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references public.negocios (id) on delete cascade,
  version integer not null,
  tasa_acumulacion_bp integer not null,
  valor_regis_clp integer not null,
  monto_minimo_compra_clp integer not null,
  porcentaje_maximo_canje_bp integer not null,
  conservar_remanente boolean not null default true,
  activa boolean not null default true,
  vigencia_desde timestamptz not null default now(),
  vigencia_hasta timestamptz,
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint reglas_regis_version_valida check (version > 0),
  constraint reglas_regis_tasa_valida
    check (tasa_acumulacion_bp between 1 and 10000),
  constraint reglas_regis_valor_valido check (valor_regis_clp > 0),
  constraint reglas_regis_minimo_valido
    check (monto_minimo_compra_clp >= 0),
  constraint reglas_regis_canje_valido
    check (porcentaje_maximo_canje_bp between 1 and 10000),
  constraint reglas_regis_vigencia_valida check (
    vigencia_hasta is null or vigencia_hasta > vigencia_desde
  )
);

create unique index reglas_regis_version_global_unica
  on public.reglas_regis (version)
  where negocio_id is null;
create unique index reglas_regis_version_negocio_unica
  on public.reglas_regis (negocio_id, version)
  where negocio_id is not null;
create index reglas_regis_vigencia_idx
  on public.reglas_regis (
    negocio_id,
    activa,
    vigencia_desde desc,
    version desc
  );

create table public.configuraciones_riesgo_regis (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references public.negocios (id) on delete cascade,
  version integer not null,
  monto_compra_revision_clp integer,
  max_acumulaciones_ventana integer,
  ventana_acumulaciones_minutos integer,
  activa boolean not null default true,
  vigencia_desde timestamptz not null default now(),
  vigencia_hasta timestamptz,
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint configuraciones_riesgo_version_valida check (version > 0),
  constraint configuraciones_riesgo_monto_valido check (
    monto_compra_revision_clp is null
    or monto_compra_revision_clp > 0
  ),
  constraint configuraciones_riesgo_velocidad_valida check (
    (
      max_acumulaciones_ventana is null
      and ventana_acumulaciones_minutos is null
    )
    or (
      max_acumulaciones_ventana is not null
      and max_acumulaciones_ventana > 0
      and ventana_acumulaciones_minutos is not null
      and ventana_acumulaciones_minutos > 0
    )
  ),
  constraint configuraciones_riesgo_vigencia_valida check (
    vigencia_hasta is null or vigencia_hasta > vigencia_desde
  )
);

create unique index configuraciones_riesgo_version_global_unica
  on public.configuraciones_riesgo_regis (version)
  where negocio_id is null;
create unique index configuraciones_riesgo_version_negocio_unica
  on public.configuraciones_riesgo_regis (negocio_id, version)
  where negocio_id is not null;
create index configuraciones_riesgo_vigencia_idx
  on public.configuraciones_riesgo_regis (
    negocio_id,
    activa,
    vigencia_desde desc,
    version desc
  );

create table public.movimientos_regis (
  id uuid primary key default gen_random_uuid(),
  vecino_id uuid not null references auth.users (id) on delete restrict,
  negocio_id uuid not null references public.negocios (id) on delete restrict,
  tipo public.tipo_movimiento_regis not null,
  cantidad integer not null,
  estado public.estado_movimiento_regis not null,
  compra_id uuid references public.compras (id) on delete restrict,
  canje_id uuid,
  movimiento_relacionado_id uuid
    references public.movimientos_regis (id) on delete restrict,
  regla_regis_id uuid references public.reglas_regis (id) on delete restrict,
  monto_base_clp integer,
  tasa_acumulacion_bp integer,
  valor_regis_clp integer,
  valor_recompensa_clp numeric(14, 4),
  remanente_antes_clp numeric(14, 4),
  remanente_despues_clp numeric(14, 4),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  constraint movimientos_regis_cantidad_valida check (cantidad <> 0),
  constraint movimientos_regis_idempotencia_valida check (
    char_length(btrim(idempotency_key)) between 8 and 200
  ),
  constraint movimientos_regis_signo_valido check (
    (tipo in ('acreditacion_compra', 'bonificacion') and cantidad > 0)
    or (tipo in ('canje', 'reversa') and cantidad < 0)
    or tipo = 'ajuste'
  ),
  constraint movimientos_regis_snapshot_valido check (
    (
      tipo <> 'acreditacion_compra'
    )
    or (
      compra_id is not null
      and regla_regis_id is not null
      and monto_base_clp is not null
      and monto_base_clp > 0
      and tasa_acumulacion_bp is not null
      and tasa_acumulacion_bp > 0
      and valor_regis_clp is not null
      and valor_regis_clp > 0
      and valor_recompensa_clp is not null
      and valor_recompensa_clp >= 0
      and remanente_antes_clp is not null
      and remanente_antes_clp >= 0
      and remanente_despues_clp is not null
      and remanente_despues_clp >= 0
    )
  )
);

create unique index movimientos_regis_acreditacion_compra_unica
  on public.movimientos_regis (compra_id)
  where tipo = 'acreditacion_compra';
create index movimientos_regis_vecino_negocio_creado_idx
  on public.movimientos_regis (vecino_id, negocio_id, creado_en desc);
create index movimientos_regis_negocio_creado_idx
  on public.movimientos_regis (negocio_id, creado_en desc);

create table public.saldos_regis (
  id uuid primary key default gen_random_uuid(),
  vecino_id uuid not null references auth.users (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  disponibles integer not null default 0,
  reservados integer not null default 0,
  pendientes integer not null default 0,
  canjeados integer not null default 0,
  remanente_valor_clp numeric(14, 4) not null default 0,
  actualizado_en timestamptz not null default now(),
  constraint saldos_regis_relacion_unica unique (vecino_id, negocio_id),
  constraint saldos_regis_disponibles_validos check (disponibles >= 0),
  constraint saldos_regis_reservados_validos check (reservados >= 0),
  constraint saldos_regis_pendientes_validos check (pendientes >= 0),
  constraint saldos_regis_canjeados_validos check (canjeados >= 0),
  constraint saldos_regis_remanente_valido check (remanente_valor_clp >= 0)
);

create index saldos_regis_negocio_actualizado_idx
  on public.saldos_regis (negocio_id, actualizado_en desc);

create table public.alertas_riesgo (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid references public.compras (id) on delete restrict,
  movimiento_regis_id uuid
    references public.movimientos_regis (id) on delete restrict,
  vecino_id uuid not null references auth.users (id) on delete restrict,
  negocio_id uuid not null references public.negocios (id) on delete restrict,
  regla varchar(160) not null,
  severidad public.severidad_riesgo not null,
  detalle text,
  estado public.estado_alerta_riesgo not null default 'abierta',
  resuelta_por uuid references auth.users (id) on delete set null,
  resuelta_en timestamptz,
  creado_en timestamptz not null default now(),
  constraint alertas_riesgo_regla_valida check (
    char_length(btrim(regla)) between 3 and 160
  ),
  constraint alertas_riesgo_resolucion_valida check (
    (estado in ('resuelta', 'descartada') and resuelta_en is not null)
    or (estado in ('abierta', 'en_revision') and resuelta_en is null)
  )
);

create index alertas_riesgo_negocio_estado_creado_idx
  on public.alertas_riesgo (negocio_id, estado, creado_en desc);
create index alertas_riesgo_compra_idx
  on public.alertas_riesgo (compra_id);

alter table public.compras
  add column regla_regis_id uuid
    references public.reglas_regis (id) on delete restrict,
  add column monto_base_regis_clp integer,
  add column tasa_acumulacion_bp_aplicada integer,
  add column valor_regis_clp_aplicado integer,
  add column regis_generados integer not null default 0,
  add column regis_procesados_en timestamptz,
  add constraint compras_regis_generados_validos check (regis_generados >= 0),
  add constraint compras_regis_snapshot_valido check (
    regis_procesados_en is null
    or (
      regla_regis_id is not null
      and monto_base_regis_clp is not null
      and monto_base_regis_clp > 0
      and tasa_acumulacion_bp_aplicada is not null
      and tasa_acumulacion_bp_aplicada > 0
      and valor_regis_clp_aplicado is not null
      and valor_regis_clp_aplicado > 0
    )
  );

insert into public.reglas_regis (
  id,
  negocio_id,
  version,
  tasa_acumulacion_bp,
  valor_regis_clp,
  monto_minimo_compra_clp,
  porcentaje_maximo_canje_bp,
  conservar_remanente,
  activa,
  vigencia_desde
)
values (
  '90000000-0000-4000-8000-000000000001',
  null,
  1,
  500,
  50,
  1000,
  2000,
  true,
  true,
  statement_timestamp()
);

insert into public.configuraciones_riesgo_regis (
  id,
  negocio_id,
  version,
  monto_compra_revision_clp,
  max_acumulaciones_ventana,
  ventana_acumulaciones_minutos,
  activa,
  vigencia_desde
)
values (
  '90000000-0000-4000-8000-000000000002',
  null,
  1,
  null,
  null,
  null,
  true,
  statement_timestamp()
);

create function public.impedir_mutacion_movimiento_regis()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Los movimientos REGIS son inmutables; registra un movimiento compensatorio'
    using errcode = '55000';
end;
$$;

create trigger movimientos_regis_inmutables
before update or delete on public.movimientos_regis
for each row execute function public.impedir_mutacion_movimiento_regis();

create function public.acreditar_regis_compra(p_compra_id uuid)
returns public.movimientos_regis
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_compra public.compras;
  v_regla public.reglas_regis;
  v_riesgo public.configuraciones_riesgo_regis;
  v_saldo public.saldos_regis;
  v_movimiento public.movimientos_regis;
  v_valor_recompensa numeric(14, 4);
  v_valor_total numeric(14, 4);
  v_remanente_antes numeric(14, 4);
  v_remanente_despues numeric(14, 4);
  v_regis integer;
  v_acumulaciones_recientes integer := 0;
  v_revisar_monto boolean := false;
  v_revisar_velocidad boolean := false;
  v_estado public.estado_movimiento_regis :=
    'disponible'::public.estado_movimiento_regis;
  v_severidad public.severidad_riesgo;
begin
  select compra.*
  into v_compra
  from public.compras as compra
  where compra.id = p_compra_id
  for update;

  if not found then
    raise exception 'Compra no encontrada'
      using errcode = 'P0002';
  end if;

  if v_compra.regis_procesados_en is not null then
    select movimiento.*
    into v_movimiento
    from public.movimientos_regis as movimiento
    where movimiento.compra_id = v_compra.id
      and movimiento.tipo = 'acreditacion_compra';

    return v_movimiento;
  end if;

  select regla.*
  into v_regla
  from public.reglas_regis as regla
  where regla.activa
    and (regla.negocio_id is null or regla.negocio_id = v_compra.negocio_id)
    and regla.vigencia_desde <= v_compra.creado_en
    and (regla.vigencia_hasta is null or regla.vigencia_hasta > v_compra.creado_en)
  order by
    (regla.negocio_id is not null) desc,
    regla.vigencia_desde desc,
    regla.version desc
  limit 1;

  if not found then
    raise exception 'No existe una regla REGIS vigente para la compra'
      using errcode = 'P0001';
  end if;

  insert into public.saldos_regis (vecino_id, negocio_id)
  values (v_compra.vecino_id, v_compra.negocio_id)
  on conflict (vecino_id, negocio_id) do nothing;

  select saldo.*
  into v_saldo
  from public.saldos_regis as saldo
  where saldo.vecino_id = v_compra.vecino_id
    and saldo.negocio_id = v_compra.negocio_id
  for update;

  if v_compra.monto_final < v_regla.monto_minimo_compra_clp then
    update public.compras
    set
      regla_regis_id = v_regla.id,
      monto_base_regis_clp = v_compra.monto_final,
      tasa_acumulacion_bp_aplicada = v_regla.tasa_acumulacion_bp,
      valor_regis_clp_aplicado = v_regla.valor_regis_clp,
      regis_generados = 0,
      regis_procesados_en = now()
    where id = v_compra.id;

    return null;
  end if;

  v_valor_recompensa :=
    (v_compra.monto_final::numeric * v_regla.tasa_acumulacion_bp::numeric)
    / 10000::numeric;
  v_remanente_antes := case
    when v_regla.conservar_remanente then v_saldo.remanente_valor_clp
    else 0
  end;
  v_valor_total := v_valor_recompensa + v_remanente_antes;
  v_regis := floor(v_valor_total / v_regla.valor_regis_clp)::integer;
  v_remanente_despues := case
    when v_regla.conservar_remanente
      then v_valor_total - (v_regis * v_regla.valor_regis_clp)
    else 0
  end;

  select configuracion.*
  into v_riesgo
  from public.configuraciones_riesgo_regis as configuracion
  where configuracion.activa
    and (
      configuracion.negocio_id is null
      or configuracion.negocio_id = v_compra.negocio_id
    )
    and configuracion.vigencia_desde <= v_compra.creado_en
    and (
      configuracion.vigencia_hasta is null
      or configuracion.vigencia_hasta > v_compra.creado_en
    )
  order by
    (configuracion.negocio_id is not null) desc,
    configuracion.vigencia_desde desc,
    configuracion.version desc
  limit 1;

  if found then
    v_revisar_monto :=
      v_riesgo.monto_compra_revision_clp is not null
      and v_compra.monto_final >= v_riesgo.monto_compra_revision_clp;

    if v_riesgo.max_acumulaciones_ventana is not null then
      select count(*)::integer
      into v_acumulaciones_recientes
      from public.movimientos_regis as movimiento
      where movimiento.vecino_id = v_compra.vecino_id
        and movimiento.negocio_id = v_compra.negocio_id
        and movimiento.tipo = 'acreditacion_compra'
        and movimiento.creado_en >= (
          v_compra.creado_en
          - make_interval(mins => v_riesgo.ventana_acumulaciones_minutos)
        );

      v_revisar_velocidad :=
        v_acumulaciones_recientes >= v_riesgo.max_acumulaciones_ventana;
    end if;
  end if;

  if v_revisar_monto or v_revisar_velocidad then
    v_estado := 'pendiente'::public.estado_movimiento_regis;
    v_severidad := case
      when v_revisar_monto then 'alta'::public.severidad_riesgo
      else 'media'::public.severidad_riesgo
    end;
  end if;

  if v_regis > 0 then
    insert into public.movimientos_regis (
      vecino_id,
      negocio_id,
      tipo,
      cantidad,
      estado,
      compra_id,
      regla_regis_id,
      monto_base_clp,
      tasa_acumulacion_bp,
      valor_regis_clp,
      valor_recompensa_clp,
      remanente_antes_clp,
      remanente_despues_clp,
      idempotency_key,
      metadata
    )
    values (
      v_compra.vecino_id,
      v_compra.negocio_id,
      'acreditacion_compra',
      v_regis,
      v_estado,
      v_compra.id,
      v_regla.id,
      v_compra.monto_final,
      v_regla.tasa_acumulacion_bp,
      v_regla.valor_regis_clp,
      v_valor_recompensa,
      v_remanente_antes,
      v_remanente_despues,
      'compra:' || v_compra.id::text || ':acreditacion',
      jsonb_build_object(
        'regla_version', v_regla.version,
        'alcance_regla', case
          when v_regla.negocio_id is null then 'global'
          else 'negocio'
        end
      )
    )
    returning * into v_movimiento;
  end if;

  update public.saldos_regis
  set
    disponibles = disponibles + case when v_estado = 'disponible' then v_regis else 0 end,
    pendientes = pendientes + case when v_estado = 'pendiente' then v_regis else 0 end,
    remanente_valor_clp = v_remanente_despues,
    actualizado_en = now()
  where id = v_saldo.id;

  update public.compras
  set
    regla_regis_id = v_regla.id,
    monto_base_regis_clp = v_compra.monto_final,
    tasa_acumulacion_bp_aplicada = v_regla.tasa_acumulacion_bp,
    valor_regis_clp_aplicado = v_regla.valor_regis_clp,
    regis_generados = v_regis,
    regis_procesados_en = now(),
    riesgo = case when v_estado = 'pendiente' then v_severidad else riesgo end
  where id = v_compra.id;

  if v_revisar_monto then
    insert into public.alertas_riesgo (
      compra_id,
      movimiento_regis_id,
      vecino_id,
      negocio_id,
      regla,
      severidad,
      detalle
    )
    values (
      v_compra.id,
      v_movimiento.id,
      v_compra.vecino_id,
      v_compra.negocio_id,
      'monto_compra_alto',
      'alta',
      'La acreditación quedó pendiente por superar el límite configurado.'
    );
  end if;

  if v_revisar_velocidad then
    insert into public.alertas_riesgo (
      compra_id,
      movimiento_regis_id,
      vecino_id,
      negocio_id,
      regla,
      severidad,
      detalle
    )
    values (
      v_compra.id,
      v_movimiento.id,
      v_compra.vecino_id,
      v_compra.negocio_id,
      'acumulaciones_seguidas',
      'media',
      'La acreditación quedó pendiente por velocidad de acumulación.'
    );
  end if;

  return v_movimiento;
end;
$$;

create function public.consultar_saldo_regis(
  p_negocio_id uuid,
  p_vecino_id uuid default null
)
returns table (
  vecino_id uuid,
  negocio_id uuid,
  disponibles integer,
  reservados integer,
  pendientes integer,
  canjeados integer,
  remanente_valor_clp numeric,
  actualizado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_solicitante_id uuid := (select auth.uid());
  v_vecino_id uuid := coalesce(p_vecino_id, (select auth.uid()));
begin
  if v_solicitante_id is null then
    raise exception 'Debes iniciar sesión para consultar REGIS'
      using errcode = '42501';
  end if;

  if v_solicitante_id <> v_vecino_id
    and not public.es_miembro_negocio(p_negocio_id)
    and not public.es_admin_regalones()
  then
    raise exception 'No tienes permisos para consultar este saldo'
      using errcode = '42501';
  end if;

  return query
  select
    saldo.vecino_id,
    saldo.negocio_id,
    saldo.disponibles,
    saldo.reservados,
    saldo.pendientes,
    saldo.canjeados,
    saldo.remanente_valor_clp,
    saldo.actualizado_en
  from public.saldos_regis as saldo
  where saldo.vecino_id = v_vecino_id
    and saldo.negocio_id = p_negocio_id;

  if not found then
    return query
    select
      v_vecino_id,
      p_negocio_id,
      0,
      0,
      0,
      0,
      0::numeric,
      now();
  end if;
end;
$$;

create or replace function public.aprobar_compra(
  p_solicitud_id uuid,
  p_folio_boleta text default null,
  p_origen public.origen_compra default 'autoservicio'
)
returns public.compras
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
  v_compra public.compras;
  v_sucursal_id uuid;
  v_negocio_id uuid;
begin
  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud de compra no encontrada'
      using errcode = 'P0002';
  end if;

  select caja.sucursal_id, sucursal.negocio_id
  into v_sucursal_id, v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  join public.negocios as negocio
    on negocio.id = sucursal.negocio_id
  where caja.id = v_solicitud.caja_id
    and caja.estado = 'activa'
    and sucursal.estado = 'activa'
    and negocio.estado = 'activo';

  if not found then
    raise exception 'La caja, sucursal o negocio no están activos'
      using errcode = '23514';
  end if;

  if not public.es_miembro_negocio(v_negocio_id) then
    raise exception 'No tienes permisos para aprobar esta compra'
      using errcode = '42501';
  end if;

  select compra.*
  into v_compra
  from public.compras as compra
  where compra.solicitud_id = p_solicitud_id;

  if found then
    return v_compra;
  end if;

  if v_solicitud.llavero_id is not null
    and not exists (
      select 1
      from public.llaveros_nfc as llavero
      where llavero.id = v_solicitud.llavero_id
        and llavero.vecino_id = v_solicitud.vecino_id
        and llavero.estado = 'activo'
    )
  then
    raise exception 'El llavero de la compra asistida ya no está activo'
      using errcode = '23514';
  end if;

  if v_solicitud.estado not in ('esperando_cajero', 'pendiente_validacion') then
    raise exception 'La solicitud no está lista para aprobación'
      using errcode = '23514';
  end if;

  if v_solicitud.expira_en <= now() then
    raise exception 'La solicitud está vencida'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set estado = 'aprobada'
  where id = p_solicitud_id
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
    origen
  )
  values (
    v_solicitud.id,
    v_negocio_id,
    v_sucursal_id,
    v_solicitud.caja_id,
    v_solicitud.vecino_id,
    (select auth.uid()),
    coalesce(v_solicitud.monto_corregido, v_solicitud.monto_informado),
    nullif(btrim(p_folio_boleta), ''),
    case
      when v_solicitud.llavero_id is not null then 'asistido'::public.origen_compra
      else p_origen
    end
  )
  returning * into v_compra;

  insert into public.vecinos_negocios (
    vecino_id,
    negocio_id,
    primera_compra_en,
    ultima_compra_en
  )
  values (
    v_solicitud.vecino_id,
    v_negocio_id,
    v_compra.creado_en,
    v_compra.creado_en
  )
  on conflict (vecino_id, negocio_id) do update
  set ultima_compra_en = excluded.ultima_compra_en;

  perform public.acreditar_regis_compra(v_compra.id);

  select compra.*
  into v_compra
  from public.compras as compra
  where compra.id = v_compra.id;

  return v_compra;
end;
$$;

alter table public.reglas_regis enable row level security;
alter table public.configuraciones_riesgo_regis enable row level security;
alter table public.movimientos_regis enable row level security;
alter table public.saldos_regis enable row level security;
alter table public.alertas_riesgo enable row level security;

create policy reglas_regis_leer_vigentes
on public.reglas_regis
for select
to authenticated
using (activa or public.es_admin_regalones());

create policy configuraciones_riesgo_leer_admin
on public.configuraciones_riesgo_regis
for select
to authenticated
using (public.es_admin_regalones());

create policy movimientos_regis_leer_participantes
on public.movimientos_regis
for select
to authenticated
using (
  vecino_id = (select auth.uid())
  or public.es_miembro_negocio(
    negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
  or public.es_admin_regalones()
);

create policy saldos_regis_leer_participantes
on public.saldos_regis
for select
to authenticated
using (
  vecino_id = (select auth.uid())
  or public.es_miembro_negocio(
    negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
  or public.es_admin_regalones()
);

create policy alertas_riesgo_leer_responsables
on public.alertas_riesgo
for select
to authenticated
using (
  public.es_admin_regalones()
  or public.es_miembro_negocio(
    negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
);

revoke all on table public.reglas_regis from anon, authenticated;
revoke all on table public.configuraciones_riesgo_regis from anon, authenticated;
revoke all on table public.movimientos_regis from anon, authenticated;
revoke all on table public.saldos_regis from anon, authenticated;
revoke all on table public.alertas_riesgo from anon, authenticated;

grant select on table public.reglas_regis to authenticated;
grant select on table public.configuraciones_riesgo_regis to authenticated;
grant select on table public.movimientos_regis to authenticated;
grant select on table public.saldos_regis to authenticated;
grant select on table public.alertas_riesgo to authenticated;

revoke all on function public.impedir_mutacion_movimiento_regis()
  from public, anon, authenticated;
revoke all on function public.acreditar_regis_compra(uuid)
  from public, anon, authenticated;
revoke all on function public.consultar_saldo_regis(uuid, uuid)
  from public, anon;
revoke all on function public.aprobar_compra(
  uuid,
  text,
  public.origen_compra
) from public, anon;

grant execute on function public.consultar_saldo_regis(uuid, uuid)
  to authenticated;
grant execute on function public.aprobar_compra(
  uuid,
  text,
  public.origen_compra
) to authenticated;

comment on table public.reglas_regis is
  'Versiones de la regla económica REGIS; el piloto usa 5 %, $50 por REGIS y mínimo de $1.000.';
comment on table public.configuraciones_riesgo_regis is
  'Límites antifraude versionados; los umbrales nulos permanecen desactivados hasta aprobación comercial.';
comment on table public.movimientos_regis is
  'Ledger inmutable y fuente de verdad histórica de REGIS.';
comment on table public.saldos_regis is
  'Resumen derivado por vecino y negocio; incluye el remanente de valor que todavía no completa un REGIS.';
comment on table public.alertas_riesgo is
  'Alertas internas que mantienen pendientes los REGIS sin invalidar la compra confirmada.';
comment on table public.compras is
  'Registro permanente de una compra aprobada; su aprobación procesa la acumulación REGIS de forma atómica.';
comment on function public.acreditar_regis_compra(uuid) is
  'Acredita REGIS de forma atómica e idempotente usando la regla vigente y conserva el remanente por vecino y negocio.';
comment on function public.consultar_saldo_regis(uuid, uuid) is
  'Consulta un saldo propio o, para personal autorizado, el saldo de un vecino dentro de su negocio.';

commit;
