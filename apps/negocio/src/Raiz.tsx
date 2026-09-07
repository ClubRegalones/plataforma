import { useCallback, useEffect, useState } from 'react'
import App from './App'
import AdministracionEquipo from './AdministracionEquipo'
import InicioOperativoV2 from './InicioOperativoV2'
import {
  leerConfiguracionDispositivo,
} from './lib/dispositivo'
import type { ConfiguracionDispositivoNegocio } from './lib/dispositivo'
import {
  cerrarTurnoNegocio,
  consultarTurnoNegocio,
} from './lib/cajeros'
import type { TurnoAppNegocio } from './lib/cajeros'
import './administracion.css'

function esRutaAdministracion() {
  return window.location.hash === '#administracion'
}

function mensajeError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message)
  }
  return 'No pudimos actualizar el estado del turno.'
}

export default function Raiz() {
  const [administracion, setAdministracion] = useState(esRutaAdministracion)
  const [configuracion, setConfiguracion] = useState<ConfiguracionDispositivoNegocio | null>(
    leerConfiguracionDispositivo,
  )
  const [turno, setTurno] = useState<TurnoAppNegocio | null>(null)
  const [comprobandoTurno, setComprobandoTurno] = useState(Boolean(configuracion))
  const [cerrandoTurno, setCerrandoTurno] = useState(false)
  const [errorTurno, setErrorTurno] = useState<string | null>(null)

  const comprobarTurno = useCallback(async (silencioso = false) => {
    const actual = leerConfiguracionDispositivo()
    setConfiguracion(actual)

    if (!actual) {
      setTurno(null)
      setComprobandoTurno(false)
      return
    }

    if (!silencioso) setComprobandoTurno(true)

    try {
      const abierto = await consultarTurnoNegocio(actual)
      setTurno(abierto)
      setErrorTurno(null)
    } catch (capturado) {
      if (!silencioso) setErrorTurno(mensajeError(capturado))
    } finally {
      if (!silencioso) setComprobandoTurno(false)
    }
  }, [])

  useEffect(() => {
    const cambioRuta = () => {
      setAdministracion(esRutaAdministracion())
      setConfiguracion(leerConfiguracionDispositivo())
      void comprobarTurno(true)
    }

    window.addEventListener('hashchange', cambioRuta)
    window.addEventListener('storage', cambioRuta)

    const inicio = window.setTimeout(() => {
      void comprobarTurno(false)
    }, 0)

    return () => {
      window.clearTimeout(inicio)
      window.removeEventListener('hashchange', cambioRuta)
      window.removeEventListener('storage', cambioRuta)
    }
  }, [comprobarTurno])

  useEffect(() => {
    if (administracion || turno || !configuracion) return

    const intervalo = window.setInterval(() => {
      void comprobarTurno(true)
    }, 1_200)

    return () => window.clearInterval(intervalo)
  }, [administracion, comprobarTurno, configuracion, turno])

  const abrirAdministracion = () => {
    setConfiguracion(leerConfiguracionDispositivo())
    window.location.hash = 'administracion'
  }

  const cerrarAdministracion = () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setAdministracion(false)
    setConfiguracion(leerConfiguracionDispositivo())
    void comprobarTurno(false)
  }

  const cerrarTurnoActual = async () => {
    if (!configuracion || !turno) return

    setCerrandoTurno(true)
    setErrorTurno(null)

    try {
      await cerrarTurnoNegocio(configuracion, turno.turno_id)
      setTurno(null)
    } catch (capturado) {
      setErrorTurno(mensajeError(capturado))
    } finally {
      setCerrandoTurno(false)
    }
  }

  if (administracion && configuracion) {
    return (
      <AdministracionEquipo
        configuracion={configuracion}
        alCerrar={cerrarAdministracion}
        alCambiarEquipo={async () => undefined}
      />
    )
  }

  if (comprobandoTurno && configuracion) {
    return <main className="negocio-shell negocio-shell--centrado">Preparando tu turno…</main>
  }

  return (
    <>
      {configuracion && turno ? (
        <InicioOperativoV2
          configuracion={configuracion}
          turno={turno}
          cerrandoTurno={cerrandoTurno}
          alCerrarTurno={cerrarTurnoActual}
        />
      ) : (
        <App />
      )}

      {errorTurno && (
        <div className="negocio-error-turno-raiz" role="alert">{errorTurno}</div>
      )}

      {configuracion && !turno && (
        <button
          className="negocio-acceso-administracion negocio-acceso-administracion--inicio"
          type="button"
          onClick={abrirAdministracion}
          aria-label="Abrir configuración del negocio"
        >
          <span aria-hidden="true">⚙</span>
          <span>
            <strong>Configuración</strong>
            <small>Solo personal autorizado</small>
          </span>
          <b aria-hidden="true">›</b>
        </button>
      )}
    </>
  )
}
