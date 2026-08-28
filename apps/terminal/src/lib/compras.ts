import { supabase } from './supabase'
import type { CredencialTerminalLocal } from './terminalPwa'

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

export async function crearCompraAsistidaDesdeLectura(
  lecturaId: string,
  credencial: CredencialTerminalLocal,
  monto: number,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc(
    'crear_solicitud_compra_desde_lectura',
    {
      p_lectura_id: lecturaId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
      p_monto: monto,
      p_idempotency_key: idempotencyKey,
    },
  )

  if (error) throw error
  return data
}
