import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import registro from '../../recursos/como-funciona/registro.png'
import comercio from '../../recursos/como-funciona/comercio.png'
import totem from '../../recursos/como-funciona/totem.png'
import terminalAprobado from '../../recursos/como-funciona/terminal-caja-aprobado.svg'
import monedaRegis from '../../recursos/como-funciona/moneda-regis.png'
import regalo from '../../recursos/como-funciona/regalo.svg'
import regalonCaminando from '../../recursos/como-funciona/regalon-caminando.png'
import plan from '../../recursos/como-funciona/plan.svg'
import reportes from '../../recursos/como-funciona/reportes.svg'
import fondoBarrio from '../../recursos/como-funciona/fondo-barrio-como-funciona.png'
import './ComoFunciona.css'

type Modo = 'vecino' | 'negocio'

type Paso = {
  titulo: string
  descripcion: string
  imagen: string
  alt: string
  animacion: string
}

const recorridos: Record<Modo, Paso[]> = {
  vecino: [
    {
      titulo: 'Regístrate gratis',
      descripcion: 'Crea tu cuenta de vecino desde cualquier celular.',
      imagen: registro,
      alt: 'Celular con registro confirmado',
      animacion: 'pulso',
    },
    {
      titulo: 'Compra en un Comercio Regalón',
      descripcion: 'Realiza tu compra normalmente en un negocio del club.',
      imagen: comercio,
      alt: 'Comercio de barrio',
      animacion: 'sube',
    },
    {
      titulo: 'Acerca tu celular',
      descripcion: 'Usa el tótem NFC o escanea su código QR.',
      imagen: totem,
      alt: 'Tótem NFC y QR de Club Regalones',
      animacion: 'senal',
    },
    {
      titulo: 'El comercio confirma',
      descripcion: 'Ingresa el monto y el cajero valida la información.',
      imagen: terminalAprobado,
      alt: 'Pantalla de caja con compra aprobada',
      animacion: 'confirma',
    },
    {
      titulo: 'Recibe tus Regis',
      descripcion: 'Tus Regis quedan guardados en tu cuenta.',
      imagen: monedaRegis,
      alt: 'Moneda oficial de los Regis',
      animacion: 'moneda',
    },
    {
      titulo: 'Canjea y disfruta',
      descripcion: 'Úsalos en descuentos, productos y otros beneficios.',
      imagen: regalo,
      alt: 'Regalo con moneda Regis',
      animacion: 'regalo',
    },
  ],

  negocio: [
    {
      titulo: 'Suma tu negocio',
      descripcion: 'Registra tu comercio y forma parte del club.',
      imagen: comercio,
      alt: 'Comercio de barrio',
      animacion: 'sube',
    },
    {
      titulo: 'Elige tu plan',
      descripcion: 'Selecciona el plan adecuado para tu cantidad de clientes.',
      imagen: plan,
      alt: 'Plan para comercios',
      animacion: 'pulso',
    },
    {
      titulo: 'Recibe solicitudes',
      descripcion: 'Cada uso del tótem aparece en la terminal del negocio.',
      imagen: totem,
      alt: 'Tótem NFC y QR',
      animacion: 'senal',
    },
    {
      titulo: 'Confirma las compras',
      descripcion: 'Aprueba, corrige o rechaza el monto según la boleta.',
      imagen: terminalAprobado,
      alt: 'Pantalla de caja con operación aprobada',
      animacion: 'confirma',
    },
    {
      titulo: 'Premia a tus clientes',
      descripcion: 'Entrega Regis y crea razones para que vuelvan.',
      imagen: monedaRegis,
      alt: 'Moneda Regis',
      animacion: 'moneda',
    },
    {
      titulo: 'Revisa tus resultados',
      descripcion: 'Consulta actividad, clientes frecuentes y reportes.',
      imagen: reportes,
      alt: 'Panel de reportes del comercio',
      animacion: 'reporte',
    },
  ],
}

