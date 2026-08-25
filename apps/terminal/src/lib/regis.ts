import type { Database } from '@club-regalones/domain'
import { supabase } from './supabase'

export type SaldoRegisLlavero =
  Database['public']['Functions']['consultar_saldo_regis_llavero']['Returns'][number]

export async function consultarSaldoRegisLlavero(
  token: string,
  cajaId: string,
) {
  const { data, error } = await supabase.rpc(
    'consultar_saldo_regis_llavero',
    {
      p_token: token,
      p_caja_id: cajaId,
    },
  )

  if (error) throw error

  return data[0] ?? null
}
