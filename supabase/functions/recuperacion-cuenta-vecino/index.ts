// ============================================================================
// recuperacion-cuenta-vecino
//
// Recuperación de cuenta mediante Código de Comercio.
//
// Acción validar_codigo:
//   RUT + código de 6 dígitos -> token temporal de recuperación.
//
// Acción cambiar_contrasena:
//   token temporal + nueva contraseña -> cambio administrativo en Supabase Auth
//   -> finalización de la recuperación.
//
// Nunca se almacenan ni registran en logs el RUT, código, token o contraseña.
// ============================================================================

import {
  clienteServicio,
  rpcObligatoria,
} from '../_shared/clientes.ts'

import {
  DIAGNOSTICO_IP,
  filtrarMetodo,
  ipCliente,
  leerJson,
  responder,
  texto,
} from '../_shared/http.ts'

import {
  claveIntentos,
  hashCodigoComercio,
  hashTokenRecuperacion,
  tokenRecuperacionNuevo,
} from '../_shared/seguridad.ts'

const UUID_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CODIGO_VALIDO = /^\d{6}$/
const TOKEN_VALIDO = /^[0-9a-f]{64}$/

const VENTANA_ANTIABUSO = '15 minutes'
const BLOQUEO_ANTIABUSO = '15 minutes'

const LIMITES = {
  solicitudesCodigoIp: 30,
  codigoRutIp: 10,
  solicitudesCambioIp: 30,
  cambioRecuperacionIp: 10,
}

type ValidacionCodigo = {
  intentos_restantes: number
  motivo: string
  recuperacion_id: string
  resultado: string
  valido: boolean
  vecino_id: string
}

type PreparacionCambio = {
  motivo: string
  vecino_id: string
}

function primeraFila<T>(valor: unknown): T | null {
  return Array.isArray(valor) && valor.length > 0
    ? (valor[0] as T)
    : null
}

