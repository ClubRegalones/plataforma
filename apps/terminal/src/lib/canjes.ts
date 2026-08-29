import type { Database } from '@club-regalones/domain'
import { supabase } from './supabase'
import type { CredencialTerminalLocal } from './terminalPwa'

export type BeneficioCanjeTerminal =
  Database['public']['Functions']['terminal_listar_beneficios_canje']['Returns'][number]
export type CanjeQrConsultado =
  Database['public']['Functions']['terminal_consultar_canje_qr']['Returns'][number]
export type ReservaCanjeLlavero =
  Database['public']['Functions']['terminal_reservar_canje_llavero']['Returns'][number]
export type ResultadoCanje =
  Database['public']['Functions']['terminal_confirmar_compra_con_canje']['Returns'][number]
export type HistorialCanjeNegocio =
  Database['public']['Functions']['terminal_listar_historial_canjes']['Returns'][number]

type ContextoTurnoTerminal = {
  turnoId: string
  credencial: CredencialTerminalLocal
}

export async function listarBeneficiosCanjeTerminal({
  turnoId,
  credencial,
}: ContextoTurnoTerminal) {
  const { data, error } = await supabase.rpc(
    'terminal_listar_beneficios_canje',
    {
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )
  if (error) throw error
  return data
}

export async function consultarCanjeRegisQr(
  tokenQr: string,
  { turnoId, credencial }: ContextoTurnoTerminal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_consultar_canje_qr',
    {
      p_qr_token: tokenQr,
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )
  if (error) throw error
  return data[0] ?? null
}

export async function reservarCanjeRegisLlavero(
  tokenLlavero: string,
  beneficioVersionId: string,
  idempotencyKey: string,
  { turnoId, credencial }: ContextoTurnoTerminal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_reservar_canje_llavero',
    {
      p_token_llavero: tokenLlavero,
      p_beneficio_version_id: beneficioVersionId,
      p_idempotency_key: idempotencyKey,
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )
  if (error) throw error
  return data[0] ?? null
}

export async function reservarCanjeRegisDesdeLectura(
  lecturaId: string,
  beneficioVersionId: string,
  idempotencyKey: string,
  contexto: ContextoTurnoTerminal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_reservar_canje_desde_lectura',
    {
      p_lectura_id: lecturaId,
      p_beneficio_version_id: beneficioVersionId,
      p_idempotency_key: idempotencyKey,
      p_turno_id: contexto.turnoId,
      p_terminal_id: contexto.credencial.terminalId,
      p_token_terminal: contexto.credencial.tokenTerminal,
    },
  )

  if (error) throw error
  return data[0] ?? null
}

export async function confirmarCompraConCanje(
  canjeId: string,
  montoBrutoClp: number,
  folioBoleta: string,
  tokenQr: string | undefined,
  { turnoId, credencial }: ContextoTurnoTerminal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_confirmar_compra_con_canje',
    {
      p_canje_id: canjeId,
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

export async function cancelarCanjeRegis(
  canjeId: string,
  { turnoId, credencial }: ContextoTurnoTerminal,
) {
  const { data, error } = await supabase.rpc('terminal_cancelar_canje', {
    p_canje_id: canjeId,
    p_turno_id: turnoId,
    p_terminal_id: credencial.terminalId,
    p_token_terminal: credencial.tokenTerminal,
  })
  if (error) throw error
  return data[0] ?? null
}

export async function listarHistorialCanjesNegocio({
  turnoId,
  credencial,
}: ContextoTurnoTerminal) {
  const { data, error } = await supabase.rpc(
    'terminal_listar_historial_canjes',
    {
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
      p_limite: 100,
    },
  )
  if (error) throw error
  return data
}

export async function marcarCanjeNegocioLeido(
  canjeId: string,
  { turnoId, credencial }: ContextoTurnoTerminal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_marcar_canje_leido',
    {
      p_canje_id: canjeId,
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )
  if (error) throw error
  return data[0] ?? null
}
