# Club Regalones — Diccionario de Datos V1

**Versión:** 1.0  
**Fecha:** 20 de agosto de 2026  
**Estado:** propuesta consolidada previa a migraciones SQL  
**Destino:** implementación en Supabase/PostgreSQL y entrega a Codex

## 1. Alcance del documento

Este diccionario consolida dos fuentes de decisión:

1. El modelo de base de datos definido en la **Guía Técnica de Desarrollo del MVP V1.0** de Club Regalones, especialmente los apartados de roles y permisos, modelo de base de datos, estados del flujo, NFC/QR, compra, seguridad, planes y privacidad.
2. Las decisiones funcionales posteriores del flujo de **beneficios y canjes de REGIS**, incluyendo beneficios configurables por negocio, QR dinámico, reserva temporal de cupos, reserva temporal de REGIS, expiración de reservas y registro del monto real de compra/descuento.

El objetivo es que este documento sea la fuente de referencia antes de crear las migraciones SQL.

> Principio del MVP: **primero se cobra; después se acreditan los REGIS.**

> Principio contable: **`movimientos_regis` es la fuente de verdad e inmutable. `saldos_regis` es un resumen optimizado.**

> Principio de canje: **generar QR = reservar cupo + reservar REGIS; confirmar QR = descontar REGIS + consumir cupo + registrar canje; expirar QR = liberar cupo + liberar REGIS.**

---

# 2. Estándar oficial de nombres

## 2.1 Reglas generales

- Tablas propias en **español**.
- Nombres en **minúsculas**.
- Usar `snake_case`.
- No usar tildes, `ñ`, espacios ni caracteres especiales.
- Tablas en plural.
- Claves foráneas: `<entidad>_id`.
- Fechas/hora: sufijo `_en` cuando representan un instante.
- Campos monetarios en CLP: sufijo opcional `_clp` cuando sea necesario para evitar ambigüedad.
- REGIS se escribe `regis` en código y base de datos.
- Estados se modelan como valores explícitos; evitar booleanos ambiguos para ciclos de vida.
- Todos los IDs principales serán `uuid`, salvo que exista una razón técnica distinta.
- `auth.users` conserva el nombre técnico propio de Supabase.

## 2.2 Convenciones de tipos

| Concepto | Tipo recomendado |
|---|---|
| ID | `uuid` |
| Fecha/hora | `timestamptz` |
| Fecha sin hora | `date` |
| Dinero CLP | `integer` |
| Cantidad de REGIS | `integer` |
| Porcentaje | `numeric(5,2)` |
| Texto breve | `varchar(n)` |
| Texto libre | `text` |
| Sí/No | `boolean` |
| Datos estructurados | `jsonb` |
| Dirección IP | `inet` |

**Regla monetaria:** para CLP se usa `integer`; no usar `float` para dinero.

## 2.3 Campos comunes

Cuando corresponda:

- `id uuid primary key default gen_random_uuid()`
- `creado_en timestamptz not null default now()`
- `actualizado_en timestamptz not null default now()`

`actualizado_en` debe mantenerse mediante trigger común o lógica backend consistente.

---

# 3. Catálogo de estados y valores controlados

La implementación puede usar PostgreSQL ENUM o `text + CHECK`. Para el MVP se recomienda elegir una estrategia y mantenerla en todas las migraciones.

## 3.1 `estado_perfil`

- `activo`
- `bloqueado`
- `eliminado`

## 3.2 `rol_plataforma`

- `usuario`
- `admin_regalones`

## 3.3 `estado_negocio`

- `pendiente`
- `activo`
- `suspendido`
- `rechazado`

## 3.4 `estado_sucursal`

- `activa`
- `inactiva`

## 3.5 `estado_caja`

- `activa`
- `inactiva`
- `bloqueada`

## 3.6 `rol_miembro_negocio`

- `propietario`
- `administrador`
- `cajero`

## 3.7 `estado_miembro_negocio`

- `activo`
- `suspendido`
- `revocado`

## 3.8 `estado_terminal`

- `pendiente_activacion`
- `activa`
- `bloqueada`
- `revocada`

## 3.9 `tipo_etiqueta_nfc`

- `inscripcion`
- `compra`

## 3.10 `estado_etiqueta_nfc`

- `sin_asignar`
- `activa`
- `suspendida`
- `reemplazada`

## 3.11 `estado_solicitud_compra`

- `esperando_monto`
- `esperando_cajero`
- `pendiente_validacion`
- `aprobada`
- `rechazada`
- `vencida`
- `cancelada`

## 3.12 `informado_por`

- `vecino`
- `cajero`

## 3.13 `estado_compra`

- `confirmada`
- `observada`
- `revertida`

## 3.14 `origen_compra`

- `autoservicio`
- `asistido`
- `integracion_pos`

`integracion_pos` se reserva para una etapa futura.

## 3.15 `tipo_movimiento_regis`

- `acreditacion_compra`
- `canje`
- `reversa`
- `ajuste`
- `bonificacion`

## 3.16 `estado_movimiento_regis`

- `pendiente`
- `disponible`
- `canjeado`
- `revertido`
- `bloqueado`

## 3.17 `tipo_beneficio`

- `porcentaje`
- `monto_fijo`
- `producto_gratis`
- `dos_por_uno`
- `personalizado`

## 3.18 `estado_beneficio`

- `borrador`
- `activo`
- `pausado`
- `agotado`
- `finalizado`

## 3.19 `estado_canje`

- `reservado`
- `confirmado`
- `cancelado`
- `vencido`
- `rechazado`

## 3.20 `severidad_riesgo`

- `baja`
- `media`
- `alta`
- `critica`

## 3.21 `estado_alerta_riesgo`

- `abierta`
- `en_revision`
- `resuelta`
- `descartada`

## 3.22 `estado_plan`

- `activo`
- `inactivo`
- `archivado`

## 3.23 `estado_suscripcion`

