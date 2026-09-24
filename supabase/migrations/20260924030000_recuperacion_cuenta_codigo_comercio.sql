-- ============================================================================
-- CLUB REGALONES
-- RECUPERACIÓN DE CUENTA + CÓDIGO DE COMERCIO · V1
--
-- El Código de Comercio se genera únicamente después de que un cajero
-- verifica presencialmente la identidad del vecino mediante su cédula.
--
-- Reglas:
--   - código de 6 dígitos
--   - se almacena únicamente su HMAC SHA-256, nunca el código en claro
--   - vigencia: 30 minutos
--   - un solo uso
--   - máximo 5 intentos fallidos
--   - un nuevo código invalida cualquier recuperación pendiente anterior
--   - toda emisión queda atribuida a negocio, sucursal, caja, terminal,
--     cajero y turno
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Tipos
-- ----------------------------------------------------------------------------

create type public.motivo_recuperacion_cuenta as enum (
  'olvido_sin_contacto',
  'activacion_digital',
  'traspaso_identidad'
);

create type public.estado_recuperacion_cuenta as enum (
  'pendiente',
  'validada',
  'completada',
  'invalidada',
  'bloqueada',
  'expirada'
);


-- ----------------------------------------------------------------------------
-- 2. Recuperaciones de cuenta
-- ----------------------------------------------------------------------------

create table public.recuperaciones_cuenta (
  id uuid primary key default gen_random_uuid(),

  vecino_id uuid not null
    references public.perfiles (id) on delete restrict,

  motivo public.motivo_recuperacion_cuenta not null,

  -- HMAC-SHA256 hexadecimal generado en Edge Function.
  -- El código de 6 dígitos nunca se guarda en claro.
  codigo_hash varchar(64) not null,

  estado public.estado_recuperacion_cuenta
    not null default 'pendiente',

  intentos_fallidos smallint not null default 0,

  expira_en timestamptz not null,

  -- Token temporal posterior a la validación del Código de Comercio.
  -- Solo se almacena su HMAC.
  token_recuperacion_hash varchar(64),
  token_recuperacion_expira_en timestamptz,

  -- Reserva temporal de 60 segundos para evitar dos cambios simultáneos.
  token_recuperacion_consumido_en timestamptz,

  -- Contexto completo de la verificación presencial.
  negocio_id uuid not null
    references public.negocios (id) on delete restrict,

  sucursal_id uuid not null
    references public.sucursales (id) on delete restrict,

  caja_id uuid not null
    references public.cajas (id) on delete restrict,

  terminal_id uuid not null
    references public.terminales (id) on delete restrict,

  cajero_id uuid not null
    references public.cajeros_negocio (id) on delete restrict,

  turno_id uuid not null
    references public.turnos_caja (id) on delete restrict,

  identidad_verificada boolean not null default false,
  identidad_verificada_en timestamptz,

  validado_en timestamptz,
  completado_en timestamptz,
  invalidado_en timestamptz,
  bloqueado_en timestamptz,
  expirado_en timestamptz,

  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default clock_timestamp(),

  constraint recuperaciones_codigo_hash_valido check (
    codigo_hash ~ '^[0-9a-f]{64}$'
  ),

  constraint recuperaciones_intentos_validos check (
    intentos_fallidos between 0 and 5
  ),

  constraint recuperaciones_expiracion_valida check (
    expira_en > creado_en
  ),

  constraint recuperaciones_identidad_verificada check (
    identidad_verificada = true
    and identidad_verificada_en is not null
  ),

  constraint recuperaciones_estado_fechas_valido check (
    (
      estado = 'pendiente'
      and validado_en is null
      and completado_en is null
      and invalidado_en is null
      and bloqueado_en is null
      and expirado_en is null
    )
    or
    (
      estado = 'validada'
      and validado_en is not null
      and completado_en is null
      and invalidado_en is null
      and bloqueado_en is null
      and expirado_en is null
    )
    or
    (
      estado = 'completada'
      and validado_en is not null
      and completado_en is not null
      and invalidado_en is null
      and bloqueado_en is null
      and expirado_en is null
    )
    or
    (
      estado = 'invalidada'
      and completado_en is null
      and invalidado_en is not null
      and bloqueado_en is null
      and expirado_en is null
    )
    or
    (
      estado = 'bloqueada'
      and validado_en is null
      and completado_en is null
      and invalidado_en is null
      and bloqueado_en is not null
      and expirado_en is null
      and intentos_fallidos = 5
    )
    or
    (
      estado = 'expirada'
      and validado_en is null
      and completado_en is null
      and invalidado_en is null
      and bloqueado_en is null
      and expirado_en is not null
    )
  ),

  constraint recuperaciones_token_hash_valido check (
    token_recuperacion_hash is null
    or token_recuperacion_hash ~ '^[0-9a-f]{64}$'
  ),

  constraint recuperaciones_token_completo check (
    (
      token_recuperacion_hash is null
      and token_recuperacion_expira_en is null
    )
    or
    (
      token_recuperacion_hash is not null
      and token_recuperacion_expira_en is not null
      and validado_en is not null
      and token_recuperacion_expira_en > validado_en
    )
  ),

  constraint recuperaciones_token_consumido_valido check (
    token_recuperacion_consumido_en is null
    or validado_en is not null
  )
);


