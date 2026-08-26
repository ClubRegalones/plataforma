import type { Database, Tables } from '@club-regalones/domain'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import EnlaceSoporteAdmin from '../../componentes/EnlaceSoporteAdmin'
import { useSesion } from '../../hooks/useSesion'
import { mensajeSupabase } from '../../lib/mensajesSupabase'
import {
  cambiarEstadoConversacionAdmin,
  iniciarConversacionAdmin,
  listarAsistenciaAdmin,
  marcarConversacionAdminLeida,
  responderConversacionAdmin,
} from '../../lib/soporte'
import type {
  BeneficioSoporteAdmin,
  MensajeSoporteAdmin,
  NegocioSoporteAdmin,
  TicketSoporteAdmin,
} from '../../lib/soporte'
import { supabase } from '../../lib/supabase'
import './Llaveros.css'
import './SoporteAdmin.css'

type PerfilAdmin = Pick<Tables<'perfiles'>, 'nombre' | 'rol_plataforma'>
type EstadoTicket = Database['public']['Enums']['estado_ticket_soporte']
type CategoriaTicket = Database['public']['Enums']['categoria_ticket_soporte']

const etiquetasEstado = {
  abierto: 'Abierto',
  en_revision: 'En revisión',
  esperando_comercio: 'Esperando comercio',
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
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '')
}

