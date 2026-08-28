import type { Database, Tables } from '@club-regalones/domain'
import { supabase } from './supabase'
import type { CredencialTerminalLocal } from './terminalPwa'

export type SaldoRegisLlavero =
  Database['public']['Functions']['consultar_saldo_regis_llavero']['Returns'][number]

export type ReglaAcumulacionRegis = Pick<
  Tables<'reglas_regis'>,
  | 'id'
  | 'negocio_id'
  | 'version'
  | 'tasa_acumulacion_bp'
  | 'valor_regis_clp'
  | 'monto_minimo_compra_clp'
  | 'conservar_remanente'
  | 'vigencia_desde'
  | 'vigencia_hasta'
>

export type VistaPreviaRegis = {
  montoValido: boolean
  cumpleMinimo: boolean
  regis: number
  valorRecompensaClp: number
  remanenteDespuesClp: number
}

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

export async function obtenerReglaAcumulacionVigente(
  turnoId: string,
  credencial: CredencialTerminalLocal,
) {
  const { data, error } = await supabase.rpc(
    'terminal_obtener_regla_acumulacion',
    {
      p_turno_id: turnoId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
    },
  )

  if (error) throw error

  return data as ReglaAcumulacionRegis | null
}

export function calcularVistaPreviaRegis(
  monto: number,
  regla: ReglaAcumulacionRegis,
  remanenteActualClp: number,
): VistaPreviaRegis {
  const montoValido = Number.isInteger(monto) && monto > 0
  const cumpleMinimo =
    montoValido && monto >= regla.monto_minimo_compra_clp

  if (!cumpleMinimo) {
    return {
      montoValido,
      cumpleMinimo: false,
      regis: 0,
      valorRecompensaClp: 0,
      remanenteDespuesClp: remanenteActualClp,
    }
  }

  const valorRecompensaClp =
    (monto * regla.tasa_acumulacion_bp) / 10_000
  const remanenteAntesClp = regla.conservar_remanente
    ? remanenteActualClp
    : 0
  const valorTotalClp = valorRecompensaClp + remanenteAntesClp
  const regis = Math.floor(valorTotalClp / regla.valor_regis_clp)
  const remanenteDespuesClp = regla.conservar_remanente
    ? valorTotalClp - regis * regla.valor_regis_clp
    : 0

  return {
    montoValido: true,
    cumpleMinimo: true,
    regis,
    valorRecompensaClp,
    remanenteDespuesClp,
  }
}
