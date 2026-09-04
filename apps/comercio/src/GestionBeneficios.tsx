import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { calcularCompraParaDescuentoCompleto } from '@club-regalones/domain'
import { useSesion } from './hooks/useSesion'
import {
  cambiarEstadoBeneficio,
  crearBeneficio,
  listarGestionBeneficiosComercio,
  versionarBeneficio,
} from './lib/beneficios'
import type {
  BeneficioGestion,
  ConfiguracionBeneficio,
  EventoSupervisionBeneficio,
  NegocioGestionBeneficios,
  ReglaRegisGestion,
  VersionBeneficioGestion,
} from './lib/beneficios'
import { mensajeSupabase } from './lib/mensajesSupabase'
import { supabase } from './lib/supabase'
import EnlaceAsistencia from './EnlaceAsistencia'
import './beneficios.css'

type Formulario = {
  negocioId: string
  codigo: string
  nombre: string
  descripcion: string
  tipo: 'monto_fijo' | 'porcentaje_descuento'
  costoRegis: string
  compraMinimaClp: string
  montoDescuentoFijoClp: string
  porcentajeDescuento: string
  topeDescuentoClp: string
  cuposTotales: string
  limitePorVecino: string
  vigenciaDesde: string
  vigenciaHasta: string
  mostrarCupos: boolean
}

const etiquetasEstado = {
  borrador: 'Borrador',
  activo: 'Publicado',
  pausado: 'Pausado',
  finalizado: 'Finalizado',
} as const

const etiquetasEvento = {
  borrador_creado: 'Borrador creado',
  publicado: 'Publicado por el comercio',
  pausado: 'Pausado',
  reactivado: 'Reactivado',
  finalizado: 'Finalizado',
} as const

