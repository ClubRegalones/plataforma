-- ============================================================================
-- IDENTIDAD RUT V1 · BASE
--
-- Decisiones (Mapa Maestro V1.2, 23 sep 2026):
--   - El RUT identifica a la persona (vecino) y a la organización (negocio).
--   - Formato canónico guardado: solo dígitos + DV en mayúscula, sin puntos
--     ni guion, sin ceros a la izquierda. Ej: 12.345.678-k -> 12345678K
--   - Una sola lógica en BD para todas las apps.
--   - El RUT del vecino nunca va en QR, NFC ni llavero. Las RPC de caja solo
--     devuelven la versión enmascarada.
--   - Reemplaza el criterio "NO se almacena RUT" de la migración
--     20260910070000 (activación de llaveros).
--   - La caja deja de identificar vecinos por teléfono.
--
-- Esta migración NO modifica crear_negocio() ni crear_perfil_usuario():
-- esos cambios van en migraciones propias, con sus pruebas.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Funciones centrales de RUT
-- ----------------------------------------------------------------------------

create function public.normalizar_rut(p_rut text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    ltrim(upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g')), '0'),
    ''
  );
$$;

comment on function public.normalizar_rut(text) is
  'Normaliza un RUT chileno al formato canónico (dígitos + DV, sin puntos ni guion, K mayúscula). No valida el DV.';


create function public.calcular_dv_rut(p_cuerpo text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_suma integer := 0;
  v_factor integer := 2;
  v_resto integer;
begin
  if p_cuerpo is null or p_cuerpo !~ '^[0-9]+$' then
    return null;
  end if;

  for i in reverse char_length(p_cuerpo)..1 loop
    v_suma := v_suma + substr(p_cuerpo, i, 1)::integer * v_factor;
    v_factor := case when v_factor = 7 then 2 else v_factor + 1 end;
  end loop;

  v_resto := 11 - (v_suma % 11);

  return case v_resto
    when 11 then '0'
    when 10 then 'K'
    else v_resto::text
  end;
end;
$$;

comment on function public.calcular_dv_rut(text) is
  'Calcula el dígito verificador (módulo 11) del cuerpo numérico de un RUT.';


create function public.es_rut_valido(p_rut text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    (
      -- 1) La entrada solo puede contener dígitos, K/k, puntos, guion y
      --    espacios. Cualquier otro carácter la invalida, aunque al
      --    quitarlo quedara un RUT correcto (ej: 'abc12.345.678-5xyz').
      -- 2) Ya normalizada: cuerpo de 1 a 8 dígitos + DV. La validez la
      --    decide el dígito verificador.
      select
        p_rut ~ '^[0-9kK. -]+$'
        and n ~ '^[0-9]{1,8}[0-9K]$'
        and public.calcular_dv_rut(left(n, -1)) = right(n, 1)
      from (select public.normalizar_rut(p_rut) as n) as x
    ),
    false
  );
$$;

comment on function public.es_rut_valido(text) is
  'Verdadero si la entrada usa solo dígitos, K, puntos, guion o espacios, el cuerpo tiene entre 1 y 8 dígitos y el DV es correcto.';


