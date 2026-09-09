import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConfiguracionDispositivoNegocio } from './lib/dispositivo'
import type { TurnoAppNegocio } from './lib/cajeros'
import {
  aprobarCompraNegocio,
  corregirMontoNegocio,
  informarMontoNegocio,
  listarSolicitudesNegocio,
  obtenerResumenTurnoNegocio,
  rechazarCompraNegocio,
  solicitarReingresoMontoNegocio,
} from './lib/operaciones-caja'
import type {
  ResumenTurnoNegocio,
  SolicitudCompraNegocio,
} from './lib/operaciones-caja'
import {
  listarCanjesPendientesNegocio,
  type CanjePendienteNegocio,
} from './lib/canjes'
import './operacion-v2.css'
import './solicitudes-v3.css'
import './solicitudes-referencia.css'

type VistaOperacion = 'inicio' | 'solicitudes' | 'escanear' | 'actividad' | 'turno'
type FiltroSolicitudes = 'todas' | 'compras' | 'canjes'

type IconoTipo =
  | 'inicio'
  | 'solicitudes'
  | 'escanear'
  | 'actividad'
  | 'turno'
  | 'qr'
  | 'nfc'
  | 'compra'
  | 'canje'
  | 'check'
  | 'flecha'

function Icono({ tipo }: { tipo: IconoTipo }) {
  const comun = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (tipo === 'inicio') {
    return <svg {...comun}><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></svg>
  }
  if (tipo === 'solicitudes') {
    return <svg {...comun}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>
  }
  if (tipo === 'escanear' || tipo === 'qr') {
    return <svg {...comun}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><rect x="8" y="8" width="3" height="3"/><rect x="13" y="8" width="3" height="3"/><rect x="8" y="13" width="3" height="3"/><path d="M14 14h2v2h-2z"/></svg>
  }
  if (tipo === 'actividad') {
    return <svg {...comun}><path d="M5 20v-6M10 20V9M15 20V4M20 20v-9"/></svg>
  }
  if (tipo === 'turno') {
    return <svg {...comun}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
  }
  if (tipo === 'nfc') {
    return <svg {...comun}><path d="M7 8a6 6 0 0 1 0 8M10 6a9 9 0 0 1 0 12M13 4a12 12 0 0 1 0 16"/></svg>
  }
  if (tipo === 'compra') {
    return <svg {...comun}><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>
  }
  if (tipo === 'canje') {
    return <svg {...comun}><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8v12M3 8h18v-3H3v3Z"/><path d="M12 5c-2.5 0-4-1-4-2.2C8 1.8 9 1 10.2 1 11.7 1 12 3 12 5ZM12 5c2.5 0 4-1 4-2.2C16 1.8 15 1 13.8 1 12.3 1 12 3 12 5Z"/></svg>
  }
  if (tipo === 'check') {
    return <svg {...comun}><path d="m5 12 4 4L19 6"/></svg>
  }
  return <svg {...comun}><path d="m9 18 6-6-6-6"/></svg>
}

function mensajeError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message)
  return 'No pudimos completar la operación. Intenta nuevamente.'
}

function montoVigente(solicitud: SolicitudCompraNegocio) {
  return solicitud.monto_corregido ?? solicitud.monto_informado
}

function formatearMonto(monto: number | null) {
  if (monto === null) return 'Monto pendiente'
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(monto)
}

