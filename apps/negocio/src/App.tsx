import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  eliminarConfiguracionDispositivo,
  leerConfiguracionDispositivo,
  prepararCajaRegalones,
  registrarDispositivoCaja,
  validarConfiguracionDispositivo,
} from './lib/dispositivo'
import type {
  ConfiguracionDispositivoNegocio,
  PreparacionCajaRegalones,
} from './lib/dispositivo'
import {
  cerrarTurnoNegocio,
  configurarEquipoInicial,
  consultarTurnoNegocio,
  iniciarTurnoNegocio,
  listarCajerosDispositivo,
} from './lib/cajeros'
import type {
  CajeroDisponible,
  CajeroOnboarding,
  ModoIdentificacionCajero,
  TurnoAppNegocio,
} from './lib/cajeros'

type NegocioConfigurable = {
  id: string
  nombre: string
}

type SucursalConfigurable = {
  id: string
  negocioId: string
  nombre: string
  direccion: string
  comuna: string
}

function mensajeError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message)
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.'
}

function ConfiguracionInicial({
  alConfigurar,
}: {
  alConfigurar: (configuracion: ConfiguracionDispositivoNegocio) => void
}) {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [negocios, setNegocios] = useState<NegocioConfigurable[]>([])
  const [sucursales, setSucursales] = useState<SucursalConfigurable[]>([])
  const [negocioId, setNegocioId] = useState('')
  const [sucursalId, setSucursalId] = useState('')
  const [preparacion, setPreparacion] =
    useState<PreparacionCajaRegalones | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [cargandoOpciones, setCargandoOpciones] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!activo) return
      setSesion(data.session)
      setCargandoSesion(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion)
      setCargandoSesion(false)
    })

    return () => {
      activo = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!sesion) return

    let activo = true
    const temporizador = window.setTimeout(() => {
      setCargandoOpciones(true)
      setError(null)

      void (async () => {
        try {
          const { data: membresias, error: errorMembresias } = await supabase
            .from('miembros_negocio')
            .select('negocio_id, rol')
            .eq('usuario_id', sesion.user.id)
            .eq('estado', 'activo')
            .in('rol', ['propietario', 'administrador'])

          if (errorMembresias) throw errorMembresias

          const negocioIds = membresias.map(({ negocio_id }) => negocio_id)
          if (negocioIds.length === 0) {
            throw new Error('Esta cuenta no administra ningún comercio Regalón.')
          }

          const [respuestaNegocios, respuestaSucursales] = await Promise.all([
            supabase
              .from('negocios')
              .select('id, nombre')
              .in('id', negocioIds)
              .eq('estado', 'activo')
              .order('nombre'),
            supabase
              .from('sucursales')
              .select('id, negocio_id, nombre, direccion, comuna')
              .in('negocio_id', negocioIds)
              .eq('estado', 'activa')
              .order('nombre'),
          ])

          if (respuestaNegocios.error) throw respuestaNegocios.error
          if (respuestaSucursales.error) throw respuestaSucursales.error
          if (!activo) return

          const sucursalesDisponibles = respuestaSucursales.data.map(
            (sucursal) => ({
              id: sucursal.id,
              negocioId: sucursal.negocio_id,
              nombre: sucursal.nombre,
              direccion: sucursal.direccion,
              comuna: sucursal.comuna,
            }),
          )
          const primerNegocio = respuestaNegocios.data[0]?.id ?? ''
          const primeraSucursal = sucursalesDisponibles.find(
            (sucursal) => sucursal.negocioId === primerNegocio,
          )?.id ?? ''

          setNegocios(respuestaNegocios.data)
          setSucursales(sucursalesDisponibles)
          setNegocioId(primerNegocio)
          setSucursalId(primeraSucursal)
        } catch (capturado) {
          if (activo) setError(mensajeError(capturado))
        } finally {
          if (activo) setCargandoOpciones(false)
        }
      })()
    }, 0)

    return () => {
      activo = false
      window.clearTimeout(temporizador)
    }
  }, [sesion])

  const iniciarSesion = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setProcesando(true)
    setError(null)

    const { error: errorIngreso } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: contrasena,
    })

    setProcesando(false)
    if (errorIngreso) setError(mensajeError(errorIngreso))
  }

  const cambiarNegocio = (nuevoNegocioId: string) => {
    const primeraSucursal = sucursales.find(
      (sucursal) => sucursal.negocioId === nuevoNegocioId,
    )?.id ?? ''

    setNegocioId(nuevoNegocioId)
    setSucursalId(primeraSucursal)
    setPreparacion(null)
    setError(null)
  }

  const finalizarVinculacion = async (
    mover: boolean,
    cajaPreparada: PreparacionCajaRegalones,
  ) => {
    setProcesando(true)
    setError(null)

    try {
      const configuracion = await registrarDispositivoCaja(
        cajaPreparada.caja_id,
        mover,
      )

      if (
        configuracion.negocioId !== negocioId ||
        configuracion.sucursalId !== sucursalId
      ) {
        throw new Error('El dispositivo quedó vinculado a un contexto diferente al seleccionado.')
      }

      const { error: errorSalida } = await supabase.auth.signOut()
      if (errorSalida) throw errorSalida

      alConfigurar(configuracion)
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  const preparar = async () => {
    if (!sucursalId) {
      setError('Selecciona una sucursal para continuar.')
      return
    }

    setProcesando(true)
    setError(null)

    try {
      const cajaPreparada = await prepararCajaRegalones(sucursalId)
      if (!cajaPreparada) {
        throw new Error('No pudimos preparar la Caja Regalones de esta sucursal.')
      }

      setPreparacion(cajaPreparada)

      if (!cajaPreparada.terminal_id) {
        await finalizarVinculacion(false, cajaPreparada)
      }
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  if (cargandoSesion) {
    return <main className="negocio-shell negocio-shell--centrado">Comprobando configuración…</main>
  }

  if (!sesion) {
    return (
      <main className="negocio-shell negocio-shell--centrado">
        <section className="negocio-card">
          <span className="negocio-eyebrow">Configuración inicial</span>
          <h1>Vincula este celular</h1>
          <p>
            Solo el propietario o administrador inicia sesión una vez para asociar
            este dispositivo a la sucursal. El cajero no necesita una cuenta.
          </p>
          <form className="negocio-form" onSubmit={iniciarSesion}>
            <label>
              Correo del comercio
              <input
                required
                type="email"
                value={correo}
                onChange={(evento) => setCorreo(evento.target.value)}
              />
            </label>
            <label>
              Contraseña
              <input
                required
                type="password"
                value={contrasena}
                onChange={(evento) => setContrasena(evento.target.value)}
              />
            </label>
            {error && <p className="negocio-alert negocio-alert--error">{error}</p>}
            <button disabled={procesando} type="submit">
              {procesando ? 'Ingresando…' : 'Continuar'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  const sucursalesDelNegocio = sucursales.filter(
    (sucursal) => sucursal.negocioId === negocioId,
  )

  return (
    <main className="negocio-shell negocio-shell--centrado">
      <section className="negocio-card">
        <span className="negocio-eyebrow">Configuración inicial</span>
        <h1>¿Dónde trabajará este celular?</h1>
        <p>La App Negocio quedará vinculada a una sola Caja Regalones por sucursal.</p>

        <div className="negocio-form">
          <label>
            Negocio
            <select
              value={negocioId}
              disabled={cargandoOpciones || procesando}
              onChange={(evento) => cambiarNegocio(evento.target.value)}
            >
              {negocios.map((negocio) => (
                <option key={negocio.id} value={negocio.id}>{negocio.nombre}</option>
              ))}
            </select>
          </label>

          <label>
            Sucursal
            <select
              value={sucursalId}
              disabled={cargandoOpciones || procesando}
              onChange={(evento) => {
                setSucursalId(evento.target.value)
                setPreparacion(null)
              }}
            >
              {sucursalesDelNegocio.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>
                  {sucursal.nombre} · {sucursal.comuna}
                </option>
              ))}
            </select>
          </label>

          {preparacion?.terminal_id ? (
            <div className="negocio-alert negocio-alert--warning">
              <strong>Esta sucursal ya tiene un dispositivo operativo.</strong>
              <span>
                {preparacion.terminal_nombre_dispositivo ?? preparacion.terminal_identificador}
              </span>
              <p>
                Si continúas, la Caja Regalones se moverá a este celular y el dispositivo
                anterior quedará revocado.
              </p>
              <button
                type="button"
                disabled={procesando}
                onClick={() => void finalizarVinculacion(true, preparacion)}
              >
                {procesando ? 'Moviendo…' : 'Mover Caja Regalones a este celular'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={procesando || cargandoOpciones || !sucursalId}
              onClick={() => void preparar()}
            >
              {procesando ? 'Configurando…' : 'Vincular este celular'}
            </button>
          )}

          {error && <p className="negocio-alert negocio-alert--error">{error}</p>}
        </div>
      </section>
    </main>
  )
}

function ConfigurarCajerosIniciales({
  configuracion,
  alFinalizar,
}: {
  configuracion: ConfiguracionDispositivoNegocio
  alFinalizar: () => Promise<void>
}) {
  const [modo, setModo] = useState<ModoIdentificacionCajero>('solo_nombre')
  const [cajeros, setCajeros] = useState<CajeroOnboarding[]>([
    {
      id: crypto.randomUUID(),
      nombre: '',
      apellido: '',
      rol: 'cajero',
      pin: '',
    },
  ])
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const actualizar = (id: string, cambios: Partial<CajeroOnboarding>) => {
    setCajeros((actuales) =>
      actuales.map((cajero) => cajero.id === id ? { ...cajero, ...cambios } : cajero),
    )
  }

  const agregar = () => {
    setCajeros((actuales) => [
      ...actuales,
      {
        id: crypto.randomUUID(),
        nombre: '',
        apellido: '',
        rol: 'cajero',
        pin: '',
      },
    ])
  }

  const quitar = (id: string) => {
    setCajeros((actuales) => actuales.filter((cajero) => cajero.id !== id))
  }

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setError(null)

    if (cajeros.length === 0) {
      setError('Agrega al menos un cajero para continuar.')
      return
    }

    for (const cajero of cajeros) {
      if (cajero.nombre.trim().length < 2) {
        setError('Cada cajero necesita un nombre de al menos 2 caracteres.')
        return
      }
      if (modo === 'nombre_pin' && !/^[0-9]{4,6}$/.test(cajero.pin ?? '')) {
        setError('Cada cajero necesita un PIN de 4 a 6 dígitos.')
        return
      }
    }

    setProcesando(true)
    try {
      await configurarEquipoInicial(configuracion, modo, cajeros)
      await alFinalizar()
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <main className="negocio-shell negocio-shell--centrado">
      <section className="negocio-card negocio-card--ancha">
        <span className="negocio-eyebrow">Último paso de configuración</span>
        <h1>¿Quiénes usarán Regalones aquí?</h1>
        <p>
          Agrega a las personas que atenderán en {configuracion.nombreSucursal}.
          Después podrán iniciar su turno tocando su nombre.
        </p>

        <div className="negocio-modos">
          <button
            type="button"
            className={modo === 'solo_nombre' ? 'activo' : ''}
            onClick={() => setModo('solo_nombre')}
          >
            <strong>Solo seleccionar nombre</strong>
            <span>Más rápido · recomendado para negocios pequeños</span>
          </button>
          <button
            type="button"
            className={modo === 'nombre_pin' ? 'activo' : ''}
            onClick={() => setModo('nombre_pin')}
          >
            <strong>Nombre + PIN</strong>
            <span>Mayor control para equipos con más personas</span>
          </button>
        </div>

        <form className="negocio-form" onSubmit={guardar}>
          <div className="negocio-lista-configuracion">
            {cajeros.map((cajero, indice) => (
              <article key={cajero.id} className="negocio-cajero-configuracion">
                <div className="negocio-cajero-configuracion__titulo">
                  <strong>Cajero {indice + 1}</strong>
                  {cajeros.length > 1 && (
                    <button type="button" onClick={() => quitar(cajero.id)}>Quitar</button>
                  )}
                </div>
                <div className="negocio-grid-cajero">
                  <label>
                    Nombre
                    <input
                      required
                      value={cajero.nombre}
                      onChange={(evento) => actualizar(cajero.id, { nombre: evento.target.value })}
                    />
                  </label>
                  <label>
                    Apellido opcional
                    <input
                      value={cajero.apellido}
                      onChange={(evento) => actualizar(cajero.id, { apellido: evento.target.value })}
                    />
                  </label>
                  <label>
                    Rol
                    <select
                      value={cajero.rol}
                      onChange={(evento) => actualizar(cajero.id, {
                        rol: evento.target.value as CajeroOnboarding['rol'],
                      })}
                    >
                      <option value="cajero">Cajero/a</option>
                      <option value="supervisor">Supervisor/a</option>
                    </select>
                  </label>
                  {modo === 'nombre_pin' && (
                    <label>
                      PIN
                      <input
                        required
                        type="password"
                        inputMode="numeric"
                        minLength={4}
                        maxLength={6}
                        value={cajero.pin ?? ''}
                        onChange={(evento) => actualizar(cajero.id, {
                          pin: evento.target.value.replace(/\D/g, ''),
                        })}
                        placeholder="4 a 6 dígitos"
                      />
                    </label>
                  )}
                </div>
              </article>
            ))}
          </div>

          <button className="secundario" type="button" onClick={agregar}>
            + Agregar otro cajero
          </button>

          {error && <p className="negocio-alert negocio-alert--error">{error}</p>}

          <button disabled={procesando} type="submit">
            {procesando ? 'Guardando equipo…' : 'Finalizar configuración'}
          </button>
        </form>
      </section>
    </main>
  )
}

function OperacionCajero({
  configuracion,
}: {
  configuracion: ConfiguracionDispositivoNegocio
}) {
  const [cajeros, setCajeros] = useState<CajeroDisponible[]>([])
  const [turno, setTurno] = useState<TurnoAppNegocio | null>(null)
  const [cajeroSeleccionado, setCajeroSeleccionado] =
    useState<CajeroDisponible | null>(null)
  const [pin, setPin] = useState('')
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)

    try {
      const [cajerosDisponibles, turnoAbierto] = await Promise.all([
        listarCajerosDispositivo(configuracion),
        consultarTurnoNegocio(configuracion),
      ])
      setCajeros(cajerosDisponibles)
      setTurno(turnoAbierto)
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setCargando(false)
    }
  }, [configuracion])

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      void cargar()
    }, 0)

    return () => window.clearTimeout(temporizador)
  }, [cargar])

  const aceptarResultadoTurno = (resultado: Awaited<ReturnType<typeof iniciarTurnoNegocio>>) => {
    if (!resultado) {
      throw new Error('Club Regalones no devolvió el resultado del inicio de turno.')
    }

    if (!resultado.autenticado) {
      setError(resultado.mensaje)
      setPin('')
      return false
    }

    setTurno({
      turno_id: resultado.turno_id,
      terminal_id: resultado.terminal_id,
      caja_id: resultado.caja_id,
      negocio_id: resultado.negocio_id,
      cajero_negocio_id: resultado.cajero_negocio_id,
      nombre_cajero: resultado.nombre_cajero,
      estado: resultado.estado,
      iniciado_en: resultado.iniciado_en,
    })
    setCajeroSeleccionado(null)
    setPin('')
    return true
  }

  const iniciarSinPin = async (cajero: CajeroDisponible) => {
    setProcesando(true)
    setError(null)
    try {
      const resultado = await iniciarTurnoNegocio(configuracion, cajero.cajero_id)
      aceptarResultadoTurno(resultado)
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  const seleccionarCajero = (cajero: CajeroDisponible) => {
    setError(null)
    if (cajero.requiere_pin) {
      setCajeroSeleccionado(cajero)
      return
    }
    void iniciarSinPin(cajero)
  }

  const iniciarConPin = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!cajeroSeleccionado) return

    if (!/^[0-9]{4,6}$/.test(pin)) {
      setError('El PIN debe tener entre 4 y 6 dígitos.')
      return
    }

    setProcesando(true)
    setError(null)

    try {
      const resultado = await iniciarTurnoNegocio(
        configuracion,
        cajeroSeleccionado.cajero_id,
        pin,
      )
      aceptarResultadoTurno(resultado)
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  const cerrar = async () => {
    if (!turno) return
    setProcesando(true)
    setError(null)

    try {
      await cerrarTurnoNegocio(configuracion, turno.turno_id)
      setTurno(null)
      setCajeroSeleccionado(null)
      setPin('')
      await cargar()
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  if (cargando) {
    return <main className="negocio-shell negocio-shell--centrado">Preparando App Negocio…</main>
  }

  if (turno) {
    return (
      <main className="negocio-shell">
        <header className="negocio-topbar">
          <div>
            <span className="negocio-eyebrow">Turno activo</span>
            <strong>{configuracion.nombreNegocio}</strong>
            <small>{configuracion.nombreSucursal} · {configuracion.nombreCaja}</small>
          </div>
          <button disabled={procesando} type="button" onClick={() => void cerrar()}>
            {procesando ? 'Cerrando…' : 'Cerrar turno'}
          </button>
        </header>

        <section className="negocio-home">
          <div className="negocio-card negocio-card--turno">
            <span className="negocio-eyebrow">Hola 👋</span>
            <h1>{turno.nombre_cajero}</h1>
            <p>
              El turno está identificado y vinculado a esta sucursal. En el siguiente
              bloque conectaremos compras, canjes y lector QR.
            </p>
            <dl className="negocio-datos-turno">
              <div><dt>Sucursal</dt><dd>{configuracion.nombreSucursal}</dd></div>
              <div><dt>Caja</dt><dd>{configuracion.nombreCaja}</dd></div>
              <div><dt>Inicio</dt><dd>{new Date(turno.iniciado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</dd></div>
            </dl>
          </div>
        </section>

        {error && <p className="negocio-alert negocio-alert--error negocio-alert--flotante">{error}</p>}
      </main>
    )
  }

  if (cajeroSeleccionado) {
    return (
      <main className="negocio-shell negocio-shell--centrado">
        <section className="negocio-card">
          <button
            className="negocio-volver"
            type="button"
            onClick={() => {
              setCajeroSeleccionado(null)
              setPin('')
              setError(null)
            }}
          >
            ← Volver
          </button>
          <span className="negocio-eyebrow">Inicio de turno</span>
          <h1>Hola, {cajeroSeleccionado.nombre}</h1>
          <p>Ingresa tu PIN para confirmar que eres tú.</p>

          <form className="negocio-form" onSubmit={iniciarConPin}>
            <label>
              PIN
              <input
                autoFocus
                required
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                minLength={4}
                maxLength={6}
                autoComplete="off"
                value={pin}
                onChange={(evento) => setPin(evento.target.value.replace(/\D/g, ''))}
                placeholder="••••"
              />
            </label>
            {error && <p className="negocio-alert negocio-alert--error">{error}</p>}
            <button disabled={procesando} type="submit">
              {procesando ? 'Validando…' : 'Iniciar turno'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  if (cajeros.length === 0) {
    return <ConfigurarCajerosIniciales configuracion={configuracion} alFinalizar={cargar} />
  }

  const requierePin = cajeros.some((cajero) => cajero.requiere_pin)

  return (
    <main className="negocio-shell negocio-shell--centrado">
      <section className="negocio-card negocio-card--ancha">
        <span className="negocio-eyebrow">{configuracion.nombreSucursal}</span>
        <h1>¿Quién está usando Regalones?</h1>
        <p>
          {requierePin
            ? 'Selecciona tu nombre y luego ingresa tu PIN.'
            : 'Selecciona tu nombre para comenzar el turno.'}
        </p>

        {error && <p className="negocio-alert negocio-alert--error">{error}</p>}

        <div className="negocio-cajeros">
          {cajeros.map((cajero) => (
            <button
              key={cajero.cajero_id}
              type="button"
              disabled={procesando}
              onClick={() => seleccionarCajero(cajero)}
            >
              <span>{cajero.nombre.slice(0, 1).toUpperCase()}</span>
              <strong>{cajero.nombre} {cajero.apellido ?? ''}</strong>
              <small>{cajero.rol === 'supervisor' ? 'Supervisor' : 'Cajero/a'}</small>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

export default function App() {
  const [configuracion, setConfiguracion] =
    useState<ConfiguracionDispositivoNegocio | null>(leerConfiguracionDispositivo)
  const [validando, setValidando] = useState(Boolean(configuracion))
  const [errorConfiguracion, setErrorConfiguracion] = useState<string | null>(null)
  const [intentoValidacion, setIntentoValidacion] = useState(0)

  useEffect(() => {
    if (!configuracion) return

    let activo = true
    const temporizador = window.setTimeout(() => {
      void validarConfiguracionDispositivo(configuracion)
        .then((actualizada) => {
          if (!activo) return
          setConfiguracion(actualizada)
          setErrorConfiguracion(null)
          setValidando(false)
        })
        .catch((capturado) => {
          if (!activo) return
          setErrorConfiguracion(mensajeError(capturado))
          setValidando(false)
        })
    }, 0)

    return () => {
      activo = false
      window.clearTimeout(temporizador)
    }
  }, [configuracion?.terminalId, intentoValidacion])

  if (!configuracion) {
    return <ConfiguracionInicial alConfigurar={setConfiguracion} />
  }

  if (validando) {
    return <main className="negocio-shell negocio-shell--centrado">Validando dispositivo…</main>
  }

  if (errorConfiguracion) {
    return (
      <main className="negocio-shell negocio-shell--centrado">
        <section className="negocio-card">
          <span className="negocio-eyebrow">App Negocio</span>
          <h1>No pudimos validar este dispositivo</h1>
          <p>{errorConfiguracion}</p>
          <div className="negocio-acciones-verticales">
            <button
              type="button"
              onClick={() => {
                setValidando(true)
                setIntentoValidacion((actual) => actual + 1)
              }}
            >
              Reintentar
            </button>
            <button
              className="secundario"
              type="button"
              onClick={() => {
                eliminarConfiguracionDispositivo()
                setConfiguracion(null)
                setErrorConfiguracion(null)
              }}
            >
              Volver a configurar
            </button>
          </div>
        </section>
      </main>
    )
  }

  return <OperacionCajero configuracion={configuracion} />
}
