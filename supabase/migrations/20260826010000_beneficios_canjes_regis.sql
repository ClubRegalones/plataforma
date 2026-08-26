begin;

create type public.tipo_beneficio_regis as enum (
  'porcentaje_descuento',
  'monto_fijo'
);

create type public.estado_beneficio_regis as enum (
  'borrador',
  'activo',
  'pausado',
  'finalizado'
);

create type public.origen_canje_regis as enum ('qr', 'llavero');

create type public.estado_canje_regis as enum (
  'reservado',
  'confirmado',
  'expirado',
  'cancelado'
);

create table public.beneficios_regis (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete restrict,
  codigo varchar(80) not null,
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint beneficios_regis_codigo_valido check (
    codigo = lower(codigo)
    and codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint beneficios_regis_codigo_negocio_unico
    unique (negocio_id, codigo),
  constraint beneficios_regis_identidad_negocio_unica
    unique (id, negocio_id)
);

create index beneficios_regis_negocio_creado_idx
  on public.beneficios_regis (negocio_id, creado_en desc);

create table public.versiones_beneficio_regis (
  id uuid primary key default gen_random_uuid(),
  beneficio_id uuid not null
    references public.beneficios_regis (id) on delete restrict,
  version integer not null,
  nombre varchar(160) not null,
  descripcion text,
  tipo public.tipo_beneficio_regis not null,
  porcentaje_descuento_bp integer,
  monto_descuento_fijo_clp integer,
  costo_regis integer not null,
  compra_minima_clp integer not null,
  tope_descuento_clp integer,
  cupos_totales integer,
  limite_por_vecino integer not null default 1,
  mostrar_cupos boolean not null default false,
  regla_regis_id uuid not null
    references public.reglas_regis (id) on delete restrict,
  valor_regis_clp integer not null,
  porcentaje_maximo_canje_bp integer not null,
  estado public.estado_beneficio_regis not null default 'borrador',
  vigencia_desde timestamptz not null default now(),
  vigencia_hasta timestamptz,
  publicado_en timestamptz,
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint versiones_beneficio_version_valida check (version > 0),
  constraint versiones_beneficio_nombre_valido check (
    char_length(btrim(nombre)) between 3 and 160
  ),
  constraint versiones_beneficio_descripcion_valida check (
    descripcion is null
    or char_length(btrim(descripcion)) between 3 and 1000
  ),
  constraint versiones_beneficio_costo_valido check (costo_regis > 0),
  constraint versiones_beneficio_compra_minima_valida check (
    compra_minima_clp > 0
  ),
  constraint versiones_beneficio_cupos_validos check (
    cupos_totales is null or cupos_totales > 0
  ),
  constraint versiones_beneficio_limite_valido check (
    limite_por_vecino > 0
  ),
  constraint versiones_beneficio_valor_regis_valido check (
    valor_regis_clp > 0
  ),
  constraint versiones_beneficio_porcentaje_maximo_valido check (
    porcentaje_maximo_canje_bp between 1 and 10000
  ),
  constraint versiones_beneficio_tipo_valido check (
    (
      tipo = 'porcentaje_descuento'
      and porcentaje_descuento_bp between 1 and 10000
      and monto_descuento_fijo_clp is null
      and tope_descuento_clp is not null
      and tope_descuento_clp > 0
    )
    or (
      tipo = 'monto_fijo'
      and porcentaje_descuento_bp is null
      and monto_descuento_fijo_clp is not null
      and monto_descuento_fijo_clp > 0
      and tope_descuento_clp is null
    )
  ),
  constraint versiones_beneficio_vigencia_valida check (
    vigencia_hasta is null or vigencia_hasta > vigencia_desde
  ),
  constraint versiones_beneficio_publicacion_valida check (
    (estado = 'borrador' and publicado_en is null)
    or (estado <> 'borrador' and publicado_en is not null)
  ),
  constraint versiones_beneficio_version_unica
    unique (beneficio_id, version),
  constraint versiones_beneficio_identidad_unica
    unique (id, beneficio_id)
);

create unique index versiones_beneficio_activa_unica
  on public.versiones_beneficio_regis (beneficio_id)
  where estado = 'activo';
create index versiones_beneficio_estado_vigencia_idx
  on public.versiones_beneficio_regis (
    estado,
    vigencia_desde,
    vigencia_hasta
  );

create table public.canjes_regis (
  id uuid primary key default gen_random_uuid(),
  beneficio_id uuid not null,
  beneficio_version_id uuid not null,
  negocio_id uuid not null,
  vecino_id uuid not null references auth.users (id) on delete restrict,
  caja_id uuid references public.cajas (id) on delete restrict,
  llavero_id uuid references public.llaveros_nfc (id) on delete restrict,
  compra_id uuid unique references public.compras (id) on delete restrict,
  origen public.origen_canje_regis not null,
  estado public.estado_canje_regis not null default 'reservado',
  codigo_publico varchar(24) not null unique default (
    'CRJ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  qr_token_hash text unique,
  costo_regis integer not null,
  valor_regis_clp integer not null,
  regla_regis_id uuid not null
    references public.reglas_regis (id) on delete restrict,
  monto_compra_bruto_clp integer,
  descuento_total_clp integer,
  valor_financiado_regis_clp integer,
  aporte_promocional_negocio_clp integer,
  monto_final_pagado_clp integer,
  idempotency_key text not null unique,
  reservado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  confirmado_en timestamptz,
  expirado_en timestamptz,
  cancelado_en timestamptz,
  creado_en timestamptz not null default now(),
  constraint canjes_beneficio_version_fkey foreign key (
    beneficio_version_id,
    beneficio_id
  ) references public.versiones_beneficio_regis (id, beneficio_id)
    on delete restrict,
  constraint canjes_beneficio_negocio_fkey foreign key (
    beneficio_id,
    negocio_id
  ) references public.beneficios_regis (id, negocio_id)
    on delete restrict,
  constraint canjes_costo_valido check (costo_regis > 0),
  constraint canjes_valor_regis_valido check (valor_regis_clp > 0),
  constraint canjes_idempotencia_valida check (
    char_length(btrim(idempotency_key)) between 8 and 200
  ),
  constraint canjes_expiracion_valida check (expira_en > reservado_en),
  constraint canjes_origen_valido check (
    (
      origen = 'qr'
      and qr_token_hash is not null
      and llavero_id is null
    )
    or (
      origen = 'llavero'
      and qr_token_hash is null
      and llavero_id is not null
      and caja_id is not null
    )
  ),
  constraint canjes_confirmacion_valida check (
    estado <> 'confirmado'
    or (
      compra_id is not null
      and caja_id is not null
      and confirmado_en is not null
      and monto_compra_bruto_clp > 0
      and descuento_total_clp > 0
      and valor_financiado_regis_clp > 0
      and aporte_promocional_negocio_clp >= 0
      and monto_final_pagado_clp > 0
      and monto_compra_bruto_clp
        = descuento_total_clp + monto_final_pagado_clp
    )
  ),
  constraint canjes_estado_fechas_valido check (
    (estado <> 'expirado' or expirado_en is not null)
    and (estado <> 'cancelado' or cancelado_en is not null)
  )
);

create index canjes_regis_beneficio_estado_expira_idx
  on public.canjes_regis (beneficio_id, estado, expira_en);
create index canjes_regis_vecino_negocio_creado_idx
  on public.canjes_regis (vecino_id, negocio_id, creado_en desc);
create index canjes_regis_negocio_creado_idx
  on public.canjes_regis (negocio_id, creado_en desc);

alter table public.compras
  add column monto_bruto_clp integer,
  add column descuento_total_clp integer not null default 0,
  add column aporte_promocional_clp integer not null default 0,
  add column regis_utilizados integer not null default 0,
  add constraint compras_monto_bruto_valido check (
    monto_bruto_clp is null or monto_bruto_clp > 0
  ),
  add constraint compras_descuento_valido check (descuento_total_clp >= 0),
  add constraint compras_aporte_promocional_valido check (
    aporte_promocional_clp >= 0
  ),
  add constraint compras_regis_utilizados_validos check (
    regis_utilizados >= 0
  ),
  add constraint compras_canje_snapshot_valido check (
    monto_bruto_clp is null
    or (
      monto_bruto_clp = monto_final + descuento_total_clp
      and aporte_promocional_clp <= descuento_total_clp
    )
  );

alter table public.movimientos_regis
  add constraint movimientos_regis_canje_id_fkey
  foreign key (canje_id) references public.canjes_regis (id) on delete restrict;

create function public.validar_configuracion_beneficio_regis(
  p_tipo public.tipo_beneficio_regis,
  p_porcentaje_descuento_bp integer,
  p_monto_descuento_fijo_clp integer,
  p_costo_regis integer,
  p_compra_minima_clp integer,
  p_tope_descuento_clp integer,
  p_valor_regis_clp integer,
  p_porcentaje_maximo_canje_bp integer
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_descuento_minimo integer;
  v_limite_general integer;
begin
  if p_costo_regis is null or p_costo_regis <= 0
    or p_compra_minima_clp is null or p_compra_minima_clp <= 0
  then
    raise exception 'El costo y la compra mínima deben ser mayores que cero'
      using errcode = '22023';
  end if;

  v_limite_general := floor(
    p_compra_minima_clp::numeric
    * p_porcentaje_maximo_canje_bp::numeric
    / 10000::numeric
  )::integer;

  if p_tipo = 'porcentaje_descuento' then
    if p_porcentaje_descuento_bp is null
      or p_porcentaje_descuento_bp <= 0
      or p_porcentaje_descuento_bp > 10000
      or p_monto_descuento_fijo_clp is not null
      or p_tope_descuento_clp is null
      or p_tope_descuento_clp <= 0
    then
      raise exception 'La configuración del beneficio porcentual no es válida'
        using errcode = '22023';
    end if;

    v_descuento_minimo := least(
      floor(
        p_compra_minima_clp::numeric
        * p_porcentaje_descuento_bp::numeric
        / 10000::numeric
      )::integer,
      p_tope_descuento_clp,
      v_limite_general
    );
  else
    if p_porcentaje_descuento_bp is not null
      or p_monto_descuento_fijo_clp is null
      or p_monto_descuento_fijo_clp <= 0
      or p_tope_descuento_clp is not null
    then
      raise exception 'La configuración del descuento fijo no es válida'
        using errcode = '22023';
    end if;

    v_descuento_minimo := least(
      p_monto_descuento_fijo_clp,
      v_limite_general
    );
  end if;

  if v_descuento_minimo <= 0
    or p_costo_regis * p_valor_regis_clp > v_descuento_minimo
  then
    raise exception 'El costo en REGIS supera el descuento mínimo garantizado'
      using errcode = '23514';
  end if;
end;
$$;

create function public.versionar_beneficio_regis(
  p_beneficio_id uuid,
  p_nombre text,
  p_tipo public.tipo_beneficio_regis,
  p_costo_regis integer,
  p_compra_minima_clp integer,
  p_porcentaje_descuento_bp integer default null,
  p_monto_descuento_fijo_clp integer default null,
  p_tope_descuento_clp integer default null,
  p_cupos_totales integer default null,
  p_limite_por_vecino integer default 1,
  p_vigencia_desde timestamptz default now(),
  p_vigencia_hasta timestamptz default null,
  p_publicar boolean default false,
  p_descripcion text default null,
  p_mostrar_cupos boolean default false
)
returns public.versiones_beneficio_regis
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_regla public.reglas_regis;
  v_beneficio public.beneficios_regis;
  v_version public.versiones_beneficio_regis;
  v_numero_version integer;
  v_cupos_ocupados integer;
begin
  select beneficio.*
  into v_beneficio
  from public.beneficios_regis as beneficio
  where beneficio.id = p_beneficio_id
  for update;

  if not found then
    raise exception 'Beneficio no encontrado'
      using errcode = 'P0002';
  end if;

  if v_usuario_id is null
    or (
      not public.es_miembro_negocio(
        v_beneficio.negocio_id,
        array[
          'propietario'::public.rol_miembro_negocio,
          'administrador'::public.rol_miembro_negocio
        ]
      )
      and not public.es_admin_regalones()
    )
  then
    raise exception 'No tienes permisos para versionar este beneficio'
      using errcode = '42501';
  end if;

  if char_length(v_nombre) < 3 or char_length(v_nombre) > 160 then
    raise exception 'El nombre debe tener entre 3 y 160 caracteres'
      using errcode = '22023';
  end if;

  if p_cupos_totales is not null and p_cupos_totales <= 0
    or p_limite_por_vecino is null or p_limite_por_vecino <= 0
    or p_vigencia_hasta is not null
      and p_vigencia_hasta <= p_vigencia_desde
  then
    raise exception 'Los cupos, límites o vigencia no son válidos'
      using errcode = '22023';
  end if;

  perform public.expirar_reservas_canje_regis();

  select count(*)::integer
  into v_cupos_ocupados
  from public.canjes_regis as canje
  where canje.beneficio_id = p_beneficio_id
    and (
      canje.estado = 'confirmado'
      or (canje.estado = 'reservado' and canje.expira_en > now())
    );

  if p_cupos_totales is not null
    and p_cupos_totales < v_cupos_ocupados
  then
    raise exception 'Los cupos no pueden ser menores que los canjes confirmados o reservados'
      using errcode = '23514';
  end if;

  select regla.*
  into v_regla
  from public.reglas_regis as regla
  where regla.activa
    and (
      regla.negocio_id is null
      or regla.negocio_id = v_beneficio.negocio_id
    )
    and regla.vigencia_desde <= p_vigencia_desde
    and (regla.vigencia_hasta is null or regla.vigencia_hasta > p_vigencia_desde)
  order by
    (regla.negocio_id is not null) desc,
    regla.vigencia_desde desc,
    regla.version desc
  limit 1;

  if not found then
    raise exception 'No existe una regla REGIS vigente para el beneficio'
      using errcode = 'P0001';
  end if;

  perform public.validar_configuracion_beneficio_regis(
    p_tipo,
    p_porcentaje_descuento_bp,
    p_monto_descuento_fijo_clp,
    p_costo_regis,
    p_compra_minima_clp,
    p_tope_descuento_clp,
    v_regla.valor_regis_clp,
    v_regla.porcentaje_maximo_canje_bp
  );

  select coalesce(max(version), 0) + 1
  into v_numero_version
  from public.versiones_beneficio_regis
  where beneficio_id = p_beneficio_id;

  if p_publicar then
    update public.versiones_beneficio_regis
    set estado = 'finalizado'
    where beneficio_id = p_beneficio_id
      and estado = 'activo';
  end if;

  insert into public.versiones_beneficio_regis (
    beneficio_id, version, nombre, descripcion, tipo,
    porcentaje_descuento_bp, monto_descuento_fijo_clp,
    costo_regis, compra_minima_clp, tope_descuento_clp,
    cupos_totales, limite_por_vecino, mostrar_cupos,
    regla_regis_id, valor_regis_clp, porcentaje_maximo_canje_bp,
    estado, vigencia_desde, vigencia_hasta, publicado_en, creado_por
  )
  values (
    p_beneficio_id, v_numero_version, v_nombre,
    nullif(btrim(coalesce(p_descripcion, '')), ''), p_tipo,
    p_porcentaje_descuento_bp, p_monto_descuento_fijo_clp,
    p_costo_regis, p_compra_minima_clp, p_tope_descuento_clp,
    p_cupos_totales, p_limite_por_vecino, p_mostrar_cupos,
    v_regla.id, v_regla.valor_regis_clp,
    v_regla.porcentaje_maximo_canje_bp,
    case
      when p_publicar then 'activo'::public.estado_beneficio_regis
      else 'borrador'::public.estado_beneficio_regis
    end,
    p_vigencia_desde, p_vigencia_hasta,
    case when p_publicar then now() else null end,
    v_usuario_id
  )
  returning * into v_version;

  return v_version;
end;
$$;

create function public.expirar_reservas_canje_regis()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canje public.canjes_regis;
  v_total integer := 0;
begin
  for v_canje in
    select canje.*
    from public.canjes_regis as canje
    where canje.estado = 'reservado'
      and canje.expira_en <= now()
    for update skip locked
  loop
    update public.saldos_regis
    set
      disponibles = disponibles + v_canje.costo_regis,
      reservados = reservados - v_canje.costo_regis,
      actualizado_en = now()
    where vecino_id = v_canje.vecino_id
      and negocio_id = v_canje.negocio_id
      and reservados >= v_canje.costo_regis;

    if not found then
      raise exception 'El saldo reservado del canje es inconsistente'
        using errcode = '23514';
    end if;

    update public.canjes_regis
    set estado = 'expirado', expirado_en = now()
    where id = v_canje.id;

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

create function public.crear_reserva_canje_regis_interna(
  p_vecino_id uuid,
  p_beneficio_version_id uuid,
  p_origen public.origen_canje_regis,
  p_qr_token text,
  p_caja_id uuid,
  p_llavero_id uuid,
  p_idempotency_key text
)
returns public.canjes_regis
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.versiones_beneficio_regis;
  v_beneficio public.beneficios_regis;
  v_saldo public.saldos_regis;
  v_canje public.canjes_regis;
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_qr_token text := btrim(coalesce(p_qr_token, ''));
  v_qr_token_hash text;
  v_cupos_ocupados integer;
  v_usos_vecino integer;
begin
  if char_length(v_idempotency_key) < 8
    or char_length(v_idempotency_key) > 200
  then
    raise exception 'La clave idempotente no es válida'
      using errcode = '22023';
  end if;

  if p_origen = 'qr' then
    if char_length(v_qr_token) < 16 or char_length(v_qr_token) > 500 then
      raise exception 'El token QR no es válido'
        using errcode = '22023';
    end if;

    v_qr_token_hash := encode(
      extensions.digest(convert_to(v_qr_token, 'UTF8'), 'sha256'),
      'hex'
    );
  end if;

  select canje.*
  into v_canje
  from public.canjes_regis as canje
  where canje.idempotency_key = v_idempotency_key;

  if found then
    if v_canje.vecino_id is distinct from p_vecino_id
      or v_canje.beneficio_version_id is distinct from p_beneficio_version_id
      or v_canje.origen is distinct from p_origen
      or v_canje.caja_id is distinct from p_caja_id
      or v_canje.llavero_id is distinct from p_llavero_id
      or v_canje.qr_token_hash is distinct from v_qr_token_hash
    then
      raise exception 'idempotency_key ya está en uso'
        using errcode = '23505';
    end if;

    return v_canje;
  end if;

  perform public.expirar_reservas_canje_regis();

  select version.*
  into v_version
  from public.versiones_beneficio_regis as version
  where version.id = p_beneficio_version_id;

  if not found then
    raise exception 'Beneficio no encontrado'
      using errcode = 'P0002';
  end if;

  select beneficio.*
  into v_beneficio
  from public.beneficios_regis as beneficio
  where beneficio.id = v_version.beneficio_id
  for update;

  if v_version.estado <> 'activo'
    or v_version.vigencia_desde > now()
    or (v_version.vigencia_hasta is not null and v_version.vigencia_hasta <= now())
  then
    raise exception 'El beneficio no está disponible'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.negocios
    where id = v_beneficio.negocio_id and estado = 'activo'
  ) then
    raise exception 'El negocio no está activo'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.perfiles
    where id = p_vecino_id and estado = 'activo'
  ) then
    raise exception 'La cuenta del vecino no está activa'
      using errcode = '23514';
  end if;

  select count(*)::integer
  into v_cupos_ocupados
  from public.canjes_regis as canje
  where canje.beneficio_id = v_beneficio.id
    and (
      canje.estado = 'confirmado'
      or (canje.estado = 'reservado' and canje.expira_en > now())
    );

  if v_version.cupos_totales is not null
    and v_cupos_ocupados >= v_version.cupos_totales
  then
    raise exception 'El beneficio está agotado'
      using errcode = '23514';
  end if;

  select count(*)::integer
  into v_usos_vecino
  from public.canjes_regis as canje
  where canje.beneficio_id = v_beneficio.id
    and canje.vecino_id = p_vecino_id
    and (
      canje.estado = 'confirmado'
      or (canje.estado = 'reservado' and canje.expira_en > now())
    );

  if v_usos_vecino >= v_version.limite_por_vecino then
    raise exception 'Alcanzaste el límite de canjes de este beneficio'
      using errcode = '23514';
  end if;

  insert into public.saldos_regis (vecino_id, negocio_id)
  values (p_vecino_id, v_beneficio.negocio_id)
  on conflict (vecino_id, negocio_id) do nothing;

  select saldo.*
  into v_saldo
  from public.saldos_regis as saldo
  where saldo.vecino_id = p_vecino_id
    and saldo.negocio_id = v_beneficio.negocio_id
  for update;

  if v_saldo.disponibles < v_version.costo_regis then
    raise exception 'No tienes REGIS suficientes para este beneficio'
      using errcode = '23514';
  end if;

  insert into public.canjes_regis (
    beneficio_id, beneficio_version_id, negocio_id, vecino_id,
    caja_id, llavero_id, origen, qr_token_hash, costo_regis,
    valor_regis_clp, regla_regis_id, idempotency_key, expira_en
  )
  values (
    v_beneficio.id, v_version.id, v_beneficio.negocio_id, p_vecino_id,
    p_caja_id, p_llavero_id, p_origen, v_qr_token_hash,
    v_version.costo_regis, v_version.valor_regis_clp,
    v_version.regla_regis_id, v_idempotency_key,
    now() + interval '10 minutes'
  )
  returning * into v_canje;

  update public.saldos_regis
  set
    disponibles = disponibles - v_version.costo_regis,
    reservados = reservados + v_version.costo_regis,
    actualizado_en = now()
  where id = v_saldo.id;

  return v_canje;
end;
$$;

create function public.crear_beneficio_regis(
  p_negocio_id uuid,
  p_codigo text,
  p_nombre text,
  p_tipo public.tipo_beneficio_regis,
  p_costo_regis integer,
  p_compra_minima_clp integer,
  p_porcentaje_descuento_bp integer default null,
  p_monto_descuento_fijo_clp integer default null,
  p_tope_descuento_clp integer default null,
  p_cupos_totales integer default null,
  p_limite_por_vecino integer default 1,
  p_vigencia_desde timestamptz default now(),
  p_vigencia_hasta timestamptz default null,
  p_publicar boolean default false,
  p_descripcion text default null,
  p_mostrar_cupos boolean default false
)
returns public.versiones_beneficio_regis
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_codigo text := lower(btrim(coalesce(p_codigo, '')));
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_regla public.reglas_regis;
  v_beneficio public.beneficios_regis;
  v_version public.versiones_beneficio_regis;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para crear un beneficio'
      using errcode = '42501';
  end if;

  if not public.es_miembro_negocio(
    p_negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  ) and not public.es_admin_regalones() then
    raise exception 'No tienes permisos para crear beneficios en este negocio'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.negocios
    where id = p_negocio_id and estado = 'activo'
  ) then
    raise exception 'El negocio no está activo'
      using errcode = '23514';
  end if;

  if v_codigo !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or char_length(v_codigo) > 80
  then
    raise exception 'El código del beneficio no es válido'
      using errcode = '22023';
  end if;

  if char_length(v_nombre) < 3 or char_length(v_nombre) > 160 then
    raise exception 'El nombre debe tener entre 3 y 160 caracteres'
      using errcode = '22023';
  end if;

  if p_cupos_totales is not null and p_cupos_totales <= 0
    or p_limite_por_vecino is null or p_limite_por_vecino <= 0
    or p_vigencia_hasta is not null
      and p_vigencia_hasta <= p_vigencia_desde
  then
    raise exception 'Los cupos, límites o vigencia no son válidos'
      using errcode = '22023';
  end if;

  select regla.*
  into v_regla
  from public.reglas_regis as regla
  where regla.activa
    and (regla.negocio_id is null or regla.negocio_id = p_negocio_id)
    and regla.vigencia_desde <= p_vigencia_desde
    and (regla.vigencia_hasta is null or regla.vigencia_hasta > p_vigencia_desde)
  order by
    (regla.negocio_id is not null) desc,
    regla.vigencia_desde desc,
    regla.version desc
  limit 1;

  if not found then
    raise exception 'No existe una regla REGIS vigente para el beneficio'
      using errcode = 'P0001';
  end if;

  perform public.validar_configuracion_beneficio_regis(
    p_tipo,
    p_porcentaje_descuento_bp,
    p_monto_descuento_fijo_clp,
    p_costo_regis,
    p_compra_minima_clp,
    p_tope_descuento_clp,
    v_regla.valor_regis_clp,
    v_regla.porcentaje_maximo_canje_bp
  );

  insert into public.beneficios_regis (negocio_id, codigo, creado_por)
  values (p_negocio_id, v_codigo, v_usuario_id)
  returning * into v_beneficio;

  insert into public.versiones_beneficio_regis (
    beneficio_id, version, nombre, descripcion, tipo,
    porcentaje_descuento_bp, monto_descuento_fijo_clp,
    costo_regis, compra_minima_clp, tope_descuento_clp,
    cupos_totales, limite_por_vecino, mostrar_cupos,
    regla_regis_id, valor_regis_clp, porcentaje_maximo_canje_bp,
    estado, vigencia_desde, vigencia_hasta, publicado_en, creado_por
  )
  values (
    v_beneficio.id, 1, v_nombre,
    nullif(btrim(coalesce(p_descripcion, '')), ''), p_tipo,
    p_porcentaje_descuento_bp, p_monto_descuento_fijo_clp,
    p_costo_regis, p_compra_minima_clp, p_tope_descuento_clp,
    p_cupos_totales, p_limite_por_vecino, p_mostrar_cupos,
    v_regla.id, v_regla.valor_regis_clp,
    v_regla.porcentaje_maximo_canje_bp,
    case
      when p_publicar then 'activo'::public.estado_beneficio_regis
      else 'borrador'::public.estado_beneficio_regis
    end,
    p_vigencia_desde, p_vigencia_hasta,
    case when p_publicar then now() else null end,
    v_usuario_id
  )
  returning * into v_version;

  return v_version;
