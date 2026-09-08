export type TemaAppNegocio = 'claro' | 'oscuro'

const CLAVE_TEMA = 'club-regalones:tema:v1'

function temaDelSistema(): TemaAppNegocio {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}

export function obtenerTemaGuardado(): TemaAppNegocio {
  const guardado = window.localStorage.getItem(CLAVE_TEMA)
  if (guardado === 'claro' || guardado === 'oscuro') return guardado
  return temaDelSistema()
}

export function aplicarTema(tema: TemaAppNegocio) {
  document.documentElement.dataset.tema = tema
  document.documentElement.style.colorScheme = tema === 'oscuro' ? 'dark' : 'light'
}

export function inicializarTema() {
  const tema = obtenerTemaGuardado()
  aplicarTema(tema)
  return tema
}

export function guardarTema(tema: TemaAppNegocio) {
  window.localStorage.setItem(CLAVE_TEMA, tema)
  aplicarTema(tema)
}
