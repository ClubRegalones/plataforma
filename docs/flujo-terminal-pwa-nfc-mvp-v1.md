# Flujo Terminal PWA y NFC — MVP v1

## Decisión del MVP

Club Regalones tendrá dos formas de identificar al vecino, pero toda aprobación,
acumulación de REGIS y canje se realizará exclusivamente desde la Terminal PWA
asociada a una caja.

El teléfono del cajero no es una caja ni una terminal. Cuando se utiliza con un
llavero, funciona únicamente como lector NFC inalámbrico.

## Flujo digital: vecino con celular

1. El tótem o punto de caja muestra una etiqueta NFC pasiva y un QR de respaldo.
2. El vecino acerca su iPhone o Android a la etiqueta, o escanea el QR.
3. Se abre el portal web con la caja identificada.
4. La sesión de Supabase Auth identifica al vecino.
5. El vecino informa el monto pagado.
6. La solicitud aparece en la Terminal PWA de esa caja.
7. El cajero revisa, corrige si corresponde y aprueba desde la terminal.
8. Supabase confirma la compra y acredita los REGIS de forma atómica.

El NFC del tótem contiene una URL pública de contexto. No contiene datos del
vecino, saldos ni credenciales administrativas.

## Flujo asistido: vecino con llavero NFC

1. Al iniciar el turno, la Terminal PWA genera un QR de vinculación válido por
   cinco minutos.
2. El cajero lo escanea una sola vez con su teléfono.
3. El teléfono queda vinculado a esa terminal durante un máximo de dieciséis horas.
4. El vecino acerca su llavero al teléfono del cajero.
5. El teléfono transmite a Supabase únicamente el token opaco leído.
6. Supabase valida el llavero y envía un evento temporal a la Terminal PWA.
7. La terminal muestra el vecino identificado y habilita el flujo asistido.
8. El cajero informa el monto y confirma la operación desde la Terminal PWA.
9. Al terminar, la lectura queda consumida y la terminal queda lista para el
   siguiente llavero.

El teléfono no muestra saldo, no aprueba compras, no acredita REGIS y no puede
confirmar canjes.

## Emparejamiento del celular lector

- Se realiza una vez por turno, no una vez por vecino.
- Dura como máximo dieciséis horas para cubrir una jornada comercial completa.
- Solo puede existir un lector activo por terminal en el MVP.
- Vincular otro teléfono invalida inmediatamente el anterior.
- Cerrar sesión, cambiar de caja o cerrar el lector invalida la vinculación.
- El QR inicial es de un solo uso.
- El token definitivo del lector se entrega una sola vez y se conserva solo en
  la sesión local del teléfono.

## Modelo de datos

### `sesiones_lector_movil`

Vincula temporalmente un teléfono con una terminal y una caja. Solo almacena
hashes de los tokens, nunca los secretos originales.

Estados: `pendiente_vinculacion`, `vinculada`, `cerrada`, `expirada` y
`reemplazada`.

### `lecturas_llavero_terminal`

Registra el evento efímero que viaja desde el teléfono hacia la Terminal PWA.
Una lectura pendiente dura treinta segundos y solo puede consumirse una vez.

Estados: `pendiente`, `consumida`, `expirada` y `rechazada`.

## Separación de permisos

| Actor | Puede leer NFC | Puede identificar contexto | Puede aprobar o canjear |
| --- | --- | --- | --- |
| Celular del vecino | NFC/QR del tótem | Sí, su propia sesión | No |
| Celular lector del cajero | Llavero NFC | Solo confirma envío a la caja | No |
| Terminal PWA | Recibe la lectura | Sí, según negocio y caja | Sí |
| Supabase | Valida tokens y permisos | Sí | Ejecuta la operación atómica |

El celular lector utiliza solamente funciones anónimas limitadas por un secreto
temporal. Las funciones de compra, aprobación y canje continúan restringidas a
usuarios autenticados del comercio.

## NFC físico

- El llavero o una futura tarjeta NFC contienen el mismo tipo de token opaco.
- `CR-000001` es un código público impreso, no el token secreto.
- El llavero no guarda nombre, RUT, saldo ni REGIS.
- En el MVP, el teléfono del cajero reemplaza al lector físico del tótem para
  los vecinos con llavero.
- Una futura tarjeta NFC puede usar exactamente el mismo backend.

## Reglas operativas de la PWA

- La terminal requiere conexión para aprobar compras, acreditar REGIS o
  confirmar canjes.
- El modo sin conexión puede conservar la interfaz, pero nunca dejar operaciones
  monetarias pendientes para ejecutarlas después.
- La terminal recibe lecturas mediante Supabase Realtime y debe incluir consulta
  periódica como respaldo.
- Los toques NFC duplicados dentro de una ventana breve se consideran la misma
  lectura.

## Orden de implementación

- [x] Definir el flujo digital y asistido.
- [x] Crear sesiones seguras de lector móvil.
- [x] Crear lecturas temporales y consumibles una sola vez.
- [x] Aplicar separación de permisos y aislamiento por comercio.
- [x] Habilitar eventos de lectura en tiempo real.
- [x] Crear la instalación PWA de la terminal.
- [x] Crear la pantalla de vinculación por QR.
- [x] Crear la página móvil que recibe el NFC del llavero.
- [x] Conectar Realtime y el respaldo por consulta periódica.
- [x] Exigir una terminal registrada y una caja autorizada para vincular el lector.
- [ ] Consumir la lectura de forma atómica al activar, comprar o canjear.
- [ ] Probar con iPhone, Android y llaveros NDEF físicos.
