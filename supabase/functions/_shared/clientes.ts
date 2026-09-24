import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

// Secret API key (sb_secret_...) para iniciar sesión en Auth reenviando la IP
// real del vecino con Sb-Forwarded-For. Solo vive como secreto de la función
// (supabase secrets set AUTH_SECRET_KEY=...). Nunca se expone al cliente.
// Los nombres que empiezan con SUPABASE_ están reservados, por eso AUTH_.
const AUTH_SECRET_KEY = Deno.env.get('AUTH_SECRET_KEY') ?? ''
const MODO_PRUEBAS_LOCALES = Deno.env.get('MODO_PRUEBAS_LOCALES') === 'true'

const opciones = { auth: { persistSession: false, autoRefreshToken: false } }

// Cliente con service_role: el ÚNICO que puede ejecutar las funciones de identidad.
export function clienteServicio(): SupabaseClient {
  return createClient(URL, SERVICE_ROLE, opciones)
}

// Error de infraestructura de seguridad: la función responde 503 en vez de
// continuar sin protección.
export class ErrorProteccion extends Error {}

// Ejecuta una RPC y lanza ErrorProteccion si falla. Para los controles
// antiabuso y las validaciones previas a autenticar o registrar.
export async function rpcObligatoria<T>(
  cliente: SupabaseClient,
  funcion: string,
  parametros: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await cliente.rpc(funcion, parametros)
  if (error) throw new ErrorProteccion(`${funcion}: ${error.code ?? 'error'}`)
  return data as T
}

export interface SesionVecino {
  access_token: string
  refresh_token: string
  expires_at: number | null
}

export type ResultadoSesion =
  | { tipo: 'ok'; sesion: SesionVecino }
  | { tipo: 'credenciales' }
  | { tipo: 'limite_auth' }

// Cliente para el endpoint de login de Auth.
//
// Producción: secret key + Sb-Forwarded-For con la IP del vecino, para que
// los límites de Supabase Auth se cuenten por vecino y no por la IP de la
// Edge Function. Requiere habilitar IP Address Forwarding en Auth.
//
// Local: solo con MODO_PRUEBAS_LOCALES=true se permite caer a la anon key
// (el CLI local no usa secret keys). Fuera de ese modo, sin AUTH_SECRET_KEY
// la función se niega a autenticar.
function clienteLogin(ip: string | null): SupabaseClient {
  if (AUTH_SECRET_KEY.startsWith('sb_secret_')) {
    return createClient(URL, AUTH_SECRET_KEY, {
      ...opciones,
      global: { headers: ip ? { 'Sb-Forwarded-For': ip } : {} },
    })
  }
  if (MODO_PRUEBAS_LOCALES) {
    return createClient(URL, ANON, opciones)
  }
  throw new ErrorProteccion('AUTH_SECRET_KEY no configurada: login deshabilitado')
}

// Inicia sesión con el correo técnico y devuelve solo los tokens. El correo
// técnico nunca sale de la función.
export async function iniciarSesionTecnica(
  correoTecnico: string,
  contrasena: string,
  ip: string | null,
): Promise<ResultadoSesion> {
  const { data, error } = await clienteLogin(ip).auth.signInWithPassword({
    email: correoTecnico,
    password: contrasena,
  })
  if (error) {
    // 429 de Auth: límite de la plataforma, no contraseña incorrecta.
    return error.status === 429 ? { tipo: 'limite_auth' } : { tipo: 'credenciales' }
  }
  if (!data.session) return { tipo: 'credenciales' }
  return {
    tipo: 'ok',
    sesion: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at ?? null,
    },
  }
}
