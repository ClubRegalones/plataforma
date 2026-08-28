begin;

create or replace function public.listar_gestion_llaveros_detalle()
returns table (
  solicitud_id uuid,
  vecino_id uuid,
  nombre_vecino text,
  correo_vecino text,
  telefono_vecino text,
  comuna_vecino text,
  modalidad_atencion public.modalidad_atencion,
  negocio_solicitud_id uuid,
  nombre_negocio text,
  estado_solicitud public.estado_solicitud_llavero,
  solicitado_en timestamptz,
  programado_para timestamptz,
  entregado_en timestamptz,
  observaciones text,
  llavero_id uuid,
  codigo_publico text,
  estado_llavero public.estado_llavero_nfc,
  preparado_en timestamptz,
  activado_en timestamptz,
  metodo_activacion public.metodo_verificacion_llavero
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_regalones() then
    raise exception 'Solo un administrador de Club Regalones puede gestionar llaveros'
      using errcode = '42501';
  end if;

  return query
  select
    solicitud.id,
    solicitud.vecino_id,
    concat_ws(' ', perfil.nombre, perfil.apellido)::text,
    usuario.email::text,
    perfil.telefono::text,
    perfil.comuna::text,
    perfil.modalidad_atencion,
    solicitud.negocio_solicitud_id,
    negocio.nombre::text,
    solicitud.estado,
    solicitud.solicitado_en,
    solicitud.programado_para,
    solicitud.entregado_en,
    solicitud.observaciones::text,
    llavero.id,
    llavero.codigo_publico::text,
    llavero.estado,
    llavero.preparado_en,
    llavero.activado_en,
    llavero.metodo_verificacion_activacion
  from public.solicitudes_llavero as solicitud
  join public.perfiles as perfil
    on perfil.id = solicitud.vecino_id
  join auth.users as usuario
    on usuario.id = solicitud.vecino_id
  left join public.negocios as negocio
    on negocio.id = solicitud.negocio_solicitud_id
  left join public.llaveros_nfc as llavero
    on llavero.solicitud_id = solicitud.id
  order by
    case solicitud.estado
      when 'pendiente' then 1
      when 'programada_entrega' then 2
      when 'entregada' then 3
      else 4
    end,
    solicitud.solicitado_en desc;
end;
$$;

revoke all on function public.listar_gestion_llaveros_detalle()
  from public, anon, authenticated;
grant execute on function public.listar_gestion_llaveros_detalle()
  to authenticated;

comment on function public.listar_gestion_llaveros_detalle() is
  'Listado administrativo que asocia cada solicitud exclusivamente con el llavero preparado para esa misma solicitud.';

commit;
