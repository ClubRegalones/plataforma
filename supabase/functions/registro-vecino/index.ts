// ============================================================================
// registro-vecino
//
// Registro de vecinos con RUT + nombre + apellido + contraseña (App Vecino,
// Portal Vecino, web). Función pública (verify_jwt = false): se usa antes de
// tener sesión; la protección es el límite de intentos, no la apikey.
//   1. Valida datos y límite de registros por IP (si hay IP confiable).
//   2. Rechaza RUT inválido o ya registrado (nunca crea una segunda cuenta).
//   3. Crea el usuario de Auth con correo técnico aleatorio y permanente.
//   4. completar_registro_vecino() asigna RUT, contactos y consentimientos.
//   5. Si el paso 4 falla, borra el usuario recién creado (sin huérfanos).
//   6. Inicia sesión y devuelve los tokens.
//
// El RUT nunca va en metadatos de Auth ni en logs.
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
  textoOpcional,
} from '../_shared/http.ts'
import { claveIntentos, correoTecnicoNuevo } from '../_shared/seguridad.ts'

const CANALES = new Set(['web', 'app_vecino'])
const MAX_REGISTROS_POR_IP = 10
const ERRORES_DE_DATOS = new Set([
  'RUT_INVALIDO',
  'NOMBRE_INVALIDO',
  'APELLIDO_INVALIDO',
  'TERMINOS_REQUERIDOS',
  'CORREO_INVALIDO',
  'TELEFONO_INVALIDO',
  'CONSENTIMIENTO_MAL_FORMADO',
  'CONSENTIMIENTO_DESCONOCIDO',
  'VERSION_CONSENTIMIENTO_INVALIDA',
])

const MENSAJE_RUT_EXISTE =
  'Este RUT ya está en Club Regalones. Si es tuyo, inicia sesión o acércate a un Negocio Regalón con tu cédula para recuperar tu acceso.'

