import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cli = resolve('node_modules/supabase/dist/supabase.js')
const destino = resolve('packages/domain/src/database.types.ts')

const resultado = spawnSync(
  process.execPath,
  [cli, 'gen', 'types', 'typescript', '--local'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  },
)

if (resultado.status !== 0) {
  if (resultado.stdout) process.stdout.write(resultado.stdout)
  if (resultado.stderr) process.stderr.write(resultado.stderr)
  process.exit(resultado.status ?? 1)
}

if (!resultado.stdout?.includes('export type Database')) {
  throw new Error('Supabase no devolvió tipos válidos. No se modificó database.types.ts.')
}

writeFileSync(destino, resultado.stdout, 'utf8')
console.log('Tipos de Supabase actualizados en packages/domain/src/database.types.ts ✅')