/*
  Posiciones de la mascota:

  1. Antes de la card 1.
  2. Entre las cards 1 y 2.
  3. Entre las cards 2 y 3.
  4. Entre las cards 3 y 4.
  5. Entre las cards 4 y 5.
  6. Entre las cards 5 y 6.
  7. Después de la card 6.
*/
const posicionesMascota = [
  -0.5,
  16.7,
  33.35,
  50,
  66.65,
  83.3,
  101,
]

function ComoFunciona() {
  const [modo, setModo] = useState<Modo>('vecino')
  const [pasoActivo, setPasoActivo] = useState(0)
  const [recorridoFinalizado, setRecorridoFinalizado] = useState(false)
  const [pausado, setPausado] = useState(false)
  const [enVista, setEnVista] = useState(false)

  const seccionRef = useRef<HTMLElement>(null)

  const pasos = recorridos[modo]

  /*
    Mientras recorre los seis pasos, el progreso sigue cada número.
    Al finalizar, llega al 100% para extender la línea hacia la flecha.
  */
  const porcentajeNormal =
    ((pasoActivo + 0.5) / pasos.length) * 100

  const porcentaje = recorridoFinalizado
    ? 100
    : porcentajeNormal

  /*
    El estado recorridoFinalizado utiliza la séptima posición,
    ubicada después de la última card.
  */
  const indiceMascota = recorridoFinalizado
    ? posicionesMascota.length - 1
    : pasoActivo

  const posicionMascota =
    posicionesMascota[indiceMascota]

  const estiloRuta = useMemo(
    () =>
      ({
        '--progreso-ruta': `${porcentaje}%`,
        '--posicion-mascota': `${posicionMascota}%`,
      }) as CSSProperties,
    [porcentaje, posicionMascota],
  )

  /*
    Detecta cuándo la sección está visible para iniciar
    el recorrido automático.
  */
  useEffect(() => {
    const seccion = seccionRef.current

    if (!seccion) return

    const observador = new IntersectionObserver(
      ([entrada]) => {
        setEnVista(entrada.isIntersecting)
      },
      {
        threshold: 0.28,
      },
    )

    observador.observe(seccion)

    return () => {
      observador.disconnect()
    }
  }, [])

  /*
    Avance automático:

    - Recorre los seis pasos.
    - Permanece en el paso 6 durante 3,9 segundos.
    - Luego mueve al Regalón después de la card 6.
    - No vuelve automáticamente al inicio.
  */
  useEffect(() => {
    const reducirMovimiento = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    if (
      !enVista ||
      pausado ||
      reducirMovimiento ||
      recorridoFinalizado
    ) {
      return
    }

    const temporizador = window.setTimeout(() => {
      if (pasoActivo < pasos.length - 1) {
        setPasoActivo((actual) => actual + 1)
        return
      }

      setRecorridoFinalizado(true)
    }, 3900)

    return () => {
      window.clearTimeout(temporizador)
    }
  }, [
    enVista,
    pausado,
    pasoActivo,
    pasos.length,
    recorridoFinalizado,
  ])

  const irAlPaso = (indice: number) => {
    const indiceSeguro = Math.max(
      0,
      Math.min(pasos.length - 1, indice),
    )

    setRecorridoFinalizado(false)
    setPasoActivo(indiceSeguro)
  }

  const avanzar = () => {
    /*
      Desde el paso 6, una nueva pulsación mueve al Regalón
      después de la última card.
    */
    if (pasoActivo === pasos.length - 1) {
      setRecorridoFinalizado(true)
      return
    }

    irAlPaso(pasoActivo + 1)
  }

  const retroceder = () => {
    /*
      Desde la posición final, vuelve primero al espacio
      entre las cards 5 y 6.
    */
    if (recorridoFinalizado) {
      setRecorridoFinalizado(false)
      return
    }

    irAlPaso(pasoActivo - 1)
  }

  const manejarTeclado = (
    evento: KeyboardEvent<HTMLElement>,
  ) => {
    if (evento.key === 'ArrowRight') {
      evento.preventDefault()
      avanzar()
    }

    if (evento.key === 'ArrowLeft') {
      evento.preventDefault()
      retroceder()
    }

    if (evento.key === 'Home') {
      evento.preventDefault()
      irAlPaso(0)
    }

    if (evento.key === 'End') {
      evento.preventDefault()
      setPasoActivo(pasos.length - 1)
      setRecorridoFinalizado(true)
    }
  }

  const cambiarModo = (nuevoModo: Modo) => {
    setModo(nuevoModo)
    setPasoActivo(0)
    setRecorridoFinalizado(false)
  }

  return (
    <section
      className={`como-funciona como-funciona--${modo}`}
      id="como-funciona"
      ref={seccionRef}
      tabIndex={0}
      aria-label="Recorrido interactivo de cómo funciona Club Regalones. Usa las flechas izquierda y derecha para cambiar de paso."
      onKeyDown={manejarTeclado}
      onPointerDown={(evento) =>
        evento.currentTarget.focus()
      }
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={(evento) => {
        const siguienteFoco =
          evento.relatedTarget as Node | null

        if (
          !evento.currentTarget.contains(siguienteFoco)
        ) {
          setPausado(false)
        }
      }}
    >
      <img
        className="como-funciona__fondo"
        src={fondoBarrio}
        alt=""
        aria-hidden="true"
      />

      <div
        className="como-funciona__brillo"
        aria-hidden="true"
      />

      <div className="contenedor como-funciona__contenido">
        <header className="como-funciona__encabezado">
          <span className="como-funciona__etiqueta">
            Elegir local es muy simple{' '}
            <b aria-hidden="true">♥</b>
          </span>

          <h2>
            Así funciona{' '}
            <span>Club Regalones</span>
          </h2>

          <p>
            {modo === 'vecino'
              ? 'Premiamos tus compras en el barrio y ayudamos a fortalecer los comercios locales. Acumula Regis, canjea beneficios y hagamos del barrio un lugar mejor para todos.'
              : 'Suma tu negocio, confirma las compras de tus clientes y transforma cada visita en una experiencia más cercana y memorable.'}
          </p>
        </header>

        <div
          className="como-funciona__selector"
          role="tablist"
          aria-label="Elige tu recorrido"
        >
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'vecino'}
            className={
              modo === 'vecino' ? 'activo' : ''
            }
            onClick={() => cambiarModo('vecino')}
          >
            <span
              className="como-funciona__selector-icono"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="8"
                  r="3.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />

                <path
                  d="M5.5 20c.5-4 2.8-6 6.5-6s6 2 6.5 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>

            Soy vecino
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={modo === 'negocio'}
            className={
              modo === 'negocio' ? 'activo' : ''
            }
            onClick={() => cambiarModo('negocio')}
          >
            <span
              className="como-funciona__selector-icono"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M4 10h16v10H4zM3 10l2-6h14l2 6M8 20v-6h5v6"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />

                <path
                  d="M3 10c0 1.5 1 2.5 2.5 2.5S8 11.5 8 10c0 1.5 1 2.5 2.5 2.5S13 11.5 13 10c0 1.5 1 2.5 2.5 2.5S18 11.5 18 10c0 1.5 1 2.5 2.5 2.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </span>

            Tengo un negocio
          </button>
        </div>

        <div
          className="como-funciona__experiencia"
          style={estiloRuta}
        >
          <p
            className="como-funciona__estado"
            aria-live="polite"
          >
            {recorridoFinalizado
              ? `Recorrido completado: ${pasos[pasos.length - 1].titulo}`
              : `Paso ${pasoActivo + 1} de ${pasos.length}: ${pasos[pasoActivo].titulo}`}
          </p>

          <div className="como-funciona__tarjetas">
            {pasos.map((paso, indice) => {
              const activa =
                indice === pasoActivo

              const visitada =
                indice < pasoActivo

              /*
                Cuando el recorrido termina, las cards vuelven
                a su posición original y dejan libre el extremo.
              */
              const abreIzquierda =
                !recorridoFinalizado &&
                indice === pasoActivo - 1

              const abreDerecha =
                !recorridoFinalizado &&
                indice === pasoActivo

              const apertura = abreIzquierda
                ? -10
                : abreDerecha
                  ? 55
                  : 0

              /*
                Se mantiene en 0 para que ninguna card quede
                levantada o parezca más corta que las demás.
              */
              const elevacion = 0

              return (
                <button
                  type="button"
                  className={`como-funciona__tarjeta${
                    activa ? ' activa' : ''
                  }${
                    visitada ? ' visitada' : ''
                  }${
                    abreIzquierda
                      ? ' abre-izquierda'
                      : ''
                  }${
                    abreDerecha
                      ? ' abre-derecha'
                      : ''
                  }`}
                  key={`${modo}-${paso.titulo}`}
                  onClick={() => irAlPaso(indice)}
                  aria-pressed={activa}
                  style={
                    {
                      '--demora': `${indice * 90}ms`,
                      '--apertura-x': `${apertura}px`,
                      '--elevacion-y': `${elevacion}px`,
                    } as CSSProperties
                  }
                >
                  <span
                    className="como-funciona__numero-movil"
                    aria-hidden="true"
                  >
                    {indice + 1}
                  </span>

                  <span className="como-funciona__tarjeta-titulo">
                    {paso.titulo}
                  </span>

                  <span className="como-funciona__tarjeta-texto">
                    {paso.descripcion}
                  </span>

                  <span
                    className={`como-funciona__ilustracion como-funciona__ilustracion--${paso.animacion}`}
                  >
                    <img
                      src={paso.imagen}
                      alt={paso.alt}
                      data-icono={indice + 1}
                    />
                  </span>
                </button>
              )
            })}
          </div>

          <img
            className="como-funciona__mascota"
            src={regalonCaminando}
            alt="El Regalón recorriendo los pasos"
          />

          <div className="como-funciona__ruta">
            <div
              className="como-funciona__ruta-base"
              aria-hidden="true"
            />

            <div
              className="como-funciona__ruta-progreso"
              aria-hidden="true"
            />

            {pasos.map((paso, indice) => (
              <button
                type="button"
                className={`como-funciona__punto${
                  indice === pasoActivo
                    ? ' activo'
                    : ''
                }${
                  indice < pasoActivo
                    ? ' visitado'
                    : ''
                }`}
                key={`punto-${modo}-${paso.titulo}`}
                onClick={() => irAlPaso(indice)}
                aria-label={`Ir al paso ${indice + 1}: ${paso.titulo}`}
              >
                {indice + 1}
              </button>
            ))}

            <button
              type="button"
              className="como-funciona__control como-funciona__control--anterior"
              onClick={retroceder}
              disabled={
                pasoActivo === 0 &&
                !recorridoFinalizado
              }
              aria-label="Ir al paso anterior"
            >
              ←
            </button>

            <button
              type="button"
              className="como-funciona__control como-funciona__control--siguiente"
              onClick={avanzar}
              disabled={recorridoFinalizado}
              aria-label={
                pasoActivo === pasos.length - 1
                  ? 'Finalizar el recorrido'
                  : 'Ir al paso siguiente'
              }
            >
              →
            </button>
          </div>
        </div>

        <div className="como-funciona__resumen">
          <div>
            <span aria-hidden="true">✚</span>

            <p>
              <strong>Es gratis y seguro</strong>
              Tus datos siempre protegidos.
            </p>
          </div>

          <div>
            <span aria-hidden="true">◷</span>

            <p>
              <strong>Rápido y fácil</strong>
              Todo en menos de 10 segundos.
            </p>
          </div>

          <div>
            <span aria-hidden="true">♡</span>

            <p>
              <strong>Beneficia a tu barrio</strong>
              Cada compra impulsa lo local.
            </p>
          </div>
        </div>

        <p className="como-funciona__ayuda">
          Haz clic en un paso o usa
          <kbd>←</kbd>
          <kbd>→</kbd>
          para recorrer la experiencia
        </p>
      </div>
    </section>
  )
}

export default ComoFunciona