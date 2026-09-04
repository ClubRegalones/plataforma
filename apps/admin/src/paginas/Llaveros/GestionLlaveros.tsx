import type { Tables } from '@club-regalones/domain'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import EnlaceSoporteAdmin from '../../componentes/EnlaceSoporteAdmin'
import { useSesion } from '../../hooks/useSesion'
import {
  cancelarSolicitudLlavero,
  cambiarEstadoLlavero,
  listarGestionLlaveros,
  prepararLlavero,
  programarEntregaLlavero,
  registrarEntregaLlavero,
} from '../../lib/llaveros'
import type { FilaGestionLlavero } from '../../lib/llaveros'
import { mensajeSupabase } from '../../lib/mensajesSupabase'
import { supabase } from '../../lib/supabase'
import '../../../../../packages/ui/llaveros.css'

type PerfilAdmin = Pick<
  Tables<'perfiles'>,
  'nombre' | 'apellido' | 'rol_plataforma'
>

const etiquetasSolicitud: Record<
  FilaGestionLlavero['estado_solicitud'],
  string
> = {
  pendiente: 'Pendiente',
  programada_entrega: 'Programada',
  entregada: 'Entregada',
  cancelada: 'Cancelada',
}

const etiquetasLlavero = {
  sin_asignar: 'Preparado, sin activar',
  activo: 'Activo',
  bloqueado: 'Bloqueado',
  perdido: 'Perdido',
  reemplazado: 'Reemplazado',
  revocado: 'Revocado',
} as const

function formatearFecha(fecha: string | null) {
  if (!fecha) return 'Sin fecha'

  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(fecha))
}

function fechaParaInput(fecha: string | null) {
  const valor = fecha
    ? new Date(fecha)
    : new Date(Date.now() + 24 * 60 * 60 * 1000)
  const local = new Date(valor.getTime() - valor.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 16)
}

