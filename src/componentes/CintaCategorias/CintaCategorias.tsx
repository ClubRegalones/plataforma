import './CintaCategorias.css'

const categorias = [
  'Panaderías',
  'Minimarkets',
  'Botillerías',
  'Verdulerías',
  'Food trucks',
  'Cafeterías',
  'Carnicerías',
  'Peluquerías',
  'Restaurantes',
  'Tiendas locales',
]

function CintaCategorias() {
  const contenido = [...categorias, ...categorias]

  return (
    <section className="cinta-categorias" aria-labelledby="titulo-lanzamiento">
      <div className="contenedor cinta-categorias__encabezado">
        <div>
          <span className="etiqueta-seccion">Próximamente</span>
          <h2 className="titulo-seccion" id="titulo-lanzamiento">
            Estamos preparando los primeros Comercios Regalones
          </h2>
        </div>

        <p className="texto-seccion">
          Pronto podrás descubrir negocios, beneficios y premios disponibles
          cerca de ti.
        </p>
      </div>

      <div className="cinta-categorias__ventana">
        <div className="cinta-categorias__pista">
          {contenido.map((categoria, indice) => (
            <span key={`${categoria}-${indice}`}>
              <i aria-hidden="true">♥</i>
              {categoria}
            </span>
          ))}
        </div>
      </div>

      <div className="contenedor cinta-categorias__acciones">
        <a className="boton boton--naranjo" href="#registro-vecino">
          Crear mi cuenta
        </a>
        <a className="boton boton--secundario" href="#formulario-negocio">
          Participar con mi negocio
        </a>
      </div>
    </section>
  )
}

export default CintaCategorias
