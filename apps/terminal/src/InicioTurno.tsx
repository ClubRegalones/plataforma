import type { FormEvent } from 'react'
import { useState } from 'react'
import { mensajeSupabase } from './lib/mensajesSupabase'
import type { CredencialTerminalLocal } from './lib/terminalPwa'
import { iniciarTurnoTerminal } from './lib/turnos'
import type { TurnoTerminal } from './lib/turnos'

import logoRegalones from './recursos/logo/logo-horizontal-con-slogan.png'
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

  const iniciar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()

    const nombre = nombreCajero.trim()

    if (nombre.length < 2) {
      setError('Escribe el nombre de quien inicia el turno.')
      return
    }

    setProcesando(true)
    setError(null)

    try {
      const turno = await iniciarTurnoTerminal(credencial, nombre)

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
      className="inicio-turno"
      aria-labelledby="inicio-turno-title"
    >
      <div className="inicio-turno__barra">
        <img
          className="inicio-turno__logo"
          src={logoRegalones}
          alt="Club Regalones"
        />

        <div className="inicio-turno__estado">
          <span className="inicio-turno__estado-punto" />
          Terminal lista
        </div>
      </div>

      <div className="inicio-turno__contenido">
        <div className="inicio-turno__panel">
          <span className="inicio-turno__etiqueta">
            Inicio de jornada
          </span>

          <h1 id="inicio-turno-title">
            ¿Quién está en caja?
          </h1>

          <p className="inicio-turno__descripcion">
            Ingresa el nombre del cajero a cargo para comenzar el turno.
          </p>

          <form
            className="inicio-turno__form"
            onSubmit={iniciar}
          >
            <label htmlFor="nombre-cajero">
              Nombre del cajero

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
            </label>

            {error && (
              <p className="terminal-alert terminal-alert--error">
                {error}
              </p>
            )}

            <button
              className="inicio-turno__boton"
              type="submit"
              disabled={procesando}
            >
              {procesando ? 'Iniciando turno…' : 'Iniciar turno'}
              {!procesando && (
                <span aria-hidden="true">→</span>
              )}
            </button>
          </form>

          <div className="inicio-turno__nota">
            <span aria-hidden="true">✓</span>
            No necesitas contraseña ni una cuenta personal.
          </div>
        </div>

        <div
          className="inicio-turno__personaje"
          aria-hidden="true"
        >
          <div className="inicio-turno__burbuja">
            <strong>¡Todo listo!</strong>
            <span>Comencemos el turno.</span>
          </div>

          <img
            src={regalonSaludando}
            alt=""
          />
        </div>
      </div>
    </section>
  )
}