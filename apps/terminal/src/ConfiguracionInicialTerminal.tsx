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

type NegocioConfigurable = {
  id: string
  nombre: string
}

type CajaConfigurable = {
  id: string
  negocioId: string
  nombre: string
  codigo: string | null
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

  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')

  const [negocios, setNegocios] = useState<
    NegocioConfigurable[]
  >([])
  const [cajas, setCajas] = useState<CajaConfigurable[]>([])

  const [negocioId, setNegocioId] = useState('')
  const [cajaId, setCajaId] = useState('')

  const [procesando, setProcesando] = useState(false)
  const [cargandoOpciones, setCargandoOpciones] =
    useState(false)

  const [error, setError] = useState<string | null>(null)

  const cajasDelNegocio = useMemo(
    () =>
      cajas.filter(
        (caja) => caja.negocioId === negocioId,
      ),
    [cajas, negocioId],
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
          .select('id, nombre')
          .in('id', negociosIds)
          .eq('estado', 'activo')
          .order('nombre')

        if (errorNegocios) throw errorNegocios

        const {
          data: sucursales,
          error: errorSucursales,
        } = await supabase
          .from('sucursales')
          .select('id, negocio_id')
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

        const cajasDisponibles =
          cajasActivas.flatMap((caja) => {
            const negocio =
              sucursalesPorId.get(caja.sucursal_id)

            if (!negocio) return []

            return [
              {
                id: caja.id,
                negocioId: negocio,
                nombre: caja.nombre,
                codigo: caja.codigo,
              },
            ]
          })

        if (!vigente) return

        const primerNegocio =
          negociosActivos[0]?.id ?? ''

        const primeraCaja =
          cajasDisponibles.find(
            (caja) =>
              caja.negocioId === primerNegocio,
          )?.id ?? ''

        setNegocios(negociosActivos)
        setCajas(cajasDisponibles)
        setNegocioId(primerNegocio)
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

    const primeraCaja =
      cajas.find(
        (caja) =>
          caja.negocioId === nuevoNegocioId,
      )?.id ?? ''

    setCajaId(primeraCaja)
  }

  const configurar = async () => {
    if (!sesion) {
      setError(
        'Debes iniciar sesión con la cuenta del comercio.',
      )
      return
    }

    if (!negocioId || !cajaId) {
      setError(
        'Selecciona el negocio y la caja que quedarán vinculados.',
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

      const { error: errorSalida } =
        await supabase.auth.signOut()

      if (errorSalida) throw errorSalida

      guardarConfiguracionTerminal(configuracion)

      alConfigurar(configuracion)
    } catch (errorCapturado) {
      setError(mensajeSupabase(errorCapturado))
    } finally {
      setProcesando(false)
    }
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
      <main className="terminal-shell">
        <section
          className="terminal-card"
          aria-labelledby="configuracion-terminal-title"
        >
          <span className="terminal-eyebrow">
            Configuración inicial
          </span>

          <h1 id="configuracion-terminal-title">
            Activar Terminal Regalones
          </h1>

          <p>
            Este inicio de sesión se realiza una sola vez
            para identificar el comercio y autorizar esta
            caja.
          </p>

          <form
            className="terminal-form"
            onSubmit={iniciarSesion}
          >
            <label>
              Correo del comercio
              <input
                required
                type="email"
                autoComplete="email"
                value={correo}
                onChange={(evento) =>
                  setCorreo(evento.target.value)
                }
              />
            </label>

            <label>
              Contraseña
              <input
                required
                type="password"
                autoComplete="current-password"
                value={contrasena}
                onChange={(evento) =>
                  setContrasena(evento.target.value)
                }
              />
            </label>

            {error && (
              <p className="terminal-alert terminal-alert--error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={procesando}
            >
              {procesando
                ? 'Verificando…'
                : 'Continuar configuración'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="terminal-shell">
      <section
        className="terminal-card"
        aria-labelledby="seleccionar-terminal-title"
      >
        <span className="terminal-eyebrow">
          Configuración inicial
        </span>

        <h1 id="seleccionar-terminal-title">
          Vincular esta caja
        </h1>

        <p>
          Supabase guardará esta relación para que todas
          las compras, canjes y turnos queden asociados al
          comercio correcto.
        </p>

        {error && (
          <p className="terminal-alert terminal-alert--error">
            {error}
          </p>
        )}

        {cargandoOpciones ? (
          <p className="terminal-empty">
            Cargando negocios y cajas…
          </p>
        ) : (
          <div className="terminal-form">
            <label>
              Nombre del negocio
              <select
                required
                value={negocioId}
                onChange={(evento) =>
                  cambiarNegocio(evento.target.value)
                }
              >
                {negocios.map((negocio) => (
                  <option
                    key={negocio.id}
                    value={negocio.id}
                  >
                    {negocio.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Seleccionar caja
              <select
                required
                value={cajaId}
                onChange={(evento) =>
                  setCajaId(evento.target.value)
                }
              >
                {cajasDelNegocio.map((caja) => (
                  <option
                    key={caja.id}
                    value={caja.id}
                  >
                    {caja.nombre}
                    {caja.codigo
                      ? ` (${caja.codigo})`
                      : ''}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              disabled={
                procesando ||
                !negocioId ||
                !cajaId
              }
              onClick={() => void configurar()}
            >
              {procesando
                ? 'Vinculando Terminal…'
                : 'Activar esta Terminal'}
            </button>
          </div>
        )}
      </section>
    </main>
  )
}