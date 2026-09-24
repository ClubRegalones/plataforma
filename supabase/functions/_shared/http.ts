// Utilidades HTTP compartidas por las Edge Functions de identidad.
// Nunca registrar en logs el cuerpo de las solicitudes: contiene RUT y contraseñas.

const ORIGENES = (Deno.env.get('ORIGENES_PERMITIDOS') ?? '')
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean)

export function encabezadosCors(solicitud: Request): HeadersInit {
  const origen = solicitud.headers.get('origin') ?? ''
  const permitido =
    ORIGENES.length === 0 ? '*' : ORIGENES.includes(origen) ? origen : ORIGENES[0]

  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function responder(
  solicitud: Request,
  estado: number,
  cuerpo: Record<string, unknown>,
  extras: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...encabezadosCors(solicitud), 'Content-Type': 'application/json', ...extras },
  })
}

// Responde el preflight CORS y rechaza métodos distintos de POST.
export function filtrarMetodo(solicitud: Request): Response | null {
  if (solicitud.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: encabezadosCors(solicitud) })
  }
  if (solicitud.method !== 'POST') {
    return responder(solicitud, 405, { codigo: 'METODO_NO_PERMITIDO' })
  }
  return null
}

export async function leerJson(solicitud: Request): Promise<Record<string, unknown> | null> {
  try {
    const cuerpo = await solicitud.json()
    return cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo)
      ? (cuerpo as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function texto(valor: unknown, maximo: number): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  return limpio.length > 0 && limpio.length <= maximo ? limpio : null
}

export function textoOpcional(valor: unknown, maximo: number): string | null | undefined {
  if (valor === undefined || valor === null || valor === '') return null
  return texto(valor, maximo) ?? undefined // undefined = presente pero inválido
}

// ----------------------------------------------------------------------------
// IP del cliente para límites antiabuso
//
// En producción las solicitudes llegan a Supabase a través de Cloudflare.
// Cloudflare escribe cf-connecting-ip con la IP real y reemplaza cualquier
// valor que envíe el cliente, por eso es la primera fuente. x-forwarded-for
// solo se usa como respaldo (primera entrada, que según pruebas publicadas
// el borde de Supabase sobrescribe con la IP real).
//
// Esto NO está documentado oficialmente por Supabase: antes de confiar en el
// límite por IP hay que verificarlo en staging (ver CAMBIOS_CONFIG.md,
// "Verificación de IP"). DIAGNOSTICO_IP=true expone qué fuente se usó.
//
// Si no hay una IP confiable se devuelve null y los límites por IP se omiten.
// Nunca se agrupa a todos los "desconocidos" en una sola clave: eso permitiría
// bloquear a todos los vecinos a la vez.
//
// Override de pruebas: solo con MODO_PRUEBAS_LOCALES=true (exclusivo de
// supabase/functions/.env local, nunca como secreto del proyecto remoto).
// ----------------------------------------------------------------------------

const MODO_PRUEBAS_LOCALES = Deno.env.get('MODO_PRUEBAS_LOCALES') === 'true'
export const DIAGNOSTICO_IP = Deno.env.get('DIAGNOSTICO_IP') === 'true'

export type FuenteIp = 'prueba-local' | 'cf-connecting-ip' | 'x-forwarded-for' | 'ninguna'

const IP_VALIDA = /^[0-9a-fA-F:.]{3,45}$/

function limpiarIp(valor: string | null | undefined): string | null {
  const ip = valor?.trim()
  return ip && IP_VALIDA.test(ip) ? ip : null
}

export function ipCliente(solicitud: Request): { ip: string | null; fuente: FuenteIp } {
  if (MODO_PRUEBAS_LOCALES) {
    const ipPrueba = limpiarIp(solicitud.headers.get('x-prueba-ip'))
    if (ipPrueba) return { ip: ipPrueba, fuente: 'prueba-local' }
  }

  const cloudflare = limpiarIp(solicitud.headers.get('cf-connecting-ip'))
  if (cloudflare) return { ip: cloudflare, fuente: 'cf-connecting-ip' }

  const reenviada = limpiarIp(solicitud.headers.get('x-forwarded-for')?.split(',')[0])
  if (reenviada) return { ip: reenviada, fuente: 'x-forwarded-for' }

  return { ip: null, fuente: 'ninguna' }
}
