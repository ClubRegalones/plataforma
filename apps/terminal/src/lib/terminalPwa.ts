import type { Database } from '@club-regalones/domain'
import { supabase } from './supabase'

export type CredencialTerminalLocal = {
  terminalId: string
  cajaId: string
  identificadorPublico: string
  tokenTerminal: string
  nombreDispositivo: string
}

export type LecturaPendienteTerminal = {
  lectura_id: string
  llavero_id: string
  vecino_id: string
  codigo_publico_llavero: string
  nombre_vecino: string
  leido_en: string
  expira_en: string
}

export type LecturaOperativaTerminal =
  Database['public']['Functions']['reclamar_lectura_llavero_terminal']['Returns'][number]

const claveTerminal = (cajaId: string) =>
  `club-regalones:terminal-pwa:${cajaId}`

export function leerCredencialTerminal(cajaId: string) {
  const guardada = window.localStorage.getItem(claveTerminal(cajaId))
  if (!guardada) return null

  try {
    return JSON.parse(guardada) as CredencialTerminalLocal
  } catch {
    window.localStorage.removeItem(claveTerminal(cajaId))
    return null
  }
}

export function guardarCredencialTerminal(
  credencial: CredencialTerminalLocal,
) {
  window.localStorage.setItem(
    claveTerminal(credencial.cajaId),
    JSON.stringify(credencial),
  )
}

export function eliminarCredencialTerminal(cajaId: string) {
  window.localStorage.removeItem(claveTerminal(cajaId))
}

export async function registrarTerminalPwa(
  cajaId: string,
  nombreDispositivo: string,
) {
  const { data, error } = await supabase.rpc('registrar_terminal_pwa', {
    p_caja_id: cajaId,
    p_nombre_dispositivo: nombreDispositivo,
    p_version_app: __APP_VERSION__,
  })

  if (error) throw error
  const registro = data[0]
  if (!registro) return null

  const credencial: CredencialTerminalLocal = {
    terminalId: registro.terminal_id,
    cajaId: registro.caja_id,
    identificadorPublico: registro.identificador_publico,
    tokenTerminal: registro.token_terminal,
    nombreDispositivo: registro.nombre_dispositivo,
  }

  guardarCredencialTerminal(credencial)
  return credencial
}

export async function validarTerminalPwa(
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc('validar_terminal_pwa', {
    p_terminal_id: credencial.terminalId,
    p_token_terminal: credencial.tokenTerminal,
    p_version_app: __APP_VERSION__,
  })

  if (error) throw error
  return data[0] ?? null
}

export async function crearVinculacionLector(
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc(
    'crear_vinculacion_lector_terminal',
    {
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
      p_nombre_lector: 'Celular lector del turno',
    },
  )

  if (error) throw error
  return data[0] ?? null
}

export async function listarLecturasPendientes(terminalId: string) {
  const { data, error } = await supabase.rpc(
    'listar_lecturas_pendientes_terminal',
    { p_terminal_id: terminalId },
  )

  if (error) throw error
  return data as LecturaPendienteTerminal[]
}

export async function reclamarLecturaTerminal(
  credencial: CredencialTerminalLocal,
  lecturaId: string,
) {
  const { data, error } = await supabase.rpc(
    'reclamar_lectura_llavero_terminal',
    {
      p_lectura_id: lecturaId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )

  if (error) throw error
  return data[0] ?? null
}

export async function cerrarLector(terminalId: string) {
  const { error } = await supabase.rpc('cerrar_sesion_lector_movil', {
    p_terminal_id: terminalId,
  })
  if (error) throw error
}
