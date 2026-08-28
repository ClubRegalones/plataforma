import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '../hooks/useSesion'
import {
  contarMensajesSoporteAdminNoLeidos,
  EVENTO_SOPORTE_ACTUALIZADO,
} from '../lib/soporte'

function EnlaceSoporteAdmin() {
  const { sesion } = useSesion()
  const [pendientes, setPendientes] = useState(0)

  const actualizar = useCallback(async () => {
    if (!sesion) return

    try {
      setPendientes(await contarMensajesSoporteAdminNoLeidos())
    } catch {
      setPendientes(0)
    }
  }, [sesion])

  useEffect(() => {
    if (!sesion) return

    const inicio = window.setTimeout(() => void actualizar(), 0)
    const intervalo = window.setInterval(() => void actualizar(), 30_000)
    const alVolver = () => void actualizar()

    window.addEventListener('focus', alVolver)
    window.addEventListener(EVENTO_SOPORTE_ACTUALIZADO, alVolver)

    return () => {
      window.clearTimeout(inicio)
      window.clearInterval(intervalo)
      window.removeEventListener('focus', alVolver)
      window.removeEventListener(EVENTO_SOPORTE_ACTUALIZADO, alVolver)
    }
  }, [actualizar, sesion])

  return (
    <a
      className="enlace-soporte-admin"
      href="#soporte-comercios"
      aria-label={
        pendientes > 0
          ? `Asistencia, ${pendientes} conversaciones con mensajes nuevos`
          : 'Asistencia'
      }
    >
      Asistencia
      {pendientes > 0 && (
        <span className="enlace-soporte-admin__contador" aria-hidden="true">
          {pendientes > 99 ? '99+' : pendientes}
        </span>
      )}
    </a>
  )
}

export default EnlaceSoporteAdmin
