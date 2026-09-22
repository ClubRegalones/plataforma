import { BrowserQRCodeReader } from '@zxing/browser'
import { useEffect, useRef, useState } from 'react'
import type { ConfiguracionDispositivoNegocio } from './lib/dispositivo'
import {
  listarBeneficiosCanjeNegocio,
  reservarCanjeLlaveroNegocio,
  type BeneficioCanjeNegocio,
  type CanjePendienteNegocio,
} from './lib/canjes'
import {
  resolverNfcNegocio,
  resolverQrNegocio,
  type ResultadoLecturaNfcNegocio,
  type LlaveroQrIdentificado,
} from './lib/lector-qr'
import './escanear-v1.css'

type MetodoLectura = 'qr' | 'llavero'

type VecinoIdentificado = {
  metodo: 'qr' | 'nfc'
  llaveroId: string
  tokenNfc: string | null
  codigoPublico: string
  nombreVecino: string
  disponibles: number
  reservados: number
  pendientes: number
  canjeados: number
  tienePin: boolean | null
}

type ControlesCamara = {
  stop: () => void
}

type RegistroNfc = {
  recordType?: string
  encoding?: string
  data?: DataView
}

type EventoLecturaNfc = {
  message: {
    records: RegistroNfc[]
  }
}

type LectorNfc = {
  scan: (opciones?: {
    signal?: AbortSignal
  }) => Promise<void>

  onreading:
    | ((evento: EventoLecturaNfc) => void)
    | null

  onreadingerror:
    | (() => void)
    | null
}

type ConstructorNfc = new () => LectorNfc

function convertirLlaveroQr(
  llavero: LlaveroQrIdentificado,
): VecinoIdentificado {
  return {
    metodo: 'qr',
    llaveroId: llavero.llavero_id,
    tokenNfc: null,
    codigoPublico: llavero.codigo_publico,
    nombreVecino:
      llavero.nombre_vecino?.trim() || 'Vecino',
    disponibles: llavero.disponibles,
    reservados: llavero.reservados,
    pendientes: llavero.pendientes,
    canjeados: llavero.canjeados,
    tienePin: null,
  }
}

function convertirLlaveroNfc(
  llavero: ResultadoLecturaNfcNegocio,
): VecinoIdentificado {
  return {
    metodo: 'nfc',
    llaveroId: llavero.llaveroId,
    tokenNfc: llavero.tokenNfc,
    codigoPublico: llavero.codigoPublico,
    nombreVecino: llavero.nombreVecino,
    disponibles: llavero.disponibles,
    reservados: llavero.reservados,
    pendientes: llavero.pendientes,
    canjeados: llavero.canjeados,
    tienePin: llavero.tienePin,
  }
}

