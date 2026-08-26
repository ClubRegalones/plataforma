const mensajesConocidos: Record<string, string> = {
  'Invalid login credentials': 'El correo o la contraseña no son correctos.',
  'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesión.',
  'User already registered': 'Ya existe una cuenta con este correo.',
  'Password should be at least 6 characters':
    'La contraseña debe tener al menos 6 caracteres.',
}

export function mensajeSupabase(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes('beneficios_regis_codigo_negocio_unico')) {
      return 'Ya existe un beneficio con ese código interno. Abre el beneficio existente o utiliza otro código.'
    }
    return mensajesConocidos[error.message] ?? error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    if (error.message.includes('beneficios_regis_codigo_negocio_unico')) {
      return 'Ya existe un beneficio con ese código interno. Abre el beneficio existente o utiliza otro código.'
    }
    return mensajesConocidos[error.message] ?? error.message
  }

  return 'Ocurrió un error inesperado. Inténtalo nuevamente.'
}
