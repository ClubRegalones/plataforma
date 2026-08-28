import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { mensajeSupabase } from './lib/mensajesSupabase'
import { supabase } from './lib/supabase'
import {
  cerrarLector,
  crearVinculacionLector,
  eliminarCredencialTerminal,
  leerCredencialTerminal,
  listarLecturasPendientes,
  reclamarLecturaTerminal,
  registrarTerminalPwa,
  validarTerminalPwa,
} from './lib/terminalPwa'
import type {
  CredencialTerminalLocal,
  LecturaPendienteTerminal,
  LecturaOperativaTerminal,
} from './lib/terminalPwa'

type Props = {
  cajaId: string
  puedeRegistrar: boolean
  mostrarControles?: boolean
  alCambiarCredencial: (credencial: CredencialTerminalLocal | null) => void
  alReclamarLectura: (lectura: LecturaOperativaTerminal) => void
}

export default function VinculacionLector({
  cajaId,
  puedeRegistrar,
  mostrarControles = true,
  alCambiarCredencial,
  alReclamarLectura,
}: Props) {
  const [credencial, setCredencial] =
    useState<CredencialTerminalLocal | null>(null)
  const [urlVinculacion, setUrlVinculacion] = useState<string | null>(null)
  const [expiraVinculacion, setExpiraVinculacion] = useState<string | null>(null)
  const [lecturas, setLecturas] = useState<LecturaPendienteTerminal[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const ultimaLecturaReclamada = useRef<string | null>(null)

  const cargarLecturas = useCallback(async (
    credencialActual: CredencialTerminalLocal,
  ) => {
    try {
      const pendientes = await listarLecturasPendientes(
        credencialActual.terminalId,
      )
      setLecturas(pendientes)

      const ultima = pendientes[pendientes.length - 1]
      if (ultima && ultima.lectura_id !== ultimaLecturaReclamada.current) {
        const reclamada = await reclamarLecturaTerminal(
          credencialActual,
          ultima.lectura_id,
        )
        if (reclamada) {
          ultimaLecturaReclamada.current = ultima.lectura_id
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
  }, [alReclamarLectura])

  useEffect(() => {
    let activa = true
    const comprobar = async () => {
      setCargando(true)
      setUrlVinculacion(null)
      setLecturas([])
      ultimaLecturaReclamada.current = null
      const guardada = leerCredencialTerminal(cajaId)
      if (!guardada) {
        if (activa) {
          setCredencial(null)
          alCambiarCredencial(null)
          setCargando(false)
        }
        return
      }

      try {
        await validarTerminalPwa(guardada)
        if (activa) {
          setCredencial(guardada)
          alCambiarCredencial(guardada)
          await cargarLecturas(guardada)
        }
      } catch {
        eliminarCredencialTerminal(cajaId)
        if (activa) {
          setCredencial(null)
          alCambiarCredencial(null)
        }
      } finally {
        if (activa) setCargando(false)
      }
    }

    void comprobar()
    return () => { activa = false }
  }, [alCambiarCredencial, cajaId, cargarLecturas])

  useEffect(() => {
    if (!credencial) return

    const canal = supabase
      .channel(`lector-terminal-${credencial.terminalId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lecturas_llavero_terminal',
          filter: `terminal_id=eq.${credencial.terminalId}`,
        },
        () => void cargarLecturas(credencial),
      )
      .subscribe()

    const respaldo = window.setInterval(
      () => void cargarLecturas(credencial),
      5000,
    )

    return () => {
      window.clearInterval(respaldo)
      void supabase.removeChannel(canal)
    }
  }, [credencial, cargarLecturas])

  const registrar = async () => {
    setProcesando(true)
    setError(null)
    setMensaje(null)
    try {
      const nombre = `Terminal ${navigator.platform || 'del comercio'}`
      const nueva = await registrarTerminalPwa(cajaId, nombre)
      if (!nueva) throw new Error('Supabase no devolvió la terminal registrada.')
      setCredencial(nueva)
      alCambiarCredencial(nueva)
      setMensaje('Este equipo quedó registrado como Terminal PWA de la caja.')
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const crearQr = async () => {
    if (!credencial || !navigator.onLine) {
      setError('La terminal debe estar en línea para vincular un lector.')
      return
    }
    setProcesando(true)
    setError(null)
    setMensaje(null)
    try {
      const vinculacion = await crearVinculacionLector(credencial)
      if (!vinculacion) throw new Error('Supabase no devolvió la vinculación.')
      const url = new URL(window.location.origin + window.location.pathname)
      url.hash = `lector-movil?vincular=${encodeURIComponent(vinculacion.token_vinculacion)}`
      setUrlVinculacion(url.toString())
      setExpiraVinculacion(vinculacion.expira_vinculacion_en)
      setMensaje('Escanea este QR una sola vez con el celular del cajero.')
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const cerrar = async () => {
    if (!credencial) return
    setProcesando(true)
    setError(null)
    try {
      await cerrarLector(credencial.terminalId)
      setUrlVinculacion(null)
      setLecturas([])
      setMensaje('El celular lector fue desconectado de esta terminal.')
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  if (!cajaId || cargando) return null

  if (credencial && !mostrarControles) return null

  return (
    <section className="vinculacion-lector" aria-labelledby="lector-terminal-title">
      <div className="vinculacion-lector__encabezado">
        <div>
          <span className="terminal-eyebrow">Lector inalámbrico</span>
          <h2 id="lector-terminal-title">Celular lector de llaveros</h2>
        </div>
        {credencial && (
          <span className="vinculacion-lector__terminal">
            {credencial.identificadorPublico}
          </span>
        )}
      </div>

      {error && <p className="terminal-alert terminal-alert--error">{error}</p>}
      {mensaje && <p className="terminal-alert terminal-alert--success">{mensaje}</p>}

      {!credencial ? (
        <div className="vinculacion-lector__registro">
          <p>
            Este navegador todavía no está autorizado como terminal de la caja.
          </p>
          {puedeRegistrar ? (
            <button type="button" disabled={procesando} onClick={() => void registrar()}>
              {procesando ? 'Registrando…' : 'Activar este equipo como Terminal PWA'}
            </button>
          ) : (
            <p className="vinculacion-lector__aviso">
              El propietario o administrador debe activar este equipo una sola vez.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="vinculacion-lector__acciones">
            <button type="button" disabled={procesando} onClick={() => void crearQr()}>
              {procesando ? 'Preparando…' : 'Vincular celular lector'}
            </button>
            <button type="button" disabled={procesando} onClick={() => void cerrar()}>
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
                <strong>Escanea con el celular del cajero</strong>
                <p>
                  No necesitas repetirlo para cada vecino. La vinculación dura
                  hasta dieciséis horas y cubre una jornada completa.
                </p>
                {expiraVinculacion && (
                  <small>
                    Este QR vence a las{' '}
                    {new Date(expiraVinculacion).toLocaleTimeString('es-CL')}.
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
            <div className="vinculacion-lector__lecturas" aria-live="polite">
              <strong>Llavero recibido en esta caja</strong>
              {lecturas.map((lectura) => (
                <article key={lectura.lectura_id}>
                  <div>
                    <span>{lectura.codigo_publico_llavero}</span>
                    <h3>{lectura.nombre_vecino}</h3>
                  </div>
                  <small>
                    Lectura válida hasta{' '}
                    {new Date(lectura.expira_en).toLocaleTimeString('es-CL')}
                  </small>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
