begin;

-- El lector móvil pertenece a un turno operativo, no a una sesión humana.
alter table public.sesiones_lector_movil
  add column turno_caja_id uuid
    references public.turnos_caja (id) on delete restrict;

alter table public.sesiones_lector_movil
  alter column creada_por drop not null;

create index sesiones_lector_movil_turno_idx
  on public.sesiones_lector_movil (turno_caja_id, estado)
  where turno_caja_id is not null;

comment on column public.sesiones_lector_movil.turno_caja_id is
  'Turno operativo dueño de la vinculación. La Terminal deriva caja y negocio desde este turno.';
comment on column public.sesiones_lector_movil.creada_por is
  'Usuario que creó una vinculación histórica desde Portal. Es null para Terminal PWA sin sesión humana.';

-- Una lectura consumida por Terminal se audita por el turno de su sesión.
alter table public.lecturas_llavero_terminal
  drop constraint lecturas_llavero_terminal_consumo_valido;

alter table public.lecturas_llavero_terminal
  add constraint lecturas_llavero_terminal_consumo_valido check (
    (
      estado = 'consumida'
      and consumida_en is not null
    )
    or (
      estado <> 'consumida'
      and consumida_en is null
      and consumida_por is null
    )
  );

create function public.validar_lectura_terminal_turno_interna(
  p_lectura_id uuid,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.lecturas_llavero_terminal
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_lectura public.lecturas_llavero_terminal;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  select lectura.*
  into v_lectura
  from public.lecturas_llavero_terminal as lectura
  join public.sesiones_lector_movil as sesion
    on sesion.id = lectura.sesion_id
  where lectura.id = p_lectura_id
    and lectura.terminal_id = v_turno.terminal_id
    and lectura.caja_id = v_turno.caja_id
    and sesion.turno_caja_id = v_turno.id
    and sesion.estado = 'vinculada'
  for update of lectura;

  if not found then
    raise exception 'La lectura no pertenece al lector de este turno'
      using errcode = '42501';
  end if;

  if v_lectura.estado <> 'pendiente'
    or v_lectura.expira_en <= clock_timestamp()
  then
    raise exception 'La lectura ya fue utilizada o expiró'
      using errcode = '55000';
  end if;

  return v_lectura;
end;
$$;

create function public.consumir_lectura_terminal_turno_interna(
  p_lectura_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lecturas_llavero_terminal
  set
    estado = 'consumida',
    consumida_en = clock_timestamp(),
    consumida_por = null
  where id = p_lectura_id
    and estado = 'pendiente';

  if not found then
    raise exception 'La lectura ya fue utilizada o expiró'
      using errcode = '55000';
  end if;
end;
$$;

create function public.terminal_crear_vinculacion_lector(
  p_turno_id uuid,
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
  v_turno public.turnos_caja;
  v_token text;
  v_ahora timestamptz := clock_timestamp();
  v_sesion_id uuid;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if p_nombre_lector is not null
    and char_length(btrim(p_nombre_lector)) not between 1 and 120
  then
    raise exception 'El nombre del lector no es válido'
      using errcode = '22023';
  end if;

  update public.sesiones_lector_movil as sesion
  set
    estado = 'reemplazada',
    token_vinculacion_hash = null,
    token_lector_hash = null,
    cerrada_en = v_ahora
  where sesion.terminal_id = v_turno.terminal_id
    and sesion.estado in ('pendiente_vinculacion', 'vinculada');

  update public.lecturas_llavero_terminal as lectura
  set estado = 'rechazada'
  where lectura.terminal_id = v_turno.terminal_id
    and lectura.estado = 'pendiente';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.sesiones_lector_movil (
    terminal_id,
    caja_id,
    creada_por,
    turno_caja_id,
    token_vinculacion_hash,
    nombre_lector,
    estado,
    expira_vinculacion_en,
    expira_en
  ) values (
    v_turno.terminal_id,
    v_turno.caja_id,
    null,
    v_turno.id,
    encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    ),
    nullif(btrim(p_nombre_lector), ''),
    'pendiente_vinculacion',
    v_ahora + interval '5 minutes',
    v_ahora + interval '16 hours'
  )
  returning id into v_sesion_id;

  update public.turnos_caja
  set ultima_actividad_en = v_ahora
  where id = v_turno.id;

  return query
  select
    v_sesion_id,
    v_turno.terminal_id,
    v_turno.caja_id,
    v_token,
    v_ahora + interval '5 minutes',
    v_ahora + interval '16 hours';
end;
$$;

create function public.terminal_listar_lecturas_lector(
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
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
  v_turno public.turnos_caja;
  v_ahora timestamptz := clock_timestamp();
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  update public.lecturas_llavero_terminal as lectura
  set estado = 'expirada'
  from public.sesiones_lector_movil as sesion
  where sesion.id = lectura.sesion_id
    and sesion.turno_caja_id = v_turno.id
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
  join public.sesiones_lector_movil as sesion
    on sesion.id = lectura.sesion_id
  join public.llaveros_nfc as llavero
    on llavero.id = lectura.llavero_id
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
  where sesion.turno_caja_id = v_turno.id
    and sesion.estado = 'vinculada'
    and lectura.terminal_id = v_turno.terminal_id
    and lectura.caja_id = v_turno.caja_id
    and lectura.estado = 'pendiente'
    and lectura.expira_en > v_ahora
  order by lectura.leido_en asc;
end;
$$;

create function public.terminal_reclamar_lectura_lector(
  p_lectura_id uuid,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  lectura_id uuid,
  caja_id uuid,
  llavero_id uuid,
  vecino_id uuid,
  codigo_publico text,
  nombre_vecino text,
  estado public.estado_llavero_nfc,
  entregado boolean,
  puede_activar boolean,
  tiene_pin boolean,
  negocio_id uuid,
  nombre_negocio text,
  disponibles integer,
  reservados integer,
  pendientes integer,
  canjeados integer,
  remanente_valor_clp numeric,
  saldo_actualizado_en timestamptz,
  expira_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_lectura public.lecturas_llavero_terminal;
  v_llavero public.llaveros_nfc;
  v_solicitud public.solicitudes_llavero;
  v_nombre_negocio text;
  v_expira_en timestamptz;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );
  v_lectura := public.validar_lectura_terminal_turno_interna(
    p_lectura_id,
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
    and perfil.estado = 'activo'
  where llavero.id = v_lectura.llavero_id;

  if not found or v_llavero.estado not in ('activo', 'sin_asignar') then
    raise exception 'El llavero ya no se encuentra disponible'
      using errcode = '23514';
  end if;

  if v_llavero.solicitud_id is not null then
    select solicitud.*
    into v_solicitud
    from public.solicitudes_llavero as solicitud
    where solicitud.id = v_llavero.solicitud_id;
  end if;

  if v_llavero.estado = 'sin_asignar'
    and coalesce(v_solicitud.estado::text, '') <> 'entregada'
  then
    raise exception 'El llavero todavía no figura como entregado'
      using errcode = '23514';
  end if;

  select negocio.nombre
  into v_nombre_negocio
  from public.negocios as negocio
  where negocio.id = v_turno.negocio_id;

  v_expira_en := least(
    v_lectura.leido_en + interval '6 minutes',
    clock_timestamp() + interval '5 minutes'
  );

  update public.lecturas_llavero_terminal
  set
    reclamada_en = coalesce(reclamada_en, clock_timestamp()),
    reclamada_por = null,
    expira_en = v_expira_en
  where id = v_lectura.id;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  return query
  select
    v_lectura.id,
    v_turno.caja_id,
    v_llavero.id,
    v_llavero.vecino_id,
    v_llavero.codigo_publico::text,
    concat_ws(' ', perfil.nombre, perfil.apellido)::text,
    v_llavero.estado,
    coalesce(v_solicitud.estado = 'entregada', false),
    v_llavero.estado = 'sin_asignar'
      and coalesce(v_solicitud.estado = 'entregada', false),
    v_llavero.pin_activacion_hash is not null,
    v_turno.negocio_id,
    v_nombre_negocio,
    coalesce(saldo.disponibles, 0),
    coalesce(saldo.reservados, 0),
    coalesce(saldo.pendientes, 0),
    coalesce(saldo.canjeados, 0),
    coalesce(saldo.remanente_valor_clp, 0),
    coalesce(saldo.actualizado_en, clock_timestamp()),
    v_expira_en
  from public.perfiles as perfil
  left join public.saldos_regis as saldo
    on saldo.vecino_id = v_llavero.vecino_id
    and saldo.negocio_id = v_turno.negocio_id
  where perfil.id = v_llavero.vecino_id;
end;
$$;

create function public.terminal_activar_llavero_desde_lectura(
  p_lectura_id uuid,
  p_metodo public.metodo_verificacion_llavero,
  p_pin text,
  p_identidad_verificada boolean,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  activado boolean,
  mensaje text,
  codigo_publico text,
  estado public.estado_llavero_nfc,
  activado_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_lectura public.lecturas_llavero_terminal;
  v_llavero public.llaveros_nfc;
  v_llavero_anterior public.llaveros_nfc;
  v_solicitud public.solicitudes_llavero;
  v_pin text := btrim(coalesce(p_pin, ''));
  v_intentos smallint;
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.lecturas_llavero_terminal as lectura
    on lectura.llavero_id = llavero.id
  join public.sesiones_lector_movil as sesion
    on sesion.id = lectura.sesion_id
  where lectura.id = p_lectura_id
    and sesion.turno_caja_id = v_turno.id;

  if found and v_llavero.estado = 'activo' then
    return query select
      true,
      'El llavero ya estaba activo'::text,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en;
    return;
  end if;

  v_lectura := public.validar_lectura_terminal_turno_interna(
    p_lectura_id,
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if p_metodo is null then
    raise exception 'Debes indicar un método de verificación'
      using errcode = '22023';
  end if;

  if p_metodo = 'sms' then
    raise exception 'La verificación por SMS todavía no está habilitada'
      using errcode = '0A000';
  end if;

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  where llavero.id = v_lectura.llavero_id
  for update;

  if v_llavero.estado <> 'sin_asignar' then
    raise exception 'El estado del llavero no permite activarlo'
      using errcode = '23514';
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_llavero as solicitud
  where solicitud.id = v_llavero.solicitud_id
  for update;

  if not found or v_solicitud.estado <> 'entregada' then
    raise exception 'El llavero todavía no figura como entregado'
      using errcode = '23514';
  end if;

  if p_metodo = 'cedula' and not p_identidad_verificada then
    raise exception 'Debes confirmar la revisión presencial de la cédula'
      using errcode = '23514';
  end if;

  if p_metodo = 'pin' then
    if v_llavero.pin_activacion_hash is null then
      raise exception 'Este llavero no tiene un PIN configurado'
        using errcode = '23514';
    end if;

    if v_llavero.pin_bloqueado_hasta is not null
      and v_llavero.pin_bloqueado_hasta > clock_timestamp()
    then
      raise exception 'El PIN está bloqueado temporalmente por intentos fallidos'
        using errcode = '23514';
    end if;

    if v_pin !~ '^[0-9]{4,6}$'
      or extensions.crypt(v_pin, v_llavero.pin_activacion_hash)
        <> v_llavero.pin_activacion_hash
    then
      v_intentos := least(v_llavero.intentos_pin_fallidos + 1, 3);

      update public.llaveros_nfc
      set
        intentos_pin_fallidos = v_intentos,
        pin_bloqueado_hasta = case
          when v_intentos >= 3
            then clock_timestamp() + interval '15 minutes'
          else null
        end
      where id = v_llavero.id
      returning * into v_llavero;

      perform public.consumir_lectura_terminal_turno_interna(v_lectura.id);

      return query select
        false,
        case
          when v_intentos >= 3
            then 'PIN incorrecto. El llavero quedó bloqueado por 15 minutos.'
          else 'El PIN no es correcto.'
        end::text,
        v_llavero.codigo_publico::text,
        v_llavero.estado,
        v_llavero.activado_en;
      return;
    end if;
  end if;

  select llavero.*
  into v_llavero_anterior
  from public.llaveros_nfc as llavero
  where llavero.vecino_id = v_llavero.vecino_id
    and llavero.id <> v_llavero.id
    and llavero.reemplazado_por_id is null
    and llavero.estado in ('activo', 'bloqueado', 'perdido')
  order by coalesce(
    llavero.activado_en,
    llavero.asignado_en,
    llavero.creado_en
  ) desc
  limit 1
  for update;

  if v_llavero_anterior.id is not null then
    update public.llaveros_nfc as anterior
    set
      estado = case
        when anterior.estado = 'activo'
          then 'reemplazado'::public.estado_llavero_nfc
        else anterior.estado
      end,
      bloqueado_en = coalesce(anterior.bloqueado_en, clock_timestamp()),
      reemplazado_por_id = v_llavero.id
    where anterior.id = v_llavero_anterior.id;
  end if;

  update public.llaveros_nfc
  set
    estado = 'activo',
    asignado_en = clock_timestamp(),
    asignado_por = null,
    activado_en = clock_timestamp(),
    activado_por = null,
    caja_activacion_id = v_turno.caja_id,
    turno_caja_activacion_id = v_turno.id,
    metodo_verificacion_activacion = p_metodo,
    intentos_pin_fallidos = 0,
    pin_bloqueado_hasta = null,
    lectura_activacion_id = v_lectura.id
  where id = v_llavero.id
  returning * into v_llavero;

  perform public.consumir_lectura_terminal_turno_interna(v_lectura.id);

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  return query select
    true,
    'Llavero activado correctamente'::text,
    v_llavero.codigo_publico::text,
    v_llavero.estado,
    v_llavero.activado_en;
end;
$$;

create function public.terminal_crear_compra_desde_lectura(
  p_lectura_id uuid,
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
  v_lectura public.lecturas_llavero_terminal;
  v_llavero public.llaveros_nfc;
  v_solicitud public.solicitudes_compra;
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser un número entero mayor que cero'
      using errcode = '22003';
  end if;

  if char_length(v_idempotency_key) < 8
    or char_length(v_idempotency_key) > 200
  then
    raise exception 'idempotency_key debe tener entre 8 y 200 caracteres'
      using errcode = '22023';
  end if;

  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.idempotency_key = v_idempotency_key;

  if found then
    if v_solicitud.caja_id is distinct from v_turno.caja_id
      or v_solicitud.turno_caja_id is distinct from v_turno.id
      or v_solicitud.lectura_terminal_id is distinct from p_lectura_id
      or v_solicitud.monto_informado is distinct from p_monto
    then
      raise exception 'idempotency_key ya está en uso'
        using errcode = '23505';
    end if;
    return v_solicitud;
  end if;

  v_lectura := public.validar_lectura_terminal_turno_interna(
    p_lectura_id,
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
    and perfil.estado = 'activo'
  where llavero.id = v_lectura.llavero_id
    and llavero.estado = 'activo'
  for share of llavero;

  if not found then
    raise exception 'El llavero no está activo o su cuenta está inactiva'
      using errcode = 'P0002';
  end if;

  update public.solicitudes_compra
  set estado = 'vencida'
  where llavero_id = v_llavero.id
    and estado in ('esperando_monto', 'esperando_cajero', 'pendiente_validacion')
    and expira_en <= clock_timestamp();

  if exists (
    select 1
    from public.solicitudes_compra
    where llavero_id = v_llavero.id
      and estado in ('esperando_monto', 'esperando_cajero', 'pendiente_validacion')
  ) then
    raise exception 'Ya existe una compra asistida pendiente para este llavero'
      using errcode = '23505';
  end if;

  insert into public.solicitudes_compra (
    vecino_id,
    caja_id,
    llavero_id,
    lectura_terminal_id,
    monto_informado,
    informado_por,
    estado,
    expira_en,
    idempotency_key,
    turno_caja_id
  ) values (
    v_llavero.vecino_id,
    v_turno.caja_id,
    v_llavero.id,
    v_lectura.id,
    p_monto,
    'cajero',
    'pendiente_validacion',
    clock_timestamp() + interval '15 minutes',
    v_idempotency_key,
    v_turno.id
  )
  returning * into v_solicitud;

  perform public.consumir_lectura_terminal_turno_interna(v_lectura.id);

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  return v_solicitud;
end;
$$;

create function public.terminal_reservar_canje_desde_lectura(
  p_lectura_id uuid,
  p_beneficio_version_id uuid,
  p_idempotency_key text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  canje_id uuid,
  codigo_publico text,
  estado public.estado_canje_regis,
  expira_en timestamptz,
  costo_regis integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_lectura public.lecturas_llavero_terminal;
  v_llavero public.llaveros_nfc;
  v_canje public.canjes_regis;
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
begin
  if char_length(v_idempotency_key) < 8
    or char_length(v_idempotency_key) > 200
  then
    raise exception 'La clave idempotente no es válida'
      using errcode = '22023';
  end if;

  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  select canje.*
  into v_canje
  from public.canjes_regis as canje
  where canje.idempotency_key = v_idempotency_key;

  if found then
    if v_canje.caja_id is distinct from v_turno.caja_id
      or v_canje.turno_caja_id is distinct from v_turno.id
      or v_canje.lectura_terminal_id is distinct from p_lectura_id
      or v_canje.beneficio_version_id is distinct from p_beneficio_version_id
    then
      raise exception 'idempotency_key ya está en uso'
        using errcode = '23505';
    end if;

    return query select
      v_canje.id,
      v_canje.codigo_publico::text,
      v_canje.estado,
      v_canje.expira_en,
      v_canje.costo_regis;
    return;
  end if;

  if not exists (
    select 1
    from public.versiones_beneficio_regis as version
    join public.beneficios_regis as beneficio
      on beneficio.id = version.beneficio_id
    where version.id = p_beneficio_version_id
      and beneficio.negocio_id = v_turno.negocio_id
  ) then
    raise exception 'El beneficio no pertenece al negocio de la Terminal'
      using errcode = '42501';
  end if;

  v_lectura := public.validar_lectura_terminal_turno_interna(
    p_lectura_id,
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
    and perfil.estado = 'activo'
  where llavero.id = v_lectura.llavero_id
    and llavero.estado = 'activo'
  for share of llavero;

  if not found then
    raise exception 'El llavero no está activo o su cuenta está inactiva'
      using errcode = 'P0002';
  end if;

  v_canje := public.crear_reserva_canje_regis_interna(
    v_llavero.vecino_id,
    p_beneficio_version_id,
    'llavero',
    null,
    v_turno.caja_id,
    v_llavero.id,
    v_idempotency_key
  );

  update public.canjes_regis
  set
    lectura_terminal_id = v_lectura.id,
    turno_caja_id = v_turno.id
  where id = v_canje.id
  returning * into v_canje;

  perform public.consumir_lectura_terminal_turno_interna(v_lectura.id);

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  return query select
    v_canje.id,
    v_canje.codigo_publico::text,
    v_canje.estado,
    v_canje.expira_en,
    v_canje.costo_regis;
end;
$$;

create function public.terminal_cerrar_lector(
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_ahora timestamptz := clock_timestamp();
begin
  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  update public.sesiones_lector_movil
  set
    estado = 'cerrada',
    token_vinculacion_hash = null,
    token_lector_hash = null,
    cerrada_en = v_ahora
  where turno_caja_id = v_turno.id
    and terminal_id = v_turno.terminal_id
    and estado in ('pendiente_vinculacion', 'vinculada');

  update public.lecturas_llavero_terminal as lectura
  set estado = 'rechazada'
  from public.sesiones_lector_movil as sesion
  where sesion.id = lectura.sesion_id
    and sesion.turno_caja_id = v_turno.id
    and lectura.estado = 'pendiente';
end;
$$;

create function public.cerrar_lector_al_cerrar_turno()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = 'abierto' and new.estado = 'cerrado' then
    update public.sesiones_lector_movil
    set
      estado = 'cerrada',
      token_vinculacion_hash = null,
      token_lector_hash = null,
      cerrada_en = coalesce(cerrada_en, clock_timestamp())
    where turno_caja_id = new.id
      and estado in ('pendiente_vinculacion', 'vinculada');

    update public.lecturas_llavero_terminal as lectura
    set estado = 'rechazada'
    from public.sesiones_lector_movil as sesion
    where sesion.id = lectura.sesion_id
      and sesion.turno_caja_id = new.id
      and lectura.estado = 'pendiente';
  end if;

  return new;
end;
$$;

create trigger turnos_caja_cerrar_lector
after update of estado on public.turnos_caja
for each row
execute function public.cerrar_lector_al_cerrar_turno();

revoke all on function public.validar_lectura_terminal_turno_interna(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.consumir_lectura_terminal_turno_interna(uuid)
  from public, anon, authenticated;
revoke all on function public.terminal_crear_vinculacion_lector(
  uuid, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.terminal_listar_lecturas_lector(
  uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.terminal_reclamar_lectura_lector(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.terminal_activar_llavero_desde_lectura(
  uuid, public.metodo_verificacion_llavero, text, boolean, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.terminal_crear_compra_desde_lectura(
  uuid, integer, text, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.terminal_reservar_canje_desde_lectura(
  uuid, uuid, text, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.terminal_cerrar_lector(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.terminal_crear_vinculacion_lector(
  uuid, uuid, text, text
) to anon, authenticated;
grant execute on function public.terminal_listar_lecturas_lector(
  uuid, uuid, text
) to anon, authenticated;
grant execute on function public.terminal_reclamar_lectura_lector(
  uuid, uuid, uuid, text
) to anon, authenticated;
grant execute on function public.terminal_activar_llavero_desde_lectura(
  uuid, public.metodo_verificacion_llavero, text, boolean, uuid, uuid, text
) to anon, authenticated;
grant execute on function public.terminal_crear_compra_desde_lectura(
  uuid, integer, text, uuid, uuid, text
) to anon, authenticated;
grant execute on function public.terminal_reservar_canje_desde_lectura(
  uuid, uuid, text, uuid, uuid, text
) to anon, authenticated;
grant execute on function public.terminal_cerrar_lector(uuid, uuid, text)
  to anon, authenticated;

comment on function public.terminal_crear_vinculacion_lector(
  uuid, uuid, text, text
) is 'Vincula un celular lector exclusivamente al turno activo de una Terminal PWA.';
comment on function public.terminal_cerrar_lector(uuid, uuid, text) is
  'Cierra el lector del turno sin depender de Supabase Auth humano.';

commit;
