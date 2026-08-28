# Arquitectura de aplicaciones del MVP

Club Regalones se divide en cuatro aplicaciones web con responsabilidades y
permisos distintos. Separar las interfaces evita que un cajero acceda a
funciones comerciales o administrativas y permite instalar una Terminal PWA
pequeña y enfocada en la caja.

## 1. Portal Vecinos (`apps/portal`, puerto 5173)

Usuarios: vecinos con modalidad digital o asistida.

- Registro e inicio de sesión.
- Consulta de saldos REGIS separados por comercio.
- Beneficios disponibles, reservas y QR de canje.
- Solicitudes de compra digital.
- Historial de compras, acumulaciones y canjes.
- Solicitud, seguimiento y reemplazo de llavero.

No administra negocios, beneficios de terceros, terminales ni operaciones
globales de Club Regalones.

## 2. Portal Comercio (`apps/comercio`, puerto 5175)

Usuarios: propietarios y administradores del comercio. Algunas vistas futuras
podrán ser de solo lectura para personal autorizado.

- Crear, editar, publicar y finalizar beneficios.
- Ver el historial comercial de beneficios y canjes.
- Administrar sucursales, cajas, personal y dispositivos.
- Registrar o revocar Terminales PWA.
- Solicitar asistencia y conversar con Administración Regalones.
- Consultar reportes y movimientos de su propio negocio.

Los cajeros no pueden crear ni modificar beneficios. Esta prohibición debe
mantenerse mediante funciones y políticas RLS de Supabase, no solo ocultando
botones.

## 3. Terminal PWA (`apps/terminal`, puerto 5174)

Usuarios: cajeros en el equipo autorizado de la caja.

- Recibir solicitudes de compra y validar el monto.
- Aprobar o rechazar compras.
- Mostrar la estimación de REGIS antes de aprobar.
- Leer QR de canje y confirmar canjes.
- Recibir desde el celular lector la identificación de un llavero.
- Activar un llavero entregado durante su primer uso.

No contiene gestión de beneficios, administración comercial, asistencia
general, reportes globales ni configuración del negocio.

El celular lector es un dispositivo auxiliar: transmite la lectura NFC a la
Terminal PWA vinculada, pero no puede aprobar compras, acreditar REGIS ni
confirmar canjes.

## 4. Administración Regalones (`apps/admin`, puerto 5176)

Usuarios: equipo técnico y operativo de Club Regalones con rol
`admin_regalones`.

- Supervisar negocios y beneficios publicados.
- Pausar beneficios por error, abuso o condiciones engañosas.
- Atender conversaciones de asistencia de todos los comercios.
- Preparar, programar, entregar, bloquear y revocar llaveros.
- Consultar actividad global, alertas de riesgo y auditoría.
- Administrar reglas globales y permisos de plataforma.

## Seguridad y datos

- Las cuatro aplicaciones usan el mismo proyecto Supabase y la misma fuente de
  verdad.
- Cada aplicación mantiene su propia sesión por origen/puerto.
- La interfaz solo muestra las acciones correspondientes al rol, pero Supabase
  vuelve a validar autorización, pertenencia al negocio, caja, terminal y
  estado de la operación.
- Compras, acumulaciones y canjes críticos se completan con funciones atómicas
  e idempotentes.
- Nunca se guarda el token secreto de un llavero en texto visible; se conserva
  su hash y un código público separado.

## Transición

Las pantallas comerciales y administrativas existentes se reutilizan durante
la primera separación para no reescribir lógica ya probada. Cuando ambos
portales compilen y sus flujos estén verificados, sus archivos fuente se
trasladarán definitivamente y se eliminarán las rutas antiguas del Portal
Vecinos y de la Terminal.
