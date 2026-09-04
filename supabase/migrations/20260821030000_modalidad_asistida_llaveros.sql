begin;

create type public.modalidad_atencion as enum (
  'digital',
  'asistida'
);

create type public.estado_solicitud_llavero as enum (
  'pendiente',
  'programada_entrega',
  'entregada',
  'cancelada'
);

create type public.estado_llavero_nfc as enum (
  'sin_asignar',
  'activo',
  'bloqueado',
  'perdido',
  'reemplazado',
  'revocado'
);

alter table public.perfiles
add column modalidad_atencion public.modalidad_atencion
not null default 'digital';

create table public.solicitudes_llavero (
  id uuid primary key default gen_random_uuid(),
  vecino_id uuid not null references public.perfiles (id) on delete restrict,
  negocio_solicitud_id uuid references public.negocios (id) on delete restrict,
  estado public.estado_solicitud_llavero not null default 'pendiente',
  solicitado_en timestamptz not null default now(),
  programado_para timestamptz,
  entregado_en timestamptz,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint solicitudes_llavero_programacion_valida check (
    estado <> 'programada_entrega'
    or programado_para is not null
  ),
  constraint solicitudes_llavero_entrega_valida check (
    estado <> 'entregada'
    or entregado_en is not null
  )
);

create unique index solicitudes_llavero_activa_por_vecino
  on public.solicitudes_llavero (vecino_id)
  where estado in ('pendiente', 'programada_entrega');

create index solicitudes_llavero_vecino_solicitado_idx
  on public.solicitudes_llavero (vecino_id, solicitado_en desc);

create index solicitudes_llavero_negocio_estado_idx
  on public.solicitudes_llavero (
    negocio_solicitud_id,
    estado,
    solicitado_en
  )
  where negocio_solicitud_id is not null;

