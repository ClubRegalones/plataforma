import type { Database } from '@club-regalones/domain'
import { supabase } from './supabase'

export type HistorialCanjeRegis = Database['public']['Functions']['listar_historial_canjes_admin']['Returns'][number]

export async function listarHistorialCanjesAdmin(limite = 200) {
  const { data, error } = await supabase.rpc('listar_historial_canjes_admin', { p_limite: limite })
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
