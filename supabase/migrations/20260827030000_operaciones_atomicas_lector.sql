begin;

alter table public.lecturas_llavero_terminal
  add column reclamada_en timestamptz,
  add column reclamada_por uuid references auth.users (id) on delete set null;

alter table public.lecturas_llavero_terminal
  drop constraint lecturas_llavero_terminal_vigencia_valida,
  add constraint lecturas_llavero_terminal_vigencia_valida check (
    expira_en > leido_en
    and expira_en <= leido_en + interval '6 minutes'
  );

alter table public.solicitudes_compra
  add column lectura_terminal_id uuid unique
    references public.lecturas_llavero_terminal (id) on delete restrict;

alter table public.llaveros_nfc
  add column lectura_activacion_id uuid unique
    references public.lecturas_llavero_terminal (id) on delete restrict;

alter table public.canjes_regis
  add column lectura_terminal_id uuid unique
    references public.lecturas_llavero_terminal (id) on delete restrict;

create function public.validar_terminal_operacion_interna(
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
    and terminal.estado = 'activa'
    and terminal.token_hash = encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    );

  if v_terminal.id is null
    or not public.es_operador_terminal(v_terminal.id)
  then
    raise exception 'La terminal no existe, fue revocada o no pertenece al comercio'
      using errcode = '42501';
  end if;

  update public.terminales
  set ultima_conexion_en = clock_timestamp()
  where id = v_terminal.id;

  return v_terminal;
end;
$$;

