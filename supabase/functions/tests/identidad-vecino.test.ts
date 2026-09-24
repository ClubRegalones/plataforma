// Prueba de integración de registro-vecino y acceso-vecino contra Supabase local.
//
// Requisitos:
//   pnpm db:start
//   npx supabase functions serve --env-file supabase/functions/.env
//   (el .env local debe tener MODO_PRUEBAS_LOCALES=true para usar x-prueba-ip)
//   (en otra terminal) deno test --allow-env --allow-net supabase/functions/tests/
//
// Variables: SUPABASE_URL y SUPABASE_ANON_KEY (ver `npx supabase status`).

import { assert, assertEquals } from 'jsr:@std/assert@1'

const URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321'
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

function dv(cuerpo: string): string {
  let suma = 0
  let factor = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = 11 - (suma % 11)
  return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
}

function rutAleatorio(): string {
  const cuerpo = String(10_000_000 + Math.floor(Math.random() * 15_000_000))
  return `${cuerpo}-${dv(cuerpo)}`
}

function ipAleatoria(): string {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
}

async function llamar(
  funcion: string,
  cuerpo: Record<string, unknown>,
  ip: string = ipAleatoria(),
) {
  const respuesta = await fetch(`${URL}/functions/v1/${funcion}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      // Override de IP solo válido con MODO_PRUEBAS_LOCALES=true en el .env local.
      'x-prueba-ip': ip,
    },
    body: JSON.stringify(cuerpo),
  })
  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

function decodificarJwt(token: string): Record<string, unknown> {
  const parte = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(parte.padEnd(parte.length + ((4 - (parte.length % 4)) % 4), '=')))
}

const VERSION = '2026-09-provisoria'
const consentimientos = { terminos_privacidad: { version: VERSION, otorgado: true } }

Deno.test('registro, RUT duplicado y acceso con RUT', async () => {
  const rut = rutAleatorio()
  const contrasena = 'Regalon-prueba-2026'

  const registro = await llamar('registro-vecino', {
    rut,
    nombre: 'Rosa',
    apellido: 'Prueba',
    contrasena,
    correo: 'rosa.prueba@correo.cl',
    consentimientos,
  })
  assertEquals(registro.estado, 201)
  assertEquals(registro.cuerpo.codigo, 'REGISTRADO')
  assert(registro.cuerpo.sesion?.access_token, 'el registro devuelve sesión')

  // El JWT no contiene el RUT en ninguna parte.
  const claims = JSON.stringify(decodificarJwt(registro.cuerpo.sesion.access_token))
  assert(!claims.includes(rut.replace('-', '')), 'el JWT no contiene el RUT')
  assert(!claims.includes('rosa.prueba@correo.cl'), 'el JWT no contiene el correo real')

  const duplicado = await llamar('registro-vecino', {
    rut: rut.replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
    nombre: 'Otra',
    apellido: 'Persona',
    contrasena,
    consentimientos,
  })
  assertEquals(duplicado.estado, 409)
  assertEquals(duplicado.cuerpo.codigo, 'RUT_EXISTE')

  const acceso = await llamar('acceso-vecino', { rut, contrasena })
  assertEquals(acceso.estado, 200)
  assert(acceso.cuerpo.sesion?.access_token)

  const malaClave = await llamar('acceso-vecino', { rut, contrasena: 'incorrecta' })
  const rutInexistente = await llamar('acceso-vecino', { rut: rutAleatorio(), contrasena })
  assertEquals(malaClave.estado, 401)
  assertEquals(rutInexistente.estado, 401)
  assertEquals(malaClave.cuerpo, rutInexistente.cuerpo, 'misma respuesta: no revela si el RUT existe')

  // Un RUT válido rodeado de caracteres prohibidos no inicia sesión.
  for (const variante of [`abc${rut}xyz`, `#${rut}`, rut.replace(/\B(?=(\d{3})+(?!\d))/g, ',')]) {
    const basura = await llamar('acceso-vecino', { rut: variante, contrasena })
    assertEquals(basura.estado, 401, `no acepta ${variante.replace(/[0-9]/g, '#')}`)
  }
})

