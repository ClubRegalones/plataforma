import logoClaro from '../../recursos/marca/logo-horizontal-claro.png'
import './PiePagina.css'

function PiePagina() {
  return (
    <footer className="pie-pagina" id="contacto">
      <div className="contenedor pie-pagina__principal">
        <div className="pie-pagina__marca">
          <img src={logoClaro} alt="Club Regalones" />
          <p>Más barrio, más beneficios.</p>
        </div>

        <div>
          <h2>Vecinos</h2>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#vecinos">Crear cuenta</a>
          <a href="#preguntas">Preguntas frecuentes</a>
        </div>

        <div>
          <h2>Comercios</h2>
          <a href="#comercios">Conocer los planes</a>
          <a href="#formulario-negocio">Sumar mi negocio</a>
          <a href="#contacto">Contacto</a>
        </div>

        <div>
          <h2>Accede desde tu celular</h2>
          <p className="pie-pagina__destacado">
            Sin descargar aplicaciones.
          </p>
          <div className="pie-pagina__redes" aria-label="Redes sociales">
            <a href="#instagram" aria-label="Instagram">ig</a>
            <a href="#facebook" aria-label="Facebook">f</a>
            <a href="#tiktok" aria-label="TikTok">♪</a>
          </div>
        </div>
      </div>

      <div className="contenedor pie-pagina__inferior">
        <span>© 2026 Club Regalones</span>
        <div>
          <a href="#terminos">Términos y condiciones</a>
          <a href="#privacidad">Política de privacidad</a>
        </div>
      </div>
    </footer>
  )
}

export default PiePagina
