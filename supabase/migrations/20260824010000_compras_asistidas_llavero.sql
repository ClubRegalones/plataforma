begin;

alter table public.solicitudes_compra
add column llavero_id uuid
references public.llaveros_nfc (id) on delete restrict;

create index solicitudes_compra_llavero_creado_idx
  on public.solicitudes_compra (llavero_id, creado_en desc)
  where llavero_id is not null;

create unique index solicitudes_compra_llavero_abierta_idx
  on public.solicitudes_compra (llavero_id)
  where llavero_id is not null
    and estado in (
      'esperando_monto',
      'esperando_cajero',
      'pendiente_validacion'
    );

create function public.validar_solicitud_compra_llavero()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vecino_id uuid;
  v_estado public.estado_llavero_nfc;
begin
  if new.llavero_id is null then
    return new;
  end if;

  select llavero.vecino_id, llavero.estado
  into v_vecino_id, v_estado
  from public.llaveros_nfc as llavero
  where llavero.id = new.llavero_id;

  if not found then
    raise exception 'Llavero no encontrado'
      using errcode = 'P0002';
  end if;

  if v_vecino_id is distinct from new.vecino_id then
    raise exception 'El llavero no pertenece al vecino de la compra'
      using errcode = '23514';
  end if;

  if v_estado <> 'activo' then
    raise exception 'Solo un llavero activo puede iniciar una compra asistida'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger solicitudes_compra_validar_llavero
before insert or update of llavero_id, vecino_id
on public.solicitudes_compra
for each row execute function public.validar_solicitud_compra_llavero();

create function public.crear_solicitud_compra_asistida(
  p_token text,
  p_caja_id uuid,
  p_monto integer,
  p_idempotency_key text
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operador_id uuid := (select auth.uid());
  v_negocio_id uuid;
  v_llavero public.llaveros_nfc;
  v_solicitud public.solicitudes_compra;
  v_token text := btrim(coalesce(p_token, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
begin
  if v_operador_id is null then
    raise exception 'Debes iniciar sesión para crear una compra asistida'
      using errcode = '42501';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser un número entero mayor que cero'
      using errcode = '22003';
  end if;

  if char_length(v_token) < 8 or char_length(v_token) > 500 then
    raise exception 'El token del llavero no es válido'
      using errcode = '22023';
  end if;

  if char_length(v_idempotency_key) < 8
    or char_length(v_idempotency_key) > 200
  then
    raise exception 'idempotency_key debe tener entre 8 y 200 caracteres'
      using errcode = '22023';
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

  update public.solicitudes_compra as solicitud_vencida
  set estado = 'vencida'
  where solicitud_vencida.llavero_id = v_llavero.id
    and solicitud_vencida.estado in (
      'esperando_monto',
      'esperando_cajero',
      'pendiente_validacion'
    )
    and solicitud_vencida.expira_en <= now();

  insert into public.solicitudes_compra (
    vecino_id,
    caja_id,
    llavero_id,
    monto_informado,
    informado_por,
    estado,
    expira_en,
    idempotency_key
  )
  values (
    v_llavero.vecino_id,
    p_caja_id,
    v_llavero.id,
    p_monto,
    'cajero',
    'pendiente_validacion',
    now() + interval '15 minutes',
    v_idempotency_key
  )
  on conflict do nothing
  returning * into v_solicitud;

  if found then
    return v_solicitud;
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.idempotency_key = v_idempotency_key;

  if found then
    if v_solicitud.vecino_id is distinct from v_llavero.vecino_id
      or v_solicitud.caja_id is distinct from p_caja_id
      or v_solicitud.llavero_id is distinct from v_llavero.id
      or v_solicitud.monto_informado is distinct from p_monto
    then
      raise exception 'idempotency_key ya está en uso'
        using errcode = '23505';
    end if;

    return v_solicitud;
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.llavero_id = v_llavero.id
    and solicitud.estado in (
      'esperando_monto',
      'esperando_cajero',
      'pendiente_validacion'
    )
  order by solicitud.creado_en desc
  limit 1;

  if found then
    raise exception 'Ya existe una compra asistida pendiente para este llavero'
      using errcode = '23505';
  end if;

  raise exception 'No fue posible crear la compra asistida'
    using errcode = 'P0001';
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

  return v_compra;
end;
$$;

revoke all on function public.validar_solicitud_compra_llavero()
  from public, anon, authenticated;
revoke all on function public.crear_solicitud_compra_asistida(
  text,
  uuid,
  integer,
  text
) from public, anon, authenticated;

grant execute on function public.crear_solicitud_compra_asistida(
  text,
  uuid,
  integer,
  text
) to authenticated;

comment on column public.solicitudes_compra.llavero_id is
  'Llavero activo que identificó al vecino en una compra asistida; no contiene el token secreto.';
comment on function public.crear_solicitud_compra_asistida(text, uuid, integer, text) is
  'Crea de forma idempotente una solicitud de compra asistida a partir de un llavero activo y una caja autorizada.';

commit;
