import heroPrincipal from '../../recursos/portada/hero-principal.png'
import './Portada.css'

function Portada() {
  return (
    <section className="portada" id="inicio">
      <div className="portada__marco">
        <img
          className="portada__fondo"
          src={heroPrincipal}
          alt=""
          aria-hidden="true"
        />

        <div className="portada__capa" aria-hidden="true" />

        <div className="contenedor portada__contenido">
          <div className="portada__texto">
            <span className="portada__preTitulo">
              Elegir local vale más
            </span>

            <h1>
              <span className="portada__titulo-verde">Tus compras</span>
              <span className="portada__titulo-naranjo">te premian</span>
            </h1>

            <p>
              En Club Regalones premiamos tu preferencia y ayudamos a fortalecer
              los comercios de barrio.
            </p>

            <div className="portada__acciones">
              <a className="boton boton--principal" href="#vecinos">
                Únete como vecino
                <span aria-hidden="true">→</span>
              </a>

              <a className="boton boton--secundario" href="#comercios">
                Suma tu negocio
                <span aria-hidden="true">↓</span>
              </a>
            </div>

            <small>
              <strong>Gratis</strong> para vecinos · Planes mensuales para comercios
            </small>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Portada
