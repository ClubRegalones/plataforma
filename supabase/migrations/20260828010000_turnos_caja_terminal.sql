begin;

create type public.estado_turno_caja as enum (
  'abierto',
  'cerrado',
  'cerrado_automaticamente'
);

create table public.turnos_caja (
  id uuid primary key default gen_random_uuid(),
  terminal_id uuid not null
    references public.terminales (id) on delete restrict,
  caja_id uuid not null references public.cajas (id) on delete restrict,
  negocio_id uuid not null references public.negocios (id) on delete restrict,
  nombre_cajero varchar(100) not null,
  estado public.estado_turno_caja not null default 'abierto',
  iniciado_en timestamptz not null default clock_timestamp(),
  ultima_actividad_en timestamptz not null default clock_timestamp(),
  cerrado_en timestamptz,
  creado_en timestamptz not null default clock_timestamp(),
  constraint turnos_nombre_cajero_valido check (
    char_length(btrim(nombre_cajero)) between 2 and 100
  ),
  constraint turnos_cierre_valido check (
    (estado = 'abierto' and cerrado_en is null)
    or (estado <> 'abierto' and cerrado_en is not null)
  )
);

create unique index turnos_caja_terminal_abierto_unico
  on public.turnos_caja (terminal_id)
  where estado = 'abierto';
create index turnos_caja_negocio_iniciado_idx
  on public.turnos_caja (negocio_id, iniciado_en desc);
create index turnos_caja_caja_iniciado_idx
  on public.turnos_caja (caja_id, iniciado_en desc);

alter table public.solicitudes_compra
  add column turno_caja_id uuid
    references public.turnos_caja (id) on delete restrict;
alter table public.compras
  add column turno_caja_id uuid
    references public.turnos_caja (id) on delete restrict;
alter table public.canjes_regis
  add column turno_caja_id uuid
    references public.turnos_caja (id) on delete restrict;

create index solicitudes_compra_turno_idx
  on public.solicitudes_compra (turno_caja_id)
  where turno_caja_id is not null;
create index compras_turno_idx
  on public.compras (turno_caja_id)
  where turno_caja_id is not null;
create index canjes_regis_turno_idx
  on public.canjes_regis (turno_caja_id)
  where turno_caja_id is not null;

