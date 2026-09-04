import type { Tables } from '@club-regalones/domain'
import type { FormEvent } from 'react'
import { useRef, useState } from 'react'
import { useSesion } from '../../hooks/useSesion'
import { mensajeSupabase } from '../../lib/mensajesSupabase'
import { supabase } from '../../lib/supabase'
import './SolicitudCompra.css'

type Solicitud = Tables<'solicitudes_compra'>

type SolicitudCompraProps = {
  tokenInicial: string | null
}

function formatearMonto(monto: number | null) {
  if (monto === null) return 'Pendiente'

  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(monto)
}

function mensajeEstado(solicitud: Solicitud) {
  switch (solicitud.estado) {
    case 'esperando_monto':
      return solicitud.motivo_correccion
        ? 'El cajero necesita que vuelvas a escribir el monto.'
        : 'El cajero ingresará el monto para ayudarte.'
    case 'esperando_cajero':
      return 'El monto fue enviado. El cajero debe revisarlo y aprobarlo.'
    case 'pendiente_validacion':
      return 'El cajero corrigió el monto y debe completar la aprobación.'
    case 'aprobada':
      return 'La compra fue aprobada correctamente.'
    case 'rechazada':
      return `La solicitud fue rechazada: ${solicitud.motivo_rechazo ?? 'sin motivo'}.`
    case 'vencida':
      return 'La solicitud venció antes de ser aprobada.'
    case 'cancelada':
      return 'La solicitud fue cancelada.'
  }
}

