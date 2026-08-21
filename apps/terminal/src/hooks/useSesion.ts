import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useSesion() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true

    void supabase.auth.getSession().then(({ data }) => {
      if (activo) {
        setSesion(data.session)
        setCargando(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion)
      setCargando(false)
    })

    return () => {
      activo = false
      subscription.unsubscribe()
    }
  }, [])

  return { sesion, cargando }
}
