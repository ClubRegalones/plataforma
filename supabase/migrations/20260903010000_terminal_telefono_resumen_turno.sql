begin;

-- ============================================================================
-- CLUB REGALONES
-- VENTA MANUAL POR TELEFONO + RESUMEN REAL DEL TURNO
-- ============================================================================


-- ============================================================================
-- 1. INDICE PARA BUSQUEDA EXACTA POR TELEFONO
-- ============================================================================

create index if not exists perfiles_telefono_activo_idx
  on public.perfiles (telefono)
  where telefono is not null
    and estado = 'activo';


-- ============================================================================
-- 2. BUSCAR VECINO POR TELEFONO
--
-- No acepta búsquedas parciales.
-- La Terminal debe enviar un teléfono E.164 completo, por ejemplo:
-- +56912345678
--
-- Si existen dos perfiles activos con el mismo teléfono se bloquea la
-- operación para no asociar una venta al vecino incorrecto.
-- ============================================================================

create function public.terminal_buscar_vecino_por_telefono(
  p_telefono text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  vecino_id uuid,
  nombre_vecino text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_telefono text := btrim(coalesce(p_telefono, ''));
  v_coincidencias integer;
begin
  perform public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if v_telefono !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Ingresa un número de teléfono válido'
      using errcode = '22023';
  end if;

  select count(*)
  into v_coincidencias
  from public.perfiles as perfil
  where perfil.telefono = v_telefono
    and perfil.estado = 'activo';

  if v_coincidencias = 0 then
    raise exception 'No encontramos un Vecino Regalón con ese teléfono'
      using errcode = 'P0002';
  end if;

  if v_coincidencias > 1 then
    raise exception 'Hay más de una cuenta asociada a este teléfono'
      using errcode = '23505';
  end if;

  return query
  select
    perfil.id,
    concat_ws(
      ' ',
      perfil.nombre,
      perfil.apellido
    )::text
  from public.perfiles as perfil
  where perfil.telefono = v_telefono
    and perfil.estado = 'activo'
  limit 1;
end;
$$;


-- ============================================================================
-- 3. CREAR SOLICITUD DE COMPRA MANUAL POR TELEFONO
--
-- React NO envía vecino_id.
-- El backend vuelve a resolver el teléfono exacto y deriva caja/negocio
-- desde el turno validado.
-- ============================================================================

create function public.terminal_crear_solicitud_compra_por_telefono(
  p_telefono text,
  p_monto integer,
  p_idempotency_key text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_telefono text := btrim(coalesce(p_telefono, ''));
  v_idempotency_key text :=
    btrim(coalesce(p_idempotency_key, ''));
  v_vecino_id uuid;
  v_coincidencias integer;
  v_solicitud public.solicitudes_compra;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if v_telefono !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Ingresa un número de teléfono válido'
      using errcode = '22023';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor que cero'
      using errcode = '22023';
  end if;

  if char_length(v_idempotency_key) not between 8 and 200 then
    raise exception 'La clave de idempotencia no es válida'
      using errcode = '22023';
  end if;

  select count(*)
  into v_coincidencias
  from public.perfiles as perfil
  where perfil.telefono = v_telefono
    and perfil.estado = 'activo';

  if v_coincidencias = 0 then
    raise exception 'No encontramos un Vecino Regalón con ese teléfono'
      using errcode = 'P0002';
  end if;

  if v_coincidencias > 1 then
    raise exception 'Hay más de una cuenta asociada a este teléfono'
      using errcode = '23505';
  end if;

  select perfil.id
  into v_vecino_id
  from public.perfiles as perfil
  where perfil.telefono = v_telefono
    and perfil.estado = 'activo'
  limit 1;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.idempotency_key = v_idempotency_key;

  if found then
    if
      v_solicitud.vecino_id <> v_vecino_id
      or v_solicitud.caja_id <> v_turno.caja_id
      or v_solicitud.monto_informado is distinct from p_monto
    then
      raise exception 'La clave de idempotencia ya fue utilizada para otra operación'
        using errcode = '23505';
    end if;

    return v_solicitud;
  end if;

  insert into public.solicitudes_compra (
    vecino_id,
    caja_id,
    monto_informado,
    informado_por,
    estado,
    expira_en,
    idempotency_key,
    turno_caja_id
  )
  values (
    v_vecino_id,
    v_turno.caja_id,
    p_monto,
    'cajero',
    'pendiente_validacion',
    clock_timestamp() + interval '15 minutes',
    v_idempotency_key,
    v_turno.id
  )
  returning *
  into v_solicitud;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  return v_solicitud;
end;
$$;


-- ============================================================================
-- 4. RESUMEN REAL DEL TURNO
-- ============================================================================

create function public.terminal_resumen_turno(
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  ventas_realizadas bigint,
  regis_acumulados bigint,
  canjes_realizados bigint,
  iniciado_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  return query
  select
    (
      select count(*)
      from public.compras as compra
      where compra.turno_caja_id = v_turno.id
        and compra.estado <> 'revertida'
    )::bigint,

    (
      select
        coalesce(
          sum(movimiento.cantidad),
          0
        )
      from public.movimientos_regis as movimiento
      join public.compras as compra
        on compra.id = movimiento.compra_id
      where compra.turno_caja_id = v_turno.id
        and compra.estado <> 'revertida'
        and movimiento.tipo = 'acreditacion_compra'
        and movimiento.estado <> 'revertido'
        and movimiento.cantidad > 0
    )::bigint,

    (
      select count(*)
      from public.canjes_regis as canje
      where canje.turno_caja_id = v_turno.id
        and canje.estado = 'confirmado'
    )::bigint,

    v_turno.iniciado_en;
end;
$$;


-- ============================================================================
-- 5. PERMISOS
--
-- Son RPC estrechas protegidas por credencial de Terminal.
-- No se concede acceso directo a perfiles ni al ledger.
-- ============================================================================

revoke all on function public.terminal_buscar_vecino_por_telefono(
  text,
  uuid,
  uuid,
  text
)
from public, anon, authenticated;

revoke all on function public.terminal_crear_solicitud_compra_por_telefono(
  text,
  integer,
  text,
  uuid,
  uuid,
  text
)
from public, anon, authenticated;

revoke all on function public.terminal_resumen_turno(
  uuid,
  uuid,
  text
)
from public, anon, authenticated;


grant execute on function public.terminal_buscar_vecino_por_telefono(
  text,
  uuid,
  uuid,
  text
)
to anon, authenticated;

grant execute on function public.terminal_crear_solicitud_compra_por_telefono(
  text,
  integer,
  text,
  uuid,
  uuid,
  text
)
to anon, authenticated;

grant execute on function public.terminal_resumen_turno(
  uuid,
  uuid,
  text
)
to anon, authenticated;


comment on function public.terminal_buscar_vecino_por_telefono(
  text,
  uuid,
  uuid,
  text
) is
  'Busca exactamente un Vecino Regalón activo por teléfono después de validar turno y credencial de Terminal.';

comment on function public.terminal_crear_solicitud_compra_por_telefono(
  text,
  integer,
  text,
  uuid,
  uuid,
  text
) is
  'Crea una solicitud asistida para venta manual resolviendo al vecino por teléfono dentro de una Terminal y turno válidos.';

comment on function public.terminal_resumen_turno(
  uuid,
  uuid,
  text
) is
  'Devuelve ventas, REGIS acreditados, canjes confirmados y hora de inicio del turno validado.';

commit;