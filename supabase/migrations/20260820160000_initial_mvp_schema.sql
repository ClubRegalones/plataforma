begin;

create extension if not exists pgcrypto with schema extensions;

create type public.estado_perfil as enum (
  'activo',
  'bloqueado',
  'eliminado'
);

create type public.rol_plataforma as enum (
  'usuario',
  'admin_regalones'
);

create type public.estado_plan as enum (
  'activo',
  'inactivo',
  'archivado'
);

create type public.estado_negocio as enum (
  'pendiente',
  'activo',
  'suspendido',
  'rechazado'
);

create type public.estado_suscripcion as enum (
  'prueba',
  'activa',
  'vencida',
  'suspendida',
  'cancelada'
);

create type public.estado_sucursal as enum (
  'activa',
  'inactiva'
);

create type public.estado_caja as enum (
  'activa',
  'inactiva',
  'bloqueada'
);

create type public.rol_miembro_negocio as enum (
  'propietario',
  'administrador',
  'cajero'
);

create type public.estado_miembro_negocio as enum (
  'activo',
  'suspendido',
  'revocado'
);

create type public.estado_terminal as enum (
  'pendiente_activacion',
  'activa',
  'bloqueada',
  'revocada'
);

create type public.tipo_etiqueta_nfc as enum (
  'inscripcion',
  'compra'
);

create type public.estado_etiqueta_nfc as enum (
  'sin_asignar',
  'activa',
  'suspendida',
  'reemplazada'
);

create type public.estado_solicitud_compra as enum (
  'esperando_monto',
  'esperando_cajero',
  'pendiente_validacion',
  'aprobada',
  'rechazada',
  'vencida',
  'cancelada'
);

create type public.informado_por as enum (
  'vecino',
  'cajero'
);

create type public.estado_compra as enum (
  'confirmada',
  'observada',
  'revertida'
);

create type public.origen_compra as enum (
  'autoservicio',
  'asistido',
  'integracion_pos'
);

create type public.severidad_riesgo as enum (
  'baja',
  'media',
  'alta',
  'critica'
);

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre varchar(100) not null,
  apellido varchar(100),
  telefono varchar(30),
  comuna varchar(100),
  avatar_url text,
  rol_plataforma public.rol_plataforma not null default 'usuario',
  estado public.estado_perfil not null default 'activo',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint perfiles_nombre_valido
    check (char_length(btrim(nombre)) between 2 and 100),
  constraint perfiles_apellido_valido
    check (
      apellido is null
      or char_length(btrim(apellido)) between 2 and 100
    ),
  constraint perfiles_telefono_valido
    check (
      telefono is null
      or telefono ~ '^\+[1-9][0-9]{7,14}$'
    )
);