-- Solo puede existir una recuperación activa por vecino.
create unique index recuperaciones_cuenta_activa_unica
  on public.recuperaciones_cuenta (vecino_id)
  where estado in ('pendiente', 'validada');


create index recuperaciones_cuenta_vecino_estado_idx
  on public.recuperaciones_cuenta (
    vecino_id,
    estado,
    creado_en desc
  );


create index recuperaciones_cuenta_turno_idx
  on public.recuperaciones_cuenta (
    turno_id,
    creado_en desc
  );


create index recuperaciones_cuenta_expiracion_idx
  on public.recuperaciones_cuenta (expira_en)
  where estado = 'pendiente';


create trigger recuperaciones_cuenta_establecer_actualizado_en
before update on public.recuperaciones_cuenta
for each row execute function public.establecer_actualizado_en();


comment on table public.recuperaciones_cuenta is
  'Auditoría de Códigos de Comercio para recuperación, activación digital y traspaso de identidad. Nunca almacena el código de 6 dígitos en claro.';

comment on column public.recuperaciones_cuenta.codigo_hash is
  'HMAC-SHA256 hexadecimal del Código de Comercio. El código visible existe solo temporalmente en la Edge Function y en la pantalla del cajero.';

comment on column public.recuperaciones_cuenta.identidad_verificada_en is
  'Momento en que el cajero confirmó haber comparado presencialmente la cédula con la persona. No se almacena foto, serial ni número de documento.';


-- ----------------------------------------------------------------------------
-- 3. RLS y permisos
-- ----------------------------------------------------------------------------

alter table public.recuperaciones_cuenta enable row level security;

revoke all on table public.recuperaciones_cuenta
  from anon, authenticated;

-- No se crean políticas cliente.
-- La tabla se opera exclusivamente mediante RPC controlados y service_role.



-- ----------------------------------------------------------------------------
-- 4. Auditoría de búsquedas de recuperación
--
-- Registra quién consultó una identidad desde App Negocio sin almacenar
-- el RUT buscado en claro.
-- ----------------------------------------------------------------------------

create table public.auditoria_busquedas_recuperacion (
  id uuid primary key default gen_random_uuid(),

  negocio_id uuid not null
    references public.negocios (id) on delete restrict,

  sucursal_id uuid not null
    references public.sucursales (id) on delete restrict,

  caja_id uuid not null
    references public.cajas (id) on delete restrict,

  terminal_id uuid not null
    references public.terminales (id) on delete restrict,

  cajero_id uuid not null
    references public.cajeros_negocio (id) on delete restrict,

  turno_id uuid not null
    references public.turnos_caja (id) on delete restrict,

  vecino_id uuid
    references public.perfiles (id) on delete set null,

  encontrado boolean not null,

  creado_en timestamptz not null default clock_timestamp()
);

create index auditoria_busquedas_recuperacion_turno_idx
  on public.auditoria_busquedas_recuperacion (
    turno_id,
    cajero_id,
    creado_en desc
  );

alter table public.auditoria_busquedas_recuperacion
  enable row level security;

revoke all on table public.auditoria_busquedas_recuperacion
  from anon, authenticated;

grant select on table public.auditoria_busquedas_recuperacion
  to service_role;

comment on table public.auditoria_busquedas_recuperacion is
  'Audita búsquedas de identidad realizadas por cajeros durante recuperación. No almacena el RUT consultado ni datos de la cédula.';

