import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ingresarConRut,
  registrarVecino,
} from '@club-regalones/domain'
import type {
  DatosRegistroVecino,
  ResultadoIdentidad,
  TipoConsentimiento,
} from '@club-regalones/domain'
import { useSesion } from '../../hooks/useSesion'
import { mensajeSupabase } from '../../lib/mensajesSupabase'
import { supabase } from '../../lib/supabase'
import './Autenticacion.css'

type AutenticacionProps = {
  continuar: string | null
  errorInicial?: string | null
}

type VersionConsentimiento = {
  version: string
  obligatorio: boolean
}

type VersionesConsentimiento = Partial<
  Record<TipoConsentimiento, VersionConsentimiento>
>

function destinoSeguro(destino: string | null) {
  if (!destino || destino.startsWith('http') || destino.startsWith('//')) {
    return 'inicio'
  }

  return destino.replace(/^#/, '')
}

function mensajeIdentidad(resultado: ResultadoIdentidad) {
  switch (resultado.codigo) {
    case 'RUT_INVALIDO':
      return 'El RUT ingresado no es válido.'

    case 'RUT_EXISTE':
      return 'Ya existe una cuenta asociada a este RUT.'

    case 'NOMBRE_INVALIDO':
      return 'Revisa el nombre ingresado.'

    case 'APELLIDO_INVALIDO':
      return 'Revisa el apellido ingresado.'

    case 'TERMINOS_REQUERIDOS':
      return 'Debes aceptar los términos y la política de privacidad para crear tu cuenta.'

    case 'CORREO_INVALIDO':
      return 'El correo electrónico ingresado no es válido.'

    case 'TELEFONO_INVALIDO':
      return 'El teléfono ingresado no es válido.'

    case 'CONSENTIMIENTO_MAL_FORMADO':
    case 'CONSENTIMIENTO_DESCONOCIDO':
    case 'VERSION_CONSENTIMIENTO_INVALIDA':
      return 'No pudimos validar los consentimientos. Actualiza la página e inténtalo nuevamente.'

    case 'CONTRASENA_INVALIDA':
      return 'La contraseña no cumple con los requisitos de seguridad.'

    case 'DATOS_INCOMPLETOS':
      return 'Faltan datos obligatorios para continuar.'

    case 'CREDENCIALES_INVALIDAS':
      return 'El RUT o la contraseña son incorrectos.'

    case 'DEMASIADOS_INTENTOS':
      return resultado.hasta
        ? 'Se realizaron demasiados intentos. Espera un momento antes de volver a intentarlo.'
        : 'Se realizaron demasiados intentos. Inténtalo nuevamente más tarde.'

    case 'SERVICIO_NO_DISPONIBLE':
      return 'El servicio no está disponible en este momento. Inténtalo nuevamente más tarde.'

    case 'ERROR_INTERNO':
      return 'Ocurrió un problema inesperado. Inténtalo nuevamente.'

    default:
      return resultado.mensaje ?? 'No pudimos completar la operación.'
  }
}

function Autenticacion({
  continuar,
  errorInicial = null,
}: AutenticacionProps) {
  const { sesion, cargando } = useSesion()

  const [modo, setModo] = useState<'ingresar' | 'registrar'>('ingresar')

  const [rut, setRut] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [correo, setCorreo] = useState('')
  const [telefono, setTelefono] = useState('')
  const [contrasena, setContrasena] = useState('')

  const [aceptaTerminos, setAceptaTerminos] = useState(false)
  const [aceptaAvisos, setAceptaAvisos] = useState(false)
  const [aceptaAnalisis, setAceptaAnalisis] = useState(false)

  const [versionesConsentimiento, setVersionesConsentimiento] =
    useState<VersionesConsentimiento>({})

  const [cargandoConsentimientos, setCargandoConsentimientos] =
    useState(true)

  const [errorConsentimientos, setErrorConsentimientos] =
    useState<string | null>(null)

  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(errorInicial)

  const destino = destinoSeguro(continuar)

  useEffect(() => {
    let activo = true

    const cargarConsentimientos = async () => {
      setCargandoConsentimientos(true)
      setErrorConsentimientos(null)

      const { data, error: errorCarga } = await supabase
        .from('versiones_consentimiento_vigentes')
        .select('tipo, version, obligatorio')

      if (!activo) return

      if (errorCarga) {
        setErrorConsentimientos(
          'No pudimos cargar los términos vigentes. Actualiza la página e inténtalo nuevamente.',
        )
        setCargandoConsentimientos(false)
        return
      }

      const versiones: VersionesConsentimiento = {}

      for (const fila of data ?? []) {
  if (
    !fila.tipo ||
    !fila.version ||
    fila.obligatorio === null
  ) {
    continue
  }

  versiones[fila.tipo] = {
    version: fila.version,
    obligatorio: fila.obligatorio,
  }
}

      setVersionesConsentimiento(versiones)

      if (!versiones.terminos_privacidad) {
        setErrorConsentimientos(
          'No encontramos una versión vigente de los términos y la política de privacidad.',
        )
      }

      setCargandoConsentimientos(false)
    }

    void cargarConsentimientos()

    return () => {
      activo = false
    }
  }, [])

  const cambiarModo = (nuevoModo: 'ingresar' | 'registrar') => {
    setModo(nuevoModo)
    setError(null)
    setMensaje(null)
  }

  const enviarFormulario = async (
    evento: FormEvent<HTMLFormElement>,
  ) => {
    evento.preventDefault()

    setProcesando(true)
    setError(null)
    setMensaje(null)

    try {
      if (modo === 'registrar') {
        const terminos = versionesConsentimiento.terminos_privacidad

        if (!terminos) {
          setError(
            'No pudimos obtener la versión vigente de los términos. Actualiza la página e inténtalo nuevamente.',
          )
          return
        }

        if (!aceptaTerminos) {
          setError(
            'Debes aceptar los términos y la política de privacidad para crear tu cuenta.',
          )
          return
        }

        const consentimientos: DatosRegistroVecino['consentimientos'] = {
          terminos_privacidad: {
            version: terminos.version,
            otorgado: true,
          },
        }

        const avisos = versionesConsentimiento.avisos_comerciales

        if (avisos) {
          consentimientos.avisos_comerciales = {
            version: avisos.version,
            otorgado: aceptaAvisos,
          }
        }

        const analisis =
          versionesConsentimiento.analisis_personalizado

        if (analisis) {
          consentimientos.analisis_personalizado = {
            version: analisis.version,
            otorgado: aceptaAnalisis,
          }
        }

        const resultado = await registrarVecino(supabase, {
          rut: rut.trim(),
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          contrasena,
          correo: correo.trim() || null,
          telefono: telefono.trim() || null,
          canal: 'web',
          consentimientos,
        })

        if (!resultado.ok) {
          setError(mensajeIdentidad(resultado))
          return
        }

        const {
          data: { session: sesionActual },
        } = await supabase.auth.getSession()

        if (sesionActual) {
          window.location.hash = destino
          return
        }

        setMensaje(
          'Tu cuenta fue creada correctamente. Ya puedes iniciar sesión con tu RUT y contraseña.',
        )
        setModo('ingresar')
        return
      }

      const resultado = await ingresarConRut(
        supabase,
        rut.trim(),
        contrasena,
      )

      if (!resultado.ok) {
        setError(mensajeIdentidad(resultado))
        return
      }

      window.location.hash = destino
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const cerrarSesion = async () => {
    setProcesando(true)
    setError(null)

    const { error: errorCierre } = await supabase.auth.signOut()

    setProcesando(false)

    if (errorCierre) {
      setError(mensajeSupabase(errorCierre))
    }
  }

  const registroBloqueado =
    cargandoConsentimientos ||
    !versionesConsentimiento.terminos_privacidad ||
    Boolean(errorConsentimientos)

  return (
    <main className="autenticacion">
      <section
        className="autenticacion__tarjeta"
        aria-labelledby="titulo-auth"
      >
        <a className="autenticacion__volver" href="#inicio">
          ← Volver a Club Regalones
        </a>

        <span className="autenticacion__etiqueta">
          Acceso seguro
        </span>

        <h1 id="titulo-auth">
          {sesion
            ? 'Tu sesión está activa'
            : 'Entra al club de tu barrio'}
        </h1>

        {cargando ? (
          <p className="autenticacion__estado">
            Comprobando tu sesión…
          </p>
        ) : sesion ? (
          <div className="autenticacion__sesion">
            <p>
              Tu acceso a Club Regalones está activo.
            </p>

            <a
              className="autenticacion__boton"
              href={`#${destino}`}
            >
              Continuar
            </a>

            <button
              className="autenticacion__boton autenticacion__boton--secundario"
              type="button"
              disabled={procesando}
              onClick={() => void cerrarSesion()}
            >
              Cerrar sesión
            </button>
          </div>
        ) : (
          <>
            <div
              className="autenticacion__modos"
              aria-label="Tipo de acceso"
            >
              <button
                type="button"
                className={
                  modo === 'ingresar' ? 'activo' : ''
                }
                onClick={() => cambiarModo('ingresar')}
              >
                Iniciar sesión
              </button>

              <button
                type="button"
                className={
                  modo === 'registrar' ? 'activo' : ''
                }
                onClick={() => cambiarModo('registrar')}
              >
                Crear cuenta
              </button>
            </div>

            <form
              className="autenticacion__formulario"
              onSubmit={enviarFormulario}
            >
              <label>
                RUT
                <input
                  required
                  type="text"
                  autoComplete="username"
                  placeholder="12.345.678-5"
                  value={rut}
                  onChange={(evento) =>
                    setRut(evento.target.value)
                  }
                />
              </label>

              {modo === 'registrar' && (
                <>
                  <label>
                    Nombre
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      autoComplete="given-name"
                      value={nombre}
                      onChange={(evento) =>
                        setNombre(evento.target.value)
                      }
                    />
                  </label>

                  <label>
                    Apellido
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      autoComplete="family-name"
                      value={apellido}
                      onChange={(evento) =>
                        setApellido(evento.target.value)
                      }
                    />
                  </label>

                  <label>
                    Correo electrónico
                    <span>Opcional</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={correo}
                      onChange={(evento) =>
                        setCorreo(evento.target.value)
                      }
                    />
                  </label>

                  <label>
                    Teléfono
                    <span>Opcional</span>
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={telefono}
                      onChange={(evento) =>
                        setTelefono(evento.target.value)
                      }
                    />
                  </label>
                </>
              )}

              <label>
                Contraseña
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete={
                    modo === 'registrar'
                      ? 'new-password'
                      : 'current-password'
                  }
                  value={contrasena}
                  onChange={(evento) =>
                    setContrasena(evento.target.value)
                  }
                />
              </label>

              {modo === 'registrar' && (
                <div className="autenticacion__consentimientos">
                  {cargandoConsentimientos ? (
                    <p className="autenticacion__estado">
                      Cargando términos vigentes…
                    </p>
                  ) : (
                    <>
                      {errorConsentimientos && (
                        <p className="autenticacion__mensaje error">
                          {errorConsentimientos}
                        </p>
                      )}

                      {versionesConsentimiento.terminos_privacidad && (
                        <label className="autenticacion__consentimiento">
                          <input
                            type="checkbox"
                            checked={aceptaTerminos}
                            required
                            onChange={(evento) =>
                              setAceptaTerminos(
                                evento.target.checked,
                              )
                            }
                          />
                          <span>
                            Acepto los términos y la política de
                            privacidad.
                          </span>
                        </label>
                      )}

                      {versionesConsentimiento.avisos_comerciales && (
                        <label className="autenticacion__consentimiento">
                          <input
                            type="checkbox"
                            checked={aceptaAvisos}
                            required={
                              versionesConsentimiento
                                .avisos_comerciales
                                .obligatorio
                            }
                            onChange={(evento) =>
                              setAceptaAvisos(
                                evento.target.checked,
                              )
                            }
                          />
                          <span>
                            Quiero recibir novedades, beneficios y
                            comunicaciones de Club Regalones.
                          </span>
                        </label>
                      )}

                      {versionesConsentimiento
                        .analisis_personalizado && (
                        <label className="autenticacion__consentimiento">
                          <input
                            type="checkbox"
                            checked={aceptaAnalisis}
                            required={
                              versionesConsentimiento
                                .analisis_personalizado
                                .obligatorio
                            }
                            onChange={(evento) =>
                              setAceptaAnalisis(
                                evento.target.checked,
                              )
                            }
                          />
                          <span>
                            Permito utilizar mi actividad para
                            personalizar beneficios y experiencias.
                          </span>
                        </label>
                      )}
                    </>
                  )}
                </div>
              )}

              {error && (
                <p className="autenticacion__mensaje error">
                  {error}
                </p>
              )}

              {mensaje && (
                <p className="autenticacion__mensaje exito">
                  {mensaje}
                </p>
              )}

              <button
                className="autenticacion__boton"
                type="submit"
                disabled={
                  procesando ||
                  (modo === 'registrar' &&
                    registroBloqueado)
                }
              >
                {procesando
                  ? 'Procesando…'
                  : modo === 'registrar'
                    ? 'Crear mi cuenta'
                    : 'Entrar'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}

export default Autenticacion