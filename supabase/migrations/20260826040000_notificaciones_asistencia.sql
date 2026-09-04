alter table public.tickets_soporte
  add column leido_comercio_en timestamptz,
  add column leido_regalones_en timestamptz;

with ultimos_mensajes as (
  select distinct on (mensaje.ticket_id)
    mensaje.ticket_id,
    mensaje.origen,
    mensaje.creado_en
  from public.mensajes_ticket_soporte as mensaje
  order by mensaje.ticket_id, mensaje.creado_en desc, mensaje.id desc
)
update public.tickets_soporte as ticket
set
  leido_comercio_en = case
    when ultimo.origen = 'comercio' then ultimo.creado_en
    else null
  end,
  leido_regalones_en = case
    when ultimo.origen = 'regalones' then ultimo.creado_en
    else null
  end
from ultimos_mensajes as ultimo
where ultimo.ticket_id = ticket.id;

create index tickets_soporte_no_leidos_comercio_idx
  on public.tickets_soporte (negocio_id, ultima_actividad_en desc)
  where leido_comercio_en is null;

create index tickets_soporte_no_leidos_regalones_idx
  on public.tickets_soporte (ultima_actividad_en desc)
  where leido_regalones_en is null;

create or replace function public.crear_ticket_soporte(
  p_negocio_id uuid,
  p_categoria public.categoria_ticket_soporte,
  p_asunto text,
  p_mensaje text,
  p_beneficio_id uuid default null
)
returns public.tickets_soporte
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_es_admin boolean;
  v_ticket public.tickets_soporte;
  v_asunto text := btrim(coalesce(p_asunto, ''));
  v_mensaje text := btrim(coalesce(p_mensaje, ''));
  v_ahora timestamptz := clock_timestamp();
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para solicitar asistencia'
      using errcode = '42501';
  end if;

  v_es_admin := public.es_admin_regalones();

  if not v_es_admin and not public.es_miembro_negocio(p_negocio_id) then
    raise exception 'No perteneces a este negocio'
      using errcode = '42501';
  end if;

  if char_length(v_asunto) < 5 or char_length(v_asunto) > 160 then
    raise exception 'El asunto debe tener entre 5 y 160 caracteres'
      using errcode = '22023';
  end if;

  if char_length(v_mensaje) < 5 or char_length(v_mensaje) > 4000 then
    raise exception 'El mensaje debe tener entre 5 y 4000 caracteres'
      using errcode = '22023';
  end if;

  if p_beneficio_id is not null and not exists (
    select 1
    from public.beneficios_regis as beneficio
    where beneficio.id = p_beneficio_id
      and beneficio.negocio_id = p_negocio_id
  ) then
    raise exception 'El beneficio no pertenece al negocio indicado'
      using errcode = '23503';
  end if;

  insert into public.tickets_soporte (
    negocio_id,
    beneficio_id,
    creado_por,
    categoria,
    asunto,
    estado,
    ultima_actividad_en,
    leido_comercio_en,
    leido_regalones_en
  )
  values (
    p_negocio_id,
    p_beneficio_id,
    v_usuario_id,
    p_categoria,
    v_asunto,
    case
      when v_es_admin then 'esperando_comercio'::public.estado_ticket_soporte
      else 'abierto'::public.estado_ticket_soporte
    end,
    v_ahora,
    case when v_es_admin then null else v_ahora end,
    case when v_es_admin then v_ahora else null end
  )
  returning * into v_ticket;

  insert into public.mensajes_ticket_soporte (
    ticket_id,
    autor_id,
    origen,
    mensaje,
    creado_en
  )
  values (
    v_ticket.id,
    v_usuario_id,
    case
      when v_es_admin then 'regalones'::public.origen_mensaje_soporte
      else 'comercio'::public.origen_mensaje_soporte
    end,
    v_mensaje,
    v_ahora
  );

  return v_ticket;
end;
$$;