function GestionLlaveros() {
  const { sesion, cargando: cargandoSesion } = useSesion()
  const [perfil, setPerfil] = useState<PerfilAdmin | null>(null)
  const [filas, setFilas] = useState<FilaGestionLlavero[]>([])
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<'todas' | FilaGestionLlavero['estado_solicitud']>(
    'todas',
  )
  const [programadoPara, setProgramadoPara] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [token, setToken] = useState('')
  const [codigoPublico, setCodigoPublico] = useState('')
  const [pin, setPin] = useState('')
  const [cargandoDatos, setCargandoDatos] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const cargarGestion = useCallback(async () => {
    if (!sesion) return

    try {
      const { data, error: errorPerfil } = await supabase
        .from('perfiles')
        .select('nombre, apellido, rol_plataforma')
        .eq('id', sesion.user.id)
        .single()

      if (errorPerfil) throw errorPerfil

      const perfilActual = data as PerfilAdmin
      setPerfil(perfilActual)

      if (perfilActual.rol_plataforma !== 'admin_regalones') {
        setFilas([])
        return
      }

      setFilas(await listarGestionLlaveros())
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setCargandoDatos(false)
    }
  }, [sesion])

  useEffect(() => {
    const inicioCarga = window.setTimeout(() => void cargarGestion(), 0)

    return () => window.clearTimeout(inicioCarga)
  }, [cargarGestion])

  const seleccion = useMemo(
    () => filas.find((fila) => fila.solicitud_id === seleccionId) ?? null,
    [filas, seleccionId],
  )

  const filasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase('es-CL')

    return filas.filter((fila) => {
      const coincideEstado =
        filtro === 'todas' || fila.estado_solicitud === filtro
      const coincideTexto =
        !texto ||
        fila.nombre_vecino.toLocaleLowerCase('es-CL').includes(texto) ||
        fila.correo_vecino.toLocaleLowerCase('es-CL').includes(texto) ||
        fila.vecino_id.toLocaleLowerCase('es-CL').includes(texto) ||
        fila.codigo_publico?.toLocaleLowerCase('es-CL').includes(texto) ||
        fila.nombre_negocio?.toLocaleLowerCase('es-CL').includes(texto)

      return coincideEstado && coincideTexto
    })
  }, [busqueda, filas, filtro])

  const ejecutarAccion = async (
    accion: () => Promise<unknown>,
    confirmacion: string,
  ) => {
    setProcesando(true)
    setError(null)
    setMensaje(null)

    try {
      await accion()
      setMensaje(confirmacion)
      await cargarGestion()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const programar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!seleccion || !programadoPara) return

    const fechaIso = new Date(programadoPara).toISOString()

    await ejecutarAccion(
      () =>
        programarEntregaLlavero(
          seleccion.solicitud_id,
          fechaIso,
          observaciones.trim() || null,
        ),
      'La fecha de entrega quedó programada.',
    )
  }

  const preparar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!seleccion) return

    await ejecutarAccion(
      () =>
        prepararLlavero(
          seleccion.solicitud_id,
          token,
          codigoPublico,
          pin.trim() || null,
        ),
      'El llavero quedó preparado y vinculado a la cuenta, pero continúa inactivo.',
    )
    setToken('')
    setCodigoPublico('')
    setPin('')
  }

  const registrarEntrega = async () => {
    if (!seleccion) return

    await ejecutarAccion(
      () => registrarEntregaLlavero(seleccion.solicitud_id),
      'La entrega física quedó registrada. El llavero se activará en su primer uso.',
    )
  }

  const cambiarEstado = async (
    estado: 'bloqueado' | 'perdido' | 'revocado',
  ) => {
    if (!seleccion?.llavero_id) return

    const mensajes = {
      bloqueado: 'El llavero quedó bloqueado.',
      perdido: 'El llavero quedó registrado como perdido.',
      revocado: 'El llavero quedó revocado de forma permanente.',
    }

    await ejecutarAccion(
      () => cambiarEstadoLlavero(seleccion.llavero_id!, estado),
      mensajes[estado],
    )
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    window.location.hash = 'inicio'
  }

  const seleccionarSolicitud = (fila: FilaGestionLlavero) => {
    setSeleccionId(fila.solicitud_id)
    setProgramadoPara(fechaParaInput(fila.programado_para))
    setObservaciones(fila.observaciones ?? '')
    setToken('')
    setCodigoPublico('')
    setPin('')
  }

  const actualizarGestion = () => {
    setCargandoDatos(true)
    setError(null)
    void cargarGestion()
  }

  const pendientes = filas.filter(
    (fila) => fila.estado_solicitud === 'pendiente',
  ).length
  const programadas = filas.filter(
    (fila) => fila.estado_solicitud === 'programada_entrega',
  ).length
  const preparadas = new Set(
    filas
      .filter((fila) => fila.estado_llavero === 'sin_asignar' && fila.llavero_id)
      .map((fila) => fila.llavero_id),
  ).size

  return (
    <main className="llaveros llaveros--admin">
      <header className="llaveros__barra">
        <a className="llaveros__marca" href="#inicio">
          Club Regalones
        </a>
        <nav aria-label="Acciones administrativas">
          {perfil?.rol_plataforma === 'admin_regalones' && (
            <EnlaceSoporteAdmin />
          )}
          <a href="#administrar-beneficios">Beneficios</a>
          <a href="#mis-regis">Mis REGIS</a>
          {sesion && (
            <button type="button" onClick={() => void cerrarSesion()}>
              Cerrar sesión
            </button>
          )}
        </nav>
      </header>

      <section className="llaveros__encabezado">
        <span>Administración Regalones</span>
        <h1>Solicitudes y llaveros</h1>
        <p>
          Programa entregas y administra el ciclo de vida de cada llavero sin
          acceder a su token secreto.
        </p>
      </section>

      {cargandoSesion ? (
        <p className="llaveros__aviso">Comprobando tu sesión…</p>
      ) : !sesion ? (
        <section className="llaveros__aviso llaveros__aviso--centrado">
          <h2>Acceso administrativo</h2>
          <p>Debes iniciar sesión con una cuenta autorizada.</p>
          <a href="#iniciar-sesion?continuar=administrar-llaveros">
            Iniciar sesión
          </a>
        </section>
      ) : cargandoDatos && !perfil ? (
        <p className="llaveros__aviso">Cargando permisos…</p>
      ) : perfil?.rol_plataforma !== 'admin_regalones' ? (
        <section className="llaveros__aviso llaveros__aviso--centrado">
          <h2>No tienes acceso a esta sección</h2>
          <p>La gestión de llaveros corresponde a administradores de Regalones.</p>
          <a href="#mis-regis">Volver a Mis REGIS</a>
        </section>
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

          <section className="llaveros__metricas" aria-label="Resumen de gestión">
            <article>
              <span>Pendientes</span>
              <strong>{pendientes}</strong>
            </article>
            <article>
              <span>Entregas programadas</span>
              <strong>{programadas}</strong>
            </article>
            <article>
              <span>Preparados sin activar</span>
              <strong>{preparadas}</strong>
            </article>
          </section>

          <section className="llaveros__panel-admin">
            <div className="llaveros__listado">
              <div className="llaveros__herramientas">
                <label>
                  Buscar
                  <input
                    type="search"
                    value={busqueda}
                    onChange={(evento) => setBusqueda(evento.target.value)}
                    placeholder="Nombre, correo, ID o código"
                  />
                </label>
                <label>
                  Estado
                  <select
                    value={filtro}
                    onChange={(evento) =>
                      setFiltro(
                        evento.target.value as
                          | 'todas'
                          | FilaGestionLlavero['estado_solicitud'],
                      )
                    }
                  >
                    <option value="todas">Todas</option>
                    <option value="pendiente">Pendientes</option>
                    <option value="programada_entrega">Programadas</option>
                    <option value="entregada">Entregadas</option>
                    <option value="cancelada">Canceladas</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="secundario"
                  disabled={cargandoDatos}
                  onClick={actualizarGestion}
                >
                  Actualizar
                </button>
              </div>

              <div className="llaveros__lista-solicitudes">
                {filasFiltradas.length === 0 ? (
                  <p className="llaveros__vacio">No hay solicitudes para mostrar.</p>
                ) : (
                  filasFiltradas.map((fila) => (
                    <button
                      key={fila.solicitud_id}
                      type="button"
                      className={
                        seleccionId === fila.solicitud_id ? 'seleccionada' : ''
                      }
                      onClick={() => seleccionarSolicitud(fila)}
                    >
                      <span>
                        <strong>{fila.nombre_vecino}</strong>
                        <small>{fila.nombre_negocio ?? 'Solicitud general'}</small>
                      </span>
                      <span
                        className={`llaveros__estado estado--${fila.estado_solicitud}`}
                      >
                        {etiquetasSolicitud[fila.estado_solicitud]}
                      </span>
                      <time>{formatearFecha(fila.solicitado_en)}</time>
                    </button>
                  ))
                )}
              </div>
            </div>

            <aside className="llaveros__detalle">
              {!seleccion ? (
                <div className="llaveros__vacio">
                  <strong>Selecciona una solicitud</strong>
                  <p>Aquí aparecerán sus detalles y acciones disponibles.</p>
                </div>
              ) : (
                <>
                  <div className="llaveros__detalle-cabecera">
                    <span className="llaveros__sobrelinea">Vecino</span>
                    <h2>{seleccion.nombre_vecino}</h2>
                    <p>{seleccion.correo_vecino}</p>
                  </div>

                  <dl className="llaveros__datos">
                    <div>
                      <dt>ID de cuenta</dt>
                      <dd>{seleccion.vecino_id}</dd>
                    </div>
                    <div>
                      <dt>ID de solicitud</dt>
                      <dd>{seleccion.solicitud_id}</dd>
                    </div>
                    <div>
                      <dt>Teléfono</dt>
                      <dd>{seleccion.telefono_vecino ?? 'No informado'}</dd>
                    </div>
                    <div>
                      <dt>Comuna</dt>
                      <dd>{seleccion.comuna_vecino ?? 'No informada'}</dd>
                    </div>
                    <div>
                      <dt>Modalidad</dt>
                      <dd>{seleccion.modalidad_atencion}</dd>
                    </div>
                    <div>
                      <dt>Solicitud</dt>
                      <dd>{etiquetasSolicitud[seleccion.estado_solicitud]}</dd>
                    </div>
                    <div>
                      <dt>Programada</dt>
                      <dd>{formatearFecha(seleccion.programado_para)}</dd>
                    </div>
                    <div>
                      <dt>Punto solicitado</dt>
                      <dd>
                        {seleccion.nombre_negocio ?? 'Sin comercio de referencia'}
                      </dd>
                    </div>
                    {seleccion.codigo_publico && (
                      <>
                        <div>
                          <dt>Llavero</dt>
                          <dd>
                            {seleccion.codigo_publico} ·{' '}
                            {seleccion.estado_llavero
                              ? etiquetasLlavero[seleccion.estado_llavero]
                              : 'Sin estado'}
                          </dd>
                        </div>
                        <div>
                          <dt>Preparado</dt>
                          <dd>{formatearFecha(seleccion.preparado_en)}</dd>
                        </div>
                        <div>
                          <dt>Activado</dt>
                          <dd>{formatearFecha(seleccion.activado_en)}</dd>
                        </div>
                      </>
                    )}
                  </dl>

                  {!seleccion.llavero_id &&
                    ['pendiente', 'programada_entrega'].includes(
                      seleccion.estado_solicitud,
                    ) && (
                      <form className="llaveros__formulario" onSubmit={preparar}>
                        <h3>Preparar llavero inactivo</h3>
                        <p className="llaveros__nota-segura">
                          El token y el PIN se convierten en hashes. El llavero no
                          podrá utilizarse hasta verificar al vecino en su primer
                          uso.
                        </p>
                        <label>
                          Token físico
                          <input
                            required
                            type="password"
                            minLength={8}
                            maxLength={500}
                            autoComplete="off"
                            value={token}
                            onChange={(evento) => setToken(evento.target.value)}
                          />
                        </label>
                        <label>
                          Código público impreso
                          <input
                            required
                            minLength={3}
                            maxLength={80}
                            value={codigoPublico}
                            onChange={(evento) =>
                              setCodigoPublico(evento.target.value.toUpperCase())
                            }
                            placeholder="CR-000001"
                          />
                        </label>
                        <label>
                          PIN opcional
                          <input
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]{4,6}"
                            minLength={4}
                            maxLength={6}
                            autoComplete="new-password"
                            value={pin}
                            onChange={(evento) => setPin(evento.target.value)}
                            placeholder="4 a 6 dígitos"
                          />
                          <small>
                            Si se deja vacío, la activación se realizará
                            revisando la cédula.
                          </small>
                        </label>
                        <button type="submit" disabled={procesando}>
                          Preparar llavero
                        </button>
                      </form>
                    )}

                  {seleccion.estado_solicitud === 'pendiente' ||
                  seleccion.estado_solicitud === 'programada_entrega' ? (
                    <form className="llaveros__formulario" onSubmit={programar}>
                      <h3>
                        {seleccion.estado_solicitud === 'pendiente'
                          ? 'Programar entrega'
                          : 'Reprogramar entrega'}
                      </h3>
                      <label>
                        Fecha y hora
                        <input
                          required
                          type="datetime-local"
                          value={programadoPara}
                          onChange={(evento) => setProgramadoPara(evento.target.value)}
                        />
                      </label>
                      <label>
                        Observaciones
                        <textarea
                          maxLength={500}
                          rows={3}
                          value={observaciones}
                          onChange={(evento) => setObservaciones(evento.target.value)}
                        />
                      </label>
                      <button type="submit" disabled={procesando}>
                        Guardar programación
                      </button>
                    </form>
                  ) : null}

                  {seleccion.estado_solicitud === 'programada_entrega' &&
                    seleccion.estado_llavero === 'sin_asignar' && (
                      <div className="llaveros__entrega-inactiva">
                        <h3>Registrar entrega física</h3>
                        <p>
                          Confirma esta acción cuando el llavero haya sido
                          entregado al vecino o despachado mediante el canal
                          acordado. Permanecerá inactivo.
                        </p>
                        <button
                          type="button"
                          disabled={procesando}
                          onClick={() => void registrarEntrega()}
                        >
                          Registrar entrega inactiva
                        </button>
                      </div>
                    )}

                  {seleccion.llavero_id &&
                    seleccion.estado_llavero &&
                    ['activo', 'bloqueado', 'perdido'].includes(
                      seleccion.estado_llavero,
                    ) && (
                      <div className="llaveros__bloque-estados">
                        <h3>Seguridad del llavero</h3>
                        <div className="llaveros__acciones">
                          {seleccion.estado_llavero === 'activo' && (
                            <button
                              type="button"
                              className="secundario"
                              disabled={procesando}
                              onClick={() => void cambiarEstado('bloqueado')}
                            >
                              Bloquear
                            </button>
                          )}
                          {['activo', 'bloqueado'].includes(
                            seleccion.estado_llavero,
                          ) && (
                            <button
                              type="button"
                              className="peligro"
                              disabled={procesando}
                              onClick={() => void cambiarEstado('perdido')}
                            >
                              Marcar perdido
                            </button>
                          )}
                          <button
                            type="button"
                            className="peligro"
                            disabled={procesando}
                            onClick={() => void cambiarEstado('revocado')}
                          >
                            Revocar
                          </button>
                        </div>
                      </div>
                    )}

                  {['pendiente', 'programada_entrega'].includes(
                    seleccion.estado_solicitud,
                  ) && (
                    <button
                      type="button"
                      className="llaveros__cancelar-admin"
                      disabled={procesando}
                      onClick={() =>
                        void ejecutarAccion(
                          () => cancelarSolicitudLlavero(seleccion.solicitud_id),
                          'La solicitud quedó cancelada.',
                        )
                      }
                    >
                      Cancelar solicitud
                    </button>
                  )}
                </>
              )}
            </aside>
          </section>
        </div>
      )}
    </main>
  )
}

export default GestionLlaveros
