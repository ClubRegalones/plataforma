# Base de Supabase para los Hitos A y B

## Fuente de verdad

La estructura sigue el documento **Club Regalones — Diccionario de Datos V1**,
versión 1.0 del 20 de agosto de 2026. Las tablas y conceptos propios se nombran
en español, minúsculas y `snake_case`.

Se conservan en inglés los identificadores técnicos que pertenecen a Supabase o
son convenciones de integración, por ejemplo `auth.users`, `uuid`, `jsonb`,
`idempotency_key`, `token_hash`, `avatar_url`, `logo_url` y `user_agent`.

## Alcance implementado

Esta etapa implementa solamente:

- **Hito A — Identidad y negocios.**
- **Hito B — Terminal/NFC y compra sin REGIS.**

Todavía no calcula REGIS, no crea beneficios ni canjes y no inventa la fórmula
de acumulación pendiente. Una compra confirmada demuestra el flujo de
identificación y aprobación, pero no acredita puntos.

## Tablas

| Hito | Tabla | Responsabilidad |
| --- | --- | --- |
| A | `perfiles` | Perfil complementario a `auth.users`. |
| A | `planes` | Planes y límites comerciales todavía sin datos definitivos. |
| A | `negocios` | Comercios incorporados a Club Regalones. |
| A | `suscripciones` | Historial de planes por negocio. |
| A | `sucursales` | Locales físicos de un negocio. |
| A | `cajas` | Cajas físicas o lógicas de una sucursal. |
| A | `miembros_negocio` | Roles propietario, administrador y cajero. |
| B | `terminales` | Dispositivos autorizados vinculados a una caja. |
| B | `etiquetas_nfc` | Tags NFC o QR de inscripción o compra. |
| B | `vecinos_negocios` | Relación de fidelización entre vecino y negocio. |
| B | `solicitudes_compra` | Solicitud temporal anterior a la aprobación. |
| B | `compras` | Compra aprobada y permanente. |

## Flujo de compra implementado

1. Supabase Auth crea automáticamente una fila en `perfiles`.
2. `resolver_etiqueta()` identifica una etiqueta activa sin exponer su hash.
3. `crear_solicitud_compra()` crea una solicitud idempotente para el vecino.
4. El vecino o el cajero informa el monto mediante una RPC controlada.
5. El cajero puede corregir el monto dejando un motivo explícito.
6. `aprobar_compra()` bloquea la solicitud, valida negocio/sucursal/caja y crea
   una única fila permanente en `compras`.
7. La misma transacción crea o actualiza `vecinos_negocios`.
8. `rechazar_solicitud_compra()` registra un rechazo con motivo.

La duración de `solicitudes_compra` no se encuentra fijada en el diccionario.
Por eso `crear_solicitud_compra()` recibe `p_expira_en`: no se ha hardcodeado un
plazo funcional que todavía no fue aprobado.

## Seguridad

- Todas las tablas expuestas tienen RLS.
- Las solicitudes y compras no admiten `INSERT` directo desde el frontend.
- Las operaciones críticas pasan por funciones `security definer` con
  `search_path` vacío y validación explícita de `auth.uid()`.
- La autorización se obtiene de `miembros_negocio`; nunca de metadatos que el
  usuario pueda editar.
- `token_hash` de terminales y etiquetas no tiene permiso de lectura para el
  rol `authenticated`.
- El frontend no puede cambiar estados de aprobación global de un negocio ni
  los roles de plataforma de un perfil.
- Las relaciones históricas de una compra se validan en PostgreSQL para evitar
  mezclar una caja, sucursal o negocio incompatibles.

## Decisiones deliberadamente aplazadas

- Fórmula de acumulación y liberación de REGIS.
- `movimientos_regis` y `saldos_regis` (Hito C).
- `beneficios` y `canjes` (Hito D).
- Reversa contable, alertas, auditoría y aceptaciones legales (Hito E).
- Valores reales para `planes` y `suscripciones`.
- Duración estándar de una solicitud de compra.

## Desarrollo local

Las migraciones viven en `supabase/migrations` y se aplican en orden:

```bash
pnpm db:start
pnpm db:reset
pnpm db:test
pnpm db:lint
```

`pnpm db:reset` reconstruye únicamente la base local. El despliegue remoto con
`supabase db push` se realizará en un paso separado después de revisar las
migraciones y todas las pruebas.