- `prueba`
- `activa`
- `vencida`
- `suspendida`
- `cancelada`

## 3.24 `tipo_documento_legal`

- `terminos_condiciones`
- `politica_privacidad`
- `consentimiento_comercial`

---

# 4. Resumen de tablas V1

| Nº | Tabla | Grupo | Propósito |
|---:|---|---|---|
| 1 | `perfiles` | Usuarios | Datos complementarios a `auth.users`. |
| 2 | `negocios` | Comercios | Comercio suscrito a Club Regalones. |
| 3 | `sucursales` | Comercios | Locales físicos de un negocio. |
| 4 | `cajas` | Comercios | Cajas físicas/lógicas dentro de una sucursal. |
| 5 | `miembros_negocio` | Acceso | Usuarios autorizados de un negocio. |
| 6 | `terminales` | Terminal | Dispositivos PWA autorizados por caja. |
| 7 | `etiquetas_nfc` | NFC/QR | Tags/tótems de inscripción o compra. |
| 8 | `vecinos_negocios` | Fidelización | Relación entre vecino y negocio. |
| 9 | `solicitudes_compra` | Compras | Solicitud temporal postpago antes de aprobación. |
| 10 | `compras` | Compras | Compra aprobada y permanente. |
| 11 | `beneficios` | Beneficios | Recompensas configuradas por cada negocio. |
| 12 | `canjes` | Canjes | Reserva QR y posterior confirmación/expiración. |
| 13 | `movimientos_regis` | REGIS | Ledger inmutable de movimientos. |
| 14 | `saldos_regis` | REGIS | Resumen de saldos por vecino y negocio. |
| 15 | `alertas_riesgo` | Seguridad | Alertas de fraude o errores. |
| 16 | `registro_auditoria` | Seguridad | Trazabilidad de acciones relevantes. |
| 17 | `planes` | Comercial | Planes y límites técnicos. |
| 18 | `suscripciones` | Comercial | Plan activo/histórico de cada negocio. |
| 19 | `aceptaciones_legales` | Privacidad | Versiones legales aceptadas por usuarios. |

### Tabla pendiente de definición funcional

La Guía Técnica indica que el cálculo de REGIS debe programarse después de que identificación y aprobación funcionen, pero no define todavía la fórmula de acumulación por negocio. Por ello **no se incluye aún una tabla de reglas de acumulación**. Cuando se acuerde si los REGIS dependen de monto, compra, rubro, campañas u otra fórmula, se debe versionar esa regla en una tabla separada en vez de codificarla directamente en React.

---

# 5. Diccionario detallado

## 5.1 `perfiles`

**Propósito:** perfil complementario a `auth.users`. No almacena contraseña. El correo principal permanece en Supabase Auth para evitar duplicación y desincronización.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | — | PK, FK → `auth.users(id)` ON DELETE CASCADE | Mismo UUID del usuario autenticado. |
| `nombre` | `varchar(100)` | No | — | — | Nombre del usuario. |
| `apellido` | `varchar(100)` | Sí | — | — | Apellido del usuario. |
| `telefono` | `varchar(30)` | Sí | — | — | Teléfono de contacto. |
| `comuna` | `varchar(100)` | Sí | — | — | Comuna declarada por el usuario. |
| `avatar_url` | `text` | Sí | — | — | URL del avatar en Storage. |
| `rol_plataforma` | `rol_plataforma` | No | `usuario` | — | Distingue usuario normal de administración global. |
| `estado` | `estado_perfil` | No | `activo` | — | Estado de acceso/perfil. |
| `creado_en` | `timestamptz` | No | `now()` | — | Creación del perfil. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Última actualización. |

**Índices/constraints:**
- PK `id`.
- No duplicar `email` salvo decisión posterior explícita.

---

## 5.2 `negocios`

**Propósito:** entidad principal de cada comercio incorporado a Club Regalones.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Identificador del negocio. |
| `nombre` | `varchar(160)` | No | — | — | Nombre comercial. |
| `slug` | `varchar(180)` | No | — | UNIQUE | Identificador amigable para URL. |
| `rut` | `varchar(20)` | Sí | — | UNIQUE cuando exista | RUT del negocio/empresa. |
| `rubro` | `varchar(120)` | No | — | — | Categoría/rubro principal. |
| `descripcion` | `text` | Sí | — | — | Descripción pública. |
| `logo_url` | `text` | Sí | — | — | Logo en Storage/CDN. |
| `estado` | `estado_negocio` | No | `pendiente` | — | Ciclo de aprobación/suspensión. |
| `creado_en` | `timestamptz` | No | `now()` | — | Alta del negocio. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Último cambio. |

**Decisión:** el plan vigente se obtiene desde `suscripciones`; no se duplica `plan_id` en `negocios`.

---

## 5.3 `sucursales`

**Propósito:** locales/sucursales pertenecientes a un negocio.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Identificador. |
| `negocio_id` | `uuid` | No | — | FK → `negocios(id)` | Negocio propietario. |
| `nombre` | `varchar(140)` | No | — | — | Nombre de la sucursal. |
| `direccion` | `text` | No | — | — | Dirección física. |
| `comuna` | `varchar(100)` | No | — | — | Comuna. |
| `estado` | `estado_sucursal` | No | `activa` | — | Disponibilidad operativa. |
| `creado_en` | `timestamptz` | No | `now()` | — | Alta. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Último cambio. |

**Constraints sugeridos:**
- UNIQUE (`negocio_id`, `nombre`) si el negocio no repite nombres de sucursal.

---

## 5.4 `cajas`

**Propósito:** cajas físicas o lógicas de una sucursal. Sirven como punto de vinculación del tótem/tag y la terminal PWA.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Identificador. |
| `sucursal_id` | `uuid` | No | — | FK → `sucursales(id)` | Sucursal. |
| `nombre` | `varchar(100)` | No | — | — | Ej. “Caja 1”. |
| `codigo` | `varchar(60)` | Sí | — | UNIQUE por sucursal | Código interno opcional. |
| `estado` | `estado_caja` | No | `activa` | — | Estado operativo. |
| `creado_en` | `timestamptz` | No | `now()` | — | Alta. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Último cambio. |

