import Encabezado from '../../componentes/Encabezado/Encabezado'
import Portada from '../../componentes/Portada/Portada'
import BarraBeneficios from '../../componentes/BarraBeneficios/BarraBeneficios'
import ComoFunciona from '../../componentes/ComoFunciona/ComoFunciona'
import SeccionVecinos from '../../componentes/SeccionVecinos/SeccionVecinos'
import SeccionComercios from '../../componentes/SeccionComercios/SeccionComercios'
import CintaCategorias from '../../componentes/CintaCategorias/CintaCategorias'
import SeccionNosotros from '../../componentes/SeccionNosotros/SeccionNosotros'
import PreguntasFrecuentes from '../../componentes/PreguntasFrecuentes/PreguntasFrecuentes'
import PiePagina from '../../componentes/PiePagina/PiePagina'
import BotonWhatsApp from '../../componentes/BotonWhatsApp/BotonWhatsApp'
import './Inicio.css'

function Inicio() {
  return (
    <div className="pagina-inicio">
      <Encabezado />

      <main>
        <Portada />
        <BarraBeneficios />
        <ComoFunciona />
        <SeccionVecinos />
        <SeccionComercios />
        <CintaCategorias />
        <SeccionNosotros />
        <PreguntasFrecuentes />
      </main>

      <PiePagina />
      <BotonWhatsApp />
    </div>
  )
}

export default Inicio
