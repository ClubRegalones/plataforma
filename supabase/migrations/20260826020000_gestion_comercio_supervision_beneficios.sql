create type public.accion_supervision_beneficio_regis as enum (
  'borrador_creado',
  'publicado',
  'pausado',
  'reactivado',
  'finalizado'
);

create table public.registro_supervision_beneficios (
  id uuid primary key default gen_random_uuid(),
  beneficio_id uuid not null
    references public.beneficios_regis (id) on delete restrict,
  beneficio_version_id uuid not null,
  negocio_id uuid not null
    references public.negocios (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  accion public.accion_supervision_beneficio_regis not null,
  motivo text,
  creado_en timestamptz not null default now(),
  constraint registro_supervision_beneficio_version_fkey foreign key (
    beneficio_version_id,
    beneficio_id
  ) references public.versiones_beneficio_regis (id, beneficio_id)
    on delete restrict,
  constraint registro_supervision_motivo_valido check (
    motivo is null or char_length(btrim(motivo)) between 3 and 500
  )
);

create index registro_supervision_negocio_fecha_idx
  on public.registro_supervision_beneficios (negocio_id, creado_en desc);
create index registro_supervision_beneficio_fecha_idx
  on public.registro_supervision_beneficios (beneficio_id, creado_en desc);

create function public.registrar_evento_supervision_beneficio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accion public.accion_supervision_beneficio_regis;
  v_negocio_id uuid;
  v_motivo text := nullif(
    btrim(coalesce(current_setting('regalones.motivo_beneficio', true), '')),
    ''
  );
begin
  if tg_op = 'INSERT' then
    v_accion := case new.estado
      when 'borrador' then 'borrador_creado'::public.accion_supervision_beneficio_regis
      when 'activo' then 'publicado'::public.accion_supervision_beneficio_regis
      when 'pausado' then 'pausado'::public.accion_supervision_beneficio_regis
      else 'finalizado'::public.accion_supervision_beneficio_regis
    end;
  elsif new.estado is distinct from old.estado then
    v_accion := case
      when new.estado = 'activo' and old.estado = 'pausado'
        then 'reactivado'::public.accion_supervision_beneficio_regis
      when new.estado = 'activo'
        then 'publicado'::public.accion_supervision_beneficio_regis
      when new.estado = 'pausado'
        then 'pausado'::public.accion_supervision_beneficio_regis
      when new.estado = 'finalizado'
        then 'finalizado'::public.accion_supervision_beneficio_regis
      else null
    end;
  end if;

  if v_accion is null then
    return new;
  end if;

  select beneficio.negocio_id
  into v_negocio_id
  from public.beneficios_regis as beneficio
  where beneficio.id = new.beneficio_id;

  insert into public.registro_supervision_beneficios (
    beneficio_id,
    beneficio_version_id,
    negocio_id,
    actor_id,
    accion,
    motivo,
    creado_en
  )
  values (
    new.beneficio_id,
    new.id,
    v_negocio_id,
    (select auth.uid()),
    v_accion,
    v_motivo,
    case
      when tg_op = 'INSERT'
        then coalesce(new.publicado_en, new.creado_en, now())
      else clock_timestamp()
    end
  );

  return new;
end;
$$;

insert into public.registro_supervision_beneficios (
  beneficio_id,
  beneficio_version_id,
  negocio_id,
  actor_id,
  accion,
  creado_en
)
select
  version_beneficio.beneficio_id,
  version_beneficio.id,
  beneficio.negocio_id,
  version_beneficio.creado_por,
  case version_beneficio.estado
    when 'borrador' then 'borrador_creado'::public.accion_supervision_beneficio_regis
    when 'activo' then 'publicado'::public.accion_supervision_beneficio_regis
    when 'pausado' then 'pausado'::public.accion_supervision_beneficio_regis
    else 'finalizado'::public.accion_supervision_beneficio_regis
  end,
  coalesce(version_beneficio.publicado_en, version_beneficio.creado_en)
from public.versiones_beneficio_regis as version_beneficio
join public.beneficios_regis as beneficio
  on beneficio.id = version_beneficio.beneficio_id;

create trigger versiones_beneficio_registrar_supervision
after insert or update of estado on public.versiones_beneficio_regis
for each row execute function public.registrar_evento_supervision_beneficio();

create function public.cambiar_estado_beneficio_regis(
  p_beneficio_version_id uuid,
  p_estado public.estado_beneficio_regis,
  p_motivo text
)
returns public.versiones_beneficio_regis
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_version public.versiones_beneficio_regis;
  v_negocio_id uuid;
  v_es_gestor boolean;
  v_es_admin boolean;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para cambiar el beneficio'
      using errcode = '42501';
  end if;

  select version_beneficio.*
  into v_version
  from public.versiones_beneficio_regis as version_beneficio
  where version_beneficio.id = p_beneficio_version_id
  for update;

  if not found then
    raise exception 'Beneficio no encontrado'
      using errcode = 'P0002';
  end if;

  select beneficio.negocio_id
  into v_negocio_id
  from public.beneficios_regis as beneficio
  where beneficio.id = v_version.beneficio_id;

  v_es_gestor := public.es_miembro_negocio(
    v_negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  );
  v_es_admin := public.es_admin_regalones();

  if not v_es_gestor and not v_es_admin then
    raise exception 'No tienes permisos para administrar este beneficio'
      using errcode = '42501';
  end if;

  if v_es_admin and not v_es_gestor and p_estado <> 'pausado' then
    raise exception 'La supervisión de Regalones solo puede pausar beneficios'
      using errcode = '42501';
  end if;

  if char_length(v_motivo) < 3 or char_length(v_motivo) > 500 then
    raise exception 'Debes indicar un motivo de entre 3 y 500 caracteres'
      using errcode = '22023';
  end if;

  if p_estado = 'pausado' and v_version.estado <> 'activo' then
    raise exception 'Solo se puede pausar un beneficio publicado'
      using errcode = '23514';
  elsif p_estado = 'activo' and v_version.estado <> 'pausado' then
    raise exception 'Solo se puede reactivar un beneficio pausado'
      using errcode = '23514';
  elsif p_estado = 'finalizado'
    and v_version.estado not in ('activo', 'pausado')
  then
    raise exception 'Solo se puede finalizar un beneficio publicado o pausado'
      using errcode = '23514';
  elsif p_estado not in ('activo', 'pausado', 'finalizado') then
    raise exception 'El estado solicitado no está permitido'
      using errcode = '22023';
  end if;

  if p_estado = 'activo' then
    if v_version.vigencia_desde > now()
      or (v_version.vigencia_hasta is not null and v_version.vigencia_hasta <= now())
    then
      raise exception 'El beneficio está fuera de su vigencia'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.versiones_beneficio_regis as otra_version
      where otra_version.beneficio_id = v_version.beneficio_id
        and otra_version.id <> v_version.id
        and otra_version.estado = 'activo'
    ) then
      raise exception 'Ya existe otra versión publicada de este beneficio'
        using errcode = '23505';
    end if;
  end if;

  perform set_config('regalones.motivo_beneficio', v_motivo, true);

  update public.versiones_beneficio_regis
  set estado = p_estado
  where id = p_beneficio_version_id
  returning * into v_version;

  perform set_config('regalones.motivo_beneficio', '', true);

  return v_version;
end;
$$;

alter table public.registro_supervision_beneficios enable row level security;

create policy registro_supervision_leer_gestores
on public.registro_supervision_beneficios
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

revoke all on table public.registro_supervision_beneficios
  from anon, authenticated;
grant select on table public.registro_supervision_beneficios
  to authenticated;

revoke all on function public.registrar_evento_supervision_beneficio()
  from public, anon, authenticated;
revoke all on function public.cambiar_estado_beneficio_regis(
  uuid,
  public.estado_beneficio_regis,
  text
) from public, anon;
grant execute on function public.cambiar_estado_beneficio_regis(
  uuid,
  public.estado_beneficio_regis,
  text
) to authenticated;

comment on table public.registro_supervision_beneficios is
  'Bitácora inmutable para que Regalones supervise la publicación y los cambios de estado de beneficios.';
comment on function public.cambiar_estado_beneficio_regis(
  uuid,
  public.estado_beneficio_regis,
  text
) is
  'Permite a propietarios y administradores gestionar sus beneficios; Regalones solo puede pausarlos por supervisión.';
