import { calcularCompraParaDescuentoCompleto } from '@club-regalones/domain'
import type { Tables } from '@club-regalones/domain'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import EnlaceSoporteAdmin from '../../componentes/EnlaceSoporteAdmin'
import { useSesion } from '../../hooks/useSesion'
import {
  cancelarSolicitudLlavero,
} from '../../lib/llaveros'
import { mensajeSupabase } from '../../lib/mensajesSupabase'
import {
  cancelarReservaCanjeRegis,
  listarHistorialCanjesVecino,
  listarBeneficiosRegisDisponibles,
  listarSaldosRegisPropios,
  marcarCanjeRegisLeido,
  reservarCanjeRegisQr,
} from '../../lib/regis'
import type {
  BeneficioRegisDisponible,
  HistorialCanjeRegis,
  ReservaCanjeRegisQr,
  SaldoRegisPropio,
} from '../../lib/regis'
import { supabase } from '../../lib/supabase'
import './Llaveros.css'

type Perfil = Pick<
  Tables<'perfiles'>,
  'id' | 'nombre' | 'apellido' | 'rol_plataforma' | 'modalidad_atencion'
>
type Solicitud = Tables<'solicitudes_llavero'>
type Negocio = Pick<Tables<'negocios'>, 'id' | 'nombre'>
type LlaveroPropio = Pick<
  Tables<'llaveros_nfc'>,
  'estado' | 'codigo_publico' | 'asignado_en'
>

const etiquetasSolicitud: Record<Solicitud['estado'], string> = {
  pendiente: 'Pendiente de revisión',
  programada_entrega: 'Entrega programada',
  entregada: 'Entregada',
  cancelada: 'Cancelada',
}

const etiquetasLlavero: Record<LlaveroPropio['estado'], string> = {
  sin_asignar: 'En preparación',
  activo: 'Activo',
  bloqueado: 'Bloqueado',
  perdido: 'Reportado como perdido',
  reemplazado: 'Reemplazado',
  revocado: 'Revocado',
}

function formatearFecha(fecha: string | null) {
  if (!fecha) return 'Aún sin fecha'

  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(fecha))
}

function formatearPesos(monto: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(monto)
}

function describirBeneficio(beneficio: BeneficioRegisDisponible) {
  if (beneficio.tipo === 'porcentaje_descuento') {
    return `${beneficio.porcentaje_descuento_bp / 100}% de descuento`
  }

  return `Hasta ${formatearPesos(beneficio.monto_descuento_fijo_clp)} de descuento`
}

function describirReglaBeneficio(beneficio: BeneficioRegisDisponible) {
  const porcentajeMaximo = beneficio.porcentaje_maximo_canje_bp / 100
  const compraDescuentoCompleto = Math.max(
    beneficio.compra_minima_clp,
    calcularCompraParaDescuentoCompleto({
      tipo: beneficio.tipo,
      porcentajeDescuentoBp: beneficio.porcentaje_descuento_bp,
      montoDescuentoFijoClp: beneficio.monto_descuento_fijo_clp,
      topeDescuentoClp: beneficio.tope_descuento_clp,
      porcentajeMaximoCanjeBp: beneficio.porcentaje_maximo_canje_bp,
    }) ?? beneficio.compra_minima_clp,
  )

  if (beneficio.tipo === 'monto_fijo') {
    return `Hasta ${formatearPesos(beneficio.monto_descuento_fijo_clp)}, con un máximo del ${porcentajeMaximo}% de la compra. Recibes el descuento completo en compras desde ${formatearPesos(compraDescuentoCompleto)}.`
  }

  const porcentajePromocion = beneficio.porcentaje_descuento_bp / 100
  const porcentajeAplicable = Math.min(
    porcentajePromocion,
    porcentajeMaximo,
  )
  return `${porcentajeAplicable}% de la compra, hasta ${formatearPesos(beneficio.tope_descuento_clp)}. Alcanzas el descuento máximo en compras desde ${formatearPesos(compraDescuentoCompleto)}.`
}

function formatearCuentaRegresiva(segundos: number) {
  const minutos = Math.floor(segundos / 60)
  const resto = segundos % 60

  return `${minutos}:${resto.toString().padStart(2, '0')}`
}

