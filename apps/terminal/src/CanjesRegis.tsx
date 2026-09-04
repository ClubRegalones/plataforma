import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  calcularCompraParaDescuentoCompleto,
  calcularDescuentoBeneficio,
} from '@club-regalones/domain'
import type { SaldoRegisLlavero } from './lib/regis'
import {
  cancelarCanjeRegis,
  consultarCanjeRegisQr,
  listarBeneficiosCanjeTerminal,
  listarHistorialCanjesNegocio,
  marcarCanjeNegocioLeido,
  reservarCanjeRegisDesdeLectura,
  reservarCanjeRegisLlavero,
  confirmarCompraConCanje,
} from './lib/canjes'
import type {
  BeneficioCanjeTerminal,
  CanjeQrConsultado,
  HistorialCanjeNegocio,
  ReservaCanjeLlavero,
  ResultadoCanje,
} from './lib/canjes'
import { mensajeSupabase } from './lib/mensajesSupabase'
import type { CredencialTerminalLocal } from './lib/terminalPwa'
import './canjes.css'

export type CajaCanjeRegis = {
  id: string
  negocioId: string
  nombre: string
  codigo: string | null
  sucursal: string
}

type CanjeEnRevision = {
  origen: 'qr' | 'llavero'
  cajaId: string
  canjeId: string
  codigoPublico: string
  estado: 'reservado' | 'confirmado' | 'expirado' | 'cancelado'
  expiraEn: string
  costoRegis: number
  nombreBeneficio: string
  compraMinimaClp: number
  tipo: 'porcentaje_descuento' | 'monto_fijo'
  porcentajeDescuentoBp: number | null
  montoDescuentoFijoClp: number | null
  topeDescuentoClp: number | null
  porcentajeMaximoCanjeBp: number
  tokenQr?: string
}

type CanjesRegisProps = {
  cajas: CajaCanjeRegis[]
  cajaId: string
  turnoId: string
  tokenLlavero: string
  lecturaLlaveroId: string | null
  credencialTerminal: CredencialTerminalLocal | null
  llaveroActivo: boolean
  saldoLlavero: SaldoRegisLlavero | null
  alConsumirLectura: () => void
  alConfirmar: () => Promise<void> | void
}

function formatearPesos(monto: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(monto)
}

function formatearFecha(fecha: string) {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(fecha))
}

function describirBeneficio(
  beneficio: Pick<
    CanjeEnRevision,
    | 'tipo'
    | 'porcentajeDescuentoBp'
    | 'montoDescuentoFijoClp'
    | 'topeDescuentoClp'
  >,
) {
  if (beneficio.tipo === 'monto_fijo') {
    return `Hasta ${formatearPesos(beneficio.montoDescuentoFijoClp ?? 0)} de descuento`
  }

  const porcentaje = (beneficio.porcentajeDescuentoBp ?? 0) / 100
  return beneficio.topeDescuentoClp === null
    ? `${porcentaje}% de descuento`
    : `${porcentaje}% de descuento, tope ${formatearPesos(beneficio.topeDescuentoClp)}`
}

