import tienda from '../recursos/iconos/tienda.png'

type Negocio = {
  id: string
  nombre: string
  rut: string | null
}

type Sucursal = {
  id: string
  negocioId: string
  nombre: string
  direccion: string
  comuna: string
}

type CajaResumen = {
  id: string
  sucursalId: string
}

type Props = {
  negocios: Negocio[]
  sucursales: Sucursal[]
  cajas: CajaResumen[]
  negocioId: string
  sucursalId: string
  cargando: boolean
  error: string | null
  alCambiarNegocio: (negocioId: string) => void
  alCambiarSucursal: (sucursalId: string) => void
  alVolver: () => void | Promise<void>
  alContinuar: () => void
}

export default function PantallaSeleccionarNegocio({
  negocios,
  sucursales,
  cajas,
  negocioId,
  sucursalId,
  cargando,
  error,
  alCambiarNegocio,
  alCambiarSucursal,
  alVolver,
  alContinuar,
}: Props) {
  const sucursalesDelNegocio = sucursales.filter(
    (sucursal) => sucursal.negocioId === negocioId,
  )

  const cantidadCajas = (idSucursal: string) =>
    cajas.filter(
      (caja) => caja.sucursalId === idSucursal,
    ).length

  return (
    <main className="configuracion-negocio">
      <section
        className="configuracion-negocio__panel"
        aria-labelledby="seleccionar-negocio-title"
      >
        <header className="configuracion-negocio__cabecera">
          <div className="configuracion-negocio__marca">
            <strong>
              Club Regalones
              <span aria-hidden="true">♥</span>
            </strong>

            <small>Más barrio, más beneficios</small>
          </div>

          <div
            className="configuracion-negocio__progreso"
            aria-label="Paso 2 de 3"
          >
            <span className="configuracion-negocio__paso configuracion-negocio__paso--completado">
              1
              <i aria-hidden="true">✓</i>
            </span>

            <b />

            <span className="configuracion-negocio__paso configuracion-negocio__paso--activo">
              2
            </span>

            <b />

            <span className="configuracion-negocio__paso">
              3
            </span>
          </div>

          <span className="configuracion-negocio__etiqueta">
            Configuración inicial
          </span>
        </header>

        <div className="configuracion-negocio__separador" />

        <div className="configuracion-negocio__cuerpo">
          <header className="configuracion-negocio__titulo">
            <h1 id="seleccionar-negocio-title">
              Selecciona tu negocio y sucursal
            </h1>

            <p>
              Elige dónde se usará esta terminal.
            </p>
          </header>

          {error && (
            <p className="configuracion-negocio__error">
              {error}
            </p>
          )}

          {cargando ? (
            <div className="configuracion-negocio__cargando">
              Cargando tus negocios y sucursales…
            </div>
          ) : (
            <>
              <section className="configuracion-negocio__seccion">
                <h2>1. Selecciona tu negocio</h2>

                <div className="configuracion-negocio__negocios">
                  {negocios.map((negocio) => {
                    const seleccionado =
                      negocio.id === negocioId

                    const totalSucursales =
                      sucursales.filter(
                        (sucursal) =>
                          sucursal.negocioId === negocio.id,
                      ).length

                    return (
                      <button
                        key={negocio.id}
                        type="button"
                        className={
                          seleccionado
                            ? 'configuracion-negocio__tarjeta-negocio configuracion-negocio__tarjeta-negocio--activa'
                            : 'configuracion-negocio__tarjeta-negocio'
                        }
                        aria-pressed={seleccionado}
                        onClick={() =>
                          alCambiarNegocio(negocio.id)
                        }
                      >
                        <span
                          className={
                            seleccionado
                              ? 'configuracion-negocio__radio configuracion-negocio__radio--activo'
                              : 'configuracion-negocio__radio'
                          }
                          aria-hidden="true"
                        />

                        <img
                          src={tienda}
                          alt=""
                          aria-hidden="true"
                        />

                        <span className="configuracion-negocio__info-negocio">
                          <strong>{negocio.nombre}</strong>

                          {negocio.rut && (
                            <small>
                              RUT: {negocio.rut}
                            </small>
                          )}

                          <small>
                            {totalSucursales}{' '}
                            {totalSucursales === 1
                              ? 'sucursal'
                              : 'sucursales'}
                          </small>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="configuracion-negocio__seccion">
                <h2>
                  2. Selecciona la sucursal de este negocio
                </h2>

                {sucursalesDelNegocio.length === 0 ? (
                  <div className="configuracion-negocio__sin-sucursales">
                    Este negocio no tiene sucursales activas.
                  </div>
                ) : (
                  <div className="configuracion-negocio__sucursales">
                    {sucursalesDelNegocio.map(
                      (sucursal) => {
                        const seleccionada =
                          sucursal.id === sucursalId

                        const totalCajas =
                          cantidadCajas(sucursal.id)

                        return (
                          <button
                            key={sucursal.id}
                            type="button"
                            className={
                              seleccionada
                                ? 'configuracion-negocio__sucursal configuracion-negocio__sucursal--activa'
                                : 'configuracion-negocio__sucursal'
                            }
                            aria-pressed={seleccionada}
                            onClick={() =>
                              alCambiarSucursal(
                                sucursal.id,
                              )
                            }
                          >
                            <span
                              className={
                                seleccionada
                                  ? 'configuracion-negocio__radio configuracion-negocio__radio--activo'
                                  : 'configuracion-negocio__radio'
                              }
                              aria-hidden="true"
                            />

                            <span className="configuracion-negocio__icono-sucursal">
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  d="M5 21V9h14v12M8 9V4h8v5M9 13h2v2H9zm4 0h2v2h-2zm-4 4h2v4H9zm4 0h2v4h-2z"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>

                            <span className="configuracion-negocio__info-sucursal">
                              <strong>
                                {sucursal.nombre}
                              </strong>

                              <small>
                                {sucursal.direccion}
                                {sucursal.comuna
                                  ? `, ${sucursal.comuna}`
                                  : ''}
                              </small>
                            </span>

                            <span className="configuracion-negocio__cantidad-cajas">
                              {totalCajas}{' '}
                              {totalCajas === 1
                                ? 'caja'
                                : 'cajas'}
                            </span>

                            <span
                              className="configuracion-negocio__flecha-sucursal"
                              aria-hidden="true"
                            >
                              ›
                            </span>
                          </button>
                        )
                      },
                    )}
                  </div>
                )}
              </section>

              <aside className="configuracion-negocio__aviso">
                <span aria-hidden="true">i</span>

                <p>
                  Solo aparecen los negocios y sucursales
                  activos que administras en Club Regalones.
                </p>
              </aside>
            </>
          )}

          <footer className="configuracion-negocio__acciones">
            <button
              type="button"
              className="configuracion-negocio__volver"
              onClick={() => void alVolver()}
            >
              <span aria-hidden="true">←</span>
              Volver
            </button>

            <button
              type="button"
              className="configuracion-negocio__continuar"
              disabled={
                cargando ||
                !negocioId ||
                !sucursalId
              }
              onClick={alContinuar}
            >
              <span>Continuar</span>
              <span aria-hidden="true">→</span>
            </button>
          </footer>
        </div>
      </section>
    </main>
  )
}