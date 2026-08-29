import { supabase } from './supabase'
import type { CredencialTerminalLocal } from './terminalPwa'

export async function crearCompraAsistida(
  token: string,
  turnoId: string,
  credencial: CredencialTerminalLocal,
  monto: number,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc(
    'terminal_crear_compra_asistida',
    {
      p_token: token,
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

export async function crearCompraAsistidaDesdeLectura(
  lecturaId: string,
  turnoId: string,
  credencial: CredencialTerminalLocal,
  monto: number,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc(
    'terminal_crear_compra_desde_lectura',
    {
      p_lectura_id: lecturaId,
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
      p_monto: monto,
      p_idempotency_key: idempotencyKey,
    },
  )

  if (error) throw error
  return data
}
