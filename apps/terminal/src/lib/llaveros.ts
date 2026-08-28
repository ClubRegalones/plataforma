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
  cajaId: string,
) {
  const { data, error } = await supabase.rpc('consultar_llavero_activacion', {
    p_token: token,
    p_caja_id: cajaId,
  })

  if (error) throw error

  return data[0] ?? null
}

export async function activarLlaveroPrimerUso(
  token: string,
  cajaId: string,
  metodo: MetodoActivacionLlavero,
  pin: string | null,
  identidadVerificada: boolean,
) {
  const { data, error } = await supabase.rpc('activar_llavero_primer_uso', {
    p_token: token,
    p_caja_id: cajaId,
    p_metodo: metodo,
    p_pin: pin ?? undefined,
    p_identidad_verificada: identidadVerificada,
  })

  if (error) throw error

  return data[0] ?? null
}

export async function activarLlaveroDesdeLectura(
  lecturaId: string,
  credencial: CredencialTerminalLocal,
  metodo: MetodoActivacionLlavero,
  pin: string | null,
  identidadVerificada: boolean,
) {
  const { data, error } = await supabase.rpc(
    'activar_llavero_desde_lectura',
    {
      p_lectura_id: lecturaId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
      p_metodo: metodo,
      p_pin: pin ?? undefined,
      p_identidad_verificada: identidadVerificada,
    },
  )

  if (error) throw error
  return data[0] ?? null
}
