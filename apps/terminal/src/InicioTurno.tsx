import type { FormEvent } from 'react'
import { useState } from 'react'
import { mensajeSupabase } from './lib/mensajesSupabase'
import type { CredencialTerminalLocal } from './lib/terminalPwa'
import { iniciarTurnoTerminal } from './lib/turnos'
import type { TurnoTerminal } from './lib/turnos'

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
    <section className="terminal-card" aria-labelledby="inicio-turno-title">
      <span className="terminal-eyebrow">Club Regalones</span>

      <h1 id="inicio-turno-title">Iniciar turno</h1>

      <p>
        Ingresa el nombre del cajero a cargo de esta caja.
      </p>

      <form className="terminal-form" onSubmit={iniciar}>
        <label>
          Nombre del cajero
          <input
            required
            type="text"
            minLength={2}
            maxLength={100}
            autoComplete="name"
            value={nombreCajero}
            onChange={(evento) => setNombreCajero(evento.target.value)}
            placeholder="Ej: María González"
          />
        </label>

        {error && (
          <p className="terminal-alert terminal-alert--error">
            {error}
          </p>
        )}

        <button type="submit" disabled={procesando}>
          {procesando ? 'Iniciando turno…' : 'Iniciar turno'}
        </button>
      </form>
    </section>
  )
}