create function public.obtener_lectura_operacion_interna(
  p_lectura_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns public.lecturas_llavero_terminal
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.terminales;
  v_lectura public.lecturas_llavero_terminal;
begin
  v_terminal := public.validar_terminal_operacion_interna(
    p_terminal_id,
    p_token_terminal
  );

  select lectura.*
  into v_lectura
  from public.lecturas_llavero_terminal as lectura
  where lectura.id = p_lectura_id
    and lectura.terminal_id = v_terminal.id
    and lectura.caja_id = v_terminal.caja_id
  for update;

  if v_lectura.id is null then
    raise exception 'La lectura no pertenece a esta Terminal PWA'
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

create function public.consumir_lectura_operacion_interna(p_lectura_id uuid)
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
    consumida_por = (select auth.uid())
  where id = p_lectura_id
    and estado = 'pendiente';

  if not found then
    raise exception 'La lectura ya fue utilizada o expiró'
      using errcode = '55000';
  end if;
end;
$$;

create or replace function public.registrar_lectura_llavero_terminal(
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
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
    and perfil.estado = 'activo'
  left join public.solicitudes_llavero as solicitud
    on solicitud.id = llavero.solicitud_id
  where llavero.token_hash = v_hash_llavero
    and (
      llavero.estado = 'activo'
      or (
        llavero.estado = 'sin_asignar'
        and solicitud.estado = 'entregada'
      )
    );

  if v_llavero.id is null then
    raise exception 'No encontramos un llavero utilizable asociado a ese identificador'
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

create function public.reclamar_lectura_llavero_terminal(
  p_lectura_id uuid,
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
  v_lectura public.lecturas_llavero_terminal;
  v_llavero public.llaveros_nfc;
  v_solicitud public.solicitudes_llavero;
  v_negocio_id uuid;
  v_nombre_negocio text;
  v_expira_en timestamptz;
begin
  v_lectura := public.obtener_lectura_operacion_interna(
    p_lectura_id,
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

  if v_llavero.id is null
    or v_llavero.estado not in ('activo', 'sin_asignar')
  then
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

  select negocio.id, negocio.nombre
  into v_negocio_id, v_nombre_negocio
  from public.cajas as caja
  join public.sucursales as sucursal on sucursal.id = caja.sucursal_id
  join public.negocios as negocio on negocio.id = sucursal.negocio_id
  where caja.id = v_lectura.caja_id;

  v_expira_en := least(
    v_lectura.leido_en + interval '6 minutes',
    clock_timestamp() + interval '5 minutes'
  );

  update public.lecturas_llavero_terminal
  set
    reclamada_en = coalesce(reclamada_en, clock_timestamp()),
    reclamada_por = coalesce(reclamada_por, (select auth.uid())),
    expira_en = v_expira_en
  where id = v_lectura.id;

  return query
  select
    v_lectura.id,
    v_lectura.caja_id,
    v_llavero.id,
    v_llavero.vecino_id,
    v_llavero.codigo_publico::text,
    concat_ws(' ', perfil.nombre, perfil.apellido)::text,
    v_llavero.estado,
    coalesce(v_solicitud.estado = 'entregada', false),
    v_llavero.estado = 'sin_asignar'
      and coalesce(v_solicitud.estado = 'entregada', false),
    v_llavero.pin_activacion_hash is not null,
    v_negocio_id,
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
    and saldo.negocio_id = v_negocio_id
  where perfil.id = v_llavero.vecino_id;
end;
$$;

create function public.activar_llavero_desde_lectura(
  p_lectura_id uuid,
  p_terminal_id uuid,
  p_token_terminal text,
  p_metodo public.metodo_verificacion_llavero,
  p_pin text default null,
  p_identidad_verificada boolean default false
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
  v_operador_id uuid := (select auth.uid());
  v_terminal public.terminales;
  v_lectura public.lecturas_llavero_terminal;
  v_llavero public.llaveros_nfc;
  v_llavero_anterior public.llaveros_nfc;
  v_solicitud public.solicitudes_llavero;
  v_pin text := btrim(coalesce(p_pin, ''));
  v_intentos smallint;
begin
  v_terminal := public.validar_terminal_operacion_interna(
    p_terminal_id,
    p_token_terminal
  );

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.lecturas_llavero_terminal as lectura
    on lectura.id = llavero.lectura_activacion_id
  where lectura.id = p_lectura_id
    and lectura.terminal_id = v_terminal.id
    and lectura.caja_id = v_terminal.caja_id;

  if v_llavero.id is not null and v_llavero.estado = 'activo' then
    return query
    select
      true,
      'El llavero ya estaba activo'::text,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en;
    return;
  end if;

  v_lectura := public.obtener_lectura_operacion_interna(
    p_lectura_id,
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

  if v_llavero.estado = 'activo' then
    perform public.consumir_lectura_operacion_interna(v_lectura.id);
    return query
    select
      true,
      'El llavero ya estaba activo'::text,
      v_llavero.codigo_publico::text,
      v_llavero.estado,
      v_llavero.activado_en;
    return;
  end if;

  if v_llavero.estado <> 'sin_asignar' then
    raise exception 'El estado del llavero no permite activarlo'
      using errcode = '23514';
  end if;

  select solicitud.*
  into v_solicitud
  from public.solicitudes_llavero as solicitud
  where solicitud.id = v_llavero.solicitud_id
  for update;

  if v_solicitud.id is null or v_solicitud.estado <> 'entregada' then
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
      and v_llavero.pin_bloqueado_hasta > now()
    then
      raise exception 'El PIN está bloqueado temporalmente por intentos fallidos'
        using errcode = '23514';
    end if;

    if v_pin !~ '^[0-9]{4,6}$'
      or extensions.crypt(v_pin, v_llavero.pin_activacion_hash)
        <> v_llavero.pin_activacion_hash
    then
      v_intentos := least(v_llavero.intentos_pin_fallidos + 1, 3);

      update public.llaveros_nfc as llavero_fallido
      set
        intentos_pin_fallidos = v_intentos,
        pin_bloqueado_hasta = case
          when v_intentos >= 3 then now() + interval '15 minutes'
          else null
        end
      where llavero_fallido.id = v_llavero.id
      returning * into v_llavero;

      perform public.consumir_lectura_operacion_interna(v_lectura.id);

      return query
      select
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
      bloqueado_en = coalesce(anterior.bloqueado_en, now()),
      reemplazado_por_id = v_llavero.id
    where anterior.id = v_llavero_anterior.id;
  end if;

  update public.llaveros_nfc as objetivo
  set
    estado = 'activo',
    asignado_en = now(),
    asignado_por = v_operador_id,
    activado_en = now(),
    activado_por = v_operador_id,
    caja_activacion_id = v_lectura.caja_id,
    metodo_verificacion_activacion = p_metodo,
    intentos_pin_fallidos = 0,
    pin_bloqueado_hasta = null,
    lectura_activacion_id = v_lectura.id
  where objetivo.id = v_llavero.id
  returning * into v_llavero;

  perform public.consumir_lectura_operacion_interna(v_lectura.id);

  return query
  select
    true,
    'Llavero activado correctamente'::text,
    v_llavero.codigo_publico::text,
    v_llavero.estado,
    v_llavero.activado_en;
end;
$$;

create function public.crear_solicitud_compra_desde_lectura(
  p_lectura_id uuid,
  p_terminal_id uuid,
  p_token_terminal text,
  p_monto integer,
  p_idempotency_key text
)
returns public.solicitudes_compra
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.terminales;
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

  v_terminal := public.validar_terminal_operacion_interna(
    p_terminal_id,
    p_token_terminal
  );

  select solicitud.*
  into v_solicitud
  from public.solicitudes_compra as solicitud
  where solicitud.idempotency_key = v_idempotency_key;

  if v_solicitud.id is not null then
    if v_solicitud.caja_id is distinct from v_terminal.caja_id
      or v_solicitud.lectura_terminal_id is distinct from p_lectura_id
      or v_solicitud.monto_informado is distinct from p_monto
    then
      raise exception 'idempotency_key ya está en uso'
        using errcode = '23505';
    end if;

    return v_solicitud;
  end if;

  v_lectura := public.obtener_lectura_operacion_interna(
    p_lectura_id,
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

  if v_llavero.id is null then
    raise exception 'El llavero no está activo o su cuenta está inactiva'
      using errcode = 'P0002';
  end if;

  update public.solicitudes_compra as solicitud_vencida
  set estado = 'vencida'
  where solicitud_vencida.llavero_id = v_llavero.id
    and solicitud_vencida.estado in (
      'esperando_monto',
      'esperando_cajero',
      'pendiente_validacion'
    )
    and solicitud_vencida.expira_en <= now();

  if exists (
    select 1
    from public.solicitudes_compra as solicitud
    where solicitud.llavero_id = v_llavero.id
      and solicitud.estado in (
        'esperando_monto',
        'esperando_cajero',
        'pendiente_validacion'
      )
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
    idempotency_key
  ) values (
    v_llavero.vecino_id,
    v_lectura.caja_id,
    v_llavero.id,
    v_lectura.id,
    p_monto,
    'cajero',
    'pendiente_validacion',
    now() + interval '15 minutes',
    v_idempotency_key
  )
  returning * into v_solicitud;

  perform public.consumir_lectura_operacion_interna(v_lectura.id);

  return v_solicitud;
end;
$$;

create function public.reservar_canje_regis_desde_lectura(
  p_lectura_id uuid,
  p_terminal_id uuid,
  p_token_terminal text,
  p_beneficio_version_id uuid,
  p_idempotency_key text
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
  v_terminal public.terminales;
  v_lectura public.lecturas_llavero_terminal;
  v_llavero public.llaveros_nfc;
  v_negocio_id uuid;
  v_canje public.canjes_regis;
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
begin
  if char_length(v_idempotency_key) < 8
    or char_length(v_idempotency_key) > 200
  then
    raise exception 'La clave idempotente no es válida'
      using errcode = '22023';
  end if;

  v_terminal := public.validar_terminal_operacion_interna(
    p_terminal_id,
    p_token_terminal
  );

  select canje.*
  into v_canje
  from public.canjes_regis as canje
  where canje.idempotency_key = v_idempotency_key;

  if v_canje.id is not null then
    if v_canje.caja_id is distinct from v_terminal.caja_id
      or v_canje.lectura_terminal_id is distinct from p_lectura_id
      or v_canje.beneficio_version_id is distinct from p_beneficio_version_id
    then
      raise exception 'idempotency_key ya está en uso'
        using errcode = '23505';
    end if;

    return query
    select
      v_canje.id,
      v_canje.codigo_publico::text,
      v_canje.estado,
      v_canje.expira_en,
      v_canje.costo_regis;
    return;
  end if;

  v_lectura := public.obtener_lectura_operacion_interna(
    p_lectura_id,
    p_terminal_id,
    p_token_terminal
  );

  select sucursal.negocio_id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal on sucursal.id = caja.sucursal_id
  where caja.id = v_lectura.caja_id;

  if not exists (
    select 1
    from public.versiones_beneficio_regis as version
    join public.beneficios_regis as beneficio
      on beneficio.id = version.beneficio_id
    where version.id = p_beneficio_version_id
      and beneficio.negocio_id = v_negocio_id
  ) then
    raise exception 'El beneficio no pertenece al negocio de la caja'
      using errcode = '42501';
  end if;

  select llavero.*
  into v_llavero
  from public.llaveros_nfc as llavero
  join public.perfiles as perfil
    on perfil.id = llavero.vecino_id
    and perfil.estado = 'activo'
  where llavero.id = v_lectura.llavero_id
    and llavero.estado = 'activo'
  for share of llavero;

  if v_llavero.id is null then
    raise exception 'El llavero no está activo o su cuenta está inactiva'
      using errcode = 'P0002';
  end if;

  v_canje := public.crear_reserva_canje_regis_interna(
    v_llavero.vecino_id,
    p_beneficio_version_id,
    'llavero',
    null,
    v_lectura.caja_id,
    v_llavero.id,
    v_idempotency_key
  );

  update public.canjes_regis
  set lectura_terminal_id = v_lectura.id
  where id = v_canje.id
  returning * into v_canje;

  perform public.consumir_lectura_operacion_interna(v_lectura.id);

  return query
  select
    v_canje.id,
    v_canje.codigo_publico::text,
    v_canje.estado,
    v_canje.expira_en,
    v_canje.costo_regis;
end;
$$;

revoke execute on function public.consumir_lectura_llavero_terminal(uuid)
  from authenticated;

revoke all on function public.validar_terminal_operacion_interna(uuid, text)
  from public, anon, authenticated;
revoke all on function public.obtener_lectura_operacion_interna(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.consumir_lectura_operacion_interna(uuid)
  from public, anon, authenticated;
revoke all on function public.reclamar_lectura_llavero_terminal(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.activar_llavero_desde_lectura(
  uuid, uuid, text, public.metodo_verificacion_llavero, text, boolean
) from public, anon, authenticated;
revoke all on function public.crear_solicitud_compra_desde_lectura(
  uuid, uuid, text, integer, text
) from public, anon, authenticated;
revoke all on function public.reservar_canje_regis_desde_lectura(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.reclamar_lectura_llavero_terminal(
  uuid, uuid, text
) to authenticated;
grant execute on function public.activar_llavero_desde_lectura(
  uuid, uuid, text, public.metodo_verificacion_llavero, text, boolean
) to authenticated;
grant execute on function public.crear_solicitud_compra_desde_lectura(
  uuid, uuid, text, integer, text
) to authenticated;
grant execute on function public.reservar_canje_regis_desde_lectura(
  uuid, uuid, text, uuid, text
) to authenticated;

comment on function public.reclamar_lectura_llavero_terminal(uuid, uuid, text) is
  'Reclama una lectura para la Terminal PWA y extiende su uso operativo hasta cinco minutos.';
comment on function public.crear_solicitud_compra_desde_lectura(
  uuid, uuid, text, integer, text
) is 'Crea una compra asistida y consume la lectura NFC en la misma transacción.';
comment on function public.reservar_canje_regis_desde_lectura(
  uuid, uuid, text, uuid, text
) is 'Reserva un canje asistido y consume la lectura NFC en la misma transacción.';

commit;
