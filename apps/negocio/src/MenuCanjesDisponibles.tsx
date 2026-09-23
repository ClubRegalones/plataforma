import type { BeneficioCanjeNegocio } from './lib/canjes'
import tiendaRegalones from './recursos/marca/tienda-regalones.png'
import regalonCanje from './recursos/marca/regalon-canje.png'

type VecinoCanje = {
  nombreVecino: string
  disponibles: number
}

type Props = {
  vecino: VecinoCanje
  beneficios: BeneficioCanjeNegocio[]
  cargando: boolean
  procesando: boolean
  error?: string | null
  onElegir: (beneficio: BeneficioCanjeNegocio) => void
  onVolver: () => void
}

function iniciales(nombre: string) {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join('')
    .toUpperCase()
}

function Flecha() {
  return (
    <svg
      className="canjes-menu__flecha"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M9 5l7 7-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconoDescuento() {
  return (
    <svg
      className="canjes-menu__icono-svg"
      viewBox="0 0 72 72"
      aria-hidden="true"
    >
      <path
        d="M13 27l39-12 9 29-39 12-4-7-8-2 4-8-1-12Z"
        fill="#0c7248"
        stroke="#004b34"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M37 26c-7 0-10 10-2 12 9 2 6 11-2 11"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M37 22v5M33 49v5"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M10 17l4 6M18 12l2 8"
        stroke="#ff6617"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconoBebida() {
  return (
    <svg
      className="canjes-menu__icono-svg"
      viewBox="0 0 72 72"
      aria-hidden="true"
    >
      <path
        d="M17 29h37v20c0 8-6 13-13 13H30c-8 0-13-5-13-13V29Z"
        fill="#fff4db"
        stroke="#004b34"
        strokeWidth="4"
      />
      <path
        d="M54 35h5c7 0 7 13 0 13h-5"
        fill="none"
        stroke="#004b34"
        strokeWidth="4"
      />
      <path
        d="M25 21c-5-6 5-7 0-13M37 21c-5-6 5-7 0-13M48 21c-5-6 5-7 0-13"
        fill="none"
        stroke="#ff6617"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="36" cy="46" r="8" fill="#0b754a" />
      <text
        x="36"
        y="50"
        textAnchor="middle"
        fill="#fff"
        fontSize="10"
        fontWeight="900"
      >
        R
      </text>
    </svg>
  )
}

function IconoSnack() {
  return (
    <svg
      className="canjes-menu__icono-svg"
      viewBox="0 0 72 72"
      aria-hidden="true"
    >
      <path
        d="M10 24l30-4 7 41-31 4-6-41Z"
        fill="#f5a623"
        stroke="#004b34"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M13 29l31-4"
        stroke="#fff1d0"
        strokeWidth="4"
      />
      <circle cx="29" cy="46" r="9" fill="#0b754a" />
      <text
        x="29"
        y="50"
        textAnchor="middle"
        fill="#fff"
        fontSize="10"
        fontWeight="900"
      >
        R
      </text>

      <path
        d="M46 13l13 2-2 44-13-2 2-44Z"
        fill="#0b754a"
        stroke="#004b34"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M46 19l12 2"
        stroke="#ff6617"
        strokeWidth="8"
      />
      <path
        d="M46 48l11 2"
        stroke="#ff6617"
        strokeWidth="8"
      />
    </svg>
  )
}

function IconoBeneficio({
  indice,
}: {
  indice: number
}) {
  if (indice % 3 === 1) return <IconoBebida />
  if (indice % 3 === 2) return <IconoSnack />
  return <IconoDescuento />
}

export default function MenuCanjesDisponibles({
  vecino,
  beneficios,
  cargando,
  procesando,
  error,
  onElegir,
  onVolver,
}: Props) {
  return (
    <section className="canjes-menu">
      <button
        type="button"
        className="canjes-menu__negocio"
        onClick={onVolver}
      >
        <span className="canjes-menu__negocio-icono">
          <img
            src={tiendaRegalones}
            alt=""
          />
        </span>

        <span className="canjes-menu__negocio-texto">
          <strong>Almacén Nuevo Regalón</strong>
          <small>Sucursal Centro · Caja Regalones</small>
        </span>

        <Flecha />
      </button>

      <article className="canjes-menu__panel">
        <header className="canjes-menu__cabecera">
          <div className="canjes-menu__intro">
            <h1>Canjes disponibles</h1>

            <div className="canjes-menu__vecino">
              <span className="canjes-menu__avatar">
                {iniciales(vecino.nombreVecino)}
              </span>

              <strong>
                {vecino.nombreVecino}
                <span> · </span>
                <b>
                  {vecino.disponibles.toLocaleString('es-CL')} REGIS
                </b>
              </strong>
            </div>

            <p>
              Elige un beneficio para revisar
              <br />
              y aprobar el canje.
            </p>
          </div>

          <img
            className="canjes-menu__regalon"
            src={regalonCanje}
            alt="El Regalón presentando los canjes"
          />
        </header>

        {cargando ? (
          <div className="canjes-menu__estado">
            Cargando recompensas...
          </div>
        ) : beneficios.length === 0 ? (
          <div className="canjes-menu__estado">
            Este negocio no tiene recompensas disponibles.
          </div>
        ) : (
          <div className="canjes-menu__lista">
            {beneficios.map((beneficio, indice) => {
              const faltan = Math.max(
                0,
                beneficio.costo_regis - vecino.disponibles,
              )

              const disponible = faltan === 0

              return (
                <button
                  key={beneficio.id}
                  type="button"
                  className={[
                    'canjes-menu__beneficio',
                    disponible
                      ? 'canjes-menu__beneficio--disponible'
                      : 'canjes-menu__beneficio--bloqueado',
                  ].join(' ')}
                  disabled={!disponible || procesando}
                  onClick={() => onElegir(beneficio)}
                >
                  <span className="canjes-menu__beneficio-icono">
                    <IconoBeneficio indice={indice} />
                  </span>

                  <span className="canjes-menu__beneficio-info">
                    <strong>{beneficio.nombre}</strong>

                    <b>
                      {beneficio.costo_regis.toLocaleString('es-CL')} REGIS
                    </b>

                    <small>
                      {beneficio.descripcion ||
                        'Beneficio disponible para este negocio.'}
                    </small>

                    {beneficio.compra_minima_clp > 0 && (
                      <small className="canjes-menu__minimo">
                        Compra mínima: $
                        {beneficio.compra_minima_clp.toLocaleString('es-CL')}
                      </small>
                    )}
                  </span>

                  <span
                    className={[
                      'canjes-menu__estado-chip',
                      disponible
                        ? 'canjes-menu__estado-chip--ok'
                        : 'canjes-menu__estado-chip--falta',
                    ].join(' ')}
                  >
                    <i />
                    {disponible
                      ? 'Disponible'
                      : `Te faltan ${faltan.toLocaleString('es-CL')}`}
                  </span>

                  <Flecha />
                </button>
              )
            })}
          </div>
        )}

        {error && (
          <div
            className="canjes-menu__error"
            role="alert"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          className="canjes-menu__volver"
          onClick={onVolver}
        >
          Volver
        </button>
      </article>
    </section>
  )
}