Deno.test('rechaza registro sin apellido', async () => {
  const sinApellido = await llamar('registro-vecino', {
    rut: rutAleatorio(),
    nombre: 'Juan',
    contrasena: 'Regalon-prueba-2026',
    consentimientos,
  })
  assertEquals(sinApellido.estado, 400)
  assertEquals(sinApellido.cuerpo.codigo, 'APELLIDO_INVALIDO')

  const apellidoVacio = await llamar('registro-vecino', {
    rut: rutAleatorio(),
    nombre: 'Juan',
    apellido: '   ',
    contrasena: 'Regalon-prueba-2026',
    consentimientos,
  })
  assertEquals(apellidoVacio.cuerpo.codigo, 'APELLIDO_INVALIDO')
})

Deno.test('un atacante no puede bloquear al dueño del RUT desde otra IP', async () => {
  const rut = rutAleatorio()
  const contrasena = 'Regalon-prueba-2026'
  const registro = await llamar('registro-vecino', {
    rut,
    nombre: 'Rosa',
    apellido: 'Prueba',
    contrasena,
    consentimientos,
  })
  assertEquals(registro.estado, 201)

  const ipAtacante = ipAleatoria()
  let ultimo = { estado: 0, cuerpo: {} as Record<string, unknown> }
  for (let i = 0; i < 5; i++) {
    ultimo = await llamar('acceso-vecino', { rut, contrasena: 'incorrecta' }, ipAtacante)
  }
  assertEquals(ultimo.estado, 429, 'el quinto fallo desde la misma IP bloquea RUT+IP')

  const desdeAtacante = await llamar('acceso-vecino', { rut, contrasena }, ipAtacante)
  assertEquals(desdeAtacante.estado, 429, 'la IP atacante sigue bloqueada para ese RUT')

  const duenio = await llamar('acceso-vecino', { rut, contrasena }, ipAleatoria())
  assertEquals(duenio.estado, 200, 'el dueño entra desde otro dispositivo')
})

Deno.test('consentimientos: exige versión y rechaza formatos viejos', async () => {
  const base = { nombre: 'Juan', apellido: 'Pérez', contrasena: 'Regalon-prueba-2026' }

  const booleano = await llamar('registro-vecino', {
    ...base,
    rut: rutAleatorio(),
    consentimientos: { terminos_privacidad: true },
  })
  assertEquals(booleano.cuerpo.codigo, 'CONSENTIMIENTO_MAL_FORMADO')

  const versionFalsa = await llamar('registro-vecino', {
    ...base,
    rut: rutAleatorio(),
    consentimientos: { terminos_privacidad: { version: 'no-existe', otorgado: true } },
  })
  assertEquals(versionFalsa.cuerpo.codigo, 'VERSION_CONSENTIMIENTO_INVALIDA')
})

Deno.test('rechaza registro sin términos y RUT inválido', async () => {
  const sinTerminos = await llamar('registro-vecino', {
    rut: rutAleatorio(),
    nombre: 'Juan',
    apellido: 'Pérez',
    contrasena: 'Regalon-prueba-2026',
    consentimientos: {},
  })
  assertEquals(sinTerminos.cuerpo.codigo, 'TERMINOS_REQUERIDOS')

  const invalido = await llamar('registro-vecino', {
    rut: '12.345.678-9',
    nombre: 'Juan',
    apellido: 'Pérez',
    contrasena: 'Regalon-prueba-2026',
    consentimientos,
  })
  assertEquals(invalido.cuerpo.codigo, 'RUT_INVALIDO')
})

Deno.test('signUp público cerrado', async () => {
  const respuesta = await fetch(`${URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: `x-${crypto.randomUUID()}@correo.cl`, password: 'Regalon-prueba-2026' }),
  })
  await respuesta.body?.cancel()
  assert(respuesta.status >= 400, 'Auth no permite registrarse directo')
})
