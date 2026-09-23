type Props = {
  nombreVecino: string
  nombreBeneficio: string
  costoRegis: number
  pin: string
  procesando: boolean
  error?: string | null
  onPinChange: (pin: string) => void
  onConfirmar: () => void
  onVolver: () => void
}

function iniciales(nombre: string) {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join('')
    .toUpperCase()
}

export default function PantallaPinCanje({
  nombreVecino,
  nombreBeneficio,
  costoRegis,
  pin,
  procesando,
  error,
  onPinChange,
  onConfirmar,
  onVolver,
}: Props) {
  return (
    <section className="pin-canje">
      <span className="pin-canje__eyebrow">
        Autorizar canje
      </span>

      <h1>PIN de seguridad</h1>

      <article className="pin-canje__vecino">
        <span className="pin-canje__avatar">
          {iniciales(nombreVecino)}
        </span>

        <div>
          <strong>{nombreVecino}</strong>
          <small>{nombreBeneficio}</small>
        </div>
      </article>

      <article className="pin-canje__recompensa">
        <small>Recompensa seleccionada</small>

        <strong>{nombreBeneficio}</strong>

        <b>
          {costoRegis.toLocaleString('es-CL')} REGIS
        </b>
      </article>

      <label className="pin-canje__campo">
        <span>PIN de seguridad del llavero</span>

        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          onChange={(evento) =>
            onPinChange(
              evento.target.value
                .replace(/\D/g, '')
                .slice(0, 4),
            )
          }
          aria-label="PIN de seguridad"
        />

        <small>
          El vecino debe ingresar sus 4 {'d\u00edgitos'}.
        </small>
      </label>

      {error && (
        <div
          className="pin-canje__error"
          role="alert"
        >
          {error}
        </div>
      )}

      <button
        className="pin-canje__confirmar"
        type="button"
        disabled={
          pin.length !== 4 ||
          procesando
        }
        onClick={onConfirmar}
      >
        {procesando
          ? 'Autorizando...'
          : 'Confirmar PIN'}
      </button>

      <button
        className="pin-canje__volver"
        type="button"
        disabled={procesando}
        onClick={onVolver}
      >
        Volver
      </button>

      <p className="pin-canje__seguridad">
        El QR o NFC solo identifica al vecino.
        El gasto de REGIS requiere su PIN.
      </p>
    </section>
  )
}
