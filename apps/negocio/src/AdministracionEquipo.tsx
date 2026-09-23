import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConfiguracionDispositivoNegocio } from './lib/dispositivo'
import { supabase } from './lib/supabase'
import {
  cambiarPinCajero,
  configurarModoIdentificacion,
  crearCajeroDesdeApp,
  deshabilitarCajero,
  listarCajerosAdministracion,
  reactivarCajero,
} from './lib/administracion-cajeros'
import type { CajeroAdministracion } from './lib/administracion-cajeros'
import type { ModoIdentificacionCajero } from './lib/cajeros'

function mensajeError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message)
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.'
}

export default function AdministracionEquipo({
  configuracion,
  alCerrar,
  alCambiarEquipo,
}: {
  configuracion: ConfiguracionDispositivoNegocio
  alCerrar: () => void
  alCambiarEquipo: () => Promise<void>
}) {
  const [autorizado, setAutorizado] = useState(false)
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [cajeros, setCajeros] = useState<CajeroAdministracion[]>([])
  const [cargando, setCargando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [rol, setRol] = useState<'cajero' | 'supervisor'>('cajero')
  const [pin, setPin] = useState('')
  const [modo, setModo] = useState<ModoIdentificacionCajero>('solo_nombre')
  const [cajeroPendienteDeshabilitar, setCajeroPendienteDeshabilitar] =
    useState<CajeroAdministracion | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [equipo, respuestaSucursal] = await Promise.all([
        listarCajerosAdministracion(configuracion.negocioId),
        supabase
          .from('sucursales')
          .select('modo_identificacion_cajero')
          .eq('id', configuracion.sucursalId)
          .single(),
      ])
      if (respuestaSucursal.error) throw respuestaSucursal.error
      setCajeros(equipo)
      setModo(respuestaSucursal.data.modo_identificacion_cajero as ModoIdentificacionCajero)
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setCargando(false)
    }
  }, [configuracion.negocioId, configuracion.sucursalId])

  useEffect(() => {
    if (!autorizado) return
    void cargar()
  }, [autorizado, cargar])

  useEffect(() => {
    if (!cajeroPendienteDeshabilitar) return

    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && !procesando) {
        setCajeroPendienteDeshabilitar(null)
      }
    }

    window.addEventListener('keydown', cerrarConEscape)
    return () => window.removeEventListener('keydown', cerrarConEscape)
  }, [cajeroPendienteDeshabilitar, procesando])

  const activos = useMemo(
    () => cajeros.filter((cajero) => cajero.estado === 'activo'),
    [cajeros],
  )
  const deshabilitados = useMemo(
    () => cajeros.filter((cajero) => cajero.estado === 'inactivo'),
    [cajeros],
  )

  const iniciarSesion = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setProcesando(true)
    setError(null)

    try {
      const { data, error: errorIngreso } = await supabase.auth.signInWithPassword({
        email: correo.trim(),
        password: contrasena,
      })
      if (errorIngreso) throw errorIngreso

      const { data: membresia, error: errorMembresia } = await supabase
        .from('miembros_negocio')
        .select('rol')
        .eq('usuario_id', data.user.id)
        .eq('negocio_id', configuracion.negocioId)
        .eq('estado', 'activo')
        .in('rol', ['propietario', 'administrador'])
        .maybeSingle()

      if (errorMembresia) throw errorMembresia
      if (!membresia) {
        await supabase.auth.signOut()
        throw new Error('Esta cuenta no es propietaria ni administradora de este comercio.')
      }

      setAutorizado(true)
      setContrasena('')
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  const salirAdministracion = async () => {
    setProcesando(true)
    setError(null)
    try {
      await supabase.auth.signOut()
      alCerrar()
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  const guardarCajero = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setError(null)

    if (nombre.trim().length < 2) {
      setError('Ingresa un nombre de al menos 2 caracteres.')
      return
    }
    if (modo === 'nombre_pin' && !/^[0-9]{4,6}$/.test(pin)) {
      setError('Este equipo usa PIN. Ingresa entre 4 y 6 dígitos.')
      return
    }

    setProcesando(true)
    try {
      await crearCajeroDesdeApp(configuracion, {
        nombre,
        apellido,
        rol,
        pin: modo === 'nombre_pin' ? pin : undefined,
      })
      setNombre('')
      setApellido('')
      setRol('cajero')
      setPin('')
      setMostrarFormulario(false)
      await cargar()
      await alCambiarEquipo()
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  const confirmarDeshabilitacion = async () => {
    if (!cajeroPendienteDeshabilitar) return

    setProcesando(true)
    setError(null)
    try {
      await deshabilitarCajero(cajeroPendienteDeshabilitar.cajero_id)
      setCajeroPendienteDeshabilitar(null)
      await cargar()
      await alCambiarEquipo()
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  const reactivar = async (cajero: CajeroAdministracion) => {
    setProcesando(true)
    setError(null)
    try {
      await reactivarCajero(cajero.cajero_id)
      await cargar()
      await alCambiarEquipo()
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  const cambiarModo = async (nuevoModo: ModoIdentificacionCajero) => {
    if (nuevoModo === modo) return
    setProcesando(true)
    setError(null)
    try {
      await configurarModoIdentificacion(configuracion.sucursalId, nuevoModo)
      setModo(nuevoModo)
      await alCambiarEquipo()
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  const definirPin = async (cajero: CajeroAdministracion) => {
    const nuevoPin = window.prompt(`Nuevo PIN para ${cajero.nombre} (4 a 6 dígitos)`)
    if (nuevoPin === null) return
    if (!/^[0-9]{4,6}$/.test(nuevoPin)) {
      setError('El PIN debe tener entre 4 y 6 dígitos.')
      return
    }

    setProcesando(true)
    setError(null)
    try {
      await cambiarPinCajero(cajero.cajero_id, nuevoPin)
      await cargar()
    } catch (capturado) {
      setError(mensajeError(capturado))
    } finally {
      setProcesando(false)
    }
  }

  if (!autorizado) {
    return (
      <main className="negocio-shell negocio-shell--centrado">
        <section className="negocio-card">
          <button className="negocio-volver" type="button" onClick={alCerrar}>← Volver</button>
          <span className="negocio-eyebrow">Administración protegida</span>
          <h1>Acceso del negocio</h1>
          <p>
            Solo el propietario o un administrador puede modificar el equipo de esta sucursal.
          </p>
          <form className="negocio-form" onSubmit={iniciarSesion}>
            <label>
              Correo
              <input required type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
            </label>
            <label>
              Contraseña
              <input required type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
            </label>
            {error && <p className="negocio-alert negocio-alert--error">{error}</p>}
            <button disabled={procesando} type="submit">
              {procesando ? 'Verificando…' : 'Entrar a administración'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  const tarjeta = (cajero: CajeroAdministracion) => (
    <article className="negocio-equipo-item" key={cajero.cajero_id}>
      <div>
        <strong>{cajero.nombre} {cajero.apellido ?? ''}</strong>
        <span>{cajero.rol === 'supervisor' ? 'Supervisor/a' : 'Cajero/a'}</span>
        <small>{cajero.estado === 'activo' ? 'Activo' : 'Deshabilitado'}</small>
      </div>
      <div className="negocio-equipo-acciones">
        {modo === 'nombre_pin' && (
          <button className="secundario" type="button" disabled={procesando} onClick={() => void definirPin(cajero)}>
            {cajero.tiene_pin ? 'Cambiar PIN' : 'Crear PIN'}
          </button>
        )}
        <button
          className={cajero.estado === 'activo' ? 'peligro' : 'secundario'}
          type="button"
          disabled={procesando}
          onClick={() => {
            if (cajero.estado === 'activo') {
              setCajeroPendienteDeshabilitar(cajero)
              return
            }
            void reactivar(cajero)
          }}
        >
          {cajero.estado === 'activo' ? 'Deshabilitar' : 'Reactivar'}
        </button>
      </div>
    </article>
  )

  return (
    <main className="negocio-shell">
      <header className="negocio-topbar">
        <div>
          <span className="negocio-eyebrow">Administración</span>
          <strong>{configuracion.nombreNegocio}</strong>
          <small>{configuracion.nombreSucursal}</small>
        </div>
        <button type="button" disabled={procesando} onClick={() => void salirAdministracion()}>
          Volver a operación
        </button>
      </header>

      <section className="negocio-admin-layout">
        <div className="negocio-card negocio-card--ancha">
          <div className="negocio-admin-encabezado">
            <div>
              <span className="negocio-eyebrow">Equipo</span>
              <h1>Personas que usan Regalones</h1>
            </div>
            <button type="button" disabled={procesando} onClick={() => setMostrarFormulario((valor) => !valor)}>
              + Agregar cajero
            </button>
          </div>

          <div className="negocio-modos">
            <button type="button" className={modo === 'solo_nombre' ? 'activo' : ''} onClick={() => void cambiarModo('solo_nombre')}>
              <strong>Solo seleccionar nombre</strong>
              <span>Inicio de turno rápido, sin PIN.</span>
            </button>
            <button type="button" className={modo === 'nombre_pin' ? 'activo' : ''} onClick={() => void cambiarModo('nombre_pin')}>
              <strong>Nombre + PIN</strong>
              <span>Mayor control para equipos grandes.</span>
            </button>
          </div>

          {mostrarFormulario && (
            <form className="negocio-form negocio-form--admin" onSubmit={guardarCajero}>
              <div className="negocio-grid-cajero">
                <label>
                  Nombre
                  <input required value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </label>
                <label>
                  Apellido opcional
                  <input value={apellido} onChange={(e) => setApellido(e.target.value)} />
                </label>
                <label>
                  Rol
                  <select value={rol} onChange={(e) => setRol(e.target.value as 'cajero' | 'supervisor')}>
                    <option value="cajero">Cajero/a</option>
                    <option value="supervisor">Supervisor/a</option>
                  </select>
                </label>
                {modo === 'nombre_pin' && (
                  <label>
                    PIN
                    <input required type="password" inputMode="numeric" minLength={4} maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
                  </label>
                )}
              </div>
              <div className="negocio-admin-form-acciones">
                <button className="secundario" type="button" onClick={() => setMostrarFormulario(false)}>Cancelar</button>
                <button disabled={procesando} type="submit">{procesando ? 'Guardando…' : 'Guardar cajero'}</button>
              </div>
            </form>
          )}

          {error && <p className="negocio-alert negocio-alert--error">{error}</p>}
          {cargando ? (
            <p>Cargando equipo…</p>
          ) : (
            <>
              <section className="negocio-equipo-seccion">
                <h2>Cajeros activos <span>{activos.length}</span></h2>
                <div className="negocio-equipo-lista">{activos.map(tarjeta)}</div>
              </section>

              <section className="negocio-equipo-seccion negocio-equipo-seccion--inactivos">
                <h2>Cajeros deshabilitados <span>{deshabilitados.length}</span></h2>
                {deshabilitados.length === 0
                  ? <p className="negocio-texto-suave">Todavía no hay cajeros deshabilitados.</p>
                  : <div className="negocio-equipo-lista">{deshabilitados.map(tarjeta)}</div>}
              </section>
            </>
          )}
        </div>
      </section>

      {cajeroPendienteDeshabilitar && (
        <div
          className="negocio-modal-fondo"
          role="presentation"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget && !procesando) {
              setCajeroPendienteDeshabilitar(null)
            }
          }}
        >
          <section
            className="negocio-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-confirmar-deshabilitacion"
          >
            <span className="negocio-eyebrow">Confirmación</span>
            <h2 id="titulo-confirmar-deshabilitacion">
              ¿Deshabilitar a {cajeroPendienteDeshabilitar.nombre}?
            </h2>
            <p>
              Dejará de aparecer en la App Negocio para iniciar nuevos turnos.
              Su historial y reportes seguirán guardados en Regalones.
            </p>
            <p className="negocio-modal-nota">
              No se eliminará su información y podrás reactivarlo después.
            </p>

            <div className="negocio-modal-acciones">
              <button
                className="secundario"
                type="button"
                disabled={procesando}
                onClick={() => setCajeroPendienteDeshabilitar(null)}
              >
                Cancelar
              </button>
              <button
                className="peligro"
                type="button"
                disabled={procesando}
                onClick={() => void confirmarDeshabilitacion()}
              >
                {procesando ? 'Deshabilitando…' : 'Sí, deshabilitar'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}