import { supabase } from './supabase'

export async function cancelarSolicitudLlavero(solicitudId: string) {
  const { data, error } = await supabase.rpc('cancelar_solicitud_llavero', {
    p_solicitud_id: solicitudId,
  })

  if (error) throw error

  return data
}
