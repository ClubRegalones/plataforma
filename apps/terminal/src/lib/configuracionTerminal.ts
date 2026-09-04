import type { Database } from '@club-regalones/domain'
import { supabase } from './supabase'
import type { CredencialTerminalLocal } from './terminalPwa'

export type ContextoTerminal =
  Database['public']['Functions']['terminal_obtener_contexto']['Returns'][number]

export type ConfiguracionTerminalLocal = CredencialTerminalLocal & {
  negocioId: string
  nombreNegocio: string
  sucursalId: string
  nombreSucursal: string
  nombreCaja: string
  codigoCaja: string | null
}

const CLAVE_CONFIGURACION =
  'club-regalones:terminal-configurada:v1'

export function leerConfiguracionTerminal() {
  const guardada = window.localStorage.getItem(CLAVE_CONFIGURACION)

  if (!guardada) return null

  try {
    const configuracion = JSON.parse(
      guardada,
    ) as ConfiguracionTerminalLocal

    if (
      !configuracion.terminalId ||
      !configuracion.tokenTerminal ||
      !configuracion.cajaId ||
      !configuracion.negocioId
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

export function guardarConfiguracionTerminal(
  configuracion: ConfiguracionTerminalLocal,
) {
  window.localStorage.setItem(
    CLAVE_CONFIGURACION,
    JSON.stringify(configuracion),
  )
}

export function eliminarConfiguracionTerminal() {
  window.localStorage.removeItem(CLAVE_CONFIGURACION)
}

export async function obtenerContextoTerminal(
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_obtener_contexto',
    {
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
      p_version_app: __APP_VERSION__,
    },
  )

  if (error) throw error

  return data[0] ?? null
}

export function construirConfiguracionTerminal(
  credencial: CredencialTerminalLocal,
  contexto: ContextoTerminal,
): ConfiguracionTerminalLocal {
  return {
    ...credencial,
    cajaId: contexto.caja_id,
    negocioId: contexto.negocio_id,
    nombreNegocio: contexto.negocio_nombre,
    sucursalId: contexto.sucursal_id,
    nombreSucursal: contexto.sucursal_nombre,
    nombreCaja: contexto.caja_nombre,
    codigoCaja: contexto.caja_codigo,
  }
}

export async function validarConfiguracionTerminal(
  configuracion: ConfiguracionTerminalLocal,
) {
  const contexto = await obtenerContextoTerminal(configuracion)

  if (!contexto) {
    throw new Error(
      'Supabase no pudo identificar esta Terminal.',
    )
  }

  if (
    contexto.terminal_id !== configuracion.terminalId ||
    contexto.caja_id !== configuracion.cajaId ||
    contexto.negocio_id !== configuracion.negocioId
  ) {
    throw new Error(
      'La configuración local no coincide con la Terminal registrada.',
    )
  }

  return construirConfiguracionTerminal(
    configuracion,
    contexto,
  )
}