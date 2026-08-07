import './ComoFunciona.css'

const pasosVecinos = [
  ['01', 'Regístrate gratis', 'Crea tu cuenta de vecino desde cualquier celular.'],
  ['02', 'Compra', 'Realiza tu compra normalmente en un Comercio Regalón.'],
  ['03', 'Acerca tu celular', 'Toca el tótem NFC o escanea su código QR.'],
  ['04', 'Ingresa el monto', 'Escribe el total indicado en tu boleta.'],
  ['05', 'El negocio confirma', 'El cajero revisa la información antes de aprobarla.'],
  ['06', 'Acumula tus Regis', 'Los puntos se agregan automáticamente a tu cuenta.'],
  ['07', 'Canjea y disfruta', 'Usa tus Regis para premios, descuentos y beneficios.'],
]

const pasosNegocios = [
  ['01', 'Elige tu plan', 'Selecciona la opción adecuada para tu comercio.'],
  [
    '02',
    'Define cómo premiarás',
    'Configuramos contigo la acumulación de Regis y tus primeros beneficios.',
  ],
  ['03', 'Confirma las compras', 'Valida las solicitudes desde la terminal del negocio.'],
  ['04', 'Conoce los resultados', 'Revisa actividad, clientes frecuentes y canjes.'],
  ['05', 'Crea campañas', 'Lanza promociones que motiven a tus clientes a volver.'],
]

function ListaPasos({
  titulo,
  descripcion,
  pasos,
}: {
  titulo: string
  descripcion: string
  pasos: string[][]
}) {
  return (
    <article className="como-funciona__panel">
      <header>
        <h3>{titulo}</h3>
        <p>{descripcion}</p>
      </header>

      <ol>
        {pasos.map(([numero, nombre, texto]) => (
          <li key={numero}>
            <span>{numero}</span>
            <div>
              <h4>{nombre}</h4>
              <p>{texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </article>
  )
}

function ComoFunciona() {
  return (
    <section className="como-funciona" id="como-funciona">
      <div className="contenedor">
        <div className="como-funciona__encabezado">
          <div>
            <span className="etiqueta-seccion">Simple y cercano</span>
            <h2 className="titulo-seccion">Así funciona Club Regalones</h2>
          </div>

          <p className="texto-seccion">
            Un sistema pensado para que vecinos y comercios se conecten de forma
            fácil, segura y sin cambiar la manera habitual de comprar.
          </p>
        </div>

        <div className="como-funciona__grilla">
          <ListaPasos
            titulo="Para vecinos"
            descripcion="Regístrate, compra, acumula y disfruta."
            pasos={pasosVecinos}
          />

          <ListaPasos
            titulo="Para negocios"
            descripcion="Premia la preferencia y conoce mejor a tus clientes."
            pasos={pasosNegocios}
          />
        </div>
      </div>
    </section>
  )
}

export default ComoFunciona