end;
$$;

create function public.reservar_canje_regis_qr(
  p_beneficio_version_id uuid,
  p_qr_token text,
  p_idempotency_key text
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
  v_vecino_id uuid := (select auth.uid());
  v_canje public.canjes_regis;
begin
  if v_vecino_id is null then
    raise exception 'Debes iniciar sesión para generar un canje'
      using errcode = '42501';
  end if;

  v_canje := public.crear_reserva_canje_regis_interna(
    v_vecino_id,
    p_beneficio_version_id,
    'qr',
    p_qr_token,
    null,
    null,
    p_idempotency_key
  );

  return query
  select
    v_canje.id,
    v_canje.codigo_publico::text,
    v_canje.estado,
    v_canje.expira_en,
    v_canje.costo_regis;
end;
$$;

create function public.reservar_canje_regis_llavero(
  p_token_llavero text,
  p_caja_id uuid,
  p_beneficio_version_id uuid,
  p_idempotency_key text
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
  v_operador_id uuid := (select auth.uid());
  v_negocio_id uuid;
  v_llavero public.llaveros_nfc;
  v_canje public.canjes_regis;
  v_token text := btrim(coalesce(p_token_llavero, ''));
begin
  if v_operador_id is null then
    raise exception 'Debes iniciar sesión para preparar un canje asistido'
      using errcode = '42501';
  end if;

  select negocio.id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  join public.negocios as negocio
    on negocio.id = sucursal.negocio_id
  where caja.id = p_caja_id
    and caja.estado = 'activa'
    and sucursal.estado = 'activa'
    and negocio.estado = 'activo';

  if v_negocio_id is null
    or not public.es_miembro_negocio(v_negocio_id)
  then
    raise exception 'No tienes acceso a la caja indicada'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.versiones_beneficio_regis as version
    join public.beneficios_regis as beneficio
      on beneficio.id = version.beneficio_id
    where version.id = p_beneficio_version_id
      and beneficio.negocio_id = v_negocio_id
  ) then
    raise exception 'El beneficio no pertenece al negocio de la caja'
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
    p_caja_id,
    v_llavero.id,
    p_idempotency_key
  );

  return query
  select
    v_canje.id,
    v_canje.codigo_publico::text,
    v_canje.estado,
    v_canje.expira_en,
    v_canje.costo_regis;
