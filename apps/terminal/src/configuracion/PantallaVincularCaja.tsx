import { useEffect, useMemo, useRef, useState } from 'react'
import cajaIcono from '../recursos/iconos/caja.png'

type Caja = {
  id: string
  sucursalId: string
  nombre: string
  codigo: string | null
}

type TerminalCaja = {
  id: string
  cajaId: string
  estado: string
  nombreDispositivo: string | null
}

type Props = {
  nombreNegocio: string
  nombreSucursal: string
  cajas: Caja[]
  terminales: TerminalCaja[]
  cajaId: string
  procesando: boolean
  gestionandoCaja: boolean
  error: string | null
  alSeleccionarCaja: (cajaId: string) => void
  alRenombrarCaja: (
    cajaId: string,
    nombre: string,
  ) => Promise<boolean>
  alCrearCaja: (nombre: string) => Promise<boolean>
  alEliminarCaja: (cajaId: string) => Promise<boolean>
  alVolver: () => void
  alVincular: () => void
}

export default function PantallaVincularCaja({
  nombreNegocio,
  nombreSucursal,
  cajas,
  terminales,
  cajaId,
  procesando,
  gestionandoCaja,
  error,
  alSeleccionarCaja,
  alRenombrarCaja,
  alCrearCaja,
  alEliminarCaja,
  alVolver,
  alVincular,
}: Props) {
  const [cajaAEliminar, setCajaAEliminar] =
    useState<Caja | null>(null)
  const [nombres, setNombres] =
    useState<Record<string, string>>({})

  const [creandoCaja, setCreandoCaja] =
    useState(false)

  const [nombreNuevaCaja, setNombreNuevaCaja] =
    useState('')

  const listaCajasRef =
    useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setNombres(
      Object.fromEntries(
        cajas.map((caja) => [
          caja.id,
          caja.nombre,
        ]),
      ),
    )
  }, [cajas])

  useEffect(() => {
    if (!cajaId) return

    const elemento =
      listaCajasRef.current?.querySelector<HTMLElement>(
        `[data-caja-id="${cajaId}"]`,
      )

    elemento?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  }, [cajas, cajaId])

  const cajasOcupadas = useMemo(
    () =>
      new Map(
        terminales
          .filter(
            (terminal) =>
              terminal.estado !== 'revocada',
          )
          .map((terminal) => [
            terminal.cajaId,
            terminal,
          ]),
      ),
    [terminales],
  )

  const guardarNombre = async (caja: Caja) => {
    const nombre =
      (nombres[caja.id] ?? '').trim()

    if (
      !nombre ||
      nombre === caja.nombre
    ) {
      setNombres((actual) => ({
        ...actual,
        [caja.id]: caja.nombre,
      }))
      return
    }

    const guardado =
      await alRenombrarCaja(
        caja.id,
        nombre,
      )

    if (!guardado) {
      setNombres((actual) => ({
        ...actual,
        [caja.id]: caja.nombre,
      }))
    }
  }

  const crearCaja = async () => {
    const nombre =
      nombreNuevaCaja.trim()

    if (!nombre) return

    const creada =
      await alCrearCaja(nombre)

    if (creada) {
      setNombreNuevaCaja('')
      setCreandoCaja(false)
    }
  }

  return (
    <main className="configuracion-caja">
      <section
        className="configuracion-caja__panel"
        aria-labelledby="vincular-caja-title"
      >
        <header className="configuracion-caja__cabecera">
          <div className="configuracion-caja__marca">
            <strong>
              Club Regalones
              <span aria-hidden="true">♥</span>
            </strong>

            <small>
              Más barrio, más beneficios
            </small>
          </div>

          <div
            className="configuracion-caja__progreso"
            aria-label="Paso 3 de 3"
          >
            <span className="configuracion-caja__paso configuracion-caja__paso--completado">
              1
              <i aria-hidden="true">✓</i>
            </span>

            <b />

            <span className="configuracion-caja__paso configuracion-caja__paso--completado">
              2
              <i aria-hidden="true">✓</i>
            </span>

            <b />

            <span className="configuracion-caja__paso configuracion-caja__paso--activo">
              3
            </span>
          </div>

          <span className="configuracion-caja__etiqueta">
            Configuración inicial
          </span>
        </header>

        <div className="configuracion-caja__separador" />

        <div className="configuracion-caja__cuerpo">
          <header className="configuracion-caja__titulo">
            <h1 id="vincular-caja-title">
              Vincular caja
            </h1>

            <p>
              Elige cuál de las cajas registradas
              corresponde a esta terminal.
            </p>
          </header>

          <div className="configuracion-caja__contexto">
            <span>
              <small>Negocio</small>
              <strong>{nombreNegocio}</strong>
            </span>

            <i aria-hidden="true">›</i>

            <span>
              <small>Sucursal</small>
              <strong>{nombreSucursal}</strong>
            </span>
          </div>

          {error && (
            <p className="configuracion-caja__error">
              {error}
            </p>
          )}

          <section className="configuracion-caja__seccion">
            <h2>Cajas de esta sucursal</h2>

            {cajas.length === 0 && (
              <div className="configuracion-caja__vacia">
                Todavía no hay cajas registradas
                en esta sucursal.
              </div>
            )}

            <div
              ref={listaCajasRef}
              className="configuracion-caja__lista"
            >
              {cajas.map((caja) => {
                const terminal =
                  cajasOcupadas.get(caja.id)

                const ocupada = Boolean(terminal)
                const seleccionada =
                  caja.id === cajaId

                return (
                  <article
                    key={caja.id}
                    data-caja-id={caja.id}
                    className={
                      seleccionada
                        ? 'configuracion-caja__fila configuracion-caja__fila--seleccionada'
                        : ocupada
                          ? 'configuracion-caja__fila configuracion-caja__fila--ocupada'
                          : 'configuracion-caja__fila'
                    }
                  >
                    <button
                      type="button"
                      className="configuracion-caja__seleccion"
                      disabled={ocupada}
                      aria-label={
                        ocupada
                          ? `${caja.nombre} está vinculada a otra terminal`
                          : `Vincular esta terminal a ${caja.nombre}`
                      }
                      onClick={() =>
                        alSeleccionarCaja(caja.id)
                      }
                    >
                      <span
                        className={
                          seleccionada
                            ? 'configuracion-caja__radio configuracion-caja__radio--activo'
                            : 'configuracion-caja__radio'
                        }
                        aria-hidden="true"
                      />
                    </button>

                    <span
                      className="configuracion-caja__icono"
                      aria-hidden="true"
                    >
                      <img
                        src={cajaIcono}
                        alt=""
                      />
                    </span>

                    <label className="configuracion-caja__nombre">
                      <small>
                        Nombre de la caja
                      </small>

                      <input
                        value={
                          nombres[caja.id] ??
                          caja.nombre
                        }
                        maxLength={100}
                        disabled={gestionandoCaja}
                        onChange={(evento) =>
                          setNombres(
                            (actual) => ({
                              ...actual,
                              [caja.id]:
                                evento.target.value,
                            }),
                          )
                        }
                        onBlur={() =>
                          void guardarNombre(caja)
                        }
                        onKeyDown={(evento) => {
                          if (
                            evento.key === 'Enter'
                          ) {
                            evento.currentTarget.blur()
                          }
                        }}
                      />
                    </label>

                    <div className="configuracion-caja__acciones-fila">
                      <span
                        className={
                          ocupada
                            ? 'configuracion-caja__estado configuracion-caja__estado--ocupada'
                            : seleccionada
                              ? 'configuracion-caja__estado configuracion-caja__estado--seleccionada'
                              : 'configuracion-caja__estado'
                        }
                      >
                        {ocupada
                          ? 'Vinculada a otra terminal'
                          : seleccionada
                            ? 'Seleccionada para esta terminal'
                            : 'Disponible'}
                      </span>

                      {!ocupada && (
                        <button
                          type="button"
                          className="configuracion-caja__eliminar"
                          title="Eliminar caja sin uso"
                          aria-label={`Eliminar ${caja.nombre}`}
                          disabled={gestionandoCaja}
                          onClick={() =>
                            setCajaAEliminar(caja)
                          }
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>


          </section>

          {!creandoCaja ? (
            <button
              type="button"
              className="configuracion-caja__agregar"
              onClick={() =>
                setCreandoCaja(true)
              }
            >
              <span aria-hidden="true">＋</span>
              Agregar nueva caja
            </button>
          ) : (
            <div className="configuracion-caja__nueva">
              <div>
                <small>
                  Nombre de la nueva caja
                </small>

                <input
                  autoFocus
                  maxLength={100}
                  value={nombreNuevaCaja}
                  placeholder="Ej: Caja efectivo"
                  disabled={gestionandoCaja}
                  onChange={(evento) =>
                    setNombreNuevaCaja(
                      evento.target.value,
                    )
                  }
                  onKeyDown={(evento) => {
                    if (
                      evento.key === 'Enter'
                    ) {
                      void crearCaja()
                    }

                    if (
                      evento.key === 'Escape'
                    ) {
                      setCreandoCaja(false)
                      setNombreNuevaCaja('')
                    }
                  }}
                />
              </div>

              <button
                type="button"
                className="configuracion-caja__guardar-nueva"
                disabled={
                  gestionandoCaja ||
                  !nombreNuevaCaja.trim()
                }
                onClick={() =>
                  void crearCaja()
                }
              >
                {gestionandoCaja
                  ? 'Guardando…'
                  : 'Guardar caja'}
              </button>

              <button
                type="button"
                className="configuracion-caja__cancelar-nueva"
                disabled={gestionandoCaja}
                onClick={() => {
                  setCreandoCaja(false)
                  setNombreNuevaCaja('')
                }}
              >
                Cancelar
              </button>
            </div>
          )}

          <aside className="configuracion-caja__aviso">
            <span aria-hidden="true">i</span>

            <p>
              Cada caja puede tener una sola
              Terminal Regalones vinculada.
              Las cajas ocupadas deben liberarse
              desde la administración antes de
              vincular un nuevo equipo.
            </p>
          </aside>

          <footer className="configuracion-caja__acciones">
            <button
              type="button"
              className="configuracion-caja__volver"
              disabled={
                procesando ||
                gestionandoCaja
              }
              onClick={alVolver}
            >
              <span aria-hidden="true">←</span>
              Volver
            </button>

            <button
              type="button"
              className="configuracion-caja__vincular"
              disabled={
                procesando ||
                gestionandoCaja ||
                !cajaId
              }
              onClick={alVincular}
            >
              <span>
                {procesando
                  ? 'Vinculando…'
                  : 'Vincular esta terminal'}
              </span>

              <span aria-hidden="true">→</span>
            </button>
          </footer>
        </div>
      </section>
      {cajaAEliminar && (
        <div
          className="configuracion-caja__modal-fondo"
          role="presentation"
          onMouseDown={() =>
            !gestionandoCaja &&
            setCajaAEliminar(null)
          }
        >
          <section
            className="configuracion-caja__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-eliminar-caja"
            onMouseDown={(evento) =>
              evento.stopPropagation()
            }
          >
            <div className="configuracion-caja__modal-icono">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="configuracion-caja__modal-contenido">
              <span>Eliminar caja</span>

              <h2 id="titulo-eliminar-caja">
                ¿Eliminar “{cajaAEliminar.nombre}”?
              </h2>

              <p>
                Esta acción solo se realizará si la caja
                nunca ha sido utilizada ni tiene historial
                asociado.
              </p>

              <div className="configuracion-caja__modal-aviso">
                <span>i</span>
                <p>
                  Si la caja ya fue utilizada, Regalones la
                  conservará automáticamente para proteger
                  el historial del negocio.
                </p>
              </div>
            </div>

            <div className="configuracion-caja__modal-acciones">
              <button
                type="button"
                className="configuracion-caja__modal-cancelar"
                disabled={gestionandoCaja}
                onClick={() =>
                  setCajaAEliminar(null)
                }
              >
                Cancelar
              </button>

              <button
                type="button"
                className="configuracion-caja__modal-eliminar"
                disabled={gestionandoCaja}
                onClick={() => {
                  void (async () => {
                    const eliminada =
                      await alEliminarCaja(
                        cajaAEliminar.id,
                      )

                    if (eliminada) {
                      setCajaAEliminar(null)
                    }
                  })()
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>

                {gestionandoCaja
                  ? 'Eliminando…'
                  : 'Eliminar caja'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}