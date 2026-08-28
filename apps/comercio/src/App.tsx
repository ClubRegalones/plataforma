import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import Asistencia from './Asistencia'
import GestionBeneficios from './GestionBeneficios'
import GestionNegocio from './GestionNegocio'
import { useSesion } from './hooks/useSesion'
import { mensajeSupabase } from './lib/mensajesSupabase'
import { supabase } from './lib/supabase'

function leerRuta() {
  return window.location.hash.replace(/^#\/?/, '').split('?')[0]
}

function AccesoComercio() {
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ingresar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setProcesando(true)
    setError(null)
    const { error: errorIngreso } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: contrasena,
    })
    setProcesando(false)
    if (errorIngreso) setError(mensajeSupabase(errorIngreso))
  }

  return (
    <main className="acceso-shell">
      <section className="acceso-card">
        <span className="eyebrow">Club Regalones</span>
        <h1>Portal del comercio</h1>
        <p>Gestiona tu negocio con una cuenta de propietario o administrador.</p>
        <form onSubmit={ingresar}>
          <label>
            Correo electrónico
            <input required type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </label>
          <label>
            Contraseña
            <input required type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
          </label>
          {error && <p className="alerta error">{error}</p>}
          <button disabled={procesando} type="submit">
            {procesando ? 'Ingresando…' : 'Ingresar al portal'}
          </button>
        </form>
      </section>
    </main>
  )
}

function InicioComercio() {
  const cerrarSesion = () => void supabase.auth.signOut()

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <div>
          <span className="eyebrow">Portal del comercio</span>
          <h1>Gestión de tu negocio</h1>
          <p>Las operaciones de caja se realizan exclusivamente en la Terminal PWA.</p>
        </div>
        <button type="button" className="secundario" onClick={cerrarSesion}>Cerrar sesión</button>
      </header>
      <section className="menu-grid" aria-label="Herramientas del comercio">
        <a href="#beneficios">
          <span>Beneficios REGIS</span>
          <strong>Crear, publicar y controlar beneficios</strong>
          <small>Solo propietarios y administradores.</small>
        </a>
        <a href="#asistencia">
          <span>Asistencia</span>
          <strong>Conversar con Administración Regalones</strong>
          <small>Consultas de beneficios, cuenta, compras y llaveros.</small>
        </a>
        <a href="#gestion-negocio">
          <span>Administración comercial</span>
          <strong>Sucursales, cajas, personal y dispositivos</strong>
          <small>Supervisa la estructura del negocio y sus Terminales PWA.</small>
        </a>
      </section>
    </main>
  )
}

export default function App() {
  const { sesion, cargando } = useSesion()
  const [ruta, setRuta] = useState(leerRuta)

  useEffect(() => {
    const actualizar = () => setRuta(leerRuta())
    window.addEventListener('hashchange', actualizar)
    return () => window.removeEventListener('hashchange', actualizar)
  }, [])

  if (cargando) return <main className="estado-pagina">Comprobando sesión…</main>
  if (!sesion) return <AccesoComercio />
  if (ruta === 'beneficios') return <GestionBeneficios />
  if (ruta === 'asistencia') return <Asistencia />
  if (ruta === 'gestion-negocio') return <GestionNegocio />
  return <InicioComercio />
}
