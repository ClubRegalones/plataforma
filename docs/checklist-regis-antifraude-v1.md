# Checklist de decisiones REGIS y antifraude V1

**Fecha de actualización:** 24 de agosto de 2026  
**Estado:** reglas económicas base aprobadas; límites antifraude todavía pendientes de parametrización.

Este documento complementa el diccionario de datos. Su objetivo es registrar lo
acordado, lo que todavía debe decidirse y el orden recomendado para implementar
el Hito C sin dejar reglas comerciales ocultas en React.

## Principios ya acordados

- [x] Primero se confirma y cobra la compra; después se calculan los REGIS.
- [x] La base de cálculo es el `monto_final` aprobado por caja.
- [x] En condiciones normales, los REGIS quedan disponibles inmediatamente.
- [x] Una compra puede quedar confirmada aunque sus REGIS queden pendientes por riesgo.
- [x] Un monto llamativamente alto puede activar una revisión antifraude.
- [x] Muchas acumulaciones seguidas también pueden activar una revisión antifraude.
- [x] Los REGIS observados no se pierden automáticamente: quedan pendientes hasta resolver la alerta.
- [x] `movimientos_regis` será la fuente de verdad contable e histórica.
- [x] `saldos_regis` será un resumen derivado, no una fuente editable manualmente.
- [x] Las acreditaciones y reversas serán atómicas, idempotentes y controladas por funciones seguras.
- [x] Las reglas y límites vivirán en Supabase; React solo los mostrará y solicitará operaciones.
- [x] En el piloto, los REGIS se acumulan y se canjean por comercio: los obtenidos en el comercio A no pueden utilizarse en los comercios B o C.
- [x] El saldo pertenece al par `vecino_id` + `negocio_id`; nunca se almacena dentro del llavero NFC.
- [x] Reemplazar o bloquear un llavero no modifica ni elimina los REGIS del vecino.
- [x] La modalidad asistida permite consultar y canjear REGIS desde el terminal de caja, sin portal ni teléfono del vecino.
- [x] El cajero solo recibe la información necesaria del vecino y el saldo correspondiente a su propio comercio.

## Reglas comerciales aprobadas para el piloto

- [x] La recompensa equivale al **5 % del monto realmente pagado**.
- [x] **1 REGIS equivale a $50 CLP** al utilizarlo.
- [x] El mínimo es de **$1.000 CLP por compra** para comenzar a acumular.
- [x] Una compra de exactamente $1.000 sí califica.
- [x] Al alcanzar el mínimo, se calcula sobre la compra completa y no solo sobre el excedente.
- [x] Las compras menores a $1.000 no se suman entre sí para alcanzar el mínimo.
- [x] La conversión entrega REGIS enteros mediante redondeo hacia abajo.
- [x] La fracción de valor que no completa un REGIS se conserva por vecino y negocio para una compra posterior que sí cumpla el mínimo.
- [x] Los REGIS no expiran durante el piloto.

Con la propuesta actual, la fórmula sería:

```text
regis = floor(monto_final * 0,05 / 50)
regis = floor(monto_final / 1.000)
```

| Monto final | Valor del 5 % | REGIS si se redondea hacia abajo |
| ---: | ---: | ---: |
| $999 | No califica | 0 |
| $1.000 | $50 | 1 |
| $2.000 | $100 | 2 |
| $5.900 | $295 | 5 |
| $12.500 | $625 | 12 |
| $13.000 | $650 | 13 |

El remanente evita perder la diferencia. Por ejemplo, una compra de $8.600 genera
$430 de recompensa: se acreditan 8 REGIS y se conservan $30 de avance para la
próxima compra elegible en el mismo negocio.

## Checklist de configuración comercial

- [x] Existirá una regla global para el piloto, con posibilidad técnica de crear versiones específicas por negocio más adelante.
- [x] Cada versión tendrá una vigencia explícita.
- [x] Cada acreditación guardará la versión y una fotografía de los valores aplicados.
- [ ] Definir si existe un máximo de REGIS por compra.
- [ ] Definir si existe un máximo de REGIS por vecino durante un día o un mes.
- [x] Los cupones, descuentos y canjes se descuentan antes de calcular la recompensa: se acumula únicamente sobre el dinero realmente pagado.
- [x] Una compra pagada íntegramente con REGIS no genera nuevos REGIS.
- [x] Una reversa nunca borra el movimiento original: crea movimientos compensatorios y conserva la auditoría.

