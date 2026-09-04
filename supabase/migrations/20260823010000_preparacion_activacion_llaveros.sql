begin;

create type public.metodo_verificacion_llavero as enum (
  'cedula',
  'pin',
  'sms'
);

alter table public.llaveros_nfc
  add column preparado_en timestamptz,
  add column preparado_por uuid references auth.users (id) on delete set null,
  add column pin_activacion_hash text,
  add column intentos_pin_fallidos smallint not null default 0,
  add column pin_bloqueado_hasta timestamptz,
  add column activado_en timestamptz,
  add column activado_por uuid references auth.users (id) on delete set null,
  add column caja_activacion_id uuid references public.cajas (id) on delete set null,
  add column metodo_verificacion_activacion public.metodo_verificacion_llavero;

update public.llaveros_nfc
set
  preparado_en = coalesce(asignado_en, creado_en),
  preparado_por = asignado_por
where vecino_id is not null;

update public.llaveros_nfc
set
  activado_en = coalesce(asignado_en, actualizado_en),
  activado_por = asignado_por,
  metodo_verificacion_activacion = 'cedula'
where estado = 'activo';

alter table public.llaveros_nfc
  add constraint llaveros_nfc_pin_hash_valido check (
    pin_activacion_hash is null
    or char_length(pin_activacion_hash) >= 32
  ),
  add constraint llaveros_nfc_intentos_pin_validos check (
    intentos_pin_fallidos between 0 and 3
  ),
  add constraint llaveros_nfc_preparacion_valida check (
    preparado_en is null
    or vecino_id is not null
  ),
  add constraint llaveros_nfc_activacion_auditada check (
    activado_en is null
    or (
      activado_en is not null
      and activado_por is not null
      and caja_activacion_id is not null
      and metodo_verificacion_activacion is not null
    )
  ) not valid;

-- Los llaveros activos creados por el flujo anterior no registraban caja.
-- La restricción queda vigente para filas nuevas y se validará cuando esos
-- registros históricos hayan sido conciliados.

create function public.preparar_llavero(
  p_solicitud_id uuid,
  p_token text,
  p_codigo_publico text,
  p_pin text default null
)
returns table (
  id uuid,
  vecino_id uuid,
  solicitud_id uuid,
  codigo_publico text,
  estado public.estado_llavero_nfc,
  preparado_en timestamptz,
  tiene_pin boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_solicitud public.solicitudes_llavero;
  v_llavero public.llaveros_nfc;
  v_token text := btrim(coalesce(p_token, ''));
  v_codigo_publico text := upper(btrim(coalesce(p_codigo_publico, '')));
  v_pin text := nullif(btrim(coalesce(p_pin, '')), '');
begin
  if not public.es_admin_regalones() then
    raise exception 'Solo un administrador de Club Regalones puede preparar llaveros'
      using errcode = '42501';
  end if;

  if char_length(v_token) < 8 or char_length(v_token) > 500 then
    raise exception 'El token debe tener entre 8 y 500 caracteres'
      using errcode = '22023';
  end if;

  if char_length(v_codigo_publico) < 3
    or char_length(v_codigo_publico) > 80
  then
    raise exception 'El código público debe tener entre 3 y 80 caracteres'
      using errcode = '22023';
  end if;

  if v_pin is not null and v_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe contener entre 4 y 6 dígitos'
      using errcode = '22023';
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_llavero as solicitud
  where solicitud.id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud de llavero no encontrada'
      using errcode = 'P0002';
  end if;

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  where llavero.solicitud_id = v_solicitud.id;

  if found then
    return query
    select
      v_llavero.id,
      v_llavero.vecino_id,
      v_llavero.solicitud_id,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.preparado_en,
      v_llavero.pin_activacion_hash is not null;
    return;
  end if;

  if v_solicitud.estado not in ('pendiente', 'programada_entrega') then
    raise exception 'La solicitud no está disponible para preparar el llavero'
      using errcode = '23514';
  end if;

  insert into public.llaveros_nfc (
    vecino_id,
    solicitud_id,
    token_hash,
    codigo_publico,
    estado,
    preparado_en,
    preparado_por,
    pin_activacion_hash
  )
  values (
    v_solicitud.vecino_id,
    v_solicitud.id,
    encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    ),
    v_codigo_publico,
    'sin_asignar',
    now(),
    v_admin_id,
    case
      when v_pin is null then null
      else extensions.crypt(v_pin, extensions.gen_salt('bf', 10))
    end
  )
  returning * into v_llavero;

  return query
  select
    v_llavero.id,
    v_llavero.vecino_id,
    v_llavero.solicitud_id,
    v_llavero.codigo_publico::text,
    v_llavero.estado,
    v_llavero.preparado_en,
    v_llavero.pin_activacion_hash is not null;
