import type { Database } from '@club-regalones/domain'
import { supabase } from './supabase'
import type { CredencialTerminalLocal } from './terminalPwa'

export type TurnoTerminal =
  Database['public']['Functions']['iniciar_turno_terminal']['Returns'][number]

export type ResultadoCanjeEnTurno =
  Database['public']['Functions']['confirmar_compra_con_canje_en_turno']['Returns'][number]

export async function iniciarTurnoTerminal(
  credencial: CredencialTerminalLocal,
  nombreCajero: string,
) {
  const { data, error } = await supabase.rpc('iniciar_turno_terminal', {
    p_terminal_id: credencial.terminalId,
    p_token_terminal: credencial.tokenTerminal,
    p_nombre_cajero: nombreCajero.trim(),
  })

  if (error) throw error
  return data[0] ?? null
}

export async function consultarTurnoTerminal(
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc('consultar_turno_terminal', {
    p_terminal_id: credencial.terminalId,
    p_token_terminal: credencial.tokenTerminal,
  })

  if (error) throw error
  return data[0] ?? null
}

export async function cerrarTurnoTerminal(
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc('cerrar_turno_terminal', {
    p_turno_id: turnoId,
    p_terminal_id: credencial.terminalId,
    p_token_terminal: credencial.tokenTerminal,
  })

  if (error) throw error
  return data
}

export async function aprobarCompraEnTurno(
  solicitudId: string,
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc('aprobar_compra_en_turno', {
    p_solicitud_id: solicitudId,
    p_turno_id: turnoId,
    p_terminal_id: credencial.terminalId,
    p_token_terminal: credencial.tokenTerminal,
  })

  if (error) throw error
  return data
}

export async function rechazarSolicitudCompraEnTurno(
  solicitudId: string,
  motivo: string,
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc(
    'rechazar_solicitud_compra_en_turno',
    {
      p_solicitud_id: solicitudId,
      p_motivo: motivo.trim(),
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )

  if (error) throw error
  return data
}

export async function confirmarCompraConCanjeEnTurno(
  canjeId: string,
  cajaId: string,
  montoBrutoClp: number,
  turnoId: string,
  credencial: CredencialTerminalLocal,
  folioBoleta: string,
  tokenQr?: string,
) {
  const { data, error } = await supabase.rpc(
    'confirmar_compra_con_canje_en_turno',
    {
      p_canje_id: canjeId,
      p_caja_id: cajaId,
      p_monto_bruto_clp: montoBrutoClp,
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
      p_folio_boleta: folioBoleta.trim() || undefined,
      p_qr_token: tokenQr?.trim() || undefined,
    },
  )

  if (error) throw error
  return data[0] ?? null
}
