begin;

create type public.estado_sesion_lector_movil as enum (
  'pendiente_vinculacion',
  'vinculada',
  'cerrada',
  'expirada',
  'reemplazada'
);

create type public.estado_lectura_llavero_terminal as enum (
  'pendiente',
  'consumida',
  'expirada',
  'rechazada'
);

alter table public.terminales
add constraint terminales_identidad_caja_unica unique (id, caja_id);

create table public.sesiones_lector_movil (
  id uuid primary key default gen_random_uuid(),
  terminal_id uuid not null,
  caja_id uuid not null,
  creada_por uuid not null references auth.users (id) on delete restrict,
  token_vinculacion_hash text unique,
  token_lector_hash text unique,
  nombre_lector varchar(120),
  estado public.estado_sesion_lector_movil not null
    default 'pendiente_vinculacion',
  expira_vinculacion_en timestamptz not null,
  vinculada_en timestamptz,
  expira_en timestamptz not null,
  ultima_lectura_en timestamptz,
  cerrada_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint sesiones_lector_movil_terminal_caja_fkey
    foreign key (terminal_id, caja_id)
    references public.terminales (id, caja_id)
    on delete restrict,
  constraint sesiones_lector_movil_token_vinculacion_valido
    check (
      token_vinculacion_hash is null
      or char_length(token_vinculacion_hash) = 64
    ),
  constraint sesiones_lector_movil_token_lector_valido
    check (
      token_lector_hash is null
      or char_length(token_lector_hash) = 64
    ),
  constraint sesiones_lector_movil_nombre_valido
    check (
      nombre_lector is null
      or char_length(btrim(nombre_lector)) between 1 and 120
    ),
  constraint sesiones_lector_movil_fechas_validas
    check (
      expira_vinculacion_en > creado_en
      and expira_en > expira_vinculacion_en
      and expira_en <= creado_en + interval '8 hours 5 minutes'
    ),
  constraint sesiones_lector_movil_estado_valido check (
    (
      estado = 'pendiente_vinculacion'
      and token_vinculacion_hash is not null
      and token_lector_hash is null
      and vinculada_en is null
      and cerrada_en is null
    )
    or (
      estado = 'vinculada'
      and token_vinculacion_hash is null
      and token_lector_hash is not null
      and vinculada_en is not null
      and cerrada_en is null
    )
    or (
      estado in ('cerrada', 'expirada', 'reemplazada')
      and token_vinculacion_hash is null
      and token_lector_hash is null
      and cerrada_en is not null
    )
  )
);

create unique index sesiones_lector_movil_activa_por_terminal
  on public.sesiones_lector_movil (terminal_id)
  where estado in ('pendiente_vinculacion', 'vinculada');

create index sesiones_lector_movil_caja_estado_idx
  on public.sesiones_lector_movil (caja_id, estado, expira_en);

create table public.lecturas_llavero_terminal (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null
    references public.sesiones_lector_movil (id) on delete restrict,
  terminal_id uuid not null,
  caja_id uuid not null,
  llavero_id uuid not null
    references public.llaveros_nfc (id) on delete restrict,
  estado public.estado_lectura_llavero_terminal not null default 'pendiente',
  leido_en timestamptz not null default now(),
  expira_en timestamptz not null,
  consumida_en timestamptz,
  consumida_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint lecturas_llavero_terminal_terminal_caja_fkey
    foreign key (terminal_id, caja_id)
    references public.terminales (id, caja_id)
    on delete restrict,
  constraint lecturas_llavero_terminal_vigencia_valida
    check (
      expira_en > leido_en
      and expira_en <= leido_en + interval '1 minute'
    ),
  constraint lecturas_llavero_terminal_consumo_valido check (
    (
      estado = 'consumida'
      and consumida_en is not null
      and consumida_por is not null
    )
    or (
      estado <> 'consumida'
      and consumida_en is null
      and consumida_por is null
    )
  )
);

create index lecturas_llavero_terminal_pendientes_idx
  on public.lecturas_llavero_terminal (terminal_id, leido_en desc)
  where estado = 'pendiente';

create index lecturas_llavero_terminal_llavero_idx
  on public.lecturas_llavero_terminal (llavero_id, leido_en desc);

create trigger sesiones_lector_movil_establecer_actualizado_en
before update on public.sesiones_lector_movil
for each row execute function public.establecer_actualizado_en();

