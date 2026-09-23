# App Negocio — Flujo QR de Canje REGIS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar en App Negocio el flujo existente desde un canje pendiente hasta escanear y validar el QR temporal, confirmar económicamente el canje y mostrar el resultado final, sin modificar el contrato de seguridad ya aprobado.

**Architecture:** App Negocio mantiene la lógica de cámara/QR en `EscanerQrNegocio.tsx`, la resolución de QR/NFC en `lib/lector-qr.ts`, y la confirmación económica en `lib/canjes.ts`. `InicioOperativoV2.tsx` coordina el estado de la UI: selecciona el canje, recoge el monto, abre el scanner con `canjeEsperado`, conserva el token QR validado y llama a `terminal_confirmar_compra_con_canje`. Supabase sigue siendo la única autoridad para validar el token, calcular el beneficio y mover REGIS.

**Tech Stack:** React 19, TypeScript 6, Vite 8, `@zxing/browser`, Supabase JS, PostgreSQL RPC/pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-16-qr-temporal-canje-regis-design.md`

## Global Constraints

- Trabajar en `feat/ecosistema-v1`.
- No reconstruir ni sobrescribir el scanner local existente.
- Preservar `apps/negocio/src/EscanerQrNegocio.tsx`, `apps/negocio/src/lib/lector-qr.ts`, `apps/negocio/src/escanear-v1.css`, `apps/negocio/src/canje-confirmado-v1.css`, `apps/negocio/src/InicioOperativoV2.tsx`, `apps/negocio/package.json` y `pnpm-lock.yaml`.
- El QR temporal contiene solo el token opaco; no agregar URLs, JSON ni datos del vecino.
- La reserva QR dura 10 minutos y reutiliza el mismo token mientras siga vigente.
- Un canje confirmado queda inutilizable inmediatamente.
- No confiar en monto, descuento, saldo ni REGIS calculados por frontend; el backend debe derivar y validar el resultado económico.
- No modificar las migraciones de seguridad salvo que una prueba reproduzca una falla real.
- No abrir nuevos bloques de auditoría; 1D-A y 1D-B ya están cerrados.
- No usar `git add .`; stagear archivos explícitos.

---

### Task 1: Conectar el canje seleccionado con el scanner existente

**Files:**
- Modify: `apps/negocio/src/InicioOperativoV2.tsx`
- Existing local component: `apps/negocio/src/EscanerQrNegocio.tsx`
- Existing local styles: `apps/negocio/src/escanear-v1.css`

**Interfaces:**
- Consumes: `CanjePendienteNegocio` y el estado actual `canjeSeleccionado`, `montoCanje`.
- Consumes: `EscanerQrNegocio({ configuracion, turnoId, canjeEsperado, alCanjeEncontrado, alCanjeValidado, alVolver })`.
- Produces: transición explícita `revisión de canje -> escanear QR esperado -> QR validado`.

- [ ] **Step 1: Registrar el baseline antes de editar**

Run:
```powershell
pnpm --filter @club-regalones/negocio typecheck
pnpm --filter @club-regalones/negocio build
```
Expected: ambos comandos terminan con exit code 0.

- [ ] **Step 2: Verificar la ruta actual que abre el scanner**

En `InicioOperativoV2.tsx`, localizar `continuarCanjeAlEscaneo` y el render de `EscanerQrNegocio`. Confirmar que el canje seleccionado no se pierde al cambiar `vista` a `escanear`.

Run:
```powershell
Select-String -Path "apps/negocio/src/InicioOperativoV2.tsx" -Pattern "continuarCanjeAlEscaneo|EscanerQrNegocio|canjeSeleccionado|alCanjeValidado|alCanjeEncontrado" -Context 4,6
```
Expected: se identifican los puntos exactos de conexión existentes; no editar todavía si falta contexto.

- [ ] **Step 3: Implementar el handoff mínimo hacia el scanner**

El flujo debe conservar:
```text
canjeSeleccionado
montoCanje
```
y abrir `EscanerQrNegocio` con:
```tsx
canjeEsperado={canjeSeleccionado}
```

El callback `alCanjeValidado(tokenQr)` debe conservar el token validado en estado local y avanzar a la confirmación, sin ejecutar todavía la RPC económica dentro del scanner.

- [ ] **Step 4: Verificar rechazo de QR incorrecto manualmente**

Casos:
```text
QR de llavero mientras se espera canje temporal -> rechazado
QR temporal de otro canje -> rechazado
QR temporal del canje seleccionado -> validado
```
Expected: ninguna lectura incorrecta avanza a confirmación.

- [ ] **Step 5: Repetir typecheck**

Run:
```powershell
pnpm --filter @club-regalones/negocio typecheck
```
Expected: exit code 0.

---

### Task 2: Crear el estado de confirmación previo al movimiento económico

**Files:**
- Modify: `apps/negocio/src/InicioOperativoV2.tsx`
- Modify only if needed: `apps/negocio/src/canje-confirmado-v1.css`

**Interfaces:**
- Consumes: `canjeSeleccionado`, `montoCanje`, token QR ya validado.
- Produces: una confirmación visual que muestra el beneficio y monto de compra antes de ejecutar `confirmarCanjeNegocio`.

- [ ] **Step 1: Añadir estado explícito para el token QR validado**

Usar un estado equivalente a:
```tsx
const [tokenQrCanjeValidado, setTokenQrCanjeValidado] = useState<string | null>(null)
```

No persistirlo en `localStorage` ni mostrar el token en pantalla.

- [ ] **Step 2: Mantener el monto original ingresado por caja**

La pantalla previa a confirmar debe usar el entero de `montoCanje` únicamente como entrada de compra. No calcular descuento ni REGIS gastados en frontend.

- [ ] **Step 3: Bloquear confirmación si falta contexto**

La acción final debe quedar deshabilitada cuando falte cualquiera de:
```text
canjeSeleccionado
montoCanje válido (>0, entero)
token QR validado para canjes de origen qr
conexión online
```

Para un canje de origen `llavero`, el flujo QR temporal no se usa y este task no debe cambiar su autorización PIN.

- [ ] **Step 4: Verificar visualmente que validar QR todavía no gasta REGIS**

Expected: tras el escaneo válido se puede revisar el canje, pero la operación sigue reservada hasta pulsar la confirmación final.

---

### Task 3: Confirmar el canje mediante la RPC existente

**Files:**
- Existing helper: `apps/negocio/src/lib/canjes.ts`
- Modify: `apps/negocio/src/InicioOperativoV2.tsx`

**Interfaces:**
- Consumes: `confirmarCanjeNegocio(configuracion, turnoId, canjeId, montoBrutoClp, folioBoleta?, tokenQr?)`.
- Produces: `ResultadoCanjeNegocio` devuelto por `terminal_confirmar_compra_con_canje`.

- [ ] **Step 1: Confirmar que no hace falta cambiar el helper**

El helper existente ya debe llamar:
```text
terminal_confirmar_compra_con_canje
```
con:
```text
p_canje_id
p_monto_bruto_clp
p_turno_id
p_terminal_id
p_token_terminal
p_folio_boleta
p_qr_token
```

Si la firma coincide, no modificar `lib/canjes.ts`.

- [ ] **Step 2: Implementar la acción final en `InicioOperativoV2.tsx`**

Secuencia:
```text
1. validar monto entero > 0
2. tomar canjeSeleccionado.canje_id
3. usar tokenQrCanjeValidado si origen = qr
4. llamar confirmarCanjeNegocio(...)
5. exigir resultado no-null
6. guardar resultado para la pantalla final
7. limpiar token QR temporal en memoria
8. recargar solicitudes/canjes silenciosamente
```

No recalcular localmente el descuento retornado por Supabase.

- [ ] **Step 3: Manejar error sin perder la reserva ni permitir doble acción accidental**

Mientras la RPC está ejecutándose, deshabilitar el botón final con un estado de procesamiento. Si la RPC falla, mostrar el error y conservar contexto suficiente para reintentar de forma idempotente.

- [ ] **Step 4: Verificar replay seguro con la misma operación**

La cobertura backend ya vive en:
```text
supabase/tests/database/0045_hardening_transacciones_regis.sql
```

Run:
```powershell
pnpm db:test supabase/tests/database/0045_hardening_transacciones_regis.sql
```
Expected:
```text
Files=1, Tests=41
Result: PASS
```

---

### Task 4: Mostrar resultado final y reiniciar el flujo limpio

**Files:**
- Modify: `apps/negocio/src/InicioOperativoV2.tsx`
- Modify: `apps/negocio/src/canje-confirmado-v1.css` only if the existing styles need wiring adjustments.

**Interfaces:**
- Consumes: resultado real devuelto por `confirmarCanjeNegocio`.
- Produces: pantalla final de canje confirmado y retorno limpio a inicio/solicitudes.

- [ ] **Step 1: Renderizar únicamente valores retornados por backend**

Mostrar desde el resultado real, según los campos disponibles:
```text
monto compra bruto
descuento total
REGIS utilizados/movidos
monto final pagado
beneficio/vecino si ya están disponibles en el estado seleccionado
```

No mostrar estimaciones previas como si fueran resultado final.

- [ ] **Step 2: Marcar la operación como terminada en UI**

Al entrar a la pantalla final:
```text
no reabrir cámara
no conservar token QR
no permitir confirmar nuevamente desde esa pantalla
```

- [ ] **Step 3: Limpiar estados al volver**

Al pulsar `Volver al inicio` o equivalente, limpiar como mínimo:
```text
canjeSeleccionado
montoCanje
tokenQrCanjeValidado
resultado del canje
error/mensaje transitorio del flujo
```
y llamar `cargarDatos(true)` para que el canje confirmado desaparezca de pendientes.

- [ ] **Step 4: Probar QR confirmado**

Volver a escanear el mismo QR temporal después de confirmar.
Expected: Supabase no debe permitir un segundo efecto económico; el QR ya no sirve como canje pendiente.

---

### Task 5: Verificación final y checkpoint del scanner/canje

**Files:**
- Verify: `apps/negocio/src/InicioOperativoV2.tsx`
- Verify: `apps/negocio/src/EscanerQrNegocio.tsx`
- Verify: `apps/negocio/src/lib/lector-qr.ts`
- Verify: `apps/negocio/src/escanear-v1.css`
- Verify: `apps/negocio/src/canje-confirmado-v1.css`
- Verify only if intentionally changed: `apps/negocio/package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Typecheck y build de App Negocio**