---

## 5.5 `miembros_negocio`

**Propósito:** relaciona usuarios con negocios y define su rol. El dueño no es “el negocio”; es un usuario autorizado dentro del negocio.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Identificador. |
| `negocio_id` | `uuid` | No | — | FK → `negocios(id)` | Negocio al que pertenece. |
| `usuario_id` | `uuid` | No | — | FK → `auth.users(id)` | Usuario autorizado. |
| `rol` | `rol_miembro_negocio` | No | — | — | propietario / administrador / cajero. |
| `pin_hash` | `text` | Sí | — | nunca almacenar PIN plano | PIN opcional para inicio de turno/caja. |
| `estado` | `estado_miembro_negocio` | No | `activo` | — | Estado del acceso. |
| `creado_en` | `timestamptz` | No | `now()` | — | Alta del miembro. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Último cambio. |

**Constraints:**
- UNIQUE (`negocio_id`, `usuario_id`).

---

## 5.6 `terminales`

**Propósito:** dispositivos autorizados que ejecutan la terminal PWA de caja.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Identificador interno. |
| `caja_id` | `uuid` | No | — | FK → `cajas(id)` | Caja vinculada. |
| `identificador_publico` | `varchar(120)` | No | — | UNIQUE | ID público para activación/diagnóstico. |
| `token_hash` | `text` | No | — | UNIQUE | Hash del token secreto del dispositivo. |
| `nombre_dispositivo` | `varchar(120)` | Sí | — | — | Nombre legible. |
| `version_app` | `varchar(40)` | Sí | — | — | Versión de terminal instalada. |
| `estado` | `estado_terminal` | No | `pendiente_activacion` | — | Estado del dispositivo. |
| `ultima_conexion_en` | `timestamptz` | Sí | — | — | Último heartbeat/conexión. |
| `creado_en` | `timestamptz` | No | `now()` | — | Registro. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Cambio. |

**Seguridad:** nunca almacenar el token secreto original; solo su hash.

---

## 5.7 `etiquetas_nfc`

**Propósito:** tags NFC/QR que identifican un punto de inscripción o una caja para iniciar el flujo. El NFC no acredita REGIS por sí solo.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Identificador. |
| `tipo` | `tipo_etiqueta_nfc` | No | — | — | inscripción o compra. |
| `token_hash` | `text` | No | — | UNIQUE | Hash del token que resuelve la URL. |
| `negocio_id` | `uuid` | No | — | FK → `negocios(id)` | Comercio. |
| `sucursal_id` | `uuid` | Sí | — | FK → `sucursales(id)` | Sucursal cuando corresponda. |
| `caja_id` | `uuid` | Sí | — | FK → `cajas(id)` | Caja para tags de compra. |
| `estado` | `estado_etiqueta_nfc` | No | `sin_asignar` | — | Ciclo de vida. |
| `instalado_en` | `timestamptz` | Sí | — | — | Instalación física. |
| `creado_en` | `timestamptz` | No | `now()` | — | Alta. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Cambio. |

**Reglas de negocio:**
- Tipo `compra`: debe resolver negocio + sucursal + caja.
- Tipo `inscripcion`: puede no requerir `caja_id`.

---

## 5.8 `vecinos_negocios`

**Propósito:** relación fidelización entre un vecino y un negocio. Permite saber cuántos vecinos tiene el comercio y su actividad básica sin entregar datos de contacto que no correspondan.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Identificador. |
| `vecino_id` | `uuid` | No | — | FK → `auth.users(id)` | Vecino. |
| `negocio_id` | `uuid` | No | — | FK → `negocios(id)` | Comercio. |
| `primera_compra_en` | `timestamptz` | Sí | — | — | Primera compra aprobada. |
| `ultima_compra_en` | `timestamptz` | Sí | — | — | Última compra aprobada. |
| `creado_en` | `timestamptz` | No | `now()` | — | Creación de la relación. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Cambio. |

**Constraints:**
- UNIQUE (`vecino_id`, `negocio_id`).

---

## 5.9 `solicitudes_compra`

**Propósito:** solicitud temporal postpago creada cuando el vecino toca el NFC/QR. Todavía no acredita REGIS.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Solicitud. |
| `vecino_id` | `uuid` | No | — | FK → `auth.users(id)` | Vecino solicitante. |
| `caja_id` | `uuid` | No | — | FK → `cajas(id)` | Caja identificada por tag. |
| `monto_informado` | `integer` | Sí | — | CHECK > 0 cuando exista | Monto informado inicialmente. |
| `informado_por` | `informado_por` | Sí | — | — | vecino o cajero. |
| `motivo_correccion` | `text` | Sí | — | — | Motivo si cajero corrige. |
| `motivo_rechazo` | `text` | Sí | — | — | Motivo si se rechaza. |
| `estado` | `estado_solicitud_compra` | No | `esperando_monto` | — | Estado explícito. |
| `expira_en` | `timestamptz` | No | — | > `creado_en` | Momento de vencimiento. |
| `idempotency_key` | `text` | No | — | UNIQUE | Evita solicitudes duplicadas. |
| `creado_en` | `timestamptz` | No | `now()` | — | Creación. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Cambio. |

---

## 5.10 `compras`

