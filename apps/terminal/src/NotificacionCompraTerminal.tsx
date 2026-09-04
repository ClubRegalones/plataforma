import type { FormEvent } from 'react'
import regalonCompra from './recursos/mascota/regalon-compra.png'
import regalonCorazon from './recursos/mascota/regalon-corazon.png'

type TipoNotificacion = 'compra' | 'llavero' | 'telefono'

type Props = {
  tipo: TipoNotificacion
  nombreVecino: string
  monto?: number | null
  saldoRegis?: number | null
  modoAsistido?: boolean
  montoAsistido?: string
  procesando?: boolean
  alRevisar?: () => void
  alIniciarAsistida?: () => void
  alCambiarMonto?: (valor: string) => void
  alContinuarAsistida?: (evento: FormEvent<HTMLFormElement>) => void
  alCerrar: () => void
}

function formatearMonto(valor: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(valor)
}

export default function NotificacionCompraTerminal({
  tipo,
  nombreVecino,
  monto = null,
  saldoRegis = null,
  modoAsistido = false,
  montoAsistido = '',
  procesando = false,
  alRevisar,
  alIniciarAsistida,
  alCambiarMonto,
  alContinuarAsistida,
  alCerrar,
}: Props) {
  const esCompraNormal = tipo === 'compra'
  const esLlavero = tipo === 'llavero'
  const mostrarMontoAsistido =
    !esCompraNormal && (tipo === 'telefono' || modoAsistido)

  return (
    <div className="terminal-compra-detectada__fondo">
      <section
        className={`terminal-compra-detectada${
          esCompraNormal
            ? ' terminal-compra-detectada--compra'
            : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminal-compra-detectada-title"
      >
        <button
          type="button"
          className="terminal-compra-detectada__cerrar"
          onClick={alCerrar}
          aria-label="Cerrar aviso"
        >
          ×
        </button>

        <div className="terminal-compra-detectada__contenido">
          <span className="terminal-eyebrow">
            {esCompraNormal
              ? 'Compra normal'
              : esLlavero
                ? 'Llavero detectado'
                : 'Venta asistida'}
          </span>

          <h2 id="terminal-compra-detectada-title">
            {esCompraNormal
              ? 'Nueva compra detectada'
              : 'Vecino Regalón detectado'}
          </h2>

          <div className="terminal-compra-detectada__vecino">
            <img
              src={regalonCorazon}
              alt=""
              aria-hidden="true"
            />

            <div>
              <small>Vecino identificado</small>
              <strong>{nombreVecino}</strong>
              <span>
                {esCompraNormal
                  ? 'Monto informado por el vecino'
                  : esLlavero
                    ? 'Identificado por llavero NFC'
                    : 'Identificado por teléfono'}
              </span>
            </div>
          </div>

          {esCompraNormal && monto !== null && (
            <div className="terminal-compra-detectada__monto">
              <div
                className="terminal-compra-detectada__monto-icono"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z" />
                  <path d="M9 8h6M9 12h6M9 16h3" />
                </svg>
              </div>

              <div className="terminal-compra-detectada__monto-contenido">
                <span>Monto informado</span>
                <strong>{formatearMonto(monto)}</strong>
              </div>
            </div>
          )}

          {!esCompraNormal && saldoRegis !== null && (
            <div className="terminal-compra-detectada__saldo">
              <span>Saldo actual</span>
              <strong>{saldoRegis} REGIS</strong>
            </div>
          )}

          {mostrarMontoAsistido && alContinuarAsistida && (
            <form
              className="terminal-compra-detectada__asistida"
              onSubmit={alContinuarAsistida}
            >
              <label>
                Monto de la compra

                <div className="terminal-compra-detectada__input">
                  <span>$</span>
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    value={montoAsistido}
                    onChange={(evento) =>
                      alCambiarMonto?.(
                        evento.target.value.replace(/\D/g, ''),
                      )
                    }
                    placeholder="12.500"
                  />
                </div>
              </label>

              <button
                type="submit"
                className="terminal-compra-detectada__principal"
                disabled={procesando}
              >
                {procesando
                  ? 'Preparando…'
                  : 'Continuar a revisión'}
              </button>
            </form>
          )}

          {esCompraNormal && alRevisar && (
            <button
              type="button"
              className="terminal-compra-detectada__principal"
              onClick={alRevisar}
            >
              Revisar compra →
            </button>
          )}

          {esLlavero && !modoAsistido && alIniciarAsistida && (
            <button
              type="button"
              className="terminal-compra-detectada__principal"
              onClick={alIniciarAsistida}
            >
              Registrar compra asistida →
            </button>
          )}
        </div>

        <div className="terminal-compra-detectada__visual">
          <div className="terminal-compra-detectada__halo" />
          <img
            src={regalonCompra}
            alt=""
            aria-hidden="true"
          />
        </div>
      </section>
    </div>
  )
}