import { useEffect, useState } from 'react'

type Props = {
  disponible?: boolean
  etiquetaEnLinea?: string
  mostrarInstalacion?: boolean
}

export default function EstadoPwa({
  disponible,
  etiquetaEnLinea = 'En línea',
  mostrarInstalacion = true,
}: Props) {
  const [navegadorEnLinea, setNavegadorEnLinea] =
    useState(navigator.onLine)

  const [instalacion, setInstalacion] =
    useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const conectar = () =>
      setNavegadorEnLinea(true)

    const desconectar = () =>
      setNavegadorEnLinea(false)

    const prepararInstalacion = (evento: Event) => {
      evento.preventDefault()

      setInstalacion(
        evento as BeforeInstallPromptEvent,
      )
    }

    window.addEventListener('online', conectar)
    window.addEventListener('offline', desconectar)
    window.addEventListener(
      'beforeinstallprompt',
      prepararInstalacion,
    )

    return () => {
      window.removeEventListener('online', conectar)
      window.removeEventListener('offline', desconectar)
      window.removeEventListener(
        'beforeinstallprompt',
        prepararInstalacion,
      )
    }
  }, [])

  const enLinea =
    navegadorEnLinea &&
    (disponible ?? true)

  const instalar = async () => {
    if (!instalacion) return

    await instalacion.prompt()
    await instalacion.userChoice

    setInstalacion(null)
  }

  return (
    <div className="estado-pwa" aria-live="polite">
      <span
        className={
          enLinea
            ? 'estado-pwa__linea'
            : 'estado-pwa__sin-linea'
        }
      >
        {enLinea
          ? etiquetaEnLinea
          : 'Sin conexión'}
      </span>

      {mostrarInstalacion && instalacion && (
        <button
          type="button"
          onClick={() => void instalar()}
        >
          Instalar terminal
        </button>
      )}
    </div>
  )
}