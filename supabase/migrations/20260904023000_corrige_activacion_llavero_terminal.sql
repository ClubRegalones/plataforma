begin;

-- Permite activar llaveros desde Terminal PWA sin sesión humana Auth.
-- La auditoría puede quedar asociada al turno de caja.

alter table public.llaveros_nfc
  drop constraint if exists llaveros_nfc_activacion_valida;

alter table public.llaveros_nfc
  add constraint llaveros_nfc_activacion_valida check (
    estado <> 'activo'
    or (
      vecino_id is not null
      and asignado_en is not null
      and (
        asignado_por is not null
        or turno_caja_activacion_id is not null
      )
    )
  );

comment on constraint llaveros_nfc_activacion_valida
on public.llaveros_nfc is
'Un llavero activo debe tener vecino y asignación auditada por usuario o por turno de Terminal PWA.';

commit;