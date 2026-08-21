const mensajesConocidos: Record<string, string> = {
  'Invalid login credentials': 'El correo o la contraseña no son correctos.',
  'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesión.',
}

export function mensajeSupabase(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return mensajesConocidos[error.message] ?? error.message
  }

  return 'Ocurrió un error inesperado. Inténtalo nuevamente.'
}
