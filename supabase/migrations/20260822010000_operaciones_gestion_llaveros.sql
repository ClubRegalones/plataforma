begin;

create function public.cancelar_solicitud_llavero(
  p_solicitud_id uuid
)
returns public.solicitudes_llavero
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_solicitud public.solicitudes_llavero;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para cancelar la solicitud'
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

  if v_solicitud.vecino_id <> v_usuario_id
    and not public.es_admin_regalones()
  then
    raise exception 'No tienes permisos para cancelar esta solicitud'
      using errcode = '42501';
  end if;

  if v_solicitud.estado = 'cancelada' then
    return v_solicitud;
  end if;

  if v_solicitud.estado not in ('pendiente', 'programada_entrega') then
    raise exception 'La solicitud ya no se puede cancelar'
      using errcode = '23514';
  end if;

  update public.solicitudes_llavero
  set estado = 'cancelada'
  where id = p_solicitud_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

create function public.programar_entrega_llavero(
  p_solicitud_id uuid,
  p_programado_para timestamptz,
  p_observaciones text default null
)
returns public.solicitudes_llavero
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes_llavero;
  v_observaciones text;
begin
  if not public.es_admin_regalones() then
    raise exception 'Solo un administrador de Club Regalones puede programar entregas'
      using errcode = '42501';
  end if;

  if p_programado_para is null or p_programado_para <= now() then
    raise exception 'La fecha de entrega debe ser futura'
      using errcode = '22023';
  end if;

  if p_observaciones is not null then
    v_observaciones := nullif(btrim(p_observaciones), '');

    if char_length(v_observaciones) > 500 then
      raise exception 'Las observaciones no pueden superar 500 caracteres'
        using errcode = '22023';
    end if;
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

  if v_solicitud.estado not in ('pendiente', 'programada_entrega') then
    raise exception 'La solicitud no está disponible para programación'
      using errcode = '23514';
  end if;

  update public.solicitudes_llavero
  set
    estado = 'programada_entrega',
    programado_para = p_programado_para,
    observaciones = case
      when p_observaciones is null then observaciones
      else v_observaciones
    end
  where id = p_solicitud_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

create function public.entregar_llavero(
  p_solicitud_id uuid,
  p_token text,
  p_codigo_publico text
)
returns table (
  id uuid,
  vecino_id uuid,
  solicitud_id uuid,
  codigo_publico text,
  estado public.estado_llavero_nfc,
  asignado_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_solicitud public.solicitudes_llavero;
  v_llavero_existente public.llaveros_nfc;
  v_llavero_anterior public.llaveros_nfc;
  v_llavero_nuevo public.llaveros_nfc;
  v_llavero_nuevo_id uuid := gen_random_uuid();
  v_token text := btrim(coalesce(p_token, ''));
  v_codigo_publico text := upper(btrim(coalesce(p_codigo_publico, '')));
begin
  if not public.es_admin_regalones() then
    raise exception 'Solo un administrador de Club Regalones puede entregar llaveros'
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
  into v_llavero_existente
  from public.llaveros_nfc as llavero
  where llavero.solicitud_id = v_solicitud.id;

  if found then
    return query
    select
      v_llavero_existente.id,
      v_llavero_existente.vecino_id,
      v_llavero_existente.solicitud_id,
      v_llavero_existente.codigo_publico::text,
      v_llavero_existente.estado,
      v_llavero_existente.asignado_en;
    return;
  end if;

  if v_solicitud.estado <> 'programada_entrega' then
    raise exception 'La entrega debe estar programada antes de asignar el llavero'
      using errcode = '23514';
  end if;

  select llavero.*
  into v_llavero_anterior
  from public.llaveros_nfc as llavero
  where llavero.vecino_id = v_solicitud.vecino_id
    and llavero.reemplazado_por_id is null
    and llavero.estado in ('activo', 'bloqueado', 'perdido')
  order by coalesce(llavero.asignado_en, llavero.creado_en) desc
  limit 1
  for update;

  insert into public.llaveros_nfc (
    id,
    vecino_id,
    solicitud_id,
    token_hash,
    codigo_publico,
    estado
  )
  values (
    v_llavero_nuevo_id,
    v_solicitud.vecino_id,
    v_solicitud.id,
    encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    ),
    v_codigo_publico,
    'sin_asignar'
  )
  returning * into v_llavero_nuevo;

  if v_llavero_anterior.id is not null then
    update public.llaveros_nfc as llavero_anterior
    set
      estado = case
        when llavero_anterior.estado = 'activo'
          then 'reemplazado'::public.estado_llavero_nfc
        else llavero_anterior.estado
      end,
      bloqueado_en = coalesce(llavero_anterior.bloqueado_en, now()),
      reemplazado_por_id = v_llavero_nuevo.id
    where llavero_anterior.id = v_llavero_anterior.id;
  end if;

  update public.llaveros_nfc as llavero_nuevo
  set
    estado = 'activo',
    asignado_en = now(),
    asignado_por = v_admin_id
  where llavero_nuevo.id = v_llavero_nuevo.id
  returning * into v_llavero_nuevo;

  update public.solicitudes_llavero as solicitud_entregada
  set
    estado = 'entregada',
    entregado_en = now()
  where solicitud_entregada.id = v_solicitud.id;

  return query
  select
    v_llavero_nuevo.id,
    v_llavero_nuevo.vecino_id,
    v_llavero_nuevo.solicitud_id,
    v_llavero_nuevo.codigo_publico::text,
    v_llavero_nuevo.estado,
    v_llavero_nuevo.asignado_en;
