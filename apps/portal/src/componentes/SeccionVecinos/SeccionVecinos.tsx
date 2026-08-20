import regalon from '../../recursos/mascota/regalon-saludando.png'
import fondoBarrio from '../../recursos/seccion-vecinos/fondo-vecinos.png'
import './SeccionVecinos.css'

const beneficios = [
  'Cuenta gratuita',
  'Historial de movimientos',
  'Beneficios en comercios participantes',
  'Acceso desde cualquier celular',
  'Sin descargar aplicaciones',
]
      function SeccionVecinos() {
  return (
    <section className="seccion-vecinos" id="vecinos">
      <img
        className="seccion-vecinos__fondo-barrio"
        src={fondoBarrio}
        alt=""
        aria-hidden="true"
      />

      <div className="contenedor seccion-vecinos__contenido">
        <div className="seccion-vecinos__imagen">
          <div className="seccion-vecinos__circulo" />

          <img
            src={regalon}
            alt="El Regalón invitando a los vecinos"
          />
        </div>

        <div>
          <span className="etiqueta-seccion">
            Para vecinos
          </span>

          <h2 className="titulo-seccion seccion-vecinos__titulo">
            Ser Regalón tiene <span>beneficios</span>
          </h2>

          <p className="texto-seccion">
            Únete gratis, acumula Regis en tus comercios favoritos y descubre
            nuevas formas de disfrutar tu barrio.
          </p>

          <ul>
            {beneficios.map((beneficio) => (
              <li key={beneficio}>
                <span aria-hidden="true">✓</span>
                {beneficio}
              </li>
            ))}
          </ul>

          <div className="seccion-vecinos__cta">
            <a
              className="boton boton--naranjo seccion-vecinos__boton"
              href="#registro-vecino"
            >
              Crear mi cuenta gratis
              <span aria-hidden="true">→</span>
            </a>

            <p className="seccion-vecinos__microcopy">
              <span>Sin costo</span>
              <b aria-hidden="true">•</b>
              <span>rápido</span>
              <b aria-hidden="true">•</b>
              <span>seguro</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default SeccionVecinos
