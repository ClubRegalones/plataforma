import type { Database } from '@club-regalones/domain'
import { supabase } from './supabase'

export type SaldoRegisPropio =
  Database['public']['Functions']['listar_saldos_regis_propios']['Returns'][number]
export type BeneficioRegisDisponible =
  Database['public']['Functions']['listar_beneficios_regis_disponibles']['Returns'][number]
export type ReservaCanjeRegis =
  Database['public']['Functions']['reservar_canje_regis_qr']['Returns'][number]
export type ReservaCanjeRegisQr = ReservaCanjeRegis & {
  tokenQr: string
}
export type HistorialCanjeRegis =
  Database['public']['Functions']['listar_historial_canjes_vecino']['Returns'][number]

export async function listarSaldosRegisPropios() {
  const { data, error } = await supabase.rpc('listar_saldos_regis_propios')

  if (error) throw error

  return data
}

export async function listarBeneficiosRegisDisponibles() {
  const { data, error } = await supabase.rpc(
    'listar_beneficios_regis_disponibles',
  )

  if (error) throw error

  return data
}

export async function reservarCanjeRegisQr(
  beneficioVersionId: string,
): Promise<ReservaCanjeRegisQr> {
  const tokenQr = `regalones-canje-${crypto.randomUUID()}-${crypto.randomUUID()}`
  const { data, error } = await supabase.rpc('reservar_canje_regis_qr', {
    p_beneficio_version_id: beneficioVersionId,
    p_qr_token: tokenQr,
    p_idempotency_key: `portal-canje-${crypto.randomUUID()}`,
  })

  if (error) throw error

  const reserva = data[0]

  if (!reserva) {
    throw new Error('No pudimos crear la reserva del beneficio.')
  }

  return { ...reserva, tokenQr }
}

export async function cancelarReservaCanjeRegis(canjeId: string) {
  const { data, error } = await supabase.rpc(
    'cancelar_reserva_canje_regis',
    { p_canje_id: canjeId },
  )

  if (error) throw error

  return data[0] ?? null
}

export async function listarHistorialCanjesVecino(limite = 50) {
  const { data, error } = await supabase.rpc(
    'listar_historial_canjes_vecino',
    { p_limite: limite },
  )

  if (error) throw error
  return data
}

export async function listarHistorialCanjesAdmin(limite = 200) {
  const { data, error } = await supabase.rpc(
    'listar_historial_canjes_admin',
    { p_limite: limite },
  )

  if (error) throw error
  return data
}

export async function marcarCanjeRegisLeido(
  canjeId: string,
  destino: 'vecino' | 'negocio' | 'admin_regalones',
) {
  const { data, error } = await supabase.rpc('marcar_canje_regis_leido', {
    p_canje_id: canjeId,
    p_destino: destino,
  })

  if (error) throw error
  return data[0] ?? null
}
