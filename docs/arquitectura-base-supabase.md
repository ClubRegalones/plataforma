# Base de Supabase para los Hitos A, B y C

## Fuente de verdad

La estructura sigue el documento **Club Regalones — Diccionario de Datos V1**,
versión 1.0 del 20 de agosto de 2026. Las tablas y conceptos propios se nombran
en español, minúsculas y `snake_case`.

Se conservan en inglés los identificadores técnicos que pertenecen a Supabase o
son convenciones de integración, por ejemplo `auth.users`, `uuid`, `jsonb`,
`idempotency_key`, `token_hash`, `avatar_url`, `logo_url` y `user_agent`.

## Alcance implementado

Esta etapa implementa:

- **Hito A — Identidad y negocios.**
- **Hito B — Terminal/NFC, llaveros y compra digital o asistida.**
- **Hito C — Acumulación contable de REGIS.**

Una compra confirmada acredita el 5 % del dinero realmente pagado con la regla
versionada vigente. En el piloto, 1 REGIS equivale a $50 CLP y una compra debe
alcanzar $1.000 para acumular. Todavía no se crean beneficios ni canjes.

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
| C | `reglas_regis` | Versiones de la regla económica global o por negocio. |
| C | `configuraciones_riesgo_regis` | Umbrales internos, desactivados hasta su aprobación. |
| C | `movimientos_regis` | Ledger inmutable y fuente de verdad histórica. |
| C | `saldos_regis` | Resumen por vecino y negocio, incluido el remanente. |
| C | `alertas_riesgo` | Acreditaciones pendientes por una regla de riesgo. |

## Flujo de compra implementado

1. Supabase Auth crea automáticamente una fila en `perfiles`.
2. `resolver_etiqueta()` identifica una etiqueta activa sin exponer su hash.
3. `crear_solicitud_compra()` crea una solicitud idempotente para el vecino.
4. El vecino o el cajero informa el monto mediante una RPC controlada.
5. El cajero puede corregir el monto dejando un motivo explícito.
6. `aprobar_compra()` bloquea la solicitud, valida negocio/sucursal/caja y crea
   una única fila permanente en `compras`.
7. La misma transacción crea o actualiza `vecinos_negocios`.
8. `acreditar_regis_compra()` selecciona la regla vigente y registra de forma
   atómica el movimiento y su saldo derivado.
9. Una compra bajo el mínimo se confirma, pero registra cero REGIS.
10. Una alerta no anula la compra: deja los REGIS en `pendientes`.
11. `rechazar_solicitud_compra()` registra un rechazo con motivo.

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
- El frontend no inserta ni modifica movimientos o saldos REGIS.
- Los movimientos REGIS no admiten `UPDATE` ni `DELETE`; toda corrección futura
  se representará mediante un movimiento compensatorio.
- RLS separa los saldos por vecino y por negocio.

## Decisiones deliberadamente aplazadas

- `beneficios` y `canjes` (Hito D).
- Valores definitivos de los umbrales antifraude y su flujo de revisión.
- Liberación, bloqueo y reversa contable de movimientos pendientes.
- Auditoría general y aceptaciones legales (Hito E).
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