end;
$$;

create function public.registrar_entrega_llavero(p_solicitud_id uuid)
returns public.solicitudes_llavero
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_llavero;
begin
  if not public.es_admin_regalones() then
    raise exception 'Solo un administrador de Club Regalones puede registrar entregas'
      using errcode = '42501';
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_llavero as solicitud
  where solicitud.id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud de llavero no encontrada'
      using errcode = 'P0002';
  end if;

  if v_solicitud.estado = 'entregada' then
    return v_solicitud;
  end if;

  if v_solicitud.estado <> 'programada_entrega' then
    raise exception 'La entrega debe estar programada antes de registrarla'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.llaveros_nfc as llavero
    where llavero.solicitud_id = v_solicitud.id
      and llavero.estado = 'sin_asignar'
  ) then
    raise exception 'Debes preparar el llavero antes de registrar la entrega'
      using errcode = '23514';
  end if;

  update public.solicitudes_llavero as solicitud_entregada
  set
    estado = 'entregada',
    entregado_en = now()
  where solicitud_entregada.id = v_solicitud.id
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

create function public.consultar_llavero_activacion(
  p_token text,
  p_caja_id uuid
)
returns table (
  codigo_publico text,
  nombre_vecino text,
  estado public.estado_llavero_nfc,
  entregado boolean,
  puede_activar boolean,
  tiene_pin boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid;
  v_token text := btrim(coalesce(p_token, ''));
begin
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

  if char_length(v_token) < 8 or char_length(v_token) > 500 then
    raise exception 'El token del llavero no es válido'
      using errcode = '22023';
  end if;

  return query
  select
    llavero.codigo_publico::text,
    concat_ws(' ', perfil.nombre, perfil.apellido)::text,
    llavero.estado,
    solicitud.estado = 'entregada',
    llavero.estado = 'sin_asignar' and solicitud.estado = 'entregada',
    llavero.pin_activacion_hash is not null
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
  join public.solicitudes_llavero as solicitud
    on solicitud.id = llavero.solicitud_id
  where llavero.token_hash = encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    )
    and perfil.estado = 'activo'
  limit 1;
end;
$$;

