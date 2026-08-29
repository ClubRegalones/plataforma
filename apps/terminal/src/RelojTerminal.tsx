import { useEffect, useState } from 'react'

export default function RelojTerminal() {
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    const intervalo = window.setInterval(() => {
      setAhora(new Date())
    }, 1000)

    return () => window.clearInterval(intervalo)
  }, [])

  const hora = new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ahora)

  const fechaCruda = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(ahora)

  const fecha =
    fechaCruda.charAt(0).toUpperCase() +
    fechaCruda.slice(1)

  return (
    <div className="terminal-reloj-ref">
      <svg
        className="terminal-reloj-ref__icono"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M12 7v5l3 2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>

      <div>
        <strong>{hora}</strong>
        <span>{fecha}</span>
      </div>
    </div>
  )
}