function SoporteComercios() {
  const { sesion, cargando: cargandoSesion } = useSesion()
  const parametros = useMemo(() => parametrosIniciales(), [])
  const [perfil, setPerfil] = useState<PerfilAdmin | null>(null)
  const [negocios, setNegocios] = useState<NegocioSoporteAdmin[]>([])
  const [beneficios, setBeneficios] = useState<BeneficioSoporteAdmin[]>([])
  const [tickets, setTickets] = useState<TicketSoporteAdmin[]>([])
  const [mensajes, setMensajes] = useState<MensajeSoporteAdmin[]>([])
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [creando, setCreando] = useState(Boolean(parametros.get('negocio')))
  const [negocioId, setNegocioId] = useState(parametros.get('negocio') ?? '')
  const [beneficioId, setBeneficioId] = useState(parametros.get('beneficio') ?? '')
  const [categoria, setCategoria] = useState<CategoriaTicket>(
    parametros.get('beneficio') ? 'beneficios' : 'otro',
  )
  const [asunto, setAsunto] = useState(
    parametros.get('beneficio') ? 'Revisión de beneficio REGIS' : '',
  )
  const [mensajeInicial, setMensajeInicial] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [estadoDestino, setEstadoDestino] = useState<EstadoTicket>('en_revision')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaNegocios, setBusquedaNegocios] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [vistaLista, setVistaLista] = useState<'conversaciones' | 'negocios'>(
    'conversaciones',
  )
  const [cargandoDatos, setCargandoDatos] = useState(false)
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
  const beneficiosNegocio = beneficios.filter(
    ({ negocio_id }) => negocio_id === negocioId,
  )
  const ticketsFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase('es-CL')
    return tickets.filter((ticket) => {
      const coincideTexto =
        !texto ||
        [ticket.asunto, ticket.nombre_negocio, ticket.codigo_beneficio ?? ''].some(
          (valor) => valor.toLocaleLowerCase('es-CL').includes(texto),
        )
      const coincideEstado =
        filtroEstado === 'todos' || ticket.estado === filtroEstado
      return coincideTexto && coincideEstado
    })
  }, [tickets, busqueda, filtroEstado])
  const negociosFiltrados = useMemo(() => {
    const texto = busquedaNegocios.trim().toLocaleLowerCase('es-CL')
    return negocios.filter(
      (negocio) =>
        !texto ||
        [negocio.nombre, negocio.rubro].some((valor) =>
          valor.toLocaleLowerCase('es-CL').includes(texto),
        ),
    )
  }, [negocios, busquedaNegocios])

  const cargar = useCallback(async () => {
    if (!sesion) return
    setCargandoDatos(true)
    setError(null)
    try {
      const { data, error: errorPerfil } = await supabase
        .from('perfiles')
        .select('nombre, rol_plataforma')
        .eq('id', sesion.user.id)
        .single()
      if (errorPerfil) throw errorPerfil
      const perfilActual = data as PerfilAdmin
      setPerfil(perfilActual)
      if (perfilActual.rol_plataforma !== 'admin_regalones') return

      const resultado = await listarAsistenciaAdmin()
      setNegocios(resultado.negocios)
      setBeneficios(resultado.beneficios)
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
      setCargandoDatos(false)
    }
  }, [
    sesion,
    setBeneficios,
    setCargandoDatos,
    setError,
    setMensajes,
    setNegocioId,
    setNegocios,
    setPerfil,
    setSeleccionId,
    setTickets,
  ])

  useEffect(() => {
    const inicio = window.setTimeout(() => void cargar(), 0)
    return () => window.clearTimeout(inicio)
  }, [cargar])

  const seleccionarTicket = async (ticket: TicketSoporteAdmin) => {
    setSeleccionId(ticket.id)
    setEstadoDestino(ticket.estado)
    setCreando(false)
    setAviso(null)

    if (ticket.leido_regalones_en !== null) return

    try {
      const actualizado = await marcarConversacionAdminLeida(ticket.id)
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

  const contactarNegocio = (negocio: NegocioSoporteAdmin) => {
    setNegocioId(negocio.id)
    setBeneficioId('')
    setCategoria('otro')
    setAsunto('')
    setMensajeInicial('')
    setSeleccionId(null)
    setCreando(true)
    setVistaLista('conversaciones')
    setError(null)
    setAviso(null)
  }

  const crear = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setProcesando(true)
    setError(null)
    setAviso(null)
    try {
      const ticket = await iniciarConversacionAdmin(
        negocioId,
        categoria,
        asunto.trim(),
        mensajeInicial.trim(),
        beneficioId || null,
      )
      setAviso('El mensaje fue enviado al comercio y quedó registrado.')
      setCreando(false)
      setAsunto('')
      setMensajeInicial('')
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
      await responderConversacionAdmin(seleccion.id, respuesta.trim())
      setRespuesta('')
      setAviso('Respuesta enviada al comercio.')
      await cargar()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const guardarEstado = async () => {
    if (!seleccion) return
    setProcesando(true)
    setError(null)
    try {
      await cambiarEstadoConversacionAdmin(seleccion.id, estadoDestino)
      setAviso('Estado actualizado.')
      await cargar()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    window.location.hash = 'inicio'
  }

  const abiertos = tickets.filter(({ estado }) => estado === 'abierto').length
  const enRevision = tickets.filter(({ estado }) => estado === 'en_revision').length
  const esperando = tickets.filter(
    ({ estado }) => estado === 'esperando_comercio',
  ).length
  const noLeidos = tickets.filter(
    ({ leido_regalones_en }) => leido_regalones_en === null,
  ).length

  return (
    <main className="llaveros soporte-admin">
      <header className="llaveros__barra">
        <a className="llaveros__marca" href="#inicio">Club Regalones</a>
        <nav aria-label="Administración">
          <EnlaceSoporteAdmin />
          <a href="#administrar-beneficios">Beneficios</a>
          <a href="#administrar-llaveros">Llaveros</a>
          {sesion && <button type="button" onClick={() => void cerrarSesion()}>Cerrar sesión</button>}
        </nav>
      </header>

      <section className="llaveros__encabezado">
        <span>Administración Regalones</span>
        <h1>Asistencia a comercios</h1>
        <p>
          Recibe consultas, conversa con cada negocio y conserva un historial
          trazable de las soluciones y avisos técnicos.
        </p>
      </section>

      {cargandoSesion ? (
        <p className="llaveros__aviso">Comprobando tu sesión…</p>
      ) : !sesion ? (
        <section className="llaveros__aviso llaveros__aviso--centrado">
          <h2>Acceso administrativo</h2>
          <a href="#iniciar-sesion?continuar=soporte-comercios">Iniciar sesión</a>
        </section>
      ) : cargandoDatos && !perfil ? (
        <p className="llaveros__aviso">Cargando permisos…</p>
      ) : perfil?.rol_plataforma !== 'admin_regalones' ? (
        <section className="llaveros__aviso llaveros__aviso--centrado">
          <h2>No tienes acceso a esta sección</h2>
          <p>Solo la administración de Regalones puede revisar esta bandeja.</p>
        </section>
      ) : (
        <div className="llaveros__contenido">
          {(error || aviso) && (
            <div className={`llaveros__mensaje ${error ? 'llaveros__mensaje--error' : ''}`} role="status">{error ?? aviso}</div>
          )}

          <section className="soporte-admin__metricas" aria-label="Resumen">
            <article className={noLeidos > 0 ? 'tiene-pendientes' : ''}>
              <span>Mensajes nuevos</span><strong>{noLeidos}</strong>
            </article>
            <article><span>Abiertos</span><strong>{abiertos}</strong></article>
            <article><span>En revisión</span><strong>{enRevision}</strong></article>
            <article><span>Esperando comercio</span><strong>{esperando}</strong></article>
          </section>

          <section className="soporte-admin__panel">
            <aside className="soporte-admin__lista">
              <button type="button" className="soporte-admin__nuevo" onClick={() => setCreando(true)}>+ Contactar un comercio</button>
              <div className="soporte-admin__pestanas" role="tablist" aria-label="Bandeja y directorio">
                <button type="button" role="tab" aria-selected={vistaLista === 'conversaciones'} className={vistaLista === 'conversaciones' ? 'activo' : ''} onClick={() => setVistaLista('conversaciones')}>
                  Conversaciones {noLeidos > 0 && <span>{noLeidos}</span>}
                </button>
                <button type="button" role="tab" aria-selected={vistaLista === 'negocios'} className={vistaLista === 'negocios' ? 'activo' : ''} onClick={() => setVistaLista('negocios')}>
                  Negocios <span>{negocios.length}</span>
                </button>
              </div>
              {vistaLista === 'conversaciones' ? (
                <>
                  <div className="soporte-admin__filtros">
                    <input aria-label="Buscar consultas" type="search" placeholder="Buscar comercio o asunto" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} />
                    <select aria-label="Filtrar por estado" value={filtroEstado} onChange={(evento) => setFiltroEstado(evento.target.value)}>
                      <option value="todos">Todos</option>
                      {Object.entries(etiquetasEstado).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
                    </select>
                  </div>
                  {cargandoDatos && tickets.length === 0 ? (
                    <p>Cargando consultas…</p>
                  ) : ticketsFiltrados.length === 0 ? (
                    <p>No hay consultas con estos filtros.</p>
                  ) : ticketsFiltrados.map((ticket) => (
                    <button
                      type="button"
                      key={ticket.id}
                      className={`${seleccion?.id === ticket.id ? 'seleccionado' : ''} ${ticket.leido_regalones_en === null ? 'tiene-nuevos' : ''}`.trim()}
                      onClick={() => void seleccionarTicket(ticket)}
                    >
                      <span className="soporte-admin__ticket-superior">
                        <small>{ticket.nombre_negocio}</small>
                        {ticket.leido_regalones_en === null && <em>Nuevo</em>}
                      </span>
                      <strong>{ticket.asunto}</strong>
                      <span>{etiquetasEstado[ticket.estado]} · {formatearFecha(ticket.ultima_actividad_en)}</span>
                    </button>
                  ))}
                </>
              ) : (
                <div className="soporte-admin__directorio">
                  <input aria-label="Buscar negocios" type="search" placeholder="Buscar por nombre o rubro" value={busquedaNegocios} onChange={(evento) => setBusquedaNegocios(evento.target.value)} />
                  {negociosFiltrados.length === 0 ? (
                    <p>No hay negocios con ese nombre.</p>
                  ) : negociosFiltrados.map((negocio) => {
                    const conversaciones = tickets.filter(({ negocio_id }) => negocio_id === negocio.id)
                    const pendientes = conversaciones.filter(({ leido_regalones_en }) => leido_regalones_en === null).length
                    return (
                      <button type="button" key={negocio.id} onClick={() => contactarNegocio(negocio)}>
                        <span><strong>{negocio.nombre}</strong>{pendientes > 0 && <em>{pendientes} nuevos</em>}</span>
                        <small>{negocio.rubro} · {negocio.estado}</small>
                        <small>{conversaciones.length} conversaciones · Contactar</small>
                      </button>
                    )
                  })}
                </div>
              )}
            </aside>

            <div className="soporte-admin__contenido">
              {creando ? (
                <form className="soporte-admin__formulario" onSubmit={crear}>
                  <span>Nuevo contacto</span>
                  <h2>Escribir al comercio</h2>
                  <label>
                    Comercio
                    <select required value={negocioId} onChange={(evento) => { setNegocioId(evento.target.value); setBeneficioId('') }}>
                      <option value="">Selecciona un comercio</option>
                      {negocios.map((negocio) => <option key={negocio.id} value={negocio.id}>{negocio.nombre}</option>)}
                    </select>
                  </label>
                  <label>
                    Beneficio relacionado (opcional)
                    <select value={beneficioId} onChange={(evento) => setBeneficioId(evento.target.value)}>
                      <option value="">Sin beneficio asociado</option>
                      {beneficiosNegocio.map((beneficio) => <option key={beneficio.id} value={beneficio.id}>{beneficio.codigo}</option>)}
                    </select>
                  </label>
                  <label>
                    Tema
                    <select value={categoria} onChange={(evento) => setCategoria(evento.target.value as CategoriaTicket)}>
                      {Object.entries(etiquetasCategoria).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
                    </select>
                  </label>
                  <label>
                    Asunto
                    <input required minLength={5} maxLength={160} value={asunto} onChange={(evento) => setAsunto(evento.target.value)} />
                  </label>
                  <label>
                    Mensaje
                    <textarea required minLength={5} maxLength={4000} rows={6} value={mensajeInicial} onChange={(evento) => setMensajeInicial(evento.target.value)} />
                  </label>
                  <div><button type="button" className="secundario" onClick={() => setCreando(false)}>Cancelar</button><button type="submit" disabled={procesando}>Enviar al comercio</button></div>
                </form>
              ) : !seleccion ? (
                <div className="soporte-admin__vacio"><h2>Selecciona una consulta</h2><p>La conversación aparecerá aquí.</p></div>
              ) : (
                <article className="soporte-admin__conversacion">
                  <header>
                    <div><span>{seleccion.nombre_negocio} · {etiquetasCategoria[seleccion.categoria]}</span><h2>{seleccion.asunto}</h2>{seleccion.codigo_beneficio && <p>Beneficio: {seleccion.codigo_beneficio}</p>}</div>
                    <em className={`estado--${seleccion.estado}`}>{etiquetasEstado[seleccion.estado]}</em>
                  </header>
                  <div className="soporte-admin__estado">
                    <label>Estado<select value={estadoDestino} onChange={(evento) => setEstadoDestino(evento.target.value as EstadoTicket)}>{Object.entries(etiquetasEstado).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}</select></label>
                    <button type="button" disabled={procesando || estadoDestino === seleccion.estado} onClick={() => void guardarEstado()}>Guardar estado</button>
                  </div>
                  <ol>
                    {conversacion.map((mensaje) => (
                      <li key={mensaje.id} className={`origen--${mensaje.origen}`}><strong>{mensaje.origen === 'regalones' ? 'Club Regalones' : seleccion.nombre_negocio}</strong><p>{mensaje.mensaje}</p><time>{formatearFecha(mensaje.creado_en)}</time></li>
                    ))}
                  </ol>
                  {seleccion.estado !== 'cerrado' && (
                    <form onSubmit={responder}><label>Responder al comercio<textarea required minLength={5} maxLength={4000} rows={4} value={respuesta} onChange={(evento) => setRespuesta(evento.target.value)} /></label><button type="submit" disabled={procesando}>Enviar respuesta</button></form>
                  )}
                </article>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default SoporteComercios
