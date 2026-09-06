begin;

create function public.listar_cajeros_negocio_gestion(
  p_negocio_id uuid
)
returns table (
  cajero_id uuid,
  nombre text,
  apellido text,
  rol public.rol_cajero_negocio,
  estado public.estado_cajero_negocio,
  sucursal_ids uuid[],
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para consultar cajeros'
      using errcode = '42501';
  end if;

  if not public.es_admin_regalones()
    and not public.es_miembro_negocio(
      p_negocio_id,
      array[
        'propietario'::public.rol_miembro_negocio,
        'administrador'::public.rol_miembro_negocio
      ]
    )
  then
    raise exception 'No tienes permisos para consultar los cajeros de este negocio'
      using errcode = '42501';
  end if;

  return query
  select
    cajero.id,
    cajero.nombre::text,
    cajero.apellido::text,
    cajero.rol,
    cajero.estado,
    coalesce(
      array_agg(asignacion.sucursal_id order by asignacion.sucursal_id)
        filter (where asignacion.sucursal_id is not null),
      '{}'::uuid[]
    ),
    cajero.creado_en
  from public.cajeros_negocio as cajero
  left join public.cajeros_sucursales as asignacion
    on asignacion.cajero_id = cajero.id
  where cajero.negocio_id = p_negocio_id
  group by
    cajero.id,
    cajero.nombre,
    cajero.apellido,
    cajero.rol,
    cajero.estado,
    cajero.creado_en
  order by cajero.nombre, cajero.apellido nulls first;
end;
$$;

revoke all on function public.listar_cajeros_negocio_gestion(uuid)
  from public, anon, authenticated;
grant execute on function public.listar_cajeros_negocio_gestion(uuid)
  to authenticated;

comment on function public.listar_cajeros_negocio_gestion(uuid) is
  'Lista cajeros operativos y sucursales asignadas para Portal Comercio sin exponer pin_hash.';

commit;
