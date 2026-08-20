begin;

alter table public.perfiles enable row level security;
alter table public.planes enable row level security;
alter table public.negocios enable row level security;
alter table public.suscripciones enable row level security;
alter table public.sucursales enable row level security;
alter table public.cajas enable row level security;
alter table public.miembros_negocio enable row level security;
alter table public.terminales enable row level security;
alter table public.etiquetas_nfc enable row level security;
alter table public.vecinos_negocios enable row level security;
alter table public.solicitudes_compra enable row level security;
alter table public.compras enable row level security;

create policy perfiles_leer_propio_o_admin
on public.perfiles
for select
to authenticated
using (
  id = (select auth.uid())
  or public.es_admin_regalones()
);

create policy perfiles_actualizar_propio
on public.perfiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy planes_leer_activos_o_admin
on public.planes
for select
to authenticated
using (
  estado = 'activo'
  or public.es_admin_regalones()
);

create policy negocios_leer_directorio_o_propios
on public.negocios
for select
to authenticated
using (
  estado = 'activo'
  or public.es_miembro_negocio(id)
  or public.es_admin_regalones()
);

create policy negocios_actualizar_administradores
on public.negocios
for update
to authenticated
using (
  public.es_miembro_negocio(
    id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
  or public.es_admin_regalones()
)
with check (
  public.es_miembro_negocio(
    id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
  or public.es_admin_regalones()
);

create policy suscripciones_leer_negocio_o_admin
on public.suscripciones
for select
to authenticated
using (
  public.es_miembro_negocio(negocio_id)
  or public.es_admin_regalones()
);

create policy sucursales_leer_directorio_o_propias
on public.sucursales
for select
to authenticated
using (
  public.es_miembro_negocio(negocio_id)
  or public.es_admin_regalones()
  or (
    estado = 'activa'
    and exists (
      select 1
      from public.negocios as negocio
      where negocio.id = sucursales.negocio_id
        and negocio.estado = 'activo'
    )
  )
);

create policy sucursales_crear_administradores
on public.sucursales
for insert
to authenticated
with check (
  public.es_miembro_negocio(
    negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
  or public.es_admin_regalones()
);

create policy sucursales_actualizar_administradores
on public.sucursales
for update
to authenticated
using (
  public.es_miembro_negocio(
    negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
  or public.es_admin_regalones()
)
with check (
  public.es_miembro_negocio(
    negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
  or public.es_admin_regalones()
);

create policy cajas_leer_directorio_o_propias
on public.cajas
for select
to authenticated
using (
  public.es_admin_regalones()
  or exists (
    select 1
    from public.sucursales as sucursal
    where sucursal.id = cajas.sucursal_id
      and (
        public.es_miembro_negocio(sucursal.negocio_id)
        or (
          cajas.estado = 'activa'
          and sucursal.estado = 'activa'
          and exists (
            select 1
            from public.negocios as negocio
            where negocio.id = sucursal.negocio_id
              and negocio.estado = 'activo'
          )
        )
      )
  )
);

create policy cajas_crear_administradores
on public.cajas
for insert
to authenticated
with check (
  public.es_admin_regalones()
  or exists (
    select 1
    from public.sucursales as sucursal
    where sucursal.id = cajas.sucursal_id
      and public.es_miembro_negocio(
        sucursal.negocio_id,
        array[
          'propietario'::public.rol_miembro_negocio,
          'administrador'::public.rol_miembro_negocio
        ]
      )
  )
);

create policy cajas_actualizar_administradores
on public.cajas
for update
to authenticated
using (
  public.es_admin_regalones()
  or exists (
    select 1
    from public.sucursales as sucursal
    where sucursal.id = cajas.sucursal_id
      and public.es_miembro_negocio(
        sucursal.negocio_id,
        array[
          'propietario'::public.rol_miembro_negocio,
          'administrador'::public.rol_miembro_negocio
        ]
      )
  )
)
with check (
  public.es_admin_regalones()
  or exists (
    select 1
    from public.sucursales as sucursal
    where sucursal.id = cajas.sucursal_id
      and public.es_miembro_negocio(
        sucursal.negocio_id,
        array[
          'propietario'::public.rol_miembro_negocio,
          'administrador'::public.rol_miembro_negocio
        ]
      )
  )
);

create policy miembros_negocio_leer_propios
on public.miembros_negocio
for select
to authenticated
using (
  usuario_id = (select auth.uid())
  or public.es_miembro_negocio(negocio_id)
  or public.es_admin_regalones()
);

create policy miembros_negocio_crear_administradores
on public.miembros_negocio
for insert
to authenticated
with check (
  public.es_miembro_negocio(
    negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
  or public.es_admin_regalones()
);

create policy miembros_negocio_actualizar_administradores
on public.miembros_negocio
for update
to authenticated
using (
  public.es_miembro_negocio(
    negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
  or public.es_admin_regalones()
)
with check (
  public.es_miembro_negocio(
    negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  )
  or public.es_admin_regalones()
);

create policy terminales_leer_negocio
on public.terminales
for select
to authenticated
using (
  public.es_admin_regalones()
  or exists (
    select 1
    from public.cajas as caja
    join public.sucursales as sucursal
      on sucursal.id = caja.sucursal_id
    where caja.id = terminales.caja_id
      and public.es_miembro_negocio(sucursal.negocio_id)
  )
);

create policy etiquetas_nfc_leer_negocio
on public.etiquetas_nfc
for select
to authenticated
using (
  public.es_miembro_negocio(negocio_id)
  or public.es_admin_regalones()
);

create policy vecinos_negocios_leer_participantes
on public.vecinos_negocios
for select
to authenticated
using (
  vecino_id = (select auth.uid())
  or public.es_miembro_negocio(negocio_id)
  or public.es_admin_regalones()
);

create policy solicitudes_compra_leer_participantes
on public.solicitudes_compra
for select
to authenticated
using (
  vecino_id = (select auth.uid())
  or public.es_admin_regalones()
  or exists (
    select 1
    from public.cajas as caja
    join public.sucursales as sucursal
      on sucursal.id = caja.sucursal_id
    where caja.id = solicitudes_compra.caja_id
      and public.es_miembro_negocio(sucursal.negocio_id)
  )
);

create policy compras_leer_participantes
on public.compras
for select
to authenticated
using (
  vecino_id = (select auth.uid())
  or public.es_miembro_negocio(negocio_id)
  or public.es_admin_regalones()
);

revoke all on table public.perfiles from anon, authenticated;
revoke all on table public.planes from anon, authenticated;
revoke all on table public.negocios from anon, authenticated;
revoke all on table public.suscripciones from anon, authenticated;
revoke all on table public.sucursales from anon, authenticated;
revoke all on table public.cajas from anon, authenticated;
revoke all on table public.miembros_negocio from anon, authenticated;
revoke all on table public.terminales from anon, authenticated;
revoke all on table public.etiquetas_nfc from anon, authenticated;
revoke all on table public.vecinos_negocios from anon, authenticated;
revoke all on table public.solicitudes_compra from anon, authenticated;
revoke all on table public.compras from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on table public.perfiles to authenticated;
grant update (nombre, apellido, telefono, comuna, avatar_url)
  on table public.perfiles to authenticated;

grant select on table public.planes to authenticated;

grant select on table public.negocios to authenticated;
grant update (nombre, slug, rut, rubro, descripcion, logo_url)
  on table public.negocios to authenticated;

grant select on table public.suscripciones to authenticated;

grant select on table public.sucursales to authenticated;
grant insert (negocio_id, nombre, direccion, comuna)
  on table public.sucursales to authenticated;
grant update (nombre, direccion, comuna, estado)
  on table public.sucursales to authenticated;

grant select on table public.cajas to authenticated;
grant insert (sucursal_id, nombre, codigo)
  on table public.cajas to authenticated;
grant update (nombre, codigo, estado)
  on table public.cajas to authenticated;

grant select on table public.miembros_negocio to authenticated;
grant insert (negocio_id, usuario_id, rol, pin_hash)
  on table public.miembros_negocio to authenticated;
grant update (rol, pin_hash, estado)
  on table public.miembros_negocio to authenticated;

grant select (
  id,
  caja_id,
  identificador_publico,
  nombre_dispositivo,
  version_app,
  estado,
  ultima_conexion_en,
  creado_en,
  actualizado_en
) on table public.terminales to authenticated;

grant select (
  id,
  tipo,
  negocio_id,
  sucursal_id,
  caja_id,
  estado,
  instalado_en,
  creado_en,
  actualizado_en
) on table public.etiquetas_nfc to authenticated;

grant select on table public.vecinos_negocios to authenticated;
grant select on table public.solicitudes_compra to authenticated;
grant select on table public.compras to authenticated;

revoke all on function public.establecer_actualizado_en()
  from public, anon, authenticated;
revoke all on function public.crear_perfil_usuario()
  from public, anon, authenticated;
revoke all on function public.validar_contexto_etiqueta_nfc()
  from public, anon, authenticated;
revoke all on function public.validar_contexto_compra()
  from public, anon, authenticated;
revoke all on function public.es_admin_regalones()
  from public, anon;
revoke all on function public.es_miembro_negocio(
  uuid,
  public.rol_miembro_negocio[]
) from public, anon;
revoke all on function public.crear_negocio(
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon;
revoke all on function public.resolver_etiqueta(text) from public;
revoke all on function public.crear_solicitud_compra(
  text,
  text,
  timestamptz,
  integer
) from public, anon;
revoke all on function public.informar_monto_vecino(uuid, integer)
  from public, anon;
revoke all on function public.informar_monto_cajero(uuid, integer)
  from public, anon;
revoke all on function public.corregir_solicitud_compra(uuid, integer, text)
  from public, anon;
revoke all on function public.aprobar_compra(
  uuid,
  text,
  public.origen_compra
) from public, anon;
revoke all on function public.rechazar_solicitud_compra(uuid, text)
  from public, anon;

grant execute on function public.es_admin_regalones()
  to authenticated;
grant execute on function public.es_miembro_negocio(
  uuid,
  public.rol_miembro_negocio[]
) to authenticated;
grant execute on function public.crear_negocio(
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;
grant execute on function public.resolver_etiqueta(text)
  to anon, authenticated;
grant execute on function public.crear_solicitud_compra(
  text,
  text,
  timestamptz,
  integer
) to authenticated;
grant execute on function public.informar_monto_vecino(uuid, integer)
  to authenticated;
grant execute on function public.informar_monto_cajero(uuid, integer)
  to authenticated;
grant execute on function public.corregir_solicitud_compra(uuid, integer, text)
  to authenticated;
grant execute on function public.aprobar_compra(
  uuid,
  text,
  public.origen_compra
) to authenticated;
grant execute on function public.rechazar_solicitud_compra(uuid, text)
  to authenticated;

commit;
