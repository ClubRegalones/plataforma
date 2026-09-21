import { BrowserQRCodeReader } from '@zxing/browser'
import { useEffect, useRef, useState } from 'react'
import type { ConfiguracionDispositivoNegocio } from './lib/dispositivo'
import type { CanjePendienteNegocio } from './lib/canjes'
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
    codigoPublico: llavero.codigoPublico,
    nombreVecino: llavero.nombreVecino,
    disponibles: llavero.disponibles,
    reservados: llavero.reservados,
    pendientes: llavero.pendientes,
    canjeados: llavero.canjeados,
    tienePin: llavero.tienePin,
  }
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
            'Este c?digo corresponde a un llavero. Escanea el QR temporal del canje mostrado en App Vecino.',
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
            `Este canje est? ${resultado.canje.estado}.`,
          )
        }

        detenerCamara()

        setCanjeValidado(true)
        setEstadoCamara('validado')

        alCanjeValidado(resultado.tokenQr)

        return
      }

      // ------------------------------------------------------
      // ESCANEO GENERAL ? QR TEMPORAL DE CANJE
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
      // ESCANEO GENERAL ? QR F?SICO DE LLAVERO
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

      // La c?mara sigue disponible para intentar nuevamente.
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

  if (vecino) {
    return (
      <section className="negocio-escaner negocio-escaner--resultado">

        <div className="negocio-escaner__encontrado-check">
          ✓
        </div>

        <span className="negocio-escaner__eyebrow">
          Identificación correcta
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
            {vecino.disponibles.toLocaleString('es-CL')}
          </strong>

          <span>REGIS</span>

        </article>

        <p className="negocio-escaner__metodo-ok">
          Identificado por{' '}
          {vecino.metodo === 'nfc'
            ? 'NFC'
            : 'QR del llavero'}
        </p>

        <button
          className="negocio-escaner__secundario"
          type="button"
          onClick={reiniciarQr}
        >
          Escanear otro
        </button>

        <p className="negocio-escaner__proximo">
          Ahora podemos continuar con Registrar compra
          o Canjear beneficio.
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
              QR le?do ? Validando con Club Regalones?
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