// ============================================================================
// acceso-vecino
//
// Login visible RUT + contraseña. Función pública (verify_jwt = false): se
// usa antes de tener sesión. La protección son los límites de intentos, no
// la apikey (que es pública por naturaleza).
//
// Límites (ventana 15 min, bloqueo 15 min, claves HMAC sin RUT ni IP en claro):
//   RUT + IP   ->  5 fallos   frena a un atacante contra un RUT desde una IP
//   IP         -> 30 fallos   frena pruebas masivas de muchos RUT
//   RUT global -> 20 fallos   frena ataques distribuidos contra un RUT sin
//                             que cualquiera pueda bloquear al dueño con 5 intentos
// Si no hay IP confiable, solo aplica el límite global por RUT.
//
// Si cualquier control antiabuso falla, responde 503: nunca autentica sin
// protección.
//
// Flujo: RUT -> perfiles.id (RPC service_role, exige es_rut_valido)
//        -> auth.admin.getUserById -> correo técnico (dentro de la función)
//        -> signInWithPassword con secret key + Sb-Forwarded-For.
// RUT inexistente, RUT mal escrito y contraseña incorrecta responden igual.
// ============================================================================

import {
  clienteServicio,
  ErrorProteccion,
  iniciarSesionTecnica,
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
import { claveIntentos } from '../_shared/seguridad.ts'

const VENTANA = '15 minutes'
const BLOQUEO = '15 minutes'
const LIMITES = { rutIp: 5, ip: 30, rut: 20 }

Deno.serve(async (solicitud) => {
  const rechazo = filtrarMetodo(solicitud)
  if (rechazo) return rechazo

  const { ip, fuente } = ipCliente(solicitud)
  const extras: Record<string, string> = DIAGNOSTICO_IP ? { 'x-regalones-fuente-ip': fuente } : {}
  const responderCon = (estado: number, cuerpo: Record<string, unknown>) =>
    responder(solicitud, estado, cuerpo, extras)

  const cuerpo = await leerJson(solicitud)
  const rut = cuerpo ? texto(cuerpo.rut, 20) : null
  const contrasena = cuerpo && typeof cuerpo.contrasena === 'string' ? cuerpo.contrasena : ''

  if (!rut || contrasena.length === 0 || contrasena.length > 200) {
    return responderCon(400, { codigo: 'DATOS_INCOMPLETOS' })
  }

  const servicio = clienteServicio()

  try {
    const rutCanonico = await rpcObligatoria<string | null>(servicio, 'normalizar_rut', {
      p_rut: rut,
    })
    const rutClave = rutCanonico ?? rut

    const claves: { tipo: 'rut' | 'rut-ip' | 'ip'; clave: string; maximo: number }[] = [
      { tipo: 'rut', clave: await claveIntentos('acceso-rut', rutClave), maximo: LIMITES.rut },
    ]
    if (ip) {
      claves.push(
        {
          tipo: 'rut-ip',
          clave: await claveIntentos('acceso-rut-ip', `${rutClave}|${ip}`),
          maximo: LIMITES.rutIp,
        },
        { tipo: 'ip', clave: await claveIntentos('acceso-ip', ip), maximo: LIMITES.ip },
      )
    }

    for (const { clave } of claves) {
      const hasta = await rpcObligatoria<string | null>(servicio, 'intento_bloqueado', {
        p_clave: clave,
      })
      if (hasta) return responderCon(429, { codigo: 'DEMASIADOS_INTENTOS', hasta })
    }

    const rechazarCredenciales = async () => {
      let hastaMayor: string | null = null
      for (const { clave, maximo } of claves) {
        const hasta = await rpcObligatoria<string | null>(servicio, 'registrar_intento_fallido', {
          p_clave: clave,
          p_maximo: maximo,
          p_ventana: VENTANA,
          p_bloqueo: BLOQUEO,
        })
        if (hasta && (!hastaMayor || hasta > hastaMayor)) hastaMayor = hasta
      }
      if (hastaMayor) return responderCon(429, { codigo: 'DEMASIADOS_INTENTOS', hasta: hastaMayor })
      return responderCon(401, {
        codigo: 'CREDENCIALES_INVALIDAS',
        mensaje: 'RUT o contraseña incorrectos.',
      })
    }

    const usuarioId = await rpcObligatoria<string | null>(
      servicio,
      'obtener_usuario_id_acceso_por_rut',
      { p_rut: rut },
    )
    if (!usuarioId) return await rechazarCredenciales()

    const { data: usuario, error: errorUsuario } = await servicio.auth.admin.getUserById(usuarioId)
    if (errorUsuario || !usuario.user?.email) {
      throw new Error(`getUserById: ${errorUsuario?.code ?? 'sin_correo'}`)
    }

    const resultado = await iniciarSesionTecnica(usuario.user.email, contrasena, ip)
    if (resultado.tipo === 'limite_auth') {
      // Límite de Supabase Auth: no es culpa del vecino ni cuenta como fallo.
      return responderCon(503, { codigo: 'SERVICIO_NO_DISPONIBLE' })
    }
    if (resultado.tipo === 'credenciales') return await rechazarCredenciales()

    // Solo se limpia RUT+IP: un acceso exitoso no borra el rastro de ataques
    // desde otras IP contra el mismo RUT. Si la limpieza falla, el vecino ya
    // se autenticó: se registra y se responde igual.
    const claveRutIp = claves.find(({ tipo }) => tipo === 'rut-ip')
    if (claveRutIp) {
      const { error: errorLimpiar } = await servicio.rpc('limpiar_intentos', {
        p_clave: claveRutIp.clave,
      })
      if (errorLimpiar) console.error('acceso-vecino', `limpiar_intentos: ${errorLimpiar.code}`)
    }

    return responderCon(200, { codigo: 'ACCESO_CONCEDIDO', sesion: resultado.sesion })
  } catch (error) {
    if (error instanceof ErrorProteccion) {
      console.error('acceso-vecino', error.message)
      return responderCon(503, { codigo: 'SERVICIO_NO_DISPONIBLE' })
    }
    console.error('acceso-vecino', error instanceof Error ? error.message : 'error desconocido')
    return responderCon(500, { codigo: 'ERROR_INTERNO' })
  }
})