## Reglas de canje y beneficios aprobadas

- [x] El canje parte desde 1 REGIS.
- [x] En el piloto, los REGIS de un negocio solo se canjean en ese mismo negocio.
- [x] El descuento normal se calcula con la equivalencia vigente de REGIS.
- [x] Como regla general se podrá cubrir hasta el 20 % de la compra con REGIS.
- [x] Cada beneficio tendrá además un monto máximo de descuento configurable.
- [x] El negocio podrá ofrecer un costo promocional menor, pero el sistema distinguirá el valor financiado por REGIS del aporte promocional adicional del negocio.
- [x] Los cambios futuros de valor o porcentaje se aplicarán mediante nuevas versiones; las compras históricas conservarán la regla utilizada.
- [x] Si cambia el valor del REGIS, la migración de saldos deberá preservar el equivalente en CLP ya acumulado por el vecino.

## Checklist antifraude

- [ ] Definir el monto de compra que activa una alerta.
- [ ] Definir cuántas compras constituyen “muchas acumulaciones seguidas”.
- [ ] Definir la ventana de tiempo para esa regla: minutos, horas o día calendario.
- [ ] Definir si la velocidad se mide globalmente, por negocio, sucursal, caja o cajero.
- [ ] Definir si se evalúa también el total acumulado en pesos o REGIS durante la ventana.
- [ ] Definir si compras repetidas por el mismo monto aumentan el nivel de riesgo.
- [ ] Definir niveles de severidad y qué reglas generan cada nivel.
- [ ] Definir quién revisa alertas: administrador del negocio, administrador de Regalones o ambos.
- [ ] Definir si los REGIS pendientes se liberan manualmente, automáticamente por tiempo o mediante ambos mecanismos.
- [ ] Definir el plazo máximo de revisión.
- [ ] Definir las notificaciones para el vecino y el comercio.
- [ ] Definir qué ocurre al confirmar fraude: bloquear, revertir o mantener pendientes los REGIS.
- [ ] Registrar siempre la razón de riesgo sin exponer internamente las reglas sensibles al cliente.

## Flujo técnico implementado en la acumulación V1

1. El cajero aprueba la compra y `aprobar_compra()` bloquea la operación para evitar duplicados.
2. La función obtiene la regla REGIS vigente y calcula la cantidad correspondiente.
3. La función evalúa las reglas de riesgo dentro de la misma transacción.
4. Si no existe alerta, crea el movimiento como `disponible` y aumenta `saldos_regis.disponibles`.
5. Si existe alerta, crea el movimiento como `pendiente`, aumenta `saldos_regis.pendientes` y registra una alerta.
6. La revisión, liberación y reversa de REGIS queda como el siguiente bloque del Hito C.
7. El frontend nunca inserta movimientos ni modifica saldos directamente.

## Criterios de cierre del Hito C

- [x] Decisiones comerciales base aprobadas y documentadas.
- [ ] Límites antifraude reales aprobados y documentados.
- [x] Migración versionada para configuración, `movimientos_regis`, `saldos_regis` y alertas necesarias.
- [x] RPC de acreditación integrada con `aprobar_compra()`.
- [ ] RPC segura de revisión, liberación y reversa.
- [x] RLS y permisos mínimos por vecino, negocio y administrador de Regalones.
- [x] Pruebas de doble aprobación e idempotencia.
- [x] Pruebas de monto mínimo, redondeo, remanente y versión aplicada.
- [ ] Pruebas de monto alto y acumulaciones repetidas.
- [x] Prueba configurable de monto alto.
- [x] Pruebas de aislamiento entre negocios.
- [ ] Pruebas de reversa sin modificar ni borrar el historial contable.
- [x] Tipos TypeScript regenerados y aplicaciones verificadas.
- [x] Migración validada localmente antes del despliegue remoto.

## Próximos bloques

1. Revisar el `db push --dry-run` y desplegar la acumulación V1 en Supabase remoto.
2. Definir los umbrales reales de monto alto y velocidad de acumulación.
3. Implementar la revisión, liberación, bloqueo y reversa de movimientos pendientes.
4. Implementar beneficios versionados con porcentaje y monto máximo de descuento.
5. Implementar reservas y canjes sin mezclar saldos entre comercios.
