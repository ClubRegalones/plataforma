import { useEffect, useState } from 'react'

export default function EstadoPwa() {
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  const [instalacion, setInstalacion] =
    useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const conectar = () => setEnLinea(true)
    const desconectar = () => setEnLinea(false)
    const prepararInstalacion = (evento: Event) => {
      evento.preventDefault()
      setInstalacion(evento as BeforeInstallPromptEvent)
    }

    window.addEventListener('online', conectar)
    window.addEventListener('offline', desconectar)
    window.addEventListener('beforeinstallprompt', prepararInstalacion)
    return () => {
      window.removeEventListener('online', conectar)
      window.removeEventListener('offline', desconectar)
      window.removeEventListener('beforeinstallprompt', prepararInstalacion)
    }
  }, [])

  const instalar = async () => {
    if (!instalacion) return
    await instalacion.prompt()
    await instalacion.userChoice
    setInstalacion(null)
  }

  return (
    <div className="estado-pwa" aria-live="polite">
      <span className={enLinea ? 'estado-pwa__linea' : 'estado-pwa__sin-linea'}>
        {enLinea ? 'En línea' : 'Sin conexión · operaciones bloqueadas'}
      </span>
      {instalacion && (
        <button type="button" onClick={() => void instalar()}>
          Instalar terminal
        </button>
      )}
    </div>
  )
}
