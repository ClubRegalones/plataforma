import type { Tables } from '@club-regalones/domain'
import { useCallback, useEffect, useMemo, useState } from 'react'
import EnlaceSoporteAdmin from '../../componentes/EnlaceSoporteAdmin'
import { useSesion } from '../../hooks/useSesion'
import {
  listarGestionBeneficios,
  pausarBeneficioPorSupervision,
} from '../../lib/beneficios'
import type {
  BeneficioRegisAdmin,
  RegistroSupervisionBeneficio,
} from '../../lib/beneficios'
import { mensajeSupabase } from '../../lib/mensajesSupabase'
import { supabase } from '../../lib/supabase'
import './BeneficiosAdmin.css'
import './Llaveros.css'

type PerfilAdmin = Pick<Tables<'perfiles'>, 'nombre' | 'rol_plataforma'>

const etiquetasEstado = {
  borrador: 'Borrador',
  activo: 'Publicado',
  pausado: 'Pausado',
  finalizado: 'Finalizado',
} as const

const etiquetasAccion = {
  borrador_creado: 'Borrador creado por el comercio',
  publicado: 'Publicado por el comercio',
  pausado: 'Pausado',
  reactivado: 'Reactivado por el comercio',
  finalizado: 'Finalizado por el comercio',
} as const

function formatearFecha(fecha: string | null) {
  if (!fecha) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(fecha))
}

function formatearPesos(valor: number | null) {
  if (valor === null) return 'No aplica'
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(valor)
}

function describirDescuento(beneficio: BeneficioRegisAdmin) {
  const version = beneficio.version_actual
  if (!version) return 'Sin condiciones'
  if (version.tipo === 'monto_fijo') {
    return `${formatearPesos(version.monto_descuento_fijo_clp)} de descuento`
  }

  return `${(version.porcentaje_descuento_bp ?? 0) / 100}% de descuento · tope ${formatearPesos(version.tope_descuento_clp)}`
}

