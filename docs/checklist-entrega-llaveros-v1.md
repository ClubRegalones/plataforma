# Checklist de entrega y activación de llaveros V1

**Fecha de actualización:** 23 de agosto de 2026  
**Alcance:** piloto de Club Regalones.

## Decisiones confirmadas

- [x] El vecino puede elegir entre retiro en un comercio participante o envío a domicilio.
- [x] El retiro en el comercio elegido por el vecino es gratuito.
- [x] El envío a domicilio se realiza por carta certificada de CorreosChile y lo paga el vecino.
- [x] El costo de envío es configurable y se registra en la solicitud; no se fija permanentemente en el frontend.
- [x] Los retiros se agrupan por comercio o sucursal para realizar entregas semanales en lote.
- [x] Cada lote permite llevar varios llaveros al mismo punto de retiro en una sola visita.
- [x] El envío domiciliario conserva su número de seguimiento y estados logísticos.
- [x] El llavero se prepara y vincula a la cuenta del vecino, pero se entrega inactivo.
- [x] Tanto el llavero retirado como el enviado a domicilio se activan durante su primer uso en un comercio participante.
- [x] Antes de la activación, el personal autorizado verifica presencialmente la identidad del vecino.
- [x] Para el piloto, la activación puede verificarse mediante revisión presencial de cédula o PIN personal.
- [x] Basta un método de verificación válido para activar el llavero.
- [x] El PIN se almacena exclusivamente como hash, nunca como texto legible.
- [x] Los intentos de PIN son limitados y los fallos repetidos provocan un bloqueo temporal.
- [x] La verificación por SMS queda contemplada para una etapa posterior, cuando exista un proveedor configurado.
- [x] La cédula solo se revisa visualmente; no se fotografía ni se almacena una copia.
- [x] La activación registra quién la realizó, el comercio, la caja, la fecha y la hora.
- [x] Un llavero inactivo no permite acumular ni canjear REGIS.
- [x] El saldo REGIS pertenece a la cuenta del vecino y no al llavero físico.

## Flujo objetivo

1. El vecino solicita el llavero y elige la modalidad de entrega.
2. Club Regalones valida la cuenta y los datos de entrega.
3. El administrador prepara el llavero, registra su token mediante hash y lo vincula al `vecino_id` sin activarlo.
4. Para retiro, la solicitud se incorpora al próximo lote semanal del comercio elegido.
5. Para domicilio, se confirma el pago, se despacha y se registra el seguimiento.
6. El vecino recibe el llavero inactivo.
7. En el primer uso, un comercio participante lee el llavero y verifica la identidad del vecino.
8. El terminal activa el llavero mediante una operación segura y auditada.
9. El mismo flujo de compra puede continuar para acumular o canjear REGIS del comercio actual.

## Estados logísticos propuestos

- `pendiente_revision`
- `pendiente_pago`
- `pago_confirmado`
- `en_preparacion`
- `preparado`
- `asignado_lote`
- `despachado`
- `disponible_retiro`
- `entregado_inactivo`
- `activado`
- `devuelto`
- `extraviado`
- `cancelado`

Los estados de entrega deben mantenerse separados del estado de seguridad del
llavero NFC para conservar un historial claro y auditable.

## Decisiones pendientes

- [ ] Definir el medio de pago del envío domiciliario.
- [ ] Definir si el valor informado al vecino es exacto o estimado antes del despacho.
- [ ] Definir los comercios y sucursales habilitados como puntos de retiro y activación.
- [ ] Definir el día de corte y el día de entrega semanal por punto de retiro.
- [ ] Definir qué roles del comercio pueden entregar y activar un llavero.
- [ ] Definir el protocolo exacto de verificación presencial de identidad.
- [ ] Definir el tiempo máximo para retirar un llavero antes de devolverlo a Club Regalones.
- [ ] Definir qué ocurre con el costo cuando un envío es devuelto o extraviado.
- [ ] Definir cuánto tiempo se conservan los datos de domicilio después de completar el envío.