create table public.llaveros_nfc (
  id uuid primary key default gen_random_uuid(),
  vecino_id uuid references public.perfiles (id) on delete restrict,
  solicitud_id uuid unique
    references public.solicitudes_llavero (id) on delete restrict,
  token_hash text not null unique,
  codigo_publico varchar(80) not null unique,
  estado public.estado_llavero_nfc not null default 'sin_asignar',
  asignado_en timestamptz,
  asignado_por uuid references auth.users (id) on delete set null,
  bloqueado_en timestamptz,
  reemplazado_por_id uuid unique
    references public.llaveros_nfc (id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint llaveros_nfc_token_hash_valido
    check (char_length(token_hash) >= 32),
  constraint llaveros_nfc_codigo_publico_valido
    check (char_length(btrim(codigo_publico)) between 1 and 80),
  constraint llaveros_nfc_activacion_valida check (
    estado <> 'activo'
    or (
      vecino_id is not null
      and asignado_en is not null
      and asignado_por is not null
    )
  ),
  constraint llaveros_nfc_reemplazo_distinto
    check (reemplazado_por_id is null or reemplazado_por_id <> id),
  constraint llaveros_nfc_reemplazo_estado_valido check (
    reemplazado_por_id is null
    or estado in ('bloqueado', 'perdido', 'reemplazado', 'revocado')
  )
);

create unique index llaveros_nfc_activo_por_vecino
  on public.llaveros_nfc (vecino_id)
  where estado = 'activo' and vecino_id is not null;

create index llaveros_nfc_vecino_estado_idx
  on public.llaveros_nfc (vecino_id, estado)
  where vecino_id is not null;

create function public.validar_contexto_llavero_nfc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vecino_solicitud_id uuid;
  v_vecino_reemplazo_id uuid;
begin
  if new.solicitud_id is not null and new.vecino_id is not null then
    select solicitud.vecino_id
    into v_vecino_solicitud_id
    from public.solicitudes_llavero as solicitud
    where solicitud.id = new.solicitud_id;

    if v_vecino_solicitud_id is distinct from new.vecino_id then
      raise exception 'El llavero y la solicitud pertenecen a vecinos distintos'
        using errcode = '23514';
    end if;
  end if;

  if new.reemplazado_por_id is not null and new.vecino_id is not null then
    select llavero.vecino_id
    into v_vecino_reemplazo_id
    from public.llaveros_nfc as llavero
    where llavero.id = new.reemplazado_por_id;

    if v_vecino_reemplazo_id is distinct from new.vecino_id then
      raise exception 'El llavero de reemplazo pertenece a otro vecino'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger llaveros_nfc_validar_contexto
before insert or update of vecino_id, solicitud_id, reemplazado_por_id
on public.llaveros_nfc
for each row execute function public.validar_contexto_llavero_nfc();

create trigger solicitudes_llavero_establecer_actualizado_en
before update on public.solicitudes_llavero
for each row execute function public.establecer_actualizado_en();

create trigger llaveros_nfc_establecer_actualizado_en
before update on public.llaveros_nfc
for each row execute function public.establecer_actualizado_en();

alter table public.solicitudes_llavero enable row level security;
alter table public.llaveros_nfc enable row level security;

create policy solicitudes_llavero_leer_participantes
on public.solicitudes_llavero
for select
to authenticated
using (
  vecino_id = (select auth.uid())
  or public.es_admin_regalones()
  or (
    negocio_solicitud_id is not null
    and public.es_miembro_negocio(
      negocio_solicitud_id,
      array[
        'propietario'::public.rol_miembro_negocio,
        'administrador'::public.rol_miembro_negocio
      ]
    )
  )
);

create policy solicitudes_llavero_crear_propia
on public.solicitudes_llavero
for insert
to authenticated
with check (
  vecino_id = (select auth.uid())
  and estado = 'pendiente'
  and programado_para is null
  and entregado_en is null
  and exists (
    select 1
    from public.perfiles as perfil
    where perfil.id = (select auth.uid())
      and perfil.estado = 'activo'
      and perfil.modalidad_atencion = 'asistida'
  )
  and (
    negocio_solicitud_id is null
    or exists (
      select 1
      from public.negocios as negocio
      where negocio.id = solicitudes_llavero.negocio_solicitud_id
        and negocio.estado = 'activo'
    )
  )
);

create policy solicitudes_llavero_crear_admin
on public.solicitudes_llavero
for insert
to authenticated
with check (public.es_admin_regalones());

create policy solicitudes_llavero_actualizar_admin
on public.solicitudes_llavero
for update
to authenticated
using (public.es_admin_regalones())
with check (public.es_admin_regalones());

create policy llaveros_nfc_leer_propio_o_admin
on public.llaveros_nfc
for select
to authenticated
using (
  vecino_id = (select auth.uid())
  or public.es_admin_regalones()
);

create policy llaveros_nfc_crear_admin
on public.llaveros_nfc
for insert
to authenticated
with check (public.es_admin_regalones());

create policy llaveros_nfc_actualizar_admin
on public.llaveros_nfc
for update
to authenticated
using (public.es_admin_regalones())
with check (public.es_admin_regalones());

revoke all on table public.solicitudes_llavero from anon, authenticated;
revoke all on table public.llaveros_nfc from anon, authenticated;

grant select on table public.solicitudes_llavero to authenticated;
grant insert (vecino_id, negocio_solicitud_id, observaciones)
  on table public.solicitudes_llavero to authenticated;
grant update (
  negocio_solicitud_id,
  estado,
  programado_para,
  entregado_en,
  observaciones
) on table public.solicitudes_llavero to authenticated;

grant select (estado, codigo_publico, asignado_en)
  on table public.llaveros_nfc to authenticated;
grant insert (
  id,
  vecino_id,
  solicitud_id,
  token_hash,
  codigo_publico,
  estado,
  asignado_en,
  asignado_por,
  bloqueado_en,
  reemplazado_por_id
) on table public.llaveros_nfc to authenticated;
grant update (
  vecino_id,
  solicitud_id,
  codigo_publico,
  estado,
  asignado_en,
  asignado_por,
  bloqueado_en,
  reemplazado_por_id
) on table public.llaveros_nfc to authenticated;

grant update (modalidad_atencion)
  on table public.perfiles to authenticated;

revoke all on function public.validar_contexto_llavero_nfc()
  from public, anon, authenticated;

comment on table public.solicitudes_llavero is
  'Solicitudes históricas de modalidad asistida para programar y entregar llaveros.';

comment on table public.llaveros_nfc is
  'Identificadores físicos de cuentas; nunca almacenan datos personales ni saldos.';

comment on column public.llaveros_nfc.token_hash is
  'Hash irreversible del token secreto; no se expone al frontend.';

commit;