end;
$$;

create function public.listar_beneficios_regis_disponibles(
  p_negocio_id uuid default null
)
returns table (
  beneficio_id uuid,
  beneficio_version_id uuid,
  negocio_id uuid,
  nombre_negocio text,
  nombre_beneficio text,
  descripcion text,
  tipo public.tipo_beneficio_regis,
  porcentaje_descuento_bp integer,
  monto_descuento_fijo_clp integer,
  costo_regis integer,
  compra_minima_clp integer,
  tope_descuento_clp integer,
  cupos_disponibles integer,
  mostrar_cupos boolean,
  saldo_disponible integer,
  puede_reservar boolean,
  vigencia_hasta timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vecino_id uuid := (select auth.uid());
begin
  if v_vecino_id is null then
    raise exception 'Debes iniciar sesión para consultar beneficios'
      using errcode = '42501';
  end if;

  perform public.expirar_reservas_canje_regis();

  return query
  with ocupacion as (
    select
      canje.beneficio_id,
      count(*) filter (
        where canje.estado = 'confirmado'
          or (canje.estado = 'reservado' and canje.expira_en > now())
      )::integer as total,
      count(*) filter (
        where canje.vecino_id = v_vecino_id
          and (
            canje.estado = 'confirmado'
            or (canje.estado = 'reservado' and canje.expira_en > now())
          )
      )::integer as total_vecino
    from public.canjes_regis as canje
    group by canje.beneficio_id
  )
  select
    beneficio.id,
    version.id,
    beneficio.negocio_id,
    negocio.nombre::text,
    version.nombre::text,
    version.descripcion,
    version.tipo,
    version.porcentaje_descuento_bp,
    version.monto_descuento_fijo_clp,
    version.costo_regis,
    version.compra_minima_clp,
    version.tope_descuento_clp,
    case
      when version.cupos_totales is null then null
      else greatest(version.cupos_totales - coalesce(ocupacion.total, 0), 0)
    end,
    version.mostrar_cupos,
    coalesce(saldo.disponibles, 0),
    coalesce(saldo.disponibles, 0) >= version.costo_regis
      and (
        version.cupos_totales is null
        or coalesce(ocupacion.total, 0) < version.cupos_totales
      )
      and coalesce(ocupacion.total_vecino, 0) < version.limite_por_vecino,
    version.vigencia_hasta
  from public.versiones_beneficio_regis as version
  join public.beneficios_regis as beneficio
    on beneficio.id = version.beneficio_id
  join public.negocios as negocio
    on negocio.id = beneficio.negocio_id
  left join public.saldos_regis as saldo
    on saldo.vecino_id = v_vecino_id
    and saldo.negocio_id = beneficio.negocio_id
  left join ocupacion
    on ocupacion.beneficio_id = beneficio.id
  where version.estado = 'activo'
    and version.vigencia_desde <= now()
    and (version.vigencia_hasta is null or version.vigencia_hasta > now())
    and negocio.estado = 'activo'
    and (p_negocio_id is null or beneficio.negocio_id = p_negocio_id)
  order by negocio.nombre, version.nombre;
end;
$$;

create function public.consultar_canje_regis_qr(
  p_qr_token text,
  p_caja_id uuid
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
  expira_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid;
  v_token_hash text;
begin
  select negocio.id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal on sucursal.id = caja.sucursal_id
  join public.negocios as negocio on negocio.id = sucursal.negocio_id
  where caja.id = p_caja_id
    and caja.estado = 'activa'
    and sucursal.estado = 'activa'
    and negocio.estado = 'activo';

  if v_negocio_id is null
    or not public.es_miembro_negocio(v_negocio_id)
  then
    raise exception 'No tienes acceso a la caja indicada'
      using errcode = '42501';
  end if;

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
    canje.expira_en
  from public.canjes_regis as canje
  join public.versiones_beneficio_regis as version
    on version.id = canje.beneficio_version_id
  where canje.qr_token_hash = v_token_hash
    and canje.negocio_id = v_negocio_id
    and canje.origen = 'qr';

  if not found then
    raise exception 'Canje QR no encontrado para este negocio'
      using errcode = 'P0002';
  end if;
end;
$$;

create function public.confirmar_compra_con_canje(
  p_canje_id uuid,
  p_caja_id uuid,
  p_monto_bruto_clp integer,
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
  v_operador_id uuid := (select auth.uid());
  v_negocio_id uuid;
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
  if v_operador_id is null then
    raise exception 'Debes iniciar sesión para confirmar el canje'
      using errcode = '42501';
  end if;

  select negocio.id, sucursal.id
  into v_negocio_id, v_sucursal_id
  from public.cajas as caja
  join public.sucursales as sucursal on sucursal.id = caja.sucursal_id
  join public.negocios as negocio on negocio.id = sucursal.negocio_id
  where caja.id = p_caja_id
    and caja.estado = 'activa'
    and sucursal.estado = 'activa'
    and negocio.estado = 'activo';

  if v_negocio_id is null
    or not public.es_miembro_negocio(v_negocio_id)
  then
    raise exception 'No tienes acceso a la caja indicada'
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

  if v_canje.negocio_id <> v_negocio_id then
    raise exception 'No tienes permisos para confirmar este canje'
      using errcode = '42501';
  end if;

  if v_canje.origen = 'llavero' and v_canje.caja_id <> p_caja_id then
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
    return query
    select
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

  if v_canje.estado = 'expirado' then
    raise exception 'El canje expiró y debe generarse uno nuevo'
      using errcode = '23514';
  end if;

  if v_canje.estado = 'cancelado' then
    raise exception 'El canje fue cancelado y no se puede confirmar'
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
    vecino_id, caja_id, llavero_id, monto_informado, informado_por,
    estado, expira_en, idempotency_key
  )
  values (
    v_canje.vecino_id, p_caja_id, v_canje.llavero_id, v_monto_final,
    'cajero', 'aprobada', now() + interval '15 minutes',
    'canje:' || v_canje.id::text || ':solicitud'
  )
  returning * into v_solicitud;

  insert into public.compras (
    solicitud_id, negocio_id, sucursal_id, caja_id, vecino_id,
    cajero_id, monto_final, folio_boleta, origen, monto_bruto_clp,
    descuento_total_clp, aporte_promocional_clp, regis_utilizados
  )
  values (
    v_solicitud.id, v_negocio_id, v_sucursal_id, p_caja_id,
    v_canje.vecino_id, v_operador_id, v_monto_final,
    nullif(btrim(p_folio_boleta), ''),
    case
      when v_canje.origen = 'llavero' then 'asistido'::public.origen_compra
      else 'autoservicio'::public.origen_compra
    end,
    p_monto_bruto_clp, v_descuento, v_aporte_promocional,
    v_canje.costo_regis
  )
  returning * into v_compra;

  update public.canjes_regis
  set
    caja_id = p_caja_id,
    compra_id = v_compra.id,
    estado = 'confirmado',
    monto_compra_bruto_clp = p_monto_bruto_clp,
    descuento_total_clp = v_descuento,
    valor_financiado_regis_clp = v_valor_financiado,
    aporte_promocional_negocio_clp = v_aporte_promocional,
    monto_final_pagado_clp = v_monto_final,
    confirmado_en = now()
  where id = v_canje.id
  returning * into v_canje;

  update public.saldos_regis
  set
    reservados = reservados - v_canje.costo_regis,
    canjeados = canjeados + v_canje.costo_regis,
    actualizado_en = now()
  where vecino_id = v_canje.vecino_id
    and negocio_id = v_canje.negocio_id
    and reservados >= v_canje.costo_regis;

  if not found then
    raise exception 'El saldo reservado del canje es inconsistente'
      using errcode = '23514';
  end if;

  insert into public.movimientos_regis (
    vecino_id, negocio_id, tipo, cantidad, estado, compra_id, canje_id,
    regla_regis_id, monto_base_clp, valor_regis_clp,
    valor_recompensa_clp, idempotency_key, metadata
  )
  values (
    v_canje.vecino_id, v_canje.negocio_id, 'canje',
    -v_canje.costo_regis, 'canjeado', v_compra.id, v_canje.id,
    v_canje.regla_regis_id, p_monto_bruto_clp, v_canje.valor_regis_clp,
    v_valor_financiado, 'canje:' || v_canje.id::text || ':movimiento',
    jsonb_build_object(
      'beneficio_id', v_canje.beneficio_id,
      'beneficio_version_id', v_canje.beneficio_version_id,
      'descuento_total_clp', v_descuento,
      'aporte_promocional_negocio_clp', v_aporte_promocional
    )
  );

  insert into public.vecinos_negocios (
    vecino_id, negocio_id, primera_compra_en, ultima_compra_en
  )
  values (
    v_canje.vecino_id, v_canje.negocio_id,
    v_compra.creado_en, v_compra.creado_en
  )
  on conflict (vecino_id, negocio_id) do update
  set ultima_compra_en = excluded.ultima_compra_en;

  perform public.acreditar_regis_compra(v_compra.id);

  return query
  select
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

create function public.cancelar_reserva_canje_regis(p_canje_id uuid)
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
  v_usuario_id uuid := (select auth.uid());
  v_canje public.canjes_regis;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para cancelar el canje'
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

  if v_canje.vecino_id <> v_usuario_id
    and not public.es_miembro_negocio(v_canje.negocio_id)
    and not public.es_admin_regalones()
  then
    raise exception 'No tienes permisos para cancelar este canje'
      using errcode = '42501';
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
      actualizado_en = now()
    where vecino_id = v_canje.vecino_id
      and negocio_id = v_canje.negocio_id
      and reservados >= v_canje.costo_regis;

    if not found then
      raise exception 'El saldo reservado del canje es inconsistente'
        using errcode = '23514';
    end if;

    update public.canjes_regis
    set estado = 'cancelado', cancelado_en = now()
    where id = v_canje.id
    returning * into v_canje;
  end if;

  return query
  select v_canje.id, v_canje.estado, v_canje.costo_regis;
end;
$$;

alter table public.beneficios_regis enable row level security;
alter table public.versiones_beneficio_regis enable row level security;
alter table public.canjes_regis enable row level security;

create policy beneficios_regis_leer_autenticados
on public.beneficios_regis
for select
to authenticated
using (true);

create policy versiones_beneficio_leer_disponibles_o_propias
on public.versiones_beneficio_regis
for select
to authenticated
using (
  (
    estado = 'activo'
    and vigencia_desde <= now()
    and (vigencia_hasta is null or vigencia_hasta > now())
  )
  or exists (
    select 1
    from public.beneficios_regis as beneficio
    where beneficio.id = versiones_beneficio_regis.beneficio_id
      and (
        public.es_miembro_negocio(beneficio.negocio_id)
        or public.es_admin_regalones()
      )
  )
);

create policy canjes_regis_leer_participantes
on public.canjes_regis
for select
to authenticated
using (
  vecino_id = (select auth.uid())
  or public.es_miembro_negocio(negocio_id)
  or public.es_admin_regalones()
);

revoke all on table public.beneficios_regis from anon, authenticated;
revoke all on table public.versiones_beneficio_regis from anon, authenticated;
revoke all on table public.canjes_regis from anon, authenticated;

grant select on table public.beneficios_regis to authenticated;
grant select on table public.versiones_beneficio_regis to authenticated;
grant select (
  id, beneficio_id, beneficio_version_id, negocio_id, vecino_id,
  caja_id, llavero_id, compra_id, origen, estado, codigo_publico,
  costo_regis, valor_regis_clp, regla_regis_id,
  monto_compra_bruto_clp, descuento_total_clp,
  valor_financiado_regis_clp, aporte_promocional_negocio_clp,
  monto_final_pagado_clp, reservado_en, expira_en, confirmado_en,
  expirado_en, cancelado_en, creado_en
) on table public.canjes_regis to authenticated;

revoke all on function public.validar_configuracion_beneficio_regis(
  public.tipo_beneficio_regis, integer, integer, integer,
  integer, integer, integer, integer
) from public, anon, authenticated;
revoke all on function public.crear_reserva_canje_regis_interna(
  uuid, uuid, public.origen_canje_regis, text, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.expirar_reservas_canje_regis()
  from public, anon, authenticated;

revoke all on function public.crear_beneficio_regis(
  uuid, text, text, public.tipo_beneficio_regis, integer, integer,
  integer, integer, integer, integer, integer, timestamptz,
  timestamptz, boolean, text, boolean
) from public, anon;
revoke all on function public.versionar_beneficio_regis(
  uuid, text, public.tipo_beneficio_regis, integer, integer,
  integer, integer, integer, integer, integer, timestamptz,
  timestamptz, boolean, text, boolean
) from public, anon;
revoke all on function public.reservar_canje_regis_qr(uuid, text, text)
  from public, anon;
revoke all on function public.reservar_canje_regis_llavero(
  text, uuid, uuid, text
) from public, anon;
revoke all on function public.listar_beneficios_regis_disponibles(uuid)
  from public, anon;
revoke all on function public.consultar_canje_regis_qr(text, uuid)
  from public, anon;
revoke all on function public.confirmar_compra_con_canje(
  uuid, uuid, integer, text, text
) from public, anon;
revoke all on function public.cancelar_reserva_canje_regis(uuid)
  from public, anon;

grant execute on function public.crear_beneficio_regis(
  uuid, text, text, public.tipo_beneficio_regis, integer, integer,
  integer, integer, integer, integer, integer, timestamptz,
  timestamptz, boolean, text, boolean
) to authenticated;
grant execute on function public.versionar_beneficio_regis(
  uuid, text, public.tipo_beneficio_regis, integer, integer,
  integer, integer, integer, integer, integer, timestamptz,
  timestamptz, boolean, text, boolean
) to authenticated;
grant execute on function public.reservar_canje_regis_qr(uuid, text, text)
  to authenticated;
grant execute on function public.reservar_canje_regis_llavero(
  text, uuid, uuid, text
) to authenticated;
grant execute on function public.listar_beneficios_regis_disponibles(uuid)
  to authenticated;
grant execute on function public.consultar_canje_regis_qr(text, uuid)
  to authenticated;
grant execute on function public.confirmar_compra_con_canje(
  uuid, uuid, integer, text, text
) to authenticated;
grant execute on function public.cancelar_reserva_canje_regis(uuid)
  to authenticated;

comment on table public.beneficios_regis is
  'Identidad estable de un beneficio configurable dentro de un negocio.';
comment on table public.versiones_beneficio_regis is
  'Versiones históricas de las condiciones económicas de cada beneficio.';
comment on table public.canjes_regis is
  'Ciclo completo de reserva, expiración, cancelación y confirmación de un canje REGIS.';
comment on function public.confirmar_compra_con_canje(
  uuid, uuid, integer, text, text
) is
  'Confirma atómicamente el canje, la compra, el débito REGIS, el cupo y la acumulación sobre el monto pagado.';

commit;
