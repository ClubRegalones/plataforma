import type { Database, Tables } from '@club-regalones/domain'
import { supabase } from './supabase'

export type NegocioGestionBeneficios = Pick<
  Tables<'negocios'>,
  'id' | 'nombre' | 'estado'
>

export type ReglaRegisGestion = Pick<
  Tables<'reglas_regis'>,
  | 'id'
  | 'negocio_id'
  | 'version'
  | 'valor_regis_clp'
  | 'porcentaje_maximo_canje_bp'
>

export type VersionBeneficioGestion = Pick<
  Tables<'versiones_beneficio_regis'>,
  | 'id'
  | 'beneficio_id'
  | 'version'
  | 'nombre'
  | 'descripcion'
  | 'tipo'
  | 'porcentaje_descuento_bp'
  | 'monto_descuento_fijo_clp'
  | 'costo_regis'
  | 'compra_minima_clp'
  | 'tope_descuento_clp'
  | 'cupos_totales'
  | 'limite_por_vecino'
  | 'mostrar_cupos'
  | 'estado'
  | 'vigencia_desde'
  | 'vigencia_hasta'
  | 'valor_regis_clp'
  | 'porcentaje_maximo_canje_bp'
  | 'publicado_en'
  | 'creado_en'
>

export type BeneficioGestion = Pick<
  Tables<'beneficios_regis'>,
  'id' | 'negocio_id' | 'codigo' | 'creado_en'
> & {
  nombre_negocio: string
  versiones: VersionBeneficioGestion[]
  version_actual: VersionBeneficioGestion | null
}

export type EventoSupervisionBeneficio = Pick<
  Tables<'registro_supervision_beneficios'>,
  | 'id'
  | 'beneficio_id'
  | 'beneficio_version_id'
  | 'accion'
  | 'motivo'
  | 'creado_en'
>

export type ConfiguracionBeneficio = {
  negocioId: string
  codigo: string
  nombre: string
  descripcion: string | null
  tipo: Database['public']['Enums']['tipo_beneficio_regis']
  costoRegis: number
  compraMinimaClp: number
  porcentajeDescuentoBp: number | null
  montoDescuentoFijoClp: number | null
  topeDescuentoClp: number | null
  cuposTotales: number | null
  limitePorVecino: number
  mostrarCupos: boolean
  vigenciaDesde: string
  vigenciaHasta: string | null
}

