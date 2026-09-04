import { supabase } from './supabase'

export type SesionLectorLocal = {
  sesionId: string
  tokenLector: string
  terminalIdentificador: string
  cajaNombre: string
  expiraEn: string
}

const CLAVE_SESION_LECTOR = 'club-regalones:lector-movil'

export function leerSesionLector() {
  const guardada = window.sessionStorage.getItem(CLAVE_SESION_LECTOR)
  if (!guardada) return null

  try {
    return JSON.parse(guardada) as SesionLectorLocal
  } catch {
    window.sessionStorage.removeItem(CLAVE_SESION_LECTOR)
    return null
  }
}

export function guardarSesionLector(sesion: SesionLectorLocal) {
  window.sessionStorage.setItem(CLAVE_SESION_LECTOR, JSON.stringify(sesion))
}

export function eliminarSesionLector() {
  window.sessionStorage.removeItem(CLAVE_SESION_LECTOR)
}

export async function vincularLector(tokenVinculacion: string) {
  const { data, error } = await supabase.rpc('vincular_lector_movil', {
    p_token_vinculacion: tokenVinculacion,
    p_nombre_lector: obtenerNombreTelefono(),
  })

  if (error) throw error
  const resultado = data[0]
  if (!resultado) return null

  const sesion: SesionLectorLocal = {
    sesionId: resultado.sesion_id,
    tokenLector: resultado.token_lector,
    terminalIdentificador: resultado.terminal_identificador,
    cajaNombre: resultado.caja_nombre,
    expiraEn: resultado.expira_en,
  }
  guardarSesionLector(sesion)
  return sesion
}

export async function validarSesionLector(sesion: SesionLectorLocal) {
  const { data, error } = await supabase.rpc('consultar_estado_lector_movil', {
    p_token_lector: sesion.tokenLector,
  })

  if (error) throw error
  return data[0] ?? null
}

export async function enviarLecturaLlavero(
  sesion: SesionLectorLocal,
  tokenLlavero: string,
) {
  const { data, error } = await supabase.rpc(
    'registrar_lectura_llavero_terminal',
    {
      p_token_lector: sesion.tokenLector,
      p_token_llavero: tokenLlavero,
    },
  )

  if (error) throw error
  return data[0] ?? null
}

function obtenerNombreTelefono() {
  const plataforma = navigator.platform
  return plataforma ? `Lector ${plataforma}` : 'Celular lector'
}

export function extraerTokenLlavero(valor: string) {
  const limpio = valor.trim()
  if (!limpio) return ''

  try {
    const url = new URL(limpio)
    const hash = url.hash.replace(/^#/, '')
    const parametrosHash = new URLSearchParams(
      hash.includes('?') ? hash.split('?')[1] : hash,
    )
    return (
      parametrosHash.get('llavero') ??
      parametrosHash.get('t') ??
      url.searchParams.get('llavero') ??
      url.searchParams.get('t') ??
      limpio
    )
  } catch {
    return limpio
  }
}
