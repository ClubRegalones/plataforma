import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from './hooks/useSesion'
import {
  cambiarEstadoCaja,
  cambiarEstadoSucursal,
  crearCaja,
  crearCajeroGestion,
  crearSucursal,
  listarCajerosGestion,
  listarGestionNegocio,
  revocarTerminal,
} from './lib/gestionNegocio'
import type {
  CajeroGestion,
  GestionNegocio as DatosGestion,
} from './lib/gestionNegocio'
import { mensajeSupabase } from './lib/mensajesSupabase'
import { supabase } from './lib/supabase'
import './gestion-negocio.css'

const vacio: DatosGestion = {
  negocios: [], sucursales: [], cajas: [], terminales: [], miembros: [], rolesPropios: new Map(),
}

function fecha(valor: string | null) {
  return valor ? new Date(valor).toLocaleString('es-CL') : 'Nunca'
}

export default function GestionNegocio() {
  const { sesion } = useSesion()
  const [datos, setDatos] = useState<DatosGestion>(vacio)
  const [cajeros, setCajeros] = useState<CajeroGestion[]>([])
  const [negocioId, setNegocioId] = useState('')
  const [nombreSucursal, setNombreSucursal] = useState('')
  const [direccion, setDireccion] = useState('')
  const [comuna, setComuna] = useState('')
  const [sucursalCajaId, setSucursalCajaId] = useState('')
  const [nombreCaja, setNombreCaja] = useState('')
  const [codigoCaja, setCodigoCaja] = useState('')
  const [nombreCajero, setNombreCajero] = useState('')
  const [apellidoCajero, setApellidoCajero] = useState('')
  const [pinCajero, setPinCajero] = useState('')
  const [sucursalesCajero, setSucursalesCajero] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!sesion) return
    setCargando(true)
    setError(null)
    try {
      const resultado = await listarGestionNegocio(sesion.user.id)
      setDatos(resultado)
      setNegocioId((actual) => resultado.negocios.some(({ id }) => id === actual) ? actual : resultado.negocios[0]?.id ?? '')
    } catch (capturado) {
      setError(mensajeSupabase(capturado))
    } finally {
      setCargando(false)
    }
  }, [sesion])

  const cargarCajeros = useCallback(async (id: string) => {
    if (!id) return
    try {
      setCajeros(await listarCajerosGestion(id))
    } catch (capturado) {
      setError(mensajeSupabase(capturado))
    }
  }, [])

  useEffect(() => {
    if (!sesion) return
    let activo = true

    void listarGestionNegocio(sesion.user.id)
      .then((resultado) => {
        if (!activo) return
        setDatos(resultado)
        setNegocioId(resultado.negocios[0]?.id ?? '')
      })
      .catch((capturado: unknown) => {
        if (activo) setError(mensajeSupabase(capturado))
      })
      .finally(() => {
        if (activo) setCargando(false)
      })

    return () => { activo = false }
  }, [sesion])

  useEffect(() => {
    if (!negocioId) return
    let activo = true
    const temporizador = window.setTimeout(() => {
      void listarCajerosGestion(negocioId)
        .then((resultado) => {
          if (activo) setCajeros(resultado)
        })
        .catch((capturado: unknown) => {
          if (activo) setError(mensajeSupabase(capturado))
        })
    }, 0)

    return () => {
      activo = false
      window.clearTimeout(temporizador)
    }
  }, [negocioId])

  const sucursales = useMemo(
    () => datos.sucursales.filter(({ negocio_id }) => negocio_id === negocioId),
    [datos.sucursales, negocioId],
  )
  const sucursalIds = new Set(sucursales.map(({ id }) => id))
  const cajas = datos.cajas.filter(({ sucursal_id }) => sucursalIds.has(sucursal_id))
  const cajaIds = new Set(cajas.map(({ id }) => id))
  const terminales = datos.terminales.filter(({ caja_id }) => cajaIds.has(caja_id))
  const miembros = datos.miembros.filter(({ negocio_id }) => negocio_id === negocioId)
  const rolPropio = datos.rolesPropios.get(negocioId)
  const puedeGestionar = rolPropio === 'propietario' || rolPropio === 'administrador'
  const sucursalCajaSeleccionada = sucursales.some(({ id }) => id === sucursalCajaId)
    ? sucursalCajaId
    : sucursales[0]?.id ?? ''

  const ejecutar = async (accion: () => Promise<void>, exito: string) => {
    setProcesando(true); setError(null); setMensaje(null)
    try { await accion(); setMensaje(exito); await cargar() }
    catch (capturado) { setError(mensajeSupabase(capturado)) }
    finally { setProcesando(false) }
  }

  const guardarSucursal = (evento: FormEvent) => {
    evento.preventDefault()
    void ejecutar(async () => {
      await crearSucursal(negocioId, nombreSucursal, direccion, comuna)
      setNombreSucursal(''); setDireccion(''); setComuna('')
    }, 'Sucursal creada correctamente.')
  }

  const guardarCaja = (evento: FormEvent) => {
    evento.preventDefault()
    void ejecutar(async () => {
      await crearCaja(sucursalCajaSeleccionada, nombreCaja, codigoCaja)
      setNombreCaja(''); setCodigoCaja('')
    }, 'Caja creada correctamente.')
  }

  const guardarCajero = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()

    if (!/^[0-9]{4,6}$/.test(pinCajero)) {
      setError('El PIN del cajero debe tener entre 4 y 6 dígitos.')
      return
    }

    if (sucursalesCajero.length === 0) {
      setError('Asigna el cajero al menos a una sucursal.')
      return
    }

    setProcesando(true)
    setError(null)
    setMensaje(null)

    try {
      await crearCajeroGestion(
        negocioId,
        nombreCajero,
        apellidoCajero,
        pinCajero,
        sucursalesCajero,
      )
      setNombreCajero('')
      setApellidoCajero('')
      setPinCajero('')
      setSucursalesCajero([])
      setMensaje('Cajero creado correctamente. Ya puede iniciar turno en App Negocio.')
      await cargarCajeros(negocioId)
    } catch (capturado) {
      setError(mensajeSupabase(capturado))
    } finally {
      setProcesando(false)
    }
  }

  const alternarSucursalCajero = (sucursalId: string) => {
    setSucursalesCajero((actuales) =>
      actuales.includes(sucursalId)
        ? actuales.filter((id) => id !== sucursalId)
        : [...actuales, sucursalId],
    )
  }

  return (
    <main className="gestion-negocio">
      <header>
        <div><span>Portal del comercio</span><h1>Sucursales, cajas y equipos</h1></div>
        <nav><a href="#">Inicio</a><a href="#beneficios">Beneficios</a><a href="#asistencia">Asistencia</a><button onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button></nav>
      </header>
      {datos.negocios.length > 1 && <label className="selector">Negocio<select value={negocioId} onChange={(e) => { setNegocioId(e.target.value); setSucursalesCajero([]) }}>{datos.negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>}
      {error && <p className="aviso error">{error}</p>}{mensaje && <p className="aviso exito">{mensaje}</p>}
      {cargando ? <p className="vacio">Cargando gestión…</p> : datos.negocios.length === 0 ? <p className="vacio">Esta cuenta no pertenece a un negocio activo.</p> : (
        <>
          {!puedeGestionar && <p className="aviso">Tu rol de cajero permite consultar esta información, pero no modificarla.</p>}
          <section className="resumen"><article><strong>{sucursales.length}</strong><span>Sucursales</span></article><article><strong>{cajas.length}</strong><span>Cajas</span></article><article><strong>{terminales.length}</strong><span>Dispositivos</span></article><article><strong>{cajeros.length}</strong><span>Cajeros App</span></article></section>

          <section className="bloque"><div className="titulo"><div><span>Ubicaciones</span><h2>Sucursales</h2></div><p>Crea los puntos físicos donde funcionarán las cajas.</p></div>
            {puedeGestionar && <form className="form-grid" onSubmit={guardarSucursal}><label>Nombre<input required minLength={2} value={nombreSucursal} onChange={(e) => setNombreSucursal(e.target.value)} /></label><label>Dirección<input required minLength={3} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></label><label>Comuna<input required minLength={2} value={comuna} onChange={(e) => setComuna(e.target.value)} /></label><button disabled={procesando}>Crear sucursal</button></form>}
            <div className="tarjetas">{sucursales.map((s) => <article key={s.id}><div><strong>{s.nombre}</strong><p>{s.direccion}, {s.comuna}</p></div><span className={`estado ${s.estado}`}>{s.estado}</span>{puedeGestionar && <button className="accion" disabled={procesando} onClick={() => void ejecutar(() => cambiarEstadoSucursal(s.id, s.estado === 'activa' ? 'inactiva' : 'activa'), 'Estado de sucursal actualizado.')}>{s.estado === 'activa' ? 'Desactivar' : 'Activar'}</button>}</article>)}</div>
          </section>

          <section className="bloque"><div className="titulo"><div><span>Operación</span><h2>Caja Regalones</h2></div><p>La sucursal usa una Caja Regalones lógica para App Negocio o Terminal.</p></div>
            {puedeGestionar && sucursales.length > 0 && <form className="form-grid" onSubmit={guardarCaja}><label>Sucursal<select required value={sucursalCajaSeleccionada} onChange={(e) => setSucursalCajaId(e.target.value)}>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label><label>Nombre de caja<input required value={nombreCaja} onChange={(e) => setNombreCaja(e.target.value)} /></label><label>Código interno<input value={codigoCaja} onChange={(e) => setCodigoCaja(e.target.value)} placeholder="Ej. CAJA-02" /></label><button disabled={procesando}>Crear caja</button></form>}
            <div className="tarjetas">{cajas.map((c) => <article key={c.id}><div><strong>{c.nombre}</strong><p>{sucursales.find((s) => s.id === c.sucursal_id)?.nombre} · {c.codigo ?? 'Sin código'}</p></div><span className={`estado ${c.estado}`}>{c.estado}</span>{puedeGestionar && <button className="accion" disabled={procesando} onClick={() => void ejecutar(() => cambiarEstadoCaja(c.id, c.estado === 'activa' ? 'inactiva' : 'activa'), 'Estado de caja actualizado.')}>{c.estado === 'activa' ? 'Desactivar' : 'Activar'}</button>}</article>)}</div>
          </section>

          <section className="bloque"><div className="titulo"><div><span>Equipo de caja</span><h2>Cajeros App Negocio</h2></div><p>Los cajeros no necesitan correo ni cuenta. Seleccionan su nombre e ingresan un PIN al comenzar el turno.</p></div>
            {puedeGestionar && sucursales.length > 0 && <form className="form-grid form-grid--cajero" onSubmit={guardarCajero}><label>Nombre<input required minLength={2} value={nombreCajero} onChange={(e) => setNombreCajero(e.target.value)} /></label><label>Apellido<input value={apellidoCajero} onChange={(e) => setApellidoCajero(e.target.value)} /></label><label>PIN<input required type="password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} value={pinCajero} onChange={(e) => setPinCajero(e.target.value.replace(/\D/g, ''))} placeholder="4 a 6 dígitos" /></label><fieldset className="sucursales-cajero"><legend>Sucursales habilitadas</legend>{sucursales.map((s) => <label key={s.id}><input type="checkbox" checked={sucursalesCajero.includes(s.id)} onChange={() => alternarSucursalCajero(s.id)} /> {s.nombre}</label>)}</fieldset><button disabled={procesando}>Crear cajero</button></form>}
            <div className="tarjetas">{cajeros.length === 0 ? <p>No hay cajeros operativos creados todavía.</p> : cajeros.map((cajero) => <article key={cajero.cajero_id}><div><strong>{cajero.nombre} {cajero.apellido ?? ''}</strong><p>{cajero.sucursal_ids.map((id) => sucursales.find((s) => s.id === id)?.nombre ?? 'Sucursal').join(' · ') || 'Sin sucursal'}</p></div><span className={`estado ${cajero.estado}`}>{cajero.rol} · {cajero.estado}</span></article>)}</div>
            <p className="nota">El PIN se guarda cifrado y no se muestra nuevamente. Más adelante agregaremos edición, cambio de PIN y desactivación desde este mismo módulo.</p>
          </section>

          <section className="bloque"><div className="titulo"><div><span>Seguridad</span><h2>Dispositivos operativos</h2></div><p>App Negocio y Terminal usan la misma Caja Regalones. En el piloto, una sucursal elige una modalidad operativa a la vez.</p></div>
            <div className="tarjetas">{terminales.length === 0 ? <p>No hay dispositivos registrados.</p> : terminales.map((t) => <article key={t.id}><div><strong>{t.nombre_dispositivo ?? t.identificador_publico}</strong><p>{t.identificador_publico} · última conexión: {fecha(t.ultima_conexion_en)}</p></div><span className={`estado ${t.estado}`}>{t.estado.replace('_', ' ')}</span>{puedeGestionar && t.estado !== 'revocada' && <button className="accion peligro" disabled={procesando} onClick={() => void ejecutar(() => revocarTerminal(t.id), 'Dispositivo revocado correctamente.')}>Revocar</button>}</article>)}</div>
          </section>

          <section className="bloque"><div className="titulo"><div><span>Administración</span><h2>Usuarios del Portal Comercio</h2></div><p>Estas cuentas son distintas a los perfiles operativos de cajero.</p></div>
            <div className="tarjetas">{miembros.map((m) => <article key={m.id}><div><strong>{m.nombre} {m.apellido ?? ''}</strong><p>ID de cuenta: {m.usuario_id}</p></div><span className={`estado ${m.estado}`}>{m.rol} · {m.estado}</span></article>)}</div>
          </section>
        </>
      )}
    </main>
  )
}
