import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
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
  confirmarCanjeNegocio,
  listarCanjesPendientesNegocio,
  type CanjePendienteNegocio,
} from './lib/canjes'
import './operacion-v2.css'
import './solicitudes-v3.css'
import './solicitudes-referencia.css'
import './canjes-v1.css'
import './canje-confirmado-v1.css'
import EscanerQrNegocio from './EscanerQrNegocio'

type VistaOperacion = 'inicio' | 'solicitudes' | 'escanear' | 'actividad' | 'turno'
type FiltroSolicitudes = 'todas' | 'compras' | 'canjes'
type FlujoCompra = 'lista' | 'confirmar' | 'corregir' | 'aprobada'

type ResultadoCompraAprobada = {
  solicitud: SolicitudCompraNegocio
  compra: NonNullable<
    Awaited<ReturnType<typeof aprobarCompraNegocio>>
  >
}

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
  | 'editar'
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
  if (tipo === 'editar') {
    return (
      <svg {...comun}>
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
      </svg>
    )
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
  const [flujoCompra, setFlujoCompra] =
    useState<FlujoCompra>('lista')
  const [solicitudConfirmacion, setSolicitudConfirmacion] =
    useState<SolicitudCompraNegocio | null>(null)
  const [resultadoCompra, setResultadoCompra] =
    useState<ResultadoCompraAprobada | null>(null)

  const [rechazoAbierto, setRechazoAbierto] =
    useState(false)

  const [solicitudRechazo, setSolicitudRechazo] =
    useState<SolicitudCompraNegocio | null>(null)

  const [motivoRechazo, setMotivoRechazo] =
    useState('')

  const [canjeSeleccionado, setCanjeSeleccionado] =
    useState<CanjePendienteNegocio | null>(null)

  const [montoCanje, setMontoCanje] =
    useState('')


  const [canjeEscaneo, setCanjeEscaneo] =
    useState<CanjePendienteNegocio | null>(null)

  const [tokenQrCanje, setTokenQrCanje] =
    useState<{
      canjeId: string
      token: string
    } | null>(null)
  const [resultadoCanjeConfirmado, setResultadoCanjeConfirmado] =
    useState<{
      canje: CanjePendienteNegocio
      resultado: NonNullable<
        Awaited<ReturnType<typeof confirmarCanjeNegocio>>
      >
    } | null>(null)

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

      setCanjeSeleccionado((actual) => {
        if (!actual) return null

        return (
          canjesActuales.find(
            (item) =>
              item.canje_id === actual.canje_id,
          ) ?? null
        )
      })

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
    setSolicitudConfirmacion(null)
    setResultadoCompra(null)
    setResultadoCanjeConfirmado(null)
    setRechazoAbierto(false)
    setSolicitudRechazo(null)
    setMotivoRechazo('')
    setCanjeSeleccionado(null)
    setCanjeEscaneo(null)
    setTokenQrCanje(null)
    setCanjeEscaneo(null)
    setMontoCanje('')
    setFlujoCompra('lista')
    setError(null)
    setVista(nuevaVista)
  }

  const abrirCanje = (
    canje: CanjePendienteNegocio,
    tokenQr?: string,
  ) => {
    setSeleccionada(null)
    setSolicitudConfirmacion(null)
    setResultadoCompra(null)
    setResultadoCanjeConfirmado(null)

    setCanjeSeleccionado(canje)
    setCanjeEscaneo(null)

    setTokenQrCanje(
      tokenQr
        ? {
            canjeId: canje.canje_id,
            token: tokenQr,
          }
        : null,
    )

    setMontoCanje('')
    setError(null)
    setMensaje(null)
    setFlujoCompra('lista')
    setVista('solicitudes')
  }

  const continuarCanjeAlEscaneo = () => {
    if (!canjeSeleccionado) return

    const valor = Number(montoCanje)

    if (!Number.isInteger(valor) || valor <= 0) {
      setError(
        'Ingresa el monto total de la compra.',
      )
      return
    }

    if (
      valor <
      canjeSeleccionado.compra_minima_clp
    ) {
      setError(
        `La compra debe ser de al menos ${formatearMonto(
          canjeSeleccionado.compra_minima_clp,
        )} para usar este beneficio.`,
      )
      return
    }

    setError(null)

    if (canjeSeleccionado.origen === 'qr') {
      const qrYaLeido =
        tokenQrCanje?.canjeId ===
        canjeSeleccionado.canje_id

      if (qrYaLeido) {
        void confirmarCanjeActual()
        return
      }

      setCanjeEscaneo(canjeSeleccionado)
      setVista('escanear')
      return
    }

    void confirmarCanjeActual()
  }

  const confirmarCanjeActual = async () => {
    if (!canjeSeleccionado) return
    if (procesandoId === canjeSeleccionado.canje_id) return

    const valor = Number(montoCanje)

    if (
      !Number.isInteger(valor) ||
      valor <= 0
    ) {
      setError(
        'Ingresa un monto valido para la compra.',
      )
      return
    }

    if (
      valor <
      canjeSeleccionado.compra_minima_clp
    ) {
      setError(
        `La compra debe ser de al menos ${formatearMonto(
          canjeSeleccionado.compra_minima_clp,
        )}.`,
      )
      return
    }

    if (
      canjeSeleccionado.origen === 'qr' &&
      (
        !tokenQrCanje ||
        tokenQrCanje.canjeId !==
          canjeSeleccionado.canje_id
      )
    ) {
      setError(
        'Debes escanear el QR del canje antes de confirmarlo.',
      )
      return
    }

    const canjeActual =
      canjeSeleccionado

    setProcesandoId(canjeActual.canje_id)
    setError(null)

    try {
      const resultado =
        await confirmarCanjeNegocio(
          configuracion,
          turno.turno_id,
          canjeActual.canje_id,
          valor,
          '',
          tokenQrCanje?.token,
        )

      if (!resultado) {
        throw new Error(
          'Club Regalones no devolvio el resultado del canje.',
        )
      }

      setResultadoCanjeConfirmado({
        canje: canjeActual,
        resultado,
      })

      setCanjeSeleccionado(null)
      setCanjeEscaneo(null)
      setTokenQrCanje(null)
      setMontoCanje('')
      setMensaje(null)

      await cargarDatos(true)

      setVista('solicitudes')
    } catch (capturado) {
      setError(
        mensajeError(capturado),
      )
    } finally {
      setProcesandoId(null)
    }
  }

  const abrirSolicitud = (solicitud: SolicitudCompraNegocio) => {
    setSolicitudConfirmacion(null)
    setResultadoCompra(null)
    setFlujoCompra('lista')
    setSeleccionada(solicitud)
    setMonto(montoVigente(solicitud)?.toString() ?? '')
    setMotivo('')
    setError(null)
    setVista('solicitudes')
  }

  const abrirConfirmacion = (
    solicitud: SolicitudCompraNegocio,
  ) => {
    const actual = montoVigente(solicitud)

    if (actual === null) {
      setError('Esta solicitud todavía no tiene un monto informado.')
      return
    }

    setSeleccionada(null)
    setResultadoCompra(null)
    setSolicitudConfirmacion(solicitud)
    setMonto(actual.toString())
    setMotivo('')
    setError(null)
    setFlujoCompra('confirmar')
    setVista('solicitudes')
  }

  const abrirCorreccion = (
    solicitud: SolicitudCompraNegocio,
  ) => {
    const actual = montoVigente(solicitud)

    if (actual === null) {
      setError(
        'Esta solicitud todavía no tiene un monto para corregir.',
      )
      return
    }

    setSolicitudConfirmacion(null)
    setResultadoCompra(null)
    setSeleccionada(solicitud)
    setMonto(actual.toString())
    setMotivo('')
    setError(null)
    setFlujoCompra('corregir')
    setVista('solicitudes')
  }

  const abrirRechazo = (
    solicitud: SolicitudCompraNegocio,
  ) => {
    setSolicitudRechazo(solicitud)
    setMotivoRechazo('')
    setError(null)
    setRechazoAbierto(true)
  }

  const abrirConfirmacionDesdeRevision = () => {
    if (!seleccionada) return

    const actual = montoVigente(seleccionada)
    const escrito = Number(monto)

    if (actual === null) {
      setError('Primero informa el monto de la compra.')
      return
    }

    if (actual !== escrito) {
      setError(
        'Guarda la corrección del monto antes de aprobar.',
      )
      return
    }

    abrirConfirmacion(seleccionada)
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

  const confirmarCompra = async () => {
    if (!solicitudConfirmacion) return

    const solicitud = solicitudConfirmacion
    const actual = montoVigente(solicitud)

    if (actual === null) {
      setError('La solicitud no tiene un monto para aprobar.')
      return
    }

    setProcesandoId(solicitud.id)
    setError(null)

    try {
      const compra = await aprobarCompraNegocio(
        configuracion,
        turno.turno_id,
        solicitud.id,
      )

      if (!compra) {
        throw new Error(
          'Club Regalones no devolvió la compra aprobada.',
        )
      }

      setResultadoCompra({
        solicitud,
        compra,
      })

      setSolicitudConfirmacion(null)
      setSeleccionada(null)
      setFlujoCompra('aprobada')
      setMensaje(null)

      await cargarDatos(true)
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const guardarCorreccion = async () => {
    if (!seleccionada || !enLinea) return

    const valor = Number(monto)
    const actual = montoVigente(seleccionada)

    if (!Number.isInteger(valor) || valor <= 0) {
      setError('Ingresa un monto válido mayor a $0.')
      return
    }

    if (actual === null) {
      setError(
        'La solicitud no tiene un monto original para corregir.',
      )
      return
    }

    if (actual === valor) {
      setError(
        'Ingresa un monto distinto al informado originalmente.',
      )
      return
    }

    setProcesandoId(seleccionada.id)
    setError(null)

    try {
      await corregirMontoNegocio(
        configuracion,
        turno.turno_id,
        seleccionada.id,
        valor,
        'Corrección antes de aprobación',
      )

      setMensaje(
        `Monto corregido correctamente a ${formatearMonto(valor)}.`,
      )

      setSeleccionada(null)
      setFlujoCompra('lista')

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

  const confirmarRechazo = async () => {
    if (!solicitudRechazo || !enLinea) return

    const motivoLimpio = motivoRechazo.trim()

    if (motivoLimpio.length < 3) {
      setError(
        'Escribe un motivo de al menos 3 caracteres.',
      )
      return
    }

    setProcesandoId(solicitudRechazo.id)
    setError(null)

    try {
      await rechazarCompraNegocio(
        configuracion,
        turno.turno_id,
        solicitudRechazo.id,
        motivoLimpio,
      )

      setMensaje(
        'Solicitud rechazada. No se acreditaron REGIS.',
      )

      setRechazoAbierto(false)
      setSolicitudRechazo(null)
      setMotivoRechazo('')
      setSeleccionada(null)
      setFlujoCompra('lista')
      setVista('solicitudes')

      await cargarDatos(true)
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const solicitudesVisibles = useMemo(
    () => solicitudes.slice(0, 2),
    [solicitudes],
  )

  const solicitudInicio =
    solicitudesVisibles[0] ?? null

  const canjeInicio =
    !solicitudInicio
      ? canjesPendientes[0] ?? null
      : null

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
            ) : !solicitudInicio && !canjeInicio ? (
              <div className="negocio-v2__todo-dia">

                <span className="negocio-v2__icono-suave">
                  <Icono tipo="solicitudes" />
                </span>

                <div>
                  <strong>¡Todo al día!</strong>
                  <small>
                    No hay solicitudes pendientes por el momento.
                  </small>
                </div>

              </div>
            ) : solicitudInicio ? (
              <div className="negocio-v2__resumen-demo">

                <span
                  className="negocio-v2__resumen-demo-avatar"
                  aria-hidden="true"
                >
                  {solicitudInicio.nombre_vecino
                    ?.trim()
                    .charAt(0)
                    .toUpperCase() || 'V'}
                </span>

                <div className="negocio-v2__resumen-demo-info">

                  <strong>
                    {solicitudInicio.nombre_vecino?.trim() ||
                      'Vecino'}
                  </strong>

                  <small>
                    {tituloSolicitud(solicitudInicio)}
                  </small>

                  <b>
                    {formatearMonto(
                      montoVigente(solicitudInicio),
                    )}
                  </b>

                </div>

                <div className="negocio-v2__resumen-demo-estado">
                  <em>Pendiente</em>
                  <span>Ver</span>
                </div>

              </div>
            ) : (
              <div className="negocio-v2__resumen-demo">

                <span
                  className="negocio-v2__resumen-demo-avatar"
                  aria-hidden="true"
                >
                  {canjeInicio?.nombre_vecino
                    ?.trim()
                    .charAt(0)
                    .toUpperCase() || 'V'}
                </span>

                <div className="negocio-v2__resumen-demo-info">

                  <strong>
                    {canjeInicio?.nombre_vecino?.trim() ||
                      'Vecino'}
                  </strong>

                  <small>Canje de beneficio</small>

                  <b>
                    {canjeInicio
                      ? `${canjeInicio.costo_regis.toLocaleString(
                          'es-CL',
                        )} REGIS`
                      : ''}
                  </b>

                </div>

                <div className="negocio-v2__resumen-demo-estado">
                  <em>Pendiente</em>
                  <span>Ver</span>
                </div>

              </div>
            )}
          </button>
        </>
      )}

      {vista === 'solicitudes' &&
        !seleccionada &&
        !canjeSeleccionado &&
        !resultadoCanjeConfirmado &&
        flujoCompra === 'lista' && (
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
                        onClick={() =>
                          abrirCanje(canje)
                        }
                      >
                        Revisar
                      </button>

                    </article>
                  )
                })}

{solicitudesFiltradas.map((solicitud) => {
                const montoActual = montoVigente(solicitud)
                const procesando = procesandoId === solicitud.id
                return (
                  <article key={solicitud.id} className="negocio-v2__solicitud-card solicitud-demo">
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

                    <div className="negocio-v2__solicitud-acciones">
                        <button className="principal" type="button" disabled={procesando || !enLinea} onClick={() => abrirConfirmacion(solicitud)}>
                          {procesando ? 'Procesando…' : '✓ Aprobar'}
                        </button>
                        <button
                          type="button"
                          disabled={procesando}
                          onClick={() =>
                            abrirCorreccion(solicitud)
                          }
                        >
                          Corregir
                        </button>

                        <button
                          className="rechazar"
                          type="button"
                          disabled={procesando || !enLinea}
                          onClick={() =>
                            abrirRechazo(solicitud)
                          }
                        >
                          Rechazar
                        </button>
                      </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}



      {vista === 'solicitudes' &&
        canjeSeleccionado && (
        <section className="negocio-v2__canje-revision">

          <article className="negocio-v2__canje-panel">

            <header className="negocio-v2__canje-cabecera">

              <div className="negocio-v2__canje-cabecera-copy">

                <span className="negocio-v2__canje-eyebrow">
                  Solicitud de canje
                </span>

                <h1>Revisar canje</h1>

                <div className="negocio-v2__canje-vecino">

                  <span
                    className="negocio-v2__canje-avatar"
                    aria-hidden="true"
                  >
                    {canjeSeleccionado.nombre_vecino
                      ?.trim()
                      .charAt(0)
                      .toUpperCase() || 'V'}
                  </span>

                  <div>
                    <strong>
                      {canjeSeleccionado.nombre_vecino
                        ?.trim() || 'Vecino'}
                    </strong>

                    <small>
                      {canjeSeleccionado.origen === 'qr'
                        ? 'Canje solicitado desde App Vecino'
                        : 'Canje con llavero NFC'}
                    </small>
                  </div>

                </div>

                <p>
                  Revisa el beneficio y el monto antes de continuar.
                </p>

              </div>

              <div
                className="negocio-v2__canje-regalon"
                aria-hidden="true"
              />

            </header>


            <section className="negocio-v2__canje-beneficio">

              <div
                className="negocio-v2__canje-moneda"
                aria-hidden="true"
              />

              <div className="negocio-v2__canje-beneficio-contenido">

                <strong className="negocio-v2__canje-descuento">
                  {canjeSeleccionado.nombre_beneficio}
                </strong>

                <div className="negocio-v2__canje-regis-destacados">
                  <Icono tipo="canje" />

                  <b>
                    {canjeSeleccionado.costo_regis.toLocaleString(
                      'es-CL',
                    )}{' '}
                    REGIS
                  </b>

                  <span>reservados</span>
                </div>



              </div>

            </section>

            <div className="negocio-v2__canje-condiciones">

                  <div className="negocio-v2__canje-minimo">
                    <Icono tipo="compra" />

                    <span>
                      Compra mínima
                      <strong>
                        {formatearMonto(
                          canjeSeleccionado.compra_minima_clp,
                        )}
                      </strong>
                    </span>
                  </div>

                  <div className="negocio-v2__canje-vigencia">
                    <Icono tipo="turno" />

                    <span>
                      Válido hasta
                      <strong>
                        {formatearHora(
                          canjeSeleccionado.expira_en,
                        )}
                      </strong>
                    </span>
                  </div>

                </div>


            <label className="negocio-v2__canje-monto">

              <small>Monto total de la compra</small>

              <span className="negocio-v2__canje-monto-fila">

                <b>$</b>

                <input
                  inputMode="numeric"
                  value={montoCanje}
                  onChange={(evento) =>
                    setMontoCanje(
                      evento.target.value.replace(
                        /\D/g,
                        '',
                      ),
                    )
                  }
                  placeholder="0"
                  aria-label="Monto total de la compra"
                />

                <i aria-hidden="true">
                  <Icono tipo="editar" />
                </i>

              </span>

            </label>


            <div className="negocio-v2__canje-aviso">

              <div
                className="negocio-v2__canje-aviso-moneda"
                aria-hidden="true"
              />

              <div>
                <strong>
                  El descuento se calcula al confirmar
                </strong>

                <small>
                  Club Regalones calculará el beneficio automáticamente.
                </small>
              </div>

            </div>


            <div className="negocio-v2__canje-acciones">

              <button
                className="principal"
                type="button"
                disabled={
                  procesandoId === canjeSeleccionado.canje_id ||
                  !enLinea ||
                  !montoCanje ||
                  Number(montoCanje) <= 0
                }
                onClick={continuarCanjeAlEscaneo}
              >
                {procesandoId === canjeSeleccionado.canje_id
                  ? 'Procesando...'
                  : tokenQrCanje?.canjeId ===
                    canjeSeleccionado.canje_id
                    ? 'Confirmar canje'
                    : 'Continuar al escaneo'}
                <Icono tipo="flecha" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setCanjeSeleccionado(null)
                  setCanjeEscaneo(null)
                  setTokenQrCanje(null)
                  setMontoCanje('')
                  setError(null)
                  setVista('solicitudes')
                }}
              >
                Volver
              </button>

            </div>

          </article>

        </section>
      )}


      {vista === 'solicitudes' &&
        resultadoCanjeConfirmado && (
        <section className="negocio-v2__canje-exito">

          <article className="negocio-v2__canje-exito-panel">

            <div className="negocio-v2__canje-exito-check">
              <Icono tipo="check" />
            </div>

            <div className="negocio-v2__canje-exito-cabecera">

              <div>
                <span>Canje completado</span>
                <h1>?Canje confirmado!</h1>
                <p>
                  El beneficio fue aplicado correctamente.
                </p>
              </div>

              <div
                className="negocio-v2__canje-exito-regalon"
                aria-hidden="true"
              />

            </div>

            <div className="negocio-v2__canje-exito-beneficio">

              <small>Beneficio utilizado</small>

              <strong>
                {
                  resultadoCanjeConfirmado
                    .canje
                    .nombre_beneficio
                }
              </strong>

              <b>
                {
                  resultadoCanjeConfirmado
                    .resultado
                    .regis_utilizados
                    .toLocaleString('es-CL')
                }{' '}
                REGIS utilizados
              </b>

            </div>

            <dl className="negocio-v2__canje-exito-resumen">

              <div>
                <dt>Vecino</dt>
                <dd>
                  {
                    resultadoCanjeConfirmado
                      .canje
                      .nombre_vecino
                      ?.trim() || 'Vecino'
                  }
                </dd>
              </div>

              <div>
                <dt>Compra</dt>
                <dd>
                  {formatearMonto(
                    resultadoCanjeConfirmado
                      .resultado
                      .monto_compra_bruto_clp,
                  )}
                </dd>
              </div>

              <div>
                <dt>Descuento</dt>
                <dd className="descuento">
                  -{formatearMonto(
                    resultadoCanjeConfirmado
                      .resultado
                      .descuento_total_clp,
                  )}
                </dd>
              </div>

              <div className="total">
                <dt>Total final</dt>
                <dd>
                  {formatearMonto(
                    resultadoCanjeConfirmado
                      .resultado
                      .monto_final_pagado_clp,
                  )}
                </dd>
              </div>

            </dl>

            <div className="negocio-v2__canje-exito-estado">
              <Icono tipo="check" />

              <div>
                <strong>Canje registrado</strong>
                <small>
                  Los REGIS fueron procesados por Club Regalones.
                </small>
              </div>
            </div>

            <div className="negocio-v2__canje-exito-acciones">

              <button
                className="principal"
                type="button"
                onClick={() => {
                  setResultadoCanjeConfirmado(null)
                  setVista('inicio')
                }}
              >
                Volver al inicio
              </button>

              <button
                type="button"
                onClick={() => {
                  setResultadoCanjeConfirmado(null)
                  setVista('solicitudes')
                }}
              >
                Ver solicitudes
              </button>

            </div>

          </article>

        </section>
      )}


      {vista === 'solicitudes' &&
        flujoCompra === 'corregir' &&
        seleccionada && (
        <section className="negocio-v2__pantalla negocio-v2__demo-compra negocio-v2__demo-corregir-compra">

          <article className="negocio-v2__demo-compra-panel">

            <div className="negocio-v2__demo-compra-cabecera">

              <div>
                <span className="negocio-v2__demo-compra-etiqueta">
                  Corrección de solicitud
                </span>

                <h1>Corregir compra</h1>

                <div className="negocio-v2__demo-vecino">

                  <span>
                    {seleccionada.nombre_vecino
                      ?.trim()
                      .charAt(0)
                      .toUpperCase() || 'V'}
                  </span>

                  <div>
                    <strong>
                      {seleccionada.nombre_vecino?.trim() ||
                        'Vecino'}
                    </strong>

                    <small>
                      {tituloSolicitud(seleccionada)}
                    </small>
                  </div>

                </div>

                <p>
                  Ajusta el monto exacto de la boleta antes
                  de aprobar.
                </p>
              </div>

              <div
                className="negocio-v2__demo-compra-mascota"
                aria-hidden="true"
              />

            </div>

            <label className="negocio-v2__demo-monto negocio-v2__demo-monto-editable">

              <small>Monto corregido</small>

              <span>
                $
                <input
                  inputMode="numeric"
                  value={monto}
                  onChange={(evento) =>
                    setMonto(
                      evento.target.value.replace(/\D/g, ''),
                    )
                  }
                  aria-label="Monto corregido"
                />
              </span>

            </label>

            <div className="negocio-v2__demo-info">

              <span>REGIS</span>

              <div>
                <strong>
                  Se recalcularán al aprobar
                </strong>

                <small>
                  Club Regalones aplicará la regla vigente
                  sobre el monto corregido.
                </small>
              </div>

            </div>

            <div className="negocio-v2__demo-acciones">

              <button
                className="principal"
                type="button"
                disabled={
                  procesandoId === seleccionada.id ||
                  !enLinea ||
                  !monto ||
                  Number(monto) <= 0
                }
                onClick={() => void guardarCorreccion()}
              >
                {procesandoId === seleccionada.id
                  ? 'Guardando...'
                  : 'Guardar corrección'}
              </button>

              <button
                type="button"
                disabled={
                  procesandoId === seleccionada.id
                }
                onClick={() => {
                  setSeleccionada(null)
                  setFlujoCompra('lista')
                  setError(null)
                }}
              >
                Cancelar
              </button>

            </div>

          </article>
        </section>
      )}

      {vista === 'solicitudes' &&
        flujoCompra === 'confirmar' &&
        solicitudConfirmacion && (
        <section className="negocio-v2__pantalla negocio-v2__demo-compra negocio-v2__demo-confirmar-compra">

          <article className="negocio-v2__demo-compra-panel">

            <div className="negocio-v2__demo-compra-cabecera">
              <div>
                <span className="negocio-v2__demo-compra-etiqueta">
                  Solicitud de compra
                </span>

                <h1>Confirmar compra</h1>

                <div className="negocio-v2__demo-vecino">
                  <span>
                    {solicitudConfirmacion.nombre_vecino
                      ?.trim()
                      .charAt(0)
                      .toUpperCase() || 'V'}
                  </span>

                  <div>
                    <strong>
                      {solicitudConfirmacion.nombre_vecino?.trim() ||
                        'Vecino'}
                    </strong>

                    <small>
                      {tituloSolicitud(solicitudConfirmacion)}
                    </small>
                  </div>
                </div>

                <p>
                  Revisa el monto informado antes de aprobar la compra.
                </p>
              </div>

              <div
                className="negocio-v2__demo-compra-mascota"
                aria-hidden="true"
              />
            </div>

            <div className="negocio-v2__demo-monto">
              <small>Monto informado</small>

              <strong>
                {formatearMonto(
                  montoVigente(solicitudConfirmacion),
                )}
              </strong>
            </div>

            <div className="negocio-v2__demo-info">
              <span>REGIS</span>

              <div>
                <strong>Se calculan al aprobar</strong>

                <small>
                  Club Regalones aplicará la regla vigente del negocio.
                </small>
              </div>
            </div>

            <div className="negocio-v2__demo-acciones">
              <button
                className="principal"
                type="button"
                disabled={
                  procesandoId === solicitudConfirmacion.id ||
                  !enLinea
                }
                onClick={() => void confirmarCompra()}
              >
                {procesandoId === solicitudConfirmacion.id
                  ? 'Procesando...'
                  : '\u2713 Confirmar y aprobar'}
              </button>

              <button
                type="button"
                disabled={
                  procesandoId === solicitudConfirmacion.id
                }
                onClick={() => {
                  setSolicitudConfirmacion(null)
                  setFlujoCompra('lista')
                  setError(null)
                }}
              >
                Volver
              </button>
            </div>

          </article>
        </section>
      )}

      {vista === 'solicitudes' &&
        flujoCompra === 'aprobada' &&
        resultadoCompra && (
        <section className="negocio-v2__pantalla negocio-v2__resultado-compra">

          <article className="negocio-v2__resultado-compra-card">

            <header className="negocio-v2__resultado-compra-header">
              <span
                className="negocio-v2__resultado-compra-check"
                aria-hidden="true"
              >
                <Icono tipo="check" />
              </span>

              <div>
                <h1>¡Compra aprobada!</h1>
                <p>La compra fue registrada correctamente.</p>
              </div>
            </header>

            <section className="negocio-v2__resultado-compra-hero">
              <div>
                <small>Monto de la compra</small>

                <strong>
                  {formatearMonto(
                    resultadoCompra.compra.monto_final,
                  )}
                </strong>
              </div>

              <div
                className="negocio-v2__resultado-compra-regalon"
                aria-hidden="true"
              />
            </section>

            <dl className="negocio-v2__resultado-compra-resumen">
              <div>
                <dt>Vecino</dt>

                <dd>
                  {resultadoCompra.solicitud.nombre_vecino?.trim() ||
                    'Vecino'}
                </dd>
              </div>

              <div>
                <dt>REGIS acumulados</dt>

                <dd className="acumulados">
                  +{resultadoCompra.compra.regis_generados.toLocaleString(
                    'es-CL',
                  )} REGIS
                </dd>
              </div>

              <div className="nuevo-saldo">
                <dt>Registro</dt>
                <dd>Compra confirmada</dd>
              </div>
            </dl>

            <div className="negocio-v2__resultado-compra-acciones">
              <button
                className="principal"
                type="button"
                onClick={() => {
                  setResultadoCompra(null)
                  setFlujoCompra('lista')
                  setVista('inicio')
                }}
              >
                Volver al inicio
              </button>

              <button
                type="button"
                onClick={() => {
                  setResultadoCompra(null)
                  setFlujoCompra('lista')
                  setVista('solicitudes')
                }}
              >
                <Icono tipo="solicitudes" />
                Ver solicitudes
              </button>
            </div>

          </article>
        </section>
      )}

      {vista === 'escanear' && (
        <EscanerQrNegocio
          configuracion={configuracion}
          turnoId={turno.turno_id}
          canjeEsperado={canjeEscaneo}
          montoCanje={montoCanje}
          alCanjeEncontrado={async (
            canjeId,
            tokenQr,
          ) => {
            const actuales =
              await listarCanjesPendientesNegocio(
                configuracion,
                turno.turno_id,
              )

            setCanjesPendientes(actuales)

            const pendiente =
              actuales.find(
                (canje) =>
                  canje.canje_id === canjeId,
              )

            if (!pendiente) {
              throw new Error(
                'El canje ya no esta disponible.',
              )
            }

            /*
             * EL QR SE LEE UNA SOLA VEZ.
             * Guardamos el token junto al canje.
             */
            abrirCanje(
              pendiente,
              tokenQr,
            )
          }}
          alCanjeValidado={(tokenQr) => {
            if (!canjeEscaneo) {
              setError(
                'Perdimos el contexto del canje.',
              )
              return
            }

            const canje =
              canjeEscaneo

            setCanjeSeleccionado(canje)

            setTokenQrCanje({
              canjeId: canje.canje_id,
              token: tokenQr,
            })

            setCanjeEscaneo(null)
            setError(null)
            setMensaje(
              'QR validado correctamente.',
            )
            setVista('solicitudes')
          }}
          alVolver={() => {
            setError(null)

            if (canjeEscaneo) {
              setCanjeSeleccionado(canjeEscaneo)
              setCanjeEscaneo(null)
              setVista('solicitudes')
              return
            }

            setVista('inicio')
          }}
        />

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
      {rechazoAbierto && solicitudRechazo && (
        <div
          className="negocio-v2__modal-rechazo"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-rechazo-compra"
        >
          <div className="negocio-v2__modal-rechazo-panel">

            <span
              className="negocio-v2__modal-rechazo-icono"
              aria-hidden="true"
            >
              !
            </span>

            <h2 id="titulo-rechazo-compra">
              ¿Por qué rechazas la compra?
            </h2>

            <p>
              {solicitudRechazo.nombre_vecino?.trim() ||
                'Vecino'}
              {' · '}
              {formatearMonto(
                montoVigente(solicitudRechazo),
              )}
            </p>

            <label className="negocio-v2__modal-rechazo-campo">

              <span>Motivo del rechazo</span>

              <textarea
                autoFocus
                value={motivoRechazo}
                onChange={(evento) =>
                  setMotivoRechazo(evento.target.value)
                }
                maxLength={500}
                placeholder="Ej: El monto no coincide con la boleta..."
              />

              <small>
                {motivoRechazo.length}/500
              </small>

            </label>

            <div className="negocio-v2__modal-rechazo-acciones">

              <button
                className="confirmar"
                type="button"
                disabled={
                  motivoRechazo.trim().length < 3 ||
                  procesandoId === solicitudRechazo.id ||
                  !enLinea
                }
                onClick={() => void confirmarRechazo()}
              >
                {procesandoId === solicitudRechazo.id
                  ? 'Rechazando...'
                  : 'Confirmar rechazo'}
              </button>

              <button
                type="button"
                disabled={
                  procesandoId === solicitudRechazo.id
                }
                onClick={() => {
                  setRechazoAbierto(false)
                  setSolicitudRechazo(null)
                  setMotivoRechazo('')
                  setError(null)
                }}
              >
                Volver
              </button>

            </div>

          </div>
        </div>
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
