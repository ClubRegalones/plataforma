-- ============================================================================
-- REGISTRO Y ACCESO DE VECINOS POR RUT · V1
--
-- Decisiones (24 sep 2026):
--   1. El registro público de Supabase Auth se cierra. Toda cuenta de vecino
--      se crea desde la Edge Function registro-vecino (service_role).
--   2. Cada vecino tiene en Auth un correo técnico aleatorio y permanente:
--      v-<uuid>@cuentas.clubregalones.cl. Nunca contiene el RUT y nunca se
--      reemplaza. El login visible es RUT + contraseña (Edge Function
--      acceso-vecino).
--   3. Correo real y teléfono son contactos opcionales en contactos_vecino,
--      nunca identidad. Sirven para avisos y recuperación verificada.
--   4. Consentimientos versionados desde el registro. El cliente envía la
--      versión exacta que mostró; la BD registra esa versión. Términos y
--      privacidad obligatorio; avisos comerciales y análisis opcionales.
--
-- El RUT vive solo en perfiles.rut. No se guarda en metadatos de Auth, en el
-- correo técnico, en el JWT ni en la tabla de bloqueos (que usa un HMAC).
--
-- Todas las funciones nuevas son exclusivas de service_role.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Tipos
-- ----------------------------------------------------------------------------

create type public.tipo_contacto_vecino as enum ('correo', 'telefono');

create type public.tipo_consentimiento as enum (
  'terminos_privacidad',
  'avisos_comerciales',
  'analisis_personalizado'
);

create type public.canal_consentimiento as enum (
  'web',
  'app_vecino',
  'totem',
  'asistido'
);


-- ----------------------------------------------------------------------------
-- 2. Helpers de correo técnico y contactos
-- ----------------------------------------------------------------------------