Deno.serve(async (solicitud) => {
  const rechazo = filtrarMetodo(solicitud)
  if (rechazo) return rechazo

  const { ip, fuente } = ipCliente(solicitud)

  const extras: Record<string, string> = DIAGNOSTICO_IP
    ? { 'x-regalones-fuente-ip': fuente }
    : {}

  const responderCon = (
    estado: number,
    cuerpo: Record<string, unknown>,
  ) => responder(solicitud, estado, cuerpo, extras)

  const cuerpo = await leerJson(solicitud)

  if (!cuerpo) {
    return responderCon(400, {
      codigo: 'CUERPO_INVALIDO',
    })
  }

  const accion =
    typeof cuerpo.accion === 'string'
      ? cuerpo.accion
      : ''

  const servicio = clienteServicio()

  try {
    // ------------------------------------------------------------------------
    // Helpers antiabuso
    // ------------------------------------------------------------------------

    const revisarBloqueo = async (
      clave: string,
    ): Promise<string | null> =>
      await rpcObligatoria<string | null>(
        servicio,
        'intento_bloqueado',
        {
          p_clave: clave,
        },
      )

    const registrarIntento = async (
      clave: string,
      maximo: number,
    ): Promise<string | null> =>
      await rpcObligatoria<string | null>(
        servicio,
        'registrar_intento_fallido',
        {
          p_clave: clave,
          p_maximo: maximo,
          p_ventana: VENTANA_ANTIABUSO,
          p_bloqueo: BLOQUEO_ANTIABUSO,
        },
      )

    const limpiarIntentos = async (
      clave: string,
    ): Promise<void> => {
      const { error } = await servicio.rpc(
        'limpiar_intentos',
        {
          p_clave: clave,
        },
      )

      if (error) {
        console.error(
          'recuperacion-cuenta-vecino',
          `limpiar_intentos: ${error.code ?? 'error'}`,
        )
      }
    }

    const limitarSolicitudesIp = async (
      prefijo: string,
      maximo: number,
    ): Promise<Response | null> => {
      if (!ip) return null

      const clave = await claveIntentos(
        prefijo,
        ip,
      )

      const bloqueadoHasta =
        await revisarBloqueo(clave)

      if (bloqueadoHasta) {
        return responderCon(429, {
          codigo: 'DEMASIADOS_INTENTOS',
          hasta: bloqueadoHasta,
        })
      }

      const nuevoBloqueo =
        await registrarIntento(
          clave,
          maximo,
        )

      if (nuevoBloqueo) {
        return responderCon(429, {
          codigo: 'DEMASIADOS_INTENTOS',
          hasta: nuevoBloqueo,
        })
      }

      return null
    }

    // ------------------------------------------------------------------------
    // 1. VALIDAR CÓDIGO DE COMERCIO
    // ------------------------------------------------------------------------

    if (accion === 'validar_codigo') {
      // Este límite cuenta solicitudes incluso si el cuerpo termina siendo
      // inválido. Evita bombardear el endpoint variando RUT y códigos.
      const limiteIp = await limitarSolicitudesIp(
        'recuperacion-codigo-ip',
        LIMITES.solicitudesCodigoIp,
      )

      if (limiteIp) return limiteIp

      const rut = texto(cuerpo.rut, 20)
      const codigo = texto(cuerpo.codigo, 6)

      if (
        !rut ||
        !codigo ||
        !CODIGO_VALIDO.test(codigo)
      ) {
        return responderCon(400, {
          codigo: 'DATOS_INVALIDOS',
        })
      }

      let claveRutIp: string | null = null

      if (ip) {
        const rutCanonico =
          await rpcObligatoria<string | null>(
            servicio,
            'normalizar_rut',
            {
              p_rut: rut,
            },
          )

        claveRutIp = await claveIntentos(
          'recuperacion-codigo-rut-ip',
          `${rutCanonico ?? rut}|${ip}`,
        )

        const bloqueadoHasta =
          await revisarBloqueo(claveRutIp)

        if (bloqueadoHasta) {
          return responderCon(429, {
            codigo: 'DEMASIADOS_INTENTOS',
            hasta: bloqueadoHasta,
          })
        }
      }

      const tokenRecuperacion =
        tokenRecuperacionNuevo()

      const [codigoHash, tokenHash] =
        await Promise.all([
          hashCodigoComercio(codigo),
          hashTokenRecuperacion(
            tokenRecuperacion,
          ),
        ])

      const { data, error } =
        await servicio.rpc(
          'validar_codigo_comercio_recuperacion',
          {
            p_rut: rut,
            p_codigo_hash: codigoHash,
            p_token_recuperacion_hash:
              tokenHash,
          },
        )

      if (error) {
        console.error(
          'recuperacion-cuenta-vecino',
          `validar_codigo: ${error.code ?? 'error'}`,
        )

        return responderCon(503, {
          codigo: 'SERVICIO_NO_DISPONIBLE',
        })
      }

      const resultado =
        primeraFila<ValidacionCodigo>(data)

      // Respuesta deliberadamente genérica:
      // no revela si el RUT existe, si había
      // una recuperación activa ni qué parte
      // fue incorrecta.
      if (!resultado?.valido) {
        if (claveRutIp) {
          const bloqueadoHasta =
            await registrarIntento(
              claveRutIp,
              LIMITES.codigoRutIp,
            )

          if (bloqueadoHasta) {
            return responderCon(429, {
              codigo:
                'DEMASIADOS_INTENTOS',
              hasta: bloqueadoHasta,
            })
          }
        }

        return responderCon(401, {
          codigo: 'CODIGO_INVALIDO',
        })
      }

      // Un código correcto limpia solo el
      // contador RUT+IP. El contador general
      // de volumen por IP se conserva.
      if (claveRutIp) {
        await limpiarIntentos(claveRutIp)
      }

      return responderCon(200, {
        codigo: 'CODIGO_VALIDO',
        recuperacion_id:
          resultado.recuperacion_id,
        token_recuperacion:
          tokenRecuperacion,
        motivo: resultado.motivo,
      })
    }

    // ------------------------------------------------------------------------
    // 2. CAMBIAR CONTRASEÑA
    // ------------------------------------------------------------------------

    if (accion === 'cambiar_contrasena') {
      const limiteIp = await limitarSolicitudesIp(
        'recuperacion-cambio-ip',
        LIMITES.solicitudesCambioIp,
      )

      if (limiteIp) return limiteIp

      const recuperacionId = texto(
        cuerpo.recuperacion_id,
        36,
      )

      const tokenRecuperacion = texto(
        cuerpo.token_recuperacion,
        64,
      )

      const contrasena =
        typeof cuerpo.contrasena === 'string'
          ? cuerpo.contrasena
          : ''

      if (
        !recuperacionId ||
        !UUID_VALIDO.test(recuperacionId) ||
        !tokenRecuperacion ||
        !TOKEN_VALIDO.test(
          tokenRecuperacion,
        ) ||
        contrasena.length < 8 ||
        new TextEncoder()
            .encode(contrasena)
            .length > 72
      ) {
        return responderCon(400, {
          codigo: 'DATOS_INVALIDOS',
        })
      }

      let claveRecuperacionIp:
        | string
        | null = null

      if (ip) {
        claveRecuperacionIp =
          await claveIntentos(
            'recuperacion-cambio-id-ip',
            `${recuperacionId}|${ip}`,
          )

        const bloqueadoHasta =
          await revisarBloqueo(
            claveRecuperacionIp,
          )

        if (bloqueadoHasta) {
          return responderCon(429, {
            codigo: 'DEMASIADOS_INTENTOS',
            hasta: bloqueadoHasta,
          })
        }
      }

      const tokenHash =
        await hashTokenRecuperacion(
          tokenRecuperacion,
        )

      // Reserva el token antes de modificar
      // Supabase Auth.
      const preparacion =
        await servicio.rpc(
          'preparar_cambio_contrasena_recuperacion',
          {
            p_recuperacion_id:
              recuperacionId,
            p_token_recuperacion_hash:
              tokenHash,
          },
        )

      if (preparacion.error) {
        // Token inválido, vencido, ya ocupado
        // o recuperación inexistente.
        if (
          preparacion.error.code === '42501'
        ) {
          if (claveRecuperacionIp) {
            const bloqueadoHasta =
              await registrarIntento(
                claveRecuperacionIp,
                LIMITES
                  .cambioRecuperacionIp,
              )

            if (bloqueadoHasta) {
              return responderCon(429, {
                codigo:
                  'DEMASIADOS_INTENTOS',
                hasta:
                  bloqueadoHasta,
              })
            }
          }

          return responderCon(401, {
            codigo:
              'RECUPERACION_INVALIDA',
          })
        }

        console.error(
          'recuperacion-cuenta-vecino',
          `preparar: ${preparacion.error.code ?? 'error'}`,
        )

        return responderCon(503, {
          codigo: 'SERVICIO_NO_DISPONIBLE',
        })
      }

      const preparada =
        primeraFila<PreparacionCambio>(
          preparacion.data,
        )

      if (!preparada?.vecino_id) {
        console.error(
          'recuperacion-cuenta-vecino',
          'preparar: respuesta vacia',
        )

        return responderCon(503, {
          codigo: 'SERVICIO_NO_DISPONIBLE',
        })
      }

      // El token ya fue demostrado válido:
      // este contador específico puede
      // limpiarse.
      if (claveRecuperacionIp) {
        await limpiarIntentos(
          claveRecuperacionIp,
        )
      }

      const { error: errorAuth } =
        await servicio.auth.admin
          .updateUserById(
            preparada.vecino_id,
            {
              password: contrasena,
            },
          )

      if (errorAuth) {
        // Auth no alcanzó a cambiar la
        // contraseña. Liberamos la reserva
        // para permitir un nuevo intento.
        const liberacion =
          await servicio.rpc(
            'liberar_cambio_contrasena_recuperacion',
            {
              p_recuperacion_id:
                recuperacionId,
              p_token_recuperacion_hash:
                tokenHash,
            },
          )

        if (liberacion.error) {
          console.error(
            'recuperacion-cuenta-vecino',
            `liberar: ${liberacion.error.code ?? 'error'}`,
          )
        }

        console.error(
          'recuperacion-cuenta-vecino',
          `auth: ${errorAuth.code ?? 'error'}`,
        )

        return responderCon(503, {
          codigo: 'SERVICIO_NO_DISPONIBLE',
        })
      }

      // Auth ya cambió la contraseña.
      // Desde este punto NO liberamos el token.
      const finalizacion =
        await servicio.rpc(
          'completar_recuperacion_cuenta',
          {
            p_recuperacion_id:
              recuperacionId,
            p_token_recuperacion_hash:
              tokenHash,
          },
        )

      if (finalizacion.error) {
        console.error(
          'recuperacion-cuenta-vecino',
          `completar: ${finalizacion.error.code ?? 'error'}`,
        )

        return responderCon(503, {
          codigo: 'FINALIZACION_PENDIENTE',
          reintentar_en_segundos: 60,
        })
      }

      return responderCon(200, {
        codigo:
          'RECUPERACION_COMPLETADA',
        motivo:
          finalizacion.data ??
          preparada.motivo,
      })
    }

    return responderCon(400, {
      codigo: 'DATOS_INVALIDOS',
    })
  } catch (error) {
    // Nunca incluir valores provenientes
    // de la solicitud en logs.
    console.error(
      'recuperacion-cuenta-vecino',
      error instanceof Error
        ? error.name
        : 'error',
    )

    // También falla cerrado si el sistema
    // antiabuso no puede comprobarse.
    return responderCon(503, {
      codigo: 'SERVICIO_NO_DISPONIBLE',
    })
  }
})