function GestionBeneficios() {
  const { sesion, cargando: cargandoSesion } = useSesion()
  const [perfil, setPerfil] = useState<PerfilAdmin | null>(null)
  const [beneficios, setBeneficios] = useState<BeneficioRegisAdmin[]>([])
  const [registro, setRegistro] = useState<RegistroSupervisionBeneficio[]>([])
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [motivoPausa, setMotivoPausa] = useState('')
  const [cargandoDatos, setCargandoDatos] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const seleccion = useMemo(
    () => beneficios.find(({ id }) => id === seleccionId) ?? beneficios[0] ?? null,
    [beneficios, seleccionId],
  )

  const beneficiosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase('es-CL')
    return beneficios.filter((beneficio) => {
      const coincideTexto =
        !texto ||
        [
          beneficio.codigo,
          beneficio.nombre_negocio,
          beneficio.version_actual?.nombre ?? '',
        ].some((valor) => valor.toLocaleLowerCase('es-CL').includes(texto))
      const coincideEstado =
        filtroEstado === 'todos' ||
        beneficio.version_actual?.estado === filtroEstado
      return coincideTexto && coincideEstado
    })
  }, [beneficios, busqueda, filtroEstado])

  const cargarSupervision = useCallback(async () => {
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

      const gestion = await listarGestionBeneficios()
      setBeneficios(gestion.beneficios)
      setRegistro(gestion.registro)
      setSeleccionId((actual) =>
        gestion.beneficios.some(({ id }) => id === actual)
          ? actual
          : (gestion.beneficios[0]?.id ?? null),
      )
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setCargandoDatos(false)
    }
  }, [sesion])

  useEffect(() => {
    const inicio = window.setTimeout(() => void cargarSupervision(), 0)
    return () => window.clearTimeout(inicio)
  }, [cargarSupervision])

  const pausar = async () => {
    const version = seleccion?.version_actual
    if (!version || version.estado !== 'activo') return
    if (motivoPausa.trim().length < 3) {
      setError('Explica el motivo de supervisión con al menos 3 caracteres.')
      return
    }

    setProcesando(true)
    setError(null)
    setMensaje(null)
    try {
      await pausarBeneficioPorSupervision(version.id, motivoPausa.trim())
      setMensaje(
        'Beneficio pausado por supervisión. El comercio verá el motivo en su historial.',
      )
      setMotivoPausa('')
      await cargarSupervision()
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

  const publicados = beneficios.filter(
    ({ version_actual }) => version_actual?.estado === 'activo',
  ).length
  const pausados = beneficios.filter(
    ({ version_actual }) => version_actual?.estado === 'pausado',
  ).length
  const eventosSeleccion = registro.filter(
    ({ beneficio_id }) => beneficio_id === seleccion?.id,
  )

  return (
    <main className="llaveros beneficios-admin">
      <header className="llaveros__barra">
        <a className="llaveros__marca" href="#inicio">Club Regalones</a>
        <nav aria-label="Acciones administrativas">
          {perfil?.rol_plataforma === 'admin_regalones' && (
            <EnlaceSoporteAdmin />
          )}
          <a href="#administrar-llaveros">Llaveros</a>
          <a href="#mis-regis">Mis REGIS</a>
          {sesion && <button type="button" onClick={() => void cerrarSesion()}>Cerrar sesión</button>}
        </nav>
      </header>

      <section className="llaveros__encabezado">
        <span>Supervisión Regalones</span>
        <h1>Beneficios publicados</h1>
        <p>
          Cada comercio crea y publica sus propios beneficios. Aquí Regalones
          revisa las condiciones y puede pausar una publicación si detecta
          errores, abuso o información engañosa.
        </p>
      </section>

      {cargandoSesion ? (
        <p className="llaveros__aviso">Comprobando tu sesión…</p>
      ) : !sesion ? (
        <section className="llaveros__aviso llaveros__aviso--centrado">
          <h2>Acceso administrativo</h2>
          <p>Debes iniciar sesión con una cuenta autorizada.</p>
          <a href="#iniciar-sesion?continuar=administrar-beneficios">Iniciar sesión</a>
        </section>
      ) : cargandoDatos && !perfil ? (
        <p className="llaveros__aviso">Cargando permisos…</p>
      ) : perfil?.rol_plataforma !== 'admin_regalones' ? (
        <section className="llaveros__aviso llaveros__aviso--centrado">
          <h2>No tienes acceso a esta sección</h2>
          <p>Solo la administración de Regalones puede supervisar publicaciones.</p>
          <a href="#mis-regis">Volver a Mis REGIS</a>
        </section>
      ) : (
        <div className="llaveros__contenido">
          {(error || mensaje) && (
            <div
              className={`llaveros__mensaje ${error ? 'llaveros__mensaje--error' : ''}`}
              role="status"
              aria-live="polite"
            >
              {error ?? mensaje}
            </div>
          )}

          <section className="beneficios-admin__metricas" aria-label="Resumen">
            <article><span>Registrados</span><strong>{beneficios.length}</strong></article>
            <article><span>Publicados</span><strong>{publicados}</strong></article>
            <article><span>Pausados</span><strong>{pausados}</strong></article>
          </section>

          <section className="beneficios-admin__panel">
            <aside className="beneficios-admin__listado">
              <div className="beneficios-admin__filtros">
                <label>
                  Buscar
                  <input type="search" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Beneficio, comercio o código" />
                </label>
                <label>
                  Estado
                  <select value={filtroEstado} onChange={(evento) => setFiltroEstado(evento.target.value)}>
                    <option value="todos">Todos</option>
                    <option value="activo">Publicados</option>
                    <option value="pausado">Pausados</option>
                    <option value="borrador">Borradores</option>
                    <option value="finalizado">Finalizados</option>
                  </select>
                </label>
              </div>

              <div className="beneficios-admin__tarjetas">
                {cargandoDatos && beneficios.length === 0 ? (
                  <p className="beneficios-admin__vacio">Cargando beneficios…</p>
                ) : beneficiosFiltrados.length === 0 ? (
                  <div className="beneficios-admin__vacio">
                    <strong>No hay resultados</strong>
                    <span>Los beneficios publicados por comercios aparecerán aquí.</span>
                  </div>
                ) : beneficiosFiltrados.map((beneficio) => {
                  const version = beneficio.version_actual
                  return (
                    <button
                      type="button"
                      key={beneficio.id}
                      className={seleccion?.id === beneficio.id ? 'seleccionado' : ''}
                      onClick={() => {
                        setSeleccionId(beneficio.id)
                        setMotivoPausa('')
                        setError(null)
                        setMensaje(null)
                      }}
                    >
                      <span className="beneficios-admin__tarjeta-superior">
                        <small>{beneficio.nombre_negocio}</small>
                        {version && <em className={`estado--${version.estado}`}>{etiquetasEstado[version.estado]}</em>}
                      </span>
                      <strong>{version?.nombre ?? beneficio.codigo}</strong>
                      <span>{version ? `${version.costo_regis} REGIS · versión ${version.version}` : 'Sin versiones'}</span>
                    </button>
                  )
                })}
              </div>
            </aside>

            <article className="beneficios-admin__detalle">
              {!seleccion?.version_actual ? (
                <div className="beneficios-admin__vacio">
                  <strong>Selecciona un beneficio</strong>
                  <span>Podrás revisar sus reglas y el historial de supervisión.</span>
                </div>
              ) : (
                <>
                  <header className="beneficios-admin__detalle-cabecera">
                    <div>
                      <span>{seleccion.nombre_negocio}</span>
                      <h2>{seleccion.version_actual.nombre}</h2>
                      <p>{seleccion.version_actual.descripcion ?? 'Sin descripción pública.'}</p>
                    </div>
                    <em className={`estado--${seleccion.version_actual.estado}`}>{etiquetasEstado[seleccion.version_actual.estado]}</em>
                  </header>

                  <a
                    className="beneficios-admin__contactar"
                    href={`#soporte-comercios?negocio=${seleccion.negocio_id}&beneficio=${seleccion.id}`}
                  >
                    Contactar al comercio sobre este beneficio
                  </a>

                  <section className="beneficios-admin__condiciones" aria-label="Condiciones">
                    <div><span>Costo</span><strong>{seleccion.version_actual.costo_regis} REGIS</strong></div>
                    <div><span>Beneficio</span><strong>{describirDescuento(seleccion)}</strong></div>
                    <div><span>Compra mínima</span><strong>{formatearPesos(seleccion.version_actual.compra_minima_clp)}</strong></div>
                    <div><span>Cupos</span><strong>{seleccion.version_actual.cupos_totales ?? 'Sin límite'}</strong></div>
                    <div><span>Límite por vecino</span><strong>{seleccion.version_actual.limite_por_vecino}</strong></div>
                    <div><span>Vigencia</span><strong>{formatearFecha(seleccion.version_actual.vigencia_desde)} — {seleccion.version_actual.vigencia_hasta ? formatearFecha(seleccion.version_actual.vigencia_hasta) : 'sin cierre'}</strong></div>
                  </section>

                  {seleccion.version_actual.estado === 'activo' && (
                    <section className="beneficios-admin__supervision">
                      <div>
                        <h3>Pausar por supervisión</h3>
                        <p>Úsalo solo ante errores, abuso o condiciones engañosas. El motivo quedará registrado para el comercio.</p>
                      </div>
                      <label>
                        Motivo obligatorio
                        <textarea minLength={3} maxLength={500} value={motivoPausa} onChange={(evento) => setMotivoPausa(evento.target.value)} placeholder="Describe el problema detectado" />
                      </label>
                      <button type="button" disabled={procesando} onClick={() => void pausar()}>Pausar beneficio</button>
                    </section>
                  )}

                  <section className="beneficios-admin__historial-supervision">
                    <h3>Registro de publicación y supervisión</h3>
                    {eventosSeleccion.length === 0 ? (
                      <p>No hay eventos registrados.</p>
                    ) : (
                      <ol>
                        {eventosSeleccion.map((evento) => (
                          <li key={evento.id}>
                            <div><strong>{etiquetasAccion[evento.accion]}</strong><time>{formatearFecha(evento.creado_en)}</time></div>
                            {evento.motivo && <p>{evento.motivo}</p>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>

                  <details className="beneficios-admin__versiones">
                    <summary>Ver todas las versiones ({seleccion.versiones.length})</summary>
                    <ol>
                      {seleccion.versiones.map((version) => (
                        <li key={version.id}>
                          <strong>Versión {version.version} · {etiquetasEstado[version.estado]}</strong>
                          <span>{version.costo_regis} REGIS · creada {formatearFecha(version.creado_en)}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                </>
              )}
            </article>
          </section>
        </div>
      )}
    </main>
  )
}

export default GestionBeneficios
