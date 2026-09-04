import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import GestionBeneficios from './paginas/Llaveros/GestionBeneficios'
import GestionLlaveros from './paginas/Llaveros/GestionLlaveros'
import SoporteComercios from './paginas/Llaveros/SoporteComercios'
import { useSesion } from './hooks/useSesion'
import { mensajeSupabase } from './lib/mensajesSupabase'
import { supabase } from './lib/supabase'

function leerRuta() {
  return window.location.hash.replace(/^#\/?/, '').split('?')[0]
}

function AccesoAdmin() {
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
        <h1>Administración</h1>
        <p>Acceso exclusivo para el equipo técnico y operativo autorizado.</p>
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
            {procesando ? 'Ingresando…' : 'Ingresar a Administración'}
          </button>
        </form>
      </section>
    </main>
  )
}

function InicioAdmin() {
  const [autorizado, setAutorizado] = useState<boolean | null>(null)

  useEffect(() => {
    let activo = true
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        if (activo) setAutorizado(false)
        return
      }
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('rol_plataforma')
        .eq('id', data.user.id)
        .maybeSingle()
      if (activo) setAutorizado(perfil?.rol_plataforma === 'admin_regalones')
    })
    return () => { activo = false }
  }, [])

  if (autorizado === null) return <main className="estado-pagina">Validando permisos…</main>
  if (!autorizado) {
    return (
      <main className="acceso-shell">
        <section className="acceso-card">
          <h1>Acceso restringido</h1>
          <p>Esta cuenta no tiene el rol de Administración Regalones.</p>
          <button type="button" onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button>
        </section>
      </main>
    )
  }

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <div>
          <span className="eyebrow">Administración Regalones</span>
          <h1>Control técnico y operativo</h1>
          <p>Supervisión global separada del Portal Comercio y de la Terminal de caja.</p>
        </div>
        <button type="button" onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button>
      </header>
      <section className="menu-grid" aria-label="Herramientas de administración">
        <a href="#administrar-llaveros"><span>Operaciones</span><strong>Solicitudes y llaveros</strong><small>Preparación, entrega, seguridad y reposiciones.</small></a>
        <a href="#administrar-beneficios"><span>Supervisión</span><strong>Beneficios REGIS</strong><small>Revisión, actividad y pausas administrativas.</small></a>
        <a href="#soporte-comercios"><span>Asistencia</span><strong>Comercios y conversaciones</strong><small>Canal con todos los negocios y mensajes pendientes.</small></a>
        <article className="proximamente"><span>Próxima etapa</span><strong>Riesgo, auditoría y reglas globales</strong><small>Paneles técnicos que se incorporarán aquí.</small></article>
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
  if (!sesion) return <AccesoAdmin />
  if (ruta === 'administrar-llaveros') return <GestionLlaveros />
  if (ruta === 'administrar-beneficios') return <GestionBeneficios />
  if (ruta === 'soporte-comercios') return <SoporteComercios />
  return <InicioAdmin />
}
