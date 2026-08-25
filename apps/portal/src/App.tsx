import { useEffect, useState } from 'react'
import Inicio from './paginas/Inicio/Inicio'
import Autenticacion from './paginas/Autenticacion/Autenticacion'
import GestionLlaveros from './paginas/Llaveros/GestionLlaveros'
import MiLlavero from './paginas/Llaveros/MiLlavero'
import SolicitudCompra from './paginas/SolicitudCompra/SolicitudCompra'
import './App.css'

function leerRuta() {
  const [ruta = '', consulta = ''] = window.location.hash.slice(1).split('?')

  return {
    ruta,
    parametros: new URLSearchParams(consulta),
  }
}

function App() {
  const [navegacion, setNavegacion] = useState(leerRuta)

  useEffect(() => {
    const actualizarRuta = () => setNavegacion(leerRuta())

    window.addEventListener('hashchange', actualizarRuta)
    return () => window.removeEventListener('hashchange', actualizarRuta)
  }, [])

  if (navegacion.ruta === 'iniciar-sesion') {
    return (
      <Autenticacion continuar={navegacion.parametros.get('continuar')} />
    )
  }

  if (navegacion.ruta.startsWith('error=')) {
    const errorAutenticacion = new URLSearchParams(navegacion.ruta)
    const codigo = errorAutenticacion.get('error_code')
    const detalle = errorAutenticacion.get('error_description')

    return (
      <Autenticacion
        continuar={null}
        errorInicial={
          codigo === 'otp_expired'
            ? 'El enlace de confirmación ya fue utilizado o venció. Solicita uno nuevo y ábrelo solamente desde este computador.'
            : detalle ?? 'No pudimos confirmar el correo. Solicita un enlace nuevo.'
        }
      />
    )
  }

  if (navegacion.ruta === 'compra') {
    return <SolicitudCompra tokenInicial={navegacion.parametros.get('token')} />
  }

  if (
    navegacion.ruta === 'mis-regis' ||
    navegacion.ruta === 'mi-llavero'
  ) {
    return <MiLlavero />
  }

  if (navegacion.ruta === 'administrar-llaveros') {
    return <GestionLlaveros />
  }

  return <Inicio />
}

export default App
