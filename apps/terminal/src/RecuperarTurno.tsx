import { useState } from 'react'
import { mensajeSupabase } from './lib/mensajesSupabase'
import type { CredencialTerminalLocal } from './lib/terminalPwa'
import {
  cerrarTurnoTerminal,
} from './lib/turnos'
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
  const [procesando, setProcesando] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

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
      setError(
        mensajeSupabase(errorCapturado),
      )
    } finally {
      setProcesando(false)
    }
  }

  return (
    <section
      className="inicio-turno"
      aria-labelledby="recuperar-turno-title"
    >
      <div className="inicio-turno__contenido">
        <div className="inicio-turno__panel">
          <span className="inicio-turno__etiqueta">
            Turno activo encontrado
          </span>

          <h1 id="recuperar-turno-title">
            ¿Deseas continuar este turno?
          </h1>

          <p className="inicio-turno__descripcion">
            La Terminal encontró un turno que no fue
            finalizado antes de cerrarse o reiniciarse.
          </p>

          <div className="terminal-card">
            <strong>
              {turno.nombre_cajero}
            </strong>

            <p>
              Inicio:{' '}
              {formatearInicio(
                turno.iniciado_en,
              )}
            </p>
          </div>

          {error && (
            <p className="terminal-alert terminal-alert--error">
              {error}
            </p>
          )}

          <div className="terminal-form">
            <button
              type="button"
              disabled={procesando}
              onClick={alContinuar}
            >
              Sí, continuar turno
            </button>

            <button
              type="button"
              disabled={procesando}
              onClick={() =>
                void cambiarCajero()
              }
            >
              {procesando
                ? 'Finalizando turno…'
                : 'No, cambiar cajero'}
            </button>
          </div>

          <p className="inicio-turno__nota">
            Cambiar cajero finalizará primero el turno
            anterior para mantener correctamente la
            trazabilidad de ventas y canjes.
          </p>
        </div>
      </div>
    </section>
  )
}