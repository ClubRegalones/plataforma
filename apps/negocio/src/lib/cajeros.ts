import { supabase } from './supabase'
import type { ConfiguracionDispositivoNegocio } from './dispositivo'

export type CajeroDisponible = {
  cajero_id: string
  nombre: string
  apellido: string | null
  rol: 'cajero' | 'supervisor'
  requiere_pin: boolean
}

export type CajeroOnboarding = {
  id: string
  nombre: string
  apellido: string
  rol: 'cajero' | 'supervisor'
  pin?: string
}

export type ModoIdentificacionCajero = 'solo_nombre' | 'nombre_pin'

export type TurnoAppNegocio = {
  turno_id: string
  terminal_id: string
  caja_id: string
  negocio_id: string
  cajero_negocio_id: string | null
  nombre_cajero: string
  estado: 'abierto' | 'cerrado' | 'cerrado_automaticamente'
  iniciado_en: string
}

type ResultadoInicioTurno = TurnoAppNegocio & {
  autenticado: boolean
  mensaje: string
}

type Rpc = <T>(
  funcion: string,
  parametros: Record<string, unknown>,
) => Promise<{ data: T[] | null; error: unknown }>

const rpc = supabase.rpc.bind(supabase) as unknown as Rpc

function credencial(configuracion: ConfiguracionDispositivoNegocio) {
  return {
    p_terminal_id: configuracion.terminalId,
    p_token_terminal: configuracion.tokenTerminal,
  }
}

export async function configurarEquipoInicial(
  configuracion: ConfiguracionDispositivoNegocio,
  modo: ModoIdentificacionCajero,
  cajeros: CajeroOnboarding[],
) {
  const { data, error } = await rpc<{ cajeros_creados: number; modo: ModoIdentificacionCajero }>(
    'negocio_configurar_equipo_inicial',
    {
      ...credencial(configuracion),
      p_modo: modo,
      p_cajeros: cajeros.map((cajero) => ({
        id: cajero.id,
        nombre: cajero.nombre.trim(),
        apellido: cajero.apellido.trim(),
        rol: cajero.rol,
        pin: cajero.pin?.trim() ?? '',
      })),
    },
  )

  if (error) throw error
  return data?.[0] ?? null
}

export async function listarCajerosDispositivo(
  configuracion: ConfiguracionDispositivoNegocio,
) {
  const { data, error } = await rpc<CajeroDisponible>(
    'negocio_listar_cajeros_dispositivo',
    credencial(configuracion),
  )

  if (error) throw error
  return data ?? []
}

export async function consultarTurnoNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
) {
  const { data, error } = await rpc<TurnoAppNegocio>(
    'negocio_consultar_turno',
    credencial(configuracion),
  )

  if (error) throw error
  return data?.[0] ?? null
}

export async function iniciarTurnoNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
  cajeroId: string,
  pin = '',
) {
  const { data, error } = await rpc<ResultadoInicioTurno>(
    'negocio_iniciar_turno',
    {
      ...credencial(configuracion),
      p_cajero_id: cajeroId,
      p_pin: pin,
    },
  )

  if (error) throw error
  return data?.[0] ?? null
}

export async function cerrarTurnoNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
) {
  const { error } = await rpc<unknown>('terminal_cerrar_turno', {
    ...credencial(configuracion),
    p_turno_id: turnoId,
  })

  if (error) throw error
}