function describirReglaBeneficio(
  beneficio: Pick<
    CanjeEnRevision,
    | 'tipo'
    | 'porcentajeDescuentoBp'
    | 'montoDescuentoFijoClp'
    | 'topeDescuentoClp'
    | 'porcentajeMaximoCanjeBp'
    | 'compraMinimaClp'
  >,
) {
  const porcentajeMaximo = beneficio.porcentajeMaximoCanjeBp / 100
  const compraCompleta = Math.max(
    beneficio.compraMinimaClp,
    calcularCompraParaDescuentoCompleto({
      tipo: beneficio.tipo,
      porcentajeDescuentoBp: beneficio.porcentajeDescuentoBp,
      montoDescuentoFijoClp: beneficio.montoDescuentoFijoClp,
      topeDescuentoClp: beneficio.topeDescuentoClp,
      porcentajeMaximoCanjeBp: beneficio.porcentajeMaximoCanjeBp,
    }) ?? beneficio.compraMinimaClp,
  )

  if (beneficio.tipo === 'monto_fijo') {
    return `Hasta ${formatearPesos(beneficio.montoDescuentoFijoClp ?? 0)}, con un máximo del ${porcentajeMaximo}% de la compra. Se obtiene completo desde ${formatearPesos(compraCompleta)}.`
  }

  const porcentajeAplicable = Math.min(
    (beneficio.porcentajeDescuentoBp ?? 0) / 100,
    porcentajeMaximo,
  )
  return `${porcentajeAplicable}% de la compra, hasta ${formatearPesos(beneficio.topeDescuentoClp ?? 0)}. El tope se alcanza desde ${formatearPesos(compraCompleta)}.`
}

function revisionDesdeQr(
  canje: CanjeQrConsultado,
  cajaId: string,
  tokenQr: string,
): CanjeEnRevision {
  return {
    origen: 'qr',
    cajaId,
    canjeId: canje.canje_id,
    codigoPublico: canje.codigo_publico,
    estado: canje.estado,
    expiraEn: canje.expira_en,
    costoRegis: canje.costo_regis,
    nombreBeneficio: canje.nombre_beneficio,
    compraMinimaClp: canje.compra_minima_clp,
    tipo: canje.tipo,
    porcentajeDescuentoBp: canje.porcentaje_descuento_bp,
    montoDescuentoFijoClp: canje.monto_descuento_fijo_clp,
    topeDescuentoClp: canje.tope_descuento_clp,
    porcentajeMaximoCanjeBp: canje.porcentaje_maximo_canje_bp,
    tokenQr,
  }
}

function revisionDesdeLlavero(
  reserva: ReservaCanjeLlavero,
  beneficio: BeneficioCanjeTerminal,
  cajaId: string,
): CanjeEnRevision {
  return {
    origen: 'llavero',
    cajaId,
    canjeId: reserva.canje_id,
    codigoPublico: reserva.codigo_publico,
    estado: reserva.estado,
    expiraEn: reserva.expira_en,
    costoRegis: reserva.costo_regis,
    nombreBeneficio: beneficio.nombre,
    compraMinimaClp: beneficio.compra_minima_clp,
    tipo: beneficio.tipo,
    porcentajeDescuentoBp: beneficio.porcentaje_descuento_bp,
    montoDescuentoFijoClp: beneficio.monto_descuento_fijo_clp,
    topeDescuentoClp: beneficio.tope_descuento_clp,
    porcentajeMaximoCanjeBp: beneficio.porcentaje_maximo_canje_bp,
  }
}

