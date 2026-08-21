import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSesion } from '../../hooks/useSesion'
import { mensajeSupabase } from '../../lib/mensajesSupabase'
import { supabase } from '../../lib/supabase'
import './Autenticacion.css'

type AutenticacionProps = {
  continuar: string | null
  errorInicial?: string | null
}

function destinoSeguro(destino: string | null) {
  if (!destino || destino.startsWith('http') || destino.startsWith('//')) {
    return 'inicio'
  }

  return destino.replace(/^#/, '')
}

function Autenticacion({ continuar, errorInicial = null }: AutenticacionProps) {
  const { sesion, cargando } = useSesion()
  const [modo, setModo] = useState<'ingresar' | 'registrar'>('ingresar')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(errorInicial)

  const destino = destinoSeguro(continuar)

  const enviarFormulario = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setProcesando(true)
    setError(null)
    setMensaje(null)

    try {
      if (modo === 'registrar') {
        const { data, error: errorRegistro } = await supabase.auth.signUp({
          email: correo.trim(),
          password: contrasena,
          options: {
            data: { nombre: nombre.trim() },
            emailRedirectTo: window.location.origin,
          },
        })

        if (errorRegistro) throw errorRegistro

        if (data.session) {
          window.location.hash = destino
          return
        }

        setMensaje(
          'Cuenta creada. Revisa tu correo y confirma el enlace para continuar.',
        )
      } else {
        const { error: errorIngreso } =
          await supabase.auth.signInWithPassword({
            email: correo.trim(),
            password: contrasena,
          })

        if (errorIngreso) throw errorIngreso
        window.location.hash = destino
      }
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const cerrarSesion = async () => {
    setProcesando(true)
    const { error: errorCierre } = await supabase.auth.signOut()
    setProcesando(false)

    if (errorCierre) {
      setError(mensajeSupabase(errorCierre))
    }
  }

  const reenviarConfirmacion = async () => {
    const correoNormalizado = correo.trim()

    if (!correoNormalizado) {
      setError('Escribe primero el correo que utilizaste para registrarte.')
      return
    }

    setProcesando(true)
    setError(null)
    setMensaje(null)

    const { error: errorReenvio } = await supabase.auth.resend({
      type: 'signup',
      email: correoNormalizado,
      options: { emailRedirectTo: window.location.origin },
    })

    setProcesando(false)

    if (errorReenvio) {
      setError(mensajeSupabase(errorReenvio))
      return
    }

    setMensaje(
      'Enviamos un enlace nuevo. Ábrelo una sola vez y desde este computador.',
    )
  }

  return (
    <main className="autenticacion">
      <section className="autenticacion__tarjeta" aria-labelledby="titulo-auth">
        <a className="autenticacion__volver" href="#inicio">
          ← Volver a Club Regalones
        </a>

        <span className="autenticacion__etiqueta">Acceso seguro</span>
        <h1 id="titulo-auth">
          {sesion ? 'Tu sesión está activa' : 'Entra al club de tu barrio'}
        </h1>

        {cargando ? (
          <p className="autenticacion__estado">Comprobando tu sesión…</p>
        ) : sesion ? (
          <div className="autenticacion__sesion">
            <p>
              Iniciaste sesión como <strong>{sesion.user.email}</strong>.
            </p>
            <a className="autenticacion__boton" href={`#${destino}`}>
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
            <div className="autenticacion__modos" aria-label="Tipo de acceso">
              <button
                type="button"
                className={modo === 'ingresar' ? 'activo' : ''}
                onClick={() => setModo('ingresar')}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                className={modo === 'registrar' ? 'activo' : ''}
                onClick={() => setModo('registrar')}
              >
                Crear cuenta
              </button>
            </div>

            <form className="autenticacion__formulario" onSubmit={enviarFormulario}>
              {modo === 'registrar' && (
                <label>
                  Nombre
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    value={nombre}
                    onChange={(evento) => setNombre(evento.target.value)}
                  />
                </label>
              )}

              <label>
                Correo electrónico
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={correo}
                  onChange={(evento) => setCorreo(evento.target.value)}
                />
              </label>

              <label>
                Contraseña
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete={
                    modo === 'registrar' ? 'new-password' : 'current-password'
                  }
                  value={contrasena}
                  onChange={(evento) => setContrasena(evento.target.value)}
                />
              </label>

              {error && <p className="autenticacion__mensaje error">{error}</p>}
              {mensaje && (
                <p className="autenticacion__mensaje exito">{mensaje}</p>
              )}

              <button
                className="autenticacion__boton"
                type="submit"
                disabled={procesando}
              >
                {procesando
                  ? 'Procesando…'
                  : modo === 'registrar'
                    ? 'Crear mi cuenta'
                    : 'Entrar'}
              </button>

              {modo === 'registrar' && (
                <button
                  className="autenticacion__boton autenticacion__boton--secundario"
                  type="button"
                  disabled={procesando}
                  onClick={() => void reenviarConfirmacion()}
                >
                  Reenviar correo de confirmación
                </button>
              )}
            </form>
          </>
        )}
      </section>
    </main>
  )
}

export default Autenticacion
