import tiendaRegalones from './recursos/marca/tienda-regalones.png'
import regalonLlavero from './recursos/marca/regalon-llavero.png'
import monedaRegis from './recursos/marca/moneda-regis.png'

type VecinoMenu = {
  nombreVecino: string
  disponibles: number
}

type Props = {
  vecino: VecinoMenu
  onRegistrarCompra: () => void
  onCanjearBeneficio: () => void | Promise<void>
  onEscanearOtro: () => void
  error?: string | null
}

function obtenerIniciales(nombre: string) {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join('')
    .toUpperCase()
}

function IconoBolsa() {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="menu-vecino__svg"
    >
      <path
        d="M20 24h24l3 28H17l3-28Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M25 24v-4c0-4 3-8 7-8s7 4 7 8v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M14 19l5 5"
        fill="none"
        stroke="#ff7a1a"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M12 28h8"
        fill="none"
        stroke="#ff7a1a"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconoRegalo() {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="menu-vecino__svg"
    >
      <path
        d="M14 28h36v24H14z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M12 22h40v8H12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M32 22v30"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        d="M24 22c-3 0-6-2-6-5 0-4 3-6 7-6 4 0 7 3 7 11"
        fill="none"
        stroke="#ff7a1a"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M40 22c3 0 6-2 6-5 0-4-3-6-7-6-4 0-7 3-7 11"
        fill="none"
        stroke="#ff7a1a"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconoFlecha() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="menu-vecino__flecha-svg"
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

export default function MenuVecinoEncontrado({
  vecino,
  onRegistrarCompra,
  onCanjearBeneficio,
  onEscanearOtro,
  error,
}: Props) {
  return (
    <section className="menu-vecino">
      <article className="menu-vecino__negocio">
        <div className="menu-vecino__negocio-icono">
          <img
            src={tiendaRegalones}
            alt=""
          />
        </div>

        <div className="menu-vecino__negocio-texto">
          <strong>Almacén Nuevo Regalón</strong>
          <small>Sucursal Centro · Caja Regalones</small>
        </div>

        <div className="menu-vecino__negocio-flecha">
          <IconoFlecha />
        </div>
      </article>

      <article className="menu-vecino__hero">
        <div className="menu-vecino__hero-copy">
          <h1>Vecino encontrado</h1>
          <p>
            Ya puedes registrar una compra
            o aprobar un canje.
          </p>
        </div>

        <div className="menu-vecino__hero-ilustracion">
          <img
            src={regalonLlavero}
            alt="El Regalón saludando"
          />
        </div>
      </article>

      <article className="menu-vecino__resumen">
        <div className="menu-vecino__persona-avatar">
          {obtenerIniciales(vecino.nombreVecino)}
        </div>

        <div className="menu-vecino__persona-info">
          <strong>{vecino.nombreVecino}</strong>

          <span className="menu-vecino__chip">
            <span className="menu-vecino__chip-check">
              &#10003;
            </span>
            Vecina identificada
          </span>
        </div>      </article>

      <article className="menu-vecino__saldo">
        <div className="menu-vecino__saldo-icono">
          <img
            src={monedaRegis}
            alt=""
          />
        </div>

        <div className="menu-vecino__saldo-info">
          <small>Saldo actual</small>
          <strong>
            {vecino.disponibles.toLocaleString('es-CL')} REGIS
          </strong>
        </div>
      </article>

      <div className="menu-vecino__separador" />

      <section className="menu-vecino__acciones">
        <h2>¿Qué deseas registrar?</h2>

        <div className="menu-vecino__acciones-grid">
          <button
            type="button"
            className="menu-vecino__accion-card menu-vecino__accion-card--compra"
            onClick={onRegistrarCompra}
          >
            <div className="menu-vecino__accion-icono">
              <IconoBolsa />
            </div>

            <strong>Registrar compra</strong>

            <small>
              Suma REGIS con
              <br />
              una nueva compra.
            </small>

            <div className="menu-vecino__accion-flecha">
              <IconoFlecha />
            </div>
          </button>

          <button
            type="button"
            className="menu-vecino__accion-card menu-vecino__accion-card--canje"
            onClick={onCanjearBeneficio}
          >
            <div className="menu-vecino__accion-icono">
              <IconoRegalo />
            </div>

            <strong>Canjear beneficio</strong>

            <small>
              Usa los REGIS del vecino
              <br />
              para un beneficio.
            </small>

            <div className="menu-vecino__accion-flecha">
              <IconoFlecha />
            </div>
          </button>
        </div>
      </section>

      <button
        type="button"
        className="menu-vecino__boton-secundario"
        onClick={onEscanearOtro}
      >
        Escanear otro
      </button>

      <p className="menu-vecino__ayuda">
        Para gastar REGIS siempre pediremos el PIN de seguridad del vecino.
      </p>

      {error && (
        <div
          className="menu-vecino__error"
          role="alert"
        >
          {error}
        </div>
      )}
    </section>
  )
}
