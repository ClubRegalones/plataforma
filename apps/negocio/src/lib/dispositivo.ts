import { supabase } from './supabase'

export type ConfiguracionDispositivoNegocio = {
  terminalId: string
  tokenTerminal: string
  identificadorPublico: string
  cajaId: string
  negocioId: string
  nombreNegocio: string
  sucursalId: string
  nombreSucursal: string
  nombreCaja: string
  codigoCaja: string | null
  nombreDispositivo: string
}

type ContextoDispositivo = {
  terminal_id: string
  caja_id: string
  caja_nombre: string
  caja_codigo: string | null
  sucursal_id: string
  sucursal_nombre: string
  negocio_id: string
  negocio_nombre: string
}

export type PreparacionCajaRegalones = {
  caja_id: string
  caja_nombre: string
  caja_creada: boolean
  terminal_id: string | null
  terminal_identificador: string | null
  terminal_nombre_dispositivo: string | null
  terminal_estado: string | null
}

type RegistroDispositivo = {
  terminal_id: string
  caja_id: string
  identificador_publico: string
  token_terminal: string
  nombre_dispositivo: string
}

type Rpc = <T>(
  funcion: string,
  parametros: Record<string, unknown>,
) => Promise<{ data: T[] | null; error: unknown }>

const rpc = supabase.rpc.bind(supabase) as unknown as Rpc

const CLAVE_CONFIGURACION = 'club-regalones:app-negocio-configurada:v1'

export function leerConfiguracionDispositivo() {
  const guardada = window.localStorage.getItem(CLAVE_CONFIGURACION)
  if (!guardada) return null

  try {
    const configuracion = JSON.parse(
      guardada,
    ) as ConfiguracionDispositivoNegocio

    if (
      !configuracion.terminalId ||
      !configuracion.tokenTerminal ||
      !configuracion.cajaId ||
      !configuracion.negocioId ||
      !configuracion.sucursalId
    ) {
      window.localStorage.removeItem(CLAVE_CONFIGURACION)
      return null
    }

    return configuracion
  } catch {
    window.localStorage.removeItem(CLAVE_CONFIGURACION)
    return null
  }
}

export function guardarConfiguracionDispositivo(
  configuracion: ConfiguracionDispositivoNegocio,
) {
  window.localStorage.setItem(
    CLAVE_CONFIGURACION,
    JSON.stringify(configuracion),
  )
}

export function eliminarConfiguracionDispositivo() {
  window.localStorage.removeItem(CLAVE_CONFIGURACION)
}

async function obtenerContexto(
  terminalId: string,
  tokenTerminal: string,
) {
  const { data, error } = await rpc<ContextoDispositivo>(
    'terminal_obtener_contexto',
    {
      p_terminal_id: terminalId,
      p_token_terminal: tokenTerminal,
      p_version_app: __APP_VERSION__,
    },
  )

  if (error) throw error
  return data?.[0] ?? null
}

export async function validarConfiguracionDispositivo(
  configuracion: ConfiguracionDispositivoNegocio,
) {
  const contexto = await obtenerContexto(
    configuracion.terminalId,
    configuracion.tokenTerminal,
  )

  if (!contexto) {
    throw new Error('No pudimos identificar este dispositivo en Club Regalones.')
  }

  if (
    contexto.terminal_id !== configuracion.terminalId ||
    contexto.caja_id !== configuracion.cajaId ||
    contexto.negocio_id !== configuracion.negocioId
  ) {
    throw new Error('La configuración guardada ya no coincide con la Caja Regalones.')
  }

  const actualizada: ConfiguracionDispositivoNegocio = {
    ...configuracion,
    cajaId: contexto.caja_id,
    negocioId: contexto.negocio_id,
    nombreNegocio: contexto.negocio_nombre,
    sucursalId: contexto.sucursal_id,
    nombreSucursal: contexto.sucursal_nombre,
    nombreCaja: contexto.caja_nombre,
    codigoCaja: contexto.caja_codigo,
  }

  guardarConfiguracionDispositivo(actualizada)
  return actualizada
}

export async function prepararCajaRegalones(sucursalId: string) {
  const { data, error } = await rpc<PreparacionCajaRegalones>(
    'preparar_caja_regalones',
    { p_sucursal_id: sucursalId },
  )

  if (error) throw error
  return data?.[0] ?? null
}

export async function registrarDispositivoCaja(
  cajaId: string,
  mover: boolean,
) {
  const nombreDispositivo = `App Negocio · ${navigator.platform || 'dispositivo'}`
  const funcion = mover ? 'mover_terminal_pwa' : 'registrar_terminal_pwa'

  const { data, error } = await rpc<RegistroDispositivo>(funcion, {
    p_caja_id: cajaId,
    p_nombre_dispositivo: nombreDispositivo,
    p_version_app: __APP_VERSION__,
  })

  if (error) throw error

  const registro = data?.[0]
  if (!registro) {
    throw new Error('Club Regalones no devolvió la credencial del dispositivo.')
  }

  const contexto = await obtenerContexto(
    registro.terminal_id,
    registro.token_terminal,
  )

  if (!contexto) {
    throw new Error('No pudimos confirmar a qué negocio pertenece este dispositivo.')
  }

  const configuracion: ConfiguracionDispositivoNegocio = {
    terminalId: registro.terminal_id,
    tokenTerminal: registro.token_terminal,
    identificadorPublico: registro.identificador_publico,
    cajaId: contexto.caja_id,
    negocioId: contexto.negocio_id,
    nombreNegocio: contexto.negocio_nombre,
    sucursalId: contexto.sucursal_id,
    nombreSucursal: contexto.sucursal_nombre,
    nombreCaja: contexto.caja_nombre,
    codigoCaja: contexto.caja_codigo,
    nombreDispositivo: registro.nombre_dispositivo,
  }

  guardarConfiguracionDispositivo(configuracion)
  return configuracion
}
