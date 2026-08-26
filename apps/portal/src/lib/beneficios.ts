import type { Database, Tables } from '@club-regalones/domain'
import { supabase } from './supabase'

export type NegocioBeneficioAdmin = Pick<
  Tables<'negocios'>,
  'id' | 'nombre' | 'estado'
>

export type VersionBeneficioAdmin = Pick<
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

export type BeneficioRegisAdmin = Pick<
  Tables<'beneficios_regis'>,
  'id' | 'negocio_id' | 'codigo' | 'creado_en'
> & {
  nombre_negocio: string
  versiones: VersionBeneficioAdmin[]
  version_actual: VersionBeneficioAdmin | null
}

export type ConfiguracionBeneficioRegis = {
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

export type RegistroSupervisionBeneficio = Pick<
  Tables<'registro_supervision_beneficios'>,
  | 'id'
  | 'beneficio_id'
  | 'beneficio_version_id'
  | 'negocio_id'
  | 'actor_id'
  | 'accion'
  | 'motivo'
  | 'creado_en'
>

export async function listarGestionBeneficios() {
  const [
    respuestaNegocios,
    respuestaBeneficios,
    respuestaVersiones,
    respuestaRegistro,
  ] =
    await Promise.all([
      supabase
        .from('negocios')
        .select('id, nombre, estado')
        .eq('estado', 'activo')
        .order('nombre'),
      supabase
        .from('beneficios_regis')
        .select('id, negocio_id, codigo, creado_en')
        .order('creado_en', { ascending: false }),
      supabase
        .from('versiones_beneficio_regis')
        .select(
          'id, beneficio_id, version, nombre, descripcion, tipo, porcentaje_descuento_bp, monto_descuento_fijo_clp, costo_regis, compra_minima_clp, tope_descuento_clp, cupos_totales, limite_por_vecino, mostrar_cupos, estado, vigencia_desde, vigencia_hasta, valor_regis_clp, porcentaje_maximo_canje_bp, publicado_en, creado_en',
        )
        .order('version', { ascending: false }),
      supabase
        .from('registro_supervision_beneficios')
        .select(
          'id, beneficio_id, beneficio_version_id, negocio_id, actor_id, accion, motivo, creado_en',
        )
        .order('creado_en', { ascending: false }),
    ])

  if (respuestaNegocios.error) throw respuestaNegocios.error
  if (respuestaBeneficios.error) throw respuestaBeneficios.error
  if (respuestaVersiones.error) throw respuestaVersiones.error
  if (respuestaRegistro.error) throw respuestaRegistro.error

  const negocios = respuestaNegocios.data as NegocioBeneficioAdmin[]
  const versiones = respuestaVersiones.data as VersionBeneficioAdmin[]
  const nombresNegocios = new Map(
    negocios.map((negocio) => [negocio.id, negocio.nombre]),
  )

  const beneficios = respuestaBeneficios.data.map((beneficio) => {
    const versionesBeneficio = versiones.filter(
      (version) => version.beneficio_id === beneficio.id,
    )

    return {
      ...beneficio,
      nombre_negocio:
        nombresNegocios.get(beneficio.negocio_id) ?? 'Comercio sin nombre',
      versiones: versionesBeneficio,
      version_actual: versionesBeneficio[0] ?? null,
    } satisfies BeneficioRegisAdmin
  })

  return {
    negocios,
    beneficios,
    registro:
      respuestaRegistro.data as RegistroSupervisionBeneficio[],
  }
}

function argumentosConfiguracion(configuracion: ConfiguracionBeneficioRegis) {
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

export async function crearBeneficioRegis(
  configuracion: ConfiguracionBeneficioRegis,
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

export async function versionarBeneficioRegis(
  beneficioId: string,
  configuracion: ConfiguracionBeneficioRegis,
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

export async function pausarBeneficioPorSupervision(
  beneficioVersionId: string,
  motivo: string,
) {
  const { data, error } = await supabase.rpc('cambiar_estado_beneficio_regis', {
    p_beneficio_version_id: beneficioVersionId,
    p_estado: 'pausado',
    p_motivo: motivo,
  })

  if (error) throw error
  return data
}
