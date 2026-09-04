begin;

create function public.establecer_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

create trigger perfiles_establecer_actualizado_en
before update on public.perfiles
for each row execute function public.establecer_actualizado_en();

create trigger planes_establecer_actualizado_en
before update on public.planes
for each row execute function public.establecer_actualizado_en();

create trigger negocios_establecer_actualizado_en
before update on public.negocios
for each row execute function public.establecer_actualizado_en();

create trigger suscripciones_establecer_actualizado_en
before update on public.suscripciones
for each row execute function public.establecer_actualizado_en();

create trigger sucursales_establecer_actualizado_en
before update on public.sucursales
for each row execute function public.establecer_actualizado_en();

create trigger cajas_establecer_actualizado_en
before update on public.cajas
for each row execute function public.establecer_actualizado_en();

create trigger miembros_negocio_establecer_actualizado_en
before update on public.miembros_negocio
for each row execute function public.establecer_actualizado_en();

create trigger terminales_establecer_actualizado_en
before update on public.terminales
for each row execute function public.establecer_actualizado_en();

create trigger etiquetas_nfc_establecer_actualizado_en
before update on public.etiquetas_nfc
for each row execute function public.establecer_actualizado_en();

create trigger vecinos_negocios_establecer_actualizado_en
before update on public.vecinos_negocios
for each row execute function public.establecer_actualizado_en();

create trigger solicitudes_compra_establecer_actualizado_en
before update on public.solicitudes_compra
for each row execute function public.establecer_actualizado_en();

create function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_apellido text;
  v_telefono text;
begin
  v_nombre := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'given_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Vecino'
  );

  if char_length(v_nombre) < 2 then
    v_nombre := 'Vecino';
  end if;

  v_apellido := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'apellido'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'family_name'), '')
  );

  v_telefono := case
    when new.phone ~ '^\+[1-9][0-9]{7,14}$' then new.phone
    else null
  end;

  insert into public.perfiles (id, nombre, apellido, telefono)
  values (
    new.id,
    left(v_nombre, 100),
    left(v_apellido, 100),
    v_telefono
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger al_crear_usuario_auth
after insert on auth.users
for each row execute function public.crear_perfil_usuario();

create function public.es_admin_regalones()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles as perfil
    where perfil.id = (select auth.uid())
      and perfil.rol_plataforma = 'admin_regalones'
      and perfil.estado = 'activo'
  );
$$;

create function public.es_miembro_negocio(
  p_negocio_id uuid,
  p_roles public.rol_miembro_negocio[] default array[
    'propietario'::public.rol_miembro_negocio,
    'administrador'::public.rol_miembro_negocio,
    'cajero'::public.rol_miembro_negocio
  ]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.miembros_negocio as miembro
    where miembro.negocio_id = p_negocio_id
      and miembro.usuario_id = (select auth.uid())
      and miembro.estado = 'activo'
      and miembro.rol = any (p_roles)
  );
$$;

create function public.crear_negocio(
  p_nombre text,
  p_slug text,
  p_rubro text,
  p_rut text default null,
  p_descripcion text default null,
  p_logo_url text default null
)
returns public.negocios
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_negocio public.negocios;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para crear un negocio'
      using errcode = '42501';
  end if;

  insert into public.negocios (
    nombre,
    slug,
    rubro,
    rut,
    descripcion,
    logo_url
  )
  values (
    btrim(p_nombre),
    lower(btrim(p_slug)),
    btrim(p_rubro),
    nullif(btrim(p_rut), ''),
    nullif(btrim(p_descripcion), ''),
    nullif(btrim(p_logo_url), '')
  )
  returning * into v_negocio;

  insert into public.miembros_negocio (
    negocio_id,
    usuario_id,
    rol
  )
  values (
    v_negocio.id,
    v_usuario_id,
    'propietario'
  );

  return v_negocio;
end;
$$;

create function public.validar_contexto_etiqueta_nfc()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_negocio_id uuid;
  v_sucursal_id uuid;
begin
  if new.sucursal_id is not null then
    select sucursal.negocio_id
    into v_negocio_id
    from public.sucursales as sucursal
    where sucursal.id = new.sucursal_id;

    if not found or v_negocio_id <> new.negocio_id then
      raise exception 'La sucursal no pertenece al negocio indicado'
        using errcode = '23514';
    end if;
  end if;

  if new.caja_id is not null then
    select caja.sucursal_id, sucursal.negocio_id
    into v_sucursal_id, v_negocio_id
    from public.cajas as caja
    join public.sucursales as sucursal
      on sucursal.id = caja.sucursal_id
    where caja.id = new.caja_id;

    if not found
      or v_sucursal_id is distinct from new.sucursal_id
      or v_negocio_id <> new.negocio_id
    then
      raise exception 'La caja no coincide con la sucursal y el negocio'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger etiquetas_nfc_validar_contexto
