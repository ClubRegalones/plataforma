import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useSesion } from './hooks/useSesion'
import {
  construirConfiguracionTerminal,
  guardarConfiguracionTerminal,
  obtenerContextoTerminal,
} from './lib/configuracionTerminal'
import type { ConfiguracionTerminalLocal } from './lib/configuracionTerminal'
import { mensajeSupabase } from './lib/mensajesSupabase'
import { supabase } from './lib/supabase'
import {
  moverTerminalPwa,
  registrarTerminalPwa,
} from './lib/terminalPwa'
import PantallaConfiguracionInicial from './configuracion/PantallaConfiguracionInicial'
import PantallaSeleccionarNegocio from './configuracion/PantallaSeleccionarNegocio'
import PantallaVincularCaja from './configuracion/PantallaVincularCaja'
import PantallaVinculacionExitosa from './configuracion/PantallaVinculacionExitosa'

type NegocioConfigurable = {
  id: string
  nombre: string
  rut: string | null
}

type SucursalConfigurable = {
  id: string
  negocioId: string
  nombre: string
  direccion: string
  comuna: string
}

type TerminalInstalada = {
  id: string
  identificador: string
  nombreDispositivo: string | null
  estado: string
}

type ResultadoVinculacionExitosa = {
  configuracion: ConfiguracionTerminalLocal
  nombreNegocio: string
  nombreSucursal: string
  nombreCaja: string
}

type PreparacionCaja = {
  caja_id: string
  caja_nombre: string
  caja_creada: boolean
  terminal_id: string | null
  terminal_identificador: string | null
  terminal_nombre_dispositivo: string | null
  terminal_estado: string | null
}

type Props = {
  alConfigurar: (
    configuracion: ConfiguracionTerminalLocal,
  ) => void
}

