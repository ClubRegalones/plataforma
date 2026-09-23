import type { Database } from '@club-regalones/domain'
import type { ConfiguracionDispositivoNegocio } from './dispositivo'
import { supabase } from './supabase'

export type CanjeQrIdentificado =
  Database['public']['Functions']['terminal_consultar_canje_qr']['Returns'][number]

export type LlaveroQrIdentificado =
  Database['public']['Functions']['terminal_identificar_llavero_qr']['Returns'][number]

export type LlaveroNfcConsultado =
  Database['public']['Functions']['terminal_consultar_llavero']['Returns'][number]

export type SaldoLlaveroNfc =
  Database['public']['Functions']['terminal_consultar_saldo_llavero']['Returns'][number]

export type ResultadoLecturaQrNegocio =
  | {
      tipo: 'canje'
      tokenQr: string
      canje: CanjeQrIdentificado
    }
  | {
      tipo: 'llavero'
      llavero: LlaveroQrIdentificado
    }

export type ResultadoLecturaNfcNegocio = {
  tipo: 'llavero'
  llaveroId: string
  tokenNfc: string
  codigoPublico: string
  nombreVecino: string
  tienePin: boolean
  disponibles: number
  reservados: number
  pendientes: number
  canjeados: number
}

function credencial(
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
) {
  return {
    p_turno_id: turnoId,
    p_terminal_id: configuracion.terminalId,
    p_token_terminal: configuracion.tokenTerminal,
  }
}

function extraerCodigoPublicoLlavero(valor: string) {
  const limpio = valor.trim()

  const patrones = [
    /^https?:\/\/(?:www\.)?clubregalones\.cl\/llavero\/([^/?#]+)\/?$/i,
    /^regalones:\/\/llavero\/([^/?#]+)\/?$/i,
    /^llavero:([^/?#]+)$/i,
  ]

  for (const patron of patrones) {
    const coincidencia = patron.exec(limpio)

    if (coincidencia?.[1]) {
      return decodeURIComponent(coincidencia[1])
    }
  }

  return limpio
}

export function extraerTokenNfc(valor: string) {
  const limpio = valor.trim()

  const patrones = [
    /^https?:\/\/(?:www\.)?clubregalones\.cl\/nfc\/([^/?#]+)\/?$/i,
    /^regalones:\/\/nfc\/([^/?#]+)\/?$/i,
    /^nfc:([^/?#]+)$/i,
  ]

  for (const patron of patrones) {
    const coincidencia = patron.exec(limpio)

    if (coincidencia?.[1]) {
      return decodeURIComponent(coincidencia[1])
    }
  }

  return limpio
}

export async function resolverQrNegocio(
  codigoEscaneado: string,
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
): Promise<ResultadoLecturaQrNegocio> {
  const codigo = codigoEscaneado.trim()

  if (!codigo) {
    throw new Error('El QR está vacío.')
  }

  /*
   * 1. Primero verificamos si es un QR temporal de canje.
   *    Supabase valida el token real del canje.
   */
  const {
    data: canjes,
    error: errorCanje,
  } = await supabase.rpc(
    'terminal_consultar_canje_qr',
    {
      p_qr_token: codigo,
      ...credencial(configuracion, turnoId),
    },
  )

  if (!errorCanje) {
    const canje = canjes?.[0]

    if (canje) {
      return {
        tipo: 'canje',
        tokenQr: codigo,
        canje,
      }
    }
  } else if (errorCanje.code !== 'P0002') {
    throw errorCanje
  }

  /*
   * 2. Si no era un canje temporal, intentamos interpretarlo
   *    como el QR físico de un llavero.
   *
   *    IMPORTANTE:
   *    este QR solamente identifica al vecino.
   *    No autoriza gasto de REGIS.
   */
  const codigoPublico =
    extraerCodigoPublicoLlavero(codigo)

  const {
    data: llaveros,
    error: errorLlavero,
  } = await supabase.rpc(
    'terminal_identificar_llavero_qr',
    {
      p_codigo_publico: codigoPublico,
      ...credencial(configuracion, turnoId),
    },
  )

  if (errorLlavero) {
    throw errorLlavero
  }

  const llavero = llaveros?.[0]

  if (!llavero) {
    throw new Error(
      'No encontramos un QR válido de Club Regalones.',
    )
  }

  return {
    tipo: 'llavero',
    llavero,
  }
}

export async function resolverNfcNegocio(
  contenidoNfc: string,
  configuracion: ConfiguracionDispositivoNegocio,
  turnoId: string,
): Promise<ResultadoLecturaNfcNegocio> {
  const tokenNfc = extraerTokenNfc(contenidoNfc)

  if (tokenNfc.length < 8) {
    throw new Error(
      'No encontramos un identificador NFC válido.',
    )
  }

  const {
    data: llaveros,
    error: errorLlavero,
  } = await supabase.rpc(
    'terminal_consultar_llavero',
    {
      p_token: tokenNfc,
      ...credencial(configuracion, turnoId),
    },
  )

  if (errorLlavero) throw errorLlavero

  const llavero = llaveros?.[0]

  if (!llavero || llavero.estado !== 'activo') {
    throw new Error(
      'No encontramos un llavero activo.',
    )
  }

  const {
    data: saldos,
    error: errorSaldo,
  } = await supabase.rpc(
    'terminal_consultar_saldo_llavero',
    {
      p_token: tokenNfc,
      ...credencial(configuracion, turnoId),
    },
  )

  if (errorSaldo) throw errorSaldo

  const saldo = saldos?.[0]

  const {
    data: llaverosIdentificados,
    error: errorIdentificacion,
  } = await supabase.rpc(
    'terminal_identificar_llavero_qr',
    {
      p_codigo_publico: llavero.codigo_publico,
      ...credencial(configuracion, turnoId),
    },
  )

  if (errorIdentificacion) {
    throw errorIdentificacion
  }

  const llaveroIdentificado =
    llaverosIdentificados?.[0]

  if (!llaveroIdentificado) {
    throw new Error(
      'No pudimos completar la identificación del llavero.',
    )
  }

  return {
    tipo: 'llavero',
    llaveroId: llaveroIdentificado.llavero_id,
    tokenNfc,
    codigoPublico: llavero.codigo_publico,
    nombreVecino:
      llavero.nombre_vecino?.trim() || 'Vecino',
    tienePin: llavero.tiene_pin,
    disponibles: saldo?.disponibles ?? 0,
    reservados: saldo?.reservados ?? 0,
    pendientes: saldo?.pendientes ?? 0,
    canjeados: saldo?.canjeados ?? 0,
  }
}
