import type { Database } from '@club-regalones/domain'
import { supabase } from './supabase'

export type SaldoRegisPropio =
  Database['public']['Functions']['listar_saldos_regis_propios']['Returns'][number]

export async function listarSaldosRegisPropios() {
  const { data, error } = await supabase.rpc('listar_saldos_regis_propios')

  if (error) throw error

  return data
}
