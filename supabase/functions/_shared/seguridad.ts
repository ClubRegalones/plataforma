// Claves HMAC para contar intentos sin guardar RUT ni IP en claro,
// y generación del correo técnico permanente de cada vecino.

const SECRETO = Deno.env.get('RUT_HMAC_SECRET')

let llave: CryptoKey | null = null

async function obtenerLlave(): Promise<CryptoKey> {
  if (!SECRETO || SECRETO.length < 32) {
    throw new Error('RUT_HMAC_SECRET no configurado o demasiado corto')
  }
  if (!llave) {
    llave = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SECRETO),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  }
  return llave
}

export async function claveIntentos(prefijo: string, valor: string): Promise<string> {
  const firma = await crypto.subtle.sign(
    'HMAC',
    await obtenerLlave(),
    new TextEncoder().encode(valor),
  )
  const hex = Array.from(new Uint8Array(firma), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${prefijo}:${hex}`
}

// Aleatorio y permanente. Nunca contiene el RUT ni se reemplaza por el correo real.
export function correoTecnicoNuevo(): string {
  return `v-${crypto.randomUUID()}@cuentas.clubregalones.cl`
}
