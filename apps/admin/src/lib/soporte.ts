import type { Database, Tables } from '@club-regalones/domain'
import { supabase } from './supabase'

export const EVENTO_SOPORTE_ACTUALIZADO =
  'club-regalones:soporte-actualizado'

function avisarActualizacionSoporte() {
  window.dispatchEvent(new Event(EVENTO_SOPORTE_ACTUALIZADO))
}

export type NegocioSoporteAdmin = Pick<
  Tables<'negocios'>,
  'id' | 'nombre' | 'rubro' | 'estado'
>
export type BeneficioSoporteAdmin = Pick<
  Tables<'beneficios_regis'>,
  'id' | 'negocio_id' | 'codigo'
>
export type TicketSoporteAdmin = Tables<'tickets_soporte'> & {
  nombre_negocio: string
  codigo_beneficio: string | null
}
export type MensajeSoporteAdmin = Tables<'mensajes_ticket_soporte'>

export async function listarAsistenciaAdmin() {
  const [respuestaNegocios, respuestaBeneficios, respuestaTickets] =
    await Promise.all([
      supabase
        .from('negocios')
        .select('id, nombre, rubro, estado')
        .order('nombre'),
      supabase.from('beneficios_regis').select('id, negocio_id, codigo'),
      supabase
        .from('tickets_soporte')
        .select('*')
        .order('ultima_actividad_en', { ascending: false }),
    ])

  if (respuestaNegocios.error) throw respuestaNegocios.error
  if (respuestaBeneficios.error) throw respuestaBeneficios.error
  if (respuestaTickets.error) throw respuestaTickets.error

  const nombresNegocio = new Map(
    respuestaNegocios.data.map(({ id, nombre }) => [id, nombre]),
  )
  const codigosBeneficio = new Map(
    respuestaBeneficios.data.map(({ id, codigo }) => [id, codigo]),
  )
  const tickets = respuestaTickets.data.map((ticket) => ({
    ...ticket,
    nombre_negocio: nombresNegocio.get(ticket.negocio_id) ?? 'Comercio',
    codigo_beneficio: ticket.beneficio_id
      ? (codigosBeneficio.get(ticket.beneficio_id) ?? null)
      : null,
  })) satisfies TicketSoporteAdmin[]
  const ticketsIds = tickets.map(({ id }) => id)
  const { data: mensajes, error: errorMensajes } = ticketsIds.length
    ? await supabase
        .from('mensajes_ticket_soporte')
        .select('*')
        .in('ticket_id', ticketsIds)
        .order('creado_en')
    : { data: [] as MensajeSoporteAdmin[], error: null }

  if (errorMensajes) throw errorMensajes

  return {
    negocios: respuestaNegocios.data as NegocioSoporteAdmin[],
    beneficios: respuestaBeneficios.data as BeneficioSoporteAdmin[],
    tickets,
    mensajes: mensajes as MensajeSoporteAdmin[],
  }
}

export async function iniciarConversacionAdmin(
  negocioId: string,
  categoria: Database['public']['Enums']['categoria_ticket_soporte'],
  asunto: string,
  mensaje: string,
  beneficioId: string | null,
) {
  const { data, error } = await supabase.rpc('crear_ticket_soporte', {
    p_negocio_id: negocioId,
    p_categoria: categoria,
    p_asunto: asunto,
    p_mensaje: mensaje,
    p_beneficio_id: beneficioId ?? undefined,
  })

  if (error) throw error
  avisarActualizacionSoporte()
  return data
}

export async function responderConversacionAdmin(
  ticketId: string,
  mensaje: string,
) {
  const { data, error } = await supabase.rpc('responder_ticket_soporte', {
    p_ticket_id: ticketId,
    p_mensaje: mensaje,
  })

  if (error) throw error
  avisarActualizacionSoporte()
  return data
}

export async function cambiarEstadoConversacionAdmin(
  ticketId: string,
  estado: Database['public']['Enums']['estado_ticket_soporte'],
) {
  const { data, error } = await supabase.rpc('cambiar_estado_ticket_soporte', {
    p_ticket_id: ticketId,
    p_estado: estado,
  })

  if (error) throw error
  avisarActualizacionSoporte()
  return data
}

export async function marcarConversacionAdminLeida(ticketId: string) {
  const { data, error } = await supabase.rpc('marcar_ticket_soporte_leido', {
    p_ticket_id: ticketId,
  })

  if (error) throw error
  avisarActualizacionSoporte()
  return data
}

export async function contarMensajesSoporteAdminNoLeidos() {
  const { data, error } = await supabase.rpc(
    'contar_tickets_soporte_no_leidos',
  )

  if (error) throw error
  return Number(data ?? 0)
}