function SolicitudCompra({ tokenInicial }: SolicitudCompraProps) {
  const { sesion, cargando } = useSesion()
  const [token, setToken] = useState(tokenInicial ?? '')
  const [monto, setMonto] = useState('')
  const [necesitaAyuda, setNecesitaAyuda] = useState(false)
  const [montoReingresado, setMontoReingresado] = useState('')
  const [minutos, setMinutos] = useState('10')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const idempotencyKey = useRef(crypto.randomUUID())

  const continuar = encodeURIComponent(
    `compra${token ? `?token=${encodeURIComponent(token)}` : ''}`,
  )

  const crearSolicitud = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setProcesando(true)
    setError(null)

    const montoNumerico = Number(monto)
    const minutosNumericos = Number(minutos)

    if (
      (!necesitaAyuda &&
        (!Number.isInteger(montoNumerico) || montoNumerico <= 0)) ||
      !Number.isInteger(minutosNumericos) ||
      minutosNumericos <= 0
    ) {
      setError('Ingresa un monto y una vigencia válidos.')
      setProcesando(false)
      return
    }

    const expiraEn = new Date(
      Date.now() + minutosNumericos * 60_000,
    ).toISOString()

    const { data, error: errorSolicitud } = await supabase.rpc(
      'crear_solicitud_compra',
      {
        p_token: token.trim(),
        p_idempotency_key: idempotencyKey.current,
        p_expira_en: expiraEn,
        ...(necesitaAyuda ? {} : { p_monto_informado: montoNumerico }),
      },
    )

    setProcesando(false)

    if (errorSolicitud) {
      setError(mensajeSupabase(errorSolicitud))
      return
    }

    setSolicitud(data)
  }

  const actualizarSolicitud = async () => {
    if (!solicitud) return

    setProcesando(true)
    setError(null)

    const { data, error: errorConsulta } = await supabase
      .from('solicitudes_compra')
      .select('*')
      .eq('id', solicitud.id)
      .single()

    setProcesando(false)

    if (errorConsulta) {
      setError(mensajeSupabase(errorConsulta))
      return
    }

    setSolicitud(data)
  }

  const reenviarMonto = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!solicitud) return

    const montoNumerico = Number(montoReingresado)
    if (!Number.isInteger(montoNumerico) || montoNumerico <= 0) {
      setError('El monto debe ser un número entero mayor que cero.')
      return
    }

    setProcesando(true)
    setError(null)

    const { data, error: errorMonto } = await supabase.rpc(
      'informar_monto_vecino',
      {
        p_solicitud_id: solicitud.id,
        p_monto: montoNumerico,
      },
    )

    setProcesando(false)

    if (errorMonto) {
      setError(mensajeSupabase(errorMonto))
      return
    }

    setSolicitud(data)
    setMontoReingresado('')
  }

  const comenzarOtra = () => {
    idempotencyKey.current = crypto.randomUUID()
    setSolicitud(null)
    setMonto('')
    setMontoReingresado('')
    setNecesitaAyuda(false)
    setError(null)
  }

  return (
    <main className="solicitud-compra">
      <section
        className="solicitud-compra__tarjeta"
        aria-labelledby="titulo-solicitud"
      >
        <a className="solicitud-compra__volver" href="#inicio">
          ← Volver al inicio
        </a>
        <span className="solicitud-compra__etiqueta">Compra postpago</span>
        <h1 id="titulo-solicitud">Solicita la validación de tu compra</h1>
        <p>
          Escribe el monto que pagaste. El cajero lo revisará antes de aprobar
          la compra y todavía no se acreditarán REGIS.
        </p>

        {cargando ? (
          <p className="solicitud-compra__aviso">Comprobando tu sesión…</p>
        ) : !sesion ? (
          <div className="solicitud-compra__aviso">
            <p>Debes iniciar sesión antes de crear una solicitud.</p>
            <a href={`#iniciar-sesion?continuar=${continuar}`}>
              Iniciar sesión
            </a>
          </div>
        ) : solicitud ? (
          <div className="solicitud-compra__seguimiento" role="status">
            <span className={`estado estado--${solicitud.estado}`}>
              {solicitud.estado.replace(/_/g, ' ')}
            </span>
            <strong>{mensajeEstado(solicitud)}</strong>
            <dl>
              <div>
                <dt>Informado</dt>
                <dd>{formatearMonto(solicitud.monto_informado)}</dd>
              </div>
              {solicitud.monto_corregido !== null && (
                <div>
                  <dt>Corregido</dt>
                  <dd>{formatearMonto(solicitud.monto_corregido)}</dd>
                </div>
              )}
              <div>
                <dt>Solicitud</dt>
                <dd>{solicitud.id}</dd>
              </div>
            </dl>

            {solicitud.motivo_correccion && (
              <p className="solicitud-compra__motivo">
                Motivo del cajero: {solicitud.motivo_correccion}
              </p>
            )}

            {solicitud.estado === 'esperando_monto' &&
              solicitud.motivo_correccion && (
                <form
                  className="solicitud-compra__reingreso"
                  onSubmit={reenviarMonto}
                >
                  <label>
                    Monto corregido en CLP
                    <input
                      required
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={montoReingresado}
                      onChange={(evento) =>
                        setMontoReingresado(evento.target.value)
                      }
                    />
                  </label>
                  <button type="submit" disabled={procesando}>
                    Reenviar monto al cajero
                  </button>
                </form>
              )}

            {error && <p className="solicitud-compra__error">{error}</p>}

            <div className="solicitud-compra__acciones">
              <button
                type="button"
                disabled={procesando}
                onClick={() => void actualizarSolicitud()}
              >
                Actualizar estado
              </button>
              {['aprobada', 'rechazada', 'vencida', 'cancelada'].includes(
                solicitud.estado,
              ) && (
                <button type="button" onClick={comenzarOtra}>
                  Nueva solicitud
                </button>
              )}
            </div>
          </div>
        ) : (
          <form
            className="solicitud-compra__formulario"
            onSubmit={crearSolicitud}
          >
            <label>
              Token de la etiqueta
              <input
                required
                value={token}
                onChange={(evento) => setToken(evento.target.value)}
                placeholder="Se completa automáticamente al leer el NFC/QR"
                autoComplete="off"
              />
            </label>

            <label>
              Monto pagado en CLP
              <input
                required={!necesitaAyuda}
                disabled={necesitaAyuda}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={monto}
                onChange={(evento) => setMonto(evento.target.value)}
                placeholder="Ejemplo: 12500"
              />
            </label>

            <label className="solicitud-compra__ayuda">
              <input
                type="checkbox"
                checked={necesitaAyuda}
                onChange={(evento) => setNecesitaAyuda(evento.target.checked)}
              />
              <span>
                Necesito que el cajero me ayude a ingresar el monto
                <small>
                  Esta opción está pensada para personas que necesiten apoyo.
                </small>
              </span>
            </label>

            <label>
              Vigencia de prueba (minutos)
              <input
                required
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={minutos}
                onChange={(evento) => setMinutos(evento.target.value)}
              />
              <small>
                Es configurable porque la duración definitiva aún no está
                aprobada.
              </small>
            </label>

            {error && <p className="solicitud-compra__error">{error}</p>}

            <button type="submit" disabled={procesando}>
              {procesando ? 'Enviando…' : 'Enviar monto al comercio'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

export default SolicitudCompra
