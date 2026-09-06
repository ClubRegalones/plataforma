import type { Tables } from '@club-regalones/domain'
import { supabase } from './supabase'

export type NegocioGestion = Tables<'negocios'>
export type SucursalGestion = Tables<'sucursales'>
export type CajaGestion = Tables<'cajas'>
export type TerminalGestion = Omit<Tables<'terminales'>, 'token_hash'>
export type MiembroGestion = Tables<'miembros_negocio'> & {
  nombre: string
  apellido: string | null
}

export type CajeroGestion = {
  cajero_id: string
  nombre: string
  apellido: string | null
  rol: 'cajero' | 'supervisor'
  estado: 'activo' | 'inactivo'
  sucursal_ids: string[]
  creado_en: string
}

export type GestionNegocio = {
  negocios: NegocioGestion[]
  sucursales: SucursalGestion[]
  cajas: CajaGestion[]
  terminales: TerminalGestion[]
  miembros: MiembroGestion[]
  rolesPropios: Map<string, Tables<'miembros_negocio'>['rol']>
}

type Rpc = <T>(
  funcion: string,
  parametros: Record<string, unknown>,
) => Promise<{ data: T[] | null; error: unknown }>

const rpc = supabase.rpc.bind(supabase) as unknown as Rpc

export async function listarGestionNegocio(usuarioId: string): Promise<GestionNegocio> {
  const { data: membresias, error: errorMembresias } = await supabase
    .from('miembros_negocio')
    .select('*')
    .eq('usuario_id', usuarioId)
    .eq('estado', 'activo')

  if (errorMembresias) throw errorMembresias

  const negocioIds = membresias.map(({ negocio_id }) => negocio_id)
  if (negocioIds.length === 0) {
    return {
      negocios: [],
      sucursales: [],
      cajas: [],
      terminales: [],
      miembros: [],
      rolesPropios: new Map(),
    }
  }

  const [respuestaNegocios, respuestaSucursales, respuestaMiembros] = await Promise.all([
    supabase.from('negocios').select('*').in('id', negocioIds).order('nombre'),
    supabase.from('sucursales').select('*').in('negocio_id', negocioIds).order('nombre'),
    supabase.from('miembros_negocio').select('*').in('negocio_id', negocioIds).order('creado_en'),
  ])

  if (respuestaNegocios.error) throw respuestaNegocios.error
  if (respuestaSucursales.error) throw respuestaSucursales.error
  if (respuestaMiembros.error) throw respuestaMiembros.error

  const sucursalIds = respuestaSucursales.data.map(({ id }) => id)
  const respuestaCajas = sucursalIds.length
    ? await supabase.from('cajas').select('*').in('sucursal_id', sucursalIds).order('nombre')
    : { data: [] as CajaGestion[], error: null }

  if (respuestaCajas.error) throw respuestaCajas.error

  const cajaIds = respuestaCajas.data.map(({ id }) => id)
  const respuestaTerminales = cajaIds.length
    ? await supabase
        .from('terminales')
        .select('id, caja_id, identificador_publico, nombre_dispositivo, version_app, estado, ultima_conexion_en, creado_en, actualizado_en')
        .in('caja_id', cajaIds)
        .order('creado_en', { ascending: false })
    : { data: [] as TerminalGestion[], error: null }

  if (respuestaTerminales.error) throw respuestaTerminales.error

  const usuarioIds = respuestaMiembros.data.map(({ usuario_id }) => usuario_id)
  const respuestaPerfiles = usuarioIds.length
    ? await supabase.from('perfiles').select('id, nombre, apellido').in('id', usuarioIds)
    : { data: [] as { id: string; nombre: string; apellido: string | null }[], error: null }

  if (respuestaPerfiles.error) throw respuestaPerfiles.error
  const perfiles = new Map(respuestaPerfiles.data.map((perfil) => [perfil.id, perfil]))

  return {
    negocios: respuestaNegocios.data,
    sucursales: respuestaSucursales.data,
    cajas: respuestaCajas.data,
    terminales: respuestaTerminales.data,
    miembros: respuestaMiembros.data.map((miembro) => ({
      ...miembro,
      nombre: perfiles.get(miembro.usuario_id)?.nombre ?? 'Usuario',
      apellido: perfiles.get(miembro.usuario_id)?.apellido ?? null,
    })),
    rolesPropios: new Map(membresias.map(({ negocio_id, rol }) => [negocio_id, rol])),
  }
}

export async function listarCajerosGestion(negocioId: string) {
  const { data, error } = await rpc<CajeroGestion>(
    'listar_cajeros_negocio_gestion',
    { p_negocio_id: negocioId },
  )

  if (error) throw error
  return data ?? []
}

export async function crearCajeroGestion(
  negocioId: string,
  nombre: string,
  apellido: string,
  pin: string,
  sucursalIds: string[],
) {
  const { error } = await rpc<unknown>('crear_cajero_negocio', {
    p_negocio_id: negocioId,
    p_nombre: nombre.trim(),
    p_apellido: apellido.trim() || null,
    p_pin: pin,
    p_sucursal_ids: sucursalIds,
    p_rol: 'cajero',
  })

  if (error) throw error
}

export async function crearSucursal(negocioId: string, nombre: string, direccion: string, comuna: string) {
  const { error } = await supabase.from('sucursales').insert({
    negocio_id: negocioId,
    nombre: nombre.trim(),
    direccion: direccion.trim(),
    comuna: comuna.trim(),
  })
  if (error) throw error
}

export async function cambiarEstadoSucursal(sucursalId: string, estado: SucursalGestion['estado']) {
  const { error } = await supabase.from('sucursales').update({ estado }).eq('id', sucursalId)
  if (error) throw error
}

export async function crearCaja(sucursalId: string, nombre: string, codigo: string) {
  const { error } = await supabase.from('cajas').insert({
    sucursal_id: sucursalId,
    nombre: nombre.trim(),
    codigo: codigo.trim() || null,
  })
  if (error) throw error
}

export async function cambiarEstadoCaja(cajaId: string, estado: CajaGestion['estado']) {
  const { error } = await supabase.from('cajas').update({ estado }).eq('id', cajaId)
  if (error) throw error
}

export async function revocarTerminal(terminalId: string) {
  const { error } = await supabase.rpc('revocar_terminal_pwa', { p_terminal_id: terminalId })
  if (error) throw error
}
