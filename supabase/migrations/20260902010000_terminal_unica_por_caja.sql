begin;

-- ==========================================================
-- UNA SOLA TERMINAL NO REVOCADA POR CAJA
-- ==========================================================

create unique index terminales_caja_no_revocada_unica
  on public.terminales (caja_id)
  where estado <> 'revocada'::public.estado_terminal;


-- ==========================================================
-- REGISTRO PWA CON MENSAJE EXPLICITO
-- ==========================================================

create or replace function public.registrar_terminal_pwa(
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

  if exists (
    select 1
    from public.terminales as terminal
    where terminal.caja_id = p_caja_id
      and terminal.estado <> 'revocada'::public.estado_terminal
  ) then
    raise exception 'Esta caja ya está vinculada a otra Terminal. Revoca la Terminal anterior antes de registrar una nueva.'
      using errcode = '23505';
  end if;

  v_token := encode(
    extensions.gen_random_bytes(32),
    'hex'
  );

  v_identificador :=
    'TPWA-' ||
    upper(
      substr(
        encode(
          extensions.gen_random_bytes(12),
          'hex'
        ),
        1,
        20
      )
    );

  begin
    insert into public.terminales (
      caja_id,
      identificador_publico,
      token_hash,
      nombre_dispositivo,
      version_app,
      estado,
      ultima_conexion_en
    )
    values (
      p_caja_id,
      v_identificador,
      encode(
        extensions.digest(
          convert_to(v_token, 'UTF8'),
          'sha256'
        ),
        'hex'
      ),
      v_nombre,
      nullif(btrim(p_version_app), ''),
      'activa',
      clock_timestamp()
    )
    returning id into v_terminal_id;

  exception
    when unique_violation then
      raise exception 'Esta caja ya está vinculada a otra Terminal. Revoca la Terminal anterior antes de registrar una nueva.'
        using errcode = '23505';
  end;

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

comment on index public.terminales_caja_no_revocada_unica is
  'Impide que una caja tenga más de una Terminal no revocada al mismo tiempo.';

comment on function public.registrar_terminal_pwa(uuid, text, text) is
  'Registra una Terminal PWA para una caja activa. Una caja solo puede mantener una Terminal no revocada.';

commit;