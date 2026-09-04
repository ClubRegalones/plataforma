import { useState } from 'react'
import regalonCorazon from './recursos/mascota/regalon-corazon.png'
import { mensajeSupabase } from './lib/mensajesSupabase'
import type { CredencialTerminalLocal } from './lib/terminalPwa'
import { cerrarTurnoTerminal } from './lib/turnos'
import type { TurnoTerminal } from './lib/turnos'

type Props = {
  turno: TurnoTerminal
  credencial: CredencialTerminalLocal
  alContinuar: () => void
  alCerrarTurno: () => void
}

function formatearInicio(fecha: string) {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(fecha))
}

export default function RecuperarTurno({
  turno,
  credencial,
  alContinuar,
  alCerrarTurno,
}: Props) {
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cambiarCajero = async () => {
    setProcesando(true)
    setError(null)

    try {
      await cerrarTurnoTerminal(
        turno.turno_id,
        credencial,
      )

      alCerrarTurno()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <main className="recuperar-turno-pos">
      <section
        className="recuperar-turno-pos__tarjeta"
        aria-labelledby="recuperar-turno-title"
      >
        <div className="recuperar-turno-pos__contenido">
          <span className="terminal-eyebrow">
            Turno activo encontrado
          </span>

          <div
            className="recuperar-turno-pos__icono"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 7v5h-5" />
              <path d="M4 17v-5h5" />
              <path d="M6.1 8a7 7 0 0 1 11.4-2L20 8" />
              <path d="m4 16 2.5 2a7 7 0 0 0 11.4-2" />
            </svg>
          </div>

          <h1 id="recuperar-turno-title">
            Tu turno sigue abierto
          </h1>

          <p className="recuperar-turno-pos__descripcion">
            Encontramos un turno que quedó activo al cerrar o
            reiniciar la Terminal. Puedes retomarlo exactamente
            donde lo dejaste.
          </p>

          <div className="recuperar-turno-pos__datos">
            <div>
              <small>Cajero/a</small>
              <strong>{turno.nombre_cajero}</strong>
            </div>

            <div>
              <small>Inicio del turno</small>
              <strong>{formatearInicio(turno.iniciado_en)}</strong>
            </div>

            <span className="recuperar-turno-pos__estado">
              <i />
              Turno protegido
            </span>
          </div>

          {error && (
            <p className="terminal-alert terminal-alert--error">
              {error}
            </p>
          )}

          <div className="recuperar-turno-pos__acciones">
            <button
              type="button"
              className="recuperar-turno-pos__continuar"
              disabled={procesando}
              onClick={alContinuar}
            >
              <span>Continuar turno</span>
              <span aria-hidden="true">→</span>
            </button>

            <button
              type="button"
              className="recuperar-turno-pos__cambiar"
              disabled={procesando}
              onClick={() => void cambiarCajero()}
            >
              {procesando
                ? 'Finalizando turno…'
                : 'Cambiar cajero'}
            </button>
          </div>

          <p className="recuperar-turno-pos__nota">
            Cambiar cajero finalizará este turno antes de iniciar
            uno nuevo, manteniendo correctamente la trazabilidad.
          </p>
        </div>

        <aside className="recuperar-turno-pos__visual">
          <div className="recuperar-turno-pos__halo" />

          <img
            src={regalonCorazon}
            alt=""
            aria-hidden="true"
          />

          <div>
            <strong>¡Tu turno está a salvo!</strong>
            <span>No se perdió ninguna operación.</span>
          </div>
        </aside>
      </section>
    </main>
  )
}