Deno.serve(async (solicitud) => {
  const rechazo = filtrarMetodo(solicitud)
  if (rechazo) return rechazo

  const { ip, fuente } = ipCliente(solicitud)
  const extras: Record<string, string> = DIAGNOSTICO_IP ? { 'x-regalones-fuente-ip': fuente } : {}
  const responderCon = (estado: number, cuerpoRespuesta: Record<string, unknown>) =>
    responder(solicitud, estado, cuerpoRespuesta, extras)

  const cuerpo = await leerJson(solicitud)
  if (!cuerpo) return responderCon(400, { codigo: 'CUERPO_INVALIDO' })

  const rut = texto(cuerpo.rut, 20)
  const nombre = texto(cuerpo.nombre, 100)
  const apellido = texto(cuerpo.apellido, 100)
  const correo = textoOpcional(cuerpo.correo, 254)
  const telefono = textoOpcional(cuerpo.telefono, 30)
  const contrasena = typeof cuerpo.contrasena === 'string' ? cuerpo.contrasena : ''
  const canal = typeof cuerpo.canal === 'string' && CANALES.has(cuerpo.canal) ? cuerpo.canal : 'web'
  // {tipo: {version, otorgado}} con la versión que el formulario mostró.
  // La validación completa la hace completar_registro_vecino().
  const consentimientos =
    cuerpo.consentimientos &&
    typeof cuerpo.consentimientos === 'object' &&
    !Array.isArray(cuerpo.consentimientos)
      ? cuerpo.consentimientos
      : {}

  if (!rut || !nombre || correo === undefined || telefono === undefined) {
    return responderCon(400, { codigo: 'DATOS_INCOMPLETOS' })
  }
  if (!apellido) return responderCon(400, { codigo: 'APELLIDO_INVALIDO' })
  // bcrypt usa como máximo 72 bytes.
  if (contrasena.length < 8 || new TextEncoder().encode(contrasena).length > 72) {
    return responderCon(400, { codigo: 'CONTRASENA_INVALIDA' })
  }

  const servicio = clienteServicio()

  try {
    // Límite de registros por IP: cuenta todos los intentos. Sin IP confiable
    // se omite (nunca se agrupa a todos en una clave común).
    if (ip) {
      const claveIp = await claveIntentos('registro-ip', ip)
      const bloqueadoHasta = await rpcObligatoria<string | null>(servicio, 'intento_bloqueado', {
        p_clave: claveIp,
      })
      if (bloqueadoHasta) {
        return responderCon(429, { codigo: 'DEMASIADOS_INTENTOS', hasta: bloqueadoHasta })
      }
      await rpcObligatoria(servicio, 'registrar_intento_fallido', {
        p_clave: claveIp,
        p_maximo: MAX_REGISTROS_POR_IP,
        p_ventana: '1 hour',
        p_bloqueo: '1 hour',
      })
    }

    const rutValido = await rpcObligatoria<boolean>(servicio, 'es_rut_valido', { p_rut: rut })
    if (!rutValido) return responderCon(400, { codigo: 'RUT_INVALIDO' })

    const rutExiste = await rpcObligatoria<boolean>(servicio, 'rut_registrado', { p_rut: rut })
    if (rutExiste) {
      return responderCon(409, { codigo: 'RUT_EXISTE', mensaje: MENSAJE_RUT_EXISTE })
    }

    const correoTecnico = correoTecnicoNuevo()
    const { data: creado, error: errorCrear } = await servicio.auth.admin.createUser({
      email: correoTecnico,
      password: contrasena,
      email_confirm: true,
      user_metadata: { nombre, apellido }, // Nunca el RUT: los metadatos viajan en el JWT.
    })
    if (errorCrear || !creado.user) throw new Error(`createUser: ${errorCrear?.code ?? 'sin_usuario'}`)

    const usuarioId = creado.user.id

    const { error: errorRegistro } = await servicio.rpc('completar_registro_vecino', {
      p_usuario_id: usuarioId,
      p_rut: rut,
      p_nombre: nombre,
      p_apellido: apellido,
      p_correo: correo,
      p_telefono: telefono,
      p_canal: canal,
      p_consentimientos: consentimientos,
    })

    if (errorRegistro) {
      // Compensación: no dejar un usuario de Auth sin identidad.
      const { error: errorBorrar } = await servicio.auth.admin.deleteUser(usuarioId)
      if (errorBorrar) {
        // Queda un usuario de Auth sin perfil con RUT: no puede acceder por
        // acceso-vecino. Se registra para limpiarlo desde Admin.
        console.error('registro-vecino', `compensacion deleteUser: ${errorBorrar.code ?? 'error'}`)
      }

      const codigo = errorRegistro.message
      if (codigo === 'RUT_DUPLICADO') {
        return responderCon(409, { codigo: 'RUT_EXISTE', mensaje: MENSAJE_RUT_EXISTE })
      }
      if (ERRORES_DE_DATOS.has(codigo)) {
        return responderCon(400, { codigo })
      }
      throw new Error(`completar_registro_vecino: ${errorRegistro.code}`)
    }

    // Si el inicio de sesión automático falla, la cuenta ya existe: el vecino
    // puede entrar después con acceso-vecino.
    let sesion = null
    try {
      const resultado = await iniciarSesionTecnica(correoTecnico, contrasena, ip)
      if (resultado.tipo === 'ok') sesion = resultado.sesion
    } catch (error) {
      console.error('registro-vecino', `sesion: ${error instanceof Error ? error.message : 'error'}`)
    }
    return responderCon(201, { codigo: 'REGISTRADO', sesion })
  } catch (error) {
    if (error instanceof ErrorProteccion) {
      console.error('registro-vecino', error.message)
      return responderCon(503, { codigo: 'SERVICIO_NO_DISPONIBLE' })
    }
    // Solo el tipo de error: nunca datos del vecino.
    console.error('registro-vecino', error instanceof Error ? error.message : 'error desconocido')
    return responderCon(500, { codigo: 'ERROR_INTERNO' })
  }
})
