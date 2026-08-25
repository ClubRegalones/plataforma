import { supabase } from './supabase'

export async function crearCompraAsistida(
  token: string,
  cajaId: string,
  monto: number,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc(
    'crear_solicitud_compra_asistida',
    {
      p_token: token,
      p_caja_id: cajaId,
      p_monto: monto,
      p_idempotency_key: idempotencyKey,
    },
  )

  if (error) throw error

  return data
}
