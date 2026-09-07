import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const EMAIL = 'duena.piloto@regalones.local'
const PASSWORD = 'Regalones1234!'
const proyecto = 'club-regalones'
const carpetaActual = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(carpetaActual, '..')
const cliSupabase = resolve(
  raiz,
  'node_modules',
  'supabase',
  'dist',
  'supabase.js',
)

function parsearEnv(contenido) {
  return Object.fromEntries(
    contenido
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => linea && !linea.startsWith('#') && linea.includes('='))
      .map((linea) => {
        const indice = linea.indexOf('=')
        const clave = linea.slice(0, indice).trim()
        const valor = linea
          .slice(indice + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '')
        return [clave, valor]
      }),
  )
}

function leerConfiguracionLocal() {
  const variables = { ...process.env }

  // Vite admite .env y .env.local. Leemos ambos para que este script siga
  // exactamente la misma convención que las apps del monorepo.
  for (const nombre of ['.env', '.env.local']) {
    const ruta = resolve(raiz, nombre)
    if (existsSync(ruta)) {
      Object.assign(variables, parsearEnv(readFileSync(ruta, 'utf8')))
    }
  }

  let url = variables.VITE_SUPABASE_URL
  let publishableKey = variables.VITE_SUPABASE_PUBLISHABLE_KEY

  if (url && publishableKey) {
    return { url, publishableKey }
  }

  // Si el proyecto no usa archivo .env, obtenemos las credenciales del
  // Supabase local que ya está levantado. Así el escenario no depende de un
  // archivo local específico de cada computador.
  const estado = spawnSync(
    process.execPath,
    [cliSupabase, 'status', '-o', 'env'],
    { cwd: raiz, encoding: 'utf8' },
  )

  if (estado.error || estado.status !== 0) {
    throw new Error(
      'No pudimos leer la configuración de Supabase local. Ejecuta primero pnpm db:start.',
    )
  }

  const variablesSupabase = parsearEnv(estado.stdout)
  url =
    variablesSupabase.API_URL ||
    variablesSupabase.PROJECT_URL ||
    variablesSupabase.SUPABASE_URL
  publishableKey =
    variablesSupabase.PUBLISHABLE_KEY ||
    variablesSupabase.ANON_KEY ||
    variablesSupabase.SUPABASE_ANON_KEY

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase local está activo, pero no pudimos resolver su URL o clave pública.',
    )
  }

  return { url, publishableKey }
}

function buscarContenedorDb() {
  const listado = spawnSync(
    'docker',
    [
      'ps',
      '--filter',
      `label=com.supabase.cli.project=${proyecto}`,
      '--format',
      '{{.Names}}',
    ],
    { encoding: 'utf8' },
  )

  if (listado.error || listado.status !== 0) {
    throw new Error('No pudimos consultar Docker. Comprueba que Docker Desktop esté abierto.')
  }

  const nombre = listado.stdout
    .split(/\r?\n/)
    .map((valor) => valor.trim())
    .find((valor) => valor.includes('supabase_db_'))

  if (!nombre) {
    throw new Error('No encontramos Supabase local. Ejecuta primero pnpm db:start.')
  }

  return nombre
}

async function asegurarUsuario(url, publishableKey) {
  const respuesta = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      data: {
        nombre: 'Dueña Piloto',
        apellido: 'Regalones',
      },
    }),
  })

  if (respuesta.ok) return

  const detalle = await respuesta.text()
  const yaExiste = /already|registered|exists/i.test(detalle)

  if (!yaExiste) {
    throw new Error(`No pudimos crear la cuenta local de prueba: ${detalle}`)
  }
}

async function main() {
  const { url, publishableKey } = leerConfiguracionLocal()

  const host = new URL(url).hostname
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      'Este comando solo puede ejecutarse contra Supabase local. Se canceló por seguridad.',
    )
  }

  await asegurarUsuario(url.replace(/\/$/, ''), publishableKey)

  const sql = readFileSync(
    resolve(raiz, 'supabase', 'dev', 'escenario_app_negocio.sql'),
    'utf8',
  )
  const baseDatos = buscarContenedorDb()
  const ejecucion = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      baseDatos,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  )

  if (ejecucion.error || ejecucion.status !== 0) {
    throw new Error('No pudimos cargar los datos locales del escenario App Negocio.')
  }

  console.log('')
  console.log('Escenario local App Negocio listo ✅')
  console.log('Correo: ' + EMAIL)
  console.log('Contraseña: ' + PASSWORD)
  console.log('Negocio: Almacén Piloto Regalones')
  console.log('Sucursal: La Serena Centro')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
