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

// -----------------------------------------------------------------------------
// Recuperación de cuenta
//
// Usa un secreto distinto al utilizado para proteger RUT/IP.
//
// El Código de Comercio existe en texto claro únicamente durante la petición
// que lo genera. En PostgreSQL solo se guarda su HMAC.
//
// Código y token usan el mismo secreto de recuperación pero dominios HMAC
// distintos ("codigo:" y "token:"), evitando reutilización entre protocolos.
// -----------------------------------------------------------------------------

const SECRETO_RECUPERACION = Deno.env.get('RECUPERACION_HMAC_SECRET')

let llaveRecuperacion: CryptoKey | null = null

async function obtenerLlaveRecuperacion(): Promise<CryptoKey> {
  if (!SECRETO_RECUPERACION || SECRETO_RECUPERACION.length < 32) {
    throw new Error('RECUPERACION_HMAC_SECRET no configurado o demasiado corto')
  }

  if (!llaveRecuperacion) {
    llaveRecuperacion = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SECRETO_RECUPERACION),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  }

  return llaveRecuperacion
}

async function hmacRecuperacion(
  dominio: 'codigo' | 'token',
  valor: string,
): Promise<string> {
  const firma = await crypto.subtle.sign(
    'HMAC',
    await obtenerLlaveRecuperacion(),
    new TextEncoder().encode(`${dominio}:${valor}`),
  )

  return Array.from(
    new Uint8Array(firma),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}

// Genera exactamente seis dígitos usando rejection sampling para evitar
// sesgo por módulo.
export function codigoComercioNuevo(): string {
  const limite = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000
  const numeros = new Uint32Array(1)

  let numero: number

  do {
    crypto.getRandomValues(numeros)
    numero = numeros[0]
  } while (numero >= limite)

  return (numero % 1_000_000).toString().padStart(6, '0')
}

export async function hashCodigoComercio(codigo: string): Promise<string> {
  if (!/^\d{6}$/.test(codigo)) {
    throw new Error('Código de Comercio inválido')
  }

  return await hmacRecuperacion('codigo', codigo)
}

// Token que el navegador del vecino recibe después de validar correctamente
// el Código de Comercio. Tiene alta entropía y nunca se almacena en claro.
export function tokenRecuperacionNuevo(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)

  return Array.from(
    bytes,
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}

export async function hashTokenRecuperacion(token: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(token)) {
    throw new Error('Token de recuperación inválido')
  }

  return await hmacRecuperacion('token', token)
}
