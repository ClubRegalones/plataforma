create type public.categoria_ticket_soporte as enum (
  'beneficios',
  'compras',
  'llaveros',
  'cuenta',
  'otro'
);

create type public.estado_ticket_soporte as enum (
  'abierto',
  'en_revision',
  'esperando_comercio',
  'resuelto',
  'cerrado'
);

create type public.origen_mensaje_soporte as enum (
  'comercio',
  'regalones'
);

create table public.tickets_soporte (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null
    references public.negocios (id) on delete restrict,
  beneficio_id uuid
    references public.beneficios_regis (id) on delete set null,
  creado_por uuid not null
    references auth.users (id) on delete restrict,
  categoria public.categoria_ticket_soporte not null,
  asunto varchar(160) not null,
  estado public.estado_ticket_soporte not null default 'abierto',
  ultima_actividad_en timestamptz not null default now(),
  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default now(),
  cerrado_en timestamptz,
  constraint tickets_soporte_asunto_valido check (
    char_length(btrim(asunto)) between 5 and 160
  ),
  constraint tickets_soporte_cierre_coherente check (
    (estado = 'cerrado' and cerrado_en is not null)
    or (estado <> 'cerrado' and cerrado_en is null)
  )
);

create table public.mensajes_ticket_soporte (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null
    references public.tickets_soporte (id) on delete cascade,
  autor_id uuid
    references auth.users (id) on delete set null,
  origen public.origen_mensaje_soporte not null,
  mensaje text not null,
  creado_en timestamptz not null default clock_timestamp(),
  constraint mensajes_ticket_soporte_texto_valido check (
    char_length(btrim(mensaje)) between 5 and 4000
  )
);

create index tickets_soporte_negocio_actividad_idx
  on public.tickets_soporte (negocio_id, ultima_actividad_en desc);
create index tickets_soporte_estado_actividad_idx
  on public.tickets_soporte (estado, ultima_actividad_en desc);
create index tickets_soporte_beneficio_idx
  on public.tickets_soporte (beneficio_id)
  where beneficio_id is not null;
create index mensajes_ticket_soporte_ticket_fecha_idx
  on public.mensajes_ticket_soporte (ticket_id, creado_en);

create function public.puede_acceder_ticket_soporte(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tickets_soporte as ticket
    where ticket.id = p_ticket_id
      and (
        public.es_admin_regalones()
        or ticket.creado_por = (select auth.uid())
        or public.es_miembro_negocio(
          ticket.negocio_id,
          array[
            'propietario'::public.rol_miembro_negocio,
            'administrador'::public.rol_miembro_negocio
          ]
        )
      )
  );
$$;

create function public.crear_ticket_soporte(
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
    estado
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
    end
  )
  returning * into v_ticket;

  insert into public.mensajes_ticket_soporte (
    ticket_id,
    autor_id,
    origen,
    mensaje
  )
  values (
    v_ticket.id,
    v_usuario_id,
    case
      when v_es_admin then 'regalones'::public.origen_mensaje_soporte
      else 'comercio'::public.origen_mensaje_soporte
    end,
    v_mensaje
  );

  return v_ticket;
end;
$$;

create function public.responder_ticket_soporte(
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
    mensaje
  )
  values (
    p_ticket_id,
    v_usuario_id,
    case
      when v_es_admin then 'regalones'::public.origen_mensaje_soporte
      else 'comercio'::public.origen_mensaje_soporte
    end,
    v_mensaje
  )
  returning * into v_respuesta;

  update public.tickets_soporte
  set
    estado = case
      when v_es_admin then 'esperando_comercio'::public.estado_ticket_soporte
      else 'abierto'::public.estado_ticket_soporte
    end,
    ultima_actividad_en = clock_timestamp(),
    actualizado_en = clock_timestamp(),
    cerrado_en = null
  where id = p_ticket_id;

  return v_respuesta;
end;
$$;

create function public.cambiar_estado_ticket_soporte(
  p_ticket_id uuid,
  p_estado public.estado_ticket_soporte
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
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para cambiar el estado'
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

  if not v_es_admin then
    if p_estado not in ('abierto', 'cerrado') then
      raise exception 'El comercio solo puede reabrir o cerrar su solicitud'
        using errcode = '42501';
    end if;

    if v_ticket.creado_por <> v_usuario_id
      and not public.es_miembro_negocio(
        v_ticket.negocio_id,
        array[
          'propietario'::public.rol_miembro_negocio,
          'administrador'::public.rol_miembro_negocio
        ]
      )
    then
      raise exception 'No tienes permisos para cambiar esta solicitud'
        using errcode = '42501';
    end if;
  end if;

  update public.tickets_soporte
  set
    estado = p_estado,
    actualizado_en = clock_timestamp(),
    cerrado_en = case
      when p_estado = 'cerrado' then clock_timestamp()
      else null
    end
  where id = p_ticket_id
  returning * into v_ticket;

  return v_ticket;
end;
$$;

alter table public.tickets_soporte enable row level security;
alter table public.mensajes_ticket_soporte enable row level security;

create policy tickets_soporte_leer_participantes
on public.tickets_soporte
for select
to authenticated
using (
  public.es_admin_regalones()
  or creado_por = (select auth.uid())
  or public.es_miembro_negocio(
    negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
);

create policy mensajes_ticket_soporte_leer_participantes
on public.mensajes_ticket_soporte
for select
to authenticated
using (public.puede_acceder_ticket_soporte(ticket_id));

revoke all on table public.tickets_soporte from anon, authenticated;
revoke all on table public.mensajes_ticket_soporte from anon, authenticated;
grant select on table public.tickets_soporte to authenticated;
grant select on table public.mensajes_ticket_soporte to authenticated;

revoke all on function public.puede_acceder_ticket_soporte(uuid)
  from public, anon;
grant execute on function public.puede_acceder_ticket_soporte(uuid)
  to authenticated;

revoke all on function public.crear_ticket_soporte(
  uuid,
  public.categoria_ticket_soporte,
  text,
  text,
  uuid
) from public, anon;
grant execute on function public.crear_ticket_soporte(
  uuid,
  public.categoria_ticket_soporte,
  text,
  text,
  uuid
) to authenticated;

revoke all on function public.responder_ticket_soporte(uuid, text)
  from public, anon;
grant execute on function public.responder_ticket_soporte(uuid, text)
  to authenticated;

revoke all on function public.cambiar_estado_ticket_soporte(
  uuid,
  public.estado_ticket_soporte
) from public, anon;
grant execute on function public.cambiar_estado_ticket_soporte(
  uuid,
  public.estado_ticket_soporte
) to authenticated;

comment on table public.tickets_soporte is
  'Canal trazable de asistencia entre los comercios y la administración de Club Regalones.';
comment on table public.mensajes_ticket_soporte is
  'Conversación cronológica de cada solicitud de asistencia.';
comment on function public.crear_ticket_soporte(
  uuid,
  public.categoria_ticket_soporte,
  text,
  text,
  uuid
) is
  'Abre una solicitud y registra su primer mensaje de forma atómica.';
