import type { FormEventHandler } from 'react'
import { useState } from 'react'
import regalonCorazon from '../recursos/mascota/regalon-corazon.png'

type Props = {
  correo: string
  contrasena: string
  procesando: boolean
  error: string | null
  alCambiarCorreo: (correo: string) => void
  alCambiarContrasena: (contrasena: string) => void
  alEnviar: FormEventHandler<HTMLFormElement>
}

export default function PantallaConfiguracionInicial({
  correo,
  contrasena,
  procesando,
  error,
  alCambiarCorreo,
  alCambiarContrasena,
  alEnviar,
}: Props) {
  const [mostrarContrasena, setMostrarContrasena] =
    useState(false)

  return (
    <main className="configuracion-pos">
      <section
        className="configuracion-pos__panel configuracion-pos__panel--login"
        aria-labelledby="configuracion-inicial-title"
      >
        <aside className="configuracion-pos__presentacion">
          <div className="configuracion-pos__marca">
            <strong>
              Club Regalones
              <span aria-hidden="true">♥</span>
            </strong>

            <small>Más barrio, más beneficios</small>
          </div>

          <div className="configuracion-pos__mascota">
            <div
              className="configuracion-pos__halo"
              aria-hidden="true"
            />

            <img
              src={regalonCorazon}
              alt="El Regalón saludando con un corazón"
            />
          </div>

          <p>
            Vamos a vincular esta terminal con tu negocio.
          </p>

          <div
            className="configuracion-pos__progreso-final"
            aria-label="Paso 1 de 3"
          >
            <div className="configuracion-pos__pasos-final">
              <span className="configuracion-pos__paso configuracion-pos__paso--activo">
                1
              </span>

              <span className="configuracion-pos__linea-paso" />

              <span className="configuracion-pos__paso">
                2
              </span>

              <span className="configuracion-pos__linea-paso" />

              <span className="configuracion-pos__paso">
                3
              </span>
            </div>

            <div className="configuracion-pos__texto-paso">
              <strong>Paso 1</strong>
              <span>de 3</span>
            </div>
          </div>
        </aside>

        <div className="configuracion-pos__contenido">
          <header>
            <span className="terminal-eyebrow">
              Configuración inicial
            </span>

            <h1 id="configuracion-inicial-title">
              Iniciar sesión del comercio
            </h1>

            <p>
              Usa tu cuenta de Club Regalones para vincular
              esta terminal.
            </p>
          </header>

          <form
            className="configuracion-pos__formulario"
            onSubmit={alEnviar}
          >
            <label>
              Correo electrónico

              <input
                required
                type="email"
                autoComplete="email"
                value={correo}
                onChange={(evento) =>
                  alCambiarCorreo(evento.target.value)
                }
                placeholder="ej: contacto@minegocio.cl"
              />
            </label>

            <label>
              Contraseña

              <div className="configuracion-pos__contrasena">
                <input
                  required
                  type={
                    mostrarContrasena
                      ? 'text'
                      : 'password'
                  }
                  autoComplete="current-password"
                  value={contrasena}
                  onChange={(evento) =>
                    alCambiarContrasena(
                      evento.target.value,
                    )
                  }
                  placeholder="••••••••••••"
                />

                <button
                  type="button"
                  className="configuracion-pos__ver-contrasena"
                  aria-label={
                    mostrarContrasena
                      ? 'Ocultar contraseña'
                      : 'Mostrar contraseña'
                  }
                  onClick={() =>
                    setMostrarContrasena(
                      (actual) => !actual,
                    )
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M2.5 12s3.5-5.5 9.5-5.5S21.5 12 21.5 12s-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="2.7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                </button>
              </div>
            </label>

            {error && (
              <p className="terminal-alert terminal-alert--error">
                {error}
              </p>
            )}

            <button
              className="configuracion-pos__principal"
              type="submit"
              disabled={procesando}
            >
              <span
                className={
                  procesando
                    ? 'configuracion-pos__texto-verificando'
                    : undefined
                }
              >
                {procesando
                  ? 'Verificando…'
                  : 'Iniciar sesión'}
              </span>

              {!procesando && (
                <span aria-hidden="true">→</span>
              )}
            </button>
          </form>

          <footer className="configuracion-pos__nota">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M12 3 5 6v5c0 4.5 2.7 8 7 10 4.3-2 7-5.5 7-10V6l-7-3Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              />

              <path
                d="m9 12 2 2 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              />
            </svg>

            <span>
              Solo el dueño o administrador del negocio
              debe realizar esta configuración.
            </span>
          </footer>
        </div>
      </section>
    </main>
  )
}