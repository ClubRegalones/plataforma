import isotipo from '../../recursos/marca/isotipo-corazon.png'
import './SeccionNosotros.css'

function SeccionNosotros() {
  return (
    <section className="seccion-nosotros" id="nosotros">
      <div className="contenedor seccion-nosotros__contenido">
        <div className="seccion-nosotros__marca">
          <img src={isotipo} alt="" aria-hidden="true" />
        </div>

        <div>
          <span className="etiqueta-seccion">Nuestro propósito</span>
          <h2 className="titulo-seccion">Más barrios felices, juntos</h2>

          <p className="texto-seccion">
            Club Regalones nace para conectar a vecinos y comercios locales a
            través de beneficios que premian la preferencia, fortalecen las
            relaciones y mantienen vivo el comercio de barrio.
          </p>
        </div>
      </div>
    </section>
  )
}

export default SeccionNosotros
