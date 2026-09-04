import comercio from '../../recursos/portada/comercio-barrio.png'
import './SeccionComercios.css'

const beneficios = [
  {
    titulo: 'Fidelización sencilla',
    texto: 'Premia a tus clientes sin reemplazar tu sistema de ventas.',
    icono: '🤝',
  },
  {
    titulo: 'Información y reportes',
    texto: 'Conoce la actividad, frecuencia y participación de tus clientes.',
    icono: '📊',
  },
  {
    titulo: 'Campañas y recompensas',
    texto: 'Crea beneficios y promociones para incentivar nuevas visitas.',
    icono: '🎁',
  },
]

function SeccionComercios() {
  return (
    <section className="seccion-comercios" id="comercios">
      <div className="contenedor">
        <div className="seccion-comercios__principal">
          <div>
            <span className="etiqueta-seccion">Para comercios</span>
            <h2 className="titulo-seccion">Suma tu negocio a Club Regalones</h2>

            <p className="texto-seccion">
              Premia la preferencia de tus clientes, conoce mejor sus hábitos y
              crea beneficios que los motiven a volver.
            </p>

            <div className="seccion-comercios__acciones">
              <a className="boton boton--principal" href="#planes">
                Conocer los planes
              </a>
              <a className="boton boton--secundario" href="#formulario-negocio">
                Quiero sumar mi negocio
              </a>
            </div>
          </div>

          <div className="seccion-comercios__imagen">
            <img src={comercio} alt="Comercio Regalón ilustrado" />
          </div>
        </div>

        <div className="seccion-comercios__beneficios">
          {beneficios.map((beneficio) => (
            <article key={beneficio.titulo}>
              <span aria-hidden="true">{beneficio.icono}</span>
              <h3>{beneficio.titulo}</h3>
              <p>{beneficio.texto}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default SeccionComercios
