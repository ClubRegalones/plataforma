import { supabase } from './supabase'
import type { ConfiguracionDispositivoNegocio } from './dispositivo'
import type { ModoIdentificacionCajero } from './cajeros'

export type OrigenCreacionCajero =
  | 'activacion_app'
  | 'app_negocio'
  | 'portal_comercio'

export type CajeroAdministracion = {
  cajero_id: string
  nombre: string
  apellido: string | null
  rol: 'cajero' | 'supervisor'
  estado: 'activo' | 'inactivo'
  sucursal_ids: string[]
  origen_creacion: OrigenCreacionCajero
  tiene_pin: boolean
  creado_en: string
  deshabilitado_en: string | null
}

export type NuevoCajeroApp = {
  nombre: string
  apellido: string
  rol: 'cajero' | 'supervisor'
  pin?: string
}

type Rpc = <T>(
  funcion: string,
  parametros: Record<string, unknown>,
) => Promise<{ data: T | null; error: unknown }>

const rpc = supabase.rpc.bind(supabase) as unknown as Rpc

export async function listarCajerosAdministracion(negocioId: string) {
  const { data, error } = await rpc<CajeroAdministracion[]>(
    'listar_cajeros_negocio_administracion',
    { p_negocio_id: negocioId },
  )

  if (error) throw error
  return data ?? []
}

export async function crearCajeroDesdeApp(
  configuracion: ConfiguracionDispositivoNegocio,
  cajero: NuevoCajeroApp,
) {
  const { error } = await rpc<unknown>('crear_cajero_negocio_app', {
    p_negocio_id: configuracion.negocioId,
    p_nombre: cajero.nombre.trim(),
    p_apellido: cajero.apellido.trim(),
    p_pin: cajero.pin?.trim() ?? '',
    p_sucursal_ids: [configuracion.sucursalId],
    p_rol: cajero.rol,
  })

  if (error) throw error
}

export async function deshabilitarCajero(cajeroId: string) {
  const { error } = await rpc<unknown>('deshabilitar_cajero_negocio', {
    p_cajero_id: cajeroId,
  })

  if (error) throw error
}

export async function reactivarCajero(cajeroId: string) {
  const { error } = await rpc<unknown>('reactivar_cajero_negocio', {
    p_cajero_id: cajeroId,
  })

  if (error) throw error
}

export async function cambiarPinCajero(cajeroId: string, pin: string) {
  const { error } = await rpc<unknown>('cambiar_pin_cajero_negocio', {
    p_cajero_id: cajeroId,
    p_pin: pin,
  })

  if (error) throw error
}

export async function configurarModoIdentificacion(
  sucursalId: string,
  modo: ModoIdentificacionCajero,
) {
  const { error } = await rpc<unknown>('configurar_modo_identificacion_cajeros', {
    p_sucursal_id: sucursalId,
    p_modo: modo,
  })

  if (error) throw error
}
