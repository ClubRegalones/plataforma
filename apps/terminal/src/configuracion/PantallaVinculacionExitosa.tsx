import regalonCorazon from '../recursos/mascota/regalon-corazon.png'

type Props = {
  nombreNegocio: string
  nombreSucursal: string
  nombreCaja: string
  alComenzar: () => void
}

export default function PantallaVinculacionExitosa({
  nombreNegocio,
  nombreSucursal,
  nombreCaja,
  alComenzar,
}: Props) {
  return (
    <main className="vinculacion-exitosa">
      <section className="vinculacion-exitosa__panel">
        <header className="vinculacion-exitosa__cabecera">
          <div className="vinculacion-exitosa__marca">
            <strong>
              Club Regalones
              <span>♥</span>
            </strong>

            <small>Más barrio, más beneficios</small>
          </div>

          <div
            className="vinculacion-exitosa__progreso"
            aria-label="Configuración completada"
          >
            <span className="vinculacion-exitosa__paso">
              1
              <i>✓</i>
            </span>

            <b />

            <span className="vinculacion-exitosa__paso">
              2
              <i>✓</i>
            </span>

            <b />

            <span className="vinculacion-exitosa__paso vinculacion-exitosa__paso--final">
              3
              <i>✓</i>
            </span>
          </div>

          <span className="vinculacion-exitosa__etiqueta">
            Configuración inicial
          </span>
        </header>

        <div className="vinculacion-exitosa__separador" />

        <div className="vinculacion-exitosa__cuerpo">
          <div className="vinculacion-exitosa__ilustracion">
            <div
              className="vinculacion-exitosa__check"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24">
                <path
                  d="m6.5 12.5 3.4 3.4 7.6-8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="vinculacion-exitosa__brillo vinculacion-exitosa__brillo--uno">
              ✦
            </div>

            <div className="vinculacion-exitosa__brillo vinculacion-exitosa__brillo--dos">
              ✦
            </div>

            <img
              src={regalonCorazon}
              alt="El Regalón celebrando la configuración de la Terminal"
            />
          </div>

          <div className="vinculacion-exitosa__contenido">
            <span className="vinculacion-exitosa__pretitulo">
              Configuración exitosa
            </span>

            <h1>¡Caja Regalones lista!</h1>

            <p className="vinculacion-exitosa__subtitulo">
              Esta Terminal quedó configurada como la Terminal activa de
              la sucursal.
            </p>

            <div className="vinculacion-exitosa__resumen">
              <div>
                <span>Negocio</span>
                <strong>{nombreNegocio}</strong>
              </div>

              <div>
                <span>Sucursal</span>
                <strong>{nombreSucursal}</strong>
              </div>

              <div>
                <span>Caja Regalones</span>
                <strong>{nombreCaja}</strong>
              </div>
            </div>

            <p className="vinculacion-exitosa__explicacion">
              Desde ahora, los cajeros podrán iniciar turno sin volver a
              configurar este dispositivo.
            </p>

            <button
              type="button"
              className="vinculacion-exitosa__comenzar"
              onClick={alComenzar}
            >
              <span>Comenzar a usar</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
