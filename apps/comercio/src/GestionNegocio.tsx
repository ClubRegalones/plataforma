import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from './hooks/useSesion'
import {
  cambiarEstadoCaja,
  cambiarEstadoSucursal,
  crearCaja,
  crearSucursal,
  listarGestionNegocio,
  revocarTerminal,
} from './lib/gestionNegocio'
import type { GestionNegocio as DatosGestion } from './lib/gestionNegocio'
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
  const [negocioId, setNegocioId] = useState('')
  const [nombreSucursal, setNombreSucursal] = useState('')
  const [direccion, setDireccion] = useState('')
  const [comuna, setComuna] = useState('')
  const [sucursalCajaId, setSucursalCajaId] = useState('')
  const [nombreCaja, setNombreCaja] = useState('')
  const [codigoCaja, setCodigoCaja] = useState('')
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

  return (
    <main className="gestion-negocio">
      <header>
        <div><span>Portal del comercio</span><h1>Sucursales, cajas y equipos</h1></div>
        <nav><a href="#">Inicio</a><a href="#beneficios">Beneficios</a><a href="#asistencia">Asistencia</a><button onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button></nav>
      </header>
      {datos.negocios.length > 1 && <label className="selector">Negocio<select value={negocioId} onChange={(e) => setNegocioId(e.target.value)}>{datos.negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>}
      {error && <p className="aviso error">{error}</p>}{mensaje && <p className="aviso exito">{mensaje}</p>}
      {cargando ? <p className="vacio">Cargando gestión…</p> : datos.negocios.length === 0 ? <p className="vacio">Esta cuenta no pertenece a un negocio activo.</p> : (
        <>
          {!puedeGestionar && <p className="aviso">Tu rol de cajero permite consultar esta información, pero no modificarla.</p>}
          <section className="resumen"><article><strong>{sucursales.length}</strong><span>Sucursales</span></article><article><strong>{cajas.length}</strong><span>Cajas</span></article><article><strong>{terminales.length}</strong><span>Terminales</span></article><article><strong>{miembros.length}</strong><span>Personas</span></article></section>

          <section className="bloque"><div className="titulo"><div><span>Ubicaciones</span><h2>Sucursales</h2></div><p>Crea los puntos físicos donde funcionarán las cajas.</p></div>
            {puedeGestionar && <form className="form-grid" onSubmit={guardarSucursal}><label>Nombre<input required minLength={2} value={nombreSucursal} onChange={(e) => setNombreSucursal(e.target.value)} /></label><label>Dirección<input required minLength={3} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></label><label>Comuna<input required minLength={2} value={comuna} onChange={(e) => setComuna(e.target.value)} /></label><button disabled={procesando}>Crear sucursal</button></form>}
            <div className="tarjetas">{sucursales.map((s) => <article key={s.id}><div><strong>{s.nombre}</strong><p>{s.direccion}, {s.comuna}</p></div><span className={`estado ${s.estado}`}>{s.estado}</span>{puedeGestionar && <button className="accion" disabled={procesando} onClick={() => void ejecutar(() => cambiarEstadoSucursal(s.id, s.estado === 'activa' ? 'inactiva' : 'activa'), 'Estado de sucursal actualizado.')}>{s.estado === 'activa' ? 'Desactivar' : 'Activar'}</button>}</article>)}</div>
          </section>

          <section className="bloque"><div className="titulo"><div><span>Operación</span><h2>Cajas</h2></div><p>Cada Terminal PWA queda vinculada a una caja específica.</p></div>
            {puedeGestionar && sucursales.length > 0 && <form className="form-grid" onSubmit={guardarCaja}><label>Sucursal<select required value={sucursalCajaSeleccionada} onChange={(e) => setSucursalCajaId(e.target.value)}>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label><label>Nombre de caja<input required value={nombreCaja} onChange={(e) => setNombreCaja(e.target.value)} /></label><label>Código interno<input value={codigoCaja} onChange={(e) => setCodigoCaja(e.target.value)} placeholder="Ej. CAJA-02" /></label><button disabled={procesando}>Crear caja</button></form>}
            <div className="tarjetas">{cajas.map((c) => <article key={c.id}><div><strong>{c.nombre}</strong><p>{sucursales.find((s) => s.id === c.sucursal_id)?.nombre} · {c.codigo ?? 'Sin código'}</p></div><span className={`estado ${c.estado}`}>{c.estado}</span>{puedeGestionar && <button className="accion" disabled={procesando} onClick={() => void ejecutar(() => cambiarEstadoCaja(c.id, c.estado === 'activa' ? 'inactiva' : 'activa'), 'Estado de caja actualizado.')}>{c.estado === 'activa' ? 'Desactivar' : 'Activar'}</button>}</article>)}</div>
          </section>

          <section className="bloque"><div className="titulo"><div><span>Seguridad</span><h2>Terminales PWA</h2></div><p>La credencial se crea una sola vez desde el equipo de caja; aquí puedes supervisarla o revocarla.</p></div>
            <div className="tarjetas">{terminales.length === 0 ? <p>No hay terminales registradas.</p> : terminales.map((t) => <article key={t.id}><div><strong>{t.nombre_dispositivo ?? t.identificador_publico}</strong><p>{t.identificador_publico} · última conexión: {fecha(t.ultima_conexion_en)}</p></div><span className={`estado ${t.estado}`}>{t.estado.replace('_', ' ')}</span>{puedeGestionar && t.estado !== 'revocada' && <button className="accion peligro" disabled={procesando} onClick={() => void ejecutar(() => revocarTerminal(t.id), 'Terminal revocada correctamente.')}>Revocar</button>}</article>)}</div>
          </section>

          <section className="bloque"><div className="titulo"><div><span>Equipo</span><h2>Personal del negocio</h2></div><p>Los propietarios y administradores gestionan; los cajeros solo operan la Terminal.</p></div>
            <div className="tarjetas">{miembros.map((m) => <article key={m.id}><div><strong>{m.nombre} {m.apellido ?? ''}</strong><p>ID de cuenta: {m.usuario_id}</p></div><span className={`estado ${m.estado}`}>{m.rol} · {m.estado}</span></article>)}</div>
            <p className="nota">La invitación segura por correo se incorporará en la siguiente migración; no se ingresan usuarios manualmente por ID.</p>
          </section>
        </>
      )}
    </main>
  )
}
