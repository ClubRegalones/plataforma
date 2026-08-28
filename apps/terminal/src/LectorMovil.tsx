import type { FormEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  eliminarSesionLector,
  enviarLecturaLlavero,
  extraerTokenLlavero,
  leerSesionLector,
  validarSesionLector,
  vincularLector,
} from './lib/lectorMovil'
import type { SesionLectorLocal } from './lib/lectorMovil'
import { mensajeSupabase } from './lib/mensajesSupabase'

function parametrosRuta() {
  const hash = window.location.hash.replace(/^#/, '')
  return new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '')
}

function limpiarRuta() {
  window.history.replaceState(null, '', `${window.location.pathname}#lector-movil`)
}

export default function LectorMovil() {
  const [sesion, setSesion] = useState<SesionLectorLocal | null>(() =>
    leerSesionLector(),
  )
  const [tokenManual, setTokenManual] = useState('')
  const [estado, setEstado] = useState('Preparando lector…')
  const [error, setError] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const lecturaAutomatica = useRef(false)
  const inicializacionIniciada = useRef(false)

  const enviar = useCallback(
    async (valor: string) => {
      if (!sesion) return
      const token = extraerTokenLlavero(valor)
      if (token.length < 8) {
        setError('La etiqueta no contiene un identificador de llavero válido.')
        return
      }

      setLeyendo(true)
      setError(null)
      setEstado('Enviando lectura a la caja…')
      try {
        const lectura = await enviarLecturaLlavero(sesion, token)
        if (!lectura) throw new Error('Supabase no devolvió la lectura.')
        setEstado(
          `Llavero ${lectura.codigo_publico_llavero} enviado a ${lectura.caja_nombre}.`,
        )
        setTokenManual('')
      } catch (errorCapturado) {
        setError(mensajeSupabase(errorCapturado))
        setEstado('No se pudo enviar el llavero.')
      } finally {
        setLeyendo(false)
      }
    },
    [sesion],
  )

  useEffect(() => {
    if (inicializacionIniciada.current) return
    inicializacionIniciada.current = true

    const iniciar = async () => {
      const parametros = parametrosRuta()
      const tokenVinculacion = parametros.get('vincular')
      const tokenLlavero = parametros.get('llavero') ?? parametros.get('t')

      try {
        let sesionActual = leerSesionLector()

        if (sesionActual) {
          const valida = await validarSesionLector(sesionActual)
          if (!valida) {
            eliminarSesionLector()
            sesionActual = null
          }
        }

        if (!sesionActual && tokenVinculacion) {
          sesionActual = await vincularLector(tokenVinculacion)
        }

        if (!sesionActual) {
          setSesion(null)
          setEstado('Este teléfono aún no está vinculado a una caja.')
          limpiarRuta()
          return
        }

        setSesion(sesionActual)
        setEstado(`Lector conectado a ${sesionActual.cajaNombre}.`)
        limpiarRuta()

        if (tokenLlavero && !lecturaAutomatica.current) {
          lecturaAutomatica.current = true
          window.setTimeout(() => void enviar(tokenLlavero), 0)
        }
      } catch (errorCapturado) {
        eliminarSesionLector()
        setSesion(null)
        setError(mensajeSupabase(errorCapturado))
        setEstado('No fue posible vincular este teléfono.')
        limpiarRuta()
      }
    }

    void iniciar()
  }, [enviar])

  const iniciarNfc = async () => {
    if (!sesion || typeof NDEFReader === 'undefined') {
      setError(
        'Este navegador no permite lectura Web NFC. Acerca igualmente el llavero al iPhone para abrir su enlace, o utiliza el ingreso de prueba.',
      )
      return
    }

    setError(null)
    setEstado('Acerca el llavero NFC al teléfono…')
    try {
      const lector = new NDEFReader()
      await lector.scan()
      lector.addEventListener('reading', ((evento: NDEFReadingEvent) => {
        const registro = evento.message.records[0]
        if (!registro?.data) return
        const valor = new TextDecoder(registro.encoding ?? 'utf-8').decode(
          registro.data,
        )
        void enviar(valor)
      }) as EventListener)
      setEstado('Lector NFC activo. Acerca un llavero.')
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
      setEstado('No fue posible activar el lector NFC.')
    }
  }

  const enviarManual = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    void enviar(tokenManual)
  }

  return (
    <main className="lector-movil">
      <section className="lector-movil__tarjeta">
        <span className="terminal-eyebrow">Lector móvil Regalones</span>
        <h1>Celular lector de llaveros</h1>
        <p className="lector-movil__estado" aria-live="polite">
          {estado}
        </p>

        {error && <p className="terminal-alert terminal-alert--error">{error}</p>}

        {sesion ? (
          <>
            <dl className="lector-movil__datos">
              <div><dt>Caja</dt><dd>{sesion.cajaNombre}</dd></div>
              <div><dt>Terminal</dt><dd>{sesion.terminalIdentificador}</dd></div>
              <div>
                <dt>Vinculado hasta</dt>
                <dd>{new Date(sesion.expiraEn).toLocaleString('es-CL')}</dd>
              </div>
            </dl>

            <button
              className="lector-movil__boton"
              type="button"
              disabled={leyendo}
              onClick={() => void iniciarNfc()}
            >
              {leyendo ? 'Enviando…' : 'Activar lector NFC'}
            </button>

            <details className="lector-movil__prueba">
              <summary>Ingreso de respaldo o prueba</summary>
              <form onSubmit={enviarManual}>
                <label>
                  Token leído desde el llavero
                  <input
                    required
                    type="password"
                    minLength={8}
                    autoComplete="off"
                    value={tokenManual}
                    onChange={(evento) => setTokenManual(evento.target.value)}
                  />
                </label>
                <button type="submit" disabled={leyendo}>Enviar a la caja</button>
              </form>
            </details>
          </>
        ) : (
          <p className="lector-movil__ayuda">
            Abre en la Terminal PWA la opción “Vincular celular lector” y
            escanea su QR con este teléfono.
          </p>
        )}

        <aside className="lector-movil__seguridad">
          Este teléfono solo transmite lecturas. No puede aprobar compras,
          acreditar REGIS ni confirmar canjes.
        </aside>
      </section>
    </main>
  )
}
