import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useSesion } from './hooks/useSesion'
import {
  construirConfiguracionTerminal,
  guardarConfiguracionTerminal,
  obtenerContextoTerminal,
} from './lib/configuracionTerminal'
import type { ConfiguracionTerminalLocal } from './lib/configuracionTerminal'
import { mensajeSupabase } from './lib/mensajesSupabase'
import { supabase } from './lib/supabase'
import { registrarTerminalPwa } from './lib/terminalPwa'
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

type CajaConfigurable = {
  id: string
  negocioId: string
  sucursalId: string
  nombre: string
  codigo: string | null
}

type TerminalCajaConfigurable = {
  id: string
  cajaId: string
  estado: string
  nombreDispositivo: string | null
}

type ResultadoVinculacionExitosa = {
  configuracion: ConfiguracionTerminalLocal
  nombreNegocio: string
  nombreSucursal: string
  nombreCaja: string
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

  const [
    vinculacionExitosa,
    setVinculacionExitosa,
  ] = useState<ResultadoVinculacionExitosa | null>(null)

  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')

  const [negocios, setNegocios] = useState<
    NegocioConfigurable[]
  >([])
  const [sucursales, setSucursales] =
    useState<SucursalConfigurable[]>([])
  const [cajas, setCajas] = useState<CajaConfigurable[]>([])
  const [terminalesCaja, setTerminalesCaja] =
    useState<TerminalCajaConfigurable[]>([])

  const [negocioId, setNegocioId] = useState('')
  const [sucursalId, setSucursalId] = useState('')
  const [cajaId, setCajaId] = useState('')

  const [pasoConfiguracion, setPasoConfiguracion] =
    useState<'negocio' | 'caja'>('negocio')

  const [procesando, setProcesando] = useState(false)
  const [gestionandoCaja, setGestionandoCaja] =
    useState(false)
  const [cargandoOpciones, setCargandoOpciones] =
    useState(false)

  const [error, setError] = useState<string | null>(null)

  const sucursalesDelNegocio = useMemo(
    () =>
      sucursales.filter(
        (sucursal) =>
          sucursal.negocioId === negocioId,
      ),
    [sucursales, negocioId],
  )

  const cajasDeSucursal = useMemo(
    () =>
      cajas.filter(
        (caja) =>
          caja.sucursalId === sucursalId,
      ),
    [cajas, sucursalId],
  )

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
          data: sucursales,
          error: errorSucursales,
        } = await supabase
          .from('sucursales')
          .select('id, negocio_id, nombre, direccion, comuna')
          .in('negocio_id', negociosIds)
          .eq('estado', 'activa')

        if (errorSucursales) throw errorSucursales

        const sucursalesPorId = new Map(
          sucursales.map((sucursal) => [
            sucursal.id,
            sucursal.negocio_id,
          ]),
        )

        const sucursalesIds = sucursales.map(
          (sucursal) => sucursal.id,
        )

        const {
          data: cajasActivas,
          error: errorCajas,
        } = sucursalesIds.length
          ? await supabase
              .from('cajas')
              .select(
                'id, nombre, codigo, sucursal_id',
              )
              .in('sucursal_id', sucursalesIds)
              .eq('estado', 'activa')
              .order('nombre')
          : { data: [], error: null }

        if (errorCajas) throw errorCajas

        const cajasIds =
          cajasActivas.map((caja) => caja.id)

        const {
          data: terminalesRegistradas,
          error: errorTerminales,
        } = cajasIds.length
          ? await supabase
              .from('terminales')
              .select(
                'id, caja_id, estado, nombre_dispositivo',
              )
              .in('caja_id', cajasIds)
              .neq('estado', 'revocada')
          : { data: [], error: null }

        if (errorTerminales) {
          throw errorTerminales
        }

        const cajasDisponibles =
          cajasActivas.flatMap((caja) => {
            const negocio =
              sucursalesPorId.get(caja.sucursal_id)

            if (!negocio) return []

            return [
              {
                id: caja.id,
                negocioId: negocio,
                sucursalId: caja.sucursal_id,
                nombre: caja.nombre,
                codigo: caja.codigo,
              },
            ]
          })

        if (!vigente) return

        const sucursalesDisponibles =
          sucursales.map((sucursal) => ({
            id: sucursal.id,
            negocioId: sucursal.negocio_id,
            nombre: sucursal.nombre,
            direccion: sucursal.direccion,
            comuna: sucursal.comuna,
          }))

        const primerNegocio =
          negociosActivos[0]?.id ?? ''

        const primeraSucursal =
          sucursalesDisponibles.find(
            (sucursal) =>
              sucursal.negocioId === primerNegocio,
          )?.id ?? ''

        const cajasOcupadas = new Set(
          terminalesRegistradas.map(
            (terminal) => terminal.caja_id,
          ),
        )

        const primeraCaja =
          cajasDisponibles.find(
            (caja) =>
              caja.sucursalId === primeraSucursal &&
              !cajasOcupadas.has(caja.id),
          )?.id ?? ''

        setNegocios(negociosActivos)
        setSucursales(sucursalesDisponibles)
        setCajas(cajasDisponibles)
        setTerminalesCaja(
          terminalesRegistradas.map(
            (terminal) => ({
              id: terminal.id,
              cajaId: terminal.caja_id,
              estado: terminal.estado,
              nombreDispositivo:
                terminal.nombre_dispositivo,
            }),
          ),
        )
        setNegocioId(primerNegocio)
        setSucursalId(primeraSucursal)
        setCajaId(primeraCaja)
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
    setNegocioId(nuevoNegocioId)

    const primeraSucursal =
      sucursales.find(
        (sucursal) =>
          sucursal.negocioId === nuevoNegocioId,
      )?.id ?? ''

    const cajasOcupadas = new Set(
      terminalesCaja
        .filter(
          (terminal) =>
            terminal.estado !== 'revocada',
        )
        .map(
          (terminal) => terminal.cajaId,
        ),
    )

    const primeraCaja =
      cajas.find(
        (caja) =>
          caja.sucursalId === primeraSucursal &&
          !cajasOcupadas.has(caja.id),
      )?.id ?? ''

    setSucursalId(primeraSucursal)
    setCajaId(primeraCaja)
    setError(null)
  }

  const cambiarSucursal = (
    nuevaSucursalId: string,
  ) => {
    setSucursalId(nuevaSucursalId)

    const cajasOcupadas = new Set(
      terminalesCaja
        .filter(
          (terminal) =>
            terminal.estado !== 'revocada',
        )
        .map(
          (terminal) => terminal.cajaId,
        ),
    )

    const primeraCaja =
      cajas.find(
        (caja) =>
          caja.sucursalId === nuevaSucursalId &&
          !cajasOcupadas.has(caja.id),
      )?.id ?? ''

    setCajaId(primeraCaja)
    setError(null)
  }

  const volverAlInicio = async () => {
    setError(null)
    setPasoConfiguracion('negocio')

    const { error: errorSalida } =
      await supabase.auth.signOut()

    if (errorSalida) {
      setError(mensajeSupabase(errorSalida))
    }
  }

  const continuarACaja = () => {
    if (!negocioId || !sucursalId) {
      setError(
        'Selecciona el negocio y la sucursal para continuar.',
      )
      return
    }

    setError(null)
    setPasoConfiguracion('caja')
  }

  const volverANegocio = () => {
    setPasoConfiguracion('negocio')
    setError(null)
  }

  const renombrarCaja = async (
    idCaja: string,
    nuevoNombre: string,
  ) => {
    const nombre = nuevoNombre.trim()

    if (
      !nombre ||
      nombre.length > 100
    ) {
      setError(
        'El nombre de la caja debe tener entre 1 y 100 caracteres.',
      )
      return false
    }

    setGestionandoCaja(true)
    setError(null)

    try {
      const { error: errorActualizacion } =
        await supabase
          .from('cajas')
          .update({ nombre })
          .eq('id', idCaja)

      if (errorActualizacion) {
        throw errorActualizacion
      }

      setCajas((actuales) =>
        actuales.map((caja) =>
          caja.id === idCaja
            ? {
                ...caja,
                nombre,
              }
            : caja,
        ),
      )

      return true
    } catch (errorCapturado) {
      setError(
        mensajeSupabase(errorCapturado),
      )
      return false
    } finally {
      setGestionandoCaja(false)
    }
  }

  const crearNuevaCaja = async (
    nombreIngresado: string,
  ) => {
    const nombre =
      nombreIngresado.trim()

    if (!sucursalId || !negocioId) {
      setError(
        'Selecciona primero el negocio y la sucursal.',
      )
      return false
    }

    if (
      !nombre ||
      nombre.length > 100
    ) {
      setError(
        'El nombre de la caja debe tener entre 1 y 100 caracteres.',
      )
      return false
    }

    setGestionandoCaja(true)
    setError(null)

    try {
      const {
        data: nuevaCaja,
        error: errorCreacion,
      } = await supabase
        .from('cajas')
        .insert({
          sucursal_id: sucursalId,
          nombre,
          codigo: null,
        })
        .select(
          'id, sucursal_id, nombre, codigo',
        )
        .single()

      if (errorCreacion) {
        throw errorCreacion
      }

      const cajaCreada: CajaConfigurable = {
        id: nuevaCaja.id,
        negocioId,
        sucursalId:
          nuevaCaja.sucursal_id,
        nombre: nuevaCaja.nombre,
        codigo: nuevaCaja.codigo,
      }

      setCajas((actuales) => [
        ...actuales,
        cajaCreada,
      ])

      setCajaId(cajaCreada.id)

      return true
    } catch (errorCapturado) {
      setError(
        mensajeSupabase(errorCapturado),
      )
      return false
    } finally {
      setGestionandoCaja(false)
    }
  }

  const eliminarCaja = async (
    idCaja: string,
  ) => {
    setGestionandoCaja(true)
    setError(null)

    try {
      const { error: errorEliminacion } =
        await supabase.rpc(
          'eliminar_caja_sin_uso',
          {
            p_caja_id: idCaja,
          },
        )

      if (errorEliminacion) {
        throw errorEliminacion
      }

      const cajasRestantes =
        cajas.filter(
          (caja) => caja.id !== idCaja,
        )

      setCajas(cajasRestantes)

      if (cajaId === idCaja) {
        const ocupadas = new Set(
          terminalesCaja
            .filter(
              (terminal) =>
                terminal.estado !== 'revocada',
            )
            .map(
              (terminal) =>
                terminal.cajaId,
            ),
        )

        const siguienteCaja =
          cajasRestantes.find(
            (caja) =>
              caja.sucursalId === sucursalId &&
              !ocupadas.has(caja.id),
          )

        setCajaId(
          siguienteCaja?.id ?? '',
        )
      }

      return true
    } catch (errorCapturado) {
      setError(
        mensajeSupabase(errorCapturado),
      )
      return false
    } finally {
      setGestionandoCaja(false)
    }
  }

  const seleccionarCaja = (
    nuevaCajaId: string,
  ) => {
    const ocupada =
      terminalesCaja.some(
        (terminal) =>
          terminal.cajaId === nuevaCajaId &&
          terminal.estado !== 'revocada',
      )

    if (ocupada) {
      setError(
        'Esta caja ya está vinculada a otra Terminal.',
      )
      return
    }

    setCajaId(nuevaCajaId)
    setError(null)
  }

  const configurar = async () => {
    if (!sesion) {
      setError(
        'Debes iniciar sesión con la cuenta del comercio.',
      )
      return
    }

    if (
      !negocioId ||
      !sucursalId ||
      !cajaId
    ) {
      setError(
        'Selecciona el negocio, la sucursal y la caja que quedarán vinculados.',
      )
      return
    }

    const cajaOcupada =
      terminalesCaja.some(
        (terminal) =>
          terminal.cajaId === cajaId &&
          terminal.estado !== 'revocada',
      )

    if (cajaOcupada) {
      setError(
        'Esta caja ya está vinculada a otra Terminal.',
      )
      return
    }

    setProcesando(true)
    setError(null)

    try {
      const nombreDispositivo =
        `Terminal ${navigator.platform || 'Club Regalones'}`

      const credencial = await registrarTerminalPwa(
        cajaId,
        nombreDispositivo,
      )

      if (!credencial) {
        throw new Error(
          'Supabase no devolvió la credencial de la Terminal.',
        )
      }

      const contexto =
        await obtenerContextoTerminal(credencial)

      if (!contexto) {
        throw new Error(
          'No pudimos confirmar a qué negocio pertenece esta Terminal.',
        )
      }

      if (
        contexto.negocio_id !== negocioId ||
        contexto.caja_id !== cajaId
      ) {
        throw new Error(
          'Supabase devolvió un negocio o caja diferente al seleccionado.',
        )
      }

      const configuracion =
        construirConfiguracionTerminal(
          credencial,
          contexto,
        )

      const negocioVinculado =
        negocios.find(
          (negocio) =>
            negocio.id === negocioId,
        )

      const sucursalVinculada =
        sucursales.find(
          (sucursal) =>
            sucursal.id === sucursalId,
        )

      const cajaVinculada =
        cajas.find(
          (caja) =>
            caja.id === cajaId,
        )

      const { error: errorSalida } =
        await supabase.auth.signOut()

      if (errorSalida) throw errorSalida

      guardarConfiguracionTerminal(configuracion)

      setVinculacionExitosa({
        configuracion,
        nombreNegocio:
          negocioVinculado?.nombre ??
          'Negocio',
        nombreSucursal:
          sucursalVinculada?.nombre ??
          'Sucursal',
        nombreCaja:
          cajaVinculada?.nombre ??
          'Caja',
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
        nombreNegocio={
          vinculacionExitosa.nombreNegocio
        }
        nombreSucursal={
          vinculacionExitosa.nombreSucursal
        }
        nombreCaja={
          vinculacionExitosa.nombreCaja
        }
        alComenzar={() =>
          alConfigurar(
            vinculacionExitosa.configuracion,
          )
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
        cajas={cajas}
        negocioId={negocioId}
        sucursalId={sucursalId}
        cargando={cargandoOpciones}
        error={error}
        alCambiarNegocio={cambiarNegocio}
        alCambiarSucursal={cambiarSucursal}
        alVolver={volverAlInicio}
        alContinuar={continuarACaja}
      />
    )
  }

  const negocioSeleccionado =
    negocios.find(
      (negocio) =>
        negocio.id === negocioId,
    )

  const sucursalSeleccionada =
    sucursales.find(
      (sucursal) =>
        sucursal.id === sucursalId,
    )

  return (
    <PantallaVincularCaja
      nombreNegocio={
        negocioSeleccionado?.nombre ??
        'Negocio'
      }
      nombreSucursal={
        sucursalSeleccionada?.nombre ??
        'Sucursal'
      }
      cajas={cajasDeSucursal}
      terminales={terminalesCaja}
      cajaId={cajaId}
      procesando={procesando}
      gestionandoCaja={gestionandoCaja}
      error={error}
      alSeleccionarCaja={seleccionarCaja}
      alRenombrarCaja={renombrarCaja}
      alCrearCaja={crearNuevaCaja}
      alEliminarCaja={eliminarCaja}
      alVolver={volverANegocio}
      alVincular={() => void configurar()}
    />
  )
}