create function public.es_correo_tecnico(p_correo text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(lower(p_correo) like '%@cuentas.clubregalones.cl', false);
$$;

comment on function public.es_correo_tecnico(text) is
  'Verdadero si el correo pertenece al dominio técnico de cuentas de vecinos.';


create function public.normalizar_correo_contacto(p_correo text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_correo is null then null
    when lower(btrim(p_correo)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      and char_length(btrim(p_correo)) <= 254
      and not public.es_correo_tecnico(btrim(p_correo))
      then lower(btrim(p_correo))
    else null
  end;
$$;

comment on function public.normalizar_correo_contacto(text) is
  'Correo en minúsculas y sin espacios si es válido y no es técnico; null si no.';


create function public.normalizar_telefono_contacto(p_telefono text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when x.t ~ '^9[0-9]{8}$' then '+56' || x.t
    when x.t ~ '^569[0-9]{8}$' then '+' || x.t
    when x.t ~ '^\+[1-9][0-9]{7,14}$' then x.t
    else null
  end
  from (
    select regexp_replace(coalesce(p_telefono, ''), '[\s().-]', '', 'g') as t
  ) as x;
$$;

comment on function public.normalizar_telefono_contacto(text) is
  'Teléfono en formato E.164. Acepta celulares chilenos 9XXXXXXXX y 569XXXXXXXX. Null si no es válido.';


-- ----------------------------------------------------------------------------
-- 3. Contactos del vecino
-- ----------------------------------------------------------------------------

create table public.contactos_vecino (
  id uuid primary key default gen_random_uuid(),
  vecino_id uuid not null references public.perfiles (id) on delete cascade,
  tipo public.tipo_contacto_vecino not null,
  valor varchar(254) not null,
  verificado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- IS NOT NULL explícito: si el normalizador devuelve null (dato inválido),
  -- la comparación daría null y PostgreSQL aceptaría el CHECK.
  constraint contactos_vecino_valor_normalizado check (
    (
      tipo = 'correo'
      and public.normalizar_correo_contacto(valor) is not null
      and valor = public.normalizar_correo_contacto(valor)
    )
    or (
      tipo = 'telefono'
      and public.normalizar_telefono_contacto(valor) is not null
      and valor = public.normalizar_telefono_contacto(valor)
    )
  ),
  constraint contactos_vecino_unico unique (vecino_id, tipo, valor)
);

create index contactos_vecino_vecino_idx
  on public.contactos_vecino (vecino_id);

comment on table public.contactos_vecino is
  'Correos y teléfonos opcionales del vecino para avisos y recuperación. Nunca son identidad: el mismo correo puede estar en más de una cuenta (familia).';


-- ----------------------------------------------------------------------------
-- 4. Consentimientos versionados
-- ----------------------------------------------------------------------------

create table public.versiones_consentimiento (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_consentimiento not null,
  version varchar(40) not null,
  obligatorio boolean not null,
  publicado_en timestamptz not null default now(),
  creado_en timestamptz not null default now(),

  constraint versiones_consentimiento_unica unique (tipo, version)
);

comment on table public.versiones_consentimiento is
  'Versiones de los textos que el vecino acepta. El texto legal definitivo se publica como versión nueva tras la revisión legal.';


create table public.consentimientos_vecino (
  id uuid primary key default gen_random_uuid(),
  vecino_id uuid not null references public.perfiles (id) on delete restrict,
  version_id uuid not null references public.versiones_consentimiento (id) on delete restrict,
  otorgado boolean not null,
  canal public.canal_consentimiento not null,
  registrado_en timestamptz not null default now()
);

create index consentimientos_vecino_vecino_idx
  on public.consentimientos_vecino (vecino_id, registrado_en desc);

comment on table public.consentimientos_vecino is
  'Historial append-only de consentimientos. Retirar un consentimiento agrega una fila nueva con otorgado = false; nunca se edita ni se borra.';


insert into public.versiones_consentimiento (tipo, version, obligatorio)
values
  ('terminos_privacidad', '2026-09-provisoria', true),
  ('avisos_comerciales', '2026-09-provisoria', false),
  ('analisis_personalizado', '2026-09-provisoria', false);

-- Lo que el formulario de registro debe mostrar. El cliente envía de vuelta
-- la versión exacta que mostró junto a cada decisión.
create view public.versiones_consentimiento_vigentes
with (security_invoker = true)
as
select distinct on (tipo)
  tipo,
  version,
  obligatorio,
  publicado_en
from public.versiones_consentimiento
where publicado_en <= now()
order by tipo, publicado_en desc;

comment on view public.versiones_consentimiento_vigentes is
  'Versión vigente de cada consentimiento. El registro envía {tipo: {version, otorgado}} con la versión que vio el vecino.';


-- ----------------------------------------------------------------------------
-- 5. Bloqueo de intentos (login por RUT, registro por IP)
--    La clave es un HMAC calculado en la Edge Function: el RUT o la IP no se
--    guardan en claro.
-- ----------------------------------------------------------------------------

create table public.bloqueos_intentos (
  clave varchar(128) primary key,
  fallos integer not null default 0,
  ventana_inicia_en timestamptz not null default now(),
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz not null default now()
);

comment on table public.bloqueos_intentos is
  'Contadores de intentos por clave HMAC (acceso-rut-ip, acceso-ip, acceso-rut, registro-ip). Sin RUT ni IP en claro.';


-- ----------------------------------------------------------------------------
-- 6. RLS y permisos de tablas
-- ----------------------------------------------------------------------------

alter table public.contactos_vecino enable row level security;
alter table public.versiones_consentimiento enable row level security;
alter table public.consentimientos_vecino enable row level security;
alter table public.bloqueos_intentos enable row level security;

revoke all on table public.contactos_vecino from anon, authenticated;
revoke all on table public.versiones_consentimiento from anon, authenticated;
revoke all on table public.consentimientos_vecino from anon, authenticated;
revoke all on table public.bloqueos_intentos from anon, authenticated;

grant select on table public.contactos_vecino to authenticated;
grant select on table public.consentimientos_vecino to authenticated;
grant select on table public.versiones_consentimiento to anon, authenticated;
grant select on table public.versiones_consentimiento_vigentes to anon, authenticated;

create policy contactos_vecino_leer_propios
on public.contactos_vecino
for select
to authenticated
using (vecino_id = (select auth.uid()) or (select public.es_admin_regalones()));

create policy consentimientos_vecino_leer_propios
on public.consentimientos_vecino
for select
to authenticated
using (vecino_id = (select auth.uid()) or (select public.es_admin_regalones()));

create policy versiones_consentimiento_leer
on public.versiones_consentimiento
for select
to anon, authenticated
using (true);


-- ----------------------------------------------------------------------------
-- 7. Perfil automático: nunca lee el RUT desde metadatos y no usa el correo
--    técnico como nombre.
-- ----------------------------------------------------------------------------

create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_apellido text;
  v_telefono text;
  v_parte_correo text;
begin
  -- El RUT NUNCA se toma de raw_user_meta_data: esos metadatos los puede
  -- escribir el cliente. Solo completar_registro_vecino() asigna el RUT.

  v_parte_correo := case
    when public.es_correo_tecnico(new.email) then null
    else nullif(split_part(coalesce(new.email, ''), '@', 1), '')
  end;

  v_nombre := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'given_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    v_parte_correo,
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


-- ----------------------------------------------------------------------------
-- 8. Registro
-- ----------------------------------------------------------------------------

create function public.rut_registrado(p_rut text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles
    where rut = public.normalizar_rut(p_rut)
  );
$$;

comment on function public.rut_registrado(text) is
  'Solo service_role. Indica si un RUT ya tiene cuenta Regalones.';


create function public.completar_registro_vecino(
  p_usuario_id uuid,
  p_rut text,
  p_nombre text,
  p_apellido text,
  p_correo text default null,
  p_telefono text default null,
  p_canal public.canal_consentimiento default 'web',
  p_consentimientos jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rut text;
  v_correo text;
  v_telefono text;
  v_perfil_rut text;
  v_tipo text;
  v_valor jsonb;
begin
  if not public.es_rut_valido(p_rut) then
    raise exception 'RUT_INVALIDO' using errcode = '22023';
  end if;

  v_rut := public.normalizar_rut(p_rut);

  if char_length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'NOMBRE_INVALIDO' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_apellido, ''))) < 2 then
    raise exception 'APELLIDO_INVALIDO' using errcode = '22023';
  end if;

  -- Consentimientos: {tipo: {"version": "...", "otorgado": true|false}}.
  -- Se registra exactamente la versión que el vecino vio, nunca "la última".
  if p_consentimientos is null or jsonb_typeof(p_consentimientos) <> 'object' then
    raise exception 'TERMINOS_REQUERIDOS' using errcode = '22023';
  end if;

  for v_tipo, v_valor in
    select clave, valor from jsonb_each(p_consentimientos) as e(clave, valor)
  loop
    if v_tipo not in (
      select unnest(enum_range(null::public.tipo_consentimiento))::text
    ) then
      raise exception 'CONSENTIMIENTO_DESCONOCIDO' using errcode = '22023';
    end if;

    if jsonb_typeof(v_valor) <> 'object'
      or jsonb_typeof(v_valor -> 'version') <> 'string'
      or jsonb_typeof(v_valor -> 'otorgado') <> 'boolean' then
      raise exception 'CONSENTIMIENTO_MAL_FORMADO' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.versiones_consentimiento
      where tipo = v_tipo::public.tipo_consentimiento
        and version = v_valor ->> 'version'
        and publicado_en <= now()
    ) then
      raise exception 'VERSION_CONSENTIMIENTO_INVALIDA' using errcode = '22023';
    end if;
  end loop;

  if coalesce(
    (p_consentimientos -> 'terminos_privacidad' ->> 'otorgado')::boolean,
    false
  ) is not true then
    raise exception 'TERMINOS_REQUERIDOS' using errcode = '22023';
  end if;

  if p_correo is not null and btrim(p_correo) <> '' then
    v_correo := public.normalizar_correo_contacto(p_correo);
    if v_correo is null then
      raise exception 'CORREO_INVALIDO' using errcode = '22023';
    end if;
  end if;

  if p_telefono is not null and btrim(p_telefono) <> '' then
    v_telefono := public.normalizar_telefono_contacto(p_telefono);
    if v_telefono is null then
      raise exception 'TELEFONO_INVALIDO' using errcode = '22023';
    end if;
  end if;

  select rut
  into v_perfil_rut
  from public.perfiles
  where id = p_usuario_id
  for update;

  if not found then
    raise exception 'PERFIL_NO_EXISTE' using errcode = 'P0002';
  end if;

  if v_perfil_rut is not null then
    raise exception 'PERFIL_YA_TIENE_RUT' using errcode = '23505';
  end if;

  begin
    update public.perfiles
    set
      rut = v_rut,
      nombre = left(btrim(p_nombre), 100),
      apellido = left(btrim(p_apellido), 100),
      modalidad_atencion = 'digital',
      actualizado_en = now()
    where id = p_usuario_id;
  exception
    when unique_violation then
      raise exception 'RUT_DUPLICADO' using errcode = '23505';
  end;

  if v_correo is not null then
    insert into public.contactos_vecino (vecino_id, tipo, valor)
    values (p_usuario_id, 'correo', v_correo);
  end if;

  if v_telefono is not null then
    insert into public.contactos_vecino (vecino_id, tipo, valor)
    values (p_usuario_id, 'telefono', v_telefono);
  end if;

  -- Una fila por cada consentimiento que el vecino vio, con esa versión.
  insert into public.consentimientos_vecino (vecino_id, version_id, otorgado, canal)
  select
    p_usuario_id,
    version.id,
    (entrada.valor ->> 'otorgado')::boolean,
    p_canal
  from jsonb_each(p_consentimientos) as entrada(clave, valor)
  join public.versiones_consentimiento as version
    on version.tipo = entrada.clave::public.tipo_consentimiento
   and version.version = entrada.valor ->> 'version';
end;
$$;

comment on function public.completar_registro_vecino(uuid, text, text, text, text, text, public.canal_consentimiento, jsonb) is
  'Solo service_role. Asigna el RUT (una sola vez), nombre y apellido obligatorios, contactos y los consentimientos con la versión exacta que vio el vecino.';


-- ----------------------------------------------------------------------------
-- 9. Acceso
-- ----------------------------------------------------------------------------

create function public.obtener_usuario_id_acceso_por_rut(p_rut text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Validación estricta: una entrada con caracteres prohibidos (ej.
  -- 'abc12.345.678-5xyz') no resuelve aunque al normalizarla coincida.
  select perfil.id
  from public.perfiles as perfil
  where public.es_rut_valido(p_rut)
    and perfil.rut = public.normalizar_rut(p_rut)
    and perfil.estado = 'activo'
  limit 1;
$$;

comment on function public.obtener_usuario_id_acceso_por_rut(text) is
  'Solo service_role. Resuelve un RUT válido (es_rut_valido) y activo a perfiles.id. La base nunca entrega el correo técnico: acceso-vecino lo obtiene con auth.admin.getUserById().';


-- ----------------------------------------------------------------------------
-- 10. Bloqueo de intentos
-- ----------------------------------------------------------------------------

create function public.intento_bloqueado(p_clave text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select bloqueado_hasta
  from public.bloqueos_intentos
  where clave = p_clave
    and bloqueado_hasta > now();
$$;


create function public.registrar_intento_fallido(
  p_clave text,
  p_maximo integer,
  p_ventana interval,
  p_bloqueo interval
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fallos integer;
  v_hasta timestamptz;
begin
  insert into public.bloqueos_intentos as b (clave, fallos, ventana_inicia_en)
  values (p_clave, 1, now())
  on conflict (clave) do update
  set
    fallos = case
      when b.ventana_inicia_en < now() - p_ventana then 1
      else b.fallos + 1
    end,
    ventana_inicia_en = case
      when b.ventana_inicia_en < now() - p_ventana then now()
      else b.ventana_inicia_en
    end,
    actualizado_en = now()
  returning fallos into v_fallos;

  if v_fallos >= p_maximo then
    update public.bloqueos_intentos
    set
      bloqueado_hasta = now() + p_bloqueo,
      fallos = 0,
      ventana_inicia_en = now(),
      actualizado_en = now()
    where clave = p_clave
    returning bloqueado_hasta into v_hasta;
  end if;

  return v_hasta;
end;
$$;


create function public.limpiar_intentos(p_clave text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.bloqueos_intentos where clave = p_clave;
$$;


-- ----------------------------------------------------------------------------
-- 11. Permisos de funciones
-- ----------------------------------------------------------------------------

grant execute on function public.es_correo_tecnico(text) to anon, authenticated;
grant execute on function public.normalizar_correo_contacto(text) to anon, authenticated;
grant execute on function public.normalizar_telefono_contacto(text) to anon, authenticated;

revoke all on function public.rut_registrado(text)
  from public, anon, authenticated;
revoke all on function public.completar_registro_vecino(uuid, text, text, text, text, text, public.canal_consentimiento, jsonb)
  from public, anon, authenticated;
revoke all on function public.obtener_usuario_id_acceso_por_rut(text)
  from public, anon, authenticated;
revoke all on function public.intento_bloqueado(text)
  from public, anon, authenticated;
revoke all on function public.registrar_intento_fallido(text, integer, interval, interval)
  from public, anon, authenticated;
revoke all on function public.limpiar_intentos(text)
  from public, anon, authenticated;

grant execute on function public.rut_registrado(text) to service_role;
grant execute on function public.completar_registro_vecino(uuid, text, text, text, text, text, public.canal_consentimiento, jsonb) to service_role;
grant execute on function public.obtener_usuario_id_acceso_por_rut(text) to service_role;
grant execute on function public.intento_bloqueado(text) to service_role;
grant execute on function public.registrar_intento_fallido(text, integer, interval, interval) to service_role;
grant execute on function public.limpiar_intentos(text) to service_role;

grant select, insert, update, delete on table public.bloqueos_intentos to service_role;
grant select, insert, update, delete on table public.contactos_vecino to service_role;
grant select, insert on table public.consentimientos_vecino to service_role;
grant select on table public.versiones_consentimiento to service_role;
