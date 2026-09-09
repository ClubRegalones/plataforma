import type { Database } from '@club-regalones/domain'
import { supabase } from './supabase'
import type { ConfiguracionDispositivoNegocio } from './dispositivo'

export type CanjePendienteNegocio =
  Database['public']['Functions']['terminal_listar_canjes_pendientes']['Returns'][number]

export type ResultadoCanjeNegocio =
  Database['public']['Functions']['terminal_confirmar_compra_con_canje']['Returns'][number]

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

export async function listarCanjesPendientesNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
  limite = 100,
) {
  const { data, error } = await supabase.rpc(
    'terminal_listar_canjes_pendientes',
    {
      ...credencial(configuracion, turnoId),
      p_limite: limite,
    },
  )

  if (error) throw error
  return data as CanjePendienteNegocio[]
}

export async function cancelarCanjePendienteNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
  canjeId: string,
) {
  const { data, error } = await supabase.rpc(
    'terminal_cancelar_canje',
    {
      ...credencial(configuracion, turnoId),
      p_canje_id: canjeId,
    },
  )

  if (error) throw error
  return data[0] ?? null
}

export async function confirmarCanjeNegocio(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
  canjeId: string,
  montoBrutoClp: number,
  folioBoleta = '',
  tokenQr?: string,
) {
  const { data, error } = await supabase.rpc(
    'terminal_confirmar_compra_con_canje',
    {
      ...credencial(configuracion, turnoId),
      p_canje_id: canjeId,
      p_monto_bruto_clp: montoBrutoClp,
      p_folio_boleta: folioBoleta.trim() || undefined,
      p_qr_token: tokenQr?.trim() || undefined,
    },
  )

  if (error) throw error
  return data[0] ?? null
}