function crearClaveIdempotenteCanje() {
  const identificador =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`

  return `canje-llavero-${identificador}`
}

function leerContenidoRegistroNfc(
  registros: RegistroNfc[],
) {
  for (const registro of registros) {
    if (!registro.data) continue

    try {
      const decoder = new TextDecoder(
        registro.encoding || 'utf-8',
      )

      const contenido =
        decoder.decode(registro.data).trim()

      if (contenido) return contenido
    } catch {
      continue
    }
  }

  return null
}

export default function EscanerQrNegocio({
  configuracion,
  turnoId,
  canjeEsperado,
  montoCanje,
  alCanjeEncontrado,
  alCanjeValidado,
  alCanjeLlaveroReservado,
  alVolver,
}: {
  configuracion: ConfiguracionDispositivoNegocio
  turnoId: string
  canjeEsperado: CanjePendienteNegocio | null
  montoCanje: string

  alCanjeEncontrado: (
    canjeId: string,
    tokenQr: string,
  ) => Promise<void> | void

  alCanjeValidado: (
    tokenQr: string,
  ) => void

  alCanjeLlaveroReservado: (
    canjeId: string,
  ) => Promise<void> | void

  alVolver: () => void
}) {
  const [metodo, setMetodo] =
    useState<MetodoLectura>('qr')

  const [error, setError] =
    useState<string | null>(null)

  const [estadoCamara, setEstadoCamara] =
    useState<
      'inactiva' |
      'solicitando' |
      'escaneando' |
      'validando' |
      'validado'
    >('inactiva')

  const [vecino, setVecino] =
    useState<VecinoIdentificado | null>(null)

  const [canjeValidado, setCanjeValidado] =
    useState(false)

  const [pasoLlavero, setPasoLlavero] =
    useState<'resultado' | 'beneficios' | 'pin'>(
      'resultado',
    )

  const [beneficios, setBeneficios] =
    useState<BeneficioCanjeNegocio[]>([])

  const [
    beneficioSeleccionado,
    setBeneficioSeleccionado,
  ] = useState<BeneficioCanjeNegocio | null>(null)

  const [cargandoBeneficios, setCargandoBeneficios] =
    useState(false)

  const [pinCanje, setPinCanje] =
    useState('')

  const [
    procesandoCanjeLlavero,
    setProcesandoCanjeLlavero,
  ] = useState(false)

  const idempotencyCanjeRef =
    useRef<string | null>(null)

  const videoRef =
    useRef<HTMLVideoElement | null>(null)

  const controlesRef =
    useRef<ControlesCamara | null>(null)

  const procesandoRef = useRef(false)

  const abortarNfcRef =
    useRef<AbortController | null>(null)

  const esValidacionCanje =
    Boolean(canjeEsperado)

  const detenerCamara = () => {
    controlesRef.current?.stop()
    controlesRef.current = null
  }

  const detenerNfc = () => {
    abortarNfcRef.current?.abort()
    abortarNfcRef.current = null
  }

  const limpiarResultado = () => {
    setVecino(null)
    setCanjeValidado(false)
    setPasoLlavero('resultado')
    setBeneficios([])
    setBeneficioSeleccionado(null)
    setPinCanje('')
    setProcesandoCanjeLlavero(false)
    idempotencyCanjeRef.current = null
    setError(null)
    procesandoRef.current = false
  }


  async function procesarQr(codigo: string) {
    if (procesandoRef.current) return

    procesandoRef.current = true
    setError(null)
    setEstadoCamara('validando')

    try {
      const resultado = await resolverQrNegocio(
        codigo,
        configuracion,
        turnoId,
      )

      // ------------------------------------------------------
      // VENIMOS DESDE REVISAR CANJE
      // ------------------------------------------------------

      if (canjeEsperado) {
        if (resultado.tipo !== 'canje') {
          throw new Error(
            'Este código corresponde a un llavero. Escanea el QR temporal del canje mostrado en App Vecino.',
          )
        }

        if (
          resultado.canje.canje_id !==
          canjeEsperado.canje_id
        ) {
          throw new Error(
            'Este QR pertenece a otro canje.',
          )
        }

        if (resultado.canje.estado !== 'reservado') {
          throw new Error(
            `Este canje está ${resultado.canje.estado}.`,
          )
        }

        detenerCamara()

        setCanjeValidado(true)
        setEstadoCamara('validado')

        alCanjeValidado(resultado.tokenQr)

        return
      }

      // ------------------------------------------------------
      // ESCANEO GENERAL · QR TEMPORAL DE CANJE
      // ------------------------------------------------------

      if (resultado.tipo === 'canje') {
        await alCanjeEncontrado(
          resultado.canje.canje_id,
          resultado.tokenQr,
        )

        detenerCamara()
        return
      }

      // ------------------------------------------------------
      // ESCANEO GENERAL · QR FÍSICO DE LLAVERO
      // ------------------------------------------------------

      detenerCamara()

      setVecino(
        convertirLlaveroQr(resultado.llavero),
      )

      setEstadoCamara('validado')
    } catch (capturado) {
      const mensaje =
        capturado instanceof Error
          ? capturado.message
          : 'No pudimos validar este QR.'

      setError(mensaje)

      // La cámara sigue disponible para intentar nuevamente.
      setEstadoCamara('escaneando')
      procesandoRef.current = false
    }
  }

  async function iniciarCamara() {

    if (
      metodo !== 'qr' ||
      !videoRef.current ||
      controlesRef.current
    ) {
      return
    }

    setError(null)
    setEstadoCamara('solicitando')

    try {
      const lector = new BrowserQRCodeReader()

      const controles =
        await lector.decodeFromConstraints(
          {
            video: {
              facingMode: {
                ideal: 'environment',
              },
            },
            audio: false,
          },
          videoRef.current,
          (resultado) => {
            if (!resultado) return

            void procesarQr(
              resultado.getText(),
            )
          },
        )

      controlesRef.current = controles
      setEstadoCamara('escaneando')
    } catch (capturado) {
      const mensaje =
        capturado instanceof Error
          ? capturado.message
          : 'No pudimos abrir la cámara.'

      setError(
        mensaje.includes('Permission') ||
        mensaje.includes('NotAllowed')
          ? 'Necesitamos permiso para usar la cámara.'
          : 'No pudimos abrir la cámara QR.',
      )

      setEstadoCamara('inactiva')
    }
  }

  async function iniciarNfc() {
    if (esValidacionCanje) {
      setError(
        'Este canje fue creado desde App Vecino y debe validarse con su QR temporal.',
      )
      return
    }

    detenerCamara()
    detenerNfc()
    limpiarResultado()

    const constructor =
      (
        window as unknown as {
          NDEFReader?: ConstructorNfc
        }
      ).NDEFReader

    if (!constructor) {
      setError(
        'Este equipo no permite leer NFC desde el navegador. Usa el QR impreso del llavero.',
      )
      return
    }

    const controlador = new AbortController()
    abortarNfcRef.current = controlador

    try {
      const lector = new constructor()

      lector.onreadingerror = () => {
        setError(
          'No pudimos leer el llavero. Intenta acercarlo nuevamente.',
        )
      }

      lector.onreading = (evento) => {
        if (procesandoRef.current) return

        const contenido =
          leerContenidoRegistroNfc(
            evento.message.records,
          )

        if (!contenido) {
          setError(
            'El llavero no contiene un identificador válido.',
          )
          return
        }

        procesandoRef.current = true

        void resolverNfcNegocio(
          contenido,
          configuracion,
          turnoId,
        )
          .then((resultado) => {
            setVecino(
              convertirLlaveroNfc(resultado),
            )

            setError(null)
            detenerNfc()
          })
          .catch((capturado) => {
            setError(
              capturado instanceof Error
                ? capturado.message
                : 'No pudimos identificar el llavero.',
            )

            procesandoRef.current = false
          })
      }

      await lector.scan({
        signal: controlador.signal,
      })
    } catch (capturado) {
      if (
        capturado instanceof DOMException &&
        capturado.name === 'AbortError'
      ) {
        return
      }

      setError(
        'No pudimos activar la lectura NFC.',
      )
    }
  }


  async function abrirBeneficiosCanje() {
    if (!vecino || cargandoBeneficios) return

    setPasoLlavero('beneficios')
    setCargandoBeneficios(true)
    setBeneficios([])
    setBeneficioSeleccionado(null)
    setPinCanje('')
    idempotencyCanjeRef.current = null
    setError(null)

    try {
      const actuales =
        await listarBeneficiosCanjeNegocio(
          configuracion,
          turnoId,
        )

      setBeneficios(actuales)
    } catch (capturado) {
      setError(
        capturado instanceof Error
          ? capturado.message
          : 'No pudimos cargar las recompensas.',
      )
    } finally {
      setCargandoBeneficios(false)
    }
  }

  function elegirBeneficio(
    beneficio: BeneficioCanjeNegocio,
  ) {
    setBeneficioSeleccionado(beneficio)
    setPinCanje('')
    setError(null)

    idempotencyCanjeRef.current =
      crearClaveIdempotenteCanje()

    setPasoLlavero('pin')
  }

  async function reservarCanjeConPin() {
    if (
      !vecino ||
      !beneficioSeleccionado ||
      procesandoCanjeLlavero
    ) {
      return
    }

    if (!/^[0-9]{4}$/.test(pinCanje)) {
      setError(
        'El PIN de seguridad debe tener exactamente 4 d\u00edgitos.',
      )
      return
    }

    if (!idempotencyCanjeRef.current) {
      idempotencyCanjeRef.current =
        crearClaveIdempotenteCanje()
    }

    setProcesandoCanjeLlavero(true)
    setError(null)

    try {
      const reserva =
        await reservarCanjeLlaveroNegocio(
          configuracion,
          turnoId,
          vecino.llaveroId,
          beneficioSeleccionado.id,
          pinCanje,
          idempotencyCanjeRef.current,
        )

      if (!reserva) {
        throw new Error(
          'Club Regalones no devolvi\u00f3 la reserva del canje.',
        )
      }

      if (!reserva.autorizado) {
        setError(
          reserva.mensaje ||
            'No pudimos autorizar el PIN.',
        )
        return
      }

      await alCanjeLlaveroReservado(
        reserva.canje_id,
      )
    } catch (capturado) {
      setError(
        capturado instanceof Error
          ? capturado.message
          : 'No pudimos reservar el canje.',
      )
    } finally {
      setProcesandoCanjeLlavero(false)
    }
  }


  const reiniciarQr = () => {
    detenerCamara()
    detenerNfc()
    limpiarResultado()
    setMetodo('qr')
    setEstadoCamara('inactiva')

    window.setTimeout(
      () => void iniciarCamara(),
      0,
    )
  }

  useEffect(() => {
    if (metodo !== 'qr') return

    const inicio = window.setTimeout(
      () => void iniciarCamara(),
      0,
    )

    return () => {
      window.clearTimeout(inicio)
      detenerCamara()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metodo, canjeEsperado?.canje_id])

  useEffect(() => {
    return () => {
      detenerCamara()
      detenerNfc()
    }
  }, [])

  if (
    vecino &&
    pasoLlavero === 'beneficios'
  ) {
    return (
      <section className="negocio-escaner negocio-escaner--resultado">

        <span className="negocio-escaner__eyebrow">
          Canje con llavero
        </span>

        <h1>Elige una recompensa</h1>

        <article className="negocio-escaner__vecino-card">
          <span className="negocio-escaner__avatar">
            {vecino.nombreVecino
              .charAt(0)
              .toUpperCase()}
          </span>

          <div>
            <strong>{vecino.nombreVecino}</strong>
            <small>
              {vecino.disponibles.toLocaleString(
                'es-CL',
              )}{' '}
              REGIS disponibles
            </small>
          </div>
        </article>

        {cargandoBeneficios ? (
          <p className="negocio-escaner__proximo">
            Cargando recompensas...
          </p>
        ) : beneficios.length > 0 ? (
          <div className="negocio-escaner__beneficios">
            {beneficios.map((beneficio) => {
              const sinSaldo =
                beneficio.costo_regis >
                vecino.disponibles

              return (
                <button
                  key={beneficio.id}
                  className="negocio-escaner__beneficio"
                  type="button"
                  disabled={
                    sinSaldo ||
                    procesandoCanjeLlavero
                  }
                  onClick={() =>
                    elegirBeneficio(beneficio)
                  }
                >
                  <div>
                    <strong>
                      {beneficio.nombre}
                    </strong>

                    <small>
                      {beneficio.descripcion}
                    </small>

                    <small>
                      Compra m\u00ednima: $
                      {beneficio.compra_minima_clp
                        .toLocaleString('es-CL')}
                    </small>
                  </div>

                  <b>
                    {beneficio.costo_regis
                      .toLocaleString('es-CL')}
                    {' REGIS'}
                  </b>

                  {sinSaldo && (
                    <em>Saldo insuficiente</em>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="negocio-escaner__proximo">
            Este negocio no tiene recompensas
            disponibles en este momento.
          </p>
        )}

        {error && (
          <div
            className="negocio-escaner__error"
            role="alert"
          >
            {error}
          </div>
        )}

        <button
          className="negocio-escaner__secundario"
          type="button"
          onClick={() => {
            setPasoLlavero('resultado')
            setError(null)
          }}
        >
          Volver
        </button>

      </section>
    )
  }

  if (
    vecino &&
    pasoLlavero === 'pin' &&
    beneficioSeleccionado
  ) {
    return (
      <section className="negocio-escaner negocio-escaner--resultado">

        <span className="negocio-escaner__eyebrow">
          Autorizar canje
        </span>

        <h1>PIN de seguridad</h1>

        <article className="negocio-escaner__vecino-card">
          <span className="negocio-escaner__avatar">
            {vecino.nombreVecino
              .charAt(0)
              .toUpperCase()}
          </span>

          <div>
            <strong>{vecino.nombreVecino}</strong>
            <small>
              {beneficioSeleccionado.nombre}
            </small>
          </div>
        </article>

        <article className="negocio-escaner__pin-card">
          <small>Recompensa seleccionada</small>

          <strong>
            {beneficioSeleccionado.nombre}
          </strong>

          <span>
            {beneficioSeleccionado.costo_regis
              .toLocaleString('es-CL')}
            {' REGIS'}
          </span>
        </article>

        <label className="negocio-escaner__pin">
          <span>
            PIN de seguridad del llavero
          </span>

          <input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pinCanje}
            onChange={(evento) =>
              setPinCanje(
                evento.target.value
                  .replace(/\\D/g, '')
                  .slice(0, 4),
              )
            }
            aria-label="PIN de seguridad"
          />

          <small>
            El vecino debe ingresar sus 4 d\u00edgitos.
          </small>
        </label>

        {error && (
          <div
            className="negocio-escaner__error"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="negocio-escaner__acciones-vecino">
          <button
            className="negocio-escaner__principal"
            type="button"
            disabled={
              pinCanje.length !== 4 ||
              procesandoCanjeLlavero
            }
            onClick={() =>
              void reservarCanjeConPin()
            }
          >
            {procesandoCanjeLlavero
              ? 'Autorizando...'
              : 'Confirmar PIN'}
          </button>

          <button
            className="negocio-escaner__secundario"
            type="button"
            disabled={procesandoCanjeLlavero}
            onClick={() => {
              setPasoLlavero('beneficios')
              setBeneficioSeleccionado(null)
              setPinCanje('')
              idempotencyCanjeRef.current = null
              setError(null)
            }}
          >
            Volver
          </button>
        </div>

        <p className="negocio-escaner__seguridad">
          El QR o NFC solo identifica al vecino.
          El gasto de REGIS requiere su PIN.
        </p>

      </section>
    )
  }

  if (vecino) {
    return (
      <section className="negocio-escaner negocio-escaner--resultado">

        <div className="negocio-escaner__encontrado-check">
          ?
        </div>

        <span className="negocio-escaner__eyebrow">
          Identificaci\u00f3n correcta
        </span>

        <h1>Vecino encontrado</h1>

        <article className="negocio-escaner__vecino-card">
          <span className="negocio-escaner__avatar">
            {vecino.nombreVecino
              .charAt(0)
              .toUpperCase()}
          </span>

          <div>
            <strong>{vecino.nombreVecino}</strong>

            <small>
              Llavero {vecino.codigoPublico}
            </small>
          </div>
        </article>

        <article className="negocio-escaner__saldo">
          <small>REGIS disponibles</small>

          <strong>
            {vecino.disponibles.toLocaleString(
              'es-CL',
            )}
          </strong>

          <span>REGIS</span>
        </article>

        <p className="negocio-escaner__metodo-ok">
          Identificado por{' '}
          {vecino.metodo === 'nfc'
            ? 'NFC'
            : 'QR del llavero'}
        </p>

        <div className="negocio-escaner__acciones-vecino">
          <button
            className="negocio-escaner__principal"
            type="button"
            onClick={() =>
              void abrirBeneficiosCanje()
            }
          >
            Canjear beneficio
          </button>

          <button
            className="negocio-escaner__secundario"
            type="button"
            onClick={reiniciarQr}
          >
            Escanear otro
          </button>
        </div>

        <p className="negocio-escaner__seguridad">
          Para gastar REGIS siempre pediremos
          el PIN de seguridad del vecino.
        </p>

      </section>
    )
  }

  if (canjeValidado && canjeEsperado) {
    return (
      <section className="negocio-escaner negocio-escaner--resultado">

        <div className="negocio-escaner__encontrado-check">
          ✓
        </div>

        <span className="negocio-escaner__eyebrow">
          QR válido
        </span>

        <h1>Canje validado</h1>

        <article className="negocio-escaner__vecino-card">

          <span className="negocio-escaner__avatar">
            {canjeEsperado.nombre_vecino
              ?.charAt(0)
              .toUpperCase() || 'V'}
          </span>

          <div>
            <strong>
              {canjeEsperado.nombre_vecino ||
                'Vecino'}
            </strong>

            <small>
              {canjeEsperado.nombre_beneficio}
            </small>
          </div>

        </article>

        <article className="negocio-escaner__saldo">
          <small>Monto de compra</small>

          <strong>
            ${Number(montoCanje || 0)
              .toLocaleString('es-CL')}
          </strong>

          <span>
            {canjeEsperado.costo_regis.toLocaleString(
              'es-CL',
            )}{' '}
            REGIS reservados
          </span>
        </article>

        <p className="negocio-escaner__seguridad">
          El QR fue validado por Club Regalones.
          Todavía no se ha confirmado ni gastado
          ningún REGI.
        </p>

        <button
          className="negocio-escaner__secundario"
          type="button"
          onClick={alVolver}
        >
          Volver
        </button>

      </section>
    )
  }

  return (
    <section className="negocio-escaner">

      <header className="negocio-escaner__cabecera">
        <span className="negocio-escaner__eyebrow">
          {esValidacionCanje
            ? 'Validación de canje'
            : 'Identificar vecino'}
        </span>

        <h1>
          {esValidacionCanje
            ? 'Escanear QR'
            : 'Escanear'}
        </h1>

        <p>
          {esValidacionCanje
            ? `Escanea el QR temporal que ${canjeEsperado?.nombre_vecino || 'el vecino'} muestra en App Vecino.`
            : 'Escanea el QR del vecino o acerca su llavero.'}
        </p>
      </header>

      {canjeEsperado && (
        <article className="negocio-escaner__contexto-canje">

          <span>
            {canjeEsperado.nombre_vecino
              ?.charAt(0)
              .toUpperCase() || 'V'}
          </span>

          <div>
            <strong>
              {canjeEsperado.nombre_vecino ||
                'Vecino'}
            </strong>

            <small>
              {canjeEsperado.nombre_beneficio}
              {' · '}
              {canjeEsperado.costo_regis}
              {' REGIS'}
            </small>
          </div>

        </article>
      )}

      <div className="negocio-escaner__selector">

        <button
          className={
            metodo === 'qr'
              ? 'activo'
              : ''
          }
          type="button"
          onClick={() => {
            detenerNfc()
            limpiarResultado()
            setMetodo('qr')
          }}
        >
          QR
        </button>

        <button
          className={
            metodo === 'llavero'
              ? 'activo'
              : ''
          }
          type="button"
          disabled={esValidacionCanje}
          onClick={() => {
            detenerCamara()
            limpiarResultado()
            setMetodo('llavero')

            window.setTimeout(
              () => void iniciarNfc(),
              0,
            )
          }}
        >
          Llavero
        </button>

      </div>

      {metodo === 'qr' ? (
        <div className="negocio-escaner__camara">

          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
          />

          <div
            className="negocio-escaner__marco"
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
            <i />
          </div>

          <div
            className="negocio-escaner__regalon"
            aria-hidden="true"
          />

          {estadoCamara === 'solicitando' && (
            <span className="negocio-escaner__estado">
              Abriendo cámara…
            </span>
          )}

          {estadoCamara === 'validando' && (
            <span className="negocio-escaner__estado">
              QR leído · Validando con Club Regalones…
            </span>
          )}

          {estadoCamara === 'escaneando' && (
            <span className="negocio-escaner__estado">
              Escaneando automáticamente…
            </span>
          )}

        </div>
      ) : (
        <div className="negocio-escaner__nfc">

          <div className="negocio-escaner__nfc-icono">
            )))
          </div>

          <strong>Acerca el llavero</strong>

          <p>
            Mantén el llavero junto al teléfono
            hasta que Club Regalones lo identifique.
          </p>

          <button
            type="button"
            onClick={() => void iniciarNfc()}
          >
            Leer NFC
          </button>

          <small>
            Si el NFC no funciona, vuelve a QR y
            escanea el código impreso del llavero.
          </small>

        </div>
      )}

      {error && (
        <div
          className="negocio-escaner__error"
          role="alert"
        >
          {error}
        </div>
      )}

      <button
        className="negocio-escaner__volver"
        type="button"
        onClick={alVolver}
      >
        Volver
      </button>

    </section>
  )
}
