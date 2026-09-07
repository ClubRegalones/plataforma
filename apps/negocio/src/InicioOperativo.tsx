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
import './operacion.css'

type VistaOperacion = 'inicio' | 'solicitudes' | 'actividad' | 'turno'

function mensajeError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message)
  }
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
  return new Date(fecha).toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function origenSolicitud(solicitud: SolicitudCompraNegocio) {
  if (solicitud.informado_por === 'vecino') return 'Enviada por el vecino'
  if (solicitud.llavero_id) return 'Compra asistida por NFC'
  return 'Compra asistida'
}

export default function InicioOperativo({
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
  const [solicitudes, setSolicitudes] = useState<SolicitudCompraNegocio[]>([])
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
      const [solicitudesActuales, resumenActual] = await Promise.all([
        listarSolicitudesNegocio(configuracion, turno.turno_id),
        obtenerResumenTurnoNegocio(configuracion, turno.turno_id),
      ])

      setSolicitudes(solicitudesActuales)
      setResumen(resumenActual)
      setEnLinea(true)
      setError(null)

      setSeleccionada((actual) => {
        if (!actual) return null
        const actualizada = solicitudesActuales.find((item) => item.id === actual.id) ?? null
        if (!actualizada) return null
        return actualizada
      })
    } catch (capturado) {
      setEnLinea(false)
      if (!silencioso) setError(mensajeError(capturado))
    } finally {
      if (!silencioso) setCargando(false)
    }
  }, [configuracion, turno.turno_id])

  useEffect(() => {
    const inicio = window.setTimeout(() => {
      void cargarDatos(false)
    }, 0)

    const intervalo = window.setInterval(() => {
      void cargarDatos(true)
    }, 2_500)

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
    const temporizador = window.setTimeout(() => setMensaje(null), 3_500)
    return () => window.clearTimeout(temporizador)
  }, [mensaje])

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

    const actual = montoVigente(seleccionada)
    setProcesandoId(seleccionada.id)
    setError(null)

    try {
      if (actual === null) {
        await informarMontoNegocio(
          configuracion,
          turno.turno_id,
          seleccionada.id,
          valor,
        )
        setMensaje('Monto informado correctamente.')
      } else {
        if (actual === valor) {
          setMensaje('El monto ya coincide con la solicitud.')
          return
        }

        await corregirMontoNegocio(
          configuracion,
          turno.turno_id,
          seleccionada.id,
          valor,
          motivo.trim() || 'Corrección antes de aprobación',
        )
        setMensaje('Monto corregido. Revisa antes de aprobar.')
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
      setError('Guardaste un monto distinto. Guarda la corrección antes de aprobar.')
      return
    }

    setProcesandoId(seleccionada.id)
    setError(null)

    try {
      await aprobarCompraNegocio(configuracion, turno.turno_id, seleccionada.id)
      setMensaje('Compra aprobada y REGIS procesados por Club Regalones.')
      setSeleccionada(null)
      setMonto('')
      setMotivo('')
      setVista('inicio')
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
      await solicitarReingresoMontoNegocio(
        configuracion,
        turno.turno_id,
        seleccionada.id,
        motivo,
      )
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
      await rechazarCompraNegocio(
        configuracion,
        turno.turno_id,
        seleccionada.id,
        motivo,
      )
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

  const solicitudesVisibles = useMemo(() => solicitudes.slice(0, 3), [solicitudes])
  const procesandoSolicitud = seleccionada ? procesandoId === seleccionada.id : false

  return (
    <main className="negocio-shell negocio-operacion-shell">
      <header className="negocio-operacion-header">
        <div className="negocio-operacion-logo" aria-label="Club Regalones" />
        <span className={enLinea ? 'negocio-estado negocio-estado--online' : 'negocio-estado negocio-estado--offline'}>
          <i /> {enLinea ? 'En línea' : 'Sin conexión'}
        </span>
      </header>

      <section className="negocio-operacion-contexto">
        <div>
          <span>{configuracion.nombreNegocio}</span>
          <small>{configuracion.nombreSucursal} · {configuracion.nombreCaja}</small>
        </div>
        <button type="button" onClick={() => setVista('turno')}>Turno</button>
      </section>

      {mensaje && <div className="negocio-toast negocio-toast--exito">{mensaje}</div>}
      {error && <div className="negocio-toast negocio-toast--error">{error}</div>}

      {vista === 'inicio' && (
        <>
          <section className="negocio-bienvenida">
            <div>
              <span className="negocio-eyebrow">Turno activo</span>
              <h1>Hola, {turno.nombre_cajero} 👋</h1>
              <p>Todo listo para atender a tus vecinos.</p>
            </div>
            <div className="negocio-bienvenida__regalon" aria-hidden="true" />
          </section>

          <section className="negocio-seccion">
            <div className="negocio-seccion__titulo">
              <div>
                <h2>Solicitudes pendientes</h2>
                <p>{solicitudes.length === 0 ? 'No hay vecinos esperando.' : 'Revisa antes de aprobar.'}</p>
              </div>
              <span className="negocio-badge">{solicitudes.length}</span>
            </div>

            {cargando ? (
              <div className="negocio-vacio-app">Buscando solicitudes…</div>
            ) : solicitudesVisibles.length === 0 ? (
              <div className="negocio-vacio-app negocio-vacio-app--regalon">
                <strong>Todo al día</strong>
                <span>Las nuevas solicitudes aparecerán aquí automáticamente.</span>
              </div>
            ) : (
              <div className="negocio-solicitudes-home">
                {solicitudesVisibles.map((solicitud) => (
                  <button key={solicitud.id} type="button" onClick={() => abrirSolicitud(solicitud)}>
                    <span className="negocio-solicitud-icono" aria-hidden="true">$</span>
                    <div>
                      <strong>{formatearMonto(montoVigente(solicitud))}</strong>
                      <small>{origenSolicitud(solicitud)} · {formatearHora(solicitud.creado_en)}</small>
                    </div>
                    <span className="negocio-solicitud-flecha">›</span>
                  </button>
                ))}
                {solicitudes.length > 3 && (
                  <button className="negocio-ver-todas" type="button" onClick={() => setVista('solicitudes')}>
                    Ver todas las solicitudes
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="negocio-seccion">
            <div className="negocio-seccion__titulo">
              <div>
                <h2>Acciones rápidas</h2>
                <p>Las herramientas principales de tu caja.</p>
              </div>
            </div>

            <div className="negocio-acciones-rapidas">
              <button type="button" onClick={() => setVista('solicitudes')}>
                <span>✓</span><strong>Solicitudes</strong><small>Revisar compras</small>
              </button>
              <button type="button" className="proximamente" disabled>
                <span>▣</span><strong>Escanear QR</strong><small>Siguiente bloque</small>
              </button>
              <button type="button" className="proximamente" disabled>
                <span>＋</span><strong>Compra asistida</strong><small>Siguiente bloque</small>
              </button>
              <button type="button" className="proximamente" disabled>
                <span>R</span><strong>Canjes</strong><small>Siguiente bloque</small>
              </button>
            </div>
          </section>

          <section className="negocio-seccion negocio-resumen-hoy">
            <div className="negocio-seccion__titulo">
              <div>
                <h2>Hoy</h2>
                <p>Resumen real del turno.</p>
              </div>
              <button className="negocio-link" type="button" onClick={() => setVista('actividad')}>Ver actividad</button>
            </div>
            <div className="negocio-metricas-app">
              <article><span>Compras</span><strong>{resumen?.ventas_realizadas ?? 0}</strong></article>
              <article><span>Canjes</span><strong>{resumen?.canjes_realizados ?? 0}</strong></article>
              <article><span>REGIS</span><strong>{resumen?.regis_acumulados ?? 0}</strong></article>
            </div>
          </section>
        </>
      )}

      {vista === 'solicitudes' && !seleccionada && (
        <section className="negocio-pantalla-app">
          <div className="negocio-pantalla-app__cabecera">
            <button type="button" onClick={() => setVista('inicio')}>←</button>
            <div><span className="negocio-eyebrow">Compras</span><h1>Solicitudes</h1></div>
            <span className="negocio-badge">{solicitudes.length}</span>
          </div>

          {solicitudes.length === 0 ? (
            <div className="negocio-vacio-app negocio-vacio-app--grande">
              <strong>No hay solicitudes pendientes</strong>
              <span>Cuando un vecino envíe una compra, aparecerá automáticamente.</span>
            </div>
          ) : (
            <div className="negocio-lista-solicitudes">
              {solicitudes.map((solicitud) => (
                <button key={solicitud.id} type="button" onClick={() => abrirSolicitud(solicitud)}>
                  <div className="negocio-lista-solicitudes__arriba">
                    <span>{origenSolicitud(solicitud)}</span>
                    <small>{formatearHora(solicitud.creado_en)}</small>
                  </div>
                  <strong>{formatearMonto(montoVigente(solicitud))}</strong>
                  <div className="negocio-lista-solicitudes__abajo">
                    <span>Pendiente de validación</span><b>Revisar →</b>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {vista === 'solicitudes' && seleccionada && (
        <section className="negocio-pantalla-app negocio-revision-app">
          <div className="negocio-pantalla-app__cabecera">
            <button type="button" onClick={() => { setSeleccionada(null); setError(null) }}>←</button>
            <div><span className="negocio-eyebrow">Solicitud</span><h1>Revisar compra</h1></div>
          </div>

          <article className="negocio-revision-monto">
            <span>Monto informado</span>
            <strong>{formatearMonto(montoVigente(seleccionada))}</strong>
            <small>{origenSolicitud(seleccionada)} · {formatearHora(seleccionada.creado_en)}</small>
          </article>

          <div className="negocio-form negocio-form--revision">
            <label>
              Monto correcto en CLP
              <div className="negocio-input-pesos">
                <span>$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={monto}
                  onChange={(evento) => setMonto(evento.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                />
              </div>
            </label>
            <label>
              Motivo <small>para corregir, pedir nuevo monto o rechazar</small>
              <textarea
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                maxLength={500}
                placeholder="Ej: el monto no coincide con la caja"
              />
            </label>
          </div>

          <div className="negocio-revision-acciones">
            <button className="principal" type="button" disabled={procesandoSolicitud || !enLinea} onClick={() => void aprobar()}>
              ✓ Aprobar compra
            </button>
            <button type="button" disabled={procesandoSolicitud || !enLinea} onClick={() => void guardarMonto()}>
              Guardar monto
            </button>
            <button type="button" disabled={procesandoSolicitud || !enLinea} onClick={() => void pedirNuevoMonto()}>
              Pedir nuevo monto
            </button>
            <button className="peligro" type="button" disabled={procesandoSolicitud || !enLinea} onClick={() => void rechazar()}>
              Rechazar solicitud
            </button>
          </div>

          <p className="negocio-nota-seguridad">✓ Los REGIS se calculan y acreditan con la misma lógica segura de la Terminal al aprobar.</p>
        </section>
      )}

      {vista === 'actividad' && (
        <section className="negocio-pantalla-app">
          <div className="negocio-pantalla-app__cabecera">
            <button type="button" onClick={() => setVista('inicio')}>←</button>
            <div><span className="negocio-eyebrow">Turno</span><h1>Actividad de hoy</h1></div>
          </div>

          <div className="negocio-actividad-hero">
            <span>Desde las {formatearHora(turno.iniciado_en)}</span>
            <strong>{resumen?.ventas_realizadas ?? 0} compras realizadas</strong>
          </div>

          <div className="negocio-metricas-app negocio-metricas-app--vertical">
            <article><span>Compras aprobadas</span><strong>{resumen?.ventas_realizadas ?? 0}</strong></article>
            <article><span>REGIS acumulados</span><strong>{resumen?.regis_acumulados ?? 0}</strong></article>
            <article><span>Canjes realizados</span><strong>{resumen?.canjes_realizados ?? 0}</strong></article>
          </div>
        </section>
      )}

      {vista === 'turno' && (
        <section className="negocio-pantalla-app">
          <div className="negocio-pantalla-app__cabecera">
            <button type="button" onClick={() => setVista('inicio')}>←</button>
            <div><span className="negocio-eyebrow">Caja Regalones</span><h1>Tu turno</h1></div>
          </div>

          <div className="negocio-turno-ficha">
            <div><span>Cajero/a</span><strong>{turno.nombre_cajero}</strong></div>
            <div><span>Sucursal</span><strong>{configuracion.nombreSucursal}</strong></div>
            <div><span>Caja</span><strong>{configuracion.nombreCaja}</strong></div>
            <div><span>Inicio</span><strong>{formatearHora(turno.iniciado_en)}</strong></div>
          </div>

          <button className="negocio-cerrar-turno-app" type="button" disabled={cerrandoTurno || !enLinea} onClick={() => void alCerrarTurno()}>
            {cerrandoTurno ? 'Cerrando turno…' : 'Cerrar turno'}
          </button>
        </section>
      )}

      <nav className="negocio-nav-inferior" aria-label="Navegación App Negocio">
        <button type="button" className={vista === 'inicio' ? 'activo' : ''} onClick={() => { setSeleccionada(null); setVista('inicio') }}>
          <span>⌂</span><small>Inicio</small>
        </button>
        <button type="button" className={vista === 'solicitudes' ? 'activo' : ''} onClick={() => { setSeleccionada(null); setVista('solicitudes') }}>
          <span className="negocio-nav-icono-badge">✓{solicitudes.length > 0 && <b>{solicitudes.length}</b>}</span><small>Solicitudes</small>
        </button>
        <button type="button" className={vista === 'actividad' ? 'activo' : ''} onClick={() => { setSeleccionada(null); setVista('actividad') }}>
          <span>◴</span><small>Actividad</small>
        </button>
        <button type="button" className={vista === 'turno' ? 'activo' : ''} onClick={() => { setSeleccionada(null); setVista('turno') }}>
          <span>●</span><small>Turno</small>
        </button>
      </nav>
    </main>
  )
}