**Propósito:** registro permanente de una compra aprobada. Es creada por una operación segura después de la acción explícita del cajero.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Compra. |
| `solicitud_id` | `uuid` | No | — | FK → `solicitudes_compra(id)`, UNIQUE | Solicitud origen. |
| `negocio_id` | `uuid` | No | — | FK → `negocios(id)` | Contexto histórico del negocio. |
| `sucursal_id` | `uuid` | No | — | FK → `sucursales(id)` | Sucursal. |
| `caja_id` | `uuid` | No | — | FK → `cajas(id)` | Caja. |
| `vecino_id` | `uuid` | No | — | FK → `auth.users(id)` | Vecino. |
| `cajero_id` | `uuid` | No | — | FK → `auth.users(id)` | Cajero que aprobó. |
| `monto_final` | `integer` | No | — | CHECK `monto_final > 0` | Monto validado de la compra. |
| `folio_boleta` | `varchar(120)` | Sí | — | UNIQUE por negocio cuando exista | Referencia de boleta. |
| `origen` | `origen_compra` | No | `autoservicio` | — | Cómo se inició/registró. |
| `riesgo` | `severidad_riesgo` | Sí | — | — | Nivel de riesgo asignado. |
| `estado` | `estado_compra` | No | `confirmada` | — | Estado permanente. |
| `creado_en` | `timestamptz` | No | `now()` | — | Confirmación. |
| `revertido_en` | `timestamptz` | Sí | — | — | Fecha de reversa si aplica. |

**Constraints importantes:**
- UNIQUE (`negocio_id`, `folio_boleta`) cuando `folio_boleta IS NOT NULL`.
- Una `solicitud_id` solo puede generar una compra.

---

## 5.11 `beneficios`

**Propósito:** beneficios/recompensas creados por cada negocio desde su panel. Las reglas son datos configurables; no deben programarse negocio por negocio.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Beneficio. |
| `negocio_id` | `uuid` | No | — | FK → `negocios(id)` | Comercio propietario. |
| `creado_por` | `uuid` | No | — | FK → `auth.users(id)` | Miembro que lo creó. |
| `nombre` | `varchar(160)` | No | — | — | Ej. “20% de descuento”. |
| `descripcion` | `text` | Sí | — | — | Texto visible al vecino. |
| `tipo` | `tipo_beneficio` | No | — | — | Tipo del beneficio. |
| `valor_beneficio` | `numeric(12,2)` | Sí | — | Según tipo | 20 para 20%; 3000 para monto fijo. |
| `costo_regis` | `integer` | No | — | CHECK > 0 | REGIS necesarios. |
| `compra_minima` | `integer` | No | `0` | CHECK >= 0 | Compra mínima en CLP. |
| `descuento_maximo` | `integer` | Sí | — | CHECK >= 0 | Tope en CLP; útil para porcentaje. |
| `cupos_totales` | `integer` | Sí | — | CHECK > 0; NULL = ilimitado | Cupos totales. |
| `limite_por_vecino` | `integer` | No | `1` | CHECK > 0 | Máximo de canjes por vecino. |
| `fecha_inicio` | `timestamptz` | No | — | — | Inicio vigencia. |
| `fecha_fin` | `timestamptz` | Sí | — | > fecha_inicio | Fin; NULL si indefinido. |
| `mostrar_cupos` | `boolean` | No | `false` | — | Permite mostrar disponibilidad al vecino. |
| `condiciones` | `text` | Sí | — | — | Reglas adicionales. |
| `estado` | `estado_beneficio` | No | `borrador` | — | Ciclo de vida. |
| `creado_en` | `timestamptz` | No | `now()` | — | Creación. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Cambio. |

**Validaciones de negocio recomendadas:**
- `tipo = porcentaje` → `valor_beneficio > 0 AND valor_beneficio <= 100`.
- `tipo = monto_fijo` → `valor_beneficio > 0`.
- `descuento_maximo` puede ser NULL.
- No almacenar `cupos_restantes`; se deriva de canjes confirmados + reservas activas.
- Una vez que un beneficio tenga canjes, evitar alterar retroactivamente sus reglas esenciales. Pausar o crear una nueva versión/beneficio es preferible.

---

## 5.12 `canjes`

**Propósito:** una fila representa tanto la reserva temporal creada al generar un QR como el resultado final del canje. No se necesita una tabla separada `reservas_canje`.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Canje/reserva. |
| `beneficio_id` | `uuid` | No | — | FK → `beneficios(id)` | Beneficio solicitado. |
| `vecino_id` | `uuid` | No | — | FK → `auth.users(id)` | Vecino. |
| `negocio_id` | `uuid` | No | — | FK → `negocios(id)` | Denormalización deliberada para seguridad/reportes. |
| `costo_regis` | `integer` | No | — | CHECK > 0 | Snapshot del costo al reservar. |
| `beneficio_snapshot` | `jsonb` | No | `'{}'::jsonb` | — | Reglas esenciales del beneficio al reservar. |
| `token_hash` | `text` | No | — | UNIQUE | Hash del token QR. Nunca guardar token secreto plano. |
| `estado` | `estado_canje` | No | `reservado` | — | reservado/confirmado/etc. |
| `reservado_en` | `timestamptz` | No | `now()` | — | Momento de reserva. |
| `expira_en` | `timestamptz` | No | — | > reservado_en | Ej. +5 minutos. |
| `confirmado_en` | `timestamptz` | Sí | — | — | Confirmación del cajero. |
| `confirmado_por` | `uuid` | Sí | — | FK → `auth.users(id)` | Cajero/miembro que confirma. |
| `caja_id` | `uuid` | Sí | — | FK → `cajas(id)` | Caja donde se usó. |
| `monto_compra` | `integer` | Sí | — | CHECK >= 0 | Monto de compra informado para calcular beneficio. |
| `monto_descuento` | `integer` | Sí | — | CHECK >= 0 | Descuento monetario efectivamente aplicado. |
| `total_pagado` | `integer` | Sí | — | CHECK >= 0 | Total luego del beneficio. |
| `idempotency_key` | `text` | No | — | UNIQUE | Evita doble confirmación/reserva duplicada. |
| `creado_en` | `timestamptz` | No | `now()` | — | Creación. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Cambio. |

