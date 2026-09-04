import { useCallback, useEffect, useState } from 'react'
import { useSesion } from './hooks/useSesion'
import {
  contarMensajesAsistenciaNoLeidos,
  EVENTO_ASISTENCIA_ACTUALIZADA,
} from './lib/soporte'

function EnlaceAsistencia() {
  const { sesion } = useSesion()
  const [pendientes, setPendientes] = useState(0)

  const actualizar = useCallback(async () => {
    if (!sesion) return

    try {
      setPendientes(await contarMensajesAsistenciaNoLeidos())
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
    window.addEventListener(EVENTO_ASISTENCIA_ACTUALIZADA, alVolver)

    return () => {
      window.clearTimeout(inicio)
      window.clearInterval(intervalo)
      window.removeEventListener('focus', alVolver)
      window.removeEventListener(EVENTO_ASISTENCIA_ACTUALIZADA, alVolver)
    }
  }, [actualizar, sesion])

  return (
    <a
      className="enlace-asistencia"
      href="#asistencia"
      aria-label={
        pendientes > 0
          ? `Asistencia, ${pendientes} conversaciones con mensajes nuevos`
          : 'Asistencia'
      }
    >
      Asistencia
      {pendientes > 0 && (
        <span className="enlace-asistencia__contador" aria-hidden="true">
          {pendientes > 99 ? '99+' : pendientes}
        </span>
      )}
    </a>
  )
}

export default EnlaceAsistencia