-- ----------------------------------------------------------------------------
-- 5. Buscar vecino para recuperación desde App Negocio
--
-- Devuelve únicamente identidad mínima:
--   - UUID interno
--   - nombre
--   - RUT enmascarado
--
-- Antes valida Terminal + turno + cajero.
-- No devuelve correo, teléfono ni correo técnico de Auth.
-- ----------------------------------------------------------------------------

create function public.obtener_vecino_recuperacion_por_rut(
  p_rut text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text
)
returns table (
  vecino_id uuid,
  nombre_vecino text,
  rut_enmascarado text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_sucursal_id uuid;
  v_vecino_id uuid;
  v_nombre_vecino text;
  v_rut_enmascarado text;
begin
  if not public.es_rut_valido(p_rut) then
    raise exception 'RUT_INVALIDO'
      using errcode = '22023';
  end if;

  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  -- Código de Comercio es una operación de App Negocio.
  -- No se permite desde un turno legacy sin cajero identificado.
  if v_turno.cajero_negocio_id is null then
    raise exception 'Esta operación requiere un turno de App Negocio'
      using errcode = '42501';
  end if;

  select caja.sucursal_id
  into v_sucursal_id
  from public.cajas as caja
  where caja.id = v_turno.caja_id;

  if v_sucursal_id is null then
    raise exception 'No se pudo resolver la sucursal del turno'
      using errcode = '42501';
  end if;

  select
    perfil.id,
    btrim(
      concat_ws(
        ' ',
        perfil.nombre,
        perfil.apellido
      )
    )::text,
    public.enmascarar_rut(perfil.rut)::text
  into
    v_vecino_id,
    v_nombre_vecino,
    v_rut_enmascarado
  from public.perfiles as perfil
  where perfil.rut = public.normalizar_rut(p_rut)
    and perfil.estado = 'activo'
  limit 1;

  insert into public.auditoria_busquedas_recuperacion (
    negocio_id,
    sucursal_id,
    caja_id,
    terminal_id,
    cajero_id,
    turno_id,
    vecino_id,
    encontrado
  )
  values (
    v_turno.negocio_id,
    v_sucursal_id,
    v_turno.caja_id,
    p_terminal_id,
    v_turno.cajero_negocio_id,
    v_turno.id,
    v_vecino_id,
    v_vecino_id is not null
  );

  if v_vecino_id is null then
    return;
  end if;

  return query
  select
    v_vecino_id,
    v_nombre_vecino,
    v_rut_enmascarado;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Crear recuperación / Código de Comercio
--
-- El código visible se genera en Edge Function.
-- PostgreSQL recibe solamente su HMAC hexadecimal.
--
-- La BD deriva el contexto real desde Terminal + turno.
-- El cliente NO decide negocio, sucursal, caja ni cajero.
-- ----------------------------------------------------------------------------

create function public.crear_recuperacion_codigo_comercio(
  p_rut text,
  p_motivo public.motivo_recuperacion_cuenta,
  p_codigo_hash text,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text,
  p_identidad_verificada boolean
)
returns table (
  recuperacion_id uuid,
  vecino_id uuid,
  nombre_vecino text,
  rut_enmascarado text,
  expira_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_vecino public.perfiles;
  v_sucursal_id uuid;
  v_recuperacion public.recuperaciones_cuenta;
  v_ahora timestamptz := clock_timestamp();
begin
  if not public.es_rut_valido(p_rut) then
    raise exception 'RUT_INVALIDO'
      using errcode = '22023';
  end if;

  if p_motivo is null then
    raise exception 'MOTIVO_RECUPERACION_REQUERIDO'
      using errcode = '22023';
  end if;

  if p_codigo_hash is null
    or p_codigo_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'CODIGO_HASH_INVALIDO'
      using errcode = '22023';
  end if;

  if p_identidad_verificada is not true then
    raise exception 'IDENTIDAD_NO_VERIFICADA'
      using errcode = '42501';
  end if;

  v_turno := public.validar_turno_terminal_interno(
    p_turno_id,
    p_terminal_id,
    p_token_terminal
  );

  if v_turno.cajero_negocio_id is null then
    raise exception 'Esta operación requiere un turno de App Negocio'
      using errcode = '42501';
  end if;

  select caja.sucursal_id
  into v_sucursal_id
  from public.cajas as caja
  where caja.id = v_turno.caja_id;

  if v_sucursal_id is null then
    raise exception 'No se pudo resolver la sucursal del turno'
      using errcode = '42501';
  end if;

  select perfil.*
  into v_vecino
  from public.perfiles as perfil
  where perfil.rut = public.normalizar_rut(p_rut)
    and perfil.estado = 'activo'
  for update;

  if not found then
    raise exception 'VECINO_NO_ENCONTRADO'
      using errcode = 'P0002';
  end if;


  -- Una recuperación validada cuyo token ya venció puede cerrarse para
  -- permitir que el vecino solicite un nuevo Código de Comercio.
  --
  -- Si el token ya fue consumido por una operación en curso, no lo tocamos.

  update public.recuperaciones_cuenta
  set
    estado = 'invalidada',
    invalidado_en = v_ahora,
    token_recuperacion_hash = null,
    token_recuperacion_expira_en = null,
    token_recuperacion_consumido_en = null,
    actualizado_en = v_ahora
  where recuperaciones_cuenta.vecino_id = v_vecino.id
    and estado = 'validada'
    and token_recuperacion_expira_en <= v_ahora
    and (
      token_recuperacion_consumido_en is null
      or token_recuperacion_consumido_en
        <= v_ahora - interval '60 seconds'
    );


  -- No permitimos reemplazar una recuperación ya validada y vigente.

  if exists (
    select 1
    from public.recuperaciones_cuenta
    where recuperaciones_cuenta.vecino_id = v_vecino.id
      and estado = 'validada'
  ) then
    raise exception 'RECUPERACION_EN_PROCESO'
      using errcode = '23514';
  end if;


  -- Un código todavía pendiente sí puede reemplazarse.
  update public.recuperaciones_cuenta
  set
    estado = 'invalidada',
    invalidado_en = v_ahora,
    actualizado_en = v_ahora
  where recuperaciones_cuenta.vecino_id = v_vecino.id
    and estado = 'pendiente';


  insert into public.recuperaciones_cuenta (
    vecino_id,
    motivo,
    codigo_hash,
    estado,
    intentos_fallidos,
    expira_en,
    negocio_id,
    sucursal_id,
    caja_id,
    terminal_id,
    cajero_id,
    turno_id,
    identidad_verificada,
    identidad_verificada_en
  )
  values (
    v_vecino.id,
    p_motivo,
    p_codigo_hash,
    'pendiente',
    0,
    v_ahora + interval '30 minutes',
    v_turno.negocio_id,
    v_sucursal_id,
    v_turno.caja_id,
    p_terminal_id,
    v_turno.cajero_negocio_id,
    v_turno.id,
    true,
    v_ahora
  )
  returning *
  into v_recuperacion;


  return query
  select
    v_recuperacion.id,
    v_vecino.id,
    btrim(
      concat_ws(
        ' ',
        v_vecino.nombre,
        v_vecino.apellido
      )
    )::text,
    public.enmascarar_rut(v_vecino.rut)::text,
    v_recuperacion.expira_en;

end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Permisos
--
-- Son primitivas internas usadas por las Edge Functions.
-- Nunca se llaman directamente desde navegador/App Negocio.
-- ----------------------------------------------------------------------------

revoke all on function public.obtener_vecino_recuperacion_por_rut(
  text,
  uuid,
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.crear_recuperacion_codigo_comercio(
  text,
  public.motivo_recuperacion_cuenta,
  text,
  uuid,
  uuid,
  text,
  boolean
) from public, anon, authenticated;

grant execute on function public.obtener_vecino_recuperacion_por_rut(
  text,
  uuid,
  uuid,
  text
) to service_role;

grant execute on function public.crear_recuperacion_codigo_comercio(
  text,
  public.motivo_recuperacion_cuenta,
  text,
  uuid,
  uuid,
  text,
  boolean
) to service_role;


comment on function public.obtener_vecino_recuperacion_por_rut(
  text,
  uuid,
  uuid,
  text
) is
  'Busca identidad mínima para recuperación por RUT después de validar Terminal, turno y cajero de App Negocio. No expone contactos ni correo técnico.';

comment on function public.crear_recuperacion_codigo_comercio(
  text,
  public.motivo_recuperacion_cuenta,
  text,
  uuid,
  uuid,
  text,
  boolean
) is
  'Crea un Código de Comercio después de verificar presencialmente la identidad. Deriva negocio, sucursal, caja y cajero desde el turno; invalida cualquier recuperación activa anterior.';

-- ----------------------------------------------------------------------------
-- 8. Validar Código de Comercio desde el dispositivo del vecino
--
-- La Edge Function calcula el mismo HMAC que se almacenó al emitir el código.
-- PostgreSQL nunca recibe el código de 6 dígitos en claro: recibe solamente
-- el HMAC hexadecimal para compararlo.
--
-- Esta función:
--   - exige RUT válido
--   - localiza únicamente la recuperación pendiente del vecino
--   - expira códigos vencidos
--   - contabiliza intentos fallidos
--   - bloquea definitivamente al quinto fallo
--   - consume el código correcto pasando la recuperación a "validada"
-- ----------------------------------------------------------------------------

create function public.validar_codigo_comercio_recuperacion(
  p_rut text,
  p_codigo_hash text,
  p_token_recuperacion_hash text
)
returns table (
  valido boolean,
  resultado text,
  recuperacion_id uuid,
  vecino_id uuid,
  motivo public.motivo_recuperacion_cuenta,
  intentos_restantes smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vecino_id uuid;
  v_recuperacion public.recuperaciones_cuenta;
  v_intentos smallint;
  v_ahora timestamptz := clock_timestamp();
begin

  if p_token_recuperacion_hash is null
    or p_token_recuperacion_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'TOKEN_RECUPERACION_HASH_INVALIDO'
      using errcode = '22023';
  end if;


  if not public.es_rut_valido(p_rut)
    or p_codigo_hash is null
    or p_codigo_hash !~ '^[0-9a-f]{64}$'
  then
    return query
    select
      false,
      'CODIGO_INVALIDO'::text,
      null::uuid,
      null::uuid,
      null::public.motivo_recuperacion_cuenta,
      null::smallint;

    return;
  end if;


  select perfil.id
  into v_vecino_id
  from public.perfiles as perfil
  where perfil.rut = public.normalizar_rut(p_rut)
    and perfil.estado = 'activo'
  limit 1;


  if v_vecino_id is null then
    return query
    select
      false,
      'CODIGO_INVALIDO'::text,
      null::uuid,
      null::uuid,
      null::public.motivo_recuperacion_cuenta,
      null::smallint;

    return;
  end if;


  select recuperacion.*
  into v_recuperacion
  from public.recuperaciones_cuenta as recuperacion
  where recuperacion.vecino_id = v_vecino_id
    and recuperacion.estado = 'pendiente'
  order by recuperacion.creado_en desc
  limit 1
  for update;


  if not found then
    return query
    select
      false,
      'CODIGO_INVALIDO'::text,
      null::uuid,
      null::uuid,
      null::public.motivo_recuperacion_cuenta,
      null::smallint;

    return;
  end if;


  -- Código vencido.
  if v_recuperacion.expira_en <= v_ahora then

    update public.recuperaciones_cuenta
    set
      estado = 'expirada',
      expirado_en = v_ahora,
      actualizado_en = v_ahora
    where id = v_recuperacion.id;

    return query
    select
      false,
      'CODIGO_EXPIRADO'::text,
      v_recuperacion.id,
      v_vecino_id,
      v_recuperacion.motivo,
      null::smallint;

    return;

  end if;


  -- Código incorrecto.
  if v_recuperacion.codigo_hash <> lower(p_codigo_hash) then

    v_intentos := v_recuperacion.intentos_fallidos + 1;

    if v_intentos >= 5 then

      update public.recuperaciones_cuenta
      set
        intentos_fallidos = 5,
        estado = 'bloqueada',
        bloqueado_en = v_ahora,
        actualizado_en = v_ahora
      where id = v_recuperacion.id;

      return query
      select
        false,
        'CODIGO_BLOQUEADO'::text,
        v_recuperacion.id,
        v_vecino_id,
        v_recuperacion.motivo,
        0::smallint;

      return;

    end if;


    update public.recuperaciones_cuenta
    set
      intentos_fallidos = v_intentos,
      actualizado_en = v_ahora
    where id = v_recuperacion.id;


    return query
    select
      false,
      'CODIGO_INVALIDO'::text,
      v_recuperacion.id,
      v_vecino_id,
      v_recuperacion.motivo,
      (5 - v_intentos)::smallint;

    return;

  end if;


  -- Código correcto.
  --
  -- El Código de Comercio queda consumido y comienza una segunda ventana
  -- breve para que el vecino cree su contraseña desde su propio dispositivo.

  update public.recuperaciones_cuenta
  set
    estado = 'validada',
    validado_en = v_ahora,
    token_recuperacion_hash = lower(p_token_recuperacion_hash),
    token_recuperacion_expira_en = v_ahora + interval '15 minutes',
    actualizado_en = v_ahora
  where id = v_recuperacion.id;


  return query
  select
    true,
    'CODIGO_VALIDO'::text,
    v_recuperacion.id,
    v_vecino_id,
    v_recuperacion.motivo,
    (5 - v_recuperacion.intentos_fallidos)::smallint;

end;
$$;


revoke all on function public.validar_codigo_comercio_recuperacion(
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.validar_codigo_comercio_recuperacion(
  text,
  text,
  text
) to service_role;


comment on function public.validar_codigo_comercio_recuperacion(
  text,
  text,
  text
) is
  'Valida el Código de Comercio y, al consumirlo correctamente, registra el HMAC de un token temporal de alta entropía para autorizar el cambio de contraseña.';

-- ----------------------------------------------------------------------------
-- 9. Consumo seguro del token de recuperación
--
-- Una vez validado el Código de Comercio, el token temporal puede utilizarse
-- una sola vez para iniciar el cambio de contraseña.
--
-- token_recuperacion_consumido_en evita dos cambios simultáneos con el mismo
-- token (doble clic, reintento paralelo, etc.).
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- 10. Preparar cambio de contraseña
--
-- Solo service_role.
--
-- Comprueba el token temporal y lo MARCA COMO CONSUMIDO antes de tocar
-- Supabase Auth. Esto evita que el mismo token inicie dos cambios simultáneos.
-- ----------------------------------------------------------------------------

create function public.preparar_cambio_contrasena_recuperacion(
  p_recuperacion_id uuid,
  p_token_recuperacion_hash text
)
returns table (
  vecino_id uuid,
  motivo public.motivo_recuperacion_cuenta
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recuperacion public.recuperaciones_cuenta;
  v_ahora timestamptz := clock_timestamp();
begin
  if p_token_recuperacion_hash is null
    or p_token_recuperacion_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'RECUPERACION_INVALIDA'
      using errcode = '42501';
  end if;


  select recuperacion.*
  into v_recuperacion
  from public.recuperaciones_cuenta as recuperacion
  where recuperacion.id = p_recuperacion_id
    and recuperacion.estado = 'validada'
  for update;


  if not found
    or v_recuperacion.token_recuperacion_hash is null
    or v_recuperacion.token_recuperacion_hash <> lower(p_token_recuperacion_hash)
    or v_recuperacion.token_recuperacion_expira_en is null
    or v_recuperacion.token_recuperacion_expira_en <= v_ahora
  then
    raise exception 'RECUPERACION_INVALIDA'
      using errcode = '42501';
  end if;


  -- token_recuperacion_consumido_en funciona como una reserva temporal.
  -- Durante 60 segundos impide dos cambios simultáneos. Si una ejecución
  -- desaparece después de tocar Auth pero antes de completar la recuperación,
  -- el mismo token puede retomar el proceso una vez vencida esta reserva,
  -- siempre que sus 15 minutos de vigencia aún no hayan terminado.
  if v_recuperacion.token_recuperacion_consumido_en is not null
    and v_recuperacion.token_recuperacion_consumido_en
      > v_ahora - interval '60 seconds'
  then
    raise exception 'RECUPERACION_INVALIDA'
      using errcode = '42501';
  end if;


  update public.recuperaciones_cuenta
  set
    token_recuperacion_consumido_en = v_ahora,
    actualizado_en = v_ahora
  where id = v_recuperacion.id;


  return query
  select
    v_recuperacion.vecino_id,
    v_recuperacion.motivo;

end;
$$;


-- ----------------------------------------------------------------------------
-- 11. Liberar token si Supabase Auth falla
--
-- Si el cambio de contraseña administrativo falla, la Edge Function puede
-- devolver el token a estado utilizable siempre que todavía no haya vencido.
-- ----------------------------------------------------------------------------

create function public.liberar_cambio_contrasena_recuperacion(
  p_recuperacion_id uuid,
  p_token_recuperacion_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.recuperaciones_cuenta
  set
    token_recuperacion_consumido_en = null,
    actualizado_en = clock_timestamp()
  where id = p_recuperacion_id
    and estado = 'validada'
    and token_recuperacion_hash = lower(p_token_recuperacion_hash)
    and token_recuperacion_expira_en > clock_timestamp()
    and token_recuperacion_consumido_en is not null;

end;
$$;


-- ----------------------------------------------------------------------------
-- 12. Completar recuperación
--
-- Se ejecuta solamente DESPUÉS de que Supabase Auth haya cambiado la
-- contraseña correctamente.
--
-- Para traspaso de identidad:
--   - elimina correo/teléfono de recuperación anteriores
--   - limpia el teléfono histórico del perfil
--   - preserva cuenta, RUT, REGIS, compras, canjes e historial
--
-- Supabase Auth se encarga del cambio de contraseña y de cerrar las sesiones
-- anteriores mediante updateUserById(... password ...).
-- ----------------------------------------------------------------------------

create function public.completar_recuperacion_cuenta(
  p_recuperacion_id uuid,
  p_token_recuperacion_hash text
)
returns public.motivo_recuperacion_cuenta
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recuperacion public.recuperaciones_cuenta;
  v_ahora timestamptz := clock_timestamp();
begin
  select recuperacion.*
  into v_recuperacion
  from public.recuperaciones_cuenta as recuperacion
  where recuperacion.id = p_recuperacion_id
    and recuperacion.estado = 'validada'
  for update;


  if not found
    or v_recuperacion.token_recuperacion_hash is null
    or v_recuperacion.token_recuperacion_hash <> lower(p_token_recuperacion_hash)
    or v_recuperacion.token_recuperacion_consumido_en is null
  then
    raise exception 'RECUPERACION_INVALIDA'
      using errcode = '42501';
  end if;


  -- En un traspaso real de identidad ya no debemos conservar los canales
  -- de recuperación que pertenecían a quien controlaba la cuenta antes.

  if v_recuperacion.motivo = 'traspaso_identidad' then

    delete from public.contactos_vecino
    where vecino_id = v_recuperacion.vecino_id;

    update public.perfiles
    set
      telefono = null,
      actualizado_en = v_ahora
    where id = v_recuperacion.vecino_id;

  end if;


  -- Defensa adicional: cualquier otro intento activo queda invalidado.
  update public.recuperaciones_cuenta
  set
    estado = 'invalidada',
    invalidado_en = v_ahora,
    token_recuperacion_hash = null,
    token_recuperacion_expira_en = null,
    actualizado_en = v_ahora
  where vecino_id = v_recuperacion.vecino_id
    and id <> v_recuperacion.id
    and estado in ('pendiente', 'validada');


  update public.recuperaciones_cuenta
  set
    estado = 'completada',
    completado_en = v_ahora,

    -- El secreto ya cumplió su función. No conservamos su HMAC.
    token_recuperacion_hash = null,
    token_recuperacion_expira_en = null,

    actualizado_en = v_ahora
  where id = v_recuperacion.id;


  return v_recuperacion.motivo;

end;
$$;


-- ----------------------------------------------------------------------------
-- 13. Permisos
-- ----------------------------------------------------------------------------

revoke all on function public.preparar_cambio_contrasena_recuperacion(
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.liberar_cambio_contrasena_recuperacion(
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.completar_recuperacion_cuenta(
  uuid,
  text
) from public, anon, authenticated;


grant execute on function public.preparar_cambio_contrasena_recuperacion(
  uuid,
  text
) to service_role;

grant execute on function public.liberar_cambio_contrasena_recuperacion(
  uuid,
  text
) to service_role;

grant execute on function public.completar_recuperacion_cuenta(
  uuid,
  text
) to service_role;


comment on function public.preparar_cambio_contrasena_recuperacion(
  uuid,
  text
) is
  'Reserva de forma atómica el token temporal antes del cambio administrativo de contraseña y devuelve vecino_id + motivo exclusivamente a service_role.';

comment on function public.liberar_cambio_contrasena_recuperacion(
  uuid,
  text
) is
  'Permite reintentar únicamente cuando Supabase Auth falló después de reservar el token temporal y éste todavía sigue vigente.';

comment on function public.completar_recuperacion_cuenta(
  uuid,
  text
) is
  'Finaliza una recuperación después del cambio exitoso de contraseña. En traspaso de identidad elimina contactos anteriores sin tocar REGIS, compras, canjes ni historial.';