create function public.es_operador_terminal(p_terminal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.terminales as terminal
    join public.cajas as caja
      on caja.id = terminal.caja_id
    join public.sucursales as sucursal
      on sucursal.id = caja.sucursal_id
    join public.negocios as negocio
      on negocio.id = sucursal.negocio_id
    where terminal.id = p_terminal_id
      and terminal.estado = 'activa'
      and caja.estado = 'activa'
      and sucursal.estado = 'activa'
      and negocio.estado = 'activo'
      and public.es_miembro_negocio(negocio.id)
  );
$$;

create function public.crear_vinculacion_lector_movil(
  p_terminal_id uuid,
  p_nombre_lector text default null
)
returns table (
  sesion_id uuid,
  terminal_id uuid,
  caja_id uuid,
  token_vinculacion text,
  expira_vinculacion_en timestamptz,
  expira_sesion_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_caja_id uuid;
  v_token text;
  v_ahora timestamptz := clock_timestamp();
  v_sesion_id uuid;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión en la terminal'
      using errcode = '42501';
  end if;

  select terminal.caja_id
  into v_caja_id
  from public.terminales as terminal
  where terminal.id = p_terminal_id
    and terminal.estado = 'activa';

  if v_caja_id is null or not public.es_operador_terminal(p_terminal_id) then
    raise exception 'No tienes acceso a una terminal activa'
      using errcode = '42501';
  end if;

  if p_nombre_lector is not null
    and char_length(btrim(p_nombre_lector)) not between 1 and 120 then
    raise exception 'El nombre del lector no es válido'
      using errcode = '22023';
  end if;

  update public.sesiones_lector_movil as sesion
  set
    estado = 'reemplazada',
    token_vinculacion_hash = null,
    token_lector_hash = null,
    cerrada_en = v_ahora
  where sesion.terminal_id = p_terminal_id
    and sesion.estado in ('pendiente_vinculacion', 'vinculada');

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.sesiones_lector_movil (
    terminal_id,
    caja_id,
    creada_por,
    token_vinculacion_hash,
    nombre_lector,
    estado,
    expira_vinculacion_en,
    expira_en
  ) values (
    p_terminal_id,
    v_caja_id,
    v_usuario_id,
    encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    ),
    nullif(btrim(p_nombre_lector), ''),
    'pendiente_vinculacion',
    v_ahora + interval '5 minutes',
    v_ahora + interval '8 hours'
  )
  returning id into v_sesion_id;

  return query
  select
    v_sesion_id,
    p_terminal_id,
    v_caja_id,
    v_token,
    v_ahora + interval '5 minutes',
    v_ahora + interval '8 hours';
end;
$$;

