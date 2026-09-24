export type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from './database.types'

export { Constants } from './database.types'

export {
  calcularCompraParaDescuentoCompleto,
  calcularDescuentoBeneficio,
} from './reglas-beneficios'
export type { ReglaDescuentoBeneficio } from './reglas-beneficios'
export { registrarVecino, ingresarConRut } from './identidad-vecino'
export type {
  ClienteIdentidad,
  DatosRegistroVecino,
  ResultadoIdentidad,
  CodigoIdentidad,
  SesionVecino,
} from './identidad-vecino'