create function public.iniciar_turno_terminal(
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := btrim(coalesce(p_token_terminal, ''));
  v_nombre text := btrim(coalesce(p_nombre_cajero, ''));
  v_terminal public.terminales;
  v_turno public.turnos_caja;
  v_negocio_id uuid;
begin
  if char_length(v_nombre) not between 2 and 100 then
    raise exception 'Escribe el nombre de quien inicia el turno'
      using errcode = '22023';
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

  if not found then
    raise exception 'La credencial de la Terminal PWA no es válida'
      using errcode = '42501';
  end if;

  select sucursal.negocio_id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal on sucursal.id = caja.sucursal_id
  join public.negocios as negocio on negocio.id = sucursal.negocio_id
  where caja.id = v_terminal.caja_id
    and caja.estado = 'activa'
    and sucursal.estado = 'activa'
    and negocio.estado = 'activo';

  if v_negocio_id is null then
    raise exception 'La caja o el negocio ya no están activos'
      using errcode = '23514';
  end if;

  select turno.*
  into v_turno
  from public.turnos_caja as turno
  where turno.terminal_id = v_terminal.id
    and turno.estado = 'abierto'
  for update;

  if found then
    if lower(v_turno.nombre_cajero) <> lower(v_nombre) then
      raise exception 'Ya hay un turno abierto por %. Ciérralo antes de iniciar otro',
        v_turno.nombre_cajero
        using errcode = '23514';
    end if;
  else
    insert into public.turnos_caja (
      terminal_id,
      caja_id,
      negocio_id,
      nombre_cajero
    ) values (
      v_terminal.id,
      v_terminal.caja_id,
      v_negocio_id,
      v_nombre
    )
    returning * into v_turno;
  end if;

  update public.terminales
  set ultima_conexion_en = clock_timestamp()
  where id = v_terminal.id;

  return query
  select
    v_turno.id,
    v_turno.terminal_id,
    v_turno.caja_id,
    v_turno.negocio_id,
    v_turno.nombre_cajero::text,
    v_turno.estado,
    v_turno.iniciado_en;
end;
$$;

create function public.consultar_turno_terminal(
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
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.terminales as terminal
    where terminal.id = p_terminal_id
      and terminal.estado = 'activa'
      and terminal.token_hash = encode(
        extensions.digest(
          convert_to(btrim(coalesce(p_token_terminal, '')), 'UTF8'),
          'sha256'
        ),
        'hex'
      )
  ) then
    raise exception 'La credencial de la Terminal PWA no es válida'
      using errcode = '42501';
  end if;

  return query
  select
    turno.id,
    turno.terminal_id,
    turno.caja_id,
    turno.negocio_id,
    turno.nombre_cajero::text,
    turno.estado,
    turno.iniciado_en
  from public.turnos_caja as turno
  where turno.terminal_id = p_terminal_id
    and turno.estado = 'abierto'
  order by turno.iniciado_en desc
  limit 1;
end;
$$;

create function public.cerrar_turno_terminal(
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
  if not exists (
    select 1
    from public.terminales as terminal
    where terminal.id = p_terminal_id
      and terminal.estado = 'activa'
      and terminal.token_hash = encode(
        extensions.digest(
          convert_to(btrim(coalesce(p_token_terminal, '')), 'UTF8'),
          'sha256'
        ),
        'hex'
      )
  ) then
    raise exception 'La credencial de la Terminal PWA no es válida'
      using errcode = '42501';
  end if;

  update public.turnos_caja
  set
    estado = 'cerrado',
    cerrado_en = clock_timestamp(),
    ultima_actividad_en = clock_timestamp()
  where id = p_turno_id
    and terminal_id = p_terminal_id
    and estado = 'abierto'
  returning * into v_turno;

  if not found then
    raise exception 'El turno no existe o ya fue cerrado'
      using errcode = 'P0002';
  end if;

  return v_turno;
end;
$$;

create function public.aprobar_compra_en_turno(
  p_solicitud_id uuid,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text,
  p_folio_boleta text default null,
  p_origen public.origen_compra default 'autoservicio'
)
returns public.compras
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_compra public.compras;
begin
  select turno.*
  into v_turno
  from public.turnos_caja as turno
  join public.terminales as terminal on terminal.id = turno.terminal_id
  where turno.id = p_turno_id
    and turno.terminal_id = p_terminal_id
    and turno.estado = 'abierto'
    and terminal.estado = 'activa'
    and terminal.token_hash = encode(
      extensions.digest(
        convert_to(btrim(coalesce(p_token_terminal, '')), 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  for update of turno;

  if not found then
    raise exception 'Debes iniciar un turno válido antes de aprobar compras'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.solicitudes_compra as solicitud
    where solicitud.id = p_solicitud_id
      and solicitud.caja_id = v_turno.caja_id
  ) then
    raise exception 'La solicitud no pertenece a la caja del turno'
      using errcode = '42501';
  end if;

  select *
  into v_compra
  from public.aprobar_compra(
    p_solicitud_id,
    p_folio_boleta,
    p_origen
  );

  update public.solicitudes_compra
  set turno_caja_id = v_turno.id
  where id = p_solicitud_id;

  update public.compras
  set turno_caja_id = v_turno.id
  where id = v_compra.id
  returning * into v_compra;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  return v_compra;
end;
$$;

create function public.rechazar_solicitud_compra_en_turno(
  p_solicitud_id uuid,
  p_motivo text,
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
  v_solicitud public.solicitudes_compra;
begin
  select turno.*
  into v_turno
  from public.turnos_caja as turno
  join public.terminales as terminal on terminal.id = turno.terminal_id
  where turno.id = p_turno_id
    and turno.terminal_id = p_terminal_id
    and turno.estado = 'abierto'
    and terminal.estado = 'activa'
    and terminal.token_hash = encode(
      extensions.digest(
        convert_to(btrim(coalesce(p_token_terminal, '')), 'UTF8'),
        'sha256'
      ),
      'hex'
    );

  if not found then
    raise exception 'Debes iniciar un turno válido antes de rechazar compras'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.solicitudes_compra as solicitud
    where solicitud.id = p_solicitud_id
      and solicitud.caja_id = v_turno.caja_id
  ) then
    raise exception 'La solicitud no pertenece a la caja del turno'
      using errcode = '42501';
  end if;

  select *
  into v_solicitud
  from public.rechazar_solicitud_compra(
    p_solicitud_id,
    p_motivo
  );
  
  update public.solicitudes_compra
  set turno_caja_id = v_turno.id
  where id = p_solicitud_id
  returning * into v_solicitud;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  return v_solicitud;
end;
$$;

create function public.confirmar_compra_con_canje_en_turno(
  p_canje_id uuid,
  p_caja_id uuid,
  p_monto_bruto_clp integer,
  p_turno_id uuid,
  p_terminal_id uuid,
  p_token_terminal text,
  p_folio_boleta text default null,
  p_qr_token text default null
)
returns table (
  canje_id uuid,
  estado public.estado_canje_regis,
  compra_id uuid,
  monto_compra_bruto_clp integer,
  descuento_total_clp integer,
  valor_financiado_regis_clp integer,
  aporte_promocional_negocio_clp integer,
  monto_final_pagado_clp integer,
  regis_utilizados integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_resultado record;
begin
  select turno.*
  into v_turno
  from public.turnos_caja as turno
  join public.terminales as terminal on terminal.id = turno.terminal_id
  where turno.id = p_turno_id
    and turno.terminal_id = p_terminal_id
    and turno.caja_id = p_caja_id
    and turno.estado = 'abierto'
    and terminal.estado = 'activa'
    and terminal.token_hash = encode(
      extensions.digest(
        convert_to(btrim(coalesce(p_token_terminal, '')), 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  for update of turno;

  if not found then
    raise exception 'Debes iniciar un turno válido antes de confirmar canjes'
      using errcode = '42501';
  end if;

  select *
  into v_resultado
  from public.confirmar_compra_con_canje(
    p_canje_id,
    p_caja_id,
    p_monto_bruto_clp,
    p_folio_boleta,
    p_qr_token
  );

  update public.solicitudes_compra
  set turno_caja_id = v_turno.id
  where id = (
    select compra.solicitud_id
    from public.compras as compra
    where compra.id = v_resultado.compra_id
  );

  update public.compras
  set turno_caja_id = v_turno.id
  where id = v_resultado.compra_id;

  update public.canjes_regis
  set turno_caja_id = v_turno.id
  where id = p_canje_id;

  update public.turnos_caja
  set ultima_actividad_en = clock_timestamp()
  where id = v_turno.id;

  return query select
    v_resultado.canje_id,
    v_resultado.estado,
    v_resultado.compra_id,
    v_resultado.monto_compra_bruto_clp,
    v_resultado.descuento_total_clp,
    v_resultado.valor_financiado_regis_clp,
    v_resultado.aporte_promocional_negocio_clp,
    v_resultado.monto_final_pagado_clp,
    v_resultado.regis_utilizados;
end;
$$;

alter table public.turnos_caja enable row level security;

create policy turnos_caja_leer_negocio
on public.turnos_caja
for select
to authenticated
using (
  public.es_miembro_negocio(negocio_id)
  or public.es_admin_regalones()
);

revoke all on table public.turnos_caja from anon, authenticated;
grant select on table public.turnos_caja to authenticated;

revoke all on function public.iniciar_turno_terminal(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.consultar_turno_terminal(uuid, text)
  from public, anon, authenticated;
revoke all on function public.cerrar_turno_terminal(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.aprobar_compra_en_turno(
  uuid, uuid, uuid, text, text, public.origen_compra
) from public, anon, authenticated;
revoke all on function public.rechazar_solicitud_compra_en_turno(
  uuid, text, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.confirmar_compra_con_canje_en_turno(
  uuid, uuid, integer, uuid, uuid, text, text, text
) from public, anon, authenticated;

grant execute on function public.iniciar_turno_terminal(uuid, text, text)
  to authenticated;
grant execute on function public.consultar_turno_terminal(uuid, text)
  to authenticated;
grant execute on function public.cerrar_turno_terminal(uuid, uuid, text)
  to authenticated;
grant execute on function public.aprobar_compra_en_turno(
  uuid, uuid, uuid, text, text, public.origen_compra
) to authenticated;
grant execute on function public.rechazar_solicitud_compra_en_turno(
  uuid, text, uuid, uuid, text
) to authenticated;
grant execute on function public.confirmar_compra_con_canje_en_turno(
  uuid, uuid, integer, uuid, uuid, text, text, text
) to authenticated;

comment on table public.turnos_caja is
  'Turnos simples de la Terminal PWA. El cajero se identifica solo por nombre; no necesita cuenta propia.';

commit;