create function public.activar_llavero_primer_uso(
  p_token text,
  p_caja_id uuid,
  p_metodo public.metodo_verificacion_llavero,
  p_pin text default null,
  p_identidad_verificada boolean default false
)
returns table (
  activado boolean,
  mensaje text,
  codigo_publico text,
  estado public.estado_llavero_nfc,
  activado_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operador_id uuid := (select auth.uid());
  v_negocio_id uuid;
  v_llavero public.llaveros_nfc;
  v_llavero_anterior public.llaveros_nfc;
  v_solicitud public.solicitudes_llavero;
  v_token text := btrim(coalesce(p_token, ''));
  v_pin text := btrim(coalesce(p_pin, ''));
  v_intentos smallint;
begin
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

  if v_operador_id is null
    or v_negocio_id is null
    or not public.es_miembro_negocio(v_negocio_id)
  then
    raise exception 'No tienes acceso a la caja indicada'
      using errcode = '42501';
  end if;

  if char_length(v_token) < 8 or char_length(v_token) > 500 then
    raise exception 'El token del llavero no es válido'
      using errcode = '22023';
  end if;

  if p_metodo is null then
    raise exception 'Debes indicar un método de verificación'
      using errcode = '22023';
  end if;

  if p_metodo = 'sms' then
    raise exception 'La verificación por SMS todavía no está habilitada'
      using errcode = '0A000';
  end if;

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  where llavero.token_hash = encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    )
  for update;

  if not found then
    raise exception 'Llavero no encontrado'
      using errcode = 'P0002';
  end if;

  if v_llavero.estado = 'activo' then
    return query
    select
      true,
      'El llavero ya estaba activo'::text,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en;
    return;
  end if;

  if v_llavero.estado <> 'sin_asignar' then
    return query
    select
      false,
      'El estado del llavero no permite activarlo'::text,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en;
    return;
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_llavero as solicitud
  where solicitud.id = v_llavero.solicitud_id
  for update;

  if not found or v_solicitud.estado <> 'entregada' then
    return query
    select
      false,
      'El llavero todavía no figura como entregado'::text,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en;
    return;
  end if;

  if p_metodo = 'cedula' and not p_identidad_verificada then
    return query
    select
      false,
      'Debes confirmar la revisión presencial de la cédula'::text,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en;
    return;
  end if;

  if p_metodo = 'pin' then
    if v_llavero.pin_activacion_hash is null then
      return query
      select
        false,
        'Este llavero no tiene un PIN configurado'::text,
        v_llavero.codigo_publico::text,
        v_llavero.estado,
        v_llavero.activado_en;
      return;
    end if;

    if v_llavero.pin_bloqueado_hasta is not null
      and v_llavero.pin_bloqueado_hasta > now()
    then
      return query
      select
        false,
        'El PIN está bloqueado temporalmente por intentos fallidos'::text,
        v_llavero.codigo_publico::text,
        v_llavero.estado,
        v_llavero.activado_en;
      return;
    end if;

    if v_pin !~ '^[0-9]{4,6}$'
      or extensions.crypt(v_pin, v_llavero.pin_activacion_hash)
        <> v_llavero.pin_activacion_hash
    then
      v_intentos := least(v_llavero.intentos_pin_fallidos + 1, 3);

      update public.llaveros_nfc as llavero_fallido
      set
        intentos_pin_fallidos = v_intentos,
        pin_bloqueado_hasta = case
          when v_intentos >= 3 then now() + interval '15 minutes'
          else null
        end
      where llavero_fallido.id = v_llavero.id
      returning * into v_llavero;

      return query
      select
        false,
        case
          when v_intentos >= 3
            then 'PIN incorrecto. El llavero quedó bloqueado por 15 minutos.'
          else 'El PIN no es correcto.'
        end::text,
        v_llavero.codigo_publico::text,
        v_llavero.estado,
        v_llavero.activado_en;
      return;
    end if;
  end if;

  select llavero.*
  into v_llavero_anterior
  from public.llaveros_nfc as llavero
  where llavero.vecino_id = v_llavero.vecino_id
    and llavero.id <> v_llavero.id
    and llavero.reemplazado_por_id is null
    and llavero.estado in ('activo', 'bloqueado', 'perdido')
  order by coalesce(llavero.activado_en, llavero.asignado_en, llavero.creado_en) desc
  limit 1
  for update;

  if v_llavero_anterior.id is not null then
    update public.llaveros_nfc as anterior
    set
      estado = case
        when anterior.estado = 'activo'
          then 'reemplazado'::public.estado_llavero_nfc
        else anterior.estado
      end,
      bloqueado_en = coalesce(anterior.bloqueado_en, now()),
      reemplazado_por_id = v_llavero.id
    where anterior.id = v_llavero_anterior.id;
  end if;

  update public.llaveros_nfc as objetivo
  set
    estado = 'activo',
    asignado_en = now(),
    asignado_por = v_operador_id,
    activado_en = now(),
    activado_por = v_operador_id,
    caja_activacion_id = p_caja_id,
    metodo_verificacion_activacion = p_metodo,
    intentos_pin_fallidos = 0,
    pin_bloqueado_hasta = null
  where objetivo.id = v_llavero.id
  returning * into v_llavero;

  return query
  select
    true,
    'Llavero activado correctamente'::text,
    v_llavero.codigo_publico::text,
    v_llavero.estado,
    v_llavero.activado_en;
