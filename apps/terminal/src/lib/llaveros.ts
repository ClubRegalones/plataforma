import type { Enums } from '@club-regalones/domain'
import { supabase } from './supabase'
import type { CredencialTerminalLocal } from './terminalPwa'

export type ContextoActivacionLlavero = {
  codigo_publico: string
  nombre_vecino: string
  estado: Enums<'estado_llavero_nfc'>
  entregado: boolean
  puede_activar: boolean
  tiene_pin: boolean
}

export type ResultadoActivacionLlavero = {
  activado: boolean
  mensaje: string
  codigo_publico: string
  estado: Enums<'estado_llavero_nfc'>
  activado_en: string | null
}

export type MetodoActivacionLlavero = 'cedula' | 'pin'

export async function consultarLlaveroActivacion(
  token: string,
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_consultar_llavero',
    {
      p_token: token,
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )

  if (error) throw error
  return data[0] ?? null
}

export async function activarLlaveroPrimerUso(
  token: string,
  turnoId: string,
  credencial: CredencialTerminalLocal,
  metodo: MetodoActivacionLlavero,
  pin: string | null,
  identidadVerificada: boolean,
) {
  const { data, error } = await supabase.rpc(
    'terminal_activar_llavero',
    {
      p_token: token,
      p_metodo: metodo,
      p_pin: pin ?? '',
      p_identidad_verificada: identidadVerificada,
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )

  if (error) throw error
  return data[0] ?? null
}

export async function activarLlaveroDesdeLectura(
  lecturaId: string,
  turnoId: string,
  credencial: CredencialTerminalLocal,
  metodo: MetodoActivacionLlavero,
  pin: string | null,
  identidadVerificada: boolean,
) {
  const { data, error } = await supabase.rpc(
    'terminal_activar_llavero_desde_lectura',
    {
      p_lectura_id: lecturaId,
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
      p_metodo: metodo,
      p_pin: pin ?? '',
      p_identidad_verificada: identidadVerificada,
    },
  )

  if (error) throw error
  return data[0] ?? null
}
