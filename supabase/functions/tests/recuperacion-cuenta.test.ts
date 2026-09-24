// Pruebas de integración HTTP del flujo Código de Comercio.
//
// Requisitos:
//   - Supabase local iniciado.
//   - Edge Functions servidas con supabase/functions/.env.
//   - SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY
//     disponibles al ejecutar este test.
//
// Todo ocurre contra Supabase LOCAL.

import { assert, assertEquals } from 'jsr:@std/assert@1'

const URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321'
const ANON =
  Deno.env.get('SUPABASE_ANON_KEY') ??
  Deno.env.get('ANON_KEY') ??
  ''

const SERVICE =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SERVICE_ROLE_KEY') ??
  ''

if (!ANON) {
  throw new Error('Falta SUPABASE_ANON_KEY/ANON_KEY para las pruebas.')
}

if (!SERVICE) {
  throw new Error(
    'Falta SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY para preparar el escenario local.',
  )
}

const VERSION = '2026-09-provisoria'

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
  const cuerpo = String(
    10_000_000 + crypto.getRandomValues(new Uint32Array(1))[0] % 15_000_000,
  )

  return `${cuerpo}-${dv(cuerpo)}`
}

function ipAleatoria(): string {
  const valores = crypto.getRandomValues(new Uint8Array(3))

  return `10.${valores[0] || 1}.${valores[1] || 1}.${valores[2] || 1}`
}

function decodificarJwt(token: string): Record<string, unknown> {
  const parte = token
    .split('.')[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const relleno = parte.padEnd(
    parte.length + ((4 - (parte.length % 4)) % 4),
    '=',
  )

  return JSON.parse(atob(relleno))
}

async function sha256(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor)
  const hash = await crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
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
      'x-prueba-ip': ip,
    },
    body: JSON.stringify(cuerpo),
  })

  let respuestaJson: Record<string, any>

  try {
    respuestaJson = await respuesta.json()
  } catch {
    respuestaJson = {}
  }

  return {
    estado: respuesta.status,
    cuerpo: respuestaJson,
  }
}