function fechaLocal(fecha = new Date()) {
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function nuevoFormulario(negocioId = ''): Formulario {
  return {
    negocioId,
    codigo: '',
    nombre: '',
    descripcion: '',
    tipo: 'monto_fijo',
    costoRegis: '10',
    compraMinimaClp: '10000',
    montoDescuentoFijoClp: '500',
    porcentajeDescuento: '20',
    topeDescuentoClp: '2000',
    cuposTotales: '100',
    limitePorVecino: '1',
    vigenciaDesde: fechaLocal(),
    vigenciaHasta: '',
    mostrarCupos: true,
  }
}

function formularioDesdeVersion(
  beneficio: BeneficioGestion,
  version: VersionBeneficioGestion,
): Formulario {
  return {
    negocioId: beneficio.negocio_id,
    codigo: beneficio.codigo,
    nombre: version.nombre,
    descripcion: version.descripcion ?? '',
    tipo: version.tipo,
    costoRegis: String(version.costo_regis),
    compraMinimaClp: String(version.compra_minima_clp),
    montoDescuentoFijoClp: String(version.monto_descuento_fijo_clp ?? 500),
    porcentajeDescuento: String(
      (version.porcentaje_descuento_bp ?? 2000) / 100,
    ),
    topeDescuentoClp: String(version.tope_descuento_clp ?? 2000),
    cuposTotales:
      version.cupos_totales === null ? '' : String(version.cupos_totales),
    limitePorVecino: String(version.limite_por_vecino),
    vigenciaDesde: fechaLocal(),
    vigenciaHasta: version.vigencia_hasta
      ? fechaLocal(new Date(version.vigencia_hasta))
      : '',
    mostrarCupos: version.mostrar_cupos,
  }
}

function entero(valor: string) {
  return Number.parseInt(valor, 10)
}

function enteroOpcional(valor: string) {
  return valor.trim() ? entero(valor) : null
}

function codigoSeguro(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-CL')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function formatearFecha(fecha: string) {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(fecha))
}

function formatearPesos(valor: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(valor)
}

function describirReglaVersion(version: VersionBeneficioGestion) {
  const compraCompleta = Math.max(
    version.compra_minima_clp,
    calcularCompraParaDescuentoCompleto({
      tipo: version.tipo,
      porcentajeDescuentoBp: version.porcentaje_descuento_bp,
      montoDescuentoFijoClp: version.monto_descuento_fijo_clp,
      topeDescuentoClp: version.tope_descuento_clp,
      porcentajeMaximoCanjeBp: version.porcentaje_maximo_canje_bp,
    }) ?? version.compra_minima_clp,
  )
  const descuentoMaximo =
    version.tipo === 'monto_fijo'
      ? version.monto_descuento_fijo_clp
      : version.tope_descuento_clp

  return `Hasta ${formatearPesos(descuentoMaximo ?? 0)} · máximo ${version.porcentaje_maximo_canje_bp / 100}% · completo desde ${formatearPesos(compraCompleta)}`
}

function GestionBeneficios() {
  const { sesion } = useSesion()
  const [puedeGestionar, setPuedeGestionar] = useState<boolean | null>(null)
  const [negocios, setNegocios] = useState<NegocioGestionBeneficios[]>([])
  const [beneficios, setBeneficios] = useState<BeneficioGestion[]>([])
  const [eventos, setEventos] = useState<EventoSupervisionBeneficio[]>([])
  const [reglas, setReglas] = useState<ReglaRegisGestion[]>([])
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [formulario, setFormulario] = useState<Formulario>(nuevoFormulario())
  const [motivoEstado, setMotivoEstado] = useState('')
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const seleccion = useMemo(
    () => beneficios.find(({ id }) => id === seleccionId) ?? null,
    [beneficios, seleccionId],
  )

  const reglaVigente = useMemo(
    () =>
      reglas.find(({ negocio_id }) => negocio_id === formulario.negocioId) ??
      reglas.find(({ negocio_id }) => negocio_id === null) ??
      null,
    [formulario.negocioId, reglas],
  )

  const resumenEconomico = useMemo(() => {
    if (!reglaVigente) return null

    const montoDescuento = entero(formulario.montoDescuentoFijoClp)
    const topeDescuento = entero(formulario.topeDescuentoClp)
    const compraMinima = entero(formulario.compraMinimaClp)
    const porcentajeDescuentoBp = Math.round(
      Number.parseFloat(formulario.porcentajeDescuento) * 100,
    )
    const compraCompletaCalculada = calcularCompraParaDescuentoCompleto({
      tipo: formulario.tipo,
      porcentajeDescuentoBp:
        formulario.tipo === 'porcentaje_descuento'
          ? porcentajeDescuentoBp
          : null,
      montoDescuentoFijoClp:
        formulario.tipo === 'monto_fijo' ? montoDescuento : null,
      topeDescuentoClp:
        formulario.tipo === 'porcentaje_descuento' ? topeDescuento : null,
      porcentajeMaximoCanjeBp: reglaVigente.porcentaje_maximo_canje_bp,
    })

    if (
      compraCompletaCalculada === null ||
      !Number.isFinite(compraCompletaCalculada) ||
      !Number.isFinite(compraMinima)
    ) {
      return null
    }

    const compraCompleta = Math.max(compraMinima, compraCompletaCalculada)
    const porcentajeMaximo = reglaVigente.porcentaje_maximo_canje_bp / 100
    const descuentoMaximo =
      formulario.tipo === 'monto_fijo' ? montoDescuento : topeDescuento

    return {
      porcentajeMaximo,
      descuentoMaximo,
      compraCompleta,
      valorRegis: reglaVigente.valor_regis_clp,
    }
  }, [formulario, reglaVigente])

  const cargar = useCallback(async () => {
    if (!sesion) return

    setCargando(true)
    setError(null)

    try {
      const resultado = await listarGestionBeneficiosComercio(sesion.user.id)
      setPuedeGestionar(resultado.puedeGestionar)
      setNegocios(resultado.negocios)
      setBeneficios(resultado.beneficios)
      setEventos(resultado.eventos)
      setReglas(resultado.reglas)
      setFormulario((actual) =>
        actual.negocioId || resultado.negocios.length === 0
          ? actual
          : { ...actual, negocioId: resultado.negocios[0].id },
      )
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setCargando(false)
    }
  }, [sesion])

  useEffect(() => {
    const inicio = window.setTimeout(() => void cargar(), 0)
    return () => window.clearTimeout(inicio)
  }, [cargar])

  const actualizarCampo = <K extends keyof Formulario>(
    campo: K,
    valor: Formulario[K],
  ) => setFormulario((actual) => ({ ...actual, [campo]: valor }))

  const seleccionar = (beneficio: BeneficioGestion) => {
    setSeleccionId(beneficio.id)
    setMotivoEstado('')
    setError(null)
    setMensaje(null)
    if (beneficio.version_actual) {
      setFormulario(formularioDesdeVersion(beneficio, beneficio.version_actual))
    }
  }

  const comenzarNuevo = () => {
    setSeleccionId(null)
    setFormulario(nuevoFormulario(negocios[0]?.id ?? ''))
    setMotivoEstado('')
    setError(null)
    setMensaje(null)
  }

  const construirConfiguracion = (): ConfiguracionBeneficio => ({
    negocioId: formulario.negocioId,
    codigo: formulario.codigo,
    nombre: formulario.nombre.trim(),
    descripcion: formulario.descripcion.trim() || null,
    tipo: formulario.tipo,
    costoRegis: entero(formulario.costoRegis),
    compraMinimaClp: entero(formulario.compraMinimaClp),
    porcentajeDescuentoBp:
      formulario.tipo === 'porcentaje_descuento'
        ? Math.round(Number.parseFloat(formulario.porcentajeDescuento) * 100)
        : null,
    montoDescuentoFijoClp:
      formulario.tipo === 'monto_fijo'
        ? entero(formulario.montoDescuentoFijoClp)
        : null,
    topeDescuentoClp:
      formulario.tipo === 'porcentaje_descuento'
        ? entero(formulario.topeDescuentoClp)
        : null,
    cuposTotales: enteroOpcional(formulario.cuposTotales),
    limitePorVecino: entero(formulario.limitePorVecino),
    mostrarCupos: formulario.mostrarCupos,
    vigenciaDesde: new Date(formulario.vigenciaDesde).toISOString(),
    vigenciaHasta: formulario.vigenciaHasta
      ? new Date(formulario.vigenciaHasta).toISOString()
      : null,
  })

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const boton = (evento.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null
    const publicar = boton?.value === 'publicar'

    setProcesando(true)
    setError(null)
    setMensaje(null)

    try {
      const configuracion = construirConfiguracion()
      if (seleccion) {
        await versionarBeneficio(seleccion.id, configuracion, publicar)
      } else {
        await crearBeneficio(configuracion, publicar)
      }

      setMensaje(
        publicar
          ? 'Beneficio publicado. Regalones recibió el registro para supervisión.'
          : 'Borrador guardado. Aún no es visible para los vecinos.',
      )
      setSeleccionId(null)
      setFormulario(nuevoFormulario(negocios[0]?.id ?? ''))
      await cargar()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const cambiarEstado = async (
    estado: 'activo' | 'pausado' | 'finalizado',
  ) => {
    const version = seleccion?.version_actual
    if (!version) return

    if (motivoEstado.trim().length < 3) {
      setError('Explica el motivo del cambio con al menos 3 caracteres.')
      return
    }

    setProcesando(true)
    setError(null)
    setMensaje(null)
    try {
      await cambiarEstadoBeneficio(version.id, estado, motivoEstado.trim())
      setMensaje(
        estado === 'activo'
          ? 'El beneficio volvió a publicarse.'
          : estado === 'pausado'
            ? 'El beneficio quedó pausado.'
            : 'El beneficio quedó finalizado.',
      )
      setMotivoEstado('')
      await cargar()
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    window.location.hash = ''
  }

  const eventosSeleccion = eventos.filter(
    ({ beneficio_id }) => beneficio_id === seleccion?.id,
  )
  const publicados = beneficios.filter(
    ({ version_actual }) => version_actual?.estado === 'activo',
  ).length
  const pausados = beneficios.filter(
    ({ version_actual }) => version_actual?.estado === 'pausado',
  ).length

  return (
    <main className="terminal-beneficios">
      <header className="terminal-beneficios__header">
        <div>
          <span className="terminal-eyebrow">Portal del comercio</span>
          <h1>Beneficios REGIS</h1>
          <p>{sesion?.user.email}</p>
        </div>
        <nav aria-label="Acciones de beneficios">
          <EnlaceAsistencia />
          <a href="#">Volver a compras</a>
          <button type="button" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </button>
        </nav>
      </header>

      {error && <p className="terminal-alert terminal-alert--error">{error}</p>}
      {mensaje && <p className="terminal-alert terminal-alert--success">{mensaje}</p>}

      {cargando && puedeGestionar === null ? (
        <p className="terminal-empty">Comprobando tus permisos…</p>
      ) : !puedeGestionar ? (
        <section className="terminal-beneficios__sin-acceso">
          <span className="terminal-eyebrow">Acceso restringido</span>
          <h2>Los cajeros no administran beneficios</h2>
          <p>
            Esta sección está disponible únicamente para propietarios y
            administradores activos del comercio.
          </p>
          <a href="#">Volver a la terminal</a>
        </section>
      ) : (
        <>
          <section className="terminal-beneficios__intro">
            <div>
              <span className="terminal-eyebrow">Autonomía del comercio</span>
              <h2>Crea, publica y controla tus beneficios</h2>
            </div>
            <p>
              El sistema valida el costo, la compra mínima, los topes y los
              cupos antes de publicar. Regalones conserva un registro para
              supervisión y puede pausar condiciones problemáticas.
            </p>
          </section>

          <section className="terminal-beneficios__metricas" aria-label="Resumen">
            <article><span>Beneficios</span><strong>{beneficios.length}</strong></article>
            <article><span>Publicados</span><strong>{publicados}</strong></article>
            <article><span>Pausados</span><strong>{pausados}</strong></article>
          </section>

          <section className="terminal-beneficios__panel">
            <aside className="terminal-beneficios__listado">
              <button type="button" onClick={comenzarNuevo}>
                + Nuevo beneficio
              </button>
              {beneficios.length === 0 ? (
                <p>Aún no has creado beneficios.</p>
              ) : (
                beneficios.map((beneficio) => {
                  const version = beneficio.version_actual
                  return (
                    <button
                      type="button"
                      key={beneficio.id}
                      className={seleccionId === beneficio.id ? 'seleccionado' : ''}
                      onClick={() => seleccionar(beneficio)}
                    >
                      <small>{beneficio.nombre_negocio}</small>
                      <strong>{version?.nombre ?? beneficio.codigo}</strong>
                      <span>
                        {version
                          ? `${etiquetasEstado[version.estado]} · ${version.costo_regis} REGIS`
                          : 'Sin versión'}
                      </span>
                      {version && <small>{describirReglaVersion(version)}</small>}
                    </button>
                  )
                })
              )}
            </aside>

            <form className="terminal-beneficios__formulario" onSubmit={guardar}>
              <div className="terminal-beneficios__titulo-formulario">
                <div>
                  <span className="terminal-eyebrow">
                    {seleccion ? 'Nueva versión' : 'Nuevo beneficio'}
                  </span>
                  <h2>{seleccion?.version_actual?.nombre ?? 'Configura la oferta'}</h2>
                </div>
                {seleccion?.version_actual && (
                  <em className={`estado--${seleccion.version_actual.estado}`}>
                    {etiquetasEstado[seleccion.version_actual.estado]}
                  </em>
                )}
              </div>

              <div className="terminal-beneficios__nota">
                <strong>Regla económica actual</strong>
                {resumenEconomico ? (
                  <>
                    <span>
                      1 REGIS = {formatearPesos(resumenEconomico.valorRegis)}.
                      El descuento nunca supera el {resumenEconomico.porcentajeMaximo}% de la compra.
                    </span>
                    <span className="terminal-beneficios__regla-destacada">
                      Hasta {formatearPesos(resumenEconomico.descuentoMaximo)} de descuento.
                      Se recibe completo en compras desde {formatearPesos(resumenEconomico.compraCompleta)}.
                    </span>
                  </>
                ) : (
                  <span>
                    Selecciona un comercio y completa los montos para revisar la regla antes de publicar.
                  </span>
                )}
              </div>

              <fieldset>
                <legend>Información</legend>
                <div className="terminal-beneficios__dos-columnas">
                  <label>
                    Comercio
                    <select
                      required
                      disabled={Boolean(seleccion)}
                      value={formulario.negocioId}
                      onChange={(evento) => actualizarCampo('negocioId', evento.target.value)}
                    >
                      <option value="">Selecciona un comercio</option>
                      {negocios.map((negocio) => (
                        <option key={negocio.id} value={negocio.id}>{negocio.nombre}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Código interno
                    <input
                      required
                      disabled={Boolean(seleccion)}
                      pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                      value={formulario.codigo}
                      onChange={(evento) => actualizarCampo('codigo', codigoSeguro(evento.target.value))}
                      placeholder="ejemplo-descuento-pan"
                    />
                  </label>
                </div>
                <label>
                  Nombre visible
                  <input required minLength={3} maxLength={160} value={formulario.nombre} onChange={(evento) => actualizarCampo('nombre', evento.target.value)} placeholder="Ejemplo: $500 de descuento en pan" />
                </label>
                <label>
                  Descripción
                  <textarea rows={3} maxLength={1000} value={formulario.descripcion} onChange={(evento) => actualizarCampo('descripcion', evento.target.value)} />
                </label>
              </fieldset>

              <fieldset>
                <legend>Economía del beneficio</legend>
                <div className="terminal-beneficios__dos-columnas">
                  <label>
                    Tipo
                    <select value={formulario.tipo} onChange={(evento) => actualizarCampo('tipo', evento.target.value as Formulario['tipo'])}>
                      <option value="monto_fijo">Monto fijo</option>
                      <option value="porcentaje_descuento">Porcentaje</option>
                    </select>
                  </label>
                  <label>
                    Costo en REGIS
                    <input required type="number" min={1} value={formulario.costoRegis} onChange={(evento) => actualizarCampo('costoRegis', evento.target.value)} />
                  </label>
                </div>
                {formulario.tipo === 'monto_fijo' ? (
                  <label>
                    Descuento fijo en pesos
                    <input required type="number" min={1} value={formulario.montoDescuentoFijoClp} onChange={(evento) => actualizarCampo('montoDescuentoFijoClp', evento.target.value)} />
                  </label>
                ) : (
                  <div className="terminal-beneficios__dos-columnas">
                    <label>
                      Porcentaje de descuento
                      <input required type="number" min={0.01} max={100} step={0.01} value={formulario.porcentajeDescuento} onChange={(evento) => actualizarCampo('porcentajeDescuento', evento.target.value)} />
                    </label>
                    <label>
                      Tope de descuento en pesos
                      <input required type="number" min={1} value={formulario.topeDescuentoClp} onChange={(evento) => actualizarCampo('topeDescuentoClp', evento.target.value)} />
                    </label>
                  </div>
                )}
                <label>
                  Compra mínima en pesos
                  <input required type="number" min={1} value={formulario.compraMinimaClp} onChange={(evento) => actualizarCampo('compraMinimaClp', evento.target.value)} />
                </label>
              </fieldset>

              <fieldset>
                <legend>Cupos y vigencia</legend>
                <div className="terminal-beneficios__dos-columnas">
                  <label>
                    Cupos totales
                    <input type="number" min={1} placeholder="Sin límite" value={formulario.cuposTotales} onChange={(evento) => actualizarCampo('cuposTotales', evento.target.value)} />
                  </label>
                  <label>
                    Límite por vecino
                    <input required type="number" min={1} value={formulario.limitePorVecino} onChange={(evento) => actualizarCampo('limitePorVecino', evento.target.value)} />
                  </label>
                  <label>
                    Vigente desde
                    <input required type="datetime-local" value={formulario.vigenciaDesde} onChange={(evento) => actualizarCampo('vigenciaDesde', evento.target.value)} />
                  </label>
                  <label>
                    Vigente hasta
                    <input type="datetime-local" min={formulario.vigenciaDesde} value={formulario.vigenciaHasta} onChange={(evento) => actualizarCampo('vigenciaHasta', evento.target.value)} />
                  </label>
                </div>
                <label className="terminal-beneficios__check">
                  <input type="checkbox" checked={formulario.mostrarCupos} onChange={(evento) => actualizarCampo('mostrarCupos', evento.target.checked)} />
                  Mostrar los cupos disponibles al vecino
                </label>
              </fieldset>

              <div className="terminal-beneficios__acciones-formulario">
                <button type="submit" name="accion" value="borrador" className="secundario" disabled={procesando || negocios.length === 0}>
                  Guardar borrador
                </button>
                <button type="submit" name="accion" value="publicar" disabled={procesando || negocios.length === 0}>
                  {seleccion ? 'Publicar nueva versión' : 'Crear y publicar'}
                </button>
              </div>

              {seleccion?.version_actual && seleccion.version_actual.estado !== 'borrador' && seleccion.version_actual.estado !== 'finalizado' && (
                <section className="terminal-beneficios__estado">
                  <h3>Estado de la publicación</h3>
                  <label>
                    Motivo del cambio
                    <textarea minLength={3} maxLength={500} value={motivoEstado} onChange={(evento) => setMotivoEstado(evento.target.value)} placeholder="Ejemplo: ajustar cupos antes de continuar" />
                  </label>
                  <div>
                    {seleccion.version_actual.estado === 'activo' ? (
                      <button type="button" onClick={() => void cambiarEstado('pausado')} disabled={procesando}>Pausar</button>
                    ) : (
                      <button type="button" onClick={() => void cambiarEstado('activo')} disabled={procesando}>Volver a publicar</button>
                    )}
                    <button type="button" className="peligro" onClick={() => void cambiarEstado('finalizado')} disabled={procesando}>Finalizar</button>
                  </div>
                </section>
              )}

              {seleccion && eventosSeleccion.length > 0 && (
                <details className="terminal-beneficios__historial">
                  <summary>Historial y supervisión</summary>
                  <ol>
                    {eventosSeleccion.map((evento) => (
                      <li key={evento.id}>
                        <strong>{etiquetasEvento[evento.accion]}</strong>
                        <span>{formatearFecha(evento.creado_en)}</span>
                        {evento.motivo && <small>{evento.motivo}</small>}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </form>
          </section>
        </>
      )}
    </main>
  )
}

export default GestionBeneficios
