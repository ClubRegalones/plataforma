export function mensajeSupabase(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message)
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.'
}
