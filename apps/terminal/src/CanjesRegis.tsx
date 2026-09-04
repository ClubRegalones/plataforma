import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  calcularCompraParaDescuentoCompleto,
  calcularDescuentoBeneficio,
} from '@club-regalones/domain'
import {
  consultarSaldoRegisLlavero,
  type SaldoRegisLlavero,
} from './lib/regis'
import {
  cancelarCanjeRegis,
  consultarCanjeRegisQr,
  listarBeneficiosCanjeTerminal,
  listarBeneficiosCanjeDesdeLectura,
  listarHistorialCanjesNegocio,
  marcarCanjeNegocioLeido,
  reservarCanjeRegisDesdeLectura,
  reservarCanjeRegisLlavero,
  confirmarCompraConCanje,
} from './lib/canjes'
import type {
  BeneficioCanjeTerminal,
  BeneficioCanjeLlaveroTerminal,
  CanjeQrConsultado,
  HistorialCanjeNegocio,
  ReservaCanjeLlavero,
  ResultadoCanje,
} from './lib/canjes'
import regalonCorazon from './recursos/mascota/regalon-corazon.png'
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
  tokenLlavero?: string
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
  nombreVecinoLlavero: string | null
  alConsumirLectura: () => void
  alConfirmar: () => Promise<void> | void
  alVolverACompras: () => void
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
  tokenLlavero: string,
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
    tokenLlavero,
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
  nombreVecinoLlavero,
  alConsumirLectura,
  alConfirmar,
  alVolverACompras,
}: CanjesRegisProps) {
  const [tokenQr, setTokenQr] = useState('')
  const [beneficios, setBeneficios] = useState<BeneficioCanjeTerminal[]>([])
  const [beneficiosLlavero, setBeneficiosLlavero] =
    useState<BeneficioCanjeLlaveroTerminal[]>([])
  const [cargandoBeneficiosLlavero, setCargandoBeneficiosLlavero] =
    useState(false)
  const [cargandoBeneficios, setCargandoBeneficios] = useState(false)
  const [canje, setCanje] = useState<CanjeEnRevision | null>(null)
  const [montoBruto, setMontoBruto] = useState('')
  const [folioBoleta, setFolioBoleta] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [segundosRestantes, setSegundosRestantes] = useState(0)
  const [resultado, setResultado] = useState<ResultadoCanje | null>(null)
  const [ultimoCanje, setUltimoCanje] = useState<CanjeEnRevision | null>(null)
  const [saldoFinalCanje, setSaldoFinalCanje] =
    useState<SaldoRegisLlavero | null>(null)
  const [saldoAntesCanjeLlavero, setSaldoAntesCanjeLlavero] =
    useState<SaldoRegisLlavero | null>(null)
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

  const ultimosCanjes = useMemo(
    () => historial.slice(0, 2),
    [historial],
  )

  const beneficiosDisponiblesLlavero = useMemo(
    () =>
      beneficiosLlavero.filter(
        ({ estado_disponibilidad }) => estado_disponibilidad === 'disponible',
      ),
    [beneficiosLlavero],
  )

  const beneficiosNoDisponiblesLlavero = useMemo(
    () =>
      beneficiosLlavero.filter(
        ({ estado_disponibilidad }) => estado_disponibilidad !== 'disponible',
      ),
    [beneficiosLlavero],
  )

  const vistaPreviaDescuento = useMemo(() => {
    const monto = Number(montoBruto)
    if (
      !canje ||
      !Number.isInteger(monto) ||
      monto < canje.compraMinimaClp
    ) return null

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
    if (!lecturaLlaveroId || !credencialTerminal || !llaveroActivo) {
      setBeneficiosLlavero([])
      setCargandoBeneficiosLlavero(false)
      return
    }

    let vigente = true

    setCargandoBeneficiosLlavero(true)

    void listarBeneficiosCanjeDesdeLectura(
      lecturaLlaveroId,
      {
        turnoId,
        credencial: credencialTerminal,
      },
    )
      .then((beneficiosVecino) => {
        if (!vigente) return
        setBeneficiosLlavero(beneficiosVecino)
      })
      .catch((errorCapturado) => {
        if (!vigente) return
        setBeneficiosLlavero([])
        setError(mensajeSupabase(errorCapturado))
      })
      .finally(() => {
        if (vigente) setCargandoBeneficiosLlavero(false)
      })

    return () => {
      vigente = false
    }
  }, [
    lecturaLlaveroId,
    credencialTerminal,
    llaveroActivo,
    turnoId,
  ])
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


  // AUTO OCULTAR AVISOS CANJES
  useEffect(() => {
    if (!error && !mensaje) return

    const temporizador = window.setTimeout(() => {
      setError(null)
      setMensaje(null)
    }, 10_000)

    return () => window.clearTimeout(temporizador)
  }, [error, mensaje])
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
      setSaldoAntesCanjeLlavero(saldoLlavero)

      setCanje(revisionDesdeLlavero(reserva, beneficio, cajaId, tokenLlavero.trim()))
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

      setUltimoCanje(canje)

      if (canje.origen === 'llavero') {
        let saldoActualizado: SaldoRegisLlavero | null = null

        if (canje.tokenLlavero) {
          try {
            saldoActualizado = await consultarSaldoRegisLlavero(
              canje.tokenLlavero,
              turnoId,
              credencialTerminal,
            )
          } catch {
            saldoActualizado = null
          }
        }

        if (saldoActualizado) {
          setSaldoFinalCanje(saldoActualizado)
        } else if (saldoAntesCanjeLlavero) {
          setSaldoFinalCanje({
            ...saldoAntesCanjeLlavero,
            disponibles: Math.max(
              0,
              saldoAntesCanjeLlavero.disponibles - confirmado.regis_utilizados,
            ),
          })
        } else {
          setSaldoFinalCanje(null)
        }
      } else {
        setSaldoFinalCanje(null)
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
    <section className={`canjes canjes--${resultado ? 'resultado' : canje ? 'revision' : 'inicio'}`} aria-labelledby="canjes-title">
      <div className="canjes__encabezado">
        <div>
          <span className="terminal-eyebrow">
            {resultado
              ? 'Canje completado'
              : canje
                ? 'Confirmación de canje'
                : 'Canje de recompensas'}
          </span>
          <h2 id="canjes-title">
            {resultado
              ? '¡Canje confirmado!'
              : canje
                ? 'Confirmar canje'
                : 'Usar REGIS en esta compra'}
          </h2>
        </div>
        <p>
          El descuento y los REGIS se confirman juntos.
        </p>
      </div>

      {!resultado && !canje && (
        <img
          className="canjes__mascota-inicio"
          src={regalonCorazon}
          alt=""
          aria-hidden="true"
        />
      )}

      {(error || mensaje) && (
        <p
          className={`canjes__aviso ${error ? 'canjes__aviso--error' : ''}`}
          role="status"
        >
          {error ?? mensaje}
        </p>
      )}

      {resultado && (
        <article className="canje-resultado-v2">
          <div className="canje-resultado-v2__cabecera">
            <div className="canje-resultado-v2__titulo">
              <h3>¡Canje confirmado!</h3>

              <span
                className="canje-resultado-v2__check"
                aria-hidden="true"
              >
                ✓
              </span>
            </div>

            <p>El canje se realizó correctamente.</p>
          </div>

          {ultimoCanje && (
            <div className="canje-resultado-v2__beneficio">
              <div className="canje-resultado-v2__beneficio-principal">
                <span
                  className="canje-resultado-v2__icono"
                  aria-hidden="true"
                >
                  %
                </span>

                <strong>{ultimoCanje.nombreBeneficio}</strong>
              </div>

              <div className="canje-resultado-v2__dato">
                <span
                  className="canje-resultado-v2__icono"
                  aria-hidden="true"
                >
                  R
                </span>

                <div>
                  <small>Costo</small>
                  <strong>{resultado.regis_utilizados} REGIS</strong>
                </div>
              </div>

              <div className="canje-resultado-v2__dato">
                <span
                  className="canje-resultado-v2__icono"
                  aria-hidden="true"
                >
                  $
                </span>

                <div>
                  <small>Compra mínima</small>
                  <strong>
                    {formatearPesos(ultimoCanje.compraMinimaClp)}
                  </strong>
                </div>
              </div>
            </div>
          )}

          <div className="canje-resultado-v2__resumen">
            <div>
              <span
                className="canje-resultado-v2__icono"
                aria-hidden="true"
              >
                %
              </span>

              <div>
                <small>Descuento aplicado</small>
                <strong>
                  -{formatearPesos(resultado.descuento_total_clp)}
                </strong>
              </div>
            </div>

            <div>
              <span
                className="canje-resultado-v2__icono"
                aria-hidden="true"
              >
                $
              </span>

              <div>
                <small>Total a pagar</small>
                <strong>
                  {formatearPesos(resultado.monto_final_pagado_clp)}
                </strong>
              </div>
            </div>

            <div className="canje-resultado-v2__restantes">
              <span
                className="canje-resultado-v2__icono"
                aria-hidden="true"
              >
                R
              </span>

              <div>
                <small>REGIS restantes</small>
                <strong>
                  {saldoFinalCanje
                    ? `${saldoFinalCanje.disponibles} REGIS`
                    : 'Saldo actualizado'}
                </strong>
              </div>
            </div>
          </div>

          <div className="canje-resultado-v2__monto">
            <small>Monto bruto de la compra</small>
            <strong>
              {formatearPesos(resultado.monto_compra_bruto_clp)}
            </strong>
          </div>

          <div className="canje-resultado-v2__acciones">
            <button
              type="button"
              className="canje-resultado-v2__principal"
              onClick={() => {
                limpiarResultado()
                alVolverACompras()
              }}
            >
              <span>Finalizar y volver a ventas</span>
              <strong aria-hidden="true">›</strong>
            </button>

            <button
              type="button"
              className="canje-resultado-v2__secundario"
              onClick={limpiarResultado}
            >
              Nuevo canje
            </button>
          </div>

          <img
            className="canje-resultado-v2__mascota"
            src={regalonCorazon}
            alt=""
            aria-hidden="true"
          />
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

          <article className="canjes__metodo canjes__metodo--llavero">
            <span className="canjes__numero">2</span>
            <div>
              <h3>Canje asistido con llavero</h3>
              <p>
                Acerca el llavero al lector para ver los beneficios disponibles.
              </p>
            </div>

            {!llaveroActivo ? (
              <p className="canjes__estado-vacio">
                Acerca un llavero activo al lector.
              </p>
            ) : lecturaLlaveroId ? (
              cargandoBeneficiosLlavero ? (
                <p className="canjes__estado-vacio">
                  Revisando beneficios del vecino…
                </p>
              ) : beneficiosLlavero.length === 0 ? (
                <p className="canjes__estado-vacio">
                  No encontramos beneficios vigentes para este comercio.
                </p>
              ) : (
                <div className="canjes__beneficios">
                  <div className="canjes__vecino-identificado">
                    <div>
                      <span>Vecino identificado</span>
                      <strong>
                        {nombreVecinoLlavero ?? 'Vecino Regalón'}
                      </strong>
                    </div>

                    <div className="canjes__saldo-vecino">
                      <span>REGIS disponibles</span>
                      <strong>
                        {beneficiosLlavero[0]?.saldo_disponible ??
                          saldoLlavero?.disponibles ??
                          0}{' '}
                        REGIS
                      </strong>
                    </div>
                  </div>

                  {beneficiosDisponiblesLlavero.length > 0 && (
                    <div className="canjes__beneficios-seccion">
                      <span className="canjes__beneficios-titulo">
                        Beneficios disponibles
                      </span>

                      {beneficiosDisponiblesLlavero.map((beneficio) => (
                        <div
                          key={beneficio.id}
                          className="canjes__beneficio canjes__beneficio--disponible"
                        >
                          <div>
                            <strong>{beneficio.nombre}</strong>

                            <small>
                              {beneficio.costo_regis} REGIS · Compra mínima{' '}
                              {formatearPesos(beneficio.compra_minima_clp)}
                            </small>
                          </div>

                          <button
                            type="button"
                            disabled={procesando}
                            onClick={() =>
                              void reservarConLlavero(beneficio)
                            }
                          >
                            Elegir beneficio
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {beneficiosNoDisponiblesLlavero.length > 0 && (
                    <div className="canjes__beneficios-seccion canjes__beneficios-seccion--bloqueada">
                      <span className="canjes__beneficios-titulo">
                        No disponibles
                      </span>

                      {beneficiosNoDisponiblesLlavero.map((beneficio) => {
                        const mensajeEstado =
                          beneficio.estado_disponibilidad ===
                          'limite_alcanzado'
                            ? beneficio.limite_por_vecino === 1 &&
                              beneficio.canjes_confirmados_vecino > 0
                              ? 'Canje ya utilizado'
                              : 'Límite de canjes alcanzado'
                            : beneficio.estado_disponibilidad ===
                                'saldo_insuficiente'
                              ? 'REGIS insuficientes'
                              : beneficio.estado_disponibilidad ===
                                  'agotado'
                                ? 'Beneficio agotado'
                                : 'No disponible'

                        return (
                          <div
                            key={beneficio.id}
                            className="canjes__beneficio canjes__beneficio--bloqueado"
                          >
                            <div>
                              <strong>{beneficio.nombre}</strong>

                              <small>
                                {beneficio.costo_regis} REGIS · Compra mínima{' '}
                                {formatearPesos(
                                  beneficio.compra_minima_clp,
                                )}
                              </small>
                            </div>

                            <span className="canjes__beneficio-estado">
                              ✓ {mensajeEstado}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            ) : cargandoBeneficios ? (
              <p className="canjes__estado-vacio">
                Cargando beneficios…
              </p>
            ) : beneficios.length === 0 ? (
              <p className="canjes__estado-vacio">
                Este comercio no tiene beneficios publicados y vigentes.
              </p>
            ) : (
              <div className="canjes__beneficios">
                {saldoLlavero && (
                  <div className="canjes__vecino-identificado">
                    <div>
                      <span>Vecino identificado</span>
                      <strong>
                        {nombreVecinoLlavero ?? 'Vecino Regalón'}
                      </strong>
                    </div>

                    <div className="canjes__saldo-vecino">
                      <span>REGIS disponibles</span>
                      <strong>{saldoLlavero.disponibles} REGIS</strong>
                    </div>
                  </div>
                )}

                {beneficios.map((beneficio) => {
                  const saldoInsuficiente =
                    saldoLlavero !== null &&
                    saldoLlavero.disponibles < beneficio.costo_regis

                  return (
                    <div
                      key={beneficio.id}
                      className="canjes__beneficio"
                    >
                      <div>
                        <strong>{beneficio.nombre}</strong>

                        <small>
                          {beneficio.costo_regis} REGIS · Compra mínima{' '}
                          {formatearPesos(beneficio.compra_minima_clp)}
                        </small>
                      </div>

                      <button
                        type="button"
                        disabled={procesando || saldoInsuficiente}
                        onClick={() =>
                          void reservarConLlavero(beneficio)
                        }
                      >
                        {saldoInsuficiente
                          ? 'REGIS insuficientes'
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
        <article className="canje-confirmacion-v2">
          <div className="canje-confirmacion-v2__cabecera">
            <div>
              <h3>Confirmar canje</h3>
              <p>Revisa el monto antes de confirmar.</p>
            </div>

            <div className="canje-confirmacion-v2__tiempo">
              <span>Reserva activa</span>
              <strong>
                {Math.floor(segundosRestantes / 60)}:
                {(segundosRestantes % 60).toString().padStart(2, '0')}
              </strong>
            </div>
          </div>

          <div className="canje-confirmacion-v2__aviso">
            <span className="canje-confirmacion-v2__check" aria-hidden="true">
              ✓
            </span>

            <strong>REGIS reservados.</strong>
            <span>Revisa el monto antes de confirmar.</span>
          </div>

          <div className="canje-confirmacion-v2__beneficio">
            <div className="canje-confirmacion-v2__beneficio-principal">
              <span className="canje-confirmacion-v2__icono" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 4h14v5a3 3 0 0 0 0 6v5H5v-5a3 3 0 0 0 0-6V4Z" />
                  <path d="m9 15 6-6" />
                  <circle cx="9" cy="9" r="1" />
                  <circle cx="15" cy="15" r="1" />
                </svg>
              </span>

              <strong>{canje.nombreBeneficio}</strong>
            </div>

            <div className="canje-confirmacion-v2__dato">
              <span className="canje-confirmacion-v2__icono canje-confirmacion-v2__icono--regis">
                R
              </span>

              <div>
                <small>Costo</small>
                <strong>{canje.costoRegis} REGIS</strong>
              </div>
            </div>

            <div className="canje-confirmacion-v2__dato">
              <span className="canje-confirmacion-v2__icono" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 8h14l1 13H4L5 8Z" />
                  <path d="M9 9V6a3 3 0 0 1 6 0v3" />
                </svg>
              </span>

              <div>
                <small>Compra mínima</small>
                <strong>{formatearPesos(canje.compraMinimaClp)}</strong>
              </div>
            </div>
          </div>

          <form
            className="canje-confirmacion-v2__formulario"
            onSubmit={confirmar}
          >
            <div className="canje-confirmacion-v2__campos">
              <label>
                <span>Monto bruto de la compra</span>

                <div className="canje-confirmacion-v2__input-monto">
                  <strong>$</strong>
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
                </div>
              </label>

              <label>
                <span>
                  Folio de boleta <small>(opcional)</small>
                </span>

                <input
                  type="text"
                  maxLength={120}
                  value={folioBoleta}
                  onChange={(evento) => setFolioBoleta(evento.target.value)}
                  placeholder="Ejemplo: 0001842"
                />
              </label>
            </div>

            <div className="canje-confirmacion-v2__resumen">
              <div>
                <span className="canje-confirmacion-v2__icono" aria-hidden="true">
                  %
                </span>

                <div>
                  <small>Descuento aplicado</small>
                  <strong>
                    {vistaPreviaDescuento
                      ? `-${formatearPesos(vistaPreviaDescuento.descuento)}`
                      : '—'}
                  </strong>
                </div>
              </div>

              <div>
                <span className="canje-confirmacion-v2__icono" aria-hidden="true">
                  $
                </span>

                <div>
                  <small>Total a pagar</small>
                  <strong>
                    {vistaPreviaDescuento
                      ? formatearPesos(vistaPreviaDescuento.total)
                      : '—'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="canje-confirmacion-v2__acciones">
              <button
                type="submit"
                className="canje-confirmacion-v2__confirmar"
                disabled={
                procesando ||
                !Number.isInteger(Number(montoBruto)) ||
                Number(montoBruto) < canje.compraMinimaClp
              }
              >
                <span>
                  {procesando
                    ? 'Confirmando…'
                    : 'Confirmar compra y canje'}
                </span>
                <strong aria-hidden="true">›</strong>
              </button>

              <button
                type="button"
                className="canje-confirmacion-v2__cancelar"
                disabled={procesando}
                onClick={() => void cancelarReserva()}
              >
                {canje.origen === 'qr'
                  ? 'Cerrar lectura'
                  : 'Cancelar reserva'}
              </button>
            </div>
          </form>

          <img
            className="canje-confirmacion-v2__mascota"
            src={regalonCorazon}
            alt=""
            aria-hidden="true"
          />
        </article>
      )}

      {!resultado && !canje && (
        <section
          className="canjes-recientes-v2"
          aria-labelledby="canjes-historial-title"
        >
          <div className="canjes-recientes-v2__titulo">
            <span
              className="canjes-recientes-v2__icono"
              aria-hidden="true"
            >
              ↻
            </span>

            <div>
              <h3 id="canjes-historial-title">Canjes recientes</h3>
              <p>Últimos canjes realizados</p>
            </div>
          </div>

          {ultimosCanjes.length === 0 ? (
            <p className="canjes-recientes-v2__vacio">
              Aún no hay canjes realizados.
            </p>
          ) : (
            <div className="canjes-recientes-v2__lista">
              {ultimosCanjes.map((registro) => (
                <article
                  key={registro.canje_id}
                  className="canjes-recientes-v2__item"
                >
                  <div className="canjes-recientes-v2__avatar">
                    R
                  </div>

                  <div className="canjes-recientes-v2__info">
                    <strong>{registro.nombre_beneficio}</strong>

                    <span>
                      <b>
                        {registro.origen === 'llavero'
                          ? 'Llavero'
                          : 'QR'}
                      </b>

                      {' · '}

                      {new Intl.DateTimeFormat('es-CL', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(registro.confirmado_en))}
                    </span>
                  </div>

                  <div className="canjes-recientes-v2__monto">
                    <strong>-{registro.costo_regis} REGIS</strong>
                    <span>
                      {formatearPesos(registro.descuento_total_clp)} desc.
                    </span>
                  </div>

                  <span
                    className="canjes-recientes-v2__flecha"
                    aria-hidden="true"
                  >
                    ›
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  )
}

export default CanjesRegis