async function insertar(
  tabla: string,
  datos: Record<string, unknown>,
): Promise<void> {
  const respuesta = await fetch(`${URL}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(datos),
  })

  if (!respuesta.ok) {
    throw new Error(
      `No se pudo insertar ${tabla}: ${respuesta.status} ${await respuesta.text()}`,
    )
  }
}

async function consultar(
  ruta: string,
): Promise<Record<string, any>[]> {
  const respuesta = await fetch(`${URL}/rest/v1/${ruta}`, {
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
    },
  })

  if (!respuesta.ok) {
    throw new Error(
      `Consulta REST falló: ${respuesta.status} ${await respuesta.text()}`,
    )
  }

  return await respuesta.json()
}

interface ContextoNegocio {
  negocioId: string
  sucursalId: string
  cajaId: string
  terminalId: string
  cajeroId: string
  turnoId: string
  tokenTerminal: string
}

async function crearContextoNegocio(): Promise<ContextoNegocio> {
  const negocioId = crypto.randomUUID()
  const sucursalId = crypto.randomUUID()
  const cajaId = crypto.randomUUID()
  const terminalId = crypto.randomUUID()
  const cajeroId = crypto.randomUUID()
  const turnoId = crypto.randomUUID()
  const tokenTerminal =
    `terminal-${crypto.randomUUID()}-${crypto.randomUUID()}`

  const sufijo = negocioId.replaceAll('-', '').slice(0, 12)

  await insertar('negocios', {
    id: negocioId,
    nombre: `Negocio Recuperación ${sufijo}`,
    slug: `negocio-recuperacion-${sufijo}`,
    rubro: 'Almacén',
    estado: 'activo',
  })

  await insertar('sucursales', {
    id: sucursalId,
    negocio_id: negocioId,
    nombre: 'Sucursal Recuperación',
    direccion: 'Dirección local de prueba 123',
    comuna: 'La Serena',
    estado: 'activa',
    modo_identificacion_cajero: 'solo_nombre',
  })

  await insertar('cajas', {
    id: cajaId,
    sucursal_id: sucursalId,
    nombre: 'Caja Regalones',
    codigo: `REC-${sufijo}`,
    estado: 'activa',
  })

  await insertar('terminales', {
    id: terminalId,
    caja_id: cajaId,
    identificador_publico: `TERM-${sufijo}`,
    token_hash: await sha256(tokenTerminal),
    nombre_dispositivo: 'Terminal integración recuperación',
    estado: 'activa',
    ultima_conexion_en: new Date().toISOString(),
  })

  await insertar('cajeros_negocio', {
    id: cajeroId,
    negocio_id: negocioId,
    nombre: 'Cajera',
    apellido: 'Integración',
    rol: 'cajero',
    pin_hash: null,
    estado: 'activo',
  })

  await insertar('cajeros_sucursales', {
    cajero_id: cajeroId,
    sucursal_id: sucursalId,
  })

  await insertar('turnos_caja', {
    id: turnoId,
    terminal_id: terminalId,
    caja_id: cajaId,
    negocio_id: negocioId,
    cajero_negocio_id: cajeroId,
    nombre_cajero: 'Cajera Integración',
    estado: 'abierto',
  })

  return {
    negocioId,
    sucursalId,
    cajaId,
    terminalId,
    cajeroId,
    turnoId,
    tokenTerminal,
  }
}

async function registrarVecino(
  rut: string,
  contrasena: string,
  opciones: {
    correo?: string
    telefono?: string
  } = {},
) {
  const registro = await llamar('registro-vecino', {
    rut,
    nombre: 'Vecina',
    apellido: 'Integración',
    contrasena,
    correo: opciones.correo,
    telefono: opciones.telefono,
    canal: 'app_vecino',
    consentimientos: {
      terminos_privacidad: {
        version: VERSION,
        otorgado: true,
      },
    },
  })

  assertEquals(registro.estado, 201)
  assertEquals(registro.cuerpo.codigo, 'REGISTRADO')
  assert(registro.cuerpo.sesion?.access_token)

  const jwt = decodificarJwt(
    registro.cuerpo.sesion.access_token,
  )

  assert(
    typeof jwt.sub === 'string',
    'el registro devuelve un UUID de usuario',
  )

  return jwt.sub as string
}

async function emitirCodigo(
  contexto: ContextoNegocio,
  rut: string,
  motivo:
    | 'olvido_sin_contacto'
    | 'activacion_digital'
    | 'traspaso_identidad',
) {
  const busqueda = await llamar(
    'recuperacion-cuenta-negocio',
    {
      accion: 'buscar',
      rut,
      turno_id: contexto.turnoId,
      terminal_id: contexto.terminalId,
      token_terminal: contexto.tokenTerminal,
    },
  )

  assertEquals(busqueda.estado, 200)
  assertEquals(busqueda.cuerpo.codigo, 'VECINO_ENCONTRADO')
  assertEquals(
    busqueda.cuerpo.vecino?.nombre,
    'Vecina Integración',
  )

  const emision = await llamar(
    'recuperacion-cuenta-negocio',
    {
      accion: 'emitir',
      rut,
      turno_id: contexto.turnoId,
      terminal_id: contexto.terminalId,
      token_terminal: contexto.tokenTerminal,
      motivo,
      identidad_verificada: true,
    },
  )

  assertEquals(emision.estado, 201)
  assertEquals(
    emision.cuerpo.codigo,
    'CODIGO_COMERCIO_EMITIDO',
  )

  assert(
    typeof emision.cuerpo.codigo_comercio === 'string' &&
      /^\d{6}$/.test(emision.cuerpo.codigo_comercio),
    'la App Negocio devuelve un Código de Comercio de 6 dígitos',
  )

  return emision.cuerpo.codigo_comercio as string
}

async function validarCodigo(
  rut: string,
  codigoComercio: string,
) {
  const validacion = await llamar(
    'recuperacion-cuenta-vecino',
    {
      accion: 'validar_codigo',
      rut,
      codigo: codigoComercio,
    },
  )

  assertEquals(validacion.estado, 200)
  assertEquals(validacion.cuerpo.codigo, 'CODIGO_VALIDO')
  assert(
    typeof validacion.cuerpo.recuperacion_id === 'string',
  )
  assert(
    typeof validacion.cuerpo.token_recuperacion === 'string' &&
      /^[0-9a-f]{64}$/.test(
        validacion.cuerpo.token_recuperacion,
      ),
  )

  return {
    recuperacionId:
      validacion.cuerpo.recuperacion_id as string,
    token:
      validacion.cuerpo.token_recuperacion as string,
  }
}

async function cambiarContrasena(
  recuperacionId: string,
  token: string,
  contrasena: string,
) {
  const cambio = await llamar(
    'recuperacion-cuenta-vecino',
    {
      accion: 'cambiar_contrasena',
      recuperacion_id: recuperacionId,
      token_recuperacion: token,
      contrasena,
    },
  )

  assertEquals(cambio.estado, 200)
  assertEquals(
    cambio.cuerpo.codigo,
    'RECUPERACION_COMPLETADA',
  )

  return cambio
}

Deno.test(
  'Código de Comercio recupera la contraseña de punta a punta',
  async () => {
    const contexto = await crearContextoNegocio()
    const rut = rutAleatorio()

    const claveOriginal = 'ClaveOriginal-2026!'
    const claveNueva = 'ClaveNueva-2026!'

    await registrarVecino(
      rut,
      claveOriginal,
    )

    const codigoComercio = await emitirCodigo(
      contexto,
      rut,
      'olvido_sin_contacto',
    )

    const recuperacion = await validarCodigo(
      rut,
      codigoComercio,
    )

    // El código ya utilizado no puede validarse por segunda vez.
    const segundoUso = await llamar(
      'recuperacion-cuenta-vecino',
      {
        accion: 'validar_codigo',
        rut,
        codigo: codigoComercio,
      },
    )

    assertEquals(segundoUso.estado, 401)
    assertEquals(
      segundoUso.cuerpo.codigo,
      'CODIGO_INVALIDO',
    )

    await cambiarContrasena(
      recuperacion.recuperacionId,
      recuperacion.token,
      claveNueva,
    )

    const claveVieja = await llamar(
      'acceso-vecino',
      {
        rut,
        contrasena: claveOriginal,
      },
    )

    assertEquals(claveVieja.estado, 401)
    assertEquals(
      claveVieja.cuerpo.codigo,
      'CREDENCIALES_INVALIDAS',
    )

    const claveActual = await llamar(
      'acceso-vecino',
      {
        rut,
        contrasena: claveNueva,
      },
    )

    assertEquals(claveActual.estado, 200)
    assertEquals(
      claveActual.cuerpo.codigo,
      'ACCESO_CONCEDIDO',
    )
    assert(claveActual.cuerpo.sesion?.access_token)
  },
)

Deno.test(
  'traspaso de identidad elimina contactos anteriores y conserva el RUT',
  async () => {
    const contexto = await crearContextoNegocio()
    const rut = rutAleatorio()

    const claveOriginal = 'ClaveTransferencia-2026!'
    const claveNueva = 'ClaveNuevaTransferencia-2026!'
    const vecinoId = await registrarVecino(
      rut,
      claveOriginal,
      {
        correo: `transferencia-${crypto.randomUUID()}@correo.cl`,
        telefono: '+56912345678',
      },
    )

    const contactosAntes = await consultar(
      `contactos_vecino?select=id&vecino_id=eq.${vecinoId}`,
    )

    assert(
      contactosAntes.length >= 1,
      'el vecino parte con canales de contacto',
    )

    const codigoComercio = await emitirCodigo(
      contexto,
      rut,
      'traspaso_identidad',
    )

    const recuperacion = await validarCodigo(
      rut,
      codigoComercio,
    )

    const cambio = await cambiarContrasena(
      recuperacion.recuperacionId,
      recuperacion.token,
      claveNueva,
    )

    assertEquals(
      cambio.cuerpo.motivo,
      'traspaso_identidad',
    )

    const contactosDespues = await consultar(
      `contactos_vecino?select=id&vecino_id=eq.${vecinoId}`,
    )

    assertEquals(
      contactosDespues.length,
      0,
      'el traspaso elimina los contactos anteriores',
    )

    const perfiles = await consultar(
      `perfiles?select=rut,telefono&id=eq.${vecinoId}`,
    )

    assertEquals(perfiles.length, 1)
    assertEquals(
      perfiles[0].telefono,
      null,
      'el teléfono heredado queda desvinculado',
    )

    assert(
      typeof perfiles[0].rut === 'string' &&
        perfiles[0].rut.length > 0,
      'el RUT legítimo se conserva',
    )

    const claveVieja = await llamar(
      'acceso-vecino',
      {
        rut,
        contrasena: claveOriginal,
      },
    )

    assertEquals(claveVieja.estado, 401)

    const claveActual = await llamar(
      'acceso-vecino',
      {
        rut,
        contrasena: claveNueva,
      },
    )

    assertEquals(claveActual.estado, 200)
    assertEquals(
      claveActual.cuerpo.codigo,
      'ACCESO_CONCEDIDO',
    )
  },
)
Deno.test(
  'Código de Comercio se bloquea después de 5 intentos incorrectos',
  async () => {
    const contexto = await crearContextoNegocio()
    const rut = rutAleatorio()
    const claveOriginal = 'ClaveBloqueo-2026!'

    const vecinoId = await registrarVecino(
      rut,
      claveOriginal,
    )

    const codigoCorrecto = await emitirCodigo(
      contexto,
      rut,
      'olvido_sin_contacto',
    )

    // Probamos cinco códigos incorrectos.
    // Evitamos accidentalmente generar el código verdadero.
    for (let intento = 1; intento <= 5; intento++) {
      let codigoIncorrecto =
        String((Number(codigoCorrecto) + intento) % 1_000_000)
          .padStart(6, '0')

      if (codigoIncorrecto === codigoCorrecto) {
        codigoIncorrecto = '999999'
      }

      const respuesta = await llamar(
        'recuperacion-cuenta-vecino',
        {
          accion: 'validar_codigo',
          rut,
          codigo: codigoIncorrecto,
        },
      )

      assertEquals(respuesta.estado, 401)
      assertEquals(
        respuesta.cuerpo.codigo,
        'CODIGO_INVALIDO',
      )
    }

    // Aunque ahora presentemos el código verdadero,
    // la recuperación ya debe estar bloqueada.
    const codigoDespuesDelBloqueo = await llamar(
      'recuperacion-cuenta-vecino',
      {
        accion: 'validar_codigo',
        rut,
        codigo: codigoCorrecto,
      },
    )

    assertEquals(codigoDespuesDelBloqueo.estado, 401)
    assertEquals(
      codigoDespuesDelBloqueo.cuerpo.codigo,
      'CODIGO_INVALIDO',
    )

    // Confirmamos además el estado interno de seguridad.
    const recuperaciones = await consultar(
      `recuperaciones_cuenta?select=estado,intentos_fallidos&vecino_id=eq.${vecinoId}&order=creado_en.desc&limit=1`,
    )

    assertEquals(recuperaciones.length, 1)

    assertEquals(
      recuperaciones[0].estado,
      'bloqueada',
      'la recuperación queda bloqueada al quinto intento',
    )

    assertEquals(
      recuperaciones[0].intentos_fallidos,
      5,
      'se registran exactamente cinco intentos fallidos',
    )
  },
)
async function actualizar(
  tabla: string,
  filtro: string,
  datos: Record<string, unknown>,
): Promise<void> {
  const respuesta = await fetch(
    `${URL}/rest/v1/${tabla}?${filtro}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(datos),
    },
  )

  if (!respuesta.ok) {
    throw new Error(
      `No se pudo actualizar ${tabla}: ${respuesta.status} ${await respuesta.text()}`,
    )
  }
}

