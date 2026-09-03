import type { Database } from '@club-regalones/domain'
import { supabase } from './supabase'
import type { CredencialTerminalLocal } from './terminalPwa'

export type TurnoTerminal =
  Database['public']['Functions']['terminal_iniciar_turno']['Returns'][number]

export type ResultadoCanjeEnTurno =
  Database['public']['Functions']['confirmar_compra_con_canje_en_turno']['Returns'][number]

export async function iniciarTurnoTerminal(
  credencial: CredencialTerminalLocal,
  nombreCajero: string,
) {
  const { data, error } = await supabase.rpc('terminal_iniciar_turno', {
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
  const { data, error } = await supabase.rpc('terminal_consultar_turno', {
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
  const { data, error } = await supabase.rpc('terminal_cerrar_turno', {
    p_turno_id: turnoId,
    p_terminal_id: credencial.terminalId,
    p_token_terminal: credencial.tokenTerminal,
  })

  if (error) throw error
  return data
}

export async function informarMontoTerminal(
  solicitudId: string,
  monto: number,
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc('terminal_informar_monto', {
    p_solicitud_id: solicitudId,
    p_monto: monto,
    p_turno_id: turnoId,
    p_terminal_id: credencial.terminalId,
    p_token_terminal: credencial.tokenTerminal,
  })

  if (error) throw error
  return data
}

export async function corregirMontoTerminal(
  solicitudId: string,
  monto: number,
  motivo: string,
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc('terminal_corregir_monto', {
    p_solicitud_id: solicitudId,
    p_monto: monto,
    p_motivo: motivo.trim(),
    p_turno_id: turnoId,
    p_terminal_id: credencial.terminalId,
    p_token_terminal: credencial.tokenTerminal,
  })

  if (error) throw error
  return data
}

export async function solicitarReingresoMontoTerminal(
  solicitudId: string,
  motivo: string,
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_solicitar_reingreso_monto',
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

export async function aprobarCompraEnTurno(
  solicitudId: string,
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc('terminal_aprobar_compra', {
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
  const { data, error } = await supabase.rpc('terminal_rechazar_compra', {
    p_solicitud_id: solicitudId,
    p_motivo: motivo.trim(),
    p_turno_id: turnoId,
    p_terminal_id: credencial.terminalId,
    p_token_terminal: credencial.tokenTerminal,
  })

  if (error) throw error
  return data
}

export async function listarSolicitudesTerminal(
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_listar_solicitudes',
    {
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
      p_turno_id: turnoId,
    },
  )

  if (error) throw error
  return data
}

/*
 * Canjes todavía usan su wrapper autenticado actual.
 * Los separaremos en la siguiente etapa de la API Terminal.
 */
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

/* ============================================================================
 * PANTALLA 6 - POS ACTIVO
 * ========================================================================== */

export type VecinoTelefonoTerminal =
  Database['public']['Functions']['terminal_buscar_vecino_por_telefono']['Returns'][number]

export type ResumenTurnoTerminal =
  Database['public']['Functions']['terminal_resumen_turno']['Returns'][number]

export type CompraDetectadaTerminal =
  Database['public']['Functions']['terminal_listar_compras_detectadas']['Returns'][number]

export async function buscarVecinoPorTelefonoTerminal(
  telefono: string,
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_buscar_vecino_por_telefono',
    {
      p_telefono: telefono,
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )

  if (error) throw error
  return data[0] ?? null
}

export async function crearSolicitudCompraPorTelefonoTerminal(
  telefono: string,
  monto: number,
  idempotencyKey: string,
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_crear_solicitud_compra_por_telefono',
    {
      p_telefono: telefono,
      p_monto: monto,
      p_idempotency_key: idempotencyKey,
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )

  if (error) throw error
  return data
}

export async function listarComprasDetectadasTerminal(
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_listar_compras_detectadas',
    {
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )

  if (error) throw error
  return data
}

export async function obtenerResumenTurnoTerminal(
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_resumen_turno',
    {
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )

  if (error) throw error
  return data[0] ?? null
}