create table public.planes (
  id uuid primary key default gen_random_uuid(),
  codigo varchar(80) not null unique,
  nombre varchar(120) not null,
  descripcion text,
  precio_mensual_clp integer not null default 0,
  limite_clientes_activos integer,
  limite_sucursales integer,
  limite_cajas integer,
  limite_miembros integer,
  limite_beneficios_activos integer,
  limite_campanas_mensuales integer,
  nivel_reportes varchar(40),
  estado public.estado_plan not null default 'activo',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint planes_codigo_valido
    check (codigo = lower(codigo) and codigo ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  constraint planes_precio_valido check (precio_mensual_clp >= 0),
  constraint planes_limites_validos check (
    (limite_clientes_activos is null or limite_clientes_activos >= 0)
    and (limite_sucursales is null or limite_sucursales >= 0)
    and (limite_cajas is null or limite_cajas >= 0)
    and (limite_miembros is null or limite_miembros >= 0)
    and (
      limite_beneficios_activos is null
      or limite_beneficios_activos >= 0
    )
    and (
      limite_campanas_mensuales is null
      or limite_campanas_mensuales >= 0
    )
  )
);

create table public.negocios (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(160) not null,
  slug varchar(180) not null unique,
  rut varchar(20),
  rubro varchar(120) not null,
  descripcion text,
  logo_url text,
  estado public.estado_negocio not null default 'pendiente',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint negocios_nombre_valido
    check (char_length(btrim(nombre)) between 2 and 160),
  constraint negocios_slug_valido
    check (slug = lower(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint negocios_rubro_valido
    check (char_length(btrim(rubro)) between 2 and 120)
);

create unique index negocios_rut_unico
  on public.negocios (rut)
  where rut is not null;

create table public.suscripciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete restrict,
  plan_id uuid not null references public.planes (id) on delete restrict,
  estado public.estado_suscripcion not null default 'prueba',
  inicia_en timestamptz not null default now(),
  vence_en timestamptz,
  cancelada_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint suscripciones_vigencia_valida
    check (vence_en is null or vence_en > inicia_en),
  constraint suscripciones_cancelacion_valida
    check (
      (estado = 'cancelada' and cancelada_en is not null)
      or (estado <> 'cancelada' and cancelada_en is null)
    )
);

create unique index suscripciones_vigente_por_negocio
  on public.suscripciones (negocio_id)
  where estado in ('prueba', 'activa');

create index suscripciones_negocio_inicio_idx
  on public.suscripciones (negocio_id, inicia_en desc);

create table public.sucursales (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete restrict,
  nombre varchar(140) not null,
  direccion text not null,
  comuna varchar(100) not null,
  estado public.estado_sucursal not null default 'activa',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint sucursales_nombre_valido
    check (char_length(btrim(nombre)) between 2 and 140),
  constraint sucursales_direccion_valida
    check (char_length(btrim(direccion)) between 3 and 300),
  constraint sucursales_comuna_valida
    check (char_length(btrim(comuna)) between 2 and 100),
  constraint sucursales_identidad_negocio_unica unique (id, negocio_id)
);

create index sucursales_negocio_estado_idx
  on public.sucursales (negocio_id, estado);

create table public.cajas (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references public.sucursales (id) on delete restrict,
  nombre varchar(100) not null,
  codigo varchar(60),
  estado public.estado_caja not null default 'activa',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint cajas_nombre_valido
    check (char_length(btrim(nombre)) between 1 and 100),
  constraint cajas_codigo_valido
    check (
      codigo is null
      or char_length(btrim(codigo)) between 1 and 60
    ),
  constraint cajas_identidad_sucursal_unica unique (id, sucursal_id)
);

create unique index cajas_codigo_unico_por_sucursal
  on public.cajas (sucursal_id, codigo)
  where codigo is not null;

create index cajas_sucursal_estado_idx
  on public.cajas (sucursal_id, estado);

create table public.miembros_negocio (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  rol public.rol_miembro_negocio not null,
  pin_hash text,
  estado public.estado_miembro_negocio not null default 'activo',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint miembros_negocio_usuario_unico
    unique (negocio_id, usuario_id),
  constraint miembros_negocio_pin_hash_valido
    check (pin_hash is null or char_length(pin_hash) >= 32)
);

create index miembros_negocio_usuario_estado_idx
  on public.miembros_negocio (usuario_id, estado);

create table public.terminales (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references public.cajas (id) on delete restrict,
  identificador_publico varchar(120) not null unique,
  token_hash text not null unique,
  nombre_dispositivo varchar(120),
  version_app varchar(40),
  estado public.estado_terminal not null default 'pendiente_activacion',
  ultima_conexion_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint terminales_identificador_valido
    check (char_length(btrim(identificador_publico)) between 8 and 120),
  constraint terminales_token_hash_valido
    check (char_length(token_hash) >= 32)
);

create index terminales_caja_estado_idx
  on public.terminales (caja_id, estado);

create table public.etiquetas_nfc (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_etiqueta_nfc not null,
  token_hash text not null unique,
  negocio_id uuid not null references public.negocios (id) on delete restrict,
  sucursal_id uuid references public.sucursales (id) on delete restrict,
  caja_id uuid references public.cajas (id) on delete restrict,
  estado public.estado_etiqueta_nfc not null default 'sin_asignar',
  instalado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint etiquetas_nfc_token_hash_valido
    check (char_length(token_hash) >= 32),
  constraint etiquetas_nfc_contexto_compra_valido check (
    tipo <> 'compra'
    or (sucursal_id is not null and caja_id is not null)
  )
);

create index etiquetas_nfc_negocio_estado_idx
  on public.etiquetas_nfc (negocio_id, estado);
create index etiquetas_nfc_caja_estado_idx
  on public.etiquetas_nfc (caja_id, estado)
  where caja_id is not null;

create table public.vecinos_negocios (
  id uuid primary key default gen_random_uuid(),
  vecino_id uuid not null references auth.users (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  primera_compra_en timestamptz,
  ultima_compra_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint vecinos_negocios_relacion_unica
    unique (vecino_id, negocio_id),
  constraint vecinos_negocios_fechas_validas check (
    primera_compra_en is null
    or ultima_compra_en is null
    or ultima_compra_en >= primera_compra_en
  )
);

create index vecinos_negocios_negocio_ultima_compra_idx
  on public.vecinos_negocios (negocio_id, ultima_compra_en desc);

create table public.solicitudes_compra (
  id uuid primary key default gen_random_uuid(),
  vecino_id uuid not null references auth.users (id) on delete restrict,
  caja_id uuid not null references public.cajas (id) on delete restrict,
  monto_informado integer,
  informado_por public.informado_por,
  motivo_correccion text,
  motivo_rechazo text,
  estado public.estado_solicitud_compra not null default 'esperando_monto',
  expira_en timestamptz not null,
  idempotency_key text not null unique,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint solicitudes_compra_monto_valido
    check (monto_informado is null or monto_informado > 0),
  constraint solicitudes_compra_informante_valido check (
    (monto_informado is null and informado_por is null)
    or (monto_informado is not null and informado_por is not null)
  ),
  constraint solicitudes_compra_correccion_valida check (
    motivo_correccion is null
    or char_length(btrim(motivo_correccion)) between 3 and 500
  ),
  constraint solicitudes_compra_rechazo_valido check (
    (
      estado = 'rechazada'
      and motivo_rechazo is not null
      and char_length(btrim(motivo_rechazo)) between 3 and 500
    )
    or (estado <> 'rechazada' and motivo_rechazo is null)
  ),
  constraint solicitudes_compra_estado_monto_valido check (
    estado not in ('esperando_cajero', 'pendiente_validacion', 'aprobada')
    or monto_informado is not null
  ),
  constraint solicitudes_compra_expiracion_valida
    check (expira_en > creado_en),
  constraint solicitudes_compra_idempotencia_valida
    check (char_length(btrim(idempotency_key)) between 8 and 200)
);

create index solicitudes_compra_caja_estado_expira_idx
  on public.solicitudes_compra (caja_id, estado, expira_en);
create index solicitudes_compra_vecino_creado_idx
  on public.solicitudes_compra (vecino_id, creado_en desc);

create table public.compras (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null unique
    references public.solicitudes_compra (id) on delete restrict,
  negocio_id uuid not null references public.negocios (id) on delete restrict,
  sucursal_id uuid not null references public.sucursales (id) on delete restrict,
  caja_id uuid not null references public.cajas (id) on delete restrict,
  vecino_id uuid not null references auth.users (id) on delete restrict,
  cajero_id uuid not null references auth.users (id) on delete restrict,
  monto_final integer not null,
  folio_boleta varchar(120),
  origen public.origen_compra not null default 'autoservicio',
  riesgo public.severidad_riesgo,
  estado public.estado_compra not null default 'confirmada',
  creado_en timestamptz not null default now(),
  revertido_en timestamptz,
  constraint compras_monto_final_valido check (monto_final > 0),
  constraint compras_reversion_valida check (
    (estado = 'revertida' and revertido_en is not null)
    or (estado <> 'revertida' and revertido_en is null)
  )
);

create unique index compras_folio_unico_por_negocio
  on public.compras (negocio_id, folio_boleta)
  where folio_boleta is not null;

create index compras_negocio_creado_idx
  on public.compras (negocio_id, creado_en desc);
create index compras_vecino_creado_idx
  on public.compras (vecino_id, creado_en desc);
create index compras_caja_creado_idx
  on public.compras (caja_id, creado_en desc);

comment on table public.perfiles is
  'Perfil complementario a auth.users; no duplica correo ni contraseña.';
comment on table public.negocios is
  'Comercios suscritos a Club Regalones.';
comment on table public.miembros_negocio is
  'Roles y acceso de usuarios dentro de cada negocio.';
comment on table public.etiquetas_nfc is
  'Tags NFC o QR; tocar una etiqueta no acredita REGIS.';
comment on table public.solicitudes_compra is
  'Solicitud temporal postpago anterior a la aprobación del cajero.';
comment on table public.compras is
  'Registro permanente de una compra aprobada; aún no acredita REGIS.';

commit;
