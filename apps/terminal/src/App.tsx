import type { Tables } from '@club-regalones/domain'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useSesion } from './hooks/useSesion'
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
import { supabase } from './lib/supabase'
import CanjesRegis from './CanjesRegis'
import EstadoPwa from './EstadoPwa'
import LectorMovil from './LectorMovil'
import VinculacionLector from './VinculacionLector'
import type {
  CredencialTerminalLocal,
  LecturaOperativaTerminal,
} from './lib/terminalPwa'
import InicioTurno from './InicioTurno'
import {
  aprobarCompraEnTurno,
  cerrarTurnoTerminal,
  consultarTurnoTerminal,
  corregirMontoTerminal,
  informarMontoTerminal,
  rechazarSolicitudCompraEnTurno,
  solicitarReingresoMontoTerminal,
} from './lib/turnos'
import type { TurnoTerminal } from './lib/turnos'

type Solicitud = Tables<'solicitudes_compra'>

type CajaOperador = {
  id: string
  negocioId: string
  nombre: string
  codigo: string | null
  sucursal: string
}

const estadosAbiertos: Solicitud['estado'][] = [
  'esperando_monto',
  'esperando_cajero',
  'pendiente_validacion',
]

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

function AccesoTerminal() {
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const iniciarSesion = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setProcesando(true)
    setError(null)

    const { error: errorIngreso } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: contrasena,
    })

    setProcesando(false)

    if (errorIngreso) {
      setError(mensajeSupabase(errorIngreso))
    }
  }

  return (
    <main className="terminal-shell">
      <section className="terminal-card" aria-labelledby="terminal-title">
        <span className="terminal-eyebrow">Club Regalones</span>
        <h1 id="terminal-title">Terminal del comercio</h1>
        <p>
          Inicia sesión con una cuenta que sea miembro activo del negocio.
        </p>

        <form className="terminal-form" onSubmit={iniciarSesion}>
          <label>
            Correo electrónico
            <input
              required
              type="email"
              autoComplete="email"
              value={correo}
              onChange={(evento) => setCorreo(evento.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              required
              type="password"
              autoComplete="current-password"
              value={contrasena}
              onChange={(evento) => setContrasena(evento.target.value)}
            />
          </label>
          {error && <p className="terminal-alert terminal-alert--error">{error}</p>}
          <button type="submit" disabled={procesando}>
            {procesando ? 'Ingresando…' : 'Ingresar a la terminal'}
          </button>
        </form>
      </section>
    </main>
  )
}

function PanelTerminal() {
  const { sesion } = useSesion()
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
  const [sinMembresia, setSinMembresia] = useState(false)
  const [puedeGestionarBeneficios, setPuedeGestionarBeneficios] =
    useState(false)
  const [cajas, setCajas] = useState<CajaOperador[]>([])
  const [cajaId, setCajaId] = useState('')
  const [tokenLlavero, setTokenLlavero] = useState('')
  const [credencialTerminal, setCredencialTerminal] =
    useState<CredencialTerminalLocal | null>(null)
  const [turno, setTurno] = useState<TurnoTerminal | null>(null)
  const [cargandoTurno, setCargandoTurno] = useState(false)
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

  useEffect(() => {
    const negocioId = cajas.find((caja) => caja.id === cajaId)?.negocioId
    let activa = true

    if (!negocioId) {
      return () => { activa = false }
    }

    void obtenerReglaAcumulacionVigente(negocioId)
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
        setErrorReglaAcumulacion(mensajeSupabase(errorCapturado))
      })

    return () => { activa = false }
  }, [cajaId, cajas])

  const limpiarLecturaOperativa = useCallback(() => {
    setLecturaLlavero(null)
    setContextoLlavero(null)
    setSaldoRegisLlavero(null)
    setMontoCompraAsistida('')
    setIdempotenciaCompraAsistida(crypto.randomUUID())
  }, [])

  const cambiarCredencialTerminal = useCallback(
    (credencial: CredencialTerminalLocal | null) => {
      setCredencialTerminal(credencial)
      setTurno(null)
      setCargandoTurno(Boolean(credencial))
      setCerrandoTurno(false)
      if (!credencial) limpiarLecturaOperativa()
    },
    [limpiarLecturaOperativa],
  )

  useEffect(() => {
    let vigente = true

    if (!credencialTerminal) {
      return () => {
        vigente = false
      }
    }

    void consultarTurnoTerminal(credencialTerminal)
      .then((turnoAbierto) => {
        if (!vigente) return
        setTurno(turnoAbierto)
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
    if (!sesion) return

    setCargando(true)
    setError(null)

    const { data: membresias, error: errorMembresias } = await supabase
      .from('miembros_negocio')
      .select('negocio_id, rol')
      .eq('usuario_id', sesion.user.id)
      .eq('estado', 'activo')

    if (errorMembresias) {
      setError(mensajeSupabase(errorMembresias))
      setCargando(false)
      return
    }

    if (membresias.length === 0) {
      setSinMembresia(true)
      setPuedeGestionarBeneficios(false)
      setSolicitudes([])
      setCajas([])
      setCargando(false)
      return
    }

    setSinMembresia(false)
    setPuedeGestionarBeneficios(
      membresias.some(
        ({ rol }) => rol === 'propietario' || rol === 'administrador',
      ),
    )

    const negociosIds = membresias.map((membresia) => membresia.negocio_id)
    const { data: sucursales, error: errorSucursales } = await supabase
      .from('sucursales')
      .select('id, negocio_id, nombre')
      .in('negocio_id', negociosIds)
      .eq('estado', 'activa')

    if (errorSucursales) {
      setError(mensajeSupabase(errorSucursales))
      setCargando(false)
      return
    }

    const sucursalesPorId = new Map(
      sucursales.map((sucursal) => [
        sucursal.id,
        { nombre: sucursal.nombre, negocioId: sucursal.negocio_id },
      ]),
    )
    const sucursalesIds = sucursales.map((sucursal) => sucursal.id)
    const { data: cajasActivas, error: errorCajas } = sucursalesIds.length
      ? await supabase
          .from('cajas')
          .select('id, nombre, codigo, sucursal_id')
          .in('sucursal_id', sucursalesIds)
          .eq('estado', 'activa')
          .order('nombre')
      : { data: [], error: null }

    if (errorCajas) {
      setError(mensajeSupabase(errorCajas))
      setCargando(false)
      return
    }

    const cajasDisponibles = cajasActivas.flatMap((caja) => {
      const sucursal = sucursalesPorId.get(caja.sucursal_id)
      if (!sucursal) return []

      return [{
        id: caja.id,
        negocioId: sucursal.negocioId,
        nombre: caja.nombre,
        codigo: caja.codigo,
        sucursal: sucursal.nombre,
      }]
    })

    setCajas(cajasDisponibles)
    setCajaId((actual) =>
      cajasDisponibles.some((caja) => caja.id === actual)
        ? actual
        : (cajasDisponibles[0]?.id ?? ''),
    )

    const { data, error: errorSolicitudes } = await supabase
      .from('solicitudes_compra')
      .select('*')
      .in('estado', estadosAbiertos)
      .gt('expira_en', new Date().toISOString())
      .order('creado_en', { ascending: false })

    setCargando(false)

    if (errorSolicitudes) {
      setError(mensajeSupabase(errorSolicitudes))
      return
    }

    setSolicitudes(data)
    setMontos((actuales) => {
      const siguientes = { ...actuales }
      data.forEach((solicitud) => {
        const montoVigente = obtenerMontoVigente(solicitud)
        if (montoVigente !== null) {
          siguientes[solicitud.id] = String(montoVigente)
        }
      })
      return siguientes
    })
  }, [sesion])

  useEffect(() => {
    const cargaInicial = window.setTimeout(() => {
      void cargarSolicitudes()
    }, 0)

    return () => window.clearTimeout(cargaInicial)
  }, [cargarSolicitudes])

  const consultarLlavero = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()

    if (!cajaId) {
      setError('Selecciona la caja donde se utilizará el llavero.')
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
        cajaId,
      )

      if (!contexto) {
        setContextoLlavero(null)
        setError('No encontramos un llavero asociado a ese identificador.')
        return
      }

      setContextoLlavero(contexto)
      setSaldoRegisLlavero(
        contexto.estado === 'activo'
          ? await consultarSaldoRegisLlavero(tokenLlavero.trim(), cajaId)
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

    if (!contextoLlavero || contextoLlavero.estado !== 'activo' || !cajaId) {
      setError('Lee un llavero activo antes de iniciar la compra asistida.')
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
      if (lecturaLlavero && !credencialTerminal) {
        setError('La credencial segura de esta Terminal PWA ya no está disponible.')
        return
      }

      const solicitud = lecturaLlavero && credencialTerminal
        ? await crearCompraAsistidaDesdeLectura(
            lecturaLlavero.lectura_id,
            credencialTerminal,
            monto,
            idempotenciaCompraAsistida,
          )
        : await crearCompraAsistida(
            tokenLlavero.trim(),
            cajaId,
            monto,
            idempotenciaCompraAsistida,
          )

      if (!solicitud) {
        setError('Supabase no devolvió la solicitud de compra asistida.')
        return
      }

      setMensaje(
        'Compra asistida preparada. Revisa el monto y apruébala en la solicitud pendiente.',
      )
      setMontoCompraAsistida('')
      setIdempotenciaCompraAsistida(crypto.randomUUID())
      if (lecturaLlavero) {
        setLecturaLlavero(null)
        setContextoLlavero(null)
        setSaldoRegisLlavero(null)
      }
      await cargarSolicitudes()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesandoLlavero(false)
    }
  }

  const activarLlavero = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!contextoLlavero || !cajaId) return

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
            credencialTerminal,
            metodoActivacion,
            metodoActivacion === 'pin' ? pinActivacion : null,
            metodoActivacion === 'cedula' && cedulaVerificada,
          )
        : await activarLlaveroPrimerUso(
            tokenLlavero.trim(),
            cajaId,
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
        await consultarSaldoRegisLlavero(tokenLlavero.trim(), cajaId),
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
    await cargarSolicitudes()

    if (
      contextoLlavero?.estado === 'activo' &&
      tokenLlavero.trim().length >= 8 &&
      cajaId
    ) {
      try {
        setSaldoRegisLlavero(
          await consultarSaldoRegisLlavero(tokenLlavero.trim(), cajaId),
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
      limpiarLecturaOperativa()
      setMensaje('Turno finalizado correctamente.')
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setCerrandoTurno(false)
    }
  }

  const cerrarSesion = async () => {
    const { error: errorCierre } = await supabase.auth.signOut()
    if (errorCierre) setError(mensajeSupabase(errorCierre))
  }

  const montoVistaPrevia = Number(montoCompraAsistida)
  const vistaPreviaRegis = reglaAcumulacion
    ? calcularVistaPreviaRegis(
        montoVistaPrevia,
        reglaAcumulacion,
        saldoRegisLlavero?.remanente_valor_clp ?? 0,
      )
    : null

  return (
    <main className="terminal-panel">
      {turno && (
        <header className="terminal-panel__header">
          <div>
            <span className="terminal-eyebrow">Club Regalones</span>
            <h1>Terminal de caja</h1>
            <p>Cajero: {turno.nombre_cajero}</p>
          </div>

          <div className="terminal-panel__acciones">
            <EstadoPwa />

            <button
              type="button"
              disabled={cerrandoTurno}
              onClick={() => void finalizarTurno()}
            >
              {cerrandoTurno ? 'Finalizando…' : 'Finalizar turno'}
            </button>

            <button type="button" onClick={() => void cargarSolicitudes()}>
              Actualizar
            </button>

            <button type="button" onClick={() => void cerrarSesion()}>
              Cerrar sesión
            </button>
          </div>
        </header>
      )}

      {!cargando && !sinMembresia && cajaId && (
        <VinculacionLector
          cajaId={cajaId}
          puedeRegistrar={puedeGestionarBeneficios}
          mostrarControles={Boolean(turno)}
          alCambiarCredencial={cambiarCredencialTerminal}
          alReclamarLectura={recibirLecturaOperativa}
        />
      )}

      {error && <p className="terminal-alert terminal-alert--error">{error}</p>}
      {mensaje && (
        <p className="terminal-alert terminal-alert--success">{mensaje}</p>
      )}

      {!cargando &&
        !sinMembresia &&
        credencialTerminal &&
        !cargandoTurno &&
        !turno && (
          <InicioTurno
            credencial={credencialTerminal}
            alIniciar={(nuevoTurno) => {
              setTurno(nuevoTurno)
              setMensaje(`Turno iniciado por ${nuevoTurno.nombre_cajero}.`)
            }}
          />
        )}

      {!cargando && !sinMembresia && turno && (
        <section className="terminal-llavero" aria-labelledby="activar-llavero-title">
          <div className="terminal-llavero__encabezado">
            <div>
              <span className="terminal-eyebrow">Identificación asistida</span>
              <h2 id="activar-llavero-title">Leer llavero</h2>
            </div>
            <p>
              El celular lector envía la identidad a esta Terminal PWA. Si es
              el primer uso, se solicitará verificar cédula o PIN.
            </p>
          </div>

          {cajas.length === 0 ? (
            <p className="terminal-llavero__aviso">
              No hay cajas activas disponibles para esta cuenta.
            </p>
          ) : (
            <form
              className="terminal-llavero__consulta"
              onSubmit={consultarLlavero}
            >
              <label>
                Caja
                <select
                  required
                  value={cajaId}
                  onChange={(evento) => {
                    setCajaId(evento.target.value)
                    setCredencialTerminal(null)
                    setLecturaLlavero(null)
                    setContextoLlavero(null)
                    setSaldoRegisLlavero(null)
                    setMontoCompraAsistida('')
                    setIdempotenciaCompraAsistida(crypto.randomUUID())
                  }}
                >
                  {cajas.map((caja) => (
                    <option key={caja.id} value={caja.id}>
                      {caja.sucursal} · {caja.nombre}
                      {caja.codigo ? ` (${caja.codigo})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Token manual de respaldo
                <input
                  required
                  type="password"
                  minLength={8}
                  maxLength={500}
                  autoComplete="off"
                  value={tokenLlavero}
                  onChange={(evento) => {
                    setTokenLlavero(evento.target.value)
                    setLecturaLlavero(null)
                    setContextoLlavero(null)
                    setSaldoRegisLlavero(null)
                    setMontoCompraAsistida('')
                    setIdempotenciaCompraAsistida(crypto.randomUUID())
                  }}
                  placeholder="Solo si el celular lector no está disponible"
                />
              </label>
              <button type="submit" disabled={procesandoLlavero}>
                {procesandoLlavero ? 'Consultando…' : 'Leer llavero'}
              </button>
            </form>
          )}

          {contextoLlavero && (
            <div className="terminal-llavero__resultado">
              <div className="terminal-llavero__identidad">
                <span
                  className={`terminal-llavero__estado terminal-llavero__estado--${contextoLlavero.estado}`}
                >
                  {contextoLlavero.estado === 'activo'
                    ? 'Activo'
                    : 'Pendiente de activación'}
                </span>
                <h3>{contextoLlavero.nombre_vecino}</h3>
                <p>Código público: {contextoLlavero.codigo_publico}</p>
              </div>

              {contextoLlavero.estado === 'activo' ? (
                <div className="terminal-llavero__compra">
                  {saldoRegisLlavero && (
                    <aside className="terminal-llavero__saldo" aria-live="polite">
                      <div>
                        <span>Saldo en {saldoRegisLlavero.nombre_negocio}</span>
                        <strong>{saldoRegisLlavero.disponibles} REGIS</strong>
                      </div>
                      <p>
                        Disponibles solo en este comercio.
                        {saldoRegisLlavero.pendientes > 0 && (
                          <>
                            {' '}
                            Además tiene {saldoRegisLlavero.pendientes} REGIS
                            pendientes de revisión.
                          </>
                        )}
                      </p>
                    </aside>
                  )}
                  <p className="terminal-llavero__confirmado">
                    El llavero está activo. Ingresa el monto realmente pagado
                    para preparar la compra asistida.
                  </p>
                  <form onSubmit={crearSolicitudAsistida}>
                    <label>
                      Monto pagado en CLP
                      <input
                        required
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={montoCompraAsistida}
                        onChange={(evento) =>
                          setMontoCompraAsistida(evento.target.value)
                        }
                        placeholder="Ejemplo: 12500"
                      />
                    </label>
                    <button type="submit" disabled={procesandoLlavero}>
                      {procesandoLlavero
                        ? 'Preparando…'
                        : 'Continuar a revisión'}
                    </button>
                  </form>
                  {montoCompraAsistida &&
                    reglaAcumulacion &&
                    vistaPreviaRegis && (
                    <aside
                      className={`terminal-llavero__prevision${
                        vistaPreviaRegis.cumpleMinimo
                          ? ''
                          : ' terminal-llavero__prevision--sin-acumulacion'
                      }`}
                      aria-live="polite"
                    >
                      {vistaPreviaRegis.cumpleMinimo ? (
                        <>
                          <span>Recompensa estimada</span>
                          <strong>
                            Ganará {vistaPreviaRegis.regis} REGIS
                          </strong>
                          <small>
                            Equivale al{' '}
                            {reglaAcumulacion.tasa_acumulacion_bp / 100}% de la
                            compra. Se acreditará únicamente después de aprobar
                            el monto final.
                          </small>
                        </>
                      ) : vistaPreviaRegis.montoValido ? (
                        <>
                          <strong>Esta compra todavía no acumula REGIS</strong>
                          <small>
                            El monto mínimo es{' '}
                            {formatearMonto(
                              reglaAcumulacion.monto_minimo_compra_clp,
                            )}.
                          </small>
                        </>
                      ) : null}
                    </aside>
                  )}
                  {errorReglaAcumulacion && (
                    <small className="terminal-llavero__prevision-error">
                      No pudimos calcular la recompensa estimada. La aprobación
                      final seguirá aplicando la regla segura de Supabase.
                    </small>
                  )}
                  <small>
                    La compra todavía no queda aprobada. El monto aparecerá
                    abajo para una confirmación final del cajero.
                  </small>
                </div>
              ) : !contextoLlavero.entregado ? (
                <p className="terminal-llavero__aviso">
                  Este llavero todavía no figura como entregado. No puede
                  activarse.
                </p>
              ) : contextoLlavero.puede_activar ? (
                <form
                  className="terminal-llavero__activacion"
                  onSubmit={activarLlavero}
                >
                  <fieldset>
                    <legend>Método de verificación</legend>
                    <label>
                      <input
                        type="radio"
                        name="metodo-activacion"
                        value="cedula"
                        checked={metodoActivacion === 'cedula'}
                        onChange={() => setMetodoActivacion('cedula')}
                      />
                      Revisar cédula
                    </label>
                    <label className={!contextoLlavero.tiene_pin ? 'deshabilitado' : ''}>
                      <input
                        type="radio"
                        name="metodo-activacion"
                        value="pin"
                        disabled={!contextoLlavero.tiene_pin}
                        checked={metodoActivacion === 'pin'}
                        onChange={() => setMetodoActivacion('pin')}
                      />
                      Ingresar PIN
                    </label>
                  </fieldset>

                  {metodoActivacion === 'cedula' ? (
                    <label className="terminal-llavero__confirmacion">
                      <input
                        type="checkbox"
                        checked={cedulaVerificada}
                        onChange={(evento) =>
                          setCedulaVerificada(evento.target.checked)
                        }
                      />
                      Revisé presencialmente la cédula y el nombre corresponde
                      al titular.
                    </label>
                  ) : (
                    <label>
                      PIN del vecino
                      <input
                        required
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]{4,6}"
                        minLength={4}
                        maxLength={6}
                        autoComplete="off"
                        value={pinActivacion}
                        onChange={(evento) => setPinActivacion(evento.target.value)}
                        placeholder="4 a 6 dígitos"
                      />
                    </label>
                  )}

                  <button type="submit" disabled={procesandoLlavero}>
                    {procesandoLlavero
                      ? 'Activando…'
                      : 'Activar y continuar compra'}
                  </button>
                </form>
              ) : null}
            </div>
          )}
        </section>
      )}

      {!cargando && !sinMembresia && turno && (
        <CanjesRegis
          cajas={cajas}
          cajaId={cajaId}
          turnoId={turno.turno_id}
          tokenLlavero={tokenLlavero}
          lecturaLlaveroId={lecturaLlavero?.lectura_id ?? null}
          credencialTerminal={credencialTerminal}
          llaveroActivo={contextoLlavero?.estado === 'activo'}
          saldoLlavero={saldoRegisLlavero}
          alConsumirLectura={limpiarLecturaOperativa}
          alConfirmar={actualizarDespuesDeCompra}
        />
      )}

      {cargando ? (
        <p className="terminal-empty">Cargando solicitudes…</p>
      ) : sinMembresia ? (
        <p className="terminal-empty">
          Esta cuenta no pertenece a ningún negocio activo. Debes agregarla en
          `miembros_negocio` antes de usar la terminal.
        </p>
      ) : !credencialTerminal ? (
        <p className="terminal-empty">
          Vincula esta Terminal PWA a una caja para comenzar.
        </p>
      ) : cargandoTurno ? (
        <p className="terminal-empty">Comprobando turno…</p>
      ) : !turno ? null : solicitudes.length === 0 ? (
        <p className="terminal-empty">No hay solicitudes pendientes.</p>
      ) : (
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
                        Guardar corrección directa
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
      )}
    </main>
  )
}

function App() {
  const { sesion, cargando } = useSesion()
  const [ruta, setRuta] = useState(() =>
    window.location.hash.replace(/^#\/?/, '').split('?')[0],
  )

  useEffect(() => {
    const actualizarRuta = () =>
      setRuta(window.location.hash.replace(/^#\/?/, '').split('?')[0])
    window.addEventListener('hashchange', actualizarRuta)
    return () => window.removeEventListener('hashchange', actualizarRuta)
  }, [])

  if (ruta === 'lector-movil') return <LectorMovil />

  if (cargando) {
    return (
      <main className="terminal-shell">
        <p className="terminal-empty">Comprobando sesión…</p>
      </main>
    )
  }

  if (!sesion) return <AccesoTerminal />

  return <PanelTerminal />
}

export default App
