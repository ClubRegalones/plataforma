import type { Enums } from '@club-regalones/domain'
import { supabase } from './supabase'

export type ResultadoEstadoLlavero = {
  id: string
  vecino_id: string
  codigo_publico: string
  estado: Enums<'estado_llavero_nfc'>
  asignado_en: string | null
  bloqueado_en: string | null
}

export type FilaGestionLlavero = {
  solicitud_id: string
  vecino_id: string
  nombre_vecino: string
  correo_vecino: string
  telefono_vecino: string | null
  comuna_vecino: string | null
  modalidad_atencion: Enums<'modalidad_atencion'>
  negocio_solicitud_id: string | null
  nombre_negocio: string | null
  estado_solicitud: Enums<'estado_solicitud_llavero'>
  solicitado_en: string
  programado_para: string | null
  entregado_en: string | null
  observaciones: string | null
  llavero_id: string | null
  codigo_publico: string | null
  estado_llavero: Enums<'estado_llavero_nfc'> | null
  preparado_en: string | null
  activado_en: string | null
  metodo_activacion: 'cedula' | 'pin' | 'sms' | null
}

export async function cancelarSolicitudLlavero(solicitudId: string) {
  const { data, error } = await supabase.rpc('cancelar_solicitud_llavero', { p_solicitud_id: solicitudId })
  if (error) throw error
  return data
}

export async function programarEntregaLlavero(solicitudId: string, programadoPara: string, observaciones: string | null) {
  const { data, error } = await supabase.rpc('programar_entrega_llavero', {
    p_solicitud_id: solicitudId,
    p_programado_para: programadoPara,
    p_observaciones: observaciones ?? undefined,
  })
  if (error) throw error
  return data
}

export async function prepararLlavero(solicitudId: string, token: string, codigoPublico: string, pin: string | null) {
  const { data, error } = await supabase.rpc('preparar_llavero', {
    p_solicitud_id: solicitudId,
    p_token: token,
    p_codigo_publico: codigoPublico,
    p_pin: pin ?? undefined,
  })
  if (error) throw error
  return data[0] ?? null
}

export async function registrarEntregaLlavero(solicitudId: string) {
  const { data, error } = await supabase.rpc('registrar_entrega_llavero', { p_solicitud_id: solicitudId })
  if (error) throw error
  return data
}

export async function cambiarEstadoLlavero(llaveroId: string, estado: 'bloqueado' | 'perdido' | 'revocado') {
  const { data, error } = await supabase.rpc('cambiar_estado_llavero', {
    p_llavero_id: llaveroId,
    p_estado: estado,
  })
  if (error) throw error
  return (data[0] ?? null) as ResultadoEstadoLlavero | null
}

export async function listarGestionLlaveros() {
  const { data, error } = await supabase.rpc('listar_gestion_llaveros_detalle')
  if (error) throw error
  return data
}
