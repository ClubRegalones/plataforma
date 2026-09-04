begin;

alter table public.sesiones_lector_movil
drop constraint sesiones_lector_movil_fechas_validas;

alter table public.sesiones_lector_movil
add constraint sesiones_lector_movil_fechas_validas
check (
  expira_vinculacion_en > creado_en
  and expira_en > expira_vinculacion_en
  and expira_en <= creado_en + interval '16 hours 5 minutes'
);

create or replace function public.crear_vinculacion_lector_movil(
  p_terminal_id uuid,
  p_nombre_lector text default null
)
returns table (
  sesion_id uuid,
  terminal_id uuid,
  caja_id uuid,
  token_vinculacion text,
  expira_vinculacion_en timestamptz,
  expira_sesion_en timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_caja_id uuid;
  v_token text;
  v_ahora timestamptz := clock_timestamp();
  v_sesion_id uuid;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión en la terminal'
      using errcode = '42501';
  end if;

  select terminal.caja_id
  into v_caja_id
  from public.terminales as terminal
  where terminal.id = p_terminal_id
    and terminal.estado = 'activa';

  if v_caja_id is null or not public.es_operador_terminal(p_terminal_id) then
    raise exception 'No tienes acceso a una terminal activa'
      using errcode = '42501';
  end if;

  if p_nombre_lector is not null
    and char_length(btrim(p_nombre_lector)) not between 1 and 120 then
    raise exception 'El nombre del lector no es válido'
      using errcode = '22023';
  end if;

  update public.sesiones_lector_movil as sesion
  set
    estado = 'reemplazada',
    token_vinculacion_hash = null,
    token_lector_hash = null,
    cerrada_en = v_ahora
  where sesion.terminal_id = p_terminal_id
    and sesion.estado in ('pendiente_vinculacion', 'vinculada');

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.sesiones_lector_movil (
    terminal_id,
    caja_id,
    creada_por,
    token_vinculacion_hash,
    nombre_lector,
    estado,
    expira_vinculacion_en,
    expira_en
  ) values (
    p_terminal_id,
    v_caja_id,
    v_usuario_id,
    encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    ),
    nullif(btrim(p_nombre_lector), ''),
    'pendiente_vinculacion',
    v_ahora + interval '5 minutes',
    v_ahora + interval '16 hours'
  )
  returning id into v_sesion_id;

  return query
  select
    v_sesion_id,
    p_terminal_id,
    v_caja_id,
    v_token,
    v_ahora + interval '5 minutes',
    v_ahora + interval '16 hours';
end;
$$;

comment on function public.crear_vinculacion_lector_movil(uuid, text) is
  'Vincula un celular lector a una Terminal PWA por un turno máximo de dieciséis horas.';

commit;
