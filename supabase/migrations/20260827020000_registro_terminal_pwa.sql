begin;

create function public.registrar_terminal_pwa(
  p_caja_id uuid,
  p_nombre_dispositivo text,
  p_version_app text default null
)
returns table (
  terminal_id uuid,
  caja_id uuid,
  identificador_publico text,
  token_terminal text,
  nombre_dispositivo text,
  estado public.estado_terminal
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_negocio_id uuid;
  v_token text;
  v_identificador text;
  v_terminal_id uuid;
  v_nombre text := btrim(coalesce(p_nombre_dispositivo, ''));
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para registrar la terminal'
      using errcode = '42501';
  end if;

  if char_length(v_nombre) not between 3 and 120 then
    raise exception 'El nombre del dispositivo debe tener entre 3 y 120 caracteres'
      using errcode = '22023';
  end if;

  if p_version_app is not null
    and char_length(btrim(p_version_app)) not between 1 and 40 then
    raise exception 'La versión de la aplicación no es válida'
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
    or not public.es_miembro_negocio(
      v_negocio_id,
      array[
        'propietario'::public.rol_miembro_negocio,
        'administrador'::public.rol_miembro_negocio
      ]
    )
  then
    raise exception 'Solo el propietario o administrador puede registrar una terminal'
      using errcode = '42501';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_identificador := 'TPWA-' || upper(substr(encode(
    extensions.gen_random_bytes(12),
    'hex'
  ), 1, 20));

  insert into public.terminales (
    caja_id,
    identificador_publico,
    token_hash,
    nombre_dispositivo,
    version_app,
    estado,
    ultima_conexion_en
  ) values (
    p_caja_id,
    v_identificador,
    encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    ),
    v_nombre,
    nullif(btrim(p_version_app), ''),
    'activa',
    clock_timestamp()
  )
  returning id into v_terminal_id;

  return query
  select
    v_terminal_id,
    p_caja_id,
    v_identificador,
    v_token,
    v_nombre,
    'activa'::public.estado_terminal;
end;
$$;

create function public.validar_terminal_pwa(
  p_terminal_id uuid,
  p_token_terminal text,
  p_version_app text default null
)
returns table (
  terminal_id uuid,
  caja_id uuid,
  identificador_publico text,
  nombre_dispositivo text,
  estado public.estado_terminal,
  valida boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := btrim(coalesce(p_token_terminal, ''));
  v_terminal public.terminales;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión en la terminal'
      using errcode = '42501';
  end if;

  if char_length(v_token) < 32 then
    raise exception 'La credencial de la terminal no es válida'
      using errcode = '42501';
  end if;

  select terminal.*
  into v_terminal
  from public.terminales as terminal
  where terminal.id = p_terminal_id
    and terminal.token_hash = encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    );

  if v_terminal.id is null
    or v_terminal.estado <> 'activa'
    or not public.es_operador_terminal(v_terminal.id)
  then
    raise exception 'La terminal no existe, fue revocada o no pertenece al comercio'
      using errcode = '42501';
  end if;

  update public.terminales
  set
    ultima_conexion_en = clock_timestamp(),
    version_app = coalesce(
      nullif(btrim(p_version_app), ''),
      version_app
    )
  where id = v_terminal.id;

  return query
  select
    v_terminal.id,
    v_terminal.caja_id,
    v_terminal.identificador_publico::text,
    v_terminal.nombre_dispositivo::text,
    v_terminal.estado,
    true;
end;
$$;

create function public.crear_vinculacion_lector_terminal(
  p_terminal_id uuid,
  p_token_terminal text,
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
  v_token text := btrim(coalesce(p_token_terminal, ''));
begin
  if char_length(v_token) < 32
    or not exists (
      select 1
      from public.terminales as terminal
      where terminal.id = p_terminal_id
        and terminal.estado = 'activa'
        and terminal.token_hash = encode(
          extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
          'hex'
        )
    )
    or not public.es_operador_terminal(p_terminal_id)
  then
    raise exception 'La credencial de la terminal no es válida'
      using errcode = '42501';
  end if;

  return query
  select vinculacion.*
  from public.crear_vinculacion_lector_movil(
    p_terminal_id,
    p_nombre_lector
  ) as vinculacion;
end;
$$;

create function public.revocar_terminal_pwa(p_terminal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio_id uuid;
  v_ahora timestamptz := clock_timestamp();
begin
  select sucursal.negocio_id
  into v_negocio_id
  from public.terminales as terminal
  join public.cajas as caja on caja.id = terminal.caja_id
  join public.sucursales as sucursal on sucursal.id = caja.sucursal_id
  where terminal.id = p_terminal_id;

  if v_negocio_id is null
    or not public.es_miembro_negocio(
      v_negocio_id,
      array[
        'propietario'::public.rol_miembro_negocio,
        'administrador'::public.rol_miembro_negocio
      ]
    )
  then
    raise exception 'No tienes permisos para revocar esta terminal'
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

  update public.terminales
  set estado = 'revocada'
  where id = p_terminal_id;
end;
$$;

revoke execute on function public.crear_vinculacion_lector_movil(uuid, text)
  from authenticated;

revoke all on function public.registrar_terminal_pwa(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.validar_terminal_pwa(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.crear_vinculacion_lector_terminal(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.revocar_terminal_pwa(uuid)
  from public, anon, authenticated;

grant execute on function public.registrar_terminal_pwa(uuid, text, text)
  to authenticated;
grant execute on function public.validar_terminal_pwa(uuid, text, text)
  to authenticated;
grant execute on function public.crear_vinculacion_lector_terminal(uuid, text, text)
  to authenticated;
grant execute on function public.revocar_terminal_pwa(uuid)
  to authenticated;

comment on function public.registrar_terminal_pwa(uuid, text, text) is
  'Registra este navegador como Terminal PWA y devuelve su secreto una sola vez.';
comment on function public.crear_vinculacion_lector_terminal(uuid, text, text) is
  'Genera un QR de lector solo después de validar la credencial local de la Terminal PWA.';

commit;
