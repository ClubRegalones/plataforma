// ============================================================================
// recuperacion-cuenta-negocio
//
// Operaciones de recuperación que ocurren presencialmente en App Negocio.
//
// Acción "buscar":
//   - valida terminal + turno + cajero
//   - busca la cuenta por RUT
//   - devuelve solamente nombre y RUT enmascarado
//
// Acción "emitir":
//   - exige confirmación de revisión presencial de la cédula
//   - genera Código de Comercio de 6 dígitos
//   - guarda únicamente su HMAC
//   - el código en claro se devuelve una sola vez a la App Negocio
//
// Nunca registrar RUT, código, token de terminal ni cuerpo de la solicitud.
// ============================================================================

import { clienteServicio } from '../_shared/clientes.ts'
import {
  filtrarMetodo,
  leerJson,
  responder,
  texto,
} from '../_shared/http.ts'
import {
  codigoComercioNuevo,
  hashCodigoComercio,
} from '../_shared/seguridad.ts'

const ACCIONES = new Set([
  'buscar',
  'emitir',
])

const MOTIVOS = new Set([
  'olvido_sin_contacto',
  'activacion_digital',
  'traspaso_identidad',
])

const UUID_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuid(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  return UUID_VALIDO.test(limpio) ? limpio : null
}

function mensajeError(error: { message?: string | null }): string {
  return error.message?.trim() ?? ''
}

Deno.serve(async (solicitud) => {
  const rechazo = filtrarMetodo(solicitud)
  if (rechazo) return rechazo

  const cuerpo = await leerJson(solicitud)

  if (!cuerpo) {
    return responder(solicitud, 400, {
      codigo: 'CUERPO_INVALIDO',
    })
  }

  const accion =
    typeof cuerpo.accion === 'string' && ACCIONES.has(cuerpo.accion)
      ? cuerpo.accion
      : null

  const rut = texto(cuerpo.rut, 20)
  const turnoId = uuid(cuerpo.turno_id)
  const terminalId = uuid(cuerpo.terminal_id)
  const tokenTerminal = texto(cuerpo.token_terminal, 500)

  if (
    !accion ||
    !rut ||
    !turnoId ||
    !terminalId ||
    !tokenTerminal
  ) {
    return responder(solicitud, 400, {
      codigo: 'DATOS_INVALIDOS',
    })
  }

  const servicio = clienteServicio()

  try {
    // ------------------------------------------------------------------------
    // BUSCAR VECINO
    // ------------------------------------------------------------------------

    if (accion === 'buscar') {
      const { data, error } = await servicio.rpc(
        'obtener_vecino_recuperacion_por_rut',
        {
          p_rut: rut,
          p_turno_id: turnoId,
          p_terminal_id: terminalId,
          p_token_terminal: tokenTerminal,
        },
      )

      if (error) {
        const mensaje = mensajeError(error)

        if (mensaje.includes('RUT_INVALIDO')) {
          return responder(solicitud, 400, {
            codigo: 'RUT_INVALIDO',
          })
        }

        console.error(
          'recuperacion-cuenta-negocio',
          `buscar: ${error.code ?? 'error'}`,
        )

        return responder(solicitud, 403, {
          codigo: 'CONTEXTO_OPERATIVO_INVALIDO',
        })
      }

      const fila = Array.isArray(data) ? data[0] : null

      if (!fila) {
        return responder(solicitud, 404, {
          codigo: 'VECINO_NO_ENCONTRADO',
        })
      }

      return responder(solicitud, 200, {
        codigo: 'VECINO_ENCONTRADO',

        vecino: {
          nombre: fila.nombre_vecino,
          rut_enmascarado: fila.rut_enmascarado,
        },
      })
    }


    // ------------------------------------------------------------------------
    // EMITIR CÓDIGO DE COMERCIO
    // ------------------------------------------------------------------------

    const motivo =
      typeof cuerpo.motivo === 'string' && MOTIVOS.has(cuerpo.motivo)
        ? cuerpo.motivo
        : null

    const identidadVerificada =
      cuerpo.identidad_verificada === true

    if (!motivo) {
      return responder(solicitud, 400, {
        codigo: 'MOTIVO_INVALIDO',
      })
    }

    if (!identidadVerificada) {
      return responder(solicitud, 400, {
        codigo: 'IDENTIDAD_NO_VERIFICADA',
      })
    }

    const codigoComercio = codigoComercioNuevo()
    const codigoHash = await hashCodigoComercio(codigoComercio)

    const { data, error } = await servicio.rpc(
      'crear_recuperacion_codigo_comercio',
      {
        p_rut: rut,
        p_motivo: motivo,
        p_codigo_hash: codigoHash,
        p_turno_id: turnoId,
        p_terminal_id: terminalId,
        p_token_terminal: tokenTerminal,
        p_identidad_verificada: true,
      },
    )

    if (error) {
      const mensaje = mensajeError(error)

      if (mensaje.includes('RUT_INVALIDO')) {
        return responder(solicitud, 400, {
          codigo: 'RUT_INVALIDO',
        })
      }

      if (mensaje.includes('IDENTIDAD_NO_VERIFICADA')) {
        return responder(solicitud, 400, {
          codigo: 'IDENTIDAD_NO_VERIFICADA',
        })
      }

      if (mensaje.includes('VECINO_NO_ENCONTRADO')) {
        return responder(solicitud, 404, {
          codigo: 'VECINO_NO_ENCONTRADO',
        })
      }

      if (mensaje.includes('RECUPERACION_EN_PROCESO')) {
        return responder(solicitud, 409, {
          codigo: 'RECUPERACION_EN_PROCESO',
        })
      }

      console.error(
        'recuperacion-cuenta-negocio',
        `emitir: ${error.code ?? 'error'}`,
      )

      return responder(solicitud, 403, {
        codigo: 'CONTEXTO_OPERATIVO_INVALIDO',
      })
    }

    const fila = Array.isArray(data) ? data[0] : null

    if (!fila) {
      throw new Error('crear_recuperacion_codigo_comercio sin resultado')
    }

    return responder(solicitud, 201, {
      codigo: 'CODIGO_COMERCIO_EMITIDO',

      codigo_comercio: codigoComercio,

      expira_en: fila.expira_en,

      vecino: {
        nombre: fila.nombre_vecino,
        rut_enmascarado: fila.rut_enmascarado,
      },
    })
  } catch (error) {
    console.error(
      'recuperacion-cuenta-negocio',
      error instanceof Error ? error.name : 'error',
    )

    return responder(solicitud, 500, {
      codigo: 'ERROR_INTERNO',
    })
  }
})
