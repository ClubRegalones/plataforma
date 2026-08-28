import type { Database, Tables } from '@club-regalones/domain'
import { supabase } from './supabase'

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

export async function obtenerReglaAcumulacionVigente(negocioId: string) {
  const { data, error } = await supabase
    .from('reglas_regis')
    .select(
      'id, negocio_id, version, tasa_acumulacion_bp, valor_regis_clp, monto_minimo_compra_clp, conservar_remanente, vigencia_desde, vigencia_hasta',
    )
    .eq('activa', true)
    .or(`negocio_id.is.null,negocio_id.eq.${negocioId}`)

  if (error) throw error

  const ahora = Date.now()
  const candidatas = (data as ReglaAcumulacionRegis[])
    .filter((regla) => {
      const desde = new Date(regla.vigencia_desde).getTime()
      const hasta = regla.vigencia_hasta
        ? new Date(regla.vigencia_hasta).getTime()
        : Number.POSITIVE_INFINITY

      return desde <= ahora && ahora < hasta
    })
    .sort((a, b) => {
      const alcanceA = a.negocio_id === negocioId ? 1 : 0
      const alcanceB = b.negocio_id === negocioId ? 1 : 0
      if (alcanceA !== alcanceB) return alcanceB - alcanceA

      const vigencia =
        new Date(b.vigencia_desde).getTime() -
        new Date(a.vigencia_desde).getTime()
      if (vigencia !== 0) return vigencia

      return b.version - a.version
    })

  return candidatas[0] ?? null
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