create or replace function public.responder_ticket_soporte(
  p_ticket_id uuid,
  p_mensaje text
)
returns public.mensajes_ticket_soporte
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_es_admin boolean;
  v_ticket public.tickets_soporte;
  v_respuesta public.mensajes_ticket_soporte;
  v_mensaje text := btrim(coalesce(p_mensaje, ''));
  v_ahora timestamptz := clock_timestamp();
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para responder'
      using errcode = '42501';
  end if;

  select ticket.*
  into v_ticket
  from public.tickets_soporte as ticket
  where ticket.id = p_ticket_id
  for update;

  if not found then
    raise exception 'Solicitud de asistencia no encontrada'
      using errcode = 'P0002';
  end if;

  v_es_admin := public.es_admin_regalones();

  if not v_es_admin
    and v_ticket.creado_por <> v_usuario_id
    and not public.es_miembro_negocio(
      v_ticket.negocio_id,
      array[
        'propietario'::public.rol_miembro_negocio,
        'administrador'::public.rol_miembro_negocio
      ]
    )
  then
    raise exception 'No tienes permisos para responder esta solicitud'
      using errcode = '42501';
  end if;

  if char_length(v_mensaje) < 5 or char_length(v_mensaje) > 4000 then
    raise exception 'El mensaje debe tener entre 5 y 4000 caracteres'
      using errcode = '22023';
  end if;

  insert into public.mensajes_ticket_soporte (
    ticket_id,
    autor_id,
    origen,
    mensaje,
    creado_en
  )
  values (
    p_ticket_id,
    v_usuario_id,
    case
      when v_es_admin then 'regalones'::public.origen_mensaje_soporte
      else 'comercio'::public.origen_mensaje_soporte
    end,
    v_mensaje,
    v_ahora
  )
  returning * into v_respuesta;

  update public.tickets_soporte
  set
    estado = case
      when v_es_admin then 'esperando_comercio'::public.estado_ticket_soporte
      else 'abierto'::public.estado_ticket_soporte
    end,
    ultima_actividad_en = v_ahora,
    actualizado_en = v_ahora,
    cerrado_en = null,
    leido_comercio_en = case
      when v_es_admin then null
      else v_ahora
    end,
    leido_regalones_en = case
      when v_es_admin then v_ahora
      else null
    end
  where id = p_ticket_id;

  return v_respuesta;
end;
$$;

create function public.marcar_ticket_soporte_leido(p_ticket_id uuid)
returns public.tickets_soporte
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_es_admin boolean;
  v_ticket public.tickets_soporte;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para revisar mensajes'
      using errcode = '42501';
  end if;

  select ticket.*
  into v_ticket
  from public.tickets_soporte as ticket
  where ticket.id = p_ticket_id
  for update;

  if not found then
    raise exception 'Solicitud de asistencia no encontrada'
      using errcode = 'P0002';
  end if;

  v_es_admin := public.es_admin_regalones();

  if not v_es_admin
    and v_ticket.creado_por <> v_usuario_id
    and not public.es_miembro_negocio(
      v_ticket.negocio_id,
      array[
        'propietario'::public.rol_miembro_negocio,
        'administrador'::public.rol_miembro_negocio
      ]
    )
  then
    raise exception 'No tienes permisos para revisar esta solicitud'
      using errcode = '42501';
  end if;

  update public.tickets_soporte
  set
    leido_regalones_en = case
      when v_es_admin then clock_timestamp()
      else leido_regalones_en
    end,
    leido_comercio_en = case
      when v_es_admin then leido_comercio_en
      else clock_timestamp()
    end
  where id = p_ticket_id
  returning * into v_ticket;

  return v_ticket;
end;
$$;

create function public.contar_tickets_soporte_no_leidos()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_total bigint;
begin
  if v_usuario_id is null then
    return 0;
  end if;

  if public.es_admin_regalones() then
    select count(*)
    into v_total
    from public.tickets_soporte as ticket
    where ticket.leido_regalones_en is null;

    return v_total;
  end if;

  select count(*)
  into v_total
  from public.tickets_soporte as ticket
  where ticket.leido_comercio_en is null
    and (
      ticket.creado_por = v_usuario_id
      or public.es_miembro_negocio(
        ticket.negocio_id,
        array[
          'propietario'::public.rol_miembro_negocio,
          'administrador'::public.rol_miembro_negocio
        ]
      )
    );

  return v_total;
end;
$$;

revoke all on function public.marcar_ticket_soporte_leido(uuid)
  from public, anon;
grant execute on function public.marcar_ticket_soporte_leido(uuid)
  to authenticated;

revoke all on function public.contar_tickets_soporte_no_leidos()
  from public, anon;
grant execute on function public.contar_tickets_soporte_no_leidos()
  to authenticated;

comment on column public.tickets_soporte.leido_comercio_en is
  'Última confirmación de lectura compartida por el equipo autorizado del comercio.';
comment on column public.tickets_soporte.leido_regalones_en is
  'Última confirmación de lectura compartida por la administración de Regalones.';
comment on function public.marcar_ticket_soporte_leido(uuid) is
  'Marca la conversación como revisada para el lado autenticado sin afectar al otro participante.';
comment on function public.contar_tickets_soporte_no_leidos() is
  'Cuenta las conversaciones con mensajes pendientes según el rol y los negocios accesibles.';