end;
$$;

create function public.cambiar_estado_llavero(
  p_llavero_id uuid,
  p_estado public.estado_llavero_nfc
)
returns table (
  id uuid,
  vecino_id uuid,
  codigo_publico text,
  estado public.estado_llavero_nfc,
  asignado_en timestamptz,
  bloqueado_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_llavero public.llaveros_nfc;
begin
  if not public.es_admin_regalones() then
    raise exception 'Solo un administrador de Club Regalones puede cambiar el estado del llavero'
      using errcode = '42501';
  end if;

  if p_estado not in ('bloqueado', 'perdido', 'revocado') then
    raise exception 'El estado solicitado no está permitido en esta operación'
      using errcode = '22023';
  end if;

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  where llavero.id = p_llavero_id
  for update;

  if not found then
    raise exception 'Llavero no encontrado'
      using errcode = 'P0002';
  end if;

  if v_llavero.estado = p_estado then
    return query
    select
      v_llavero.id,
      v_llavero.vecino_id,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.asignado_en,
      v_llavero.bloqueado_en;
    return;
  end if;

  if (p_estado = 'bloqueado' and v_llavero.estado <> 'activo')
    or (
      p_estado = 'perdido'
      and v_llavero.estado not in ('activo', 'bloqueado')
    )
    or (
      p_estado = 'revocado'
      and v_llavero.estado not in ('activo', 'bloqueado', 'perdido')
    )
  then
    raise exception 'La transición de estado del llavero no está permitida'
      using errcode = '23514';
  end if;

  update public.llaveros_nfc as llavero_actualizado
  set
    estado = p_estado,
    bloqueado_en = coalesce(llavero_actualizado.bloqueado_en, now())
  where llavero_actualizado.id = p_llavero_id
  returning * into v_llavero;

  return query
  select
    v_llavero.id,
    v_llavero.vecino_id,
    v_llavero.codigo_publico::text,
    v_llavero.estado,
    v_llavero.asignado_en,
    v_llavero.bloqueado_en;
end;
$$;

create function public.listar_gestion_llaveros()
returns table (
  solicitud_id uuid,
  vecino_id uuid,
  nombre_vecino text,
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
  asignado_en timestamptz
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
    perfil.modalidad_atencion,
    solicitud.negocio_solicitud_id,
    negocio.nombre::text,
    solicitud.estado,
    solicitud.solicitado_en,
    solicitud.programado_para,
    solicitud.entregado_en,
    solicitud.observaciones,
    llavero.id,
    llavero.codigo_publico::text,
    llavero.estado,
    llavero.asignado_en
  from public.solicitudes_llavero as solicitud
  join public.perfiles as perfil
    on perfil.id = solicitud.vecino_id
  left join public.negocios as negocio
    on negocio.id = solicitud.negocio_solicitud_id
  left join lateral (
    select candidato.*
    from public.llaveros_nfc as candidato
    where candidato.vecino_id = solicitud.vecino_id
    order by
      (candidato.solicitud_id = solicitud.id) desc,
      coalesce(candidato.asignado_en, candidato.creado_en) desc
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

revoke all on function public.cancelar_solicitud_llavero(uuid)
  from public, anon, authenticated;
revoke all on function public.programar_entrega_llavero(uuid, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.entregar_llavero(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.cambiar_estado_llavero(
  uuid,
  public.estado_llavero_nfc
) from public, anon, authenticated;
revoke all on function public.listar_gestion_llaveros()
  from public, anon, authenticated;

grant execute on function public.cancelar_solicitud_llavero(uuid)
  to authenticated;
grant execute on function public.programar_entrega_llavero(uuid, timestamptz, text)
  to authenticated;
grant execute on function public.entregar_llavero(uuid, text, text)
  to authenticated;
grant execute on function public.cambiar_estado_llavero(
  uuid,
  public.estado_llavero_nfc
) to authenticated;
grant execute on function public.listar_gestion_llaveros()
  to authenticated;

comment on function public.entregar_llavero(uuid, text, text) is
  'Asigna o reemplaza un llavero de forma atómica y devuelve solo datos no secretos.';

comment on function public.listar_gestion_llaveros() is
  'Listado administrativo sin token_hash para gestionar solicitudes y llaveros.';

commit;
