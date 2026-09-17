# Diseño — QR temporal de canje REGIS

## Objetivo

Definir un contrato único entre App Vecino, App Negocio y Supabase para los canjes de REGIS mediante QR temporal, de forma que el mismo formato se use cuando App Vecino se implemente y que App Negocio pueda validarlo sin exponer datos sensibles en el QR.

## Decisión principal

El QR temporal de canje contiene únicamente un token aleatorio opaco. No contiene URLs, JSON, identificadores de usuario, RUT, nombre, saldo, cantidad de REGIS, beneficio ni negocio.

Ejemplo conceptual del contenido del QR:

```text
7de69033-29d9-4a61-8ae2-2af41e55c5f1
```

El contenido exacto se trata como un secreto temporal y se envía tal cual al backend para validación.

## Ciclo de vida

1. El vecino selecciona un beneficio en App Vecino y solicita canjearlo.
2. App Vecino genera un token aleatorio seguro.
3. App Vecino llama al flujo de reserva de canje por QR enviando:
   - `beneficio_version_id`
   - token QR
   - `idempotency_key`
4. Supabase valida saldo, beneficio, límites y reglas de negocio.
5. Supabase guarda únicamente el hash SHA-256 del token y crea la reserva.
6. La reserva dura 10 minutos.
7. App Vecino muestra el mismo token convertido visualmente en QR durante toda la vigencia de esa reserva.
8. Si el vecino cierra y vuelve a abrir la pantalla mientras la reserva siga vigente, App Vecino reutiliza el mismo QR. No crea otra reserva ni genera otro token.
9. App Negocio escanea el QR y envía el token leído a `terminal_consultar_canje_qr` junto con turno, terminal y credencial.
10. Supabase resuelve el hash y devuelve el canje reservado si el contexto es válido.
11. App Negocio valida que el canje devuelto corresponda al canje esperado cuando la lectura se inició desde una solicitud concreta.
12. La confirmación económica se realiza únicamente mediante la RPC de confirmación de canje.
13. En cuanto el canje queda confirmado, el token queda inutilizable inmediatamente aunque todavía no hayan transcurrido los 10 minutos originales.
14. Un canje confirmado no puede volver a confirmarse con un segundo efecto económico ni puede cancelarse para recuperar REGIS.

## Reutilización e idempotencia

- Una reserva QR vigente reutiliza el mismo token mientras siga en estado `reservado` y no haya expirado.
- Volver a abrir la pantalla de QR no debe crear una segunda reserva.
- La misma `idempotency_key` solo puede representar la misma operación.
- Reutilizar una `idempotency_key` con datos distintos debe rechazarse.
- La confirmación repetida del mismo canje no puede duplicar compra, movimiento ni débito de REGIS.

## Expiración

Un QR deja de ser válido cuando ocurre cualquiera de estas condiciones:

- pasan 10 minutos desde la creación de la reserva;
- el canje se confirma correctamente;
- la reserva se cancela;
- el backend invalida la operación por reglas de negocio o seguridad.

Después de quedar inválido, mostrar nuevamente la pantalla de canje debe iniciar una nueva reserva y generar un token nuevo si el vecino todavía puede realizar ese canje.

## Seguridad

- El token debe tener entropía suficiente y no ser predecible.
- El backend nunca persiste el token en texto plano; persiste su hash SHA-256.
- El QR no contiene datos personales ni económicos interpretables por el cliente.
- App Negocio no confía en datos económicos provenientes del QR; solo usa el token para identificar la reserva.
- El negocio, beneficio, vecino, REGIS, descuento, estado y vigencia se obtienen y validan en Supabase.
- El token se valida junto con el contexto real de turno, terminal y credencial de App Negocio.
- El gasto de REGIS solo ocurre al confirmar el canje mediante la lógica transaccional del backend.

## Diferencia con el QR permanente del llavero

Existen dos contratos de QR distintos y no deben mezclarse:

### QR temporal de canje

- contenido: token opaco temporal;
- propósito: validar una reserva de canje concreta;
- vigencia: 10 minutos como máximo y se invalida inmediatamente al confirmar;
- origen principal: App Vecino.

### QR permanente del llavero

- contenido: código público del llavero, directamente o dentro de uno de los formatos aceptados por el lector;
- propósito: identificar al vecino/llavero;
- no autoriza gasto de REGIS por sí solo;
- puede representarse como:
  - `https://clubregalones.cl/llavero/<codigo>`
  - `regalones://llavero/<codigo>`
  - `llavero:<codigo>`
  - `<codigo>`

## Comportamiento de App Negocio

El lector general sigue este orden:

1. intenta resolver el contenido leído como token temporal de canje;
2. si Supabase indica que no existe un canje para ese token, intenta resolverlo como QR permanente de llavero;
3. si corresponde a un canje temporal, continúa por el flujo de validación/confirmación de canje;
4. si corresponde a llavero, identifica al vecino y muestra su contexto sin considerar ese QR como autorización para gastar REGIS.

Cuando App Negocio está validando una solicitud de canje concreta:

- solo acepta un QR temporal de canje;
- rechaza un QR de llavero;
- rechaza un token que corresponda a otro canje;
- valida el token con Supabase antes de habilitar la confirmación.

## Comportamiento futuro de App Vecino

Cuando se implemente App Vecino, la pantalla de canje deberá:

- crear la reserva mediante la RPC autenticada existente;
- generar un token aleatorio seguro únicamente cuando no exista una reserva vigente reutilizable;
- conservar temporalmente el token necesario para volver a renderizar el mismo QR durante la vigencia de la reserva;
- consultar/recordar el estado de la reserva al reabrir la pantalla;
- reutilizar el mismo QR mientras el canje siga `reservado` y vigente;
- dejar de mostrarlo cuando el canje quede confirmado, cancelado o expirado;
- generar una nueva reserva/token únicamente después de que la anterior ya no sea válida y siempre que las reglas permitan un nuevo canje.

## Estado actual

- App Negocio ya dispone de lector QR con cámara mediante `@zxing/browser`.
- El lector ya diferencia QR temporal de canje y QR permanente de llavero.
- El backend ya posee reserva QR, hash del token, expiración e idempotencia.
- El hardening transaccional de REGIS fue verificado en la batería 1D-B.
- App Vecino todavía no implementa la experiencia de canje ni la generación/renderizado del QR temporal; deberá seguir este contrato cuando se construya.

## Criterios de aceptación del contrato

El contrato se considera correctamente implementado cuando:

1. un canje reservado en App Vecino muestra un token como QR;
2. cerrar y reabrir la pantalla antes de expirar muestra el mismo QR;
3. App Negocio identifica correctamente ese token como el canje reservado;
4. un QR de llavero no puede sustituir al QR temporal cuando se valida un canje iniciado desde App Vecino;
5. confirmar el canje invalida el QR inmediatamente;
6. volver a escanear ese token no produce un segundo efecto económico;
7. al expirar/cancelarse/confirmarse la reserva, una nueva operación válida usa un token distinto;
8. ningún dato personal o económico sensible se codifica directamente dentro del QR.