before insert or update of negocio_id, sucursal_id, caja_id, tipo
on public.etiquetas_nfc
for each row execute function public.validar_contexto_etiqueta_nfc();

create function public.resolver_etiqueta(p_token text)
returns table (
  tipo public.tipo_etiqueta_nfc,
  negocio_id uuid,
  sucursal_id uuid,
  caja_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    etiqueta.tipo,
    etiqueta.negocio_id,
    etiqueta.sucursal_id,
    etiqueta.caja_id
  from public.etiquetas_nfc as etiqueta
  join public.negocios as negocio
    on negocio.id = etiqueta.negocio_id
  left join public.sucursales as sucursal
    on sucursal.id = etiqueta.sucursal_id
  left join public.cajas as caja
    on caja.id = etiqueta.caja_id
  where etiqueta.token_hash = encode(
      extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'),
      'hex'
    )
    and etiqueta.estado = 'activa'
    and negocio.estado = 'activo'
    and (
      etiqueta.sucursal_id is null
      or sucursal.estado = 'activa'
    )
    and (
      etiqueta.caja_id is null
      or caja.estado = 'activa'
    )
  limit 1;
$$;

create function public.crear_solicitud_compra(
  p_token text,
  p_idempotency_key text,
  p_expira_en timestamptz,
  p_monto_informado integer default null
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vecino_id uuid := (select auth.uid());
  v_caja_id uuid;
  v_solicitud public.solicitudes_compra;
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
begin
  if v_vecino_id is null then
    raise exception 'Debes iniciar sesión para crear una solicitud'
      using errcode = '42501';
  end if;

  if char_length(v_idempotency_key) < 8
    or char_length(v_idempotency_key) > 200
  then
    raise exception 'idempotency_key debe tener entre 8 y 200 caracteres'
      using errcode = '22023';
  end if;

  if p_expira_en is null or p_expira_en <= now() then
    raise exception 'La expiración debe ser posterior al momento actual'
      using errcode = '22023';
  end if;

  if p_monto_informado is not null and p_monto_informado <= 0 then
    raise exception 'El monto informado debe ser mayor que cero'
      using errcode = '22003';
  end if;

  select etiqueta.caja_id
  into v_caja_id
  from public.etiquetas_nfc as etiqueta
  join public.cajas as caja
    on caja.id = etiqueta.caja_id
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
    and sucursal.id = etiqueta.sucursal_id
  join public.negocios as negocio
    on negocio.id = sucursal.negocio_id
    and negocio.id = etiqueta.negocio_id
  where etiqueta.token_hash = encode(
      extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'),
      'hex'
    )
    and etiqueta.tipo = 'compra'
    and etiqueta.estado = 'activa'
    and caja.estado = 'activa'
    and sucursal.estado = 'activa'
    and negocio.estado = 'activo';

  if not found then
    raise exception 'La etiqueta de compra no existe o no está activa'
      using errcode = 'P0002';
  end if;

  insert into public.solicitudes_compra (
    vecino_id,
    caja_id,
    monto_informado,
    informado_por,
    estado,
    expira_en,
    idempotency_key
  )
  values (
    v_vecino_id,
    v_caja_id,
    p_monto_informado,
    case
      when p_monto_informado is null then null
      else 'vecino'::public.informado_por
    end,
    case
      when p_monto_informado is null
        then 'esperando_monto'::public.estado_solicitud_compra
      else 'esperando_cajero'::public.estado_solicitud_compra
    end,
    p_expira_en,
    v_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning * into v_solicitud;

  if not found then
    select solicitud.*
    into v_solicitud
    from public.solicitudes_compra as solicitud
    where solicitud.idempotency_key = v_idempotency_key;

    if v_solicitud.vecino_id <> v_vecino_id then
      raise exception 'idempotency_key ya está en uso'
        using errcode = '23505';
    end if;
  end if;

  return v_solicitud;
end;
$$;

create function public.informar_monto_vecino(
  p_solicitud_id uuid,
  p_monto integer
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto informado debe ser mayor que cero'
      using errcode = '22003';
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud de compra no encontrada'
      using errcode = 'P0002';
  end if;

  if v_solicitud.vecino_id <> (select auth.uid()) then
    raise exception 'No puedes modificar esta solicitud'
      using errcode = '42501';
  end if;

  if v_solicitud.estado <> 'esperando_monto' then
    raise exception 'La solicitud ya recibió un monto o fue procesada'
      using errcode = '23514';
  end if;

  if v_solicitud.expira_en <= now() then
    raise exception 'La solicitud está vencida'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set
    monto_informado = p_monto,
    informado_por = 'vecino',
    estado = 'esperando_cajero'
  where id = p_solicitud_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

create function public.informar_monto_cajero(
  p_solicitud_id uuid,
  p_monto integer
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
  v_negocio_id uuid;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto informado debe ser mayor que cero'
      using errcode = '22003';
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud de compra no encontrada'
      using errcode = 'P0002';
  end if;

  select sucursal.negocio_id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = v_solicitud.caja_id;

  if not public.es_miembro_negocio(v_negocio_id) then
    raise exception 'No tienes permisos para informar el monto'
      using errcode = '42501';
  end if;

  if v_solicitud.estado <> 'esperando_monto' then
    raise exception 'La solicitud ya recibió un monto o fue procesada'
      using errcode = '23514';
  end if;

  if v_solicitud.expira_en <= now() then
    raise exception 'La solicitud está vencida'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set
    monto_informado = p_monto,
    informado_por = 'cajero',
    estado = 'pendiente_validacion'
  where id = p_solicitud_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

create function public.corregir_solicitud_compra(
  p_solicitud_id uuid,
  p_monto integer,
  p_motivo text
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
  v_negocio_id uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto corregido debe ser mayor que cero'
      using errcode = '22003';
  end if;

  if char_length(v_motivo) < 3 or char_length(v_motivo) > 500 then
    raise exception 'El motivo debe tener entre 3 y 500 caracteres'
      using errcode = '22023';
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud de compra no encontrada'
      using errcode = 'P0002';
  end if;

  select sucursal.negocio_id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = v_solicitud.caja_id;

  if not public.es_miembro_negocio(v_negocio_id) then
    raise exception 'No tienes permisos para corregir esta solicitud'
      using errcode = '42501';
  end if;

  if v_solicitud.estado not in ('esperando_cajero', 'pendiente_validacion') then
    raise exception 'La solicitud no admite correcciones'
      using errcode = '23514';
  end if;

  if v_solicitud.expira_en <= now() then
    raise exception 'La solicitud está vencida'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set
    monto_informado = p_monto,
    motivo_correccion = v_motivo,
    estado = 'pendiente_validacion'
  where id = p_solicitud_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

create function public.validar_contexto_compra()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
  v_sucursal_id uuid;
  v_negocio_id uuid;
begin
  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.id = new.solicitud_id;

  select caja.sucursal_id, sucursal.negocio_id
  into v_sucursal_id, v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = new.caja_id;

  if v_solicitud.estado <> 'aprobada'
    or v_solicitud.vecino_id <> new.vecino_id
    or v_solicitud.caja_id <> new.caja_id
    or v_sucursal_id <> new.sucursal_id
    or v_negocio_id <> new.negocio_id
  then
    raise exception 'El contexto histórico de la compra es inconsistente'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger compras_validar_contexto
before insert or update of solicitud_id, negocio_id, sucursal_id, caja_id, vecino_id
on public.compras
for each row execute function public.validar_contexto_compra();

create function public.aprobar_compra(
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
    v_solicitud.monto_informado,
    nullif(btrim(p_folio_boleta), ''),
    p_origen
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

create function public.rechazar_solicitud_compra(
  p_solicitud_id uuid,
  p_motivo text
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_compra;
  v_negocio_id uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if char_length(v_motivo) < 3 or char_length(v_motivo) > 500 then
    raise exception 'El motivo debe tener entre 3 y 500 caracteres'
      using errcode = '22023';
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud de compra no encontrada'
      using errcode = 'P0002';
  end if;

  select sucursal.negocio_id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = v_solicitud.caja_id;

  if not public.es_miembro_negocio(v_negocio_id) then
    raise exception 'No tienes permisos para rechazar esta solicitud'
      using errcode = '42501';
  end if;

  if v_solicitud.estado in (
    'aprobada',
    'rechazada',
    'vencida',
    'cancelada'
  ) then
    raise exception 'La solicitud ya fue procesada'
      using errcode = '23514';
  end if;

  update public.solicitudes_compra
  set
    estado = 'rechazada',
    motivo_rechazo = v_motivo
  where id = p_solicitud_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

commit;