create function public.vincular_lector_movil(
  p_token_vinculacion text,
  p_nombre_lector text default null
)
returns table (
  sesion_id uuid,
  token_lector text,
  terminal_identificador text,
  caja_nombre text,
  expira_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_token_lector text;
  v_sesion public.sesiones_lector_movil;
  v_terminal_identificador text;
  v_caja_nombre text;
  v_ahora timestamptz := clock_timestamp();
begin
  if p_token_vinculacion is null
    or char_length(p_token_vinculacion) < 32 then
    raise exception 'El código de vinculación no es válido o ya expiró'
      using errcode = '22023';
  end if;

  if p_nombre_lector is not null
    and char_length(btrim(p_nombre_lector)) not between 1 and 120 then
    raise exception 'El nombre del lector no es válido'
      using errcode = '22023';
  end if;

  v_hash := encode(
    extensions.digest(convert_to(p_token_vinculacion, 'UTF8'), 'sha256'),
    'hex'
  );

  update public.sesiones_lector_movil as sesion
  set
    estado = 'expirada',
    token_vinculacion_hash = null,
    token_lector_hash = null,
    cerrada_en = v_ahora
  where sesion.token_vinculacion_hash = v_hash
    and sesion.estado = 'pendiente_vinculacion'
    and sesion.expira_vinculacion_en <= v_ahora;

  select sesion.*
  into v_sesion
  from public.sesiones_lector_movil as sesion
  where sesion.token_vinculacion_hash = v_hash
    and sesion.estado = 'pendiente_vinculacion'
    and sesion.expira_vinculacion_en > v_ahora
    and sesion.expira_en > v_ahora
  for update;

  if v_sesion.id is null then
    raise exception 'El código de vinculación no es válido o ya expiró'
      using errcode = '22023';
  end if;

  select terminal.identificador_publico, caja.nombre
  into v_terminal_identificador, v_caja_nombre
  from public.terminales as terminal
  join public.cajas as caja on caja.id = terminal.caja_id
  where terminal.id = v_sesion.terminal_id
    and terminal.estado = 'activa'
    and caja.estado = 'activa';

  if v_terminal_identificador is null then
    raise exception 'La terminal ya no está disponible'
      using errcode = '55000';
  end if;

  v_token_lector := encode(extensions.gen_random_bytes(32), 'hex');

  update public.sesiones_lector_movil as sesion
  set
    estado = 'vinculada',
    token_vinculacion_hash = null,
    token_lector_hash = encode(
      extensions.digest(convert_to(v_token_lector, 'UTF8'), 'sha256'),
      'hex'
    ),
    nombre_lector = coalesce(
      nullif(btrim(p_nombre_lector), ''),
      sesion.nombre_lector
    ),
    vinculada_en = v_ahora
  where sesion.id = v_sesion.id;

  return query
  select
    v_sesion.id,
    v_token_lector,
    v_terminal_identificador,
    v_caja_nombre,
    v_sesion.expira_en;
end;
$$;

create function public.consultar_estado_lector_movil(p_token_lector text)
returns table (
  estado public.estado_sesion_lector_movil,
  terminal_identificador text,
  caja_nombre text,
  expira_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_ahora timestamptz := clock_timestamp();
begin
  if p_token_lector is null or char_length(p_token_lector) < 32 then
    raise exception 'La sesión del lector no es válida'
      using errcode = '22023';
  end if;

  v_hash := encode(
    extensions.digest(convert_to(p_token_lector, 'UTF8'), 'sha256'),
    'hex'
  );

  update public.sesiones_lector_movil as sesion
  set
    estado = 'expirada',
    token_lector_hash = null,
    cerrada_en = v_ahora
  where sesion.token_lector_hash = v_hash
    and sesion.estado = 'vinculada'
    and sesion.expira_en <= v_ahora;

  return query
  select
    sesion.estado,
    terminal.identificador_publico::text,
    caja.nombre::text,
    sesion.expira_en
  from public.sesiones_lector_movil as sesion
  join public.terminales as terminal on terminal.id = sesion.terminal_id
  join public.cajas as caja on caja.id = sesion.caja_id
  where sesion.token_lector_hash = v_hash
    and sesion.estado = 'vinculada'
    and sesion.expira_en > v_ahora;
end;
$$;

create function public.registrar_lectura_llavero_terminal(
  p_token_lector text,
  p_token_llavero text
)
returns table (
  lectura_id uuid,
  terminal_identificador text,
  caja_nombre text,
  codigo_publico_llavero text,
  leido_en timestamptz,
  expira_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash_lector text;
  v_hash_llavero text;
  v_sesion public.sesiones_lector_movil;
  v_llavero public.llaveros_nfc;
  v_lectura public.lecturas_llavero_terminal;
  v_terminal_identificador text;
  v_caja_nombre text;
  v_ahora timestamptz := clock_timestamp();
begin
  if p_token_lector is null or char_length(p_token_lector) < 32 then
    raise exception 'La sesión del lector no es válida o expiró'
      using errcode = '42501';
  end if;

  if p_token_llavero is null or char_length(p_token_llavero) < 8 then
    raise exception 'No encontramos un llavero válido'
      using errcode = 'P0002';
  end if;

  v_hash_lector := encode(
    extensions.digest(convert_to(p_token_lector, 'UTF8'), 'sha256'),
    'hex'
  );
  v_hash_llavero := encode(
    extensions.digest(convert_to(p_token_llavero, 'UTF8'), 'sha256'),
    'hex'
  );

  update public.sesiones_lector_movil as sesion
  set
    estado = 'expirada',
    token_lector_hash = null,
    cerrada_en = v_ahora
  where sesion.token_lector_hash = v_hash_lector
    and sesion.estado = 'vinculada'
    and sesion.expira_en <= v_ahora;

  select sesion.*
  into v_sesion
  from public.sesiones_lector_movil as sesion
  join public.terminales as terminal
    on terminal.id = sesion.terminal_id
    and terminal.estado = 'activa'
  join public.cajas as caja
    on caja.id = sesion.caja_id
    and caja.estado = 'activa'
  where sesion.token_lector_hash = v_hash_lector
    and sesion.estado = 'vinculada'
    and sesion.expira_en > v_ahora
  for update of sesion;

  if v_sesion.id is null then
    raise exception 'La sesión del lector no es válida o expiró'
      using errcode = '42501';
  end if;

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil on perfil.id = llavero.vecino_id
  where llavero.token_hash = v_hash_llavero
    and llavero.estado = 'activo'
    and perfil.estado = 'activo';

  if v_llavero.id is null then
    raise exception 'No encontramos un llavero activo asociado a ese identificador'
      using errcode = 'P0002';
  end if;

  update public.lecturas_llavero_terminal as lectura
  set estado = 'expirada'
  where lectura.sesion_id = v_sesion.id
    and lectura.estado = 'pendiente'
    and lectura.expira_en <= v_ahora;

  select lectura.*
  into v_lectura
  from public.lecturas_llavero_terminal as lectura
  where lectura.sesion_id = v_sesion.id
    and lectura.llavero_id = v_llavero.id
    and lectura.estado = 'pendiente'
    and lectura.leido_en >= v_ahora - interval '3 seconds'
  order by lectura.leido_en desc
  limit 1;

  if v_lectura.id is null then
    insert into public.lecturas_llavero_terminal (
      sesion_id,
      terminal_id,
      caja_id,
      llavero_id,
      estado,
      leido_en,
      expira_en
    ) values (
      v_sesion.id,
      v_sesion.terminal_id,
      v_sesion.caja_id,
      v_llavero.id,
      'pendiente',
      v_ahora,
      v_ahora + interval '30 seconds'
    )
    returning * into v_lectura;
  end if;

  update public.sesiones_lector_movil
  set ultima_lectura_en = v_ahora
  where id = v_sesion.id;

  select terminal.identificador_publico, caja.nombre
  into v_terminal_identificador, v_caja_nombre
  from public.terminales as terminal
  join public.cajas as caja on caja.id = terminal.caja_id
  where terminal.id = v_sesion.terminal_id;

  return query
  select
    v_lectura.id,
    v_terminal_identificador,
    v_caja_nombre,
    v_llavero.codigo_publico::text,
    v_lectura.leido_en,
    v_lectura.expira_en;
end;
$$;

create function public.listar_lecturas_pendientes_terminal(p_terminal_id uuid)
returns table (
  lectura_id uuid,
  llavero_id uuid,
  vecino_id uuid,
  codigo_publico_llavero text,
  nombre_vecino text,
  leido_en timestamptz,
  expira_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ahora timestamptz := clock_timestamp();
begin
  if not public.es_operador_terminal(p_terminal_id) then
    raise exception 'No tienes acceso a esta terminal'
      using errcode = '42501';
  end if;

  update public.lecturas_llavero_terminal as lectura
  set estado = 'expirada'
  where lectura.terminal_id = p_terminal_id
    and lectura.estado = 'pendiente'
    and lectura.expira_en <= v_ahora;

  return query
  select
    lectura.id,
    llavero.id,
    llavero.vecino_id,
    llavero.codigo_publico::text,
    concat_ws(' ', perfil.nombre, perfil.apellido)::text,
    lectura.leido_en,
    lectura.expira_en
  from public.lecturas_llavero_terminal as lectura
  join public.llaveros_nfc as llavero on llavero.id = lectura.llavero_id
  join public.perfiles as perfil on perfil.id = llavero.vecino_id
  where lectura.terminal_id = p_terminal_id
    and lectura.estado = 'pendiente'
    and lectura.expira_en > v_ahora
  order by lectura.leido_en asc;
end;
$$;

create function public.consumir_lectura_llavero_terminal(p_lectura_id uuid)
returns table (
  lectura_id uuid,
  terminal_id uuid,
  caja_id uuid,
  llavero_id uuid,
  vecino_id uuid,
  codigo_publico_llavero text,
  nombre_vecino text,
  consumida_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_lectura public.lecturas_llavero_terminal;
  v_ahora timestamptz := clock_timestamp();
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión en la terminal'
      using errcode = '42501';
  end if;

  select lectura.*
  into v_lectura
  from public.lecturas_llavero_terminal as lectura
  where lectura.id = p_lectura_id
  for update;

  if v_lectura.id is null then
    raise exception 'La lectura no existe'
      using errcode = 'P0002';
  end if;

  if not public.es_operador_terminal(v_lectura.terminal_id) then
    raise exception 'No tienes acceso a esta lectura'
      using errcode = '42501';
  end if;

  if v_lectura.estado <> 'pendiente' or v_lectura.expira_en <= v_ahora then
    if v_lectura.estado = 'pendiente' then
      update public.lecturas_llavero_terminal
      set estado = 'expirada'
      where id = v_lectura.id;
    end if;

    raise exception 'La lectura ya fue utilizada o expiró'
      using errcode = '55000';
  end if;

  update public.lecturas_llavero_terminal
  set
    estado = 'consumida',
    consumida_en = v_ahora,
    consumida_por = v_usuario_id
  where id = v_lectura.id;

  return query
  select
    v_lectura.id,
    v_lectura.terminal_id,
    v_lectura.caja_id,
    llavero.id,
    llavero.vecino_id,
    llavero.codigo_publico::text,
    concat_ws(' ', perfil.nombre, perfil.apellido)::text,
    v_ahora
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil on perfil.id = llavero.vecino_id
  where llavero.id = v_lectura.llavero_id;
end;
$$;

create function public.cerrar_sesion_lector_movil(p_terminal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ahora timestamptz := clock_timestamp();
begin
  if not public.es_operador_terminal(p_terminal_id) then
    raise exception 'No tienes acceso a esta terminal'
      using errcode = '42501';
  end if;

  update public.sesiones_lector_movil as sesion
  set
    estado = 'cerrada',
    token_vinculacion_hash = null,
    token_lector_hash = null,
    cerrada_en = v_ahora
  where sesion.terminal_id = p_terminal_id
    and sesion.estado in ('pendiente_vinculacion', 'vinculada');

  update public.lecturas_llavero_terminal as lectura
  set estado = 'rechazada'
  where lectura.terminal_id = p_terminal_id
    and lectura.estado = 'pendiente';
end;
$$;

alter table public.sesiones_lector_movil enable row level security;
alter table public.lecturas_llavero_terminal enable row level security;

create policy sesiones_lector_movil_leer_terminal
on public.sesiones_lector_movil
for select
to authenticated
using (public.es_operador_terminal(terminal_id));

create policy lecturas_llavero_terminal_leer_terminal
on public.lecturas_llavero_terminal
for select
to authenticated
using (public.es_operador_terminal(terminal_id));

revoke all on table public.sesiones_lector_movil
  from public, anon, authenticated;
revoke all on table public.lecturas_llavero_terminal
  from public, anon, authenticated;

grant select on table public.lecturas_llavero_terminal to authenticated;

revoke all on function public.es_operador_terminal(uuid)
  from public, anon, authenticated;
revoke all on function public.crear_vinculacion_lector_movil(uuid, text)
  from public, anon, authenticated;
revoke all on function public.vincular_lector_movil(text, text)
  from public, anon, authenticated;
revoke all on function public.consultar_estado_lector_movil(text)
  from public, anon, authenticated;
revoke all on function public.registrar_lectura_llavero_terminal(text, text)
  from public, anon, authenticated;
revoke all on function public.listar_lecturas_pendientes_terminal(uuid)
  from public, anon, authenticated;
revoke all on function public.consumir_lectura_llavero_terminal(uuid)
  from public, anon, authenticated;
revoke all on function public.cerrar_sesion_lector_movil(uuid)
  from public, anon, authenticated;

grant execute on function public.es_operador_terminal(uuid)
  to authenticated;
grant execute on function public.crear_vinculacion_lector_movil(uuid, text)
  to authenticated;
grant execute on function public.vincular_lector_movil(text, text)
  to anon, authenticated;
grant execute on function public.consultar_estado_lector_movil(text)
  to anon, authenticated;
grant execute on function public.registrar_lectura_llavero_terminal(text, text)
  to anon, authenticated;
grant execute on function public.listar_lecturas_pendientes_terminal(uuid)
  to authenticated;
grant execute on function public.consumir_lectura_llavero_terminal(uuid)
  to authenticated;
grant execute on function public.cerrar_sesion_lector_movil(uuid)
  to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lecturas_llavero_terminal'
  ) then
    alter publication supabase_realtime
      add table public.lecturas_llavero_terminal;
  end if;
end;
$$;

comment on table public.sesiones_lector_movil is
  'Vinculación temporal entre una Terminal PWA y un celular usado solo como lector NFC.';
comment on table public.lecturas_llavero_terminal is
  'Eventos efímeros de llaveros leídos por el celular y enviados a una terminal emparejada.';
comment on function public.registrar_lectura_llavero_terminal(text, text) is
  'Registra una lectura sin exponer datos personales al celular lector; no aprueba compras ni canjes.';
comment on function public.consumir_lectura_llavero_terminal(uuid) is
  'Entrega una lectura vigente una sola vez a un operador autenticado de la Terminal PWA.';

commit;