function tieneCodigo(error: unknown, codigo: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === codigo
  )
}

function MiLlavero() {
  const { sesion, cargando: cargandoSesion } = useSesion()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [llaveros, setLlaveros] = useState<LlaveroPropio[]>([])
  const [negocios, setNegocios] = useState<Negocio[]>([])
  const [saldosRegis, setSaldosRegis] = useState<SaldoRegisPropio[]>([])
  const [beneficiosRegis, setBeneficiosRegis] = useState<
    BeneficioRegisDisponible[]
  >([])
  const [canjeActivo, setCanjeActivo] = useState<{
    beneficio: BeneficioRegisDisponible
    reserva: ReservaCanjeRegisQr
  } | null>(null)
  const [historialCanjes, setHistorialCanjes] = useState<
    HistorialCanjeRegis[]
  >([])
  const [mostrarCanjeQr, setMostrarCanjeQr] = useState(false)
  const [segundosRestantes, setSegundosRestantes] = useState(0)
  const [codigoQrCopiado, setCodigoQrCopiado] = useState(false)
  const [beneficioProcesandoId, setBeneficioProcesandoId] = useState<
    string | null
  >(null)
  const [cancelandoCanje, setCancelandoCanje] = useState(false)
  const [marcandoCanjesLeidos, setMarcandoCanjesLeidos] = useState(false)
  const [negocioId, setNegocioId] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [mostrarOpcionesLlavero, setMostrarOpcionesLlavero] = useState(false)
  const [cargandoDatos, setCargandoDatos] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const cargarDatos = useCallback(async () => {
    if (!sesion) return

    try {
      const [
        respuestaPerfil,
        respuestaSolicitudes,
        respuestaLlaveros,
        respuestaNegocios,
        respuestaSaldosRegis,
        respuestaBeneficiosRegis,
        respuestaHistorialCanjes,
      ] =
        await Promise.all([
          supabase
            .from('perfiles')
            .select(
              'id, nombre, apellido, rol_plataforma, modalidad_atencion',
            )
            .eq('id', sesion.user.id)
            .single(),
          supabase
            .from('solicitudes_llavero')
            .select('*')
            .eq('vecino_id', sesion.user.id)
            .order('solicitado_en', { ascending: false }),
          supabase
            .from('llaveros_nfc')
            .select('estado, codigo_publico, asignado_en')
            .order('asignado_en', { ascending: false, nullsFirst: false }),
          supabase
            .from('negocios')
            .select('id, nombre')
            .eq('estado', 'activo')
            .order('nombre'),
          listarSaldosRegisPropios(),
          listarBeneficiosRegisDisponibles(),
          listarHistorialCanjesVecino(),
        ])

      const errorConsulta =
        respuestaPerfil.error ??
        respuestaSolicitudes.error ??
        respuestaLlaveros.error ??
        respuestaNegocios.error

      if (errorConsulta) throw errorConsulta

      setPerfil(respuestaPerfil.data as Perfil)
      setSolicitudes((respuestaSolicitudes.data ?? []) as Solicitud[])
      setLlaveros((respuestaLlaveros.data ?? []) as LlaveroPropio[])
      setNegocios((respuestaNegocios.data ?? []) as Negocio[])
      setSaldosRegis(respuestaSaldosRegis)
      setBeneficiosRegis(respuestaBeneficiosRegis)
      setHistorialCanjes(respuestaHistorialCanjes)
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setCargandoDatos(false)
    }
  }, [sesion])

  useEffect(() => {
    const inicioCarga = window.setTimeout(() => void cargarDatos(), 0)

    return () => window.clearTimeout(inicioCarga)
  }, [cargarDatos])

  useEffect(() => {
    if (!canjeActivo) return

    const actualizarCuentaRegresiva = () => {
      const restantes = Math.max(
        0,
        Math.ceil(
          (new Date(canjeActivo.reserva.expira_en).getTime() - Date.now()) /
            1000,
        ),
      )

      setSegundosRestantes(restantes)

      if (restantes === 0) {
        setCanjeActivo(null)
        setMostrarCanjeQr(false)
        setCodigoQrCopiado(false)
        setMensaje('La reserva venció y los REGIS volvieron a estar disponibles.')
        setCargandoDatos(true)
        void cargarDatos()
        return true
      }

      return false
    }

    actualizarCuentaRegresiva()
    const intervalo = window.setInterval(() => {
      if (actualizarCuentaRegresiva()) window.clearInterval(intervalo)
    }, 1000)

    return () => window.clearInterval(intervalo)
  }, [canjeActivo, cargarDatos])

  useEffect(() => {
    if (!canjeActivo) return

    let vigente = true
    const consultarEstado = async () => {
      const { data, error: errorEstado } = await supabase
        .from('canjes_regis')
        .select('estado')
        .eq('id', canjeActivo.reserva.canje_id)
        .single()

      if (!vigente || errorEstado || data.estado === 'reservado') return

      setCanjeActivo(null)
      setMostrarCanjeQr(false)
      setCodigoQrCopiado(false)
      setMensaje(
        data.estado === 'confirmado'
          ? '¡Canje realizado correctamente! Ya puedes revisar el detalle en tu historial.'
          : 'La reserva dejó de estar disponible y los REGIS fueron liberados.',
      )
      setCargandoDatos(true)
      void cargarDatos()
    }

    const intervalo = window.setInterval(() => void consultarEstado(), 2500)
    return () => {
      vigente = false
      window.clearInterval(intervalo)
    }
  }, [canjeActivo, cargarDatos])

  const solicitudActiva = useMemo(
    () =>
      solicitudes.find((solicitud) =>
        ['pendiente', 'programada_entrega'].includes(solicitud.estado),
      ) ?? null,
    [solicitudes],
  )

  const llaveroActual = useMemo(
    () =>
      llaveros.find((llavero) => llavero.estado === 'activo') ??
      llaveros[0] ??
      null,
    [llaveros],
  )

  const mostrarGestionLlavero =
    mostrarOpcionesLlavero ||
    perfil?.modalidad_atencion === 'asistida' ||
    llaveroActual !== null ||
    solicitudActiva !== null

  const cambiarModalidad = async (
    modalidad: Perfil['modalidad_atencion'],
  ) => {
    if (!sesion || perfil?.modalidad_atencion === modalidad) return

    setProcesando(true)
    setError(null)
    setMensaje(null)

    const { data, error: errorActualizacion } = await supabase
      .from('perfiles')
      .update({ modalidad_atencion: modalidad })
      .eq('id', sesion.user.id)
      .select('id, nombre, apellido, rol_plataforma, modalidad_atencion')
      .single()

    setProcesando(false)

    if (errorActualizacion) {
      setError(mensajeSupabase(errorActualizacion))
      return
    }

    setPerfil(data as Perfil)
    setMensaje(
      modalidad === 'asistida'
        ? 'Activaste la atención asistida. Ya puedes solicitar tu llavero.'
        : 'Tu modalidad quedó configurada como digital.',
    )
  }

  const solicitarLlavero = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!sesion || perfil?.modalidad_atencion !== 'asistida') return

    setProcesando(true)
    setError(null)
    setMensaje(null)

    try {
      const { error: errorSolicitud } = await supabase
        .from('solicitudes_llavero')
        .insert({
          vecino_id: sesion.user.id,
          negocio_solicitud_id: negocioId || null,
          observaciones: observaciones.trim() || null,
        })

      if (errorSolicitud) throw errorSolicitud

      setObservaciones('')
      setNegocioId('')
      setMensaje('Recibimos tu solicitud. Te avisaremos cuando programemos la entrega.')
      await cargarDatos()
    } catch (errorCapturado) {
      setError(
        tieneCodigo(errorCapturado, '23505')
          ? 'Ya tienes una solicitud activa. Puedes revisar su estado aquí.'
          : mensajeSupabase(errorCapturado),
      )
    } finally {
      setProcesando(false)
    }
  }

  const cancelarSolicitud = async () => {
    if (!solicitudActiva) return

    setProcesando(true)
    setError(null)
    setMensaje(null)

    try {
      await cancelarSolicitudLlavero(solicitudActiva.id)
      setMensaje('La solicitud quedó cancelada. Puedes crear otra cuando la necesites.')
      await cargarDatos()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const reservarBeneficio = async (beneficio: BeneficioRegisDisponible) => {
    if (canjeActivo) return

    setBeneficioProcesandoId(beneficio.beneficio_version_id)
    setError(null)
    setMensaje(null)

    try {
      const reserva = await reservarCanjeRegisQr(
        beneficio.beneficio_version_id,
      )

      setCanjeActivo({ beneficio, reserva })
      setMostrarCanjeQr(true)
      setCodigoQrCopiado(false)
      await cargarDatos()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setBeneficioProcesandoId(null)
    }
  }

  const cancelarCanje = async () => {
    if (!canjeActivo) return

    setCancelandoCanje(true)
    setError(null)

    try {
      await cancelarReservaCanjeRegis(canjeActivo.reserva.canje_id)
      setCanjeActivo(null)
      setMostrarCanjeQr(false)
      setCodigoQrCopiado(false)
      setMensaje('Cancelamos la reserva y devolvimos los REGIS a tu saldo.')
      await cargarDatos()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setCancelandoCanje(false)
    }
  }

  const copiarCodigoQr = async () => {
    if (!canjeActivo) return

    try {
      await navigator.clipboard.writeText(canjeActivo.reserva.tokenQr)
      setCodigoQrCopiado(true)
    } catch {
      setError(
        'No pudimos copiar el código automáticamente. Inténtalo desde un navegador con acceso al portapapeles.',
      )
    }
  }

  const marcarHistorialComoLeido = async () => {
    const pendientes = historialCanjes.filter(({ leido }) => !leido)
    if (pendientes.length === 0) return

    setMarcandoCanjesLeidos(true)
    setError(null)

    try {
      await Promise.all(
        pendientes.map(({ canje_id }) =>
          marcarCanjeRegisLeido(canje_id, 'vecino'),
        ),
      )
      setHistorialCanjes((actual) =>
        actual.map((canje) => ({ ...canje, leido: true })),
      )
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setMarcandoCanjesLeidos(false)
    }
  }

  const actualizarDatos = () => {
    setCargandoDatos(true)
    setError(null)
    void cargarDatos()
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    window.location.hash = 'inicio'
  }

  const canjesNoLeidos = historialCanjes.filter(({ leido }) => !leido).length

  return (
    <main className="llaveros">
      <header className="llaveros__barra">
        <a className="llaveros__marca" href="#inicio">
          Club Regalones
        </a>
        <nav aria-label="Acciones de cuenta">
          {perfil?.rol_plataforma === 'admin_regalones' && (
            <>
              <a href="#administrar-beneficios">Beneficios</a>
              <a href="#administrar-llaveros">Llaveros</a>
              <EnlaceSoporteAdmin />
            </>
          )}
          {sesion && (
            <button type="button" onClick={() => void cerrarSesion()}>
              Cerrar sesión
            </button>
          )}
        </nav>
      </header>

      <section className="llaveros__encabezado">
        <span>Mi cuenta</span>
        <h1>Mis REGIS</h1>
        <p>
          Revisa tus recompensas disponibles en cada comercio del barrio.
          Cada saldo se mantiene separado para que siempre sepas dónde usarlo.
        </p>
      </section>

      {cargandoSesion ? (
        <p className="llaveros__aviso">Comprobando tu sesión…</p>
      ) : !sesion ? (
        <section className="llaveros__aviso llaveros__aviso--centrado">
          <h2>Inicia sesión para continuar</h2>
          <p>Tu modalidad y tus solicitudes son información privada.</p>
          <a href="#iniciar-sesion?continuar=mis-regis">Iniciar sesión</a>
        </section>
      ) : cargandoDatos && !perfil ? (
        <p className="llaveros__aviso">Cargando tu información…</p>
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

          {mostrarGestionLlavero && (
          <section className="llaveros__rejilla">
            <article className="llaveros__tarjeta">
              <span className="llaveros__sobrelinea">Modalidad de atención</span>
              <h2>Hola, {perfil?.nombre}</h2>
              <p>
                La modalidad digital usa tu teléfono. La asistida te permite
                solicitar un llavero físico para identificarte con ayuda.
              </p>
              <div className="llaveros__selector" role="group" aria-label="Modalidad">
                <button
                  className={
                    perfil?.modalidad_atencion === 'digital' ? 'activo' : ''
                  }
                  type="button"
                  disabled={procesando}
                  onClick={() => void cambiarModalidad('digital')}
                >
                  <strong>Digital</strong>
                  <small>Uso desde tu teléfono</small>
                </button>
                <button
                  className={
                    perfil?.modalidad_atencion === 'asistida' ? 'activo' : ''
                  }
                  type="button"
                  disabled={procesando}
                  onClick={() => void cambiarModalidad('asistida')}
                >
                  <strong>Asistida</strong>
                  <small>Con llavero y acompañamiento</small>
                </button>
              </div>
            </article>

            <article className="llaveros__tarjeta llaveros__tarjeta--llavero">
              <span className="llaveros__sobrelinea">Mi llavero</span>
              {llaveroActual ? (
                <>
                  <div className="llaveros__llavero-icono" aria-hidden="true">
                    CR
                  </div>
                  <span className={`llaveros__estado estado--${llaveroActual.estado}`}>
                    {etiquetasLlavero[llaveroActual.estado]}
                  </span>
                  <h2>{llaveroActual.codigo_publico}</h2>
                  <p>Asignado: {formatearFecha(llaveroActual.asignado_en)}</p>
                  <small>
                    El llavero no guarda tu nombre, saldo ni información personal.
                  </small>
                </>
              ) : (
                <>
                  <div className="llaveros__llavero-icono" aria-hidden="true">
                    +
                  </div>
                  <h2>Aún no tienes llavero</h2>
                  <p>Activa la modalidad asistida para solicitarlo.</p>
                </>
              )}
            </article>
          </section>
          )}

          <section className="llaveros__regis" aria-labelledby="mis-regis-title">
            <div className="llaveros__regis-encabezado">
              <div>
                <span className="llaveros__sobrelinea">Mis recompensas</span>
                <h2 id="mis-regis-title">Mis REGIS</h2>
              </div>
              <p>
                Cada comercio mantiene su propio saldo. Los REGIS obtenidos en
                un negocio solo se pueden usar en ese mismo negocio.
              </p>
            </div>

            {saldosRegis.length === 0 ? (
              <div className="llaveros__regis-vacio">
                <strong>Aún no tienes REGIS acumulados</strong>
                <span>
                  Aparecerán aquí cuando se apruebe una compra elegible.
                </span>
              </div>
            ) : (
              <div className="llaveros__regis-lista">
                {saldosRegis.map((saldo) => (
                  <article
                    className="llaveros__regis-tarjeta"
                    key={saldo.negocio_id}
                  >
                    <span>{saldo.nombre_negocio}</span>
                    <strong>{saldo.disponibles} REGIS</strong>
                    <small>Disponibles para usar en este comercio</small>
                    {(saldo.pendientes > 0 ||
                      saldo.reservados > 0 ||
                      saldo.canjeados > 0) && (
                      <dl>
                        {saldo.pendientes > 0 && (
                          <div>
                            <dt>Pendientes de revisión</dt>
                            <dd>{saldo.pendientes}</dd>
                          </div>
                        )}
                        {saldo.reservados > 0 && (
                          <div>
                            <dt>Reservados</dt>
                            <dd>{saldo.reservados}</dd>
                          </div>
                        )}
                        {saldo.canjeados > 0 && (
                          <div>
                            <dt>REGIS utilizados</dt>
                            <dd>{saldo.canjeados}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section
            className="llaveros__historial-canjes"
            aria-labelledby="historial-canjes-title"
          >
            <div className="llaveros__historial-encabezado">
              <div>
                <span className="llaveros__sobrelinea">Actividad de tu cuenta</span>
                <h2 id="historial-canjes-title">REGIS utilizados</h2>
                <p>
                  Cada canje conserva el comercio, la hora, el beneficio y los
                  montos de la compra.
                </p>
              </div>
              {canjesNoLeidos > 0 && (
                <div className="llaveros__historial-aviso">
                  <strong>
                    {canjesNoLeidos}{' '}
                    {canjesNoLeidos === 1 ? 'canje nuevo' : 'canjes nuevos'}
                  </strong>
                  <button
                    type="button"
                    disabled={marcandoCanjesLeidos}
                    onClick={() => void marcarHistorialComoLeido()}
                  >
                    {marcandoCanjesLeidos
                      ? 'Marcando…'
                      : 'Marcar como revisados'}
                  </button>
                </div>
              )}
            </div>

            {historialCanjes.length === 0 ? (
              <div className="llaveros__historial-vacio">
                Aún no has utilizado REGIS en un beneficio.
              </div>
            ) : (
              <div className="llaveros__historial-lista">
                {historialCanjes.map((canje) => (
                  <article
                    className={`llaveros__historial-item ${
                      canje.leido ? '' : 'llaveros__historial-item--nuevo'
                    }`}
                    key={canje.canje_id}
                  >
                    <div className="llaveros__historial-titulo">
                      <div>
                        {!canje.leido && <span>Nuevo</span>}
                        <h3>{canje.nombre_beneficio}</h3>
                        <p>{canje.nombre_negocio}</p>
                      </div>
                      <strong>-{canje.costo_regis} REGIS</strong>
                    </div>
                    <dl>
                      <div>
                        <dt>Fecha y hora</dt>
                        <dd>{formatearFecha(canje.confirmado_en)}</dd>
                      </div>
                      <div>
                        <dt>Compra original</dt>
                        <dd>{formatearPesos(canje.monto_compra_bruto_clp)}</dd>
                      </div>
                      <div>
                        <dt>Descuento</dt>
                        <dd>-{formatearPesos(canje.descuento_total_clp)}</dd>
                      </div>
                      <div>
                        <dt>Total pagado</dt>
                        <dd>{formatearPesos(canje.monto_final_pagado_clp)}</dd>
                      </div>
                    </dl>
                    <small>
                      {canje.origen === 'qr' ? 'Canje digital' : 'Canje asistido'}
                      {' · '}{canje.codigo_publico}
                    </small>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section
            className="llaveros__beneficios"
            aria-labelledby="beneficios-regis-title"
          >
            <div className="llaveros__beneficios-encabezado">
              <div>
                <span className="llaveros__sobrelinea">Para usar tus REGIS</span>
                <h2 id="beneficios-regis-title">Beneficios disponibles</h2>
              </div>
              <p>
                Elige un beneficio, genera tu QR y muéstralo en la caja. La
                reserva dura diez minutos y solo funciona en el comercio
                indicado.
              </p>
            </div>

            {beneficiosRegis.length === 0 ? (
              <div className="llaveros__beneficios-vacio">
                <strong>Aún no hay beneficios publicados</strong>
                <span>
                  Cuando un comercio active uno, aparecerá aquí con su costo y
                  sus condiciones.
                </span>
              </div>
            ) : (
              <div className="llaveros__beneficios-lista">
                {beneficiosRegis.map((beneficio) => {
                  const faltantes = Math.max(
                    beneficio.costo_regis - beneficio.saldo_disponible,
                    0,
                  )
                  const esCanjeActivo =
                    canjeActivo?.beneficio.beneficio_version_id ===
                    beneficio.beneficio_version_id

                  return (
                    <article
                      className="llaveros__beneficio"
                      key={beneficio.beneficio_version_id}
                    >
                      <div className="llaveros__beneficio-comercio">
                        <span>{beneficio.nombre_negocio}</span>
                        {beneficio.mostrar_cupos &&
                          beneficio.cupos_disponibles !== null && (
                            <small>
                              {beneficio.cupos_disponibles}{' '}
                              {beneficio.cupos_disponibles === 1
                                ? 'cupo'
                                : 'cupos'}
                            </small>
                          )}
                      </div>
                      <h3>{beneficio.nombre_beneficio}</h3>
                      <strong className="llaveros__beneficio-descuento">
                        {describirBeneficio(beneficio)}
                      </strong>
                      {beneficio.descripcion && <p>{beneficio.descripcion}</p>}
                      <div className="llaveros__beneficio-regla">
                        <strong>Cómo se calcula</strong>
                        <span>{describirReglaBeneficio(beneficio)}</span>
                      </div>
                      <dl>
                        <div>
                          <dt>Costo</dt>
                          <dd>{beneficio.costo_regis} REGIS</dd>
                        </div>
                        <div>
                          <dt>Compra mínima</dt>
                          <dd>{formatearPesos(beneficio.compra_minima_clp)}</dd>
                        </div>
                        {beneficio.tope_descuento_clp !== null && (
                          <div>
                            <dt>Descuento máximo</dt>
                            <dd>
                              {formatearPesos(beneficio.tope_descuento_clp)}
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt>Tu saldo aquí</dt>
                          <dd>{beneficio.saldo_disponible} REGIS</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        disabled={
                          !beneficio.puede_reservar ||
                          canjeActivo !== null ||
                          beneficioProcesandoId !== null
                        }
                        onClick={() => void reservarBeneficio(beneficio)}
                      >
                        {beneficioProcesandoId ===
                        beneficio.beneficio_version_id
                          ? 'Reservando…'
                          : esCanjeActivo
                            ? 'Reserva activa'
                            : beneficio.puede_reservar
                              ? `Canjear ${beneficio.costo_regis} REGIS`
                              : faltantes > 0
                                ? `Te faltan ${faltantes} REGIS`
                                : 'No disponible'}
                      </button>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {!mostrarGestionLlavero && (
            <section className="llaveros__opcion-llavero">
              <div>
                <strong>¿Necesitas una forma más simple de identificarte?</strong>
                <span>
                  El llavero Regalones es opcional y está pensado especialmente
                  para personas que prefieren atención asistida.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMostrarOpcionesLlavero(true)}
              >
                Quiero conocer el llavero
              </button>
            </section>
          )}

          {mostrarGestionLlavero && (
          <section className="llaveros__tarjeta llaveros__solicitud">
            <div>
              <span className="llaveros__sobrelinea">Solicitud y entrega</span>
              <h2>
                {solicitudActiva
                  ? 'Estamos preparando tu atención'
                  : llaveroActual
                    ? '¿Necesitas reemplazar tu llavero?'
                    : 'Solicita tu llavero Regalones'}
              </h2>
            </div>

            {solicitudActiva ? (
              <div className="llaveros__seguimiento">
                <span className={`llaveros__estado estado--${solicitudActiva.estado}`}>
                  {etiquetasSolicitud[solicitudActiva.estado]}
                </span>
                <dl>
                  <div>
                    <dt>Solicitado</dt>
                    <dd>{formatearFecha(solicitudActiva.solicitado_en)}</dd>
                  </div>
                  <div>
                    <dt>Entrega</dt>
                    <dd>{formatearFecha(solicitudActiva.programado_para)}</dd>
                  </div>
                  {solicitudActiva.observaciones && (
                    <div>
                      <dt>Observaciones</dt>
                      <dd>{solicitudActiva.observaciones}</dd>
                    </div>
                  )}
                </dl>
                <div className="llaveros__acciones">
                  <button
                    type="button"
                    className="secundario"
                    disabled={procesando || cargandoDatos}
                    onClick={actualizarDatos}
                  >
                    Actualizar estado
                  </button>
                  <button
                    type="button"
                    className="peligro"
                    disabled={procesando}
                    onClick={() => void cancelarSolicitud()}
                  >
                    Cancelar solicitud
                  </button>
                </div>
              </div>
            ) : perfil?.modalidad_atencion !== 'asistida' ? (
              <div className="llaveros__aviso">
                Selecciona primero la modalidad asistida para habilitar la solicitud.
              </div>
            ) : (
              <form className="llaveros__formulario" onSubmit={solicitarLlavero}>
                <label>
                  Comercio de referencia <small>(opcional)</small>
                  <select
                    value={negocioId}
                    onChange={(evento) => setNegocioId(evento.target.value)}
                  >
                    <option value="">Sin comercio específico</option>
                    {negocios.map((negocio) => (
                      <option key={negocio.id} value={negocio.id}>
                        {negocio.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cuéntanos si necesitas alguna ayuda especial <small>(opcional)</small>
                  <textarea
                    maxLength={500}
                    rows={4}
                    value={observaciones}
                    onChange={(evento) => setObservaciones(evento.target.value)}
                    placeholder="Por ejemplo: prefiero coordinar la entrega por teléfono."
                  />
                </label>
                <button type="submit" disabled={procesando}>
                  {procesando ? 'Enviando…' : 'Solicitar mi llavero'}
                </button>
              </form>
            )}
          </section>
          )}

          {mostrarGestionLlavero && solicitudes.length > 0 && (
            <section className="llaveros__historial">
              <div>
                <span className="llaveros__sobrelinea">Historial</span>
                <h2>Mis solicitudes</h2>
              </div>
              <div className="llaveros__tabla-contenedor">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Entrega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solicitudes.map((solicitud) => (
                      <tr key={solicitud.id}>
                        <td>{formatearFecha(solicitud.solicitado_en)}</td>
                        <td>{etiquetasSolicitud[solicitud.estado]}</td>
                        <td>{formatearFecha(solicitud.entregado_en)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {canjeActivo && !mostrarCanjeQr && (
            <aside className="llaveros__canje-minimizado" aria-live="polite">
              <div>
                <span>QR de canje activo</span>
                <strong>{canjeActivo.beneficio.nombre_beneficio}</strong>
              </div>
              <span className="llaveros__canje-minimizado-tiempo">
                {formatearCuentaRegresiva(segundosRestantes)}
              </span>
              <button type="button" onClick={() => setMostrarCanjeQr(true)}>
                Mostrar QR
              </button>
            </aside>
          )}

          {canjeActivo && mostrarCanjeQr && (
            <div className="llaveros__modal-fondo">
              <section
                className="llaveros__modal-canje"
                role="dialog"
                aria-modal="true"
                aria-labelledby="canje-qr-title"
              >
                <button
                  type="button"
                  className="llaveros__modal-minimizar"
                  onClick={() => setMostrarCanjeQr(false)}
                >
                  Minimizar
                </button>
                <span className="llaveros__sobrelinea">Reserva lista</span>
                <h2 id="canje-qr-title">Muestra este QR en la caja</h2>
                <p>
                  {canjeActivo.beneficio.nombre_beneficio} en{' '}
                  <strong>{canjeActivo.beneficio.nombre_negocio}</strong>
                </p>
                <div className="llaveros__qr">
                  <QRCodeSVG
                    value={canjeActivo.reserva.tokenQr}
                    size={220}
                    bgColor="#ffffff"
                    fgColor="#073f2d"
                    level="M"
                    title="Código QR temporal del canje"
                  />
                </div>
                <button
                  type="button"
                  className="llaveros__copiar-qr"
                  onClick={() => void copiarCodigoQr()}
                >
                  {codigoQrCopiado
                    ? 'Código temporal copiado'
                    : 'Copiar código para ingreso manual'}
                </button>
                <div className="llaveros__canje-tiempo" aria-live="polite">
                  <span>Tiempo restante</span>
                  <strong>{formatearCuentaRegresiva(segundosRestantes)}</strong>
                </div>
                <dl className="llaveros__canje-resumen">
                  <div>
                    <dt>REGIS reservados</dt>
                    <dd>{canjeActivo.reserva.costo_regis}</dd>
                  </div>
                  <div>
                    <dt>Código de respaldo</dt>
                    <dd>{canjeActivo.reserva.codigo_publico}</dd>
                  </div>
                </dl>
                <p className="llaveros__canje-seguridad">
                  Puedes minimizar esta ventana: la reserva y el tiempo seguirán
                  activos. El QR no contiene tu nombre ni tu saldo y dejará de
                  funcionar al vencer o después del canje.
                </p>
                <button
                  type="button"
                  className="llaveros__cancelar-canje"
                  disabled={cancelandoCanje}
                  onClick={() => void cancelarCanje()}
                >
                  {cancelandoCanje
                    ? 'Cancelando…'
                    : 'Cancelar y devolver mis REGIS'}
                </button>
              </section>
            </div>
          )}
        </div>
      )}
    </main>
  )
}

export default MiLlavero
