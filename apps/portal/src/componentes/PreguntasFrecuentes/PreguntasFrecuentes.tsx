import './PreguntasFrecuentes.css'

const preguntas = [
  {
    pregunta: '¿Qué son los Regis?',
    respuesta:
      'Los Regis son los puntos de Club Regalones. Los recibes cuando una compra es confirmada por un comercio participante.',
  },
  {
    pregunta: '¿Registrarme como vecino tiene costo?',
    respuesta:
      'No. Crear y mantener una cuenta de vecino en Club Regalones es gratuito.',
  },
  {
    pregunta: '¿Cómo se acreditan mis Regis?',
    respuesta:
      'Después de ingresar el monto de tu compra, el cajero revisa y confirma la solicitud. En ese momento los Regis se agregan a tu cuenta.',
  },
  {
    pregunta: '¿Puedo usar mis Regis en cualquier negocio?',
    respuesta:
      'En la primera versión, los Regis estarán asociados al comercio que los entrega y se canjearán en ese mismo negocio.',
  },
  {
    pregunta: '¿Necesito descargar una aplicación?',
    respuesta:
      'No. Club Regalones funcionará desde el navegador de tu celular, sin instalar una aplicación.',
  },
  {
    pregunta: '¿Cómo puede un negocio unirse?',
    respuesta:
      'El dueño podrá revisar los planes, completar el formulario de incorporación y recibir acompañamiento para configurar sus primeros beneficios.',
  },
]

function PreguntasFrecuentes() {
  return (
    <section className="preguntas" id="preguntas">
      <div className="contenedor preguntas__contenido">
        <div>
          <span className="etiqueta-seccion">Preguntas frecuentes</span>
          <h2 className="titulo-seccion">Todo lo que necesitas saber</h2>
          <p className="texto-seccion">
            Respuestas rápidas para vecinos y dueños de negocios.
          </p>
        </div>

        <div className="preguntas__lista">
          {preguntas.map(({ pregunta, respuesta }, indice) => (
            <details key={pregunta} open={indice === 0}>
              <summary>
                {pregunta}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{respuesta}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export default PreguntasFrecuentes