Deno.test(
  'Código de Comercio vencido no puede utilizarse',
  async () => {
    const contexto = await crearContextoNegocio()
    const rut = rutAleatorio()

    const vecinoId = await registrarVecino(
      rut,
      'ClaveVencimiento-2026!',
    )

    const codigoCorrecto = await emitirCodigo(
      contexto,
      rut,
      'olvido_sin_contacto',
    )

    const recuperacionesAntes = await consultar(
      `recuperaciones_cuenta?select=id,estado,expira_en&vecino_id=eq.${vecinoId}&order=creado_en.desc&limit=1`,
    )

    assertEquals(recuperacionesAntes.length, 1)
    assertEquals(
      recuperacionesAntes[0].estado,
      'pendiente',
    )

    const recuperacionId =
      recuperacionesAntes[0].id as string

    // Acortamos únicamente la expiración de este registro de prueba.
    // Sigue siendo posterior a su creación, respetando las constraints.
    await actualizar(
      'recuperaciones_cuenta',
      `id=eq.${recuperacionId}`,
      {
        expira_en: new Date(
          Date.now() + 1_500,
        ).toISOString(),
      },
    )

    // Esperamos a que esa expiración simulada ocurra.
    await new Promise((resolve) =>
      setTimeout(resolve, 2_000)
    )

    // Incluso presentando el código verdadero,
    // una recuperación vencida debe rechazarse.
    const respuesta = await llamar(
      'recuperacion-cuenta-vecino',
      {
        accion: 'validar_codigo',
        rut,
        codigo: codigoCorrecto,
      },
    )

    assertEquals(respuesta.estado, 401)
    assertEquals(
      respuesta.cuerpo.codigo,
      'CODIGO_INVALIDO',
    )

    const recuperacionesDespues = await consultar(
      `recuperaciones_cuenta?select=estado&id=eq.${recuperacionId}`,
    )

    assertEquals(recuperacionesDespues.length, 1)
    assertEquals(
      recuperacionesDespues[0].estado,
      'expirada',
      'el intento sobre un código vencido deja la recuperación como expirada',
    )
  },
)
Deno.test(
  'recuperación limita intentos masivos desde una misma IP',
  async () => {
    // Una IP distinta en cada ejecución del test evita heredar
    // bloqueos de ejecuciones anteriores en la base local.
    const ipAtaque = ipAleatoria()

    // El límite general de validar_codigo es 30 solicitudes
    // dentro de 15 minutos.
    //
    // Variamos el RUT para no disparar el límite RUT+IP:
    // queremos comprobar específicamente la protección global por IP.
    for (let intento = 1; intento < 30; intento++) {
      const respuesta = await llamar(
        'recuperacion-cuenta-vecino',
        {
          accion: 'validar_codigo',
          rut: rutAleatorio(),
          codigo: '000000',
        },
        ipAtaque,
      )

      assertEquals(
        respuesta.estado,
        401,
        `el intento ${intento} todavía debe recibir rechazo genérico`,
      )

      assertEquals(
        respuesta.cuerpo.codigo,
        'CODIGO_INVALIDO',
      )
    }

    // La solicitud número 30 alcanza el límite general por IP
    // y debe ser detenida antes de continuar procesando códigos.
    const bloqueada = await llamar(
      'recuperacion-cuenta-vecino',
      {
        accion: 'validar_codigo',
        rut: rutAleatorio(),
        codigo: '000000',
      },
      ipAtaque,
    )

    assertEquals(bloqueada.estado, 429)

    assertEquals(
      bloqueada.cuerpo.codigo,
      'DEMASIADOS_INTENTOS',
    )

    assert(
      typeof bloqueada.cuerpo.hasta === 'string',
      'la respuesta informa hasta cuándo permanece el bloqueo',
    )

    // Una solicitud posterior desde esa misma IP
    // debe seguir bloqueada.
    const posterior = await llamar(
      'recuperacion-cuenta-vecino',
      {
        accion: 'validar_codigo',
        rut: rutAleatorio(),
        codigo: '000000',
      },
      ipAtaque,
    )

    assertEquals(posterior.estado, 429)

    assertEquals(
      posterior.cuerpo.codigo,
      'DEMASIADOS_INTENTOS',
    )
  },
)
Deno.test(
  'cambio de contraseña limita tokens inválidos por recuperación e IP',
  async () => {
    const ipAtaque = ipAleatoria()
    const recuperacionId = crypto.randomUUID()
    const tokenFalso = 'a'.repeat(64)

    // El límite específico recuperación + IP es 10 intentos.
    for (let intento = 1; intento < 10; intento++) {
      const respuesta = await llamar(
        'recuperacion-cuenta-vecino',
        {
          accion: 'cambiar_contrasena',
          recuperacion_id: recuperacionId,
          token_recuperacion: tokenFalso,
          contrasena: 'ClaveFalsa-2026!',
        },
        ipAtaque,
      )

      assertEquals(
        respuesta.estado,
        401,
        `el intento ${intento} todavía debe recibir rechazo genérico`,
      )

      assertEquals(
        respuesta.cuerpo.codigo,
        'RECUPERACION_INVALIDA',
      )
    }

    // El décimo intento inválido debe activar
    // el bloqueo específico recuperación + IP.
    const bloqueada = await llamar(
      'recuperacion-cuenta-vecino',
      {
        accion: 'cambiar_contrasena',
        recuperacion_id: recuperacionId,
        token_recuperacion: tokenFalso,
        contrasena: 'ClaveFalsa-2026!',
      },
      ipAtaque,
    )

    assertEquals(bloqueada.estado, 429)

    assertEquals(
      bloqueada.cuerpo.codigo,
      'DEMASIADOS_INTENTOS',
    )

    assert(
      typeof bloqueada.cuerpo.hasta === 'string',
      'la respuesta informa hasta cuándo permanece el bloqueo',
    )

    // Un nuevo intento con la misma recuperación
    // y la misma IP debe continuar bloqueado.
    const posterior = await llamar(
      'recuperacion-cuenta-vecino',
      {
        accion: 'cambiar_contrasena',
        recuperacion_id: recuperacionId,
        token_recuperacion: tokenFalso,
        contrasena: 'OtraClaveFalsa-2026!',
      },
      ipAtaque,
    )

    assertEquals(posterior.estado, 429)

    assertEquals(
      posterior.cuerpo.codigo,
      'DEMASIADOS_INTENTOS',
    )
  },
)