Run:
```powershell
pnpm --filter @club-regalones/negocio typecheck
pnpm --filter @club-regalones/negocio build
```
Expected: ambos PASS.

- [ ] **Step 2: Repetir el test de seguridad transaccional**

Run:
```powershell
pnpm db:test supabase/tests/database/0045_hardening_transacciones_regis.sql
```
Expected: 41/41 PASS.

- [ ] **Step 3: QA manual end-to-end**

Validar en orden:
```text
A. Abrir App Negocio con turno activo.
B. Abrir canje QR pendiente.
C. Ingresar monto válido.
D. Escanear QR temporal correcto.
E. Ver pantalla de QR validado sin gasto económico todavía.
F. Confirmar operación una vez.
G. Ver pantalla final con datos reales del backend.
H. Volver a solicitudes y comprobar que desapareció de pendientes.
I. Reintentar el mismo QR y comprobar que no produce un segundo canje.
J. Escanear un QR de llavero en contexto de canje temporal y comprobar rechazo.
```

- [ ] **Step 4: Revisar diff antes de commit**

Run:
```powershell
git status --short
git diff -- apps/negocio/src/InicioOperativoV2.tsx apps/negocio/src/EscanerQrNegocio.tsx apps/negocio/src/lib/lector-qr.ts apps/negocio/src/escanear-v1.css apps/negocio/src/canje-confirmado-v1.css apps/negocio/package.json pnpm-lock.yaml
```
Expected: solo cambios intencionales del scanner/canje.

- [ ] **Step 5: Commit explícito**

Stagear solo los archivos realmente usados. Ejemplo si todos forman parte del cambio:
```powershell
git add apps/negocio/src/InicioOperativoV2.tsx
git add apps/negocio/src/EscanerQrNegocio.tsx
git add apps/negocio/src/lib/lector-qr.ts
git add apps/negocio/src/escanear-v1.css
git add apps/negocio/src/canje-confirmado-v1.css
```

Agregar `apps/negocio/package.json` y `pnpm-lock.yaml` solo si la dependencia del lector QR corresponde efectivamente a este trabajo y está verificada.

Commit:
```powershell
git commit -m "feat: completa flujo QR de canje App Negocio"
git push origin feat/ecosistema-v1
```
