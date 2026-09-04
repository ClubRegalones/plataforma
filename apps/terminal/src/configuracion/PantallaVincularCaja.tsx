import { useState } from 'react'
import cajaIcono from '../recursos/iconos/caja.png'
import './configuracionCajaUnica.css'

type TerminalInstalada = {
  id: string
  identificador: string
  nombreDispositivo: string | null
  estado: string
}

type Props = {
  nombreNegocio: string
  nombreSucursal: string
  cajaLista: boolean
  preparandoCaja: boolean
  terminalInstalada: TerminalInstalada | null
  procesando: boolean
  error: string | null
  alVolver: () => void
  alConfigurar: () => void
  alMover: () => void
}

export default function PantallaVincularCaja({
  nombreNegocio,
  nombreSucursal,
  cajaLista,
  preparandoCaja,
  terminalInstalada,
  procesando,
  error,
  alVolver,
  alConfigurar,
  alMover,
}: Props) {
  const [confirmandoTraslado, setConfirmandoTraslado] =
    useState(false)

  const requiereTraslado = Boolean(terminalInstalada)

  const ejecutarAccion = () => {
    if (requiereTraslado) {
      setConfirmandoTraslado(true)
      return
    }

    alConfigurar()
  }

  return (
    <main className="configuracion-caja configuracion-caja--unica">
      <section
        className="configuracion-caja__panel"
        aria-labelledby="configurar-caja-title"
      >
        <header className="configuracion-caja__cabecera">
          <div className="configuracion-caja__marca">
            <strong>
              Club Regalones
              <span aria-hidden="true">♥</span>
            </strong>

            <small>Más barrio, más beneficios</small>
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
            <h1 id="configurar-caja-title">
              Configura esta Caja Regalones
            </h1>

            <p>
              Esta Terminal quedará asociada a la Caja Regalones
              de la sucursal seleccionada.
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
            <h2>Caja Regalones de esta sucursal</h2>

            <article className="configuracion-caja__resumen-unico">
              <span
                className="configuracion-caja__icono"
                aria-hidden="true"
              >
                <img src={cajaIcono} alt="" />
              </span>

              <div className="configuracion-caja__resumen-info">
                <small>Caja Regalones</small>
                <strong>Esta caja</strong>
                <span>
                  {preparandoCaja
                    ? 'Preparando configuración…'
                    : cajaLista
                      ? 'Lista para configurar'
                      : 'Pendiente de preparación'}
                </span>
              </div>

              <span
                className={
                  cajaLista
                    ? 'configuracion-caja__estado configuracion-caja__estado--seleccionada'
                    : 'configuracion-caja__estado'
                }
              >
                {cajaLista ? 'Lista' : 'Preparando…'}
              </span>
            </article>
          </section>

          {terminalInstalada ? (
            <aside className="configuracion-caja__traslado">
              <div className="configuracion-caja__traslado-icono">
                <span aria-hidden="true">↔</span>
              </div>

              <div>
                <strong>
                  Esta sucursal ya tiene una Terminal instalada
                </strong>
                <p>
                  Actualmente está vinculada a{' '}
                  <b>
                    {terminalInstalada.nombreDispositivo ||
                      terminalInstalada.identificador}
                  </b>.
                  Si Regalones se está instalando ahora en este equipo,
                  puedes mover la Terminal de forma segura.
                </p>
                <small>
                  La Terminal anterior quedará desvinculada y su historial
                  se conservará.
                </small>
              </div>
            </aside>
          ) : (
            <aside className="configuracion-caja__aviso">
              <span aria-hidden="true">i</span>
              <p>
                Esta será la única Caja Regalones de la sucursal. Las cajas
                físicas del sistema POS del comercio son independientes.
              </p>
            </aside>
          )}

          <footer className="configuracion-caja__acciones">
            <button
              type="button"
              className="configuracion-caja__volver"
              disabled={procesando || preparandoCaja}
              onClick={alVolver}
            >
              <span aria-hidden="true">←</span>
              Volver
            </button>

            <button
              type="button"
              className="configuracion-caja__vincular"
              disabled={procesando || preparandoCaja || !cajaLista}
              onClick={ejecutarAccion}
            >
              <span>
                {procesando
                  ? 'Configurando…'
                  : requiereTraslado
                    ? 'Mover Terminal a este dispositivo'
                    : 'Configurar esta caja'}
              </span>
              <span aria-hidden="true">→</span>
            </button>
          </footer>
        </div>
      </section>

      {confirmandoTraslado && terminalInstalada && (
        <div
          className="configuracion-caja-unica__modal-fondo"
          role="presentation"
          onMouseDown={() =>
            !procesando && setConfirmandoTraslado(false)
          }
        >
          <section
            className="configuracion-caja-unica__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmar-traslado-terminal"
            onMouseDown={(evento) => evento.stopPropagation()}
          >
            <span className="configuracion-caja-unica__modal-icono">
              ↔
            </span>

            <div>
              <span className="configuracion-caja-unica__modal-etiqueta">
                Mover Caja Regalones
              </span>
              <h2 id="confirmar-traslado-terminal">
                ¿Mover la Terminal a este dispositivo?
              </h2>
              <p>
                La Terminal instalada en{' '}
                <strong>
                  {terminalInstalada.nombreDispositivo ||
                    terminalInstalada.identificador}
                </strong>{' '}
                dejará de estar activa. Si tenía un turno o lector móvil
                abiertos, Regalones los cerrará automáticamente.
              </p>
              <p>
                Las compras, canjes y demás historial no se eliminan.
              </p>
            </div>

            <div className="configuracion-caja-unica__modal-acciones">
              <button
                type="button"
                disabled={procesando}
                onClick={() => setConfirmandoTraslado(false)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="configuracion-caja-unica__confirmar"
                disabled={procesando}
                onClick={alMover}
              >
                {procesando
                  ? 'Moviendo Terminal…'
                  : 'Sí, mover Terminal'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
