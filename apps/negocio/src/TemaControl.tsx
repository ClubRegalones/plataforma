import { useState } from 'react'
import {
  guardarTema,
  obtenerTemaGuardado,
} from './lib/tema'
import type { TemaAppNegocio } from './lib/tema'

function IconoTema({ tema }: { tema: TemaAppNegocio }) {
  if (tema === 'oscuro') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </svg>
  )
}

export default function TemaControl() {
  const [tema, setTema] = useState<TemaAppNegocio>(obtenerTemaGuardado)

  const alternarTema = () => {
    const siguiente: TemaAppNegocio = tema === 'oscuro' ? 'claro' : 'oscuro'
    setTema(siguiente)
    guardarTema(siguiente)
  }

  const destino = tema === 'oscuro' ? 'claro' : 'oscuro'

  return (
    <button
      className="negocio-tema-control"
      type="button"
      onClick={alternarTema}
      aria-label={`Cambiar a modo ${destino}`}
      title={`Cambiar a modo ${destino}`}
    >
      <IconoTema tema={tema} />
    </button>
  )
}