function CanjesRegis({
  cajas,
  cajaId,
  turnoId,
  tokenLlavero,
  lecturaLlaveroId,
  credencialTerminal,
  llaveroActivo,
  saldoLlavero,
  alConsumirLectura,
  alConfirmar,
}: CanjesRegisProps) {
  const [tokenQr, setTokenQr] = useState('')
  const [beneficios, setBeneficios] = useState<BeneficioCanjeTerminal[]>([])
  const [cargandoBeneficios, setCargandoBeneficios] = useState(false)
  const [canje, setCanje] = useState<CanjeEnRevision | null>(null)
  const [montoBruto, setMontoBruto] = useState('')
  const [folioBoleta, setFolioBoleta] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [segundosRestantes, setSegundosRestantes] = useState(0)
  const [resultado, setResultado] = useState<ResultadoCanje | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [historial, setHistorial] = useState<HistorialCanjeNegocio[]>([])
  const [filtroBeneficioId, setFiltroBeneficioId] = useState('todos')
  const [marcandoLeidos, setMarcandoLeidos] = useState(false)

  const cajaActual = useMemo(
    () => cajas.find((caja) => caja.id === cajaId) ?? null,
    [cajaId, cajas],
  )

  const historialFiltrado = useMemo(
    () =>
      historial.filter(
        (registro) =>
          filtroBeneficioId === 'todos' ||
          registro.beneficio_id === filtroBeneficioId,
      ),
    [filtroBeneficioId, historial],
  )

  const beneficiosHistorial = useMemo(
    () =>
      Array.from(
        new Map(
          historial.map((registro) => [
            registro.beneficio_id,
            registro.nombre_beneficio,
          ]),
        ),
        ([id, nombre]) => ({ id, nombre }),
      ),
    [historial],
  )

  const canjesNoLeidos = historial.filter(({ leido }) => !leido).length

  const vistaPreviaDescuento = useMemo(() => {
    const monto = Number(montoBruto)
    if (!canje || !Number.isInteger(monto) || monto <= 0) return null

    const descuento = calcularDescuentoBeneficio(monto, {
      tipo: canje.tipo,
      porcentajeDescuentoBp: canje.porcentajeDescuentoBp,
      montoDescuentoFijoClp: canje.montoDescuentoFijoClp,
      topeDescuentoClp: canje.topeDescuentoClp,
      porcentajeMaximoCanjeBp: canje.porcentajeMaximoCanjeBp,
    })

    return {
      descuento,
      total: monto - descuento,
    }
  }, [canje, montoBruto])

  useEffect(() => {
    if (!cajaActual || !credencialTerminal) return

    const contextoTerminal = {
      turnoId,
      credencial: credencialTerminal,
    }

    let vigente = true
    const inicio = window.setTimeout(() => {
      setCargandoBeneficios(true)

      void Promise.all([
        listarBeneficiosCanjeTerminal(contextoTerminal),
        listarHistorialCanjesNegocio(contextoTerminal),
      ])
        .then(([beneficiosDisponibles, historialCanjes]) => {
          if (!vigente) return
          setBeneficios(beneficiosDisponibles)
          setHistorial(historialCanjes)
        })
        .catch((errorCapturado) => {
          if (vigente) setError(mensajeSupabase(errorCapturado))
        })
        .finally(() => {
          if (vigente) setCargandoBeneficios(false)
        })
    }, 0)

    return () => {
      vigente = false
      window.clearTimeout(inicio)
    }
  }, [cajaActual, credencialTerminal, turnoId])

  useEffect(() => {
    if (!cajaActual || !credencialTerminal) return

    const contextoTerminal = {
      turnoId,
      credencial: credencialTerminal,
    }

    const intervalo = window.setInterval(() => {
      void listarHistorialCanjesNegocio(contextoTerminal)
        .then(setHistorial)
        .catch(() => undefined)
    }, 15_000)

    return () => window.clearInterval(intervalo)
  }, [cajaActual, credencialTerminal, turnoId])

  useEffect(() => {
    if (!canje) return

    const actualizar = () => {
      const restantes = Math.max(
        0,
        Math.ceil((new Date(canje.expiraEn).getTime() - Date.now()) / 1000),
      )
      setSegundosRestantes(restantes)

      if (restantes === 0) {
        setCanje(null)
        setMontoBruto('')
        setMensaje('La reserva venció. Los REGIS volverán al saldo disponible.')
      }
    }

    actualizar()
    const intervalo = window.setInterval(actualizar, 1000)
    return () => window.clearInterval(intervalo)
  }, [canje])

  const limpiarResultado = () => {
    setResultado(null)
    setMensaje(null)
    setError(null)
  }

  const consultarQr = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()

    if (!credencialTerminal) {
      setError('La credencial segura de esta Terminal PWA no está disponible.')
      return
    }

    if (tokenQr.trim().length < 16) {
      setError('Escanea el QR o pega el código temporal completo.')
      return
    }

    setProcesando(true)
    setError(null)
    setMensaje(null)
    setResultado(null)

    try {
      const consultado = await consultarCanjeRegisQr(tokenQr.trim(), {
        turnoId,
        credencial: credencialTerminal,
      })
      if (!consultado) {
        setError('No encontramos una reserva asociada a ese QR.')
        return
      }

      if (consultado.estado !== 'reservado') {
        setError(`Este canje ya está ${consultado.estado}.`)
        return
      }

      setCanje(revisionDesdeQr(consultado, cajaId, tokenQr.trim()))
      setMontoBruto('')
      setFolioBoleta('')
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const reservarConLlavero = async (beneficio: BeneficioCanjeTerminal) => {
    const tieneLecturaSegura = Boolean(
      lecturaLlaveroId && credencialTerminal,
    )
    const tieneTokenManual = tokenLlavero.trim().length >= 8

    if (
      !llaveroActivo ||
      (!tieneLecturaSegura && !tieneTokenManual) ||
      !cajaId
    ) {
      setError('Lee un llavero activo antes de elegir el beneficio.')
      return
    }

    setProcesando(true)
    setError(null)
    setMensaje(null)
    setResultado(null)

    try {
      const idempotencia = `terminal-llavero-${crypto.randomUUID()}`

      if (!credencialTerminal) {
        setError('La credencial segura de esta Terminal PWA no está disponible.')
        return
      }

      const reserva = tieneLecturaSegura && lecturaLlaveroId
        ? await reservarCanjeRegisDesdeLectura(
            lecturaLlaveroId,
            beneficio.id,
            idempotencia,
            { turnoId, credencial: credencialTerminal },
          )
        : await reservarCanjeRegisLlavero(
            tokenLlavero.trim(),
            beneficio.id,
            idempotencia,
            { turnoId, credencial: credencialTerminal },
          )

      if (!reserva) {
        setError('Supabase no devolvió la reserva del beneficio.')
        return
      }

      setCanje(revisionDesdeLlavero(reserva, beneficio, cajaId))
      setMontoBruto('')
      setFolioBoleta('')
      setMensaje('REGIS reservados. Revisa el monto antes de confirmar.')
      if (lecturaLlaveroId) alConsumirLectura()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const confirmar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!canje) return

    if (!credencialTerminal) {
      setError('La credencial segura de esta Terminal PWA no está disponible.')
      return
    }

    const monto = Number(montoBruto)
    if (!Number.isInteger(monto) || monto <= 0) {
      setError('El monto bruto debe ser un número entero mayor que cero.')
      return
    }

    if (monto < canje.compraMinimaClp) {
      setError(
        `La compra debe ser de al menos ${formatearPesos(canje.compraMinimaClp)} para usar este beneficio.`,
      )
      return
    }

    setProcesando(true)
    setError(null)
    setMensaje(null)

    try {
      const confirmado = await confirmarCompraConCanje(
        canje.canjeId,
        monto,
        folioBoleta,
        canje.tokenQr,
        { turnoId, credencial: credencialTerminal },
      )

      if (!confirmado) {
        setError('Supabase no devolvió el resultado del canje.')
        return
      }

      setResultado(confirmado)
      setCanje(null)
      setTokenQr('')
      setMontoBruto('')
      setFolioBoleta('')
      setMensaje('Compra y canje confirmados en una sola operación.')
      await alConfirmar()
      if (cajaActual) {
        setHistorial(
          await listarHistorialCanjesNegocio({
            turnoId,
            credencial: credencialTerminal,
          }),
        )
      }
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const cancelarReserva = async () => {
    if (!canje) return

    if (canje.origen === 'qr') {
      setCanje(null)
      setMontoBruto('')
      setFolioBoleta('')
      setMensaje('Lectura cerrada. El QR sigue vigente para el vecino hasta su vencimiento.')
      return
    }

    setProcesando(true)
    setError(null)
    setMensaje(null)

    try {
      if (!credencialTerminal) {
        setError('La credencial segura de esta Terminal PWA no está disponible.')
        return
      }

      await cancelarCanjeRegis(canje.canjeId, {
        turnoId,
        credencial: credencialTerminal,
      })
      setCanje(null)
      setMontoBruto('')
      setFolioBoleta('')
      setMensaje('Reserva cancelada. Los REGIS volvieron al saldo disponible.')
      await alConfirmar()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const marcarHistorialComoLeido = async () => {
    if (!credencialTerminal) {
      setError('La credencial segura de esta Terminal PWA no está disponible.')
      return
    }

    const pendientes = historial.filter(({ leido }) => !leido)
    if (pendientes.length === 0) return

    setMarcandoLeidos(true)
    setError(null)
    try {
      await Promise.all(
        pendientes.map(({ canje_id }) =>
          marcarCanjeNegocioLeido(canje_id, {
            turnoId,
            credencial: credencialTerminal,
          }),
        ),
      )
      setHistorial((actual) =>
        actual.map((registro) => ({ ...registro, leido: true })),
      )
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setMarcandoLeidos(false)
    }
  }

  return (
    <section className="canjes" aria-labelledby="canjes-title">
      <div className="canjes__encabezado">
        <div>
          <span className="terminal-eyebrow">Canje de recompensas</span>
          <h2 id="canjes-title">Usar REGIS en esta compra</h2>
        </div>
        <p>
          El descuento y el débito de REGIS se confirman juntos. Si algo falla,
          no se registra ninguna parte de la operación.
        </p>
      </div>

      {(error || mensaje) && (
        <p
          className={`canjes__aviso ${error ? 'canjes__aviso--error' : ''}`}
          role="status"
        >
          {error ?? mensaje}
        </p>
      )}

      {resultado && (
        <article className="canjes__resultado">
          <div>
            <span>Canje confirmado</span>
            <strong>{formatearPesos(resultado.monto_final_pagado_clp)}</strong>
            <small>Total pagado después del descuento</small>
          </div>
          <dl>
            <div>
              <dt>Compra original</dt>
              <dd>{formatearPesos(resultado.monto_compra_bruto_clp)}</dd>
            </div>
            <div>
              <dt>Descuento</dt>
              <dd>-{formatearPesos(resultado.descuento_total_clp)}</dd>
            </div>
            <div>
              <dt>REGIS utilizados</dt>
              <dd>{resultado.regis_utilizados}</dd>
            </div>
          </dl>
          <button type="button" onClick={limpiarResultado}>
            Preparar otro canje
          </button>
        </article>
      )}

      {!resultado && !canje && (
        <div className="canjes__metodos">
          <article className="canjes__metodo">
            <span className="canjes__numero">1</span>
            <div>
              <h3>Canje digital con QR</h3>
              <p>
                El vecino genera un QR desde Mis REGIS. Escanéalo o pega el
                código temporal para revisar la reserva.
              </p>
            </div>
            <form onSubmit={consultarQr}>
              <label>
                Código leído desde el QR
                <input
                  required
                  type="password"
                  minLength={16}
                  maxLength={500}
                  autoComplete="off"
                  value={tokenQr}
                  onChange={(evento) => setTokenQr(evento.target.value)}
                  placeholder="Escanea el QR aquí"
                />
              </label>
              <button type="submit" disabled={procesando || !cajaId}>
                {procesando ? 'Consultando…' : 'Revisar QR'}
              </button>
            </form>
          </article>

          <article className="canjes__metodo">
            <span className="canjes__numero">2</span>
            <div>
              <h3>Canje asistido con llavero</h3>
              <p>
                Lee primero el llavero en la sección superior y luego elige un
                beneficio disponible para este comercio.
              </p>
            </div>

            {!llaveroActivo ? (
              <p className="canjes__estado-vacio">
                Aún no hay un llavero activo leído en esta caja.
              </p>
            ) : cargandoBeneficios ? (
              <p className="canjes__estado-vacio">Cargando beneficios…</p>
            ) : beneficios.length === 0 ? (
              <p className="canjes__estado-vacio">
                Este comercio no tiene beneficios publicados y vigentes.
              </p>
            ) : (
              <div className="canjes__beneficios">
                {beneficios.map((beneficio) => {
                  const saldoInsuficiente =
                    saldoLlavero !== null &&
                    saldoLlavero.disponibles < beneficio.costo_regis

                  return (
                    <div key={beneficio.id} className="canjes__beneficio">
                      <div>
                        <strong>{beneficio.nombre}</strong>
                        <span>
                          {describirBeneficio({
                            tipo: beneficio.tipo,
                            porcentajeDescuentoBp:
                              beneficio.porcentaje_descuento_bp,
                            montoDescuentoFijoClp:
                              beneficio.monto_descuento_fijo_clp,
                            topeDescuentoClp: beneficio.tope_descuento_clp,
                          })}
                        </span>
                        <p className="canjes__regla-beneficio">
                          <strong>Regla clara:</strong>{' '}
                          {describirReglaBeneficio({
                            tipo: beneficio.tipo,
                            porcentajeDescuentoBp:
                              beneficio.porcentaje_descuento_bp,
                            montoDescuentoFijoClp:
                              beneficio.monto_descuento_fijo_clp,
                            topeDescuentoClp: beneficio.tope_descuento_clp,
                            porcentajeMaximoCanjeBp:
                              beneficio.porcentaje_maximo_canje_bp,
                            compraMinimaClp: beneficio.compra_minima_clp,
                          })}
                        </p>
                        <small>
                          {beneficio.costo_regis} REGIS · Compra mínima{' '}
                          {formatearPesos(beneficio.compra_minima_clp)}
                        </small>
                      </div>
                      <button
                        type="button"
                        disabled={procesando || saldoInsuficiente}
                        onClick={() => void reservarConLlavero(beneficio)}
                      >
                        {saldoInsuficiente
                          ? 'Saldo insuficiente'
                          : 'Elegir beneficio'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </article>
        </div>
      )}

      {!resultado && canje && (
        <article className="canjes__revision">
          <div className="canjes__revision-encabezado">
            <div>
              <span className="terminal-eyebrow">
                {canje.origen === 'qr' ? 'Reserva QR' : 'Reserva con llavero'}
              </span>
              <h3>{canje.nombreBeneficio}</h3>
              <p>{describirBeneficio(canje)}</p>
              <p className="canjes__regla-beneficio">
                <strong>Regla clara:</strong> {describirReglaBeneficio(canje)}
              </p>
            </div>
            <div className="canjes__temporizador">
              <span>Tiempo restante</span>
              <strong>
                {Math.floor(segundosRestantes / 60)}:
                {(segundosRestantes % 60).toString().padStart(2, '0')}
              </strong>
            </div>
          </div>

          <dl className="canjes__detalle">
            <div>
              <dt>Código</dt>
              <dd>{canje.codigoPublico}</dd>
            </div>
            <div>
              <dt>Costo</dt>
              <dd>{canje.costoRegis} REGIS</dd>
            </div>
            <div>
              <dt>Compra mínima</dt>
              <dd>{formatearPesos(canje.compraMinimaClp)}</dd>
            </div>
          </dl>

          <form className="canjes__confirmacion" onSubmit={confirmar}>
            <label>
              Monto bruto de la compra
              <input
                required
                type="number"
                inputMode="numeric"
                min={canje.compraMinimaClp}
                step="1"
                value={montoBruto}
                onChange={(evento) => setMontoBruto(evento.target.value)}
                placeholder={`Mínimo ${canje.compraMinimaClp}`}
              />
              <small>Es el total antes de aplicar el beneficio.</small>
            </label>
            <label>
              Folio de boleta (opcional)
              <input
                type="text"
                maxLength={120}
                value={folioBoleta}
                onChange={(evento) => setFolioBoleta(evento.target.value)}
                placeholder="Ejemplo: 0001842"
              />
            </label>
            {vistaPreviaDescuento && (
              <dl className="canjes__vista-previa">
                <div>
                  <dt>Descuento que se aplicará</dt>
                  <dd>-{formatearPesos(vistaPreviaDescuento.descuento)}</dd>
                </div>
                <div>
                  <dt>Total que pagará el vecino</dt>
                  <dd>{formatearPesos(vistaPreviaDescuento.total)}</dd>
                </div>
              </dl>
            )}
            <div className="canjes__acciones">
              <button type="submit" disabled={procesando}>
                {procesando ? 'Confirmando…' : 'Confirmar compra y canje'}
              </button>
              <button
                type="button"
                className="secundario"
                disabled={procesando}
                onClick={() => void cancelarReserva()}
              >
                {canje.origen === 'qr'
                  ? 'Cerrar lectura'
                  : 'Cancelar reserva'}
              </button>
            </div>
          </form>
        </article>
      )}

      <section className="canjes__historial" aria-labelledby="canjes-historial-title">
        <div className="canjes__historial-encabezado">
          <div>
            <span className="terminal-eyebrow">Actividad del comercio</span>
            <h3 id="canjes-historial-title">Canjes recientes</h3>
            <p>
              Aquí queda el comprobante de cada beneficio utilizado, con su
              hora, descuento y total pagado.
            </p>
          </div>
          <div className="canjes__historial-controles">
            <label>
              Beneficio
              <select
                value={filtroBeneficioId}
                onChange={(evento) => setFiltroBeneficioId(evento.target.value)}
              >
                <option value="todos">Todos los beneficios</option>
                {beneficiosHistorial.map((beneficio) => (
                  <option key={beneficio.id} value={beneficio.id}>
                    {beneficio.nombre}
                  </option>
                ))}
              </select>
            </label>
            {canjesNoLeidos > 0 && (
              <button
                type="button"
                disabled={marcandoLeidos}
                onClick={() => void marcarHistorialComoLeido()}
              >
                {marcandoLeidos
                  ? 'Marcando…'
                  : `${canjesNoLeidos} ${canjesNoLeidos === 1 ? 'nuevo' : 'nuevos'} · Marcar revisados`}
              </button>
            )}
          </div>
        </div>

        {historialFiltrado.length === 0 ? (
          <p className="canjes__estado-vacio">
            Aún no hay canjes confirmados para esta selección.
          </p>
        ) : (
          <div className="canjes__historial-lista">
            {historialFiltrado.map((registro) => (
              <article
                key={registro.canje_id}
                className={`canjes__historial-item ${
                  registro.leido ? '' : 'canjes__historial-item--nuevo'
                }`}
              >
                <header>
                  <div>
                    {!registro.leido && <span>Nuevo</span>}
                    <strong>{registro.nombre_beneficio}</strong>
                    <time>{formatearFecha(registro.confirmado_en)}</time>
                  </div>
                  <b>-{registro.costo_regis} REGIS</b>
                </header>
                <dl>
                  <div>
                    <dt>Compra original</dt>
                    <dd>{formatearPesos(registro.monto_compra_bruto_clp)}</dd>
                  </div>
                  <div>
                    <dt>Descuento</dt>
                    <dd>-{formatearPesos(registro.descuento_total_clp)}</dd>
                  </div>
                  <div>
                    <dt>Total pagado</dt>
                    <dd>{formatearPesos(registro.monto_final_pagado_clp)}</dd>
                  </div>
                </dl>
                <small>
                  {registro.origen === 'qr' ? 'Canje digital' : 'Canje asistido'}
                  {' · '}{registro.codigo_publico}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

export default CanjesRegis
