import type { Database, Tables } from '@club-regalones/domain'
import { supabase } from './supabase'

export const EVENTO_ASISTENCIA_ACTUALIZADA =
  'club-regalones:asistencia-actualizada'

function avisarActualizacionAsistencia() {
  window.dispatchEvent(new Event(EVENTO_ASISTENCIA_ACTUALIZADA))
}

export type NegocioAsistencia = Pick<Tables<'negocios'>, 'id' | 'nombre'>

export type TicketAsistencia = Tables<'tickets_soporte'> & {
  nombre_negocio: string
}

export type MensajeAsistencia = Tables<'mensajes_ticket_soporte'>

export async function listarAsistenciaComercio(usuarioId: string) {
  const { data: membresias, error: errorMembresias } = await supabase
    .from('miembros_negocio')
    .select('negocio_id')
    .eq('usuario_id', usuarioId)
    .eq('estado', 'activo')

  if (errorMembresias) throw errorMembresias

  const negociosIds = [...new Set(membresias.map(({ negocio_id }) => negocio_id))]
  if (negociosIds.length === 0) {
    return {
      negocios: [] as NegocioAsistencia[],
      tickets: [] as TicketAsistencia[],
      mensajes: [] as MensajeAsistencia[],
    }
  }

  const [respuestaNegocios, respuestaTickets] = await Promise.all([
    supabase
      .from('negocios')
      .select('id, nombre')
      .in('id', negociosIds)
      .order('nombre'),
    supabase
      .from('tickets_soporte')
      .select('*')
      .in('negocio_id', negociosIds)
      .order('ultima_actividad_en', { ascending: false }),
  ])

  if (respuestaNegocios.error) throw respuestaNegocios.error
  if (respuestaTickets.error) throw respuestaTickets.error

  const nombres = new Map(
    respuestaNegocios.data.map(({ id, nombre }) => [id, nombre]),
  )
  const tickets = respuestaTickets.data.map((ticket) => ({
    ...ticket,
    nombre_negocio: nombres.get(ticket.negocio_id) ?? 'Comercio',
  })) satisfies TicketAsistencia[]
  const ticketsIds = tickets.map(({ id }) => id)
  const { data: mensajes, error: errorMensajes } = ticketsIds.length
    ? await supabase
        .from('mensajes_ticket_soporte')
        .select('*')
        .in('ticket_id', ticketsIds)
        .order('creado_en')
    : { data: [] as MensajeAsistencia[], error: null }

  if (errorMensajes) throw errorMensajes

  return {
    negocios: respuestaNegocios.data as NegocioAsistencia[],
    tickets,
    mensajes: mensajes as MensajeAsistencia[],
  }
}

export async function crearSolicitudAsistencia(
  negocioId: string,
  categoria: Database['public']['Enums']['categoria_ticket_soporte'],
  asunto: string,
  mensaje: string,
  beneficioId: string | null = null,
) {
  const { data, error } = await supabase.rpc('crear_ticket_soporte', {
    p_negocio_id: negocioId,
    p_categoria: categoria,
    p_asunto: asunto,
    p_mensaje: mensaje,
    p_beneficio_id: beneficioId ?? undefined,
  })

  if (error) throw error
  avisarActualizacionAsistencia()
  return data
}

export async function responderSolicitudAsistencia(
  ticketId: string,
  mensaje: string,
) {
  const { data, error } = await supabase.rpc('responder_ticket_soporte', {
    p_ticket_id: ticketId,
    p_mensaje: mensaje,
  })

  if (error) throw error
  avisarActualizacionAsistencia()
  return data
}

export async function cambiarEstadoSolicitudAsistencia(
  ticketId: string,
  estado: 'abierto' | 'cerrado',
) {
  const { data, error } = await supabase.rpc('cambiar_estado_ticket_soporte', {
    p_ticket_id: ticketId,
    p_estado: estado,
  })

  if (error) throw error
  avisarActualizacionAsistencia()
  return data
}

export async function marcarSolicitudAsistenciaLeida(ticketId: string) {
  const { data, error } = await supabase.rpc('marcar_ticket_soporte_leido', {
    p_ticket_id: ticketId,
  })

  if (error) throw error
  avisarActualizacionAsistencia()
  return data
}

export async function contarMensajesAsistenciaNoLeidos() {
  const { data, error } = await supabase.rpc(
    'contar_tickets_soporte_no_leidos',
  )

  if (error) throw error
  return Number(data ?? 0)
}
