import { useState } from 'react'
import { useSesion } from '../../hooks/useSesion'
import logo from '../../recursos/marca/logo-horizontal-con-slogan.png'
import './Encabezado.css'

const enlaces = [
  ['Inicio', '#inicio'],
  ['Cómo funciona', '#como-funciona'],
  ['Vecinos', '#vecinos'],
  ['Comercios', '#comercios'],
  ['Nosotros', '#nosotros'],
  ['Preguntas', '#preguntas'],
]

function IconoUsuario() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 12a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm-7.5 8.5c.55-4.05 3.45-6.25 7.5-6.25s6.95 2.2 7.5 6.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function Encabezado() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const { sesion } = useSesion()

  const cerrarMenu = () => setMenuAbierto(false)
  const destinoCuenta = sesion
    ? '#mis-regis'
    : '#iniciar-sesion?continuar=mis-regis'
  const textoCuenta = sesion ? 'Mis REGIS' : 'Iniciar sesión'

  return (
    <header className="encabezado">
      <div className="contenedor encabezado__contenido">
        <a className="encabezado__marca" href="#inicio" aria-label="Ir al inicio">
          <img src={logo} alt="Club Regalones, más barrio, más beneficios" />
        </a>

        <button
          className="encabezado__menu-boton"
          type="button"
          aria-label="Abrir menú"
          aria-expanded={menuAbierto}
          onClick={() => setMenuAbierto((abierto) => !abierto)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav
          className={`encabezado__navegacion ${
            menuAbierto ? 'encabezado__navegacion--abierta' : ''
          }`}
          aria-label="Navegación principal"
        >
          {enlaces.map(([texto, destino]) => (
            <a key={destino} href={destino} onClick={cerrarMenu}>
              {texto}
            </a>
          ))}

          <a
            className="encabezado__sesion encabezado__sesion--movil"
            href={destinoCuenta}
            onClick={cerrarMenu}
          >
            <span>{textoCuenta}</span>
            <IconoUsuario />
          </a>
        </nav>

        <a className="encabezado__sesion" href={destinoCuenta}>
          <span>{textoCuenta}</span>
          <IconoUsuario />
        </a>
      </div>
    </header>
  )
}

export default Encabezado