function formatearHora(fecha: string) {
  return new Date(fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function tiempoRelativo(fecha: string) {
  const diferencia = Math.max(0, Date.now() - new Date(fecha).getTime())
  const minutos = Math.floor(diferencia / 60_000)
  if (minutos < 1) return 'Ahora'
  if (minutos < 60) return `Hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `Hace ${horas} h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'Ayer' : `Hace ${dias} días`
}

function origenSolicitud(solicitud: SolicitudCompraNegocio) {
  if (solicitud.informado_por === 'vecino') return 'Compra enviada por vecino'
  if (solicitud.llavero_id) return 'Compra asistida con llavero'
  return 'Compra asistida'
}

function tituloSolicitud(solicitud: SolicitudCompraNegocio) {
  if (solicitud.informado_por === 'vecino') return 'Compra en local'
  if (solicitud.llavero_id) return 'Compra con llavero'
  return 'Compra asistida'
}

export default function InicioOperativoV2({
  configuracion,
  turno,
  cerrandoTurno,
  alCerrarTurno,
}: {
  configuracion: ConfiguracionDispositivoNegocio
  turno: TurnoAppNegocio
  cerrandoTurno: boolean
  alCerrarTurno: () => Promise<void>
}) {
  const [vista, setVista] = useState<VistaOperacion>('inicio')
  const [filtroSolicitudes, setFiltroSolicitudes] = useState<FiltroSolicitudes>('todas')
  const [solicitudes, setSolicitudes] = useState<SolicitudCompraNegocio[]>([])
  const [canjesPendientes, setCanjesPendientes] =
    useState<CanjePendienteNegocio[]>([])
  const [resumen, setResumen] = useState<ResumenTurnoNegocio | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [seleccionada, setSeleccionada] = useState<SolicitudCompraNegocio | null>(null)
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [procesandoId, setProcesandoId] = useState<string | null>(null)
const cargarDatos = useCallback(async (silencioso = false) => {
    if (!navigator.onLine) {
      setEnLinea(false)
      if (!silencioso) setCargando(false)
      return
    }
    if (!silencioso) setCargando(true)

    try {
      const [
        solicitudesActuales,
        resumenActual,
        canjesActuales,
      ] = await Promise.all([
        listarSolicitudesNegocio(
          configuracion,
          turno.turno_id,
        ),
        obtenerResumenTurnoNegocio(
          configuracion,
          turno.turno_id,
        ),
        listarCanjesPendientesNegocio(
          configuracion,
          turno.turno_id,
        ),
      ])

      setSolicitudes(solicitudesActuales)
      setResumen(resumenActual)
      setCanjesPendientes(canjesActuales)
      setEnLinea(true)
      setError(null)
      setSeleccionada((actual) => {
        if (!actual) return null
        return solicitudesActuales.find((item) => item.id === actual.id) ?? null
      })
    } catch (capturado) {
      setEnLinea(false)
      if (!silencioso) setError(mensajeError(capturado))
    } finally {
      if (!silencioso) setCargando(false)
    }
  }, [configuracion, turno.turno_id])

  useEffect(() => {
    const inicio = window.setTimeout(() => void cargarDatos(false), 0)
    const intervalo = window.setInterval(() => void cargarDatos(true), 2_500)
    const conectar = () => void cargarDatos(true)
    const desconectar = () => setEnLinea(false)
    window.addEventListener('online', conectar)
    window.addEventListener('offline', desconectar)
    return () => {
      window.clearTimeout(inicio)
      window.clearInterval(intervalo)
      window.removeEventListener('online', conectar)
      window.removeEventListener('offline', desconectar)
    }
  }, [cargarDatos])

  useEffect(() => {
    if (!mensaje) return
    const timer = window.setTimeout(() => setMensaje(null), 3_500)
    return () => window.clearTimeout(timer)
  }, [mensaje])

  const abrirVista = (nuevaVista: VistaOperacion) => {
    setSeleccionada(null)
    setError(null)
    setVista(nuevaVista)
  }

  const abrirSolicitud = (solicitud: SolicitudCompraNegocio) => {
    setSeleccionada(solicitud)
    setMonto(montoVigente(solicitud)?.toString() ?? '')
    setMotivo('')
    setError(null)
    setVista('solicitudes')
  }

  const guardarMonto = async () => {
    if (!seleccionada) return
    const valor = Number(monto)
    if (!Number.isInteger(valor) || valor <= 0) {
      setError('Ingresa un monto entero mayor que cero.')
      return
    }

    setProcesandoId(seleccionada.id)
    setError(null)
    try {
      const actual = montoVigente(seleccionada)
      if (actual === null) {
        await informarMontoNegocio(configuracion, turno.turno_id, seleccionada.id, valor)
        setMensaje('Monto informado correctamente.')
      } else if (actual !== valor) {
        await corregirMontoNegocio(
          configuracion,
          turno.turno_id,
          seleccionada.id,
          valor,
          motivo.trim() || 'Corrección antes de aprobación',
        )
        setMensaje('Monto corregido correctamente.')
      }
      await cargarDatos(true)
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const aprobar = async () => {
    if (!seleccionada) return
    const actual = montoVigente(seleccionada)
    const escrito = Number(monto)
    if (actual === null) {
      setError('Primero informa el monto de la compra.')
      return
    }
    if (actual !== escrito) {
      setError('Guarda la Corrección del monto antes de aprobar.')
      return
    }

    setProcesandoId(seleccionada.id)
    setError(null)
    try {
      await aprobarCompraNegocio(configuracion, turno.turno_id, seleccionada.id)
      setMensaje('Compra aprobada. Los REGIS fueron procesados por Club Regalones.')
      setSeleccionada(null)
      setVista('inicio')
      await cargarDatos(true)
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const aprobarRapido = async (solicitud: SolicitudCompraNegocio) => {
    if (!enLinea) return
    if (montoVigente(solicitud) === null) {
      abrirSolicitud(solicitud)
      setError('Primero revisa e informa el monto de la compra.')
      return
    }

    setProcesandoId(solicitud.id)
    setError(null)
    try {
      await aprobarCompraNegocio(configuracion, turno.turno_id, solicitud.id)
      setMensaje('Compra aprobada. Club Regalones procesó los REGIS.')
      await cargarDatos(true)
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const pedirNuevoMonto = async () => {
    if (!seleccionada) return
    if (motivo.trim().length < 3) {
      setError('Escribe por qué necesitas que el vecino ingrese nuevamente el monto.')
      return
    }
    setProcesandoId(seleccionada.id)
    setError(null)
    try {
      await solicitarReingresoMontoNegocio(configuracion, turno.turno_id, seleccionada.id, motivo)
      setMensaje('Se solicitó un nuevo monto al vecino.')
      setSeleccionada(null)
      setVista('inicio')
      await cargarDatos(true)
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const rechazar = async () => {
    if (!seleccionada) return
    if (motivo.trim().length < 3) {
      setError('Escribe un motivo de al menos 3 caracteres.')
      return
    }
    setProcesandoId(seleccionada.id)
    setError(null)
    try {
      await rechazarCompraNegocio(configuracion, turno.turno_id, seleccionada.id, motivo)
      setMensaje('Solicitud rechazada. No se acreditaron REGIS.')
      setSeleccionada(null)
      setVista('inicio')
      await cargarDatos(true)
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const solicitudesVisibles = useMemo(() => solicitudes.slice(0, 2), [solicitudes])

  const solicitudesFiltradas = useMemo(
    () => filtroSolicitudes === 'canjes' ? [] : solicitudes,
    [filtroSolicitudes, solicitudes],
  )

  const mostrarCanjesReales =
    filtroSolicitudes !== 'compras'

  const cantidadComprasVista =
    solicitudes.length

  const cantidadCanjesVista =
    canjesPendientes.length

  const cantidadTodasVista =
    cantidadComprasVista + cantidadCanjesVista

  const procesandoSolicitud =
    seleccionada ? procesandoId === seleccionada.id : false

  return (
    <main className="negocio-shell negocio-v2">
      <header className="negocio-v2__header">
        <div className="negocio-v2__logo" aria-label="Club Regalones" />
        <span className={`negocio-v2__estado ${enLinea ? 'online' : 'offline'}`}>
          <i /> {enLinea ? 'En línea' : 'Sin conexión'}
        </span>
      </header>

      {vista === 'inicio' && (
        <button className="negocio-v2__comercio" type="button" onClick={() => abrirVista('turno')}>
          <span className="negocio-v2__tienda" aria-hidden="true">R</span>
          <div>
            <strong>{configuracion.nombreNegocio}</strong>
            <small>{configuracion.nombreSucursal} · {configuracion.nombreCaja}</small>
          </div>
          <Icono tipo="flecha" />
        </button>
      )}

      {mensaje && <div className="negocio-v2__toast exito">{mensaje}</div>}
      {error && <div className="negocio-v2__toast error">{error}</div>}

      {vista === 'inicio' && (
        <>
          <section className="negocio-v2__hero">
            <div>
              <span>Turno activo</span>
              <h1>Hola, {turno.nombre_cajero}</h1>
              <p>Todo listo para atender a tus vecinos.</p>
            </div>
            <div className="negocio-v2__mascota saludando" aria-hidden="true" />
          </section>

          <button className="negocio-v2__pendientes" type="button" onClick={() => abrirVista('solicitudes')}>
            <div className="negocio-v2__pendientes-titulo">
              <strong>Solicitudes pendientes</strong>
              <span>{cantidadTodasVista}</span>
              <Icono tipo="flecha" />
            </div>
            {cargando ? (
              <p>Buscando solicitudes…</p>
            ) : solicitudesVisibles.length === 0 ? (
              <div className="negocio-v2__todo-dia">
                <span className="negocio-v2__icono-suave"><Icono tipo="solicitudes" /></span>
                <div><strong>¡Todo al día!</strong><small>No hay solicitudes pendientes por el momento.</small></div>
              </div>
            ) : (
              <div className="negocio-v2__mini-solicitudes">
                {solicitudesVisibles.map((solicitud) => (
                  <span key={solicitud.id}>{formatearMonto(montoVigente(solicitud))} · {origenSolicitud(solicitud)}</span>
                ))}
              </div>
            )}
          </button>
        </>
      )}

      {vista === 'solicitudes' && !seleccionada && (
        <section className="negocio-v2__pantalla negocio-v2__solicitudes-v3">
          <div className="negocio-v2__solicitudes-hero">
            <h1>Solicitudes</h1>
            <p>Tus vecinos han realizado solicitudes que están pendientes de revisión.</p>
          </div>

          <div className="negocio-v2__solicitudes-tabs" role="tablist" aria-label="Filtrar solicitudes">
            <button className={filtroSolicitudes === 'todas' ? 'activo' : ''} type="button" onClick={() => setFiltroSolicitudes('todas')}>
              Todas <b>{cantidadTodasVista}</b>
            </button>
            <button className={filtroSolicitudes === 'compras' ? 'activo' : ''} type="button" onClick={() => setFiltroSolicitudes('compras')}>
              <Icono tipo="compra" /> Compras <b>{cantidadComprasVista}</b>
            </button>
            <button className={filtroSolicitudes === 'canjes' ? 'activo' : ''} type="button" onClick={() => setFiltroSolicitudes('canjes')}>
              <Icono tipo="canje" /> Canjes <b>{cantidadCanjesVista}</b>
            </button>
          </div>

          {cargando ? (
            <div className="negocio-v2__solicitudes-vacio"><span><Icono tipo="solicitudes" /></span><strong>Buscando solicitudes…</strong><p>Estamos actualizando las solicitudes pendientes.</p></div>
          ) : solicitudesFiltradas.length === 0 &&
              (!mostrarCanjesReales || canjesPendientes.length === 0) ? (
            <div className="negocio-v2__solicitudes-vacio">
              <span><Icono tipo="check" /></span>
              <strong>¡Todo al día!</strong>
              <p>{filtroSolicitudes === 'canjes' ? 'No hay canjes pendientes en este momento.' : 'No hay solicitudes pendientes por revisar.'}</p>
            </div>
          ) : (
            <div className="negocio-v2__solicitudes-lista">

{mostrarCanjesReales &&
                canjesPendientes.map((canje) => {

                  const inicial =
                    canje.nombre_vecino
                      ?.trim()
                      .charAt(0)
                      .toUpperCase() || 'V'

                  return (
                    <article
                      key={canje.canje_id}
                      className="negocio-v2__solicitud-card solicitud-canje solicitud-canje-real"
                    >

                      <span
                        className="negocio-v2__solicitud-avatar negocio-v2__solicitud-avatar--canje"
                        aria-hidden="true"
                      >
                        {inicial}
                      </span>

                      <div className="negocio-v2__solicitud-contenido">

                        <strong>
                          {canje.nombre_vecino}
                        </strong>

                        <span className="negocio-v2__solicitud-origen">
                          🎁 Canje de beneficio
                        </span>

                        <span className="negocio-v2__solicitud-beneficio">
                          {canje.nombre_beneficio}
                        </span>

                        <small className="negocio-v2__solicitud-regis negocio-v2__solicitud-regis--canje">
                          {canje.costo_regis.toLocaleString('es-CL')} REGIS
                        </small>

                      </div>

                      <div className="negocio-v2__solicitud-lateral">

                        <time dateTime={canje.reservado_en}>
                          {tiempoRelativo(canje.reservado_en)}
                        </time>

                        <em className="negocio-v2__solicitud-estado">
                          Pendiente
                        </em>

                      </div>

                      <button
                        className="negocio-v2__solicitud-revisar negocio-v2__solicitud-revisar--canje"
                        type="button"
                        disabled={!enLinea}
                        onClick={() => {
                          setMensaje(
                            `Canje de ${canje.nombre_vecino} listo para revisar.`
                          )
                        }}
                      >
                        Revisar
                      </button>

                    </article>
                  )
                })}

{solicitudesFiltradas.map((solicitud, indice) => {
                const montoActual = montoVigente(solicitud)
                const procesando = procesandoId === solicitud.id
                return (
                  <article key={solicitud.id} className={`negocio-v2__solicitud-card ${indice === 0 ? 'destacada' : ''}`}>
                    <span
                      className="negocio-v2__solicitud-avatar"
                      aria-hidden="true"
                    >
                      {solicitud.nombre_vecino
                        ?.trim()
                        .charAt(0)
                        .toUpperCase() || 'V'}
                    </span>
                    <div className="negocio-v2__solicitud-contenido">
                      <strong>
                        {solicitud.nombre_vecino?.trim() || 'Vecino'}
                      </strong>
                      <span className="negocio-v2__solicitud-origen">
                        🛒 {tituloSolicitud(solicitud)}
                      </span>
                      <span className="negocio-v2__solicitud-monto">{formatearMonto(montoActual)}</span>
                      <small className="negocio-v2__solicitud-regis">Los REGIS se calculan al aprobar</small>
                    </div>
                    <div className="negocio-v2__solicitud-lateral">
                      <time dateTime={solicitud.creado_en}>{tiempoRelativo(solicitud.creado_en)}</time>
                      <em className="negocio-v2__solicitud-estado">Pendiente</em>
                    </div>

                    {indice === 0 ? (
                      <div className="negocio-v2__solicitud-acciones">
                        <button className="principal" type="button" disabled={procesando || !enLinea} onClick={() => void aprobarRapido(solicitud)}>
                          {procesando ? 'Procesando…' : '✓ Aprobar'}
                        </button>
                        <button type="button" disabled={procesando} onClick={() => abrirSolicitud(solicitud)}>✎ Corregir</button>
                      </div>
                    ) : (
                      <button className="negocio-v2__solicitud-revisar" type="button" disabled={procesando} onClick={() => abrirSolicitud(solicitud)}>Revisar</button>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      
{vista === 'solicitudes' && seleccionada && (
        <section className="negocio-v2__pantalla">
          <button className="negocio-v2__volver" type="button" onClick={() => { setSeleccionada(null); setError(null) }}>← Volver</button>
          <div className="negocio-v2__titulo-pantalla">
            <h1>Revisar compra</h1>
            <p>
              {seleccionada.nombre_vecino?.trim() || 'Vecino'}
              {' · '}
              {origenSolicitud(seleccionada)}
            </p>
          </div>
          <article className="negocio-v2__monto-revision"><small>Monto informado</small><strong>{formatearMonto(montoVigente(seleccionada))}</strong><span>{formatearHora(seleccionada.creado_en)}</span></article>
          <div className="negocio-v2__formulario">
            <label>Monto correcto en CLP<input inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))} placeholder="0" /></label>
            <label>Motivo<textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Ej: el monto no coincide con la caja" /></label>
          </div>
          <div className="negocio-v2__acciones-revision">
            <button className="principal" type="button" disabled={procesandoSolicitud || !enLinea} onClick={() => void aprobar()}>Aprobar compra</button>
            <button type="button" disabled={procesandoSolicitud || !enLinea} onClick={() => void guardarMonto()}>Guardar monto</button>
            <button type="button" disabled={procesandoSolicitud || !enLinea} onClick={() => void pedirNuevoMonto()}>Pedir nuevo monto</button>
            <button className="peligro" type="button" disabled={procesandoSolicitud || !enLinea} onClick={() => void rechazar()}>Rechazar solicitud</button>
          </div>
        </section>
      )}

      {vista === 'escanear' && (
        <section className="negocio-v2__pantalla negocio-v2__escanear">
          <div className="negocio-v2__titulo-pantalla"><h1>Escanear vecino</h1><p>Identifica al vecino para registrar una compra o aprobar un canje.</p></div>
          <div className="negocio-v2__mascota primer-uso" aria-hidden="true" />
          <div className="negocio-v2__metodos">
            <button type="button" onClick={() => setMensaje('Abriremos la cÃ¡mara QR en el siguiente paso de integraciÃ³n.')}><span><Icono tipo="qr" /></span><strong>Escanear QR</strong><small>Usa la cÃ¡mara para leer el cÃ³digo del vecino.</small><Icono tipo="flecha" /></button>
            <button type="button" onClick={() => setMensaje('La lectura del llavero NFC se conectarÃ¡ al mismo flujo de identificaciÃ³n.')}><span className="naranja"><Icono tipo="nfc" /></span><strong>Leer llavero NFC</strong><small>Acerca el llavero al telÃ©fono para leerlo.</small><Icono tipo="flecha" /></button>
          </div>
          <div className="negocio-v2__ayuda"><span>R</span><p>TambiÃ©n puedes usar el llavero o el QR personal del vecino para continuar.</p></div>
        </section>
      )}

      {vista === 'actividad' && (
        <section className="negocio-v2__pantalla">
          <div className="negocio-v2__titulo-pantalla"><h1>Actividad</h1><p>AquÃ­ puedes ver el resumen real de tu turno.</p></div>
          <div className="negocio-v2__metricas">
            <article><span><Icono tipo="compra" /></span><strong>{resumen?.ventas_realizadas ?? 0}</strong><small>Compras aprobadas</small></article>
            <article><span><Icono tipo="canje" /></span><strong>{resumen?.canjes_realizados ?? 0}</strong><small>Canjes realizados</small></article>
            <article><span><Icono tipo="actividad" /></span><strong>{resumen?.regis_acumulados ?? 0}</strong><small>REGIS entregados</small></article>
          </div>
          <div className="negocio-v2__sincronizado"><span><Icono tipo="check" /></span><div><strong>Todo al día</strong><small>{enLinea ? 'Tus datos están sincronizados con Club Regalones.' : 'Volveremos a sincronizar cuando recuperes conexión.'}</small></div></div>
        </section>
      )}

      {vista === 'turno' && (
        <section className="negocio-v2__pantalla">
          <div className="negocio-v2__titulo-pantalla"><h1>Turno</h1><p>Tu jornada, más valor para tu barrio.</p></div>
          <div className="negocio-v2__turno">
            <div className="negocio-v2__turno-cajero"><span>{turno.nombre_cajero.slice(0, 1).toUpperCase()}</span><div><small>Cajero/a</small><strong>{turno.nombre_cajero}</strong></div><em>Activo</em></div>
            <dl><div><dt>Negocio</dt><dd>{configuracion.nombreNegocio}</dd></div><div><dt>Sucursal</dt><dd>{configuracion.nombreSucursal}</dd></div><div><dt>Caja</dt><dd>{configuracion.nombreCaja}</dd></div><div><dt>Inicio de turno</dt><dd>{formatearHora(turno.iniciado_en)}</dd></div></dl>
          </div>
          <div className="negocio-v2__metricas turno"><article><strong>{resumen?.ventas_realizadas ?? 0}</strong><small>Compras</small></article><article><strong>{resumen?.canjes_realizados ?? 0}</strong><small>Canjes</small></article><article><strong>{resumen?.regis_acumulados ?? 0}</strong><small>REGIS</small></article></div>
          <button className="negocio-v2__cerrar-turno" type="button" disabled={cerrandoTurno || !enLinea} onClick={() => void alCerrarTurno()}>{cerrandoTurno ? 'Cerrando turno…' : 'Cerrar turno'}</button>
        </section>
      )}
      <nav className="negocio-v2__nav" aria-label="Navegación App Negocio">
        {([
          ['inicio', 'Inicio', 'inicio'],
          ['solicitudes', 'Solicitudes', 'solicitudes'],
          ['escanear', 'Escanear', 'escanear'],
          ['actividad', 'Actividad', 'actividad'],
          ['turno', 'Turno', 'turno'],
        ] as const).map(([destino, etiqueta, icono]) => (
          <button key={destino} type="button" className={vista === destino ? 'activo' : ''} onClick={() => abrirVista(destino)}>
            <span className={destino === 'solicitudes' ? 'con-badge' : ''}><Icono tipo={icono} />{destino === 'solicitudes' && cantidadTodasVista > 0 && <b>{cantidadTodasVista}</b>}</span>
            <small>{etiqueta}</small>
          </button>
        ))}
      </nav>
    </main>
  )
}
