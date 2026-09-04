import tiendaIcono from './recursos/iconos/tienda.png'
import lectorNfcIcono from './recursos/iconos/lector-nfc.png'
import regalonCorazon from './recursos/mascota/regalon-corazon.png'
import regalonPrimerUso from './recursos/mascota/regalon-primer-uso.png'
import type { Tables } from '@club-regalones/domain'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  crearCompraAsistida,
  crearCompraAsistidaDesdeLectura,
} from './lib/compras'
import {
  activarLlaveroDesdeLectura,
  activarLlaveroPrimerUso,
  consultarLlaveroActivacion,
} from './lib/llaveros'
import type {
  ContextoActivacionLlavero,
  MetodoActivacionLlavero,
} from './lib/llaveros'
import {
  calcularVistaPreviaRegis,
  consultarSaldoRegisLlavero,
  obtenerReglaAcumulacionVigente,
} from './lib/regis'
import type {
  ReglaAcumulacionRegis,
  SaldoRegisLlavero,
} from './lib/regis'
import { mensajeSupabase } from './lib/mensajesSupabase'
import ConfiguracionInicialTerminal from './ConfiguracionInicialTerminal'
import NotificacionCompraTerminal from './NotificacionCompraTerminal'
import {
  guardarConfiguracionTerminal,
  leerConfiguracionTerminal,
  validarConfiguracionTerminal,
} from './lib/configuracionTerminal'
import type {
  ConfiguracionTerminalLocal,
} from './lib/configuracionTerminal'
import CanjesRegis from './CanjesRegis'
import EstadoPwa from './EstadoPwa'
import LectorMovil from './LectorMovil'
import VinculacionLector from './VinculacionLector'
import type {
  CredencialTerminalLocal,
  LecturaOperativaTerminal,
} from './lib/terminalPwa'
import InicioTurno from './InicioTurno'
import RecuperarTurno from './RecuperarTurno'
import RelojTerminal from './RelojTerminal'
import {
  aprobarCompraEnTurno,
  buscarVecinoPorTelefonoTerminal,
  cerrarTurnoTerminal,
  consultarTurnoTerminal,
  corregirMontoTerminal,
  crearSolicitudCompraPorTelefonoTerminal,
  informarMontoTerminal,
  listarSolicitudesTerminal,
  listarComprasDetectadasTerminal,
  obtenerResumenTurnoTerminal,
  rechazarSolicitudCompraEnTurno,
  solicitarReingresoMontoTerminal,
} from './lib/turnos'
import type {
  CompraDetectadaTerminal,
  ResumenTurnoTerminal,
  TurnoTerminal,
  VecinoTelefonoTerminal,
} from './lib/turnos'

type Solicitud = Tables<'solicitudes_compra'>

type CajaOperador = {
  id: string
  negocioId: string
  nombre: string
  codigo: string | null
  sucursal: string
}


function formatearMonto(monto: number | null) {
  if (monto === null) return 'Monto pendiente'

  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(monto)
}

function obtenerMontoVigente(solicitud: Solicitud) {
  return solicitud.monto_corregido ?? solicitud.monto_informado
}

function normalizarTelefonoVecino(valor: string) {
  const limpio = valor.trim()

  if (limpio.startsWith('+')) {
    return `+${limpio.slice(1).replace(/\D/g, '')}`
  }

  const digitos = limpio.replace(/\D/g, '')

  if (digitos.length === 9 && digitos.startsWith('9')) {
    return `+56${digitos}`
  }

  if (digitos.length === 11 && digitos.startsWith('56')) {
    return `+${digitos}`
  }

  return limpio
}

