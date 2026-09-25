-- ============================================================================
-- RUT obligatorio para negocios
-- ============================================================================
-- Requisitos previos:
--   - Todos los negocios existentes deben tener RUT.
--   - Todo RUT existente debe estar en formato canónico y ser válido.
--
-- La migración se detiene explícitamente si esos requisitos no se cumplen.
-- ============================================================================

do $$
declare
  v_sin_rut bigint;
  v_rut_invalidos bigint;
begin
  select count(*)
  into v_sin_rut
  from public.negocios
  where rut is null;

  if v_sin_rut > 0 then
    raise exception
      'No se puede hacer obligatorio negocios.rut: todavía existen % negocio(s) sin RUT.',
      v_sin_rut
      using errcode = '23502';
  end if;

  select count(*)
  into v_rut_invalidos
  from public.negocios
  where rut is not null
    and (
      not public.es_rut_valido(rut)
      or rut is distinct from public.normalizar_rut(rut)
    );

  if v_rut_invalidos > 0 then
    raise exception
      'No se puede hacer obligatorio negocios.rut: existen % RUT(s) inválidos o no canónicos.',
      v_rut_invalidos
      using errcode = '23514';
  end if;
end;
$$;

alter table public.negocios
  validate constraint negocios_rut_canonico_valido;

alter table public.negocios
  alter column rut set not null;

comment on column public.negocios.rut is
  'RUT obligatorio del negocio en formato canónico, sin puntos ni guion.';


-- ============================================================================
-- crear_negocio(): RUT obligatorio, validado y normalizado
-- ============================================================================

-- La versión anterior tenía p_rut DEFAULT NULL. PostgreSQL no permite quitar
-- defaults de parámetros mediante CREATE OR REPLACE, por eso reemplazamos la
-- función eliminando primero la firma existente y recreándola sin default en p_rut.
drop function public.crear_negocio(text, text, text, text, text, text);

create function public.crear_negocio(
  p_nombre text,
  p_slug text,
  p_rubro text,
  p_rut text,
  p_descripcion text default null,
  p_logo_url text default null
)
returns public.negocios
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_negocio public.negocios;
  v_rut text;
  v_constraint text;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión para crear un negocio'
      using errcode = '42501';
  end if;

  if p_rut is null or btrim(p_rut) = '' then
    raise exception 'El RUT del negocio es obligatorio'
      using errcode = '23502';
  end if;

  if not public.es_rut_valido(p_rut) then
    raise exception 'El RUT del negocio no es válido'
      using errcode = '23514';
  end if;

  v_rut := public.normalizar_rut(p_rut);

  insert into public.negocios (
    nombre,
    slug,
    rubro,
    rut,
    descripcion,
    logo_url
  )
  values (
    btrim(p_nombre),
    lower(btrim(p_slug)),
    btrim(p_rubro),
    v_rut,
    nullif(btrim(p_descripcion), ''),
    nullif(btrim(p_logo_url), '')
  )
  returning * into v_negocio;

  insert into public.miembros_negocio (
    negocio_id,
    usuario_id,
    rol
  )
  values (
    v_negocio.id,
    v_usuario_id,
    'propietario'
  );

  return v_negocio;

exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;

    if v_constraint = 'negocios_rut_unico' then
      raise exception 'Ya existe un negocio registrado con este RUT'
        using
          errcode = '23505',
          constraint = 'negocios_rut_unico';
    end if;

    raise;
end;
$$;

revoke all on function public.crear_negocio(
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon;

grant execute on function public.crear_negocio(
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

comment on function public.crear_negocio(text, text, text, text, text, text) is
  'Crea un negocio para el usuario autenticado. El RUT es obligatorio, se valida y se almacena en formato canónico.';
