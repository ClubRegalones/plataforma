import type { Database } from '@club-regalones/domain'
import { supabase } from './supabase'
import type { ConfiguracionDispositivoNegocio } from './dispositivo'

export type SolicitudCompraNegocio =
  Database['public']['Functions']['terminal_listar_solicitudes_app_negocio']['Returns'][number]
export type ResumenTurnoNegocio =
  Database['public']['Functions']['terminal_resumen_turno']['Returns'][number]

function credencial(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
) {
  return {
    p_turno_id: turnoId,
    p_terminal_id: configuracion.terminalId,
    p_token_terminal: configuracion.tokenTerminal,
  }
}

export async function listarSolicitudesNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
) {
  const { data, error } = await supabase.rpc('terminal_listar_solicitudes_app_negocio', {
    ...credencial(configuracion, turnoId),
  })

  if (error) throw error
  return data as SolicitudCompraNegocio[]
}

export async function obtenerResumenTurnoNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
) {
  const { data, error } = await supabase.rpc('terminal_resumen_turno', {
    ...credencial(configuracion, turnoId),
  })

  if (error) throw error
  return data[0] ?? null
}

export async function informarMontoNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
  solicitudId: string,
  monto: number,
) {
  const { data, error } = await supabase.rpc('terminal_informar_monto', {
    ...credencial(configuracion, turnoId),
    p_solicitud_id: solicitudId,
    p_monto: monto,
  })

  if (error) throw error
  return data
}

export async function corregirMontoNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
  solicitudId: string,
  monto: number,
  motivo: string,
) {
  const { data, error } = await supabase.rpc('terminal_corregir_monto', {
    ...credencial(configuracion, turnoId),
    p_solicitud_id: solicitudId,
    p_monto: monto,
    p_motivo: motivo.trim(),
  })

  if (error) throw error
  return data
}

export async function solicitarReingresoMontoNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
  solicitudId: string,
  motivo: string,
) {
  const { data, error } = await supabase.rpc('terminal_solicitar_reingreso_monto', {
    ...credencial(configuracion, turnoId),
    p_solicitud_id: solicitudId,
    p_motivo: motivo.trim(),
  })

  if (error) throw error
  return data
}

export async function aprobarCompraNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
  solicitudId: string,
) {
  const { data, error } = await supabase.rpc('terminal_aprobar_compra', {
    ...credencial(configuracion, turnoId),
    p_solicitud_id: solicitudId,
  })

  if (error) throw error
  return data
}

export async function rechazarCompraNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
  solicitudId: string,
  motivo: string,
) {
  const { data, error } = await supabase.rpc('terminal_rechazar_compra', {
    ...credencial(configuracion, turnoId),
    p_solicitud_id: solicitudId,
    p_motivo: motivo.trim(),
  })

  if (error) throw error
  return data
}
