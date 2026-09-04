export type ReglaDescuentoBeneficio = {
  tipo: 'porcentaje_descuento' | 'monto_fijo'
  porcentajeDescuentoBp: number | null
  montoDescuentoFijoClp: number | null
  topeDescuentoClp: number | null
  porcentajeMaximoCanjeBp: number
}

export function calcularDescuentoBeneficio(
  montoCompraClp: number,
  regla: ReglaDescuentoBeneficio,
) {
  if (!Number.isFinite(montoCompraClp) || montoCompraClp <= 0) return 0

  const monto = Math.floor(montoCompraClp)
  const descuentoTeorico =
    regla.tipo === 'porcentaje_descuento'
      ? Math.floor(
          (monto * (regla.porcentajeDescuentoBp ?? 0)) / 10_000,
        )
      : (regla.montoDescuentoFijoClp ?? 0)
  const topePromocion = regla.topeDescuentoClp ?? descuentoTeorico
  const topeGeneral = Math.floor(
    (monto * regla.porcentajeMaximoCanjeBp) / 10_000,
  )

  return Math.max(
    0,
    Math.min(descuentoTeorico, topePromocion, topeGeneral, monto),
  )
}

export function calcularCompraParaDescuentoCompleto(
  regla: ReglaDescuentoBeneficio,
) {
  const descuentoObjetivo =
    regla.tipo === 'monto_fijo'
      ? regla.montoDescuentoFijoClp
      : regla.topeDescuentoClp

  if (!descuentoObjetivo || descuentoObjetivo <= 0) return null

  const porcentajeEfectivoBp =
    regla.tipo === 'monto_fijo'
      ? regla.porcentajeMaximoCanjeBp
      : Math.min(
          regla.porcentajeDescuentoBp ?? 0,
          regla.porcentajeMaximoCanjeBp,
        )

  if (porcentajeEfectivoBp <= 0) return null

  return Math.ceil((descuentoObjetivo * 10_000) / porcentajeEfectivoBp)
}
