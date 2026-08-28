import type { Database, Tables } from '@club-regalones/domain'
import { supabase } from './supabase'
import type { CredencialTerminalLocal } from './terminalPwa'

export type BeneficioCanjeTerminal = Pick<
  Tables<'versiones_beneficio_regis'>,
  | 'id'
  | 'beneficio_id'
  | 'nombre'
  | 'descripcion'
  | 'tipo'
  | 'porcentaje_descuento_bp'
  | 'monto_descuento_fijo_clp'
  | 'costo_regis'
  | 'compra_minima_clp'
  | 'tope_descuento_clp'
  | 'porcentaje_maximo_canje_bp'
  | 'cupos_totales'
  | 'vigencia_hasta'
>

export type CanjeQrConsultado =
  Database['public']['Functions']['consultar_canje_regis_qr']['Returns'][number]

export type ReservaCanjeLlavero =
  Database['public']['Functions']['reservar_canje_regis_llavero']['Returns'][number]

export type ResultadoCanje =
  Database['public']['Functions']['confirmar_compra_con_canje']['Returns'][number]

export type HistorialCanjeNegocio =
  Database['public']['Functions']['listar_historial_canjes_negocio']['Returns'][number]

export async function listarBeneficiosCanjeTerminal(negocioId: string) {
  const { data: beneficios, error: errorBeneficios } = await supabase
    .from('beneficios_regis')
    .select('id')
    .eq('negocio_id', negocioId)

  if (errorBeneficios) throw errorBeneficios

  const beneficiosIds = beneficios.map(({ id }) => id)
  if (beneficiosIds.length === 0) return [] as BeneficioCanjeTerminal[]

  const ahora = new Date().toISOString()
  const { data, error } = await supabase
    .from('versiones_beneficio_regis')
    .select(
      'id, beneficio_id, nombre, descripcion, tipo, porcentaje_descuento_bp, monto_descuento_fijo_clp, costo_regis, compra_minima_clp, tope_descuento_clp, porcentaje_maximo_canje_bp, cupos_totales, vigencia_hasta',
    )
    .in('beneficio_id', beneficiosIds)
    .eq('estado', 'activo')
    .lte('vigencia_desde', ahora)
    .or(`vigencia_hasta.is.null,vigencia_hasta.gt.${ahora}`)
    .order('costo_regis')

  if (error) throw error

  return data as BeneficioCanjeTerminal[]
}

export async function consultarCanjeRegisQr(
  tokenQr: string,
  cajaId: string,
) {
  const { data, error } = await supabase.rpc('consultar_canje_regis_qr', {
    p_qr_token: tokenQr,
    p_caja_id: cajaId,
  })

  if (error) throw error

  return data[0] ?? null
}

export async function reservarCanjeRegisLlavero(
  tokenLlavero: string,
  cajaId: string,
  beneficioVersionId: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc(
    'reservar_canje_regis_llavero',
    {
      p_token_llavero: tokenLlavero,
      p_caja_id: cajaId,
      p_beneficio_version_id: beneficioVersionId,
      p_idempotency_key: idempotencyKey,
    },
  )

  if (error) throw error

  return data[0] ?? null
}

export async function reservarCanjeRegisDesdeLectura(
  lecturaId: string,
  credencial: CredencialTerminalLocal,
  beneficioVersionId: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc(
    'reservar_canje_regis_desde_lectura',
    {
      p_lectura_id: lecturaId,
      p_terminal_id: credencial.terminalId,
      p_token_terminal: credencial.tokenTerminal,
      p_beneficio_version_id: beneficioVersionId,
      p_idempotency_key: idempotencyKey,
    },
  )

  if (error) throw error
  return data[0] ?? null
}

export async function confirmarCompraConCanje(
  canjeId: string,
  cajaId: string,
  montoBrutoClp: number,
  folioBoleta: string,
  tokenQr?: string,
) {
  const { data, error } = await supabase.rpc('confirmar_compra_con_canje', {
    p_canje_id: canjeId,
    p_caja_id: cajaId,
    p_monto_bruto_clp: montoBrutoClp,
    p_folio_boleta: folioBoleta.trim() || undefined,
    p_qr_token: tokenQr?.trim() || undefined,
  })

  if (error) throw error

  return data[0] ?? null
}

export async function cancelarCanjeRegis(canjeId: string) {
  const { data, error } = await supabase.rpc(
    'cancelar_reserva_canje_regis',
    { p_canje_id: canjeId },
  )

  if (error) throw error

  return data[0] ?? null
}

export async function listarHistorialCanjesNegocio(
  negocioId: string,
  limite = 100,
) {
  const { data, error } = await supabase.rpc(
    'listar_historial_canjes_negocio',
    {
      p_negocio_id: negocioId,
      p_limite: limite,
    },
  )

  if (error) throw error
  return data
}

export async function marcarCanjeNegocioLeido(canjeId: string) {
  const { data, error } = await supabase.rpc('marcar_canje_regis_leido', {
    p_canje_id: canjeId,
    p_destino: 'negocio',
  })

  if (error) throw error
  return data[0] ?? null
}
