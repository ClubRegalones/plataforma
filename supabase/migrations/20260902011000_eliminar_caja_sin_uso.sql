begin;

create or replace function public.eliminar_caja_sin_uso(
  p_caja_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_negocio_id uuid;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para eliminar una caja'
      using errcode = '42501';
  end if;

  select sucursal.negocio_id
  into v_negocio_id
  from public.cajas as caja
  join public.sucursales as sucursal
    on sucursal.id = caja.sucursal_id
  where caja.id = p_caja_id;

  if v_negocio_id is null then
    raise exception 'La caja no existe'
      using errcode = 'P0002';
  end if;

  if not public.es_miembro_negocio(
    v_negocio_id,
    array[
      'propietario'::public.rol_miembro_negocio,
      'administrador'::public.rol_miembro_negocio
    ]
  ) then
    raise exception 'Solo el propietario o administrador puede eliminar una caja'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.terminales as terminal
    where terminal.caja_id = p_caja_id
  ) then
    raise exception 'Esta caja ya tiene historial de Terminales y no puede eliminarse'
      using errcode = '23503';
  end if;

  begin
    delete from public.cajas
    where id = p_caja_id;

  exception
    when foreign_key_violation then
      raise exception 'Esta caja ya tiene historial asociado y no puede eliminarse'
        using errcode = '23503';
  end;

  return true;
end;
$$;

revoke all
on function public.eliminar_caja_sin_uso(uuid)
from public, anon;

grant execute
on function public.eliminar_caja_sin_uso(uuid)
to authenticated;

comment on function public.eliminar_caja_sin_uso(uuid) is
  'Elimina una caja únicamente cuando pertenece a un negocio administrado por el usuario y no posee historial asociado.';

commit;