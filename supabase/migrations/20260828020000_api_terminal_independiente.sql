begin;

-- ============================================================================
-- CLUB REGALONES
-- API INDEPENDIENTE DE TERMINAL PWA
--
-- IMPORTANTE:
-- - No modifica la autenticación del Portal Comercio.
-- - No modifica la autenticación del vecino.
-- - No modifica la administración Regalones.
-- - La cuenta del comercio se usa solamente para registrar/configurar
--   físicamente la Terminal.
-- - Después, la Terminal se identifica con terminal_id + token_terminal.
-- ============================================================================


-- ============================================================================
-- 1. VALIDACIÓN INTERNA DE CREDENCIAL DE TERMINAL
-- ============================================================================

create function public.validar_credencial_terminal_interna(
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.terminales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := btrim(coalesce(p_token_terminal, ''));
  v_terminal public.terminales;
begin
  if p_terminal_id is null or char_length(v_token) < 32 then
    raise exception 'La credencial de la Terminal PWA no es válida'
      using errcode = '42501';
  end if;

  select terminal.*
  into v_terminal
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
    and terminal.token_hash = encode(
      extensions.digest(
        convert_to(v_token, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

  if not found then
    raise exception 'La Terminal no existe, fue revocada o su credencial no es válida'
      using errcode = '42501';
  end if;

  return v_terminal;
end;
$$;


-- ============================================================================
-- 2. CONTEXTO OFICIAL DE LA TERMINAL
--
-- Supabase resuelve:
-- Terminal -> Caja -> Sucursal -> Negocio
--
-- React NO decide a qué negocio pertenece una operación.
-- ============================================================================

create function public.terminal_obtener_contexto(
  p_terminal_id uuid,
  p_token_terminal text,
  p_version_app text default null
)
returns table (
  terminal_id uuid,
  identificador_publico text,
  nombre_dispositivo text,

  caja_id uuid,
  caja_nombre text,
  caja_codigo text,

  sucursal_id uuid,
  sucursal_nombre text,

  negocio_id uuid,
  negocio_nombre text,
  negocio_rut text,

  estado_terminal public.estado_terminal
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.terminales;
begin
  v_terminal := public.validar_credencial_terminal_interna(
    p_terminal_id,
    p_token_terminal
  );

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
    terminal.id,
    terminal.identificador_publico::text,
    terminal.nombre_dispositivo::text,

    caja.id,
    caja.nombre::text,
    caja.codigo::text,

    sucursal.id,
    sucursal.nombre::text,

    negocio.id,
    negocio.nombre::text,
    negocio.rut::text,

    terminal.estado
  from public.terminales as terminal
  join public.cajas as caja
    on caja.id = terminal.caja_id
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  join public.negocios as negocio
    on negocio.id = sucursal.negocio_id
  where terminal.id = v_terminal.id;
end;
$$;


-- ============================================================================
-- 3. INICIAR TURNO DESDE LA API DE TERMINAL
-- ============================================================================

create function public.terminal_iniciar_turno(
  p_terminal_id uuid,
  p_token_terminal text,
  p_nombre_cajero text
)
returns table (
  turno_id uuid,
  terminal_id uuid,
  caja_id uuid,
  negocio_id uuid,
  nombre_cajero text,
  estado public.estado_turno_caja,
  iniciado_en timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select *
  from public.iniciar_turno_terminal(
    p_terminal_id,
    p_token_terminal,
    p_nombre_cajero
  );
$$;


-- ============================================================================
-- 4. CONSULTAR TURNO ACTIVO
-- ============================================================================

create function public.terminal_consultar_turno(
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  turno_id uuid,
  terminal_id uuid,
  caja_id uuid,
  negocio_id uuid,
  nombre_cajero text,
  estado public.estado_turno_caja,
  iniciado_en timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select *
  from public.consultar_turno_terminal(
    p_terminal_id,
    p_token_terminal
  );
$$;


-- ============================================================================
-- 5. CERRAR TURNO
-- ============================================================================

create function public.terminal_cerrar_turno(
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.turnos_caja
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
begin
  select public.cerrar_turno_terminal(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  )
  into v_turno;

  return v_turno;
end;
$$;


-- ============================================================================
-- 6. LISTAR SOLICITUDES EXCLUSIVAMENTE DE LA CAJA DE ESTA TERMINAL
--
-- No recibe negocio_id.
-- No recibe caja_id.
--
-- Es Supabase quien resuelve la caja desde la credencial física.
-- ============================================================================

create function public.terminal_listar_solicitudes(
  p_terminal_id uuid,
  p_token_terminal text,
  p_turno_id uuid
)
returns setof public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.terminales;
  v_turno public.turnos_caja;
begin
  v_terminal := public.validar_credencial_terminal_interna(
    p_terminal_id,
    p_token_terminal
  );

  select turno.*
  into v_turno
  from public.turnos_caja as turno
  where turno.id = p_turno_id
    and turno.terminal_id = v_terminal.id
    and turno.caja_id = v_terminal.caja_id
    and turno.estado = 'abierto';

  if not found then
    raise exception 'Debes iniciar un turno válido para consultar las solicitudes'
      using errcode = '42501';
  end if;

  return query
  select solicitud.*
  from public.solicitudes_compra as solicitud
  where solicitud.caja_id = v_terminal.caja_id
    and solicitud.estado in (
      'esperando_monto',
      'esperando_cajero',
      'pendiente_validacion'
    )
    and solicitud.expira_en > clock_timestamp()
  order by solicitud.creado_en desc;
end;
$$;


-- ============================================================================
-- 7. PERMISOS
--
-- La función interna NO queda expuesta.
--
-- El rol anon solamente puede ejecutar la API limitada de Terminal.
-- Las tablas continúan protegidas por sus permisos/RLS existentes.
-- ============================================================================

revoke all on function public.validar_credencial_terminal_interna(
  uuid,
  text
) from public, anon, authenticated;


revoke all on function public.terminal_obtener_contexto(
  uuid,
  text,
  text
) from public, anon, authenticated;

revoke all on function public.terminal_iniciar_turno(
  uuid,
  text,
  text
) from public, anon, authenticated;

revoke all on function public.terminal_consultar_turno(
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.terminal_cerrar_turno(
  uuid,
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.terminal_listar_solicitudes(
  uuid,
  text,
  uuid
) from public, anon, authenticated;


grant execute on function public.terminal_obtener_contexto(
  uuid,
  text,
  text
) to anon, authenticated;

grant execute on function public.terminal_iniciar_turno(
  uuid,
  text,
  text
) to anon, authenticated;

grant execute on function public.terminal_consultar_turno(
  uuid,
  text
) to anon, authenticated;

grant execute on function public.terminal_cerrar_turno(
  uuid,
  uuid,
  text
) to anon, authenticated;

grant execute on function public.terminal_listar_solicitudes(
  uuid,
  text,
  uuid
) to anon, authenticated;


comment on function public.terminal_obtener_contexto(uuid, text, text) is
  'Obtiene la identidad oficial Negocio -> Sucursal -> Caja -> Terminal usando exclusivamente la credencial física de la Terminal PWA.';

comment on function public.terminal_listar_solicitudes(uuid, text, uuid) is
  'Lista exclusivamente las solicitudes abiertas de la caja vinculada físicamente a la Terminal y exige un turno activo.';


commit;