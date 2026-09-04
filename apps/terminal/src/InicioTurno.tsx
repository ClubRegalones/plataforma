import type { FormEvent } from 'react'
import { useState } from 'react'
import { mensajeSupabase } from './lib/mensajesSupabase'
import type { CredencialTerminalLocal } from './lib/terminalPwa'
import { iniciarTurnoTerminal } from './lib/turnos'
import type { TurnoTerminal } from './lib/turnos'
import regalonSaludando from './recursos/mascota/regalon-saludando.png'

type InicioTurnoProps = {
  credencial: CredencialTerminalLocal
  alIniciar: (turno: TurnoTerminal) => void
}

export default function InicioTurno({
  credencial,
  alIniciar,
}: InicioTurnoProps) {
  const [nombreCajero, setNombreCajero] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const iniciar = async (
    evento: FormEvent<HTMLFormElement>,
  ) => {
    evento.preventDefault()

    const nombre = nombreCajero.trim()

    if (nombre.length < 2) {
      setError(
        'Escribe el nombre de quien inicia el turno.',
      )
      return
    }

    setProcesando(true)
    setError(null)

    try {
      const turno = await iniciarTurnoTerminal(
        credencial,
        nombre,
      )

      if (!turno) {
        setError('No pudimos iniciar el turno.')
        return
      }

      alIniciar(turno)
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <section
      className="inicio-turno inicio-turno--pos"
      aria-labelledby="inicio-turno-title"
    >
      <div className="inicio-turno-pos__principal">
        <div className="inicio-turno-pos__formulario">
          <span className="inicio-turno-pos__etiqueta">
            Inicio de turno
          </span>

          <h1 id="inicio-turno-title">
            ¿Quién está en caja?
          </h1>

          <p className="inicio-turno-pos__descripcion">
            Ingresa el nombre del cajero a cargo para
            comenzar el turno y gestionar compras y canjes.
          </p>

          <form
            className="inicio-turno-pos__form"
            onSubmit={iniciar}
          >
            <label htmlFor="nombre-cajero">
              Nombre del cajero
            </label>

            <div className="inicio-turno-pos__input">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>

              <input
                id="nombre-cajero"
                required
                type="text"
                minLength={2}
                maxLength={100}
                autoComplete="name"
                autoFocus
                value={nombreCajero}
                onChange={(evento) =>
                  setNombreCajero(evento.target.value)
                }
                placeholder="Ej: María González"
              />
            </div>

            {error && (
              <p className="terminal-alert terminal-alert--error">
                {error}
              </p>
            )}

            <button
              className="inicio-turno-pos__boton"
              type="submit"
              disabled={procesando}
            >
              <span className="inicio-turno-pos__play">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="m10 8 6 4-6 4V8Z"
                    fill="currentColor"
                  />
                </svg>
              </span>

              <strong>
                {procesando
                  ? 'Iniciando turno…'
                  : 'Iniciar turno'}
              </strong>

              {!procesando && (
                <span
                  className="inicio-turno-pos__flecha"
                  aria-hidden="true"
                >
                  →
                </span>
              )}
            </button>
          </form>

          <div className="inicio-turno-pos__nota">
            <span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 3 5 6v5c0 4.5 2.8 8.1 7 10 4.2-1.9 7-5.5 7-10V6l-7-3Z"
                  fill="currentColor"
                />
                <path
                  d="m9 12 2 2 4-4"
                  fill="none"
                  stroke="#07160f"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>

            Cada turno queda registrado y asociado a esta
            caja.
          </div>
        </div>

        <div className="inicio-turno-pos__mascota">
          <div
            className="inicio-turno-pos__halo"
            aria-hidden="true"
          />

          <img
            src={regalonSaludando}
            alt="El Regalón saludando"
          />

          <span
            className="inicio-turno-pos__corazon"
            aria-hidden="true"
          >
            ♥
          </span>

          <aside className="inicio-turno-pos__seguridad">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 3 5 6v5c0 4.5 2.8 8.1 7 10 4.2-1.9 7-5.5 7-10V6l-7-3Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="m9 12 2 2 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>

            <div>
              <strong>
                Esta terminal está vinculada y protegida.
              </strong>

              <span>
                Usa siempre tu nombre personal.
              </span>
            </div>
          </aside>
        </div>
      </div>

      <div className="inicio-turno-pos__modulos">
        <article>
          <span className="inicio-turno-pos__icono">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3 4h2l2 11h10l2-7H7M9 20h.01M17 20h.01"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          <div>
            <strong>Compras</strong>
            <p>
              Valida y gestiona compras de vecinos.
            </p>
          </div>
        </article>

        <article>
          <span className="inicio-turno-pos__icono">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="m8 12 2.6 2.6L16 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>

          <div>
            <strong>Validación</strong>
            <p>
              Verifica compras y beneficios.
            </p>
          </div>
        </article>

        <article>
          <span className="inicio-turno-pos__icono">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 10h16v10H4V10Zm8 0v10M3 10h18V7H3v3Zm9-3c-2.5 0-4-1-4-2.5C8 3.6 8.7 3 9.5 3 11 3 12 5 12 7Zm0 0c2.5 0 4-1 4-2.5C16 3.6 15.3 3 14.5 3 13 3 12 5 12 7Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          <div>
            <strong>Canjes REGIS</strong>
            <p>
              Canjea beneficios y premios.
            </p>
          </div>
        </article>

        <article>
          <span className="inicio-turno-pos__icono">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7ZM10 20h4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>

          <div>
            <strong>Alertas</strong>
            <p>
              Notificaciones y avisos en tiempo real.
            </p>
          </div>
        </article>
      </div>

      <footer className="inicio-turno-pos__pie">
        <span className="inicio-turno-pos__conexion">
          <span aria-hidden="true">●</span>
          Conectada a Club Regalones
        </span>

        <span>Versión 1.0.0</span>

        <span className="inicio-turno-pos__protegida">
          Terminal protegida
        </span>
      </footer>
    </section>
  )
}