**Reglas críticas:**
- La reserva del último cupo debe hacerse en una transacción que bloquee/valide el beneficio en PostgreSQL.
- Al reservar: verificar beneficio, vigencia, cupos, límite por vecino, saldo disponible y REGIS ya reservados.
- Al reservar: aumentar saldo reservado sin descontar todavía el saldo contable definitivo.
- Al confirmar: consumir el cupo, descontar REGIS, registrar movimiento y actualizar saldo.
- Al expirar/cancelar una reserva no usada: liberar cupo y REGIS reservados.
- Un QR confirmado nunca puede reutilizarse.

---

## 5.13 `movimientos_regis`

**Propósito:** ledger/libro inmutable de movimientos de REGIS. Es la fuente de verdad contable.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Movimiento. |
| `vecino_id` | `uuid` | No | — | FK → `auth.users(id)` | Titular. |
| `negocio_id` | `uuid` | No | — | FK → `negocios(id)` | Saldo al que pertenece. |
| `tipo` | `tipo_movimiento_regis` | No | — | — | Naturaleza del movimiento. |
| `cantidad` | `integer` | No | — | CHECK `cantidad <> 0` | Positivo acredita; negativo consume/revierte según operación. |
| `estado` | `estado_movimiento_regis` | No | — | — | Estado del movimiento. |
| `compra_id` | `uuid` | Sí | — | FK → `compras(id)` | Referencia si proviene de compra. |
| `canje_id` | `uuid` | Sí | — | FK → `canjes(id)` | Referencia si proviene de canje. |
| `movimiento_relacionado_id` | `uuid` | Sí | — | FK → `movimientos_regis(id)` | Movimiento original en una reversa/ajuste. |
| `idempotency_key` | `text` | No | — | UNIQUE | Evita duplicación. |
| `metadata` | `jsonb` | No | `'{}'::jsonb` | — | Contexto adicional no crítico. |
| `creado_en` | `timestamptz` | No | `now()` | append-only | Fecha. |

**Reglas obligatorias:**
- El frontend no inserta, actualiza ni elimina directamente movimientos.
- No se corrigen filas existentes: se genera reversa/ajuste nuevo.
- Idealmente bloquear `UPDATE` y `DELETE` por permisos/policies.
- Toda escritura ocurre desde RPC/función/Edge Function segura.

---

## 5.14 `saldos_regis`

**Propósito:** resumen optimizado por vecino y negocio. No reemplaza al ledger.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Identificador. |
| `vecino_id` | `uuid` | No | — | FK → `auth.users(id)` | Vecino. |
| `negocio_id` | `uuid` | No | — | FK → `negocios(id)` | Negocio. |
| `disponibles` | `integer` | No | `0` | CHECK >= 0 | REGIS utilizables en ese momento. |
| `reservados` | `integer` | No | `0` | CHECK >= 0 | REGIS bloqueados temporalmente por QR activo. |
| `pendientes` | `integer` | No | `0` | CHECK >= 0 | REGIS aún no liberados por validación/riesgo. |
| `canjeados` | `integer` | No | `0` | CHECK >= 0 | Acumulado histórico canjeado. |
| `actualizado_en` | `timestamptz` | No | `now()` | — | Última reconciliación. |

**Constraints:**
- UNIQUE (`vecino_id`, `negocio_id`).
- La suma/actualización debe ocurrir dentro de las mismas transacciones que modifican el ledger.
- Nunca modificar manualmente un saldo para “arreglarlo”; crear movimiento de ajuste/reversa y recalcular/resumir.

---

## 5.15 `alertas_riesgo`

**Propósito:** alertas de fraude/error asociadas a operaciones sospechosas.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Alerta. |
| `compra_id` | `uuid` | Sí | — | FK → `compras(id)` | Compra relacionada. |
| `regla` | `varchar(160)` | No | — | — | Regla disparada. |
| `severidad` | `severidad_riesgo` | No | — | — | Nivel. |
| `detalle` | `text` | Sí | — | — | Explicación. |
| `estado` | `estado_alerta_riesgo` | No | `abierta` | — | Gestión. |
| `resuelta_por` | `uuid` | Sí | — | FK → `auth.users(id)` | Administrador que resuelve. |
| `resuelta_en` | `timestamptz` | Sí | — | — | Fecha resolución. |
| `creado_en` | `timestamptz` | No | `now()` | — | Creación. |

---

## 5.16 `registro_auditoria`

**Propósito:** trazabilidad de acciones sensibles. El administrador global tampoco actúa sin auditoría.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Evento. |
| `actor_id` | `uuid` | Sí | — | FK → `auth.users(id)` | Usuario responsable; NULL solo para sistema claramente identificado. |
| `accion` | `varchar(160)` | No | — | — | Ej. `pausar_beneficio`. |
| `entidad` | `varchar(120)` | No | — | — | Tabla/entidad afectada. |
| `entidad_id` | `uuid` | Sí | — | — | ID afectado. |
| `antes` | `jsonb` | Sí | — | — | Estado previo. |
| `despues` | `jsonb` | Sí | — | — | Estado posterior. |
| `ip` | `inet` | Sí | — | — | IP si procede. |
| `user_agent` | `text` | Sí | — | — | Contexto técnico. |
| `creado_en` | `timestamptz` | No | `now()` | append-only | Fecha. |

**Regla:** append-only; evitar UPDATE/DELETE desde clientes.

---

## 5.17 `planes`

**Propósito:** define los planes comerciales y sus límites técnicos. Los límites se validan en backend.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Plan. |
| `codigo` | `varchar(80)` | No | — | UNIQUE | Código interno estable. |
| `nombre` | `varchar(120)` | No | — | — | Nombre comercial. |
| `descripcion` | `text` | Sí | — | — | Descripción. |
| `precio_mensual_clp` | `integer` | No | `0` | CHECK >= 0 | Precio mensual. |
| `limite_clientes_activos` | `integer` | Sí | — | NULL = sin límite | Clientes activos. |
| `limite_sucursales` | `integer` | Sí | — | — | Sucursales. |
| `limite_cajas` | `integer` | Sí | — | — | Cajas/terminales según regla comercial. |
| `limite_miembros` | `integer` | Sí | — | — | Cajeros/admins. |
| `limite_beneficios_activos` | `integer` | Sí | — | — | Beneficios simultáneos. |
| `limite_campanas_mensuales` | `integer` | Sí | — | reservado para evolución | Campañas. |
| `nivel_reportes` | `varchar(40)` | Sí | — | CHECK acordado después | Nivel de detalle. |
| `estado` | `estado_plan` | No | `activo` | — | Estado comercial. |
| `creado_en` | `timestamptz` | No | `now()` | — | Alta. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Cambio. |

---

## 5.18 `suscripciones`

**Propósito:** historial de plan contratado por cada negocio.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Suscripción. |
| `negocio_id` | `uuid` | No | — | FK → `negocios(id)` | Comercio. |
| `plan_id` | `uuid` | No | — | FK → `planes(id)` | Plan. |
| `estado` | `estado_suscripcion` | No | `prueba` | — | Estado. |
| `inicia_en` | `timestamptz` | No | `now()` | — | Inicio. |
| `vence_en` | `timestamptz` | Sí | — | — | Vencimiento si aplica. |
| `cancelada_en` | `timestamptz` | Sí | — | — | Cancelación. |
| `creado_en` | `timestamptz` | No | `now()` | — | Registro. |
| `actualizado_en` | `timestamptz` | No | `now()` | trigger | Cambio. |

**Constraint recomendado:** índice único parcial para impedir más de una suscripción `activa`/`prueba` simultánea por negocio.

---

## 5.19 `aceptaciones_legales`

**Propósito:** conservar qué versión de documentos legales aceptó un usuario, de acuerdo con la regla de privacidad de guardar versión aceptada y consentimientos separados.

| Campo | Tipo | Nulo | Default | Regla / relación | Descripción |
|---|---|---:|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Aceptación. |
| `usuario_id` | `uuid` | No | — | FK → `auth.users(id)` | Usuario. |
| `tipo_documento` | `tipo_documento_legal` | No | — | — | Documento/consentimiento. |
| `version` | `varchar(40)` | No | — | — | Versión aceptada. |
| `aceptado_en` | `timestamptz` | No | `now()` | — | Fecha. |
| `ip` | `inet` | Sí | — | — | Evidencia técnica si corresponde. |
| `user_agent` | `text` | Sí | — | — | Contexto del navegador. |

**Constraints:**
- UNIQUE (`usuario_id`, `tipo_documento`, `version`).

---

# 6. Relaciones principales

```text
auth.users
  └── perfiles
       ├── miembros_negocio ──> negocios
       ├── vecinos_negocios ──> negocios
       ├── solicitudes_compra
       ├── compras
       ├── canjes
       ├── movimientos_regis
       └── saldos_regis

negocios
  ├── sucursales
  │    └── cajas
  │         ├── terminales
  │         └── etiquetas_nfc
  ├── miembros_negocio
  ├── vecinos_negocios
  ├── beneficios
  │    └── canjes
  ├── movimientos_regis
  ├── saldos_regis
  └── suscripciones ──> planes

solicitudes_compra
  └── compras
       ├── movimientos_regis
       └── alertas_riesgo

canjes
  └── movimientos_regis
```

---

# 7. Datos derivados: NO crear columnas duplicadas

## 7.1 Cupos de beneficios

No crear `cupos_restantes` como dato editable.

Derivar:

```text
cupos_confirmados = canjes estado = confirmado
cupos_reservados = canjes estado = reservado AND expira_en > now()
cupos_disponibles = cupos_totales - cupos_confirmados - cupos_reservados
```

Si `cupos_totales IS NULL`, el beneficio se considera sin límite de cupos.

La operación `reservar_canje()` debe bloquear/validar la fila del beneficio dentro de una transacción para impedir que dos usuarios reserven el último cupo simultáneamente.

## 7.2 Saldo de REGIS

- Fuente de verdad: `movimientos_regis`.
- Resumen: `saldos_regis`.
- `reservados` son REGIS temporalmente bloqueados por un QR.
- Nunca “corregir” un saldo escribiendo un número manualmente en `saldos_regis`.

## 7.3 Plan vigente

No almacenar `plan_id` también en `negocios`.

Derivar desde la suscripción vigente en `suscripciones`.

---

# 8. Operaciones que DEBEN ser atómicas

Estas operaciones no deben implementarse como múltiples escrituras independientes desde React.

## 8.1 Aprobar compra

Una RPC/función segura debe:

1. validar solicitud y cajero;
2. impedir duplicados;
3. crear `compras`;
4. crear `movimientos_regis` correspondientes;
5. actualizar `saldos_regis`;
6. actualizar `vecinos_negocios`;
7. registrar auditoría/riesgo si procede;
8. confirmar la transacción completa o revertir todo.

## 8.2 Reservar canje / generar QR

`reservar_canje()` debe:

1. bloquear/validar beneficio;
2. validar estado y vigencia;
3. validar cupos reales;
4. validar límite por vecino;
5. validar REGIS disponibles;
6. insertar `canjes` en `reservado`;
7. reservar REGIS en `saldos_regis`;
8. generar/registrar hash del token;
9. definir `expira_en`;
10. confirmar todo en una única transacción.

## 8.3 Confirmar canje

`confirmar_canje()` debe:

1. validar token QR;
2. validar que siga `reservado` y no vencido;
3. validar negocio/cajero/caja;
4. validar reglas monetarias del beneficio;
5. pasar canje a `confirmado`;
6. liberar los REGIS reservados y descontarlos del saldo disponible/contable según la implementación;
7. insertar movimiento `canje` en `movimientos_regis`;
8. incrementar `canjeados` del resumen;
9. registrar monto de compra/descuento/total pagado;
10. escribir auditoría;
11. confirmar todo o nada.

## 8.4 Expirar canje