export async function listarGestionBeneficiosComercio(usuarioId: string) {
  const { data: membresias, error: errorMembresias } = await supabase
    .from('miembros_negocio')
    .select('negocio_id, rol')
    .eq('usuario_id', usuarioId)
    .eq('estado', 'activo')

  if (errorMembresias) throw errorMembresias

  const negociosPermitidosIds = membresias
    .filter(({ rol }) => rol === 'propietario' || rol === 'administrador')
    .map(({ negocio_id }) => negocio_id)

  if (negociosPermitidosIds.length === 0) {
    return {
      puedeGestionar: false,
      negocios: [] as NegocioGestionBeneficios[],
      beneficios: [] as BeneficioGestion[],
      eventos: [] as EventoSupervisionBeneficio[],
      reglas: [] as ReglaRegisGestion[],
    }
  }

  const { data: negocios, error: errorNegocios } = await supabase
    .from('negocios')
    .select('id, nombre, estado')
    .in('id', negociosPermitidosIds)
    .eq('estado', 'activo')
    .order('nombre')

  if (errorNegocios) throw errorNegocios

  const idsActivos = negocios.map(({ id }) => id)
  if (idsActivos.length === 0) {
    return {
      puedeGestionar: true,
      negocios: [] as NegocioGestionBeneficios[],
      beneficios: [] as BeneficioGestion[],
      eventos: [] as EventoSupervisionBeneficio[],
      reglas: [] as ReglaRegisGestion[],
    }
  }

  const [respuestaBeneficios, respuestaEventos, respuestaReglas] = await Promise.all([
    supabase
      .from('beneficios_regis')
      .select('id, negocio_id, codigo, creado_en')
      .in('negocio_id', idsActivos)
      .order('creado_en', { ascending: false }),
    supabase
      .from('registro_supervision_beneficios')
      .select(
        'id, beneficio_id, beneficio_version_id, accion, motivo, creado_en',
      )
      .in('negocio_id', idsActivos)
      .order('creado_en', { ascending: false }),
    supabase
      .from('reglas_regis')
      .select(
        'id, negocio_id, version, valor_regis_clp, porcentaje_maximo_canje_bp',
      )
      .eq('activa', true)
      .or(`negocio_id.is.null,negocio_id.in.(${idsActivos.join(',')})`)
      .order('version', { ascending: false }),
  ])

  if (respuestaBeneficios.error) throw respuestaBeneficios.error
  if (respuestaEventos.error) throw respuestaEventos.error
  if (respuestaReglas.error) throw respuestaReglas.error

  const beneficiosBase = respuestaBeneficios.data
  const beneficiosIds = beneficiosBase.map(({ id }) => id)
  const { data: versiones, error: errorVersiones } = beneficiosIds.length
    ? await supabase
        .from('versiones_beneficio_regis')
        .select(
          'id, beneficio_id, version, nombre, descripcion, tipo, porcentaje_descuento_bp, monto_descuento_fijo_clp, costo_regis, compra_minima_clp, tope_descuento_clp, cupos_totales, limite_por_vecino, mostrar_cupos, estado, vigencia_desde, vigencia_hasta, valor_regis_clp, porcentaje_maximo_canje_bp, publicado_en, creado_en',
        )
        .in('beneficio_id', beneficiosIds)
        .order('version', { ascending: false })
    : { data: [] as VersionBeneficioGestion[], error: null }

  if (errorVersiones) throw errorVersiones

  const nombresNegocios = new Map(negocios.map(({ id, nombre }) => [id, nombre]))
  const beneficios = beneficiosBase.map((beneficio) => {
    const versionesBeneficio = versiones.filter(
      (version) => version.beneficio_id === beneficio.id,
    )

    return {
      ...beneficio,
      nombre_negocio:
        nombresNegocios.get(beneficio.negocio_id) ?? 'Comercio sin nombre',
      versiones: versionesBeneficio,
      version_actual: versionesBeneficio[0] ?? null,
    } satisfies BeneficioGestion
  })

  return {
    puedeGestionar: true,
    negocios: negocios as NegocioGestionBeneficios[],
    beneficios,
    eventos: respuestaEventos.data as EventoSupervisionBeneficio[],
    reglas: respuestaReglas.data as ReglaRegisGestion[],
  }
}

function argumentosConfiguracion(configuracion: ConfiguracionBeneficio) {
  return {
    p_nombre: configuracion.nombre,
    p_tipo: configuracion.tipo,
    p_costo_regis: configuracion.costoRegis,
    p_compra_minima_clp: configuracion.compraMinimaClp,
    p_porcentaje_descuento_bp:
      configuracion.porcentajeDescuentoBp ?? undefined,
    p_monto_descuento_fijo_clp:
      configuracion.montoDescuentoFijoClp ?? undefined,
    p_tope_descuento_clp: configuracion.topeDescuentoClp ?? undefined,
    p_cupos_totales: configuracion.cuposTotales ?? undefined,
    p_limite_por_vecino: configuracion.limitePorVecino,
    p_vigencia_desde: configuracion.vigenciaDesde,
    p_vigencia_hasta: configuracion.vigenciaHasta ?? undefined,
    p_descripcion: configuracion.descripcion ?? undefined,
    p_mostrar_cupos: configuracion.mostrarCupos,
  }
}

export async function crearBeneficio(
  configuracion: ConfiguracionBeneficio,
  publicar: boolean,
) {
  const { data, error } = await supabase.rpc('crear_beneficio_regis', {
    p_negocio_id: configuracion.negocioId,
    p_codigo: configuracion.codigo,
    ...argumentosConfiguracion(configuracion),
    p_publicar: publicar,
  })

  if (error) throw error
  return data
}

export async function versionarBeneficio(
  beneficioId: string,
  configuracion: ConfiguracionBeneficio,
  publicar: boolean,
) {
  const { data, error } = await supabase.rpc('versionar_beneficio_regis', {
    p_beneficio_id: beneficioId,
    ...argumentosConfiguracion(configuracion),
    p_publicar: publicar,
  })

  if (error) throw error
  return data
}

export async function cambiarEstadoBeneficio(
  beneficioVersionId: string,
  estado: 'activo' | 'pausado' | 'finalizado',
  motivo: string,
) {
  const { data, error } = await supabase.rpc('cambiar_estado_beneficio_regis', {
    p_beneficio_version_id: beneficioVersionId,
    p_estado: estado,
    p_motivo: motivo,
  })

  if (error) throw error
  return data
}
