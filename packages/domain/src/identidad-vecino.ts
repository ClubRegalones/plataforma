// Registro y acceso de vecinos con RUT + contraseña.
// Usado por App Vecino y Portal Vecino. Las apps nunca llaman a
// supabase.auth.signUp ni conocen el correo técnico.

export interface SesionVecino {
  access_token: string
  refresh_token: string
  expires_at: number | null
}

// Tipo estructural mínimo para no acoplar domain a @supabase/supabase-js.
export interface ClienteIdentidad {
  functions: {
    invoke: (
      nombre: string,
      opciones: { body: Record<string, unknown> },
    ) => Promise<{ data: unknown; error: unknown }>
  }
  auth: {
    setSession: (sesion: { access_token: string; refresh_token: string }) => Promise<{
      error: unknown
    }>
  }
}

export type TipoConsentimiento =
  | 'terminos_privacidad'
  | 'avisos_comerciales'
  | 'analisis_personalizado'

// Decisión del vecino sobre la versión EXACTA que el formulario le mostró.
// La versión se toma de la vista versiones_consentimiento_vigentes al cargar
// el formulario y se envía tal cual, aunque se publique otra mientras tanto.
export interface DecisionConsentimiento {
  version: string
  otorgado: boolean
}

export interface DatosRegistroVecino {
  rut: string
  nombre: string
  apellido: string
  contrasena: string
  correo?: string | null
  telefono?: string | null
  canal?: 'web' | 'app_vecino'
  consentimientos: { terminos_privacidad: DecisionConsentimiento } & Partial<
    Record<Exclude<TipoConsentimiento, 'terminos_privacidad'>, DecisionConsentimiento>
  >
}

export type CodigoIdentidad =
  | 'REGISTRADO'
  | 'ACCESO_CONCEDIDO'
  | 'RUT_INVALIDO'
  | 'RUT_EXISTE'
  | 'NOMBRE_INVALIDO'
  | 'APELLIDO_INVALIDO'
  | 'TERMINOS_REQUERIDOS'
  | 'CORREO_INVALIDO'
  | 'TELEFONO_INVALIDO'
  | 'CONSENTIMIENTO_MAL_FORMADO'
  | 'CONSENTIMIENTO_DESCONOCIDO'
  | 'VERSION_CONSENTIMIENTO_INVALIDA'
  | 'CONTRASENA_INVALIDA'
  | 'DATOS_INCOMPLETOS'
  | 'CREDENCIALES_INVALIDAS'
  | 'DEMASIADOS_INTENTOS'
  | 'SERVICIO_NO_DISPONIBLE'
  | 'ERROR_INTERNO'

export interface ResultadoIdentidad {
  ok: boolean
  codigo: CodigoIdentidad
  mensaje?: string
  hasta?: string
}

interface RespuestaFuncion {
  codigo?: CodigoIdentidad
  mensaje?: string
  hasta?: string
  sesion?: SesionVecino | null
}

async function leerRespuesta(resultado: {
  data: unknown
  error: unknown
}): Promise<RespuestaFuncion> {
  if (!resultado.error) return (resultado.data ?? {}) as RespuestaFuncion

  // FunctionsHttpError trae la respuesta original en `context`.
  const contexto = (resultado.error as { context?: Response }).context
  if (contexto && typeof contexto.json === 'function') {
    try {
      return (await contexto.json()) as RespuestaFuncion
    } catch {
      // cae al error genérico
    }
  }
  return { codigo: 'ERROR_INTERNO' }
}

async function abrirSesion(
  cliente: ClienteIdentidad,
  sesion: SesionVecino | null | undefined,
): Promise<boolean> {
  if (!sesion) return false
  const { error } = await cliente.auth.setSession({
    access_token: sesion.access_token,
    refresh_token: sesion.refresh_token,
  })
  return !error
}

export async function registrarVecino(
  cliente: ClienteIdentidad,
  datos: DatosRegistroVecino,
): Promise<ResultadoIdentidad> {
  const respuesta = await leerRespuesta(
    await cliente.functions.invoke('registro-vecino', { body: { ...datos } }),
  )

  if (respuesta.codigo !== 'REGISTRADO') {
    return {
      ok: false,
      codigo: respuesta.codigo ?? 'ERROR_INTERNO',
      mensaje: respuesta.mensaje,
      hasta: respuesta.hasta,
    }
  }

  // Si el registro salió bien pero la sesión no, el vecino puede ingresar después.
  await abrirSesion(cliente, respuesta.sesion)
  return { ok: true, codigo: 'REGISTRADO' }
}

export async function ingresarConRut(
  cliente: ClienteIdentidad,
  rut: string,
  contrasena: string,
): Promise<ResultadoIdentidad> {
  const respuesta = await leerRespuesta(
    await cliente.functions.invoke('acceso-vecino', { body: { rut, contrasena } }),
  )

  if (respuesta.codigo !== 'ACCESO_CONCEDIDO' || !(await abrirSesion(cliente, respuesta.sesion))) {
    return {
      ok: false,
      codigo: respuesta.codigo === 'ACCESO_CONCEDIDO' ? 'ERROR_INTERNO' : (respuesta.codigo ?? 'ERROR_INTERNO'),
      mensaje: respuesta.mensaje,
      hasta: respuesta.hasta,
    }
  }

  return { ok: true, codigo: 'ACCESO_CONCEDIDO' }
}