Debe:

1. cambiar `reservado` → `vencido`;
2. liberar REGIS reservados;
3. liberar automáticamente el cupo al dejar de contar la reserva como activa;
4. ser idempotente.

## 8.5 Revertir compra

No editar/eliminar ledger original. Crear movimiento de reversa y actualizar resumen de forma atómica.

---

# 9. Reglas RLS de alto nivel

Todas las tablas expuestas deben tener RLS.

| Tabla/grupo | Vecino | Miembro negocio | Admin Regalones | Escritura crítica |
|---|---|---|---|---|
| `perfiles` | propio | propio | todos | usuario/admin según policy |
| `negocios` | leer activos | leer propio | todos | admin/propietario autorizado |
| `sucursales`, `cajas` | lectura necesaria | propio negocio | todos | admin negocio/global |
| `miembros_negocio` | no | propio negocio según rol | todos | propietario/admin |
| `terminales`, `etiquetas_nfc` | no | propio negocio según rol | todos | backend/admin |
| `beneficios` | leer activos | CRUD propio según rol | todos | admin negocio/backend |
| `canjes` | propios | propios del negocio | todos | reserva/confirmación vía función segura |
| `solicitudes_compra` | propias | propias del negocio/caja | todos | funciones seguras |
| `compras` | propias | propias del negocio | todos | backend únicamente |
| `movimientos_regis` | propios | lectura de su negocio según permiso | todos | backend únicamente |
| `saldos_regis` | propios | lectura de su negocio según permiso | todos | backend únicamente |
| `alertas_riesgo` | no | limitada por rol | todos | backend/admin |
| `registro_auditoria` | no | limitada | todos | backend append-only |
| `planes` | leer visibles | leer | CRUD global | admin global |
| `suscripciones` | no | propio negocio | todos | backend/admin |
| `aceptaciones_legales` | propias | no | soporte autorizado | inserción controlada |

**Nunca usar la clave secreta de Supabase en frontend.**

---

# 10. Índices y constraints mínimos

Además de PK/FK:

```text
UNIQUE perfiles(id)
UNIQUE negocios(slug)
UNIQUE negocios(rut) WHERE rut IS NOT NULL
UNIQUE miembros_negocio(negocio_id, usuario_id)
UNIQUE vecinos_negocios(vecino_id, negocio_id)
UNIQUE saldos_regis(vecino_id, negocio_id)
UNIQUE terminales(identificador_publico)
UNIQUE terminales(token_hash)
UNIQUE etiquetas_nfc(token_hash)
UNIQUE solicitudes_compra(idempotency_key)
UNIQUE compras(solicitud_id)
UNIQUE compras(negocio_id, folio_boleta) WHERE folio_boleta IS NOT NULL
UNIQUE canjes(token_hash)
UNIQUE canjes(idempotency_key)
UNIQUE movimientos_regis(idempotency_key)
UNIQUE aceptaciones_legales(usuario_id, tipo_documento, version)
CHECK compras.monto_final > 0
CHECK movimientos_regis.cantidad <> 0
CHECK beneficios.costo_regis > 0
CHECK beneficios.compra_minima >= 0
CHECK beneficios.descuento_maximo IS NULL OR descuento_maximo >= 0
CHECK beneficios.cupos_totales IS NULL OR cupos_totales > 0
CHECK beneficios.limite_por_vecino > 0
CHECK saldos_regis.disponibles >= 0
CHECK saldos_regis.reservados >= 0
CHECK saldos_regis.pendientes >= 0
```

Índices de consulta recomendados:

- `beneficios (negocio_id, estado, fecha_inicio, fecha_fin)`
- `canjes (beneficio_id, estado, expira_en)`
- `canjes (vecino_id, estado)`
- `solicitudes_compra (caja_id, estado, expira_en)`
- `compras (negocio_id, creado_en desc)`
- `movimientos_regis (vecino_id, negocio_id, creado_en desc)`
- `alertas_riesgo (estado, severidad, creado_en desc)`

---

# 11. Orden recomendado de creación/migraciones

Para evitar problemas con foreign keys:

1. Tipos/ENUMs comunes.
2. `perfiles`.
3. `planes`.
4. `negocios`.
5. `suscripciones`.
6. `sucursales`.
7. `cajas`.
8. `miembros_negocio`.
9. `terminales`.
10. `etiquetas_nfc`.
11. `vecinos_negocios`.
12. `solicitudes_compra`.
13. `compras`.
14. `beneficios`.
15. `canjes`.
16. `movimientos_regis`.
17. `saldos_regis`.
18. `alertas_riesgo`.
19. `registro_auditoria`.
20. `aceptaciones_legales`.
21. Triggers comunes (`actualizado_en`).
22. Funciones/RPC críticas.
23. RLS y policies.
24. Índices parciales/adicionales.
25. Seed mínimo de planes/datos de staging.

---

# 12. Funciones/RPC previstas

Nombres sugeridos en español o, si el repositorio decide conservar funciones técnicas en inglés, hacerlo consistentemente. Para mantener este estándar se proponen:

- `resolver_etiqueta()`
- `crear_solicitud_compra()`
- `informar_monto_vecino()`
- `informar_monto_cajero()`
- `aprobar_compra()`
- `corregir_solicitud_compra()`
- `rechazar_solicitud_compra()`
- `revertir_compra()`
- `reservar_canje()`
- `confirmar_canje()`
- `expirar_canjes()`
- `cancelar_canje()`
- `activar_terminal()`

**Nota:** el nombre final de las funciones debe decidirse una sola vez; no mezclar `approve_purchase` con `confirmar_canje` sin un criterio documentado.

---

# 13. Reglas funcionales de beneficios para el panel del comercio

El comercio crea beneficios desde su panel; Club Regalones entrega la estructura, no reglas codificadas por negocio.

Ejemplo:

