-- Datos controlados para validar el primer flujo del MVP en el proyecto remoto.
-- Este archivo NO es una migración y se puede ejecutar más de una vez.
-- La etiqueta almacena solamente el hash; el token visible se usa en la prueba.

begin;

do $$
declare
  v_comercio_id uuid;
  v_vecino_id uuid;
  v_negocio_id uuid;
  v_sucursal_id uuid := '10000000-0000-4000-8000-000000000002';
  v_caja_id uuid := '10000000-0000-4000-8000-000000000003';
  v_token_etiqueta text := 'regalones-prueba-compra-001';
begin
  select usuario.id
  into v_comercio_id
  from auth.users as usuario
  where lower(usuario.email) = 'comercio.prueba@clubregalones.test'
    and usuario.email_confirmed_at is not null;

  if v_comercio_id is null then
    raise exception
      'No existe el usuario confirmado comercio.prueba@clubregalones.test';
  end if;

  select usuario.id
  into v_vecino_id
  from auth.users as usuario
  where lower(usuario.email) = 'vecino.prueba@clubregalones.test'
    and usuario.email_confirmed_at is not null;

  if v_vecino_id is null then
    raise exception
      'No existe el usuario confirmado vecino.prueba@clubregalones.test';
  end if;

  insert into public.negocios (
    nombre,
    slug,
    rut,
    rubro,
    descripcion,
    estado
  )
  values (
    'Comercio de prueba',
    'comercio-prueba-flujo',
    '999999956',
    'Almacén de barrio',
    'Datos controlados para validar el primer flujo del MVP.',
    'activo'
  )
  on conflict (slug) do update
  set
    nombre = excluded.nombre,
    rut = excluded.rut,
    rubro = excluded.rubro,
    descripcion = excluded.descripcion,
    estado = 'activo'
  returning id into v_negocio_id;

  insert into public.sucursales (
    id,
    negocio_id,
    nombre,
    direccion,
    comuna,
    estado
  )
  values (
    v_sucursal_id,
    v_negocio_id,
    'Sucursal de prueba',
    'Dirección de prueba 123',
    'Santiago',
    'activa'
  )
  on conflict (id) do update
  set
    negocio_id = excluded.negocio_id,
    nombre = excluded.nombre,
    direccion = excluded.direccion,
    comuna = excluded.comuna,
    estado = 'activa';

  insert into public.cajas (
    id,
    sucursal_id,
    nombre,
    codigo,
    estado
  )
  values (
    v_caja_id,
    v_sucursal_id,
    'Caja de prueba',
    'CAJA-PRUEBA-01',
    'activa'
  )
  on conflict (id) do update
  set
    sucursal_id = excluded.sucursal_id,
    nombre = excluded.nombre,
    codigo = excluded.codigo,
    estado = 'activa';

  insert into public.miembros_negocio (
    negocio_id,
    usuario_id,
    rol,
    estado
  )
  values (
    v_negocio_id,
    v_comercio_id,
    'propietario',
    'activo'
  )
  on conflict (negocio_id, usuario_id) do update
  set
    rol = 'propietario',
    estado = 'activo';

  insert into public.etiquetas_nfc (
    tipo,
    token_hash,
    negocio_id,
    sucursal_id,
    caja_id,
    estado,
    instalado_en
  )
  values (
    'compra',
    encode(
      extensions.digest(convert_to(v_token_etiqueta, 'UTF8'), 'sha256'),
      'hex'
    ),
    v_negocio_id,
    v_sucursal_id,
    v_caja_id,
    'activa',
    now()
  )
  on conflict (token_hash) do update
  set
    tipo = 'compra',
    negocio_id = excluded.negocio_id,
    sucursal_id = excluded.sucursal_id,
    caja_id = excluded.caja_id,
    estado = 'activa',
    instalado_en = excluded.instalado_en;
end;
$$;

commit;

select
  negocio.nombre as negocio,
  sucursal.nombre as sucursal,
  caja.nombre as caja,
  miembro.rol,
  'regalones-prueba-compra-001' as token_para_la_prueba
from public.negocios as negocio
join public.sucursales as sucursal
  on sucursal.negocio_id = negocio.id
join public.cajas as caja
  on caja.sucursal_id = sucursal.id
join public.miembros_negocio as miembro
  on miembro.negocio_id = negocio.id
join auth.users as usuario
  on usuario.id = miembro.usuario_id
where negocio.slug = 'comercio-prueba-flujo'
  and lower(usuario.email) = 'comercio.prueba@clubregalones.test';
