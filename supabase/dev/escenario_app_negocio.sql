begin;

do $$
begin
  if not exists (
    select 1
    from auth.users
    where lower(email) = 'duena.piloto@regalones.local'
  ) then
    raise exception 'No existe la cuenta local duena.piloto@regalones.local';
  end if;
end;
$$;

insert into public.negocios (
  id,
  nombre,
  slug,
  rut,
  rubro,
  estado
) values (
  '71000000-0000-0000-0000-000000000001',
  'Almacén Piloto Regalones',
  'almacen-piloto-regalones',
  '999999891',
  'Almacén',
  'activo'
)
on conflict (id) do update
set
  nombre = excluded.nombre,
  slug = excluded.slug,
  rut = excluded.rut,
  rubro = excluded.rubro,
  estado = excluded.estado;

insert into public.sucursales (
  id,
  negocio_id,
  nombre,
  direccion,
  comuna,
  estado
) values (
  '72000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  'La Serena Centro',
  'Avenida Piloto 123',
  'La Serena',
  'activa'
)
on conflict (id) do update
set
  negocio_id = excluded.negocio_id,
  nombre = excluded.nombre,
  direccion = excluded.direccion,
  comuna = excluded.comuna,
  estado = excluded.estado;

insert into public.miembros_negocio (
  negocio_id,
  usuario_id,
  rol,
  estado
)
select
  '71000000-0000-0000-0000-000000000001'::uuid,
  usuario.id,
  'propietario'::public.rol_miembro_negocio,
  'activo'::public.estado_miembro_negocio
from auth.users as usuario
where lower(usuario.email) = 'duena.piloto@regalones.local'
on conflict (negocio_id, usuario_id) do update
set
  rol = excluded.rol,
  estado = excluded.estado;

commit;
