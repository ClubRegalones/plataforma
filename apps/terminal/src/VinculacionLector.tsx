import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { mensajeSupabase } from './lib/mensajesSupabase'
import {
  cerrarLector,
  crearVinculacionLector,
  listarLecturasPendientes,
  reclamarLecturaTerminal,
} from './lib/terminalPwa'
import type {
  CredencialTerminalLocal,
  LecturaOperativaTerminal,
  LecturaPendienteTerminal,
} from './lib/terminalPwa'

type Props = {
  credencial: CredencialTerminalLocal
  turnoId: string
  alReclamarLectura: (
    lectura: LecturaOperativaTerminal,
  ) => void
}

export default function VinculacionLector({
  credencial,
  turnoId,
  alReclamarLectura,
}: Props) {
  const [urlVinculacion, setUrlVinculacion] =
    useState<string | null>(null)

  const [expiraVinculacion, setExpiraVinculacion] =
    useState<string | null>(null)

  const [lecturas, setLecturas] =
    useState<LecturaPendienteTerminal[]>([])

  const [procesando, setProcesando] = useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [mensaje, setMensaje] =
    useState<string | null>(null)

  const ultimaLecturaReclamada =
    useRef<string | null>(null)

  const cargarLecturas = useCallback(async () => {
    try {
      const pendientes =
        await listarLecturasPendientes(
          credencial,
          turnoId,
        )

      setLecturas(pendientes)

      const ultima =
        pendientes[pendientes.length - 1]

      if (
        ultima &&
        ultima.lectura_id !==
          ultimaLecturaReclamada.current
      ) {
        const reclamada =
          await reclamarLecturaTerminal(
            credencial,
            turnoId,
            ultima.lectura_id,
          )

        if (reclamada) {
          ultimaLecturaReclamada.current =
            ultima.lectura_id

          alReclamarLectura(reclamada)

          setMensaje(
            `${reclamada.codigo_publico} leído. Elige la operación en la terminal.`,
          )
        }
      }
    } catch (errorCapturado) {
      setLecturas([])
      setError(mensajeSupabase(errorCapturado))
    }
  }, [
    alReclamarLectura,
    credencial,
    turnoId,
  ])

  useEffect(() => {
    ultimaLecturaReclamada.current = null

    const cargaInicial = window.setTimeout(() => {
      void cargarLecturas()
    }, 0)

    const respaldo = window.setInterval(() => {
      void cargarLecturas()
    }, 2000)

    return () => {
      window.clearTimeout(cargaInicial)
      window.clearInterval(respaldo)
    }
  }, [cargarLecturas])

  const crearQr = async () => {
    if (!navigator.onLine) {
      setError(
        'La terminal debe estar en línea para vincular un lector.',
      )
      return
    }

    setProcesando(true)
    setError(null)
    setMensaje(null)

    try {
      const vinculacion =
        await crearVinculacionLector(
          credencial,
          turnoId,
        )

      if (!vinculacion) {
        throw new Error(
          'Supabase no devolvió la vinculación.',
        )
      }

      const url = new URL(
        window.location.origin +
          window.location.pathname,
      )

      url.hash =
        `lector-movil?vincular=${encodeURIComponent(
          vinculacion.token_vinculacion,
        )}`

      setUrlVinculacion(url.toString())

      setExpiraVinculacion(
        vinculacion.expira_vinculacion_en,
      )

      setMensaje(
        'Escanea este QR una sola vez con el celular del cajero.',
      )
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const cerrar = async () => {
    setProcesando(true)
    setError(null)

    try {
      await cerrarLector(
        credencial,
        turnoId,
      )

      setUrlVinculacion(null)
      setExpiraVinculacion(null)
      setLecturas([])

      ultimaLecturaReclamada.current = null

      setMensaje(
        'El celular lector fue desconectado de este turno.',
      )
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <section
      className="vinculacion-lector"
      aria-labelledby="lector-terminal-title"
    >
      <div className="vinculacion-lector__encabezado">
        <div>
          <span className="terminal-eyebrow">
            Lector inalámbrico
          </span>

          <h2 id="lector-terminal-title">
            Celular lector de llaveros
          </h2>
        </div>

        <span className="vinculacion-lector__terminal">
          {credencial.identificadorPublico}
        </span>
      </div>

      {error && (
        <p className="terminal-alert terminal-alert--error">
          {error}
        </p>
      )}

      {mensaje && (
        <p className="terminal-alert terminal-alert--success">
          {mensaje}
        </p>
      )}

      <div className="vinculacion-lector__acciones">
        <button
          type="button"
          disabled={procesando}
          onClick={() => void crearQr()}
        >
          {procesando
            ? 'Preparando…'
            : 'Vincular celular lector'}
        </button>

        <button
          type="button"
          disabled={procesando}
          onClick={() => void cerrar()}
        >
          Desconectar lector
        </button>
      </div>

      {urlVinculacion && (
        <div className="vinculacion-lector__qr">
          <QRCodeSVG
            value={urlVinculacion}
            size={224}
            level="M"
            marginSize={2}
            title="QR para vincular el celular lector"
          />

          <div>
            <strong>
              Escanea con el celular del cajero
            </strong>

            <p>
              Se vincula una sola vez para este turno y
              permanece disponible hasta finalizarlo o por
              un máximo de dieciséis horas.
            </p>

            {expiraVinculacion && (
              <small>
                El QR de vinculación vence a las{' '}
                {new Date(
                  expiraVinculacion,
                ).toLocaleTimeString('es-CL')}.
              </small>
            )}

            {import.meta.env.DEV && (
              <a
                className="vinculacion-lector__prueba"
                href={urlVinculacion}
                target="_blank"
                rel="noreferrer"
              >
                Abrir lector de prueba en otra pestaña
              </a>
            )}
          </div>
        </div>
      )}

      {lecturas.length > 0 && (
        <div
          className="vinculacion-lector__lecturas"
          aria-live="polite"
        >
          <strong>
            Llavero recibido en esta caja
          </strong>

          {lecturas.map((lectura) => (
            <article key={lectura.lectura_id}>
              <div>
                <span>
                  {lectura.codigo_publico_llavero}
                </span>

                <h3>{lectura.nombre_vecino}</h3>
              </div>

              <small>
                Lectura válida hasta{' '}
                {new Date(
                  lectura.expira_en,
                ).toLocaleTimeString('es-CL')}
              </small>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}