export default function ConfiguracionInicialTerminal({
  alConfigurar,
}: Props) {
  const { sesion, cargando: cargandoSesion } = useSesion()

  const [vinculacionExitosa, setVinculacionExitosa] =
    useState<ResultadoVinculacionExitosa | null>(null)

  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')

  const [negocios, setNegocios] = useState<NegocioConfigurable[]>([])
  const [sucursales, setSucursales] =
    useState<SucursalConfigurable[]>([])

  const [negocioId, setNegocioId] = useState('')
  const [sucursalId, setSucursalId] = useState('')
  const [cajaId, setCajaId] = useState('')
  const [terminalInstalada, setTerminalInstalada] =
    useState<TerminalInstalada | null>(null)

  const [pasoConfiguracion, setPasoConfiguracion] =
    useState<'negocio' | 'caja'>('negocio')

  const [procesando, setProcesando] = useState(false)
  const [preparandoCaja, setPreparandoCaja] = useState(false)
  const [cargandoOpciones, setCargandoOpciones] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true

    if (!sesion) {
      return () => {
        vigente = false
      }
    }

    const cargar = async () => {
      setCargandoOpciones(true)
      setError(null)

      try {
        const {
          data: membresias,
          error: errorMembresias,
        } = await supabase
          .from('miembros_negocio')
          .select('negocio_id, rol')
          .eq('usuario_id', sesion.user.id)
          .eq('estado', 'activo')
          .in('rol', ['propietario', 'administrador'])

        if (errorMembresias) throw errorMembresias

        const negociosIds = membresias.map(
          (membresia) => membresia.negocio_id,
        )

        if (negociosIds.length === 0) {
          throw new Error(
            'Esta cuenta no administra ningún comercio Regalón.',
          )
        }

        const {
          data: negociosActivos,
          error: errorNegocios,
        } = await supabase
          .from('negocios')
          .select('id, nombre, rut')
          .in('id', negociosIds)
          .eq('estado', 'activo')
          .order('nombre')

        if (errorNegocios) throw errorNegocios

        const {
          data: sucursalesActivas,
          error: errorSucursales,
        } = await supabase
          .from('sucursales')
          .select('id, negocio_id, nombre, direccion, comuna')
          .in('negocio_id', negociosIds)
          .eq('estado', 'activa')
          .order('nombre')

        if (errorSucursales) throw errorSucursales
        if (!vigente) return

        const sucursalesDisponibles = sucursalesActivas.map(
          (sucursal) => ({
            id: sucursal.id,
            negocioId: sucursal.negocio_id,
            nombre: sucursal.nombre,
            direccion: sucursal.direccion,
            comuna: sucursal.comuna,
          }),
        )

        const primerNegocio = negociosActivos[0]?.id ?? ''
        const primeraSucursal =
          sucursalesDisponibles.find(
            (sucursal) => sucursal.negocioId === primerNegocio,
          )?.id ?? ''

        setNegocios(negociosActivos)
        setSucursales(sucursalesDisponibles)
        setNegocioId(primerNegocio)
        setSucursalId(primeraSucursal)
        setCajaId('')
        setTerminalInstalada(null)
      } catch (errorCapturado) {
        if (vigente) {
          setError(mensajeSupabase(errorCapturado))
        }
      } finally {
        if (vigente) setCargandoOpciones(false)
      }
    }

    void cargar()

    return () => {
      vigente = false
    }
  }, [sesion])

  const iniciarSesion = async (
    evento: FormEvent<HTMLFormElement>,
  ) => {
    evento.preventDefault()
    setProcesando(true)
    setError(null)

    const { error: errorIngreso } =
      await supabase.auth.signInWithPassword({
        email: correo.trim(),
        password: contrasena,
      })

    setProcesando(false)

    if (errorIngreso) {
      setError(mensajeSupabase(errorIngreso))
    }
  }

  const cambiarNegocio = (nuevoNegocioId: string) => {
    const primeraSucursal =
      sucursales.find(
        (sucursal) => sucursal.negocioId === nuevoNegocioId,
      )?.id ?? ''

    setNegocioId(nuevoNegocioId)
    setSucursalId(primeraSucursal)
    setCajaId('')
    setTerminalInstalada(null)
    setError(null)
  }

  const cambiarSucursal = (nuevaSucursalId: string) => {
    setSucursalId(nuevaSucursalId)
    setCajaId('')
    setTerminalInstalada(null)
    setError(null)
  }

  const volverAlInicio = async () => {
    setError(null)
    setPasoConfiguracion('negocio')

    const { error: errorSalida } = await supabase.auth.signOut()

    if (errorSalida) {
      setError(mensajeSupabase(errorSalida))
    }
  }

  const prepararCajaRegalones = async () => {
    if (!negocioId || !sucursalId) {
      setError(
        'Selecciona el negocio y la sucursal para continuar.',
      )
      return false
    }

    setPreparandoCaja(true)
    setError(null)

    try {
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        funcion: string,
        parametros: Record<string, unknown>,
      ) => Promise<{
        data: PreparacionCaja[] | null
        error: unknown
      }>

      const { data, error: errorPreparacion } = await rpc(
        'preparar_caja_regalones',
        { p_sucursal_id: sucursalId },
      )

      if (errorPreparacion) throw errorPreparacion

      const resultado = data?.[0]
      if (!resultado) {
        throw new Error(
          'No pudimos preparar la Caja Regalones de esta sucursal.',
        )
      }

      setCajaId(resultado.caja_id)
      setTerminalInstalada(
        resultado.terminal_id
          ? {
              id: resultado.terminal_id,
              identificador:
                resultado.terminal_identificador || 'Terminal Regalones',
              nombreDispositivo:
                resultado.terminal_nombre_dispositivo,
              estado: resultado.terminal_estado || 'activa',
            }
          : null,
      )

      return true
    } catch (errorCapturado) {
      setCajaId('')
      setTerminalInstalada(null)
      setError(mensajeSupabase(errorCapturado))
      return false
    } finally {
      setPreparandoCaja(false)
    }
  }

  const continuarACaja = async () => {
    const preparada = await prepararCajaRegalones()
    if (preparada) {
      setPasoConfiguracion('caja')
    }
  }

  const volverANegocio = () => {
    setPasoConfiguracion('negocio')
    setCajaId('')
    setTerminalInstalada(null)
    setError(null)
  }

  const finalizarConfiguracion = async (
    mover: boolean,
  ) => {
    if (!sesion) {
      setError(
        'Debes iniciar sesión con la cuenta del comercio.',
      )
      return
    }

    if (!negocioId || !sucursalId || !cajaId) {
      setError(
        'No pudimos identificar la Caja Regalones de esta sucursal.',
      )
      return
    }

    setProcesando(true)
    setError(null)

    try {
      const nombreDispositivo =
        `Terminal ${navigator.platform || 'Club Regalones'}`

      const credencial = mover
        ? await moverTerminalPwa(cajaId, nombreDispositivo)
        : await registrarTerminalPwa(cajaId, nombreDispositivo)

      if (!credencial) {
        throw new Error(
          'Supabase no devolvió la credencial de la Terminal.',
        )
      }

      const contexto = await obtenerContextoTerminal(credencial)

      if (!contexto) {
        throw new Error(
          'No pudimos confirmar a qué negocio pertenece esta Terminal.',
        )
      }

      if (
        contexto.negocio_id !== negocioId ||
        contexto.sucursal_id !== sucursalId ||
        contexto.caja_id !== cajaId
      ) {
        throw new Error(
          'Supabase devolvió un contexto diferente al seleccionado.',
        )
      }

      const configuracion = construirConfiguracionTerminal(
        credencial,
        contexto,
      )

      const negocioVinculado = negocios.find(
        (negocio) => negocio.id === negocioId,
      )
      const sucursalVinculada = sucursales.find(
        (sucursal) => sucursal.id === sucursalId,
      )

      const { error: errorSalida } = await supabase.auth.signOut()
      if (errorSalida) throw errorSalida

      guardarConfiguracionTerminal(configuracion)

      setVinculacionExitosa({
        configuracion,
        nombreNegocio: negocioVinculado?.nombre ?? 'Negocio',
        nombreSucursal: sucursalVinculada?.nombre ?? 'Sucursal',
        nombreCaja: 'Caja Regalones',
      })
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
  }

  if (vinculacionExitosa) {
    return (
      <PantallaVinculacionExitosa
        nombreNegocio={vinculacionExitosa.nombreNegocio}
        nombreSucursal={vinculacionExitosa.nombreSucursal}
        nombreCaja={vinculacionExitosa.nombreCaja}
        alComenzar={() =>
          alConfigurar(vinculacionExitosa.configuracion)
        }
      />
    )
  }

  if (cargandoSesion) {
    return (
      <main className="terminal-shell">
        <p className="terminal-empty">
          Comprobando configuración…
        </p>
      </main>
    )
  }

  if (!sesion) {
    return (
      <PantallaConfiguracionInicial
        correo={correo}
        contrasena={contrasena}
        procesando={procesando}
        error={error}
        alCambiarCorreo={setCorreo}
        alCambiarContrasena={setContrasena}
        alEnviar={iniciarSesion}
      />
    )
  }

  if (pasoConfiguracion === 'negocio') {
    return (
      <PantallaSeleccionarNegocio
        negocios={negocios}
        sucursales={sucursales}
        negocioId={negocioId}
        sucursalId={sucursalId}
        cargando={cargandoOpciones || preparandoCaja}
        error={error}
        alCambiarNegocio={cambiarNegocio}
        alCambiarSucursal={cambiarSucursal}
        alVolver={volverAlInicio}
        alContinuar={() => void continuarACaja()}
      />
    )
  }

  const negocioSeleccionado = negocios.find(
    (negocio) => negocio.id === negocioId,
  )
  const sucursalSeleccionada = sucursales.find(
    (sucursal) => sucursal.id === sucursalId,
  )

  return (
    <PantallaVincularCaja
      nombreNegocio={negocioSeleccionado?.nombre ?? 'Negocio'}
      nombreSucursal={sucursalSeleccionada?.nombre ?? 'Sucursal'}
      cajaLista={Boolean(cajaId)}
      preparandoCaja={preparandoCaja}
      terminalInstalada={terminalInstalada}
      procesando={procesando}
      error={error}
      alVolver={volverANegocio}
      alConfigurar={() => void finalizarConfiguracion(false)}
      alMover={() => void finalizarConfiguracion(true)}
    />
  )
}
