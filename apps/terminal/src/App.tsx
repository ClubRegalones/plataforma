import type { Tables } from '@club-regalones/domain'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useSesion } from './hooks/useSesion'
import { mensajeSupabase } from './lib/mensajesSupabase'
import { supabase } from './lib/supabase'

type Solicitud = Tables<'solicitudes_compra'>

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
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      setSolicitudes([])
      setCargando(false)
      return
    }

    setSinMembresia(false)

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

  const informarMonto = async (solicitud: Solicitud) => {
    const monto = Number(montos[solicitud.id])

    if (!Number.isInteger(monto) || monto <= 0) {
      setError('El monto debe ser un número entero mayor que cero.')
      return
    }

    setProcesandoId(solicitud.id)
    setError(null)
    setMensaje(null)

    const { error: errorMonto } = await supabase.rpc('informar_monto_cajero', {
      p_solicitud_id: solicitud.id,
      p_monto: monto,
    })

    setProcesandoId(null)

    if (errorMonto) {
      setError(mensajeSupabase(errorMonto))
      return
    }

    setMensaje('Monto ingresado con ayuda del cajero.')
    await cargarSolicitudes()
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

    setProcesandoId(solicitud.id)
    setError(null)
    setMensaje(null)

    const { error: errorCorreccion } = await supabase.rpc(
      'corregir_solicitud_compra',
      {
        p_solicitud_id: solicitud.id,
        p_monto: monto,
        p_motivo: motivo,
      },
    )

    setProcesandoId(null)

    if (errorCorreccion) {
      setError(mensajeSupabase(errorCorreccion))
      return
    }

    setMensaje('Monto corregido directamente por el cajero.')
    await cargarSolicitudes()
  }

  const solicitarReingreso = async (solicitud: Solicitud) => {
    const motivo = motivosCorreccion[solicitud.id]?.trim() ?? ''

    if (motivo.length < 3) {
      setError('Escribe por qué el vecino debe corregir el monto.')
      return
    }

    setProcesandoId(solicitud.id)
    setError(null)
    setMensaje(null)

    const { error: errorReingreso } = await supabase.rpc(
      'solicitar_reingreso_monto',
      {
        p_solicitud_id: solicitud.id,
        p_motivo: motivo,
      },
    )

    setProcesandoId(null)

    if (errorReingreso) {
      setError(mensajeSupabase(errorReingreso))
      return
    }

    setMontos((actuales) => ({ ...actuales, [solicitud.id]: '' }))
    setMensaje('Se solicitó al vecino que vuelva a ingresar el monto.')
    await cargarSolicitudes()
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

    setProcesandoId(solicitud.id)
    setError(null)
    setMensaje(null)

    const { error: errorAprobacion } = await supabase.rpc('aprobar_compra', {
      p_solicitud_id: solicitud.id,
    })

    setProcesandoId(null)

    if (errorAprobacion) {
      setError(mensajeSupabase(errorAprobacion))
      return
    }

    setMensaje('Compra aprobada correctamente.')
    await cargarSolicitudes()
  }

  const rechazar = async (solicitud: Solicitud) => {
    const motivo = motivosRechazo[solicitud.id]?.trim() ?? ''

    if (motivo.length < 3) {
      setError('Escribe un motivo de al menos 3 caracteres.')
      return
    }

    setProcesandoId(solicitud.id)
    setError(null)
    setMensaje(null)

    const { error: errorRechazo } = await supabase.rpc(
      'rechazar_solicitud_compra',
      {
        p_solicitud_id: solicitud.id,
        p_motivo: motivo,
      },
    )

    setProcesandoId(null)

    if (errorRechazo) {
      setError(mensajeSupabase(errorRechazo))
      return
    }

    setMensaje('Solicitud rechazada.')
    await cargarSolicitudes()
  }

  const cerrarSesion = async () => {
    const { error: errorCierre } = await supabase.auth.signOut()
    if (errorCierre) setError(mensajeSupabase(errorCierre))
  }

  return (
    <main className="terminal-panel">
      <header className="terminal-panel__header">
        <div>
          <span className="terminal-eyebrow">Club Regalones</span>
          <h1>Solicitudes de compra</h1>
          <p>{sesion?.user.email}</p>
        </div>
        <div className="terminal-panel__acciones">
          <button type="button" onClick={() => void cargarSolicitudes()}>
            Actualizar
          </button>
          <button type="button" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {error && <p className="terminal-alert terminal-alert--error">{error}</p>}
      {mensaje && (
        <p className="terminal-alert terminal-alert--success">{mensaje}</p>
      )}

      {cargando ? (
        <p className="terminal-empty">Cargando solicitudes…</p>
      ) : sinMembresia ? (
        <p className="terminal-empty">
          Esta cuenta no pertenece a ningún negocio activo. Debes agregarla en
          `miembros_negocio` antes de usar la terminal.
        </p>
      ) : solicitudes.length === 0 ? (
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
                    <p>
                      Si está correcto, aprueba la compra. Si no coincide,
                      puedes pedir al vecino que lo escriba nuevamente o
                      corregirlo directamente.
                    </p>

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
                      <button
                        type="button"
                        disabled={estaProcesando}
                        onClick={() => void solicitarReingreso(solicitud)}
                      >
                        Pedir nuevo monto al vecino
                      </button>
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

  if (cargando) {
    return (
      <main className="terminal-shell">
        <p className="terminal-empty">Comprobando sesión…</p>
      </main>
    )
  }

  return sesion ? <PanelTerminal /> : <AccesoTerminal />
}

export default App
