import type { Tables } from '@club-regalones/domain'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '../../hooks/useSesion'
import {
  cancelarSolicitudLlavero,
} from '../../lib/llaveros'
import { mensajeSupabase } from '../../lib/mensajesSupabase'
import {
  listarSaldosRegisPropios,
} from '../../lib/regis'
import type { SaldoRegisPropio } from '../../lib/regis'
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

  const actualizarDatos = () => {
    setCargandoDatos(true)
    setError(null)
    void cargarDatos()
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    window.location.hash = 'inicio'
  }

  return (
    <main className="llaveros">
      <header className="llaveros__barra">
        <a className="llaveros__marca" href="#inicio">
          Club Regalones
        </a>
        <nav aria-label="Acciones de cuenta">
          {perfil?.rol_plataforma === 'admin_regalones' && (
            <a href="#administrar-llaveros">Administrar llaveros</a>
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
                    {(saldo.pendientes > 0 || saldo.reservados > 0) && (
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
                      </dl>
                    )}
                  </article>
                ))}
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
        </div>
      )}
    </main>
  )
}

export default MiLlavero