```text
Nombre: 20% de descuento
Tipo: porcentaje
Valor: 20
Costo: 500 REGIS
Compra mínima: $10.000
Descuento máximo: $5.000
Cupos: 20
Límite por vecino: 1
Vigencia: 20/08/2026 — 31/08/2026
Mostrar cupos: sí/no
Condiciones: texto opcional
```

Al publicar:

```text
Panel negocio -> INSERT/UPDATE beneficio -> Supabase -> portal vecino + panel negocio + administración
```

El mensaje al negocio debe ser funcional, por ejemplo **“Beneficio publicado”**, no “enviado a base de datos”.

---

# 14. Flujo de canje que debe respetar el modelo

## 14.1 Vecino

1. Abre `Mis REGIS`.
2. Entra al negocio.
3. Ve beneficios activos para los que puede calificar.
4. Selecciona beneficio.
5. Sistema valida saldo, vigencia, límite por vecino y cupos.
6. Presiona “Generar QR”.
7. Backend reserva cupo + REGIS y crea `canjes.estado = reservado`.
8. QR vence, por ejemplo, en 5 minutos.

## 14.2 Comercio

1. Escanea QR desde terminal/panel autorizado.
2. Backend valida token y reserva.
3. Cajero ve reglas del beneficio.
4. Si corresponde, ingresa `monto_compra`.
5. Regalones calcula el descuento a aplicar respetando mínimo/tope.
6. Cajero aplica el descuento en su POS/caja real.
7. Cajero presiona “Beneficio aplicado”.
8. Backend confirma canje y registra todos los efectos en una transacción.

## 14.3 Ejemplo

```text
Saldo vecino: 700 REGIS
Beneficio: 20% de descuento
Costo: 500 REGIS
Compra mínima: $10.000
Tope de descuento: $5.000
Cupos: 20
Compra real: $25.000
Descuento: $5.000
Total pagado: $20.000
Saldo posterior: 200 REGIS
Canjes confirmados: 1 / 20
```

---

# 15. Decisiones que NO deben quedar hardcodeadas en React

- Cupos de un beneficio.
- Costo en REGIS.
- Porcentaje o monto del beneficio.
- Compra mínima.
- Tope de descuento.
- Vigencia.
- Límite por vecino.
- Estado del beneficio.
- Saldos.
- Estados de compra/canje.
- Roles/permisos.
- Límites de planes.

React muestra y solicita operaciones. PostgreSQL/Supabase valida la verdad del negocio.

---

# 16. Pendientes antes de generar el SQL definitivo

Estos puntos no están definidos todavía en la documentación funcional y **Codex no debe inventarlos silenciosamente**:

1. Fórmula exacta de acumulación de REGIS por negocio/compra.
2. Si los REGIS pendientes por riesgo se liberan por tiempo, aprobación manual u otra regla.
3. Duración definitiva del QR de canje (5 minutos es propuesta actual).
4. Si todos los beneficios tienen límite por vecino o puede existir `NULL = ilimitado`.
5. Si un beneficio puede restringirse a una sucursal específica en V1.
6. Catálogo definitivo de rubros.
7. Planes comerciales, nombres, precios y límites reales.
8. Retención y anonimización de datos personales.
9. Política exacta de exposición de nombre del vecino al comercio.
10. Fórmula/validación de PIN de cajero y recuperación.

---

# 17. Instrucciones de implementación para Codex

Al convertir este diccionario en migraciones:

1. No crear tablas manualmente solo desde el Dashboard si el cambio no queda reproducible.
2. Generar migraciones SQL versionadas bajo `supabase/migrations/`.
3. Mantener nombres en español según este documento.
4. Habilitar RLS en toda tabla expuesta.
5. Crear policies mínimas y testeables por rol.
6. No permitir escrituras directas del frontend a `movimientos_regis` ni `saldos_regis`.
7. Implementar operaciones críticas mediante funciones PostgreSQL/RPC o Edge Functions con transacciones.
8. Usar `idempotency_key` en operaciones susceptibles a doble envío.
9. Usar hashes para tokens de terminal, NFC y QR cuando corresponda.
10. No almacenar secretos ni PIN en texto plano.
11. No guardar `cupos_restantes`; calcularlo de canjes confirmados + reservas vigentes.
12. Mantener `movimientos_regis` append-only.
13. Cada reversa/corrección crea un nuevo movimiento; no edita el historial.
14. Añadir tests para concurrencia del último cupo y doble confirmación del mismo QR.
15. Añadir tests RLS que demuestren aislamiento entre dos negocios diferentes.

---

# 18. Hitos de implementación de base

## Hito A — Identidad y negocios

- `perfiles`
- `planes`
- `negocios`
- `suscripciones`
- `sucursales`
- `cajas`
- `miembros_negocio`

## Hito B — Terminal/NFC y compra sin REGIS

- `terminales`
- `etiquetas_nfc`
- `vecinos_negocios`
- `solicitudes_compra`
- `compras`

## Hito C — REGIS

- `movimientos_regis`
- `saldos_regis`
- RPC de acreditación/reversa

**No implementar fórmula final de acumulación hasta cerrar la regla funcional.**

## Hito D — Beneficios/canjes

- `beneficios`
- `canjes`
- reserva atómica de cupos/REGIS
- confirmación/expiración

## Hito E — Seguridad/operación

- `alertas_riesgo`
- `registro_auditoria`
- `aceptaciones_legales`
- matriz RLS completa
- pruebas de concurrencia y aislamiento

---

# 19. Criterio de cierre del modelo V1

El esquema se considera listo para comenzar la implementación cuando:

- todos los nombres estén aprobados;
- no existan columnas duplicadas para datos derivados;
- las claves foráneas estén definidas;
- los estados estén acordados;
- las operaciones atómicas estén identificadas;
- exista una política clara de ledger/saldos;
- RLS tenga una matriz por rol;
- los pendientes funcionales estén explícitamente marcados y no inventados por el código.

---

**Fin — Diccionario de Datos V1, Club Regalones**
