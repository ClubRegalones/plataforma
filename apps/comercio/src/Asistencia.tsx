import type { Database } from '@club-regalones/domain'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from './hooks/useSesion'
import { mensajeSupabase } from './lib/mensajesSupabase'
import {
  cambiarEstadoSolicitudAsistencia,
  crearSolicitudAsistencia,
  listarAsistenciaComercio,
  marcarSolicitudAsistenciaLeida,
  responderSolicitudAsistencia,
} from './lib/soporte'
import type {
  MensajeAsistencia,
  NegocioAsistencia,
  TicketAsistencia,
} from './lib/soporte'
import { supabase } from './lib/supabase'
import './asistencia.css'

const etiquetasEstado = {
  abierto: 'Enviado',
  en_revision: 'En revisión',
  esperando_comercio: 'Esperando tu respuesta',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
} as const

const etiquetasCategoria = {
  beneficios: 'Beneficios REGIS',
  compras: 'Compras y terminal',
  llaveros: 'Llaveros',
  cuenta: 'Cuenta del comercio',
  otro: 'Otra consulta',
} as const

function formatearFecha(fecha: string) {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(fecha))
}

function parametrosIniciales() {
  const consulta = window.location.hash.split('?')[1] ?? ''
  return new URLSearchParams(consulta)
}