create function public.formatear_rut(p_rut text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when public.es_rut_valido(p_rut) then
      regexp_replace(left(public.normalizar_rut(p_rut), -1), '(\d)(?=(\d{3})+$)', '\1.', 'g')
        || '-' || right(public.normalizar_rut(p_rut), 1)
    else null
  end;
$$;

comment on function public.formatear_rut(text) is
  'Devuelve el RUT con puntos y guion para mostrar (12.345.678-9). Null si no es válido.';


create function public.enmascarar_rut(p_rut text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when public.es_rut_valido(p_rut) then
      '•••••' || right(left(public.normalizar_rut(p_rut), -1), 3)
        || '-' || right(public.normalizar_rut(p_rut), 1)
    else null
  end;
$$;

comment on function public.enmascarar_rut(text) is
  'Versión parcial para verificación en caja: •••••678-9. Nunca devuelve el RUT completo.';


-- Las funciones son puras y no leen tablas: se pueden exponer para validar
-- en vivo desde los formularios.
grant execute on function public.normalizar_rut(text) to anon, authenticated;
grant execute on function public.calcular_dv_rut(text) to anon, authenticated;
grant execute on function public.es_rut_valido(text) to anon, authenticated;
grant execute on function public.formatear_rut(text) to anon, authenticated;
grant execute on function public.enmascarar_rut(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. RUT del vecino en perfiles
--    Nullable a nivel general (un administrador de negocio no necesita RUT
--    personal). El registro de vecino lo exigirá en su propia función.
-- ----------------------------------------------------------------------------

alter table public.perfiles
  add column rut varchar(9);

alter table public.perfiles
  add constraint perfiles_rut_canonico_valido check (
    rut is null
    or (rut = public.normalizar_rut(rut) and public.es_rut_valido(rut))
  );

create unique index perfiles_rut_unico
  on public.perfiles (rut)
  where rut is not null;

comment on column public.perfiles.rut is
  'RUT personal del vecino en formato canónico. Identidad única de la cuenta Regalones. Nunca se usa en QR, NFC ni llavero.';


-- ----------------------------------------------------------------------------
-- 3. RUT del negocio
--    La columna y el índice único ya existen (varchar(20), nullable).
--    Se limpian vacíos, se normalizan los existentes y se valida formato.
--    El NOT NULL se aplica en otra migración, después de completar el RUT
--    de los negocios QA.
-- ----------------------------------------------------------------------------

update public.negocios
set rut = null
where rut is not null and btrim(rut) = '';

-- Antes de normalizar: si dos negocios quedarían con el mismo RUT canónico
-- (ej: '12.345.678-5' y '123456785'), el índice único negocios_rut_unico
-- haría fallar la migración a mitad de camino. Se detecta y se detiene con
-- un mensaje claro para corregirlos a mano.
do $$
declare
  v_duplicados text;
begin
  select string_agg(
    format('%s -> %s', grupo.canonico, grupo.originales),
    '; '
  )
  into v_duplicados
  from (
    select
      public.normalizar_rut(rut) as canonico,
      string_agg(format('%s (%s)', rut, id), ', ' order by rut) as originales
    from public.negocios
    where rut is not null
      and public.es_rut_valido(rut)
    group by public.normalizar_rut(rut)
    having count(*) > 1
  ) as grupo;

  if v_duplicados is not null then
    raise exception
      'Negocios con el mismo RUT en distinto formato: %. Corregir antes de aplicar esta migración.',
      v_duplicados
      using errcode = '23505';
  end if;
end;
$$;

update public.negocios
set rut = public.normalizar_rut(rut)
where rut is not null
  and public.es_rut_valido(rut)
  and rut <> public.normalizar_rut(rut);

-- NOT VALID: no falla si quedara algún RUT antiguo inválido; se valida
-- explícitamente al final cuando no existan.
alter table public.negocios
  add constraint negocios_rut_canonico_valido check (
    rut is null
    or (rut = public.normalizar_rut(rut) and public.es_rut_valido(rut))
  ) not valid;

do $$
begin
  if not exists (
    select 1 from public.negocios
    where rut is not null
      and not (rut = public.normalizar_rut(rut) and public.es_rut_valido(rut))
  ) then
    alter table public.negocios validate constraint negocios_rut_canonico_valido;
  else
    raise notice 'Hay negocios con RUT inválido: corregirlos y validar negocios_rut_canonico_valido';
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- 4. La caja deja de identificar vecinos por teléfono
--    App Negocio no usa estas funciones (verificado en apps/negocio).
-- ----------------------------------------------------------------------------

revoke execute on function public.terminal_buscar_vecino_por_telefono(
  text, uuid, uuid, text
) from public, anon, authenticated;

revoke execute on function public.terminal_crear_solicitud_compra_por_telefono(
  text, integer, text, uuid, uuid, text
) from public, anon, authenticated;