function PanelTerminal({
  configuracion,
}: {
  configuracion: ConfiguracionTerminalLocal
}) {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [motivosCorreccion, setMotivosCorreccion] = useState<
    Record<string, string>
  >({})
  const [motivosRechazo, setMotivosRechazo] = useState<Record<string, string>>(
    {},
  )
  const [cargando, setCargando] = useState(true)
  const [procesandoId, setProcesandoId] = useState<string | null>(null)
  const [tokenLlavero, setTokenLlavero] = useState('')

  const credencialTerminal: CredencialTerminalLocal =
    configuracion

  const cajaId = configuracion.cajaId

  const cajas = useMemo<CajaOperador[]>(
    () => [
      {
        id: configuracion.cajaId,
        negocioId: configuracion.negocioId,
        nombre: configuracion.nombreCaja,
        codigo: configuracion.codigoCaja,
        sucursal: configuracion.nombreSucursal,
      },
    ],
    [configuracion],
  )
  const [turno, setTurno] = useState<TurnoTerminal | null>(null)
  const [recuperacionPendiente, setRecuperacionPendiente] =
    useState(false)
  const [cargandoTurno, setCargandoTurno] = useState(true)
  const [cerrandoTurno, setCerrandoTurno] = useState(false)
  const [lecturaLlavero, setLecturaLlavero] =
    useState<LecturaOperativaTerminal | null>(null)
  const [contextoLlavero, setContextoLlavero] =
    useState<ContextoActivacionLlavero | null>(null)
  const [saldoRegisLlavero, setSaldoRegisLlavero] =
    useState<SaldoRegisLlavero | null>(null)
  const [reglaAcumulacion, setReglaAcumulacion] =
    useState<ReglaAcumulacionRegis | null>(null)
  const [errorReglaAcumulacion, setErrorReglaAcumulacion] =
    useState<string | null>(null)
  const [metodoActivacion, setMetodoActivacion] =
    useState<MetodoActivacionLlavero>('cedula')
  const [pinActivacion, setPinActivacion] = useState('')
  const [cedulaVerificada, setCedulaVerificada] = useState(false)
  const [montoCompraAsistida, setMontoCompraAsistida] = useState('')
  const [idempotenciaCompraAsistida, setIdempotenciaCompraAsistida] =
    useState(() => crypto.randomUUID())
  const [procesandoLlavero, setProcesandoLlavero] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [telefonoManual, setTelefonoManual] = useState('')
  const [vecinoManual, setVecinoManual] =
    useState<VecinoTelefonoTerminal | null>(null)
  const [montoManual, setMontoManual] = useState('')
  const [procesandoVentaManual, setProcesandoVentaManual] =
    useState(false)
  const [idempotenciaVentaManual, setIdempotenciaVentaManual] =
    useState(() => crypto.randomUUID())

  const [solicitudEnRevision, setSolicitudEnRevision] =
    useState<Solicitud | null>(null)
  const [montoRevision, setMontoRevision] = useState('')
  const [motivoRevision, setMotivoRevision] = useState('')
  const [resultadoCompra, setResultadoCompra] = useState<{
    nombreVecino: string
    montoFinal: number
    regisGenerados: number
  } | null>(null)

  const [resumenTurno, setResumenTurno] =
    useState<ResumenTurnoTerminal | null>(null)
  const [cargandoResumenTurno, setCargandoResumenTurno] =
    useState(false)

  const [comprasDetectadas, setComprasDetectadas] =
    useState<CompraDetectadaTerminal[]>([])
  const [compraDetectadaOcultaId, setCompraDetectadaOcultaId] =
    useState<string | null>(null)
  const [nombreVecinoRevision, setNombreVecinoRevision] =
    useState<string | null>(null)
  const [modoCompraAsistidaLlavero, setModoCompraAsistidaLlavero] =
    useState(false)

  const [seccionActiva, setSeccionActiva] = useState<
    'compras' | 'lector' | 'canjes' | 'alertas'
  >('compras')

  useEffect(() => {
    if (!mensaje) return

    const temporizador = window.setTimeout(() => {
      setMensaje((actual) =>
        actual === mensaje ? null : actual,
      )
    }, 4_000)

    return () => {
      window.clearTimeout(temporizador)
    }
  }, [mensaje])

  useEffect(() => {
    if (!error) return

    const temporizadorError = window.setTimeout(() => {
      setError((actual) =>
        actual === error ? null : actual,
      )
    }, 5_000)

    return () => {
      window.clearTimeout(temporizadorError)
    }
  }, [error])

  const [enLinea, setEnLinea] = useState(
    navigator.onLine,
  )

  useEffect(() => {
    let vigente = true

    const comprobarConexion = async () => {
      if (!navigator.onLine) {
        if (vigente) {
          setEnLinea(false)
          setError(null)
        }
        return
      }

      try {
        await consultarTurnoTerminal(
          credencialTerminal,
        )

        if (!vigente) return

        setEnLinea(true)
        setError(null)
      } catch {
        if (!vigente) return

        setEnLinea(false)
        setError(null)
      }
    }

    const conectar = () => {
      void comprobarConexion()
    }

    const desconectar = () => {
      setEnLinea(false)
      setError(null)
    }

    const inicio = window.setTimeout(() => {
      void comprobarConexion()
    }, 0)

    const intervalo = window.setInterval(() => {
      void comprobarConexion()
    }, 10_000)

    window.addEventListener('online', conectar)
    window.addEventListener('offline', desconectar)

    return () => {
      vigente = false
      window.clearTimeout(inicio)
      window.clearInterval(intervalo)
      window.removeEventListener('online', conectar)
      window.removeEventListener('offline', desconectar)
    }
  }, [credencialTerminal])

  useEffect(() => {
    let activa = true

    if (!turno || !credencialTerminal) {
      return () => {
        activa = false
      }
    }

    void obtenerReglaAcumulacionVigente(
      turno.turno_id,
      credencialTerminal,
    )
      .then((regla) => {
        if (!activa) return

        setReglaAcumulacion(regla)
        setErrorReglaAcumulacion(null)

        if (!regla) {
          setErrorReglaAcumulacion(
            'No hay una regla REGIS vigente para calcular esta compra.',
          )
        }
      })
      .catch((errorCapturado) => {
        if (!activa) return

        setReglaAcumulacion(null)
        setErrorReglaAcumulacion(
          mensajeSupabase(errorCapturado),
        )
      })

    return () => {
      activa = false
    }
  }, [credencialTerminal, turno])

  const limpiarLecturaOperativa = useCallback(() => {
    setLecturaLlavero(null)
    setContextoLlavero(null)
    setSaldoRegisLlavero(null)
    setMontoCompraAsistida('')
    setIdempotenciaCompraAsistida(crypto.randomUUID())
  }, [])

  useEffect(() => {
    let vigente = true

    void consultarTurnoTerminal(credencialTerminal)
      .then((turnoAbierto) => {
        if (!vigente) return

        setTurno(turnoAbierto)
        setRecuperacionPendiente(
          Boolean(turnoAbierto),
        )
      })
      .catch((errorCapturado) => {
        if (!vigente) return
        setTurno(null)
        setError(mensajeSupabase(errorCapturado))
      })
      .finally(() => {
        if (vigente) setCargandoTurno(false)
      })

    return () => {
      vigente = false
    }
  }, [credencialTerminal])
  const recibirLecturaOperativa = useCallback(
    (lectura: LecturaOperativaTerminal) => {
      setLecturaLlavero(lectura)
      setTokenLlavero('')
      setContextoLlavero({
        codigo_publico: lectura.codigo_publico,
        nombre_vecino: lectura.nombre_vecino,
        estado: lectura.estado,
        entregado: lectura.entregado,
        puede_activar: lectura.puede_activar,
        tiene_pin: lectura.tiene_pin,
      })
      setSaldoRegisLlavero(
        lectura.estado === 'activo'
          ? {
              actualizado_en: lectura.saldo_actualizado_en,
              canjeados: lectura.canjeados,
              disponibles: lectura.disponibles,
              negocio_id: lectura.negocio_id,
              nombre_negocio: lectura.nombre_negocio,
              pendientes: lectura.pendientes,
              remanente_valor_clp: lectura.remanente_valor_clp,
              reservados: lectura.reservados,
            }
          : null,
      )
      setMetodoActivacion('cedula')
      setPinActivacion('')
      setCedulaVerificada(false)
      setMontoCompraAsistida('')
      setIdempotenciaCompraAsistida(crypto.randomUUID())
      setError(null)
      setMensaje(
        `${lectura.codigo_publico} recibido desde el celular lector. Elige la operación.`,
      )
    },
    [],
  )

  const cargarSolicitudes = useCallback(async () => {
    setCargando(true)
    setError(null)

    if (!enLinea || !turno) {
      setSolicitudes([])
      setCargando(false)
      return
    }

    try {
      const data = await listarSolicitudesTerminal(
        turno.turno_id,
        credencialTerminal,
      )

      setSolicitudes(data)

      setMontos((actuales) => {
        const siguientes = { ...actuales }

        data.forEach((solicitud) => {
          const montoVigente =
            obtenerMontoVigente(solicitud)

          if (montoVigente !== null) {
            siguientes[solicitud.id] =
              String(montoVigente)
          }
        })

        return siguientes
      })
    } catch (errorCapturado) {
      setSolicitudes([])
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setCargando(false)
    }
  }, [credencialTerminal, enLinea, turno])
  useEffect(() => {
    const cargaInicial = window.setTimeout(() => {
      void cargarSolicitudes()
    }, 0)

    return () => window.clearTimeout(cargaInicial)
  }, [cargarSolicitudes])

  const cargarResumenTurno = useCallback(async () => {
    if (!turno || !enLinea) {
      setResumenTurno(null)
      return
    }

    setCargandoResumenTurno(true)

    try {
      const resumen = await obtenerResumenTurnoTerminal(
        turno.turno_id,
        credencialTerminal,
      )

      setResumenTurno(resumen)
    } catch {
      setResumenTurno(null)
    } finally {
      setCargandoResumenTurno(false)
    }
  }, [credencialTerminal, enLinea, turno])

  useEffect(() => {
    if (!turno || !enLinea) return

    const temporizador = window.setTimeout(() => {
      void cargarResumenTurno()
    }, 0)

    return () => window.clearTimeout(temporizador)
  }, [cargarResumenTurno, enLinea, turno])

  const cargarComprasDetectadas = useCallback(async () => {
    if (!turno || !enLinea) {
      setComprasDetectadas([])
      return
    }

    try {
      const data = await listarComprasDetectadasTerminal(
        turno.turno_id,
        credencialTerminal,
      )

      setComprasDetectadas(data)
    } catch {
      // El polling no debe interrumpir la operación del cajero.
    }
  }, [credencialTerminal, enLinea, turno])

  useEffect(() => {
    if (!turno || !enLinea) return

    void cargarComprasDetectadas()

    const intervalo = window.setInterval(() => {
      void cargarComprasDetectadas()
    }, 2_500)

    return () => {
      window.clearInterval(intervalo)
    }
  }, [cargarComprasDetectadas, enLinea, turno])

  const buscarVecinoManual = async (
    evento: FormEvent<HTMLFormElement>,
  ) => {
    evento.preventDefault()

    if (!turno) {
      setError('Debes iniciar un turno antes de registrar una venta.')
      return
    }

    const telefono = normalizarTelefonoVecino(telefonoManual)

    if (!/^\+[1-9][0-9]{7,14}$/.test(telefono)) {
      setError(
        'Ingresa un teléfono válido. Ejemplo: +56 9 1234 5678.',
      )
      return
    }

    setProcesandoVentaManual(true)
    setError(null)
    setMensaje(null)

    try {
      const vecino = await buscarVecinoPorTelefonoTerminal(
        telefono,
        turno.turno_id,
        credencialTerminal,
      )

      if (!vecino) {
        setVecinoManual(null)
        setError(
          'No encontramos un Vecino Regalón con ese teléfono.',
        )
        return
      }

      setTelefonoManual(telefono)
      setVecinoManual(vecino)
      setMontoManual('')
      setIdempotenciaVentaManual(crypto.randomUUID())
    } catch (errorCapturado) {
      setVecinoManual(null)
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoVentaManual(false)
    }
  }

  const registrarVentaManual = async (
    evento: FormEvent<HTMLFormElement>,
  ) => {
    evento.preventDefault()

    if (!turno || !vecinoManual) {
      setError('Primero identifica al Vecino Regalón.')
      return
    }

    const monto = Number(montoManual)

    if (!Number.isInteger(monto) || monto <= 0) {
      setError('El monto debe ser un número entero mayor que cero.')
      return
    }

    setProcesandoVentaManual(true)
    setError(null)
    setMensaje(null)

    try {
      const solicitud =
        await crearSolicitudCompraPorTelefonoTerminal(
          telefonoManual,
          monto,
          idempotenciaVentaManual,
          turno.turno_id,
          credencialTerminal,
        )

      if (!solicitud) {
        setError('No fue posible preparar la venta manual.')
        return
      }

      setSolicitudEnRevision(solicitud)
      setNombreVecinoRevision(
        contextoLlavero?.nombre_vecino ??
          vecinoManual?.nombre_vecino ??
          'Vecino Regalón',
      )
      setMontoRevision(String(monto))
      setMotivoRevision('')
      setResultadoCompra(null)
      setIdempotenciaVentaManual(crypto.randomUUID())

      await cargarSolicitudes()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoVentaManual(false)
    }
  }

  const consultarLlavero = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()

    if (!turno || !credencialTerminal) {
      setError('Debes iniciar un turno antes de consultar llaveros.')
      return
    }

    if (tokenLlavero.trim().length < 8) {
      setError('Acerca el llavero al lector o ingresa un token válido.')
      return
    }

    setProcesandoLlavero(true)
    setLecturaLlavero(null)
    setError(null)
    setMensaje(null)

    try {
      const contexto = await consultarLlaveroActivacion(
        tokenLlavero.trim(),
        turno.turno_id,
        credencialTerminal,
      )

      if (!contexto) {
        setContextoLlavero(null)
        setError('No encontramos un llavero asociado a ese identificador.')
        return
      }

      setContextoLlavero(contexto)
      setSaldoRegisLlavero(
        contexto.estado === 'activo'
          ? await consultarSaldoRegisLlavero(
              tokenLlavero.trim(),
              turno.turno_id,
              credencialTerminal,
            )
          : null,
      )
      setMetodoActivacion('cedula')
      setPinActivacion('')
      setCedulaVerificada(false)
      setMontoCompraAsistida('')
      setIdempotenciaCompraAsistida(crypto.randomUUID())
    } catch (errorCapturado) {
      setContextoLlavero(null)
      setSaldoRegisLlavero(null)
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoLlavero(false)
    }
  }

  const crearSolicitudAsistida = async (
    evento: FormEvent<HTMLFormElement>,
  ) => {
    evento.preventDefault()

    if (
      !contextoLlavero ||
      contextoLlavero.estado !== 'activo' ||
      !turno ||
      !credencialTerminal
    ) {
      setError('Lee un llavero activo antes de preparar la compra.')
      return
    }

    const monto = Number(montoCompraAsistida)

    if (!Number.isInteger(monto) || monto <= 0) {
      setError('El monto debe ser un número entero mayor que cero.')
      return
    }

    setProcesandoLlavero(true)
    setError(null)
    setMensaje(null)

    try {
      const solicitud = lecturaLlavero
        ? await crearCompraAsistidaDesdeLectura(
            lecturaLlavero.lectura_id,
            turno.turno_id,
            credencialTerminal,
            monto,
            idempotenciaCompraAsistida,
          )
        : await crearCompraAsistida(
            tokenLlavero.trim(),
            turno.turno_id,
            credencialTerminal,
            monto,
            idempotenciaCompraAsistida,
          )

      if (!solicitud) {
        setError('Supabase no devolvió la solicitud de compra asistida.')
        return
      }

      setSolicitudEnRevision(solicitud)
      setNombreVecinoRevision(
        contextoLlavero?.nombre_vecino ??
          vecinoManual?.nombre_vecino ??
          'Vecino Regalón',
      )
      setMontoRevision(String(monto))
      setMotivoRevision('')
      setResultadoCompra(null)
      setIdempotenciaCompraAsistida(crypto.randomUUID())

      if (lecturaLlavero) {
        setLecturaLlavero(null)
      }

      await cargarSolicitudes()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoLlavero(false)
    }
  }

  const limpiarCompraEnCurso = () => {
    setSolicitudEnRevision(null)
    setNombreVecinoRevision(null)
    setMontoRevision('')
    setMotivoRevision('')
    setModoCompraAsistidaLlavero(false)

    setTelefonoManual('')
    setVecinoManual(null)
    setMontoManual('')
    setIdempotenciaVentaManual(crypto.randomUUID())

    limpiarLecturaOperativa()
  }

  const abandonarVecinoActual = () => {
    setError(null)
    setMensaje(null)
    setResultadoCompra(null)
    limpiarCompraEnCurso()
  }

  const revisarCompraDetectada = async (
    compra: CompraDetectadaTerminal,
  ) => {
    if (!turno) return

    setError(null)
    setMensaje(null)

    try {
      const solicitudesActuales =
        await listarSolicitudesTerminal(
          turno.turno_id,
          credencialTerminal,
        )

      const solicitud = solicitudesActuales.find(
        (actual) => actual.id === compra.solicitud_id,
      )

      if (!solicitud) {
        setError(
          'La compra ya no está disponible para revisión.',
        )
        await cargarComprasDetectadas()
        return
      }

      setSolicitudes(solicitudesActuales)
      setSolicitudEnRevision(solicitud)
      setNombreVecinoRevision(compra.nombre_vecino)
      setMontoRevision(String(compra.monto_vigente))
      setMotivoRevision('')
      setCompraDetectadaOcultaId(null)
      setSeccionActiva('compras')
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    }
  }

  const corregirCompraEnRevision = async () => {
    if (!solicitudEnRevision || !turno || !credencialTerminal) return

    const monto = Number(montoRevision)

    if (!Number.isInteger(monto) || monto <= 0) {
      setError('El monto debe ser un número entero mayor que cero.')
      return
    }

    const montoActual = obtenerMontoVigente(solicitudEnRevision)

    if (montoActual === monto) {
      setMensaje('El monto ya coincide con el informado.')
      return
    }

    const motivo =
      motivoRevision.trim() ||
      'Corrección antes de aprobación'

    setProcesandoId(solicitudEnRevision.id)
    setError(null)
    setMensaje(null)

    try {
      await corregirMontoTerminal(
        solicitudEnRevision.id,
        monto,
        motivo,
        turno.turno_id,
        credencialTerminal,
      )

      setSolicitudEnRevision((actual) =>
        actual
          ? {
              ...actual,
              monto_corregido: monto,
              motivo_correccion: motivo,
            }
          : null,
      )

      if (contextoLlavero) {
        setMontoCompraAsistida(String(monto))
      } else {
        setMontoManual(String(monto))
      }

      setMensaje('Monto corregido. Revisa nuevamente antes de aprobar.')
      await cargarSolicitudes()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const pedirNuevoMontoEnRevision = async () => {
    if (!solicitudEnRevision || !turno || !credencialTerminal) return

    const motivo =
      motivoRevision.trim() ||
      'El monto no coincide con la caja'

    setProcesandoId(solicitudEnRevision.id)
    setError(null)
    setMensaje(null)

    try {
      await solicitarReingresoMontoTerminal(
        solicitudEnRevision.id,
        motivo,
        turno.turno_id,
        credencialTerminal,
      )

      limpiarCompraEnCurso()
      setMensaje('Se solicitó ingresar nuevamente el monto.')
      await cargarSolicitudes()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const cancelarCompraEnRevision = async () => {
    if (!solicitudEnRevision || !turno || !credencialTerminal) return

    setProcesandoId(solicitudEnRevision.id)
    setError(null)
    setMensaje(null)

    try {
      await rechazarSolicitudCompraEnTurno(
        solicitudEnRevision.id,
        'Cancelada por cajero antes de aprobación',
        turno.turno_id,
        credencialTerminal,
      )

      limpiarCompraEnCurso()
      setMensaje('Compra cancelada. No se acreditaron REGIS.')
      await cargarSolicitudes()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const aprobarCompraEnRevision = async () => {
    if (!solicitudEnRevision || !turno || !credencialTerminal) return

    const montoActual = obtenerMontoVigente(solicitudEnRevision)
    const montoEscrito = Number(montoRevision)

    if (montoActual !== montoEscrito) {
      setError(
        'Cambiaste el monto. Guarda la corrección antes de aprobar.',
      )
      return
    }

    const nombreVecino =
      nombreVecinoRevision ??
      contextoLlavero?.nombre_vecino ??
      vecinoManual?.nombre_vecino ??
      'Vecino Regalón'

    setProcesandoId(solicitudEnRevision.id)
    setError(null)
    setMensaje(null)

    try {
      const compra = await aprobarCompraEnTurno(
        solicitudEnRevision.id,
        turno.turno_id,
        credencialTerminal,
      )

      if (!compra) {
        setError('Supabase no devolvió la compra aprobada.')
        return
      }

      await Promise.all([
        cargarSolicitudes(),
        cargarResumenTurno(),
      ])

      const resultado = {
        nombreVecino,
        montoFinal: compra.monto_final,
        regisGenerados: compra.regis_generados,
      }

      limpiarCompraEnCurso()
      setResultadoCompra(resultado)
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const activarLlavero = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!contextoLlavero || !turno || !credencialTerminal) {
      setError('Debes iniciar un turno antes de activar llaveros.')
      return
    }

    if (metodoActivacion === 'cedula' && !cedulaVerificada) {
      setError('Confirma que revisaste presencialmente la cédula del vecino.')
      return
    }

    if (
      metodoActivacion === 'pin' &&
      !/^[0-9]{4,6}$/.test(pinActivacion)
    ) {
      setError('El PIN debe contener entre 4 y 6 dígitos.')
      return
    }

    setProcesandoLlavero(true)
    setError(null)
    setMensaje(null)

    try {
      if (lecturaLlavero && !credencialTerminal) {
        setError('La credencial segura de esta Terminal PWA ya no está disponible.')
        return
      }

      const resultado = lecturaLlavero && credencialTerminal
        ? await activarLlaveroDesdeLectura(
            lecturaLlavero.lectura_id,
            turno.turno_id,
            credencialTerminal,
            metodoActivacion,
            metodoActivacion === 'pin' ? pinActivacion : null,
            metodoActivacion === 'cedula' && cedulaVerificada,
          )
        : await activarLlaveroPrimerUso(
            tokenLlavero.trim(),
            turno.turno_id,
            credencialTerminal,
            metodoActivacion,
            metodoActivacion === 'pin' ? pinActivacion : null,
            metodoActivacion === 'cedula' && cedulaVerificada,
          )

      if (!resultado) {
        setError('Supabase no devolvió el resultado de la activación.')
        return
      }

      if (!resultado.activado) {
        if (lecturaLlavero) limpiarLecturaOperativa()
        setError(
          lecturaLlavero
            ? `${resultado.mensaje}. Acerca nuevamente el llavero para reintentar.`
            : resultado.mensaje,
        )
        return
      }

      if (lecturaLlavero) {
        limpiarLecturaOperativa()
        setMensaje(
          `${resultado.mensaje}. Acerca nuevamente el llavero para iniciar una compra o un canje.`,
        )
        setPinActivacion('')
        setCedulaVerificada(false)
        return
      }

      setMensaje(`${resultado.mensaje}. Ya puede continuar con la compra.`)
      setContextoLlavero((actual) =>
        actual
          ? {
              ...actual,
              estado: resultado.estado,
              puede_activar: false,
            }
          : null,
      )
      setSaldoRegisLlavero(
        await consultarSaldoRegisLlavero(
          tokenLlavero.trim(),
          turno.turno_id,
          credencialTerminal,
        ),
      )
      setPinActivacion('')
      setCedulaVerificada(false)
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoLlavero(false)
    }
  }

  const informarMonto = async (solicitud: Solicitud) => {
    const monto = Number(montos[solicitud.id])

    if (!Number.isInteger(monto) || monto <= 0) {
      setError('El monto debe ser un número entero mayor que cero.')
      return
    }

    if (!turno || !credencialTerminal) {
      setError('Debes iniciar un turno antes de informar montos.')
      return
    }

    setProcesandoId(solicitud.id)
    setError(null)
    setMensaje(null)

    try {
      await informarMontoTerminal(
        solicitud.id,
        monto,
        turno.turno_id,
        credencialTerminal,
      )

      setMensaje('Monto ingresado con ayuda del cajero.')
      await cargarSolicitudes()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const corregirMonto = async (solicitud: Solicitud) => {
    const monto = Number(montos[solicitud.id])
    const motivo = motivosCorreccion[solicitud.id]?.trim() ?? ''

    if (!Number.isInteger(monto) || monto <= 0) {
      setError('El monto debe ser un número entero mayor que cero.')
      return
    }

    if (motivo.length < 3) {
      setError('Escribe el motivo de la corrección.')
      return
    }

    if (!turno || !credencialTerminal) {
      setError('Debes iniciar un turno antes de corregir montos.')
      return
    }

    setProcesandoId(solicitud.id)
    setError(null)
    setMensaje(null)

    try {
      await corregirMontoTerminal(
        solicitud.id,
        monto,
        motivo,
        turno.turno_id,
        credencialTerminal,
      )

      setMensaje('Monto corregido directamente por el cajero.')
      await cargarSolicitudes()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const solicitarReingreso = async (solicitud: Solicitud) => {
    const motivo = motivosCorreccion[solicitud.id]?.trim() ?? ''

    if (motivo.length < 3) {
      setError('Escribe por qué el vecino debe corregir el monto.')
      return
    }

    if (!turno || !credencialTerminal) {
      setError('Debes iniciar un turno antes de solicitar un reingreso.')
      return
    }

    setProcesandoId(solicitud.id)
    setError(null)
    setMensaje(null)

    try {
      await solicitarReingresoMontoTerminal(
        solicitud.id,
        motivo,
        turno.turno_id,
        credencialTerminal,
      )

      setMontos((actuales) => ({
        ...actuales,
        [solicitud.id]: '',
      }))
      setMensaje('Se solicitó al vecino que vuelva a ingresar el monto.')
      await cargarSolicitudes()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const actualizarDespuesDeCompra = async () => {
    await Promise.all([
      cargarSolicitudes(),
      cargarResumenTurno(),
    ])

    if (
      contextoLlavero?.estado === 'activo' &&
      tokenLlavero.trim().length >= 8 &&
      turno &&
      credencialTerminal
    ) {
      try {
        setSaldoRegisLlavero(
          await consultarSaldoRegisLlavero(
            tokenLlavero.trim(),
            turno.turno_id,
            credencialTerminal,
          ),
        )
      } catch {
        setSaldoRegisLlavero(null)
      }
    }
  }

  const aprobar = async (solicitud: Solicitud) => {
    const montoEnEdicion = Number(montos[solicitud.id])
    const montoVigente = obtenerMontoVigente(solicitud)

    if (
      montoVigente !== null &&
      montoEnEdicion !== montoVigente
    ) {
      setError(
        'Tienes un cambio de monto sin guardar. Guarda la corrección antes de aprobar.',
      )
      return
    }

    if (!turno || !credencialTerminal) {
      setError('Debes iniciar un turno antes de aprobar compras.')
      return
    }

    setProcesandoId(solicitud.id)
    setError(null)
    setMensaje(null)

    try {
      await aprobarCompraEnTurno(
        solicitud.id,
        turno.turno_id,
        credencialTerminal,
      )

      setMensaje('Compra aprobada correctamente.')
      await actualizarDespuesDeCompra()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const rechazar = async (solicitud: Solicitud) => {
    const motivo = motivosRechazo[solicitud.id]?.trim() ?? ''

    if (motivo.length < 3) {
      setError('Escribe un motivo de al menos 3 caracteres.')
      return
    }

    if (!turno || !credencialTerminal) {
      setError('Debes iniciar un turno antes de rechazar compras.')
      return
    }

    setProcesandoId(solicitud.id)
    setError(null)
    setMensaje(null)

    try {
      await rechazarSolicitudCompraEnTurno(
        solicitud.id,
        motivo,
        turno.turno_id,
        credencialTerminal,
      )

      setMensaje('Solicitud rechazada.')
      await cargarSolicitudes()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoId(null)
    }
  }

  const finalizarTurno = async () => {
    if (!turno || !credencialTerminal) return

    setCerrandoTurno(true)
    setError(null)
    setMensaje(null)

    try {
      await cerrarTurnoTerminal(turno.turno_id, credencialTerminal)
      setTurno(null)
      setRecuperacionPendiente(false)
      setReglaAcumulacion(null)
      setErrorReglaAcumulacion(null)
      limpiarLecturaOperativa()
      setResumenTurno(null)
      setTelefonoManual('')
      setVecinoManual(null)
      setMontoManual('')
      setMensaje('Turno finalizado correctamente.')
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setCerrandoTurno(false)
    }
  }

  const montoVistaPrevia = Number(montoCompraAsistida)
  const vistaPreviaRegis = reglaAcumulacion
    ? calcularVistaPreviaRegis(
        montoVistaPrevia,
        reglaAcumulacion,
        saldoRegisLlavero?.remanente_valor_clp ?? 0,
      )
    : null

  if (turno && recuperacionPendiente) {
    return (
      <RecuperarTurno
        turno={turno}
        credencial={credencialTerminal}
        alContinuar={() => {
          setRecuperacionPendiente(false)

          setMensaje(
            `Turno de ${turno.nombre_cajero} recuperado correctamente.`,
          )
        }}
        alCerrarTurno={() => {
          setTurno(null)
          setRecuperacionPendiente(false)
          setReglaAcumulacion(null)
          setErrorReglaAcumulacion(null)
          limpiarLecturaOperativa()

          setMensaje(
            'Turno anterior finalizado. Ingresa el nombre del nuevo cajero.',
          )
        }}
      />
    )
  }

  return (
    <main
      className={
        turno
          ? 'terminal-panel terminal-panel--turno-activo'
          : 'terminal-panel terminal-panel--inicio-turno'
      }
    >
      <header className="terminal-cabecera-ref">
        <div className="terminal-cabecera-ref__marca">
          <strong>
            Club Regalones
            <span aria-hidden="true">♥</span>
          </strong>
          <small>Más barrio, más beneficios</small>
        </div>

        <div className="terminal-cabecera-ref__centro">
          <div className="terminal-cabecera-ref__negocio">
            <div
              className="terminal-cabecera-ref__tienda"
              aria-hidden="true"
            >
              <img src={tiendaIcono} alt="" />
            </div>

            <div className="terminal-cabecera-ref__datos">
              <strong>{configuracion.nombreNegocio}</strong>
              <span className="terminal-cabecera-ref__caja">
                {configuracion.nombreCaja}
              </span>
            </div>
          </div>

          <div className="terminal-cabecera-ref__turno">
            {turno && (
              <>
                <span
                  className="terminal-cabecera-ref__cajero-icono"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="8" r="3.25" />
                    <path d="M5.5 20c.7-4 2.9-6 6.5-6s5.8 2 6.5 6" />
                  </svg>
                </span>

                <div className="terminal-cabecera-ref__cajero-info">
                  <div className="terminal-cabecera-ref__cajero-bloque">
                    <span className="terminal-cabecera-ref__cajero-label">
                      Cajero/a
                    </span>
                    <strong className="terminal-cabecera-ref__cajero-nombre">
                      {turno.nombre_cajero}
                    </strong>
                  </div>

                  <EstadoPwa
                    disponible={enLinea}
                    etiquetaEnLinea="Turno activo"
                    mostrarInstalacion={false}
                  />
                </div>
              </>
            )}

            {!turno && (
              <EstadoPwa
                disponible={enLinea}
                etiquetaEnLinea="Terminal lista"
                mostrarInstalacion={false}
              />
            )}
          </div>
        </div>

        <div className="terminal-cabecera-ref__lado-derecho">
          <div className="terminal-cabecera-ref__reloj-turno">
            <RelojTerminal />
          </div>

          {turno && (
            <div className="terminal-cabecera-ref__acciones terminal-cabecera-ref__acciones--vertical">
              <button
                type="button"
                className="terminal-cabecera-ref__actualizar"
                disabled={!enLinea}
                onClick={() => void cargarSolicitudes()}
              >
                <svg
                  className="terminal-cabecera-ref__accion-icono"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6v5h-5M4 18v-5h5" />
                  <path d="M6.1 9a7 7 0 0 1 11.8-2L20 9M4 15l2.1 2a7 7 0 0 0 11.8-2" />
                </svg>
                <span>Actualizar</span>
              </button>

              <button
                type="button"
                className="terminal-cabecera-ref__finalizar"
                disabled={cerrandoTurno || !enLinea}
                onClick={() => void finalizarTurno()}
              >
                <svg
                  className="terminal-cabecera-ref__accion-icono"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 2v10" />
                  <path d="M18.4 6.6a8 8 0 1 1-12.8 0" />
                </svg>
                <span>
                  {cerrandoTurno ? 'Finalizando…' : 'Finalizar turno'}
                </span>
              </button>
            </div>
          )}
        </div>
      </header>

      {turno && (
        <nav className="terminal-navegacion" aria-label="Operaciones de caja">
  <button
    type="button"
    className={seccionActiva === 'compras' ? 'terminal-navegacion__activo' : ''}
    onClick={() => setSeccionActiva('compras')}
  >
    <span className="terminal-navegacion__icono" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M3 4h2l2 9h10l2-6H7" />
        <circle cx="9" cy="19" r="1.3" />
        <circle cx="17" cy="19" r="1.3" />
      </svg>
    </span>
    <span>Compras</span>
  </button>

  <button
    type="button"
    className={seccionActiva === 'lector' ? 'terminal-navegacion__activo' : ''}
    onClick={() => setSeccionActiva('lector')}
  >
    <span className="terminal-navegacion__icono" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <rect x="7" y="2.5" width="10" height="19" rx="2" />
        <path d="M10 5h4" />
        <path d="M10.5 18.5h3" />
      </svg>
    </span>
    <span>Lector móvil</span>
  </button>

  <button
    type="button"
    className={seccionActiva === 'canjes' ? 'terminal-navegacion__activo' : ''}
    onClick={() => setSeccionActiva('canjes')}
  >
    <span className="terminal-navegacion__icono" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M4 10h16v10H4z" />
        <path d="M3 7h18v3H3z" />
        <path d="M12 7v13" />
        <path d="M12 7c-3 0-5-1-5-2.5C7 3.2 8 2.5 9.2 2.5 11 2.5 12 5 12 7Z" />
        <path d="M12 7c3 0 5-1 5-2.5 0-1.3-1-2-2.2-2C13 2.5 12 5 12 7Z" />
      </svg>
    </span>
    <span>Canjes REGIS</span>
  </button>

  <button
    type="button"
    className={seccionActiva === 'alertas' ? 'terminal-navegacion__activo' : ''}
    onClick={() => setSeccionActiva('alertas')}
  >
    <span className="terminal-navegacion__icono" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M18 8a6 6 0 0 0-12 0c0 6-3 7-3 9h18c0-2-3-3-3-9Z" />
        <path d="M10 21h4" />
      </svg>
    </span>
    <span>Alertas</span>
  </button>
</nav>
      )}

      {turno && enLinea && (
        <div
          className="terminal-seccion-contenido"
          hidden={seccionActiva !== 'lector'}
        >
          <VinculacionLector
            credencial={credencialTerminal}
            turnoId={turno.turno_id}
            alReclamarLectura={recibirLecturaOperativa}
          />
        </div>
      )}
      {!enLinea && (
        <div
          className="terminal-alert terminal-alert--error"
          role="status"
        >
          <strong>
            Sin conexión con Club Regalones
          </strong>
          <p>
            Esta Terminal sigue vinculada a su negocio y
            caja. El turno actual permanece protegido.
            Las operaciones se habilitarán
            automáticamente cuando vuelva la conexión.
          </p>
        </div>
      )}

      {error && enLinea && (
        <p className="terminal-alert terminal-alert--error">
          {error}
        </p>
      )}
      {mensaje && turno && (
        <p className="terminal-alert terminal-alert--success">{mensaje}</p>
      )}

      {enLinea &&
        !cargandoTurno &&
        !turno && (
          <InicioTurno
            credencial={credencialTerminal}
            alIniciar={(nuevoTurno) => {
              setTurno(nuevoTurno)
              setRecuperacionPendiente(false)
              setMensaje(
                `Turno iniciado por ${nuevoTurno.nombre_cajero}.`,
              )
            }}
          />
        )}

      {turno &&
        enLinea &&
        seccionActiva === 'compras' && (
        <section className="terminal-llavero" aria-labelledby="activar-llavero-title">
          {!solicitudEnRevision &&
            !resultadoCompra &&
            (!contextoLlavero || contextoLlavero.estado === 'activo') && (
  <div className="terminal-pos-inicio">

    <section className="terminal-pos-espera">
      <div className="terminal-pos-espera__copy">
        <span className="terminal-eyebrow">Compra</span>

        <h2>Esperando a Vecino Regalón</h2>

        <p>
          Acerca el llavero o tarjeta NFC del Vecino Regalón
          para comenzar la venta.
        </p>

        <span className="terminal-pos-espera__estado">
          <i />
          Lector listo
        </span>

        <div className="terminal-pos-espera__pasos">
          <span><strong>1</strong> Acerca NFC o llavero</span>
          <span><strong>2</strong> Identificamos al vecino</span>
          <span><strong>3</strong> Registras la compra</span>
        </div>
      </div>

      <div className="terminal-pos-espera__visual">
        <div className="terminal-pos-espera__halo" />

        <img
          src={lectorNfcIcono}
          alt="Lector NFC y llavero de Club Regalones"
        />
      </div>
    </section>


    <aside className="terminal-pos-resumen">
      <div className="terminal-pos-resumen__cabecera">
        <div>
          <span className="terminal-eyebrow">Turno actual</span>
          <h3>Resumen del turno</h3>
        </div>

        {cargandoResumenTurno && (
          <small>Actualizando…</small>
        )}
      </div>

      <div className="terminal-pos-resumen__metricas">
        <article>
          <span className="terminal-pos-resumen__icono" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v20" />
              <path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7" />
            </svg>
          </span>
          <span className="terminal-pos-resumen__metrica-label">
            Ventas realizadas
          </span>
          <strong>{resumenTurno?.ventas_realizadas ?? 0}</strong>
        </article>

        <article>
          <span className="terminal-pos-resumen__icono" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 19V5h6a4 4 0 0 1 0 8H7" />
              <path d="m12 13 5 6" />
            </svg>
          </span>
          <span className="terminal-pos-resumen__metrica-label">
            REGIS acumulados
          </span>
          <strong>{resumenTurno?.regis_acumulados ?? 0}</strong>
        </article>

        <article>
          <span className="terminal-pos-resumen__icono" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 10h16v10H4zM3 6h18v4H3zM12 6v14" />
              <path d="M12 6H8.5a2 2 0 1 1 2-2L12 6Z" />
              <path d="M12 6h3.5a2 2 0 1 0-2-2L12 6Z" />
            </svg>
          </span>
          <span className="terminal-pos-resumen__metrica-label">
            Canjes realizados
          </span>
          <strong>{resumenTurno?.canjes_realizados ?? 0}</strong>
        </article>
      </div>

      <div className="terminal-pos-resumen__hora">
        <span className="terminal-pos-resumen__icono" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <span className="terminal-pos-resumen__hora-label">
          Inicio del turno
        </span>

        <strong>
          {resumenTurno?.iniciado_en
            ? new Date(resumenTurno.iniciado_en).toLocaleTimeString(
                'es-CL',
                {
                  hour: '2-digit',
                  minute: '2-digit',
                },
              )
            : '—'}
        </strong>
      </div>

      <div className="terminal-pos-resumen__regalon">
        <img
          src={regalonCorazon}
          alt=""
          aria-hidden="true"
        />

        <div>
          <strong>¡Todo listo!</strong>
          <span>Cada compra impulsa lo local.</span>
        </div>
      </div>
    </aside>


        <section className="terminal-pos-manual">
      <div className="terminal-pos-manual__intro">
        <div className="terminal-pos-manual__icono" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
            <path d="M10 5h4" />
            <path d="M10.5 18.5h3" />
          </svg>
        </div>

        <div className="terminal-pos-manual__copy">
          <strong>Identificación por teléfono</strong>
          <p>
            Usa el teléfono asociado a la cuenta si el vecino no trae NFC.
          </p>
        </div>
      </div>

      <form onSubmit={buscarVecinoManual}>
        <input
          required
          type="tel"
          autoComplete="off"
          aria-label="Teléfono asociado a la cuenta"
          value={telefonoManual}
          onChange={(evento) =>
            setTelefonoManual(evento.target.value)
          }
          placeholder="+56 9 1234 5678"
        />

        <button
          type="submit"
          disabled={procesandoVentaManual}
        >
          {procesandoVentaManual
            ? 'Buscando…'
            : 'Identificar vecino'}
        </button>
      </form>
    </section>


    <form
      className="terminal-pos-token-respaldo"
      onSubmit={consultarLlavero}
    >
      <input
        value={tokenLlavero}
        onChange={(evento) =>
          setTokenLlavero(evento.target.value)
        }
      />
      <button type="submit">Consultar</button>
    </form>

  </div>
)}

          {!solicitudEnRevision &&
            !resultadoCompra &&
            comprasDetectadas.find(
              (compra) =>
                compra.solicitud_id !== compraDetectadaOcultaId,
            ) && (() => {
              const compra = comprasDetectadas.find(
                (actual) =>
                  actual.solicitud_id !== compraDetectadaOcultaId,
              )!

              return (
                <NotificacionCompraTerminal
                  tipo="compra"
                  nombreVecino={compra.nombre_vecino}
                  monto={compra.monto_vigente}
                  alRevisar={() =>
                    void revisarCompraDetectada(compra)
                  }
                  alCerrar={() =>
                    setCompraDetectadaOcultaId(
                      compra.solicitud_id,
                    )
                  }
                />
              )
            })()}

          {!solicitudEnRevision &&
            !resultadoCompra &&
            comprasDetectadas.length === 0 &&
            contextoLlavero?.estado === 'activo' && (
              <NotificacionCompraTerminal
                tipo="llavero"
                nombreVecino={contextoLlavero.nombre_vecino}
                saldoRegis={saldoRegisLlavero?.disponibles ?? null}
                modoAsistido={modoCompraAsistidaLlavero}
                montoAsistido={montoCompraAsistida}
                procesando={procesandoLlavero}
                alIniciarAsistida={() =>
                  setModoCompraAsistidaLlavero(true)
                }
                alCambiarMonto={setMontoCompraAsistida}
                alContinuarAsistida={crearSolicitudAsistida}
                alCerrar={abandonarVecinoActual}
              />
            )}

          {!solicitudEnRevision &&
            !resultadoCompra &&
            comprasDetectadas.length === 0 &&
            !contextoLlavero &&
            vecinoManual && (
              <NotificacionCompraTerminal
                tipo="telefono"
                nombreVecino={vecinoManual.nombre_vecino}
                modoAsistido
                montoAsistido={montoManual}
                procesando={procesandoVentaManual}
                alCambiarMonto={setMontoManual}
                alContinuarAsistida={registrarVentaManual}
                alCerrar={abandonarVecinoActual}
              />
            )}

          {solicitudEnRevision && !resultadoCompra && (
            <section className="terminal-revision-compra">

              <div className="terminal-revision-compra__principal">
                <div className="terminal-revision-compra__cabecera">
                  <div>
                    <span className="terminal-eyebrow">Compra</span>
                    <h2>Revisión de compra</h2>
                    <p>Confirma el monto antes de aprobar la compra.</p>
                  </div>

                  <div className="terminal-revision-compra__estado">
                    <small>
                      {new Date(solicitudEnRevision.creado_en).toLocaleString(
                        'es-CL',
                        {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        },
                      )}
                    </small>
                    <span>Pendiente de validación</span>
                  </div>
                </div>

                <div className="terminal-revision-compra__datos">
                  <article className="terminal-revision-compra__monto-informado">
                    <span
                      className="terminal-revision-compra__monto-icono"
                      aria-hidden="true"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z" />
                        <path d="M9 8h6M9 12h6M9 16h3" />
                      </svg>
                    </span>
                    <div>
                      <small>Monto informado</small>
                      <strong>
                        {formatearMonto(
                          obtenerMontoVigente(solicitudEnRevision),
                        )}
                      </strong>
                    </div>
                  </article>

                  <article className="terminal-revision-compra__vecino">
                    <div
                      className="terminal-revision-compra__avatar"
                      aria-hidden="true"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="9" cy="8" r="3" />
                        <path d="M3.5 19c.6-3.2 2.4-5 5.5-5 1.4 0 2.6.4 3.5 1.2" />
                        <path d="m14.5 17 2 2 4-5" />
                      </svg>
                    </div>
                    <div>
                      <strong>
                        {nombreVecinoRevision ??
                          contextoLlavero?.nombre_vecino ??
                          vecinoManual?.nombre_vecino ??
                          'Vecino Regalón'}
                      </strong>
                      <span>
                        {solicitudEnRevision.llavero_id !== null
                          ? 'Identificado por NFC / llavero'
                          : 'Identificado por teléfono'}
                      </span>
                    </div>
                  </article>
                </div>

                <div className="terminal-revision-compra__formulario">
                  <label>
                    Monto correcto en CLP
                    <div className="terminal-revision-compra__input-monto">
                      <span>$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        value={montoRevision}
                        onChange={(evento) =>
                          setMontoRevision(
                            evento.target.value.replace(/\D/g, ''),
                          )
                        }
                      />
                    </div>
                  </label>

                  <label>
                    Motivo de la corrección
                    <small>Opcional</small>
                    <textarea
                      value={motivoRevision}
                      onChange={(evento) =>
                        setMotivoRevision(evento.target.value)
                      }
                      placeholder="Describe el motivo de la corrección"
                      maxLength={500}
                    />
                  </label>
                </div>

                <div className="terminal-revision-compra__comparacion">
                  <div>
                    <small>
                      {solicitudEnRevision.informado_por === 'vecino'
                        ? 'Monto informado por vecino'
                        : 'Monto informado por cajero'}
                    </small>
                    <strong>
                      {formatearMonto(
                        obtenerMontoVigente(solicitudEnRevision),
                      )}
                    </strong>
                  </div>

                  <span className="terminal-revision-compra__igual">=</span>

                  <div>
                    <small>Monto a registrar</small>
                    <strong>
                      {montoRevision
                        ? formatearMonto(Number(montoRevision))
                        : '—'}
                    </strong>
                  </div>
                </div>

                <div className="terminal-revision-compra__acciones">
                  <button
                    type="button"
                    className="terminal-revision-compra__aprobar"
                    disabled={procesandoId === solicitudEnRevision.id}
                    onClick={() => void aprobarCompraEnRevision()}
                  >
                    <span className="terminal-boton__contenido">
                      <svg
                        className="terminal-boton__icono"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m5 12 4 4L19 6" />
                      </svg>
                      <span>Aprobar compra</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="terminal-revision-compra__corregir"
                    disabled={procesandoId === solicitudEnRevision.id}
                    onClick={() => void corregirCompraEnRevision()}
                  >
                    <span className="terminal-boton__contenido">
                      <svg
                        className="terminal-boton__icono"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                      </svg>
                      <span>Guardar monto corregido</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="terminal-revision-compra__reingreso"
                    disabled={procesandoId === solicitudEnRevision.id}
                    onClick={() => void pedirNuevoMontoEnRevision()}
                  >
                    <span className="terminal-boton__contenido">
                      <svg
                        className="terminal-boton__icono"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 7v5h-5" />
                        <path d="M4 17v-5h5" />
                        <path d="M6.1 8a7 7 0 0 1 11.4-2L20 8" />
                        <path d="m4 16 2.5 2a7 7 0 0 0 11.4-2" />
                      </svg>
                      <span>Pedir nuevo monto al vecino</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="terminal-revision-compra__cancelar"
                    disabled={procesandoId === solicitudEnRevision.id}
                    onClick={() => void cancelarCompraEnRevision()}
                  >
                    <span className="terminal-boton__contenido">
                      <svg
                        className="terminal-boton__icono"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                      <span>Cancelar compra</span>
                    </span>
                  </button>
                </div>

                <small className="terminal-revision-compra__seguridad">
                  ✓ Al aprobar, se calcularán y acreditarán los REGIS correspondientes.
                </small>
              </div>

              <aside className="terminal-revision-compra__lateral">
                <div>
                  <span className="terminal-eyebrow">Vecino actual</span>
                  <h3>
                    {nombreVecinoRevision ??
                      contextoLlavero?.nombre_vecino ??
                      vecinoManual?.nombre_vecino ??
                      'Vecino Regalón'}
                  </h3>
                </div>

                <div className="terminal-revision-compra__origen">
                  <strong>
                    {solicitudEnRevision.informado_por === 'vecino'
                      ? 'Compra informada por el vecino'
                      : contextoLlavero
                        ? 'Compra asistida por NFC'
                        : 'Compra asistida por teléfono'}
                  </strong>
                  <span>
                    {solicitudEnRevision.informado_por === 'vecino'
                      ? 'El vecino informó previamente el monto de la compra.'
                      : contextoLlavero
                        ? 'Identificación realizada con llavero.'
                        : 'Identificación realizada por teléfono.'}
                  </span>
                </div>

                <div className="terminal-revision-compra__regis">
                  <span className="terminal-eyebrow">REGIS</span>
                  <strong>Se calcularán al aprobar</strong>
                  <small>La regla real se ejecutará en Supabase.</small>
                </div>

                <div className="terminal-revision-compra__mascota">
                  <img
                    src={regalonCorazon}
                    alt=""
                    aria-hidden="true"
                  />
                  <div>
                    <strong>¡Vamos, Regalón!</strong>
                    <span>Revisa todo antes de aprobar.</span>
                  </div>
                </div>
              </aside>

            </section>
          )}

          {resultadoCompra && (
            <section
              className="terminal-compra-exitosa"
              aria-labelledby="compra-exitosa-title"
            >
              <div className="terminal-compra-exitosa__contenido">
                <span className="terminal-eyebrow">
                  Compra aprobada
                </span>

                <div
                  className="terminal-compra-exitosa__check"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </div>

                <h2 id="compra-exitosa-title">
                  ¡Compra aprobada!
                </h2>

                <p className="terminal-compra-exitosa__descripcion">
                  La compra de <strong>{resultadoCompra.nombreVecino}</strong>{' '}
                  fue registrada correctamente.
                </p>

                <div className="terminal-compra-exitosa__metricas">
                  <article>
                    <span>Monto final</span>
                    <strong>
                      {formatearMonto(resultadoCompra.montoFinal)}
                    </strong>
                  </article>

                  <article>
                    <span>REGIS generados</span>
                    <strong>
                      +{resultadoCompra.regisGenerados} REGIS
                    </strong>
                  </article>
                </div>

                <button
                  type="button"
                  className="terminal-compra-exitosa__nueva"
                  onClick={() => {
                    setResultadoCompra(null)
                    setMensaje(null)
                    setCompraDetectadaOcultaId(null)
                    void cargarSolicitudes()
                    void cargarResumenTurno()
                  }}
                >
                  Volver a compras →
                </button>

                <small className="terminal-compra-exitosa__seguridad">
                  Compra registrada y REGIS acreditados en Club Regalones.
                </small>
              </div>

              <aside className="terminal-compra-exitosa__visual">
                <div className="terminal-compra-exitosa__halo" />

                <img
                  src={regalonCorazon}
                  alt=""
                  aria-hidden="true"
                />

                <div>
                  <strong>¡Todo listo!</strong>
                  <span>Cada compra impulsa lo local.</span>
                </div>
              </aside>
            </section>
          )}

          {contextoLlavero && contextoLlavero.estado !== 'activo' && (
            <div className="terminal-activacion-primer-uso__fondo">
              <section
                className="terminal-activacion-primer-uso"
                role="dialog"
                aria-modal="true"
                aria-labelledby="activacion-primer-uso-title"
              >
                <button
                  type="button"
                  className="terminal-activacion-primer-uso__cerrar"
                  onClick={abandonarVecinoActual}
                  aria-label="Cerrar activación"
                >
                  ×
                </button>

                <div className="terminal-activacion-primer-uso__contenido">
                  <span className="terminal-eyebrow">
                    Primer uso
                  </span>

                  <h2 id="activacion-primer-uso-title">
                    Activemos el llavero
                  </h2>

                  <p className="terminal-activacion-primer-uso__descripcion">
                    Verifica la identidad del vecino antes de habilitar su llavero Regalones.
                  </p>

                  <div className="terminal-activacion-primer-uso__vecino">
                    <img
                      src={regalonCorazon}
                      alt=""
                      aria-hidden="true"
                    />

                    <div>
                      <small>Vecino identificado</small>
                      <strong>{contextoLlavero.nombre_vecino}</strong>
                      <span>{contextoLlavero.codigo_publico}</span>
                    </div>

                    {contextoLlavero.entregado && (
                      <span className="terminal-activacion-primer-uso__entregado">
                        ✓ Llavero entregado
                      </span>
                    )}
                  </div>

                  {!contextoLlavero.entregado ? (
                    <div className="terminal-activacion-primer-uso__aviso">
                      <strong>Llavero aún no entregado</strong>
                      <span>
                        Primero debe registrarse su entrega antes de poder activarlo.
                      </span>
                    </div>
                  ) : contextoLlavero.puede_activar ? (
                    <form
                      className="terminal-activacion-primer-uso__formulario"
                      onSubmit={activarLlavero}
                    >
                      <fieldset>
                        <legend>Verifica la identidad</legend>

                        <div className="terminal-activacion-primer-uso__opciones">
                          <label
                            className={metodoActivacion === 'cedula' ? 'terminal-activacion-primer-uso__opcion terminal-activacion-primer-uso__opcion--activa' : 'terminal-activacion-primer-uso__opcion'}
                          >
                            <input
                              type="radio"
                              name="metodo-activacion"
                              value="cedula"
                              checked={metodoActivacion === 'cedula'}
                              onChange={() => setMetodoActivacion('cedula')}
                            />

                            <span>
                              <strong>Revisar cédula</strong>
                              <small>Recomendado para atención presencial</small>
                            </span>
                          </label>

                          <label
                            className={`${
                              'terminal-activacion-primer-uso__opcion'
                            }${
                              !contextoLlavero.tiene_pin
                                ? ' terminal-activacion-primer-uso__opcion--deshabilitada'
                                : metodoActivacion === 'pin'
                                  ? ' terminal-activacion-primer-uso__opcion--activa'
                                  : ''
                            }`}
                          >
                            <input
                              type="radio"
                              name="metodo-activacion"
                              value="pin"
                              disabled={!contextoLlavero.tiene_pin}
                              checked={metodoActivacion === 'pin'}
                              onChange={() => setMetodoActivacion('pin')}
                            />

                            <span>
                              <strong>Ingresar PIN</strong>
                              <small>
                                {contextoLlavero.tiene_pin
                                  ? 'Usar PIN configurado por el vecino'
                                  : 'PIN no configurado'}
                              </small>
                            </span>
                          </label>
                        </div>
                      </fieldset>

                      {metodoActivacion === 'cedula' ? (
                        <label className="terminal-activacion-primer-uso__confirmacion">
                          <input
                            type="checkbox"
                            checked={cedulaVerificada}
                            onChange={(evento) =>
                              setCedulaVerificada(evento.target.checked)
                            }
                          />

                          <span>
                            <strong>Identidad verificada</strong>
                            <small>
                              Revisé presencialmente la cédula y el nombre corresponde al titular.
                            </small>
                          </span>
                        </label>
                      ) : (
                        <label className="terminal-activacion-primer-uso__pin">
                          <span>PIN del vecino</span>

                          <input
                            required
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]{4,6}"
                            minLength={4}
                            maxLength={6}
                            autoComplete="off"
                            value={pinActivacion}
                            onChange={(evento) =>
                              setPinActivacion(evento.target.value)
                            }
                            placeholder="4 a 6 dígitos"
                          />
                        </label>
                      )}

                      <button
                        type="submit"
                        className="terminal-activacion-primer-uso__principal"
                        disabled={
                          procesandoLlavero ||
                          (metodoActivacion === 'cedula' && !cedulaVerificada)
                        }
                      >
                        {procesandoLlavero
                          ? 'Activando…'
                          : 'Activar llavero →'}
                      </button>

                      <small className="terminal-activacion-primer-uso__seguridad">
                        Esta verificación se realiza solo la primera vez. Después de activarlo, acerca nuevamente el llavero para comenzar la compra.
                      </small>
                    </form>
                  ) : (
                    <div className="terminal-activacion-primer-uso__aviso">
                      <strong>No es posible activar este llavero</strong>
                      <span>Revisa su estado antes de continuar.</span>
                    </div>
                  )}
                </div>

                <div className="terminal-activacion-primer-uso__visual">
                  <div className="terminal-activacion-primer-uso__halo" />

                  <img
                    src={regalonPrimerUso}
                    alt=""
                    aria-hidden="true"
                  />

                  <span>
                    <strong>Primer uso seguro</strong>
                    <small>Actívalo una sola vez</small>
                  </span>
                </div>
              </section>
            </div>
          )}
        </section>
      )}

      {turno && enLinea && (
        <div
          className="terminal-seccion-contenido"
          hidden={seccionActiva !== 'canjes'}
        >
          <CanjesRegis
          cajas={cajas}
          cajaId={cajaId}
          turnoId={turno.turno_id}
          tokenLlavero={tokenLlavero}
          lecturaLlaveroId={lecturaLlavero?.lectura_id ?? null}
          credencialTerminal={credencialTerminal}
          llaveroActivo={contextoLlavero?.estado === 'activo'}
          saldoLlavero={saldoRegisLlavero}
          nombreVecinoLlavero={contextoLlavero?.nombre_vecino ?? null}
          alConsumirLectura={limpiarLecturaOperativa}
          alConfirmar={actualizarDespuesDeCompra}
          alVolverACompras={() => setSeccionActiva('compras')}
        />
        </div>
      )}

      {turno && seccionActiva === 'alertas' && (
        <section className="terminal-alertas-panel">
          <div className="terminal-alertas-panel__encabezado">
            <div>
              <span className="terminal-eyebrow">
                Centro de alertas
              </span>

              <h2>Estado de la terminal</h2>
            </div>

            <span
              className={
                enLinea
                  ? 'terminal-alertas-panel__resumen terminal-alertas-panel__resumen--ok'
                  : 'terminal-alertas-panel__resumen terminal-alertas-panel__resumen--error'
              }
            >
              {enLinea
                ? 'Operativa'
                : 'Requiere atención'}
            </span>
          </div>

          <div className="terminal-alertas-panel__grilla">
            <article>
              <span
                className={
                  enLinea
                    ? 'terminal-alertas-panel__punto terminal-alertas-panel__punto--ok'
                    : 'terminal-alertas-panel__punto terminal-alertas-panel__punto--error'
                }
              />

              <div>
                <small>Conexión</small>

                <strong>
                  {enLinea
                    ? 'Club Regalones conectado'
                    : 'Sin conexión'}
                </strong>

                <p>
                  {enLinea
                    ? 'Las operaciones están habilitadas.'
                    : 'Las operaciones permanecen bloqueadas.'}
                </p>
              </div>
            </article>

            <article>
              <span className="terminal-alertas-panel__icono">
                C
              </span>

              <div>
                <small>Caja vinculada</small>

                <strong>
                  {configuracion.nombreCaja}
                </strong>

                <p>
                  {configuracion.codigoCaja
                    ? configuracion.codigoCaja
                    : configuracion.nombreNegocio}
                </p>
              </div>
            </article>

            <article>
              <span className="terminal-alertas-panel__icono">
                T
              </span>

              <div>
                <small>Turno activo</small>

                <strong>
                  {turno.nombre_cajero}
                </strong>

                <p>
                  El turno sigue asociado a esta caja.
                </p>
              </div>
            </article>

            <article>
              <span
                className={
                  solicitudes.length > 0
                    ? 'terminal-alertas-panel__contador terminal-alertas-panel__contador--pendiente'
                    : 'terminal-alertas-panel__contador'
                }
              >
                {solicitudes.length}
              </span>

              <div>
                <small>Compras pendientes</small>

                <strong>
                  {solicitudes.length === 0
                    ? 'Sin compras esperando revisión'
                    : solicitudes.length === 1
                      ? '1 compra pendiente'
                      : `${solicitudes.length} compras pendientes`}
                </strong>

                <p>
                  {solicitudes.length === 0
                    ? 'No hay compras pendientes en esta caja.'
                    : 'Entra a Compras para revisarlas.'}
                </p>
              </div>
            </article>

            <article>
              <span className="terminal-alertas-panel__icono">
                L
              </span>

              <div>
                <small>Lector NFC</small>

                <strong>
                  {enLinea
                    ? 'Lector disponible'
                    : 'Lector no disponible'}
                </strong>

                <p>
                  {enLinea
                    ? 'Puedes vincular el celular o recibir lecturas de llaveros.'
                    : 'Se habilitará nuevamente al recuperar la conexión.'}
                </p>
              </div>
            </article>

            <article>
              <span className="terminal-alertas-panel__icono">
                R
              </span>

              <div>
                <small>Canjes REGIS</small>

                <strong>
                  {enLinea
                    ? 'Módulo disponible'
                    : 'Canjes bloqueados'}
                </strong>

                <p>
                  {enLinea
                    ? 'Revisa Canjes REGIS para reservas y beneficios.'
                    : 'No se pueden confirmar canjes sin conexión.'}
                </p>
              </div>
            </article>
          </div>

          <div
            className={
              enLinea
                ? 'terminal-alertas-panel__pie terminal-alertas-panel__pie--ok'
                : 'terminal-alertas-panel__pie terminal-alertas-panel__pie--error'
            }
          >
            <strong>
              {enLinea
                ? 'Terminal funcionando correctamente'
                : 'La Terminal conserva su vinculación'}
            </strong>

            <span>
              {enLinea
                ? solicitudes.length === 0
                  ? 'No hay compras pendientes de revisión.'
                  : 'Hay compras que requieren atención del cajero.'
                : 'Negocio, caja y turno permanecen protegidos hasta recuperar la conexión.'}
            </span>
          </div>
        </section>
      )}

      {seccionActiva === 'compras' &&
        !solicitudEnRevision &&
        !resultadoCompra && (
        cargandoTurno ? (
        <p className="terminal-empty">
          Comprobando turno…
        </p>
      ) : !turno ? null : cargando ? (
        <p className="terminal-empty">
          Cargando solicitudes…
        </p>
      ) : solicitudes.length === 0 ? null : (
        <section className="terminal-list" aria-label="Solicitudes pendientes">
          {solicitudes.map((solicitud) => {
            const estaProcesando = procesandoId === solicitud.id
            const montoEnEdicion = Number(montos[solicitud.id])
            const montoVigente = obtenerMontoVigente(solicitud)
            const hayCorreccionSinGuardar =
              montoVigente !== null && montoEnEdicion !== montoVigente

            return (
              <article className="terminal-request" key={solicitud.id}>
                <div className="terminal-request__encabezado">
                  <div>
                    <span className="terminal-request__estado">
                      {solicitud.estado.replace(/_/g, ' ')}
                    </span>
                    <h2>{formatearMonto(montoVigente)}</h2>
                  </div>
                  <time dateTime={solicitud.creado_en}>
                    {new Date(solicitud.creado_en).toLocaleString('es-CL')}
                  </time>
                </div>

                <dl>
                  <div>
                    <dt>Solicitud</dt>
                    <dd>{solicitud.id}</dd>
                  </div>
                  <div>
                    <dt>Caja</dt>
                    <dd>{solicitud.caja_id}</dd>
                  </div>
                  <div>
                    <dt>Informado</dt>
                    <dd>{formatearMonto(solicitud.monto_informado)}</dd>
                  </div>
                  {solicitud.llavero_id !== null && (
                    <div>
                      <dt>Modalidad</dt>
                      <dd>Asistida con llavero</dd>
                    </div>
                  )}
                  {solicitud.monto_corregido !== null && (
                    <div>
                      <dt>Corregido</dt>
                      <dd>{formatearMonto(solicitud.monto_corregido)}</dd>
                    </div>
                  )}
                </dl>

                {solicitud.motivo_correccion && (
                  <p className="terminal-request__motivo">
                    Última corrección: {solicitud.motivo_correccion}
                  </p>
                )}

                {solicitud.monto_informado === null ? (
                  <div className="terminal-request__asistencia">
                    <strong>Ingreso asistido</strong>
                    <p>
                      Ingresa el monto sólo si el vecino necesita ayuda para
                      escribirlo.
                    </p>
                    <div className="terminal-request__campo">
                      <label htmlFor={`monto-${solicitud.id}`}>
                        Monto pagado en CLP
                      </label>
                      <div>
                        <input
                          id={`monto-${solicitud.id}`}
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={montos[solicitud.id] ?? ''}
                          onChange={(evento) =>
                            setMontos((actuales) => ({
                              ...actuales,
                              [solicitud.id]: evento.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          disabled={estaProcesando}
                          onClick={() => void informarMonto(solicitud)}
                        >
                          Ingresar por el vecino
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="terminal-request__revision">
                    <strong>¿El monto coincide con la caja?</strong>
                    {solicitud.llavero_id !== null ? (
                      <p>
                        Si está correcto, aprueba la compra. Si no coincide,
                        corrígelo directamente con autorización del vecino.
                      </p>
                    ) : (
                      <p>
                        Si está correcto, aprueba la compra. Si no coincide,
                        puedes pedir al vecino que lo escriba nuevamente o
                        corregirlo directamente.
                      </p>
                    )}

                    <div className="terminal-request__campo">
                      <label htmlFor={`correccion-monto-${solicitud.id}`}>
                        Monto correcto en CLP
                      </label>
                      <input
                        id={`correccion-monto-${solicitud.id}`}
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={montos[solicitud.id] ?? ''}
                        onChange={(evento) =>
                          setMontos((actuales) => ({
                            ...actuales,
                            [solicitud.id]: evento.target.value,
                          }))
                        }
                      />
                    </div>

                    <input
                      aria-label="Motivo de corrección"
                      placeholder="Motivo de la corrección"
                      value={motivosCorreccion[solicitud.id] ?? ''}
                      onChange={(evento) =>
                        setMotivosCorreccion((actuales) => ({
                          ...actuales,
                          [solicitud.id]: evento.target.value,
                        }))
                      }
                    />

                    <div className="terminal-request__opciones-correccion">
                      {solicitud.llavero_id === null && (
                        <button
                          type="button"
                          disabled={estaProcesando}
                          onClick={() => void solicitarReingreso(solicitud)}
                        >
                          Pedir nuevo monto al vecino
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={estaProcesando}
                        onClick={() => void corregirMonto(solicitud)}
                      >
                        Guardar monto corregido
                      </button>
                    </div>

                    {hayCorreccionSinGuardar && (
                      <p className="terminal-request__pendiente">
                        Hay un monto editado sin guardar. Guarda la corrección
                        antes de aprobar.
                      </p>
                    )}
                  </div>
                )}

                <div className="terminal-request__botones">
                  <button
                    className="aprobar"
                    type="button"
                    disabled={
                      estaProcesando ||
                      montoVigente === null ||
                      hayCorreccionSinGuardar
                    }
                    onClick={() => void aprobar(solicitud)}
                  >
                    Aprobar compra
                  </button>
                </div>

                <div className="terminal-request__rechazo">
                  <input
                    aria-label="Motivo de rechazo"
                    placeholder="Motivo de rechazo"
                    value={motivosRechazo[solicitud.id] ?? ''}
                    onChange={(evento) =>
                      setMotivosRechazo((actuales) => ({
                        ...actuales,
                        [solicitud.id]: evento.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    disabled={estaProcesando}
                    onClick={() => void rechazar(solicitud)}
                  >
                    Rechazar
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      )
      )}
    </main>
  )
}

function App() {
  const [ruta, setRuta] = useState(() =>
    window.location.hash
      .replace(/^#\/?/, '')
      .split('?')[0],
  )

  const [
    estadoConfiguracion,
    setEstadoConfiguracion,
  ] = useState(() => {
    const guardada =
      leerConfiguracionTerminal()

    return {
      configuracion: guardada,
      validando: Boolean(guardada),
      errorValidacion: null as string | null,
    }
  })

  const [
    intentoValidacion,
    setIntentoValidacion,
  ] = useState(0)

  useEffect(() => {
    const actualizarRuta = () =>
      setRuta(
        window.location.hash
          .replace(/^#\/?/, '')
          .split('?')[0],
      )

    window.addEventListener(
      'hashchange',
      actualizarRuta,
    )

    return () =>
      window.removeEventListener(
        'hashchange',
        actualizarRuta,
      )
  }, [])

  useEffect(() => {
    const guardada =
      leerConfiguracionTerminal()

    if (!guardada) return

    let vigente = true

    void validarConfiguracionTerminal(
      guardada,
    )
      .then((actualizada) => {
        if (!vigente) return

        guardarConfiguracionTerminal(
          actualizada,
        )

        setEstadoConfiguracion({
          configuracion: actualizada,
          validando: false,
          errorValidacion: null,
        })
      })
      .catch((errorCapturado) => {
        if (!vigente) return

        setEstadoConfiguracion({
          configuracion: guardada,
          validando: false,
          errorValidacion:
            mensajeSupabase(errorCapturado),
        })
      })

    return () => {
      vigente = false
    }
  }, [intentoValidacion])

  if (ruta === 'lector-movil') {
    return <LectorMovil />
  }

  if (estadoConfiguracion.validando) {
    return (
      <main className="terminal-shell">
        <p className="terminal-empty">
          Comprobando Terminal…
        </p>
      </main>
    )
  }

  if (
    estadoConfiguracion.configuracion &&
    estadoConfiguracion.errorValidacion
  ) {
    return (
      <main className="terminal-shell">
        <section
          className="terminal-card"
          aria-labelledby="terminal-sin-conexion-title"
        >
          <span className="terminal-eyebrow">
            Club Regalones
          </span>

          <h1 id="terminal-sin-conexion-title">
            No pudimos validar esta Terminal
          </h1>

          <p>
            La vinculación con el negocio y la caja se
            conserva de forma segura.
          </p>

          <p>
            Revisa la conexión a Internet y vuelve a
            intentarlo. Si el problema continúa, contacta
            a administración de Club Regalones.
          </p>

          <p className="terminal-alert terminal-alert--error">
            No hay conexión con Club Regalones. La
            configuración permanente de esta caja sigue
            guardada y no se ha desvinculado la Terminal.
          </p>

          <button
            className="terminal-reintentar"
            type="button"
            onClick={() => {
              setEstadoConfiguracion((actual) => ({
                ...actual,
                validando: true,
                errorValidacion: null,
              }))

              setIntentoValidacion(
                (actual) => actual + 1,
              )
            }}
          >
            Reintentar conexión
          </button>
        </section>
      </main>
    )
  }

  if (!estadoConfiguracion.configuracion) {
    return (
      <ConfiguracionInicialTerminal
        alConfigurar={(configuracion) => {
          setEstadoConfiguracion({
            configuracion,
            validando: false,
            errorValidacion: null,
          })
        }}
      />
    )
  }

  return (
    <PanelTerminal
      configuracion={
        estadoConfiguracion.configuracion
      }
    />
  )
}
export default App
