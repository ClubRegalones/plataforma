import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const carpetaActual = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(carpetaActual, '..')
const cliSupabase = resolve(
  raiz,
  'node_modules',
  'supabase',
  'dist',
  'supabase.js',
)

const aplicacionesPermitidas = new Set([
  '@club-regalones/negocio',
  '@club-regalones/comercio',
  '@club-regalones/vecino',
  '@club-regalones/portal',
])

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

function leerSupabaseLocal() {
  const estado = spawnSync(
    process.execPath,
    [cliSupabase, 'status', '-o', 'env'],
    { cwd: raiz, encoding: 'utf8' },
  )

  if (estado.error || estado.status !== 0) {
    throw new Error(
      'No pudimos leer Supabase local. Ejecuta primero pnpm db:start.',
    )
  }

  const variables = parsearEnv(estado.stdout)
  const url =
    variables.API_URL ||
    variables.PROJECT_URL ||
    variables.SUPABASE_URL
  const publishableKey =
    variables.PUBLISHABLE_KEY ||
    variables.ANON_KEY ||
    variables.SUPABASE_ANON_KEY

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase local está activo, pero no pudimos resolver su URL o clave pública.',
    )
  }

  const host = new URL(url).hostname
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      'Supabase CLI devolvió un destino no local. Se canceló por seguridad.',
    )
  }

  return {
    url: url.replace(/\/$/, ''),
    publishableKey,
  }
}

function main() {
  const aplicacion = process.argv[2]

  if (!aplicacion || !aplicacionesPermitidas.has(aplicacion)) {
    throw new Error('Aplicación local no permitida para este comando.')
  }

  const { url, publishableKey } = leerSupabaseLocal()

  console.log(`Conectando ${aplicacion} a Supabase local: ${url}`)

  const hijo = spawn(
    'pnpm',
    ['--filter', aplicacion, 'dev'],
    {
      cwd: raiz,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      },
    },
  )

  hijo.on('error', (error) => {
    console.error('No pudimos iniciar la aplicación local:', error.message)
    process.exit(1)
  })

  hijo.on('exit', (codigo) => {
    process.exit(codigo ?? 0)
  })
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