function Asistencia() {
  const { sesion } = useSesion()
  const parametros = useMemo(() => parametrosIniciales(), [])
  const beneficioId = parametros.get('beneficio')
  const [negocios, setNegocios] = useState<NegocioAsistencia[]>([])
  const [tickets, setTickets] = useState<TicketAsistencia[]>([])
  const [mensajes, setMensajes] = useState<MensajeAsistencia[]>([])
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [creando, setCreando] = useState(Boolean(beneficioId))
  const [negocioId, setNegocioId] = useState(parametros.get('negocio') ?? '')
  const [categoria, setCategoria] = useState<
    Database['public']['Enums']['categoria_ticket_soporte']
  >(beneficioId ? 'beneficios' : 'compras')
  const [asunto, setAsunto] = useState(
    beneficioId ? 'Consulta sobre un beneficio REGIS' : '',
  )
  const [mensajeNuevo, setMensajeNuevo] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const seleccion = useMemo(
    () => tickets.find(({ id }) => id === seleccionId) ?? null,
    [tickets, seleccionId],
  )
  const conversacion = mensajes.filter(
    ({ ticket_id }) => ticket_id === seleccion?.id,
  )

  const cargar = useCallback(async () => {
    if (!sesion) return
    setCargando(true)
    setError(null)
    try {
      const resultado = await listarAsistenciaComercio(sesion.user.id)
      setNegocios(resultado.negocios)
      setTickets(resultado.tickets)
      setMensajes(resultado.mensajes)
      setNegocioId((actual) => actual || resultado.negocios[0]?.id || '')
      setSeleccionId((actual) =>
        resultado.tickets.some(({ id }) => id === actual)
          ? actual
          : null,
      )
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setCargando(false)
    }
  }, [
    sesion,
    setCargando,
    setError,
    setMensajes,
    setNegocioId,
    setNegocios,
    setSeleccionId,
    setTickets,
  ])

  useEffect(() => {
    const inicio = window.setTimeout(() => void cargar(), 0)
    return () => window.clearTimeout(inicio)
  }, [cargar])

  const seleccionarTicket = async (ticket: TicketAsistencia) => {
    setSeleccionId(ticket.id)
    setCreando(false)
    setAviso(null)

    if (ticket.leido_comercio_en !== null) return

    try {
      const actualizado = await marcarSolicitudAsistenciaLeida(ticket.id)
      setTickets((actuales) =>
        actuales.map((actual) =>
          actual.id === actualizado.id
            ? { ...actual, ...actualizado }
            : actual,
        ),
      )
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    }
  }

  const crear = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setProcesando(true)
    setError(null)
    setAviso(null)
    try {
      const ticket = await crearSolicitudAsistencia(
        negocioId,
        categoria,
        asunto.trim(),
        mensajeNuevo.trim(),
        beneficioId,
      )
      setAviso('Tu consulta fue enviada a la administración de Regalones.')
      setAsunto('')
      setMensajeNuevo('')
      setCreando(false)
      await cargar()
      setSeleccionId(ticket.id)
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const responder = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!seleccion) return
    setProcesando(true)
    setError(null)
    setAviso(null)
    try {
      await responderSolicitudAsistencia(seleccion.id, respuesta.trim())
      setRespuesta('')
      setAviso('Respuesta enviada a Regalones.')
      await cargar()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const cambiarEstado = async (estado: 'abierto' | 'cerrado') => {
    if (!seleccion) return
    setProcesando(true)
    setError(null)
    try {
      await cambiarEstadoSolicitudAsistencia(seleccion.id, estado)
      setAviso(estado === 'cerrado' ? 'Consulta cerrada.' : 'Consulta reabierta.')
      await cargar()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    window.location.hash = ''
  }

  return (
    <main className="asistencia-comercio">
      <header className="asistencia-comercio__header">
        <div>
          <span className="terminal-eyebrow">Ayuda Club Regalones</span>
          <h1>Asistencia</h1>
          <p>{sesion?.user.email}</p>
        </div>
        <nav aria-label="Acciones de asistencia">
          <a href="#">Volver a compras</a>
          <button type="button" onClick={() => void cerrarSesion()}>Cerrar sesión</button>
        </nav>
      </header>

      {error && <p className="terminal-alert terminal-alert--error">{error}</p>}
      {aviso && <p className="terminal-alert terminal-alert--success">{aviso}</p>}

      <section className="asistencia-comercio__intro">
        <div>
          <span className="terminal-eyebrow">Canal directo</span>
          <h2>Conversemos dentro del portal</h2>
        </div>
        <p>
          Envía dudas sobre beneficios, compras, llaveros o tu cuenta. La
          administración de Regalones responderá en este mismo historial.
        </p>
        <button type="button" onClick={() => setCreando(true)}>+ Nueva consulta</button>
      </section>

      {negocios.length === 0 && !cargando ? (
        <p className="terminal-empty">Tu cuenta no tiene una membresía activa en un comercio.</p>
      ) : (
        <section className="asistencia-comercio__panel">
          <aside className="asistencia-comercio__lista">
            <div className="asistencia-comercio__resumen-lista">
              <strong>Mis consultas</strong>
              <span>
                {tickets.filter(({ leido_comercio_en }) => leido_comercio_en === null).length}{' '}
                con mensajes nuevos
              </span>
            </div>
            {cargando && tickets.length === 0 ? (
              <p>Cargando consultas…</p>
            ) : tickets.length === 0 ? (
              <p>Aún no tienes consultas. Usa “Nueva consulta” para comenzar.</p>
            ) : tickets.map((ticket) => (
              <button
                type="button"
                key={ticket.id}
                className={`${seleccionId === ticket.id ? 'seleccionado' : ''} ${ticket.leido_comercio_en === null ? 'tiene-nuevos' : ''}`.trim()}
                onClick={() => void seleccionarTicket(ticket)}
              >
                <span className="asistencia-comercio__ticket-superior">
                  <small>{ticket.nombre_negocio}</small>
                  {ticket.leido_comercio_en === null && <em>Nuevo</em>}
                </span>
                <strong>{ticket.asunto}</strong>
                <span>{etiquetasEstado[ticket.estado]} · {formatearFecha(ticket.ultima_actividad_en)}</span>
              </button>
            ))}
          </aside>

          <div className="asistencia-comercio__contenido">
            {creando ? (
              <form className="asistencia-comercio__formulario" onSubmit={crear}>
                <span className="terminal-eyebrow">Nueva consulta</span>
                <h2>¿En qué podemos ayudarte?</h2>
                <label>
                  Comercio
                  <select required value={negocioId} onChange={(evento) => setNegocioId(evento.target.value)}>
                    {negocios.map((negocio) => <option key={negocio.id} value={negocio.id}>{negocio.nombre}</option>)}
                  </select>
                </label>
                <label>
                  Tema
                  <select value={categoria} onChange={(evento) => setCategoria(evento.target.value as typeof categoria)}>
                    {Object.entries(etiquetasCategoria).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
                  </select>
                </label>
                <label>
                  Asunto
                  <input required minLength={5} maxLength={160} value={asunto} onChange={(evento) => setAsunto(evento.target.value)} />
                </label>
                <label>
                  Cuéntanos lo ocurrido
                  <textarea required minLength={5} maxLength={4000} rows={6} value={mensajeNuevo} onChange={(evento) => setMensajeNuevo(evento.target.value)} />
                </label>
                <div>
                  <button type="button" className="secundario" onClick={() => setCreando(false)}>Cancelar</button>
                  <button type="submit" disabled={procesando}>Enviar a Regalones</button>
                </div>
              </form>
            ) : !seleccion ? (
              <div className="asistencia-comercio__vacio"><h2>Selecciona una consulta</h2><p>Aquí aparecerá la conversación completa.</p></div>
            ) : (
              <article className="asistencia-comercio__conversacion">
                <header>
                  <div>
                    <span>{etiquetasCategoria[seleccion.categoria]}</span>
                    <h2>{seleccion.asunto}</h2>
                    <p>{seleccion.nombre_negocio}</p>
                  </div>
                  <em className={`estado--${seleccion.estado}`}>{etiquetasEstado[seleccion.estado]}</em>
                </header>
                <ol>
                  {conversacion.map((mensaje) => (
                    <li key={mensaje.id} className={`origen--${mensaje.origen}`}>
                      <strong>{mensaje.origen === 'regalones' ? 'Club Regalones' : 'Comercio'}</strong>
                      <p>{mensaje.mensaje}</p>
                      <time>{formatearFecha(mensaje.creado_en)}</time>
                    </li>
                  ))}
                </ol>
                {seleccion.estado !== 'cerrado' ? (
                  <form onSubmit={responder}>
                    <label>
                      Responder
                      <textarea required minLength={5} maxLength={4000} rows={4} value={respuesta} onChange={(evento) => setRespuesta(evento.target.value)} />
                    </label>
                    <div>
                      <button type="button" className="secundario" onClick={() => void cambiarEstado('cerrado')} disabled={procesando}>Cerrar consulta</button>
                      <button type="submit" disabled={procesando}>Enviar respuesta</button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => void cambiarEstado('abierto')} disabled={procesando}>Reabrir consulta</button>
                )}
              </article>
            )}
          </div>
        </section>
      )}
    </main>
  )
}

export default Asistencia
