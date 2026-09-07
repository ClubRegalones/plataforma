import { useEffect, useState } from 'react'
import App from './App'
import AdministracionEquipo from './AdministracionEquipo'
import { leerConfiguracionDispositivo } from './lib/dispositivo'
import type { ConfiguracionDispositivoNegocio } from './lib/dispositivo'
import './administracion.css'

function esRutaAdministracion() {
  return window.location.hash === '#administracion'
}

export default function Raiz() {
  const [administracion, setAdministracion] = useState(esRutaAdministracion)
  const [configuracion, setConfiguracion] = useState<ConfiguracionDispositivoNegocio | null>(
    leerConfiguracionDispositivo,
  )

  useEffect(() => {
    const cambioRuta = () => {
      setAdministracion(esRutaAdministracion())
      setConfiguracion(leerConfiguracionDispositivo())
    }

    window.addEventListener('hashchange', cambioRuta)
    window.addEventListener('storage', cambioRuta)
    return () => {
      window.removeEventListener('hashchange', cambioRuta)
      window.removeEventListener('storage', cambioRuta)
    }
  }, [])

  const abrirAdministracion = () => {
    setConfiguracion(leerConfiguracionDispositivo())
    window.location.hash = 'administracion'
  }

  const cerrarAdministracion = () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setAdministracion(false)
    setConfiguracion(leerConfiguracionDispositivo())
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

  return (
    <>
      <App />
      {configuracion && (
        <button
          className="negocio-acceso-administracion"
          type="button"
          onClick={abrirAdministracion}
          aria-label="Abrir administración del negocio"
        >
          <span aria-hidden="true">⚙</span>
          Administración
        </button>
      )}
    </>
  )
}