end;
$$;

create function public.listar_gestion_llaveros_detalle()
returns table (
  solicitud_id uuid,
  vecino_id uuid,
  nombre_vecino text,
  correo_vecino text,
  telefono_vecino text,
  comuna_vecino text,
  modalidad_atencion public.modalidad_atencion,
  negocio_solicitud_id uuid,
  nombre_negocio text,
  estado_solicitud public.estado_solicitud_llavero,
  solicitado_en timestamptz,
  programado_para timestamptz,
  entregado_en timestamptz,
  observaciones text,
  llavero_id uuid,
  codigo_publico text,
  estado_llavero public.estado_llavero_nfc,
  preparado_en timestamptz,
  activado_en timestamptz,
  metodo_activacion public.metodo_verificacion_llavero
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_regalones() then
    raise exception 'Solo un administrador de Club Regalones puede gestionar llaveros'
      using errcode = '42501';
  end if;

  return query
  select
    solicitud.id,
    solicitud.vecino_id,
    concat_ws(' ', perfil.nombre, perfil.apellido)::text,
    usuario.email::text,
    perfil.telefono::text,
    perfil.comuna::text,
    perfil.modalidad_atencion,
    solicitud.negocio_solicitud_id,
    negocio.nombre::text,
    solicitud.estado,
    solicitud.solicitado_en,
    solicitud.programado_para,
    solicitud.entregado_en,
    solicitud.observaciones::text,
    llavero.id,
    llavero.codigo_publico::text,
    llavero.estado,
    llavero.preparado_en,
    llavero.activado_en,
    llavero.metodo_verificacion_activacion
  from public.solicitudes_llavero as solicitud
  join public.perfiles as perfil
    on perfil.id = solicitud.vecino_id
  join auth.users as usuario
    on usuario.id = solicitud.vecino_id
  left join public.negocios as negocio
    on negocio.id = solicitud.negocio_solicitud_id
  left join lateral (
    select candidato.*
    from public.llaveros_nfc as candidato
    where candidato.vecino_id = solicitud.vecino_id
    order by
      (candidato.solicitud_id = solicitud.id) desc,
      coalesce(candidato.activado_en, candidato.preparado_en, candidato.creado_en) desc
    limit 1
  ) as llavero on true
  order by
    case solicitud.estado
      when 'pendiente' then 1
      when 'programada_entrega' then 2
      when 'entregada' then 3
      else 4
    end,
    solicitud.solicitado_en desc;
end;
$$;

revoke all on function public.preparar_llavero(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.registrar_entrega_llavero(uuid)
  from public, anon, authenticated;
revoke all on function public.consultar_llavero_activacion(text, uuid)
  from public, anon, authenticated;
revoke all on function public.activar_llavero_primer_uso(
  text,
  uuid,
  public.metodo_verificacion_llavero,
  text,
  boolean
) from public, anon, authenticated;
revoke all on function public.listar_gestion_llaveros_detalle()
  from public, anon, authenticated;

grant execute on function public.preparar_llavero(uuid, text, text, text)
  to authenticated;
grant execute on function public.registrar_entrega_llavero(uuid)
  to authenticated;
grant execute on function public.consultar_llavero_activacion(text, uuid)
  to authenticated;
grant execute on function public.activar_llavero_primer_uso(
  text,
  uuid,
  public.metodo_verificacion_llavero,
  text,
  boolean
) to authenticated;
grant execute on function public.listar_gestion_llaveros_detalle()
  to authenticated;

comment on function public.preparar_llavero(uuid, text, text, text) is
  'Vincula un llavero inactivo a una solicitud y protege su token y PIN mediante hash.';

comment on function public.activar_llavero_primer_uso(
  text,
  uuid,
  public.metodo_verificacion_llavero,
  text,
  boolean
) is
  'Activa un llavero entregado durante su primer uso con cédula o PIN y registra la caja y el operador.';

comment on function public.listar_gestion_llaveros_detalle() is
  'Listado administrativo ampliado con identidad de cuenta y estado de preparación y activación, sin secretos.';

commit;
