import './BarraBeneficios.css'

import bolsaBeneficios from '../../recursos/iconos/bolsa-beneficios.png'
import monedaRegis from '../../recursos/iconos/moneda-regis.png'
import comercioBarrio from '../../recursos/iconos/comercio-barrio.png'
import telefonoFacil from '../../recursos/iconos/telefono-facil.png'

const beneficios = [
  {
    icono: bolsaBeneficios,
    alt: 'Bolsa de compras con recompensa',
    titulo: 'Más beneficios',
    texto: 'Acumula Regis con tus compras.',
    clase: 'icono-bolsa',
  },
  {
    icono: monedaRegis,
    alt: 'Moneda oficial de los Regis',
    titulo: 'Premios increíbles',
    texto: 'Canjea descuentos, productos y más.',
    destacado: true,
    clase: 'icono-moneda',
  },
  {
    icono: comercioBarrio,
    alt: 'Comercio de barrio',
    titulo: 'Apoyas tu barrio',
    texto: 'Tus compras impulsan negocios locales.',
    clase: 'icono-comercio',
  },
  {
    icono: telefonoFacil,
    alt: 'Teléfono con confirmación',
    titulo: 'Fácil y gratuito',
    texto: 'Únete gratis como vecino.',
    clase: 'icono-telefono',
  },
]

function BarraBeneficios() {
  return (
    <section className="barra-beneficios" aria-label="Beneficios principales">
      <div className="contenedor barra-beneficios__contenido">
        {beneficios.map((beneficio, indice) => (
          <article
            className="barra-beneficios__item"
            key={beneficio.titulo}
            style={{ animationDelay: `${indice * 110 + 120}ms` }}
          >
            <div className={`barra-beneficios__icono ${beneficio.clase}`} aria-hidden="true">
              <img src={beneficio.icono} alt={beneficio.alt} />
            </div>

            <div className="barra-beneficios__texto">
              <h2 className={beneficio.destacado ? 'destacado' : ''}>
                {beneficio.titulo}
              </h2>
              <p>{beneficio.texto}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default BarraBeneficios
