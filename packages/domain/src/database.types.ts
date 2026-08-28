export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alertas_riesgo: {
        Row: {
          compra_id: string | null
          creado_en: string
          detalle: string | null
          estado: Database["public"]["Enums"]["estado_alerta_riesgo"]
          id: string
          movimiento_regis_id: string | null
          negocio_id: string
          regla: string
          resuelta_en: string | null
          resuelta_por: string | null
          severidad: Database["public"]["Enums"]["severidad_riesgo"]
          vecino_id: string
        }
        Insert: {
          compra_id?: string | null
          creado_en?: string
          detalle?: string | null
          estado?: Database["public"]["Enums"]["estado_alerta_riesgo"]
          id?: string
          movimiento_regis_id?: string | null
          negocio_id: string
          regla: string
          resuelta_en?: string | null
          resuelta_por?: string | null
          severidad: Database["public"]["Enums"]["severidad_riesgo"]
          vecino_id: string
        }
        Update: {
          compra_id?: string | null
          creado_en?: string
          detalle?: string | null
          estado?: Database["public"]["Enums"]["estado_alerta_riesgo"]
          id?: string
          movimiento_regis_id?: string | null
          negocio_id?: string
          regla?: string
          resuelta_en?: string | null
          resuelta_por?: string | null
          severidad?: Database["public"]["Enums"]["severidad_riesgo"]
          vecino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_riesgo_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_riesgo_movimiento_regis_id_fkey"
            columns: ["movimiento_regis_id"]
            isOneToOne: false
            referencedRelation: "movimientos_regis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_riesgo_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficios_regis: {
        Row: {
          codigo: string
          creado_en: string
          creado_por: string | null
          id: string
          negocio_id: string
        }
        Insert: {
          codigo: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          negocio_id: string
        }
        Update: {
          codigo?: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          negocio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beneficios_regis_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          actualizado_en: string
          codigo: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_caja"]
          id: string
          nombre: string
          sucursal_id: string
        }
        Insert: {
          actualizado_en?: string
          codigo?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_caja"]
          id?: string
          nombre: string
          sucursal_id: string
        }
        Update: {
          actualizado_en?: string
          codigo?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_caja"]
          id?: string
          nombre?: string
          sucursal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cajas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      canjes_regis: {
        Row: {
          aporte_promocional_negocio_clp: number | null
          beneficio_id: string
          beneficio_version_id: string
          caja_id: string | null
          cancelado_en: string | null
          codigo_publico: string
          compra_id: string | null
          confirmado_en: string | null
          costo_regis: number
          creado_en: string
          descuento_total_clp: number | null
          estado: Database["public"]["Enums"]["estado_canje_regis"]
          expira_en: string
          expirado_en: string | null
          id: string
          idempotency_key: string
          lectura_terminal_id: string | null
          leido_admin_regalones_en: string | null
          leido_negocio_en: string | null
          leido_vecino_en: string | null
          llavero_id: string | null
          monto_compra_bruto_clp: number | null
          monto_final_pagado_clp: number | null
          negocio_id: string
          origen: Database["public"]["Enums"]["origen_canje_regis"]
          qr_token_hash: string | null
          regla_regis_id: string
          reservado_en: string
          valor_financiado_regis_clp: number | null
          valor_regis_clp: number
          vecino_id: string
        }
        Insert: {
          aporte_promocional_negocio_clp?: number | null
          beneficio_id: string
          beneficio_version_id: string
          caja_id?: string | null
          cancelado_en?: string | null
          codigo_publico?: string
          compra_id?: string | null
          confirmado_en?: string | null
          costo_regis: number
          creado_en?: string
          descuento_total_clp?: number | null
          estado?: Database["public"]["Enums"]["estado_canje_regis"]
          expira_en: string
          expirado_en?: string | null
          id?: string
          idempotency_key: string
          lectura_terminal_id?: string | null
          leido_admin_regalones_en?: string | null
          leido_negocio_en?: string | null
          leido_vecino_en?: string | null
          llavero_id?: string | null
          monto_compra_bruto_clp?: number | null
          monto_final_pagado_clp?: number | null
          negocio_id: string
          origen: Database["public"]["Enums"]["origen_canje_regis"]
          qr_token_hash?: string | null
          regla_regis_id: string
          reservado_en?: string
          valor_financiado_regis_clp?: number | null
          valor_regis_clp: number
          vecino_id: string
        }
        Update: {
          aporte_promocional_negocio_clp?: number | null
          beneficio_id?: string
          beneficio_version_id?: string
          caja_id?: string | null
          cancelado_en?: string | null
          codigo_publico?: string
          compra_id?: string | null
          confirmado_en?: string | null
          costo_regis?: number
          creado_en?: string
          descuento_total_clp?: number | null
          estado?: Database["public"]["Enums"]["estado_canje_regis"]
          expira_en?: string
          expirado_en?: string | null
          id?: string
          idempotency_key?: string
          lectura_terminal_id?: string | null
          leido_admin_regalones_en?: string | null
          leido_negocio_en?: string | null
          leido_vecino_en?: string | null
          llavero_id?: string | null
          monto_compra_bruto_clp?: number | null
          monto_final_pagado_clp?: number | null
          negocio_id?: string
          origen?: Database["public"]["Enums"]["origen_canje_regis"]
          qr_token_hash?: string | null
          regla_regis_id?: string
          reservado_en?: string
          valor_financiado_regis_clp?: number | null
          valor_regis_clp?: number
          vecino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canjes_beneficio_negocio_fkey"
            columns: ["beneficio_id", "negocio_id"]
            isOneToOne: false
            referencedRelation: "beneficios_regis"
            referencedColumns: ["id", "negocio_id"]
          },
          {
            foreignKeyName: "canjes_beneficio_version_fkey"
            columns: ["beneficio_version_id", "beneficio_id"]
            isOneToOne: false
            referencedRelation: "versiones_beneficio_regis"
            referencedColumns: ["id", "beneficio_id"]
          },
          {
            foreignKeyName: "canjes_regis_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canjes_regis_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: true
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canjes_regis_lectura_terminal_id_fkey"
            columns: ["lectura_terminal_id"]
            isOneToOne: true
            referencedRelation: "lecturas_llavero_terminal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canjes_regis_llavero_id_fkey"
            columns: ["llavero_id"]
            isOneToOne: false
            referencedRelation: "llaveros_nfc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canjes_regis_regla_regis_id_fkey"
            columns: ["regla_regis_id"]
            isOneToOne: false
            referencedRelation: "reglas_regis"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          aporte_promocional_clp: number
          caja_id: string
          cajero_id: string
          creado_en: string
          descuento_total_clp: number
          estado: Database["public"]["Enums"]["estado_compra"]
          folio_boleta: string | null
          id: string
          monto_base_regis_clp: number | null
          monto_bruto_clp: number | null
          monto_final: number
          negocio_id: string
          origen: Database["public"]["Enums"]["origen_compra"]
          regis_generados: number
          regis_procesados_en: string | null
          regis_utilizados: number
          regla_regis_id: string | null
          revertido_en: string | null
          riesgo: Database["public"]["Enums"]["severidad_riesgo"] | null
          solicitud_id: string
          sucursal_id: string
          tasa_acumulacion_bp_aplicada: number | null
          valor_regis_clp_aplicado: number | null
          vecino_id: string
        }
        Insert: {
          aporte_promocional_clp?: number
          caja_id: string
          cajero_id: string
          creado_en?: string
          descuento_total_clp?: number
          estado?: Database["public"]["Enums"]["estado_compra"]
          folio_boleta?: string | null
          id?: string
          monto_base_regis_clp?: number | null
          monto_bruto_clp?: number | null
          monto_final: number
          negocio_id: string
          origen?: Database["public"]["Enums"]["origen_compra"]
          regis_generados?: number
          regis_procesados_en?: string | null
          regis_utilizados?: number
          regla_regis_id?: string | null
          revertido_en?: string | null
          riesgo?: Database["public"]["Enums"]["severidad_riesgo"] | null
          solicitud_id: string
          sucursal_id: string
          tasa_acumulacion_bp_aplicada?: number | null
          valor_regis_clp_aplicado?: number | null
          vecino_id: string
        }
        Update: {
          aporte_promocional_clp?: number
          caja_id?: string
          cajero_id?: string
          creado_en?: string
          descuento_total_clp?: number
          estado?: Database["public"]["Enums"]["estado_compra"]
          folio_boleta?: string | null
          id?: string
          monto_base_regis_clp?: number | null
          monto_bruto_clp?: number | null
          monto_final?: number
          negocio_id?: string
          origen?: Database["public"]["Enums"]["origen_compra"]
          regis_generados?: number
          regis_procesados_en?: string | null
          regis_utilizados?: number
          regla_regis_id?: string | null
          revertido_en?: string | null
          riesgo?: Database["public"]["Enums"]["severidad_riesgo"] | null
          solicitud_id?: string
          sucursal_id?: string
          tasa_acumulacion_bp_aplicada?: number | null
          valor_regis_clp_aplicado?: number | null
          vecino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_regla_regis_id_fkey"
            columns: ["regla_regis_id"]
            isOneToOne: false
            referencedRelation: "reglas_regis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: true
            referencedRelation: "solicitudes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      configuraciones_riesgo_regis: {
        Row: {
          activa: boolean
          creado_en: string
          creado_por: string | null
          id: string
          max_acumulaciones_ventana: number | null
          monto_compra_revision_clp: number | null
          negocio_id: string | null
          ventana_acumulaciones_minutos: number | null
          version: number
          vigencia_desde: string
          vigencia_hasta: string | null
        }
        Insert: {
          activa?: boolean
          creado_en?: string
          creado_por?: string | null
          id?: string
          max_acumulaciones_ventana?: number | null
          monto_compra_revision_clp?: number | null
          negocio_id?: string | null
          ventana_acumulaciones_minutos?: number | null
          version: number
          vigencia_desde?: string
          vigencia_hasta?: string | null
        }
        Update: {
          activa?: boolean
          creado_en?: string
          creado_por?: string | null
          id?: string
          max_acumulaciones_ventana?: number | null
          monto_compra_revision_clp?: number | null
          negocio_id?: string | null
          ventana_acumulaciones_minutos?: number | null
          version?: number
          vigencia_desde?: string
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "configuraciones_riesgo_regis_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      etiquetas_nfc: {
        Row: {
          actualizado_en: string
          caja_id: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_etiqueta_nfc"]
          id: string
          instalado_en: string | null
          negocio_id: string
          sucursal_id: string | null
          tipo: Database["public"]["Enums"]["tipo_etiqueta_nfc"]
          token_hash: string
        }
        Insert: {
          actualizado_en?: string
          caja_id?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_etiqueta_nfc"]
          id?: string
          instalado_en?: string | null
          negocio_id: string
          sucursal_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_etiqueta_nfc"]
          token_hash: string
        }
        Update: {
          actualizado_en?: string
          caja_id?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_etiqueta_nfc"]
          id?: string
          instalado_en?: string | null
          negocio_id?: string
          sucursal_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_etiqueta_nfc"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "etiquetas_nfc_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etiquetas_nfc_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etiquetas_nfc_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      lecturas_llavero_terminal: {
        Row: {
          caja_id: string
          consumida_en: string | null
          consumida_por: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_lectura_llavero_terminal"]
          expira_en: string
          id: string
          leido_en: string
          llavero_id: string
          reclamada_en: string | null
          reclamada_por: string | null
          sesion_id: string
          terminal_id: string
        }
        Insert: {
          caja_id: string
          consumida_en?: string | null
          consumida_por?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_lectura_llavero_terminal"]
          expira_en: string
          id?: string
          leido_en?: string
          llavero_id: string
          reclamada_en?: string | null
          reclamada_por?: string | null
          sesion_id: string
          terminal_id: string
        }
        Update: {
          caja_id?: string
          consumida_en?: string | null
          consumida_por?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_lectura_llavero_terminal"]
          expira_en?: string
          id?: string
          leido_en?: string
          llavero_id?: string
          reclamada_en?: string | null
          reclamada_por?: string | null
          sesion_id?: string
          terminal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecturas_llavero_terminal_llavero_id_fkey"
            columns: ["llavero_id"]
            isOneToOne: false
            referencedRelation: "llaveros_nfc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecturas_llavero_terminal_sesion_id_fkey"
            columns: ["sesion_id"]
            isOneToOne: false
            referencedRelation: "sesiones_lector_movil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecturas_llavero_terminal_terminal_caja_fkey"
            columns: ["terminal_id", "caja_id"]
            isOneToOne: false
            referencedRelation: "terminales"
            referencedColumns: ["id", "caja_id"]
          },
        ]
      }
      llaveros_nfc: {
        Row: {
          activado_en: string | null
          activado_por: string | null
          actualizado_en: string
          asignado_en: string | null
          asignado_por: string | null
          bloqueado_en: string | null
          caja_activacion_id: string | null
          codigo_publico: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_llavero_nfc"]
          id: string
          intentos_pin_fallidos: number
          lectura_activacion_id: string | null
          metodo_verificacion_activacion:
            | Database["public"]["Enums"]["metodo_verificacion_llavero"]
            | null
          pin_activacion_hash: string | null
          pin_bloqueado_hasta: string | null
          preparado_en: string | null
          preparado_por: string | null
          reemplazado_por_id: string | null
          solicitud_id: string | null
          token_hash: string
          vecino_id: string | null
        }
        Insert: {
          activado_en?: string | null
          activado_por?: string | null
          actualizado_en?: string
          asignado_en?: string | null
          asignado_por?: string | null
          bloqueado_en?: string | null
          caja_activacion_id?: string | null
          codigo_publico: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_llavero_nfc"]
          id?: string
          intentos_pin_fallidos?: number
          lectura_activacion_id?: string | null
          metodo_verificacion_activacion?:
            | Database["public"]["Enums"]["metodo_verificacion_llavero"]
            | null
          pin_activacion_hash?: string | null
          pin_bloqueado_hasta?: string | null
          preparado_en?: string | null
          preparado_por?: string | null
          reemplazado_por_id?: string | null
          solicitud_id?: string | null
          token_hash: string
          vecino_id?: string | null
        }
        Update: {
          activado_en?: string | null
          activado_por?: string | null
          actualizado_en?: string
          asignado_en?: string | null
          asignado_por?: string | null
          bloqueado_en?: string | null
          caja_activacion_id?: string | null
          codigo_publico?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_llavero_nfc"]
          id?: string
          intentos_pin_fallidos?: number
          lectura_activacion_id?: string | null
          metodo_verificacion_activacion?:
            | Database["public"]["Enums"]["metodo_verificacion_llavero"]
            | null
          pin_activacion_hash?: string | null
          pin_bloqueado_hasta?: string | null
          preparado_en?: string | null
          preparado_por?: string | null
          reemplazado_por_id?: string | null
          solicitud_id?: string | null
          token_hash?: string
          vecino_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llaveros_nfc_caja_activacion_id_fkey"
            columns: ["caja_activacion_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llaveros_nfc_lectura_activacion_id_fkey"
            columns: ["lectura_activacion_id"]
            isOneToOne: true
            referencedRelation: "lecturas_llavero_terminal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llaveros_nfc_reemplazado_por_id_fkey"
            columns: ["reemplazado_por_id"]
            isOneToOne: true
            referencedRelation: "llaveros_nfc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llaveros_nfc_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: true
            referencedRelation: "solicitudes_llavero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llaveros_nfc_vecino_id_fkey"
            columns: ["vecino_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes_ticket_soporte: {
        Row: {
          autor_id: string | null
          creado_en: string
          id: string
          mensaje: string
          origen: Database["public"]["Enums"]["origen_mensaje_soporte"]
          ticket_id: string
        }
        Insert: {
          autor_id?: string | null
          creado_en?: string
          id?: string
          mensaje: string
          origen: Database["public"]["Enums"]["origen_mensaje_soporte"]
          ticket_id: string
        }
        Update: {
          autor_id?: string | null
          creado_en?: string
          id?: string
          mensaje?: string
          origen?: Database["public"]["Enums"]["origen_mensaje_soporte"]
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_ticket_soporte_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets_soporte"
            referencedColumns: ["id"]
          },
        ]
      }
      miembros_negocio: {
        Row: {
          actualizado_en: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_miembro_negocio"]
          id: string
          negocio_id: string
          pin_hash: string | null
          rol: Database["public"]["Enums"]["rol_miembro_negocio"]
          usuario_id: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_miembro_negocio"]
          id?: string
          negocio_id: string
          pin_hash?: string | null
          rol: Database["public"]["Enums"]["rol_miembro_negocio"]
          usuario_id: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_miembro_negocio"]
          id?: string
          negocio_id?: string
          pin_hash?: string | null
          rol?: Database["public"]["Enums"]["rol_miembro_negocio"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "miembros_negocio_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_regis: {
        Row: {
          canje_id: string | null
          cantidad: number
          compra_id: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_movimiento_regis"]
          id: string
          idempotency_key: string
          metadata: Json
          monto_base_clp: number | null
          movimiento_relacionado_id: string | null
          negocio_id: string
          regla_regis_id: string | null
          remanente_antes_clp: number | null
          remanente_despues_clp: number | null
          tasa_acumulacion_bp: number | null
          tipo: Database["public"]["Enums"]["tipo_movimiento_regis"]
          valor_recompensa_clp: number | null
          valor_regis_clp: number | null
          vecino_id: string
        }
        Insert: {
          canje_id?: string | null
          cantidad: number
          compra_id?: string | null
          creado_en?: string
          estado: Database["public"]["Enums"]["estado_movimiento_regis"]
          id?: string
          idempotency_key: string
          metadata?: Json
          monto_base_clp?: number | null
          movimiento_relacionado_id?: string | null
          negocio_id: string
          regla_regis_id?: string | null
          remanente_antes_clp?: number | null
          remanente_despues_clp?: number | null
          tasa_acumulacion_bp?: number | null
          tipo: Database["public"]["Enums"]["tipo_movimiento_regis"]
          valor_recompensa_clp?: number | null
          valor_regis_clp?: number | null
          vecino_id: string
        }
        Update: {
          canje_id?: string | null
          cantidad?: number
          compra_id?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_movimiento_regis"]
          id?: string
          idempotency_key?: string
          metadata?: Json
          monto_base_clp?: number | null
          movimiento_relacionado_id?: string | null
          negocio_id?: string
          regla_regis_id?: string | null
          remanente_antes_clp?: number | null
          remanente_despues_clp?: number | null
          tasa_acumulacion_bp?: number | null
          tipo?: Database["public"]["Enums"]["tipo_movimiento_regis"]
          valor_recompensa_clp?: number | null
          valor_regis_clp?: number | null
          vecino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_regis_canje_id_fkey"
            columns: ["canje_id"]
            isOneToOne: false
            referencedRelation: "canjes_regis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_regis_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_regis_movimiento_relacionado_id_fkey"
            columns: ["movimiento_relacionado_id"]
            isOneToOne: false
            referencedRelation: "movimientos_regis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_regis_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_regis_regla_regis_id_fkey"
            columns: ["regla_regis_id"]
            isOneToOne: false
            referencedRelation: "reglas_regis"
            referencedColumns: ["id"]
          },
        ]
      }
      negocios: {
        Row: {
          actualizado_en: string
          creado_en: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_negocio"]
          id: string
          logo_url: string | null
          nombre: string
          rubro: string
          rut: string | null
          slug: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_negocio"]
          id?: string
          logo_url?: string | null
          nombre: string
          rubro: string
          rut?: string | null
          slug: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_negocio"]
          id?: string
          logo_url?: string | null
          nombre?: string
          rubro?: string
          rut?: string | null
          slug?: string
        }
        Relationships: []
      }
      perfiles: {
        Row: {
          actualizado_en: string
          apellido: string | null
          avatar_url: string | null
          comuna: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_perfil"]
          id: string
          modalidad_atencion: Database["public"]["Enums"]["modalidad_atencion"]
          nombre: string
          rol_plataforma: Database["public"]["Enums"]["rol_plataforma"]
          telefono: string | null
        }
        Insert: {
          actualizado_en?: string
          apellido?: string | null
          avatar_url?: string | null
          comuna?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_perfil"]
          id: string
          modalidad_atencion?: Database["public"]["Enums"]["modalidad_atencion"]
          nombre: string
          rol_plataforma?: Database["public"]["Enums"]["rol_plataforma"]
          telefono?: string | null
        }
        Update: {
          actualizado_en?: string
          apellido?: string | null
          avatar_url?: string | null
          comuna?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_perfil"]
          id?: string
          modalidad_atencion?: Database["public"]["Enums"]["modalidad_atencion"]
          nombre?: string
          rol_plataforma?: Database["public"]["Enums"]["rol_plataforma"]
          telefono?: string | null
        }
        Relationships: []
      }
      planes: {
        Row: {
          actualizado_en: string
          codigo: string
          creado_en: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_plan"]
          id: string
          limite_beneficios_activos: number | null
          limite_cajas: number | null
          limite_campanas_mensuales: number | null
          limite_clientes_activos: number | null
          limite_miembros: number | null
          limite_sucursales: number | null
          nivel_reportes: string | null
          nombre: string
          precio_mensual_clp: number
        }
        Insert: {
          actualizado_en?: string
          codigo: string
          creado_en?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_plan"]
          id?: string
          limite_beneficios_activos?: number | null
          limite_cajas?: number | null
          limite_campanas_mensuales?: number | null
          limite_clientes_activos?: number | null
          limite_miembros?: number | null
          limite_sucursales?: number | null
          nivel_reportes?: string | null
          nombre: string
          precio_mensual_clp?: number
        }
        Update: {
          actualizado_en?: string
          codigo?: string
          creado_en?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_plan"]
          id?: string
          limite_beneficios_activos?: number | null
          limite_cajas?: number | null
          limite_campanas_mensuales?: number | null
          limite_clientes_activos?: number | null
          limite_miembros?: number | null
          limite_sucursales?: number | null
          nivel_reportes?: string | null
          nombre?: string
          precio_mensual_clp?: number
        }
        Relationships: []
      }
      registro_supervision_beneficios: {
        Row: {
          accion: Database["public"]["Enums"]["accion_supervision_beneficio_regis"]
          actor_id: string | null
          beneficio_id: string
          beneficio_version_id: string
          creado_en: string
          id: string
          motivo: string | null
          negocio_id: string
        }
        Insert: {
          accion: Database["public"]["Enums"]["accion_supervision_beneficio_regis"]
          actor_id?: string | null
          beneficio_id: string
          beneficio_version_id: string
          creado_en?: string
          id?: string
          motivo?: string | null
          negocio_id: string
        }
        Update: {
          accion?: Database["public"]["Enums"]["accion_supervision_beneficio_regis"]
          actor_id?: string | null
          beneficio_id?: string
          beneficio_version_id?: string
          creado_en?: string
          id?: string
          motivo?: string | null
          negocio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registro_supervision_beneficio_version_fkey"
            columns: ["beneficio_version_id", "beneficio_id"]
            isOneToOne: false
            referencedRelation: "versiones_beneficio_regis"
            referencedColumns: ["id", "beneficio_id"]
          },
          {
            foreignKeyName: "registro_supervision_beneficios_beneficio_id_fkey"
            columns: ["beneficio_id"]
            isOneToOne: false
            referencedRelation: "beneficios_regis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registro_supervision_beneficios_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      reglas_regis: {
        Row: {
          activa: boolean
          conservar_remanente: boolean
          creado_en: string
          creado_por: string | null
          id: string
          monto_minimo_compra_clp: number
          negocio_id: string | null
          porcentaje_maximo_canje_bp: number
          tasa_acumulacion_bp: number
          valor_regis_clp: number
          version: number
          vigencia_desde: string
          vigencia_hasta: string | null
        }
        Insert: {
          activa?: boolean
          conservar_remanente?: boolean
          creado_en?: string
          creado_por?: string | null
          id?: string
          monto_minimo_compra_clp: number
          negocio_id?: string | null
          porcentaje_maximo_canje_bp: number
          tasa_acumulacion_bp: number
          valor_regis_clp: number
          version: number
          vigencia_desde?: string
          vigencia_hasta?: string | null
        }
        Update: {
          activa?: boolean
          conservar_remanente?: boolean
          creado_en?: string
          creado_por?: string | null
          id?: string
          monto_minimo_compra_clp?: number
          negocio_id?: string | null
          porcentaje_maximo_canje_bp?: number
          tasa_acumulacion_bp?: number
          valor_regis_clp?: number
          version?: number
          vigencia_desde?: string
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reglas_regis_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      saldos_regis: {
        Row: {
          actualizado_en: string
          canjeados: number
          disponibles: number
          id: string
          negocio_id: string
          pendientes: number
          remanente_valor_clp: number
          reservados: number
          vecino_id: string
        }
        Insert: {
          actualizado_en?: string
          canjeados?: number
          disponibles?: number
          id?: string
          negocio_id: string
          pendientes?: number
          remanente_valor_clp?: number
          reservados?: number
          vecino_id: string
        }
        Update: {
          actualizado_en?: string
          canjeados?: number
          disponibles?: number
          id?: string
          negocio_id?: string
          pendientes?: number
          remanente_valor_clp?: number
          reservados?: number
          vecino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saldos_regis_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      sesiones_lector_movil: {
        Row: {
          actualizado_en: string
          caja_id: string
          cerrada_en: string | null
          creada_por: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_sesion_lector_movil"]
          expira_en: string
          expira_vinculacion_en: string
          id: string
          nombre_lector: string | null
          terminal_id: string
          token_lector_hash: string | null
          token_vinculacion_hash: string | null
          ultima_lectura_en: string | null
          vinculada_en: string | null
        }
        Insert: {
          actualizado_en?: string
          caja_id: string
          cerrada_en?: string | null
          creada_por: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_sesion_lector_movil"]
          expira_en: string
          expira_vinculacion_en: string
          id?: string
          nombre_lector?: string | null
          terminal_id: string
          token_lector_hash?: string | null
          token_vinculacion_hash?: string | null
          ultima_lectura_en?: string | null
          vinculada_en?: string | null
        }
        Update: {
          actualizado_en?: string
          caja_id?: string
          cerrada_en?: string | null
          creada_por?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_sesion_lector_movil"]
          expira_en?: string
          expira_vinculacion_en?: string
          id?: string
          nombre_lector?: string | null
          terminal_id?: string
          token_lector_hash?: string | null
          token_vinculacion_hash?: string | null
          ultima_lectura_en?: string | null
          vinculada_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sesiones_lector_movil_terminal_caja_fkey"
            columns: ["terminal_id", "caja_id"]
            isOneToOne: false
            referencedRelation: "terminales"
            referencedColumns: ["id", "caja_id"]
          },
        ]
      }
      solicitudes_compra: {
        Row: {
          actualizado_en: string
          caja_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_solicitud_compra"]
          expira_en: string
          id: string
          idempotency_key: string
          informado_por: Database["public"]["Enums"]["informado_por"] | null
          lectura_terminal_id: string | null
          llavero_id: string | null
          monto_corregido: number | null
          monto_informado: number | null
          motivo_correccion: string | null
          motivo_rechazo: string | null
          vecino_id: string
        }
        Insert: {
          actualizado_en?: string
          caja_id: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_solicitud_compra"]
          expira_en: string
          id?: string
          idempotency_key: string
          informado_por?: Database["public"]["Enums"]["informado_por"] | null
          lectura_terminal_id?: string | null
          llavero_id?: string | null
          monto_corregido?: number | null
          monto_informado?: number | null
          motivo_correccion?: string | null
          motivo_rechazo?: string | null
          vecino_id: string
        }
        Update: {
          actualizado_en?: string
          caja_id?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_solicitud_compra"]
          expira_en?: string
          id?: string
          idempotency_key?: string
          informado_por?: Database["public"]["Enums"]["informado_por"] | null
          lectura_terminal_id?: string | null
          llavero_id?: string | null
          monto_corregido?: number | null
          monto_informado?: number | null
          motivo_correccion?: string | null
          motivo_rechazo?: string | null
          vecino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_compra_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_compra_lectura_terminal_id_fkey"
            columns: ["lectura_terminal_id"]
            isOneToOne: true
            referencedRelation: "lecturas_llavero_terminal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_compra_llavero_id_fkey"
            columns: ["llavero_id"]
            isOneToOne: false
            referencedRelation: "llaveros_nfc"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes_llavero: {
        Row: {
          actualizado_en: string
          creado_en: string
          entregado_en: string | null
          estado: Database["public"]["Enums"]["estado_solicitud_llavero"]
          id: string
          negocio_solicitud_id: string | null
          observaciones: string | null
          programado_para: string | null
          solicitado_en: string
          vecino_id: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          entregado_en?: string | null
          estado?: Database["public"]["Enums"]["estado_solicitud_llavero"]
          id?: string
          negocio_solicitud_id?: string | null
          observaciones?: string | null
          programado_para?: string | null
          solicitado_en?: string
          vecino_id: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          entregado_en?: string | null
          estado?: Database["public"]["Enums"]["estado_solicitud_llavero"]
          id?: string
          negocio_solicitud_id?: string | null
          observaciones?: string | null
          programado_para?: string | null
          solicitado_en?: string
          vecino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_llavero_negocio_solicitud_id_fkey"
            columns: ["negocio_solicitud_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_llavero_vecino_id_fkey"
            columns: ["vecino_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sucursales: {
        Row: {
          actualizado_en: string
          comuna: string
          creado_en: string
          direccion: string
          estado: Database["public"]["Enums"]["estado_sucursal"]
          id: string
          negocio_id: string
          nombre: string
        }
        Insert: {
          actualizado_en?: string
          comuna: string
          creado_en?: string
          direccion: string
          estado?: Database["public"]["Enums"]["estado_sucursal"]
          id?: string
          negocio_id: string
          nombre: string
        }
        Update: {
          actualizado_en?: string
          comuna?: string
          creado_en?: string
          direccion?: string
          estado?: Database["public"]["Enums"]["estado_sucursal"]
          id?: string
          negocio_id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "sucursales_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      suscripciones: {
        Row: {
          actualizado_en: string
          cancelada_en: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_suscripcion"]
          id: string
          inicia_en: string
          negocio_id: string
          plan_id: string
          vence_en: string | null
        }
        Insert: {
          actualizado_en?: string
          cancelada_en?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_suscripcion"]
          id?: string
          inicia_en?: string
          negocio_id: string
          plan_id: string
          vence_en?: string | null
        }
        Update: {
          actualizado_en?: string
          cancelada_en?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_suscripcion"]
          id?: string
          inicia_en?: string
          negocio_id?: string
          plan_id?: string
          vence_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suscripciones_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
        ]
      }
      terminales: {
        Row: {
          actualizado_en: string
          caja_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_terminal"]
          id: string
          identificador_publico: string
          nombre_dispositivo: string | null
          token_hash: string
          ultima_conexion_en: string | null
          version_app: string | null
        }
        Insert: {
          actualizado_en?: string
          caja_id: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_terminal"]
          id?: string
          identificador_publico: string
          nombre_dispositivo?: string | null
          token_hash: string
          ultima_conexion_en?: string | null
          version_app?: string | null
        }
        Update: {
          actualizado_en?: string
          caja_id?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_terminal"]
          id?: string
          identificador_publico?: string
          nombre_dispositivo?: string | null
          token_hash?: string
          ultima_conexion_en?: string | null
          version_app?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "terminales_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets_soporte: {
        Row: {
          actualizado_en: string
          asunto: string
          beneficio_id: string | null
          categoria: Database["public"]["Enums"]["categoria_ticket_soporte"]
          cerrado_en: string | null
          creado_en: string
          creado_por: string
          estado: Database["public"]["Enums"]["estado_ticket_soporte"]
          id: string
          leido_comercio_en: string | null
          leido_regalones_en: string | null
          negocio_id: string
          ultima_actividad_en: string
        }
        Insert: {
          actualizado_en?: string
          asunto: string
          beneficio_id?: string | null
          categoria: Database["public"]["Enums"]["categoria_ticket_soporte"]
          cerrado_en?: string | null
          creado_en?: string
          creado_por: string
          estado?: Database["public"]["Enums"]["estado_ticket_soporte"]
          id?: string
          leido_comercio_en?: string | null
          leido_regalones_en?: string | null
          negocio_id: string
          ultima_actividad_en?: string
        }
        Update: {
          actualizado_en?: string
          asunto?: string
          beneficio_id?: string | null
          categoria?: Database["public"]["Enums"]["categoria_ticket_soporte"]
          cerrado_en?: string | null
          creado_en?: string
          creado_por?: string
          estado?: Database["public"]["Enums"]["estado_ticket_soporte"]
          id?: string
          leido_comercio_en?: string | null
          leido_regalones_en?: string | null
          negocio_id?: string
          ultima_actividad_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_soporte_beneficio_id_fkey"
            columns: ["beneficio_id"]
            isOneToOne: false
            referencedRelation: "beneficios_regis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_soporte_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      vecinos_negocios: {
        Row: {
          actualizado_en: string
          creado_en: string
          id: string
          negocio_id: string
          primera_compra_en: string | null
          ultima_compra_en: string | null
          vecino_id: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          id?: string
          negocio_id: string
          primera_compra_en?: string | null
          ultima_compra_en?: string | null
          vecino_id: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          id?: string
          negocio_id?: string
          primera_compra_en?: string | null
          ultima_compra_en?: string | null
          vecino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vecinos_negocios_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      versiones_beneficio_regis: {
        Row: {
          beneficio_id: string
          compra_minima_clp: number
          costo_regis: number
          creado_en: string
          creado_por: string | null
          cupos_totales: number | null
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_beneficio_regis"]
          id: string
          limite_por_vecino: number
          monto_descuento_fijo_clp: number | null
          mostrar_cupos: boolean
          nombre: string
          porcentaje_descuento_bp: number | null
          porcentaje_maximo_canje_bp: number
          publicado_en: string | null
          regla_regis_id: string
          tipo: Database["public"]["Enums"]["tipo_beneficio_regis"]
          tope_descuento_clp: number | null
          valor_regis_clp: number
          version: number
          vigencia_desde: string
          vigencia_hasta: string | null
        }
        Insert: {
          beneficio_id: string
          compra_minima_clp: number
          costo_regis: number
          creado_en?: string
          creado_por?: string | null
          cupos_totales?: number | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_beneficio_regis"]
          id?: string
          limite_por_vecino?: number
          monto_descuento_fijo_clp?: number | null
          mostrar_cupos?: boolean
          nombre: string
          porcentaje_descuento_bp?: number | null
          porcentaje_maximo_canje_bp: number
          publicado_en?: string | null
          regla_regis_id: string
          tipo: Database["public"]["Enums"]["tipo_beneficio_regis"]
          tope_descuento_clp?: number | null
          valor_regis_clp: number
          version: number
          vigencia_desde?: string
          vigencia_hasta?: string | null
        }
        Update: {
          beneficio_id?: string
          compra_minima_clp?: number
          costo_regis?: number
          creado_en?: string
          creado_por?: string | null
          cupos_totales?: number | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_beneficio_regis"]
          id?: string
          limite_por_vecino?: number
          monto_descuento_fijo_clp?: number | null
          mostrar_cupos?: boolean
          nombre?: string
          porcentaje_descuento_bp?: number | null
          porcentaje_maximo_canje_bp?: number
          publicado_en?: string | null
          regla_regis_id?: string
          tipo?: Database["public"]["Enums"]["tipo_beneficio_regis"]
          tope_descuento_clp?: number | null
          valor_regis_clp?: number
          version?: number
          vigencia_desde?: string
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "versiones_beneficio_regis_beneficio_id_fkey"
            columns: ["beneficio_id"]
            isOneToOne: false
            referencedRelation: "beneficios_regis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "versiones_beneficio_regis_regla_regis_id_fkey"
            columns: ["regla_regis_id"]
            isOneToOne: false
            referencedRelation: "reglas_regis"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acreditar_regis_compra: {
        Args: { p_compra_id: string }
        Returns: {
          canje_id: string | null
          cantidad: number
          compra_id: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_movimiento_regis"]
          id: string
          idempotency_key: string
          metadata: Json
          monto_base_clp: number | null
          movimiento_relacionado_id: string | null
          negocio_id: string
          regla_regis_id: string | null
          remanente_antes_clp: number | null
          remanente_despues_clp: number | null
          tasa_acumulacion_bp: number | null
          tipo: Database["public"]["Enums"]["tipo_movimiento_regis"]
          valor_recompensa_clp: number | null
          valor_regis_clp: number | null
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "movimientos_regis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activar_llavero_desde_lectura: {
        Args: {
          p_identidad_verificada?: boolean
          p_lectura_id: string
          p_metodo: Database["public"]["Enums"]["metodo_verificacion_llavero"]
          p_pin?: string
          p_terminal_id: string
          p_token_terminal: string
        }
        Returns: {
          activado: boolean
          activado_en: string
          codigo_publico: string
          estado: Database["public"]["Enums"]["estado_llavero_nfc"]
          mensaje: string
        }[]
      }
      activar_llavero_primer_uso: {
        Args: {
          p_caja_id: string
          p_identidad_verificada?: boolean
          p_metodo: Database["public"]["Enums"]["metodo_verificacion_llavero"]
          p_pin?: string
          p_token: string
        }
        Returns: {
          activado: boolean
          activado_en: string
          codigo_publico: string
          estado: Database["public"]["Enums"]["estado_llavero_nfc"]
          mensaje: string
        }[]
      }
      aprobar_compra: {
        Args: {
          p_folio_boleta?: string
          p_origen?: Database["public"]["Enums"]["origen_compra"]
          p_solicitud_id: string
        }
        Returns: {
          aporte_promocional_clp: number
          caja_id: string
          cajero_id: string
          creado_en: string
          descuento_total_clp: number
          estado: Database["public"]["Enums"]["estado_compra"]
          folio_boleta: string | null
          id: string
          monto_base_regis_clp: number | null
          monto_bruto_clp: number | null
          monto_final: number
          negocio_id: string
          origen: Database["public"]["Enums"]["origen_compra"]
          regis_generados: number
          regis_procesados_en: string | null
          regis_utilizados: number
          regla_regis_id: string | null
          revertido_en: string | null
          riesgo: Database["public"]["Enums"]["severidad_riesgo"] | null
          solicitud_id: string
          sucursal_id: string
          tasa_acumulacion_bp_aplicada: number | null
          valor_regis_clp_aplicado: number | null
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "compras"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cambiar_estado_beneficio_regis: {
        Args: {
          p_beneficio_version_id: string
          p_estado: Database["public"]["Enums"]["estado_beneficio_regis"]
          p_motivo: string
        }
        Returns: {
          beneficio_id: string
          compra_minima_clp: number
          costo_regis: number
          creado_en: string
          creado_por: string | null
          cupos_totales: number | null
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_beneficio_regis"]
          id: string
          limite_por_vecino: number
          monto_descuento_fijo_clp: number | null
          mostrar_cupos: boolean
          nombre: string
          porcentaje_descuento_bp: number | null
          porcentaje_maximo_canje_bp: number
          publicado_en: string | null
          regla_regis_id: string
          tipo: Database["public"]["Enums"]["tipo_beneficio_regis"]
          tope_descuento_clp: number | null
          valor_regis_clp: number
          version: number
          vigencia_desde: string
          vigencia_hasta: string | null
        }
        SetofOptions: {
          from: "*"
          to: "versiones_beneficio_regis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cambiar_estado_llavero: {
        Args: {
          p_estado: Database["public"]["Enums"]["estado_llavero_nfc"]
          p_llavero_id: string
        }
        Returns: {
          asignado_en: string
          bloqueado_en: string
          codigo_publico: string
          estado: Database["public"]["Enums"]["estado_llavero_nfc"]
          id: string
          vecino_id: string
        }[]
      }
      cambiar_estado_ticket_soporte: {
        Args: {
          p_estado: Database["public"]["Enums"]["estado_ticket_soporte"]
          p_ticket_id: string
        }
        Returns: {
          actualizado_en: string
          asunto: string
          beneficio_id: string | null
          categoria: Database["public"]["Enums"]["categoria_ticket_soporte"]
          cerrado_en: string | null
          creado_en: string
          creado_por: string
          estado: Database["public"]["Enums"]["estado_ticket_soporte"]
          id: string
          leido_comercio_en: string | null
          leido_regalones_en: string | null
          negocio_id: string
          ultima_actividad_en: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets_soporte"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancelar_reserva_canje_regis: {
        Args: { p_canje_id: string }
        Returns: {
          canje_id: string
          costo_regis: number
          estado: Database["public"]["Enums"]["estado_canje_regis"]
        }[]
      }
      cancelar_solicitud_llavero: {
        Args: { p_solicitud_id: string }
        Returns: {
          actualizado_en: string
          creado_en: string
          entregado_en: string | null
          estado: Database["public"]["Enums"]["estado_solicitud_llavero"]
          id: string
          negocio_solicitud_id: string | null
          observaciones: string | null
          programado_para: string | null
          solicitado_en: string
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_llavero"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cerrar_sesion_lector_movil: {
        Args: { p_terminal_id: string }
        Returns: undefined
      }
      confirmar_compra_con_canje: {
        Args: {
          p_caja_id: string
          p_canje_id: string
          p_folio_boleta?: string
          p_monto_bruto_clp: number
          p_qr_token?: string
        }
        Returns: {
          aporte_promocional_negocio_clp: number
          canje_id: string
          compra_id: string
          descuento_total_clp: number
          estado: Database["public"]["Enums"]["estado_canje_regis"]
          monto_compra_bruto_clp: number
          monto_final_pagado_clp: number
          regis_utilizados: number
          valor_financiado_regis_clp: number
        }[]
      }
      consultar_canje_regis_qr: {
        Args: { p_caja_id: string; p_qr_token: string }
        Returns: {
          canje_id: string
          codigo_publico: string
          compra_minima_clp: number
          costo_regis: number
          estado: Database["public"]["Enums"]["estado_canje_regis"]
          expira_en: string
          monto_descuento_fijo_clp: number
          nombre_beneficio: string
          porcentaje_descuento_bp: number
          porcentaje_maximo_canje_bp: number
          tipo: Database["public"]["Enums"]["tipo_beneficio_regis"]
          tope_descuento_clp: number
        }[]
      }
      consultar_estado_lector_movil: {
        Args: { p_token_lector: string }
        Returns: {
          caja_nombre: string
          estado: Database["public"]["Enums"]["estado_sesion_lector_movil"]
          expira_en: string
          terminal_identificador: string
        }[]
      }
      consultar_llavero_activacion: {
        Args: { p_caja_id: string; p_token: string }
        Returns: {
          codigo_publico: string
          entregado: boolean
          estado: Database["public"]["Enums"]["estado_llavero_nfc"]
          nombre_vecino: string
          puede_activar: boolean
          tiene_pin: boolean
        }[]
      }
      consultar_saldo_regis: {
        Args: { p_negocio_id: string; p_vecino_id?: string }
        Returns: {
          actualizado_en: string
          canjeados: number
          disponibles: number
          negocio_id: string
          pendientes: number
          remanente_valor_clp: number
          reservados: number
          vecino_id: string
        }[]
      }
      consultar_saldo_regis_llavero: {
        Args: { p_caja_id: string; p_token: string }
        Returns: {
          actualizado_en: string
          canjeados: number
          disponibles: number
          negocio_id: string
          nombre_negocio: string
          pendientes: number
          remanente_valor_clp: number
          reservados: number
        }[]
      }
      consumir_lectura_llavero_terminal: {
        Args: { p_lectura_id: string }
        Returns: {
          caja_id: string
          codigo_publico_llavero: string
          consumida_en: string
          lectura_id: string
          llavero_id: string
          nombre_vecino: string
          terminal_id: string
          vecino_id: string
        }[]
      }
      consumir_lectura_operacion_interna: {
        Args: { p_lectura_id: string }
        Returns: undefined
      }
      contar_notificaciones_canjes_regis: {
        Args: {
          p_destino: Database["public"]["Enums"]["destino_notificacion_canje_regis"]
          p_negocio_id?: string
        }
        Returns: number
      }
      contar_tickets_soporte_no_leidos: { Args: never; Returns: number }
      corregir_solicitud_compra: {
        Args: { p_monto: number; p_motivo: string; p_solicitud_id: string }
        Returns: {
          actualizado_en: string
          caja_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_solicitud_compra"]
          expira_en: string
          id: string
          idempotency_key: string
          informado_por: Database["public"]["Enums"]["informado_por"] | null
          lectura_terminal_id: string | null
          llavero_id: string | null
          monto_corregido: number | null
          monto_informado: number | null
          motivo_correccion: string | null
          motivo_rechazo: string | null
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_beneficio_regis: {
        Args: {
          p_codigo: string
          p_compra_minima_clp: number
          p_costo_regis: number
          p_cupos_totales?: number
          p_descripcion?: string
          p_limite_por_vecino?: number
          p_monto_descuento_fijo_clp?: number
          p_mostrar_cupos?: boolean
          p_negocio_id: string
          p_nombre: string
          p_porcentaje_descuento_bp?: number
          p_publicar?: boolean
          p_tipo: Database["public"]["Enums"]["tipo_beneficio_regis"]
          p_tope_descuento_clp?: number
          p_vigencia_desde?: string
          p_vigencia_hasta?: string
        }
        Returns: {
          beneficio_id: string
          compra_minima_clp: number
          costo_regis: number
          creado_en: string
          creado_por: string | null
          cupos_totales: number | null
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_beneficio_regis"]
          id: string
          limite_por_vecino: number
          monto_descuento_fijo_clp: number | null
          mostrar_cupos: boolean
          nombre: string
          porcentaje_descuento_bp: number | null
          porcentaje_maximo_canje_bp: number
          publicado_en: string | null
          regla_regis_id: string
          tipo: Database["public"]["Enums"]["tipo_beneficio_regis"]
          tope_descuento_clp: number | null
          valor_regis_clp: number
          version: number
          vigencia_desde: string
          vigencia_hasta: string | null
        }
        SetofOptions: {
          from: "*"
          to: "versiones_beneficio_regis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_negocio: {
        Args: {
          p_descripcion?: string
          p_logo_url?: string
          p_nombre: string
          p_rubro: string
          p_rut?: string
          p_slug: string
        }
        Returns: {
          actualizado_en: string
          creado_en: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_negocio"]
          id: string
          logo_url: string | null
          nombre: string
          rubro: string
          rut: string | null
          slug: string
        }
        SetofOptions: {
          from: "*"
          to: "negocios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_reserva_canje_regis_interna: {
        Args: {
          p_beneficio_version_id: string
          p_caja_id: string
          p_idempotency_key: string
          p_llavero_id: string
          p_origen: Database["public"]["Enums"]["origen_canje_regis"]
          p_qr_token: string
          p_vecino_id: string
        }
        Returns: {
          aporte_promocional_negocio_clp: number | null
          beneficio_id: string
          beneficio_version_id: string
          caja_id: string | null
          cancelado_en: string | null
          codigo_publico: string
          compra_id: string | null
          confirmado_en: string | null
          costo_regis: number
          creado_en: string
          descuento_total_clp: number | null
          estado: Database["public"]["Enums"]["estado_canje_regis"]
          expira_en: string
          expirado_en: string | null
          id: string
          idempotency_key: string
          lectura_terminal_id: string | null
          leido_admin_regalones_en: string | null
          leido_negocio_en: string | null
          leido_vecino_en: string | null
          llavero_id: string | null
          monto_compra_bruto_clp: number | null
          monto_final_pagado_clp: number | null
          negocio_id: string
          origen: Database["public"]["Enums"]["origen_canje_regis"]
          qr_token_hash: string | null
          regla_regis_id: string
          reservado_en: string
          valor_financiado_regis_clp: number | null
          valor_regis_clp: number
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "canjes_regis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_solicitud_compra: {
        Args: {
          p_expira_en: string
          p_idempotency_key: string
          p_monto_informado?: number
          p_token: string
        }
        Returns: {
          actualizado_en: string
          caja_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_solicitud_compra"]
          expira_en: string
          id: string
          idempotency_key: string
          informado_por: Database["public"]["Enums"]["informado_por"] | null
          lectura_terminal_id: string | null
          llavero_id: string | null
          monto_corregido: number | null
          monto_informado: number | null
          motivo_correccion: string | null
          motivo_rechazo: string | null
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_solicitud_compra_asistida: {
        Args: {
          p_caja_id: string
          p_idempotency_key: string
          p_monto: number
          p_token: string
        }
        Returns: {
          actualizado_en: string
          caja_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_solicitud_compra"]
          expira_en: string
          id: string
          idempotency_key: string
          informado_por: Database["public"]["Enums"]["informado_por"] | null
          lectura_terminal_id: string | null
          llavero_id: string | null
          monto_corregido: number | null
          monto_informado: number | null
          motivo_correccion: string | null
          motivo_rechazo: string | null
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_solicitud_compra_desde_lectura: {
        Args: {
          p_idempotency_key: string
          p_lectura_id: string
          p_monto: number
          p_terminal_id: string
          p_token_terminal: string
        }
        Returns: {
          actualizado_en: string
          caja_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_solicitud_compra"]
          expira_en: string
          id: string
          idempotency_key: string
          informado_por: Database["public"]["Enums"]["informado_por"] | null
          lectura_terminal_id: string | null
          llavero_id: string | null
          monto_corregido: number | null
          monto_informado: number | null
          motivo_correccion: string | null
          motivo_rechazo: string | null
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_ticket_soporte: {
        Args: {
          p_asunto: string
          p_beneficio_id?: string
          p_categoria: Database["public"]["Enums"]["categoria_ticket_soporte"]
          p_mensaje: string
          p_negocio_id: string
        }
        Returns: {
          actualizado_en: string
          asunto: string
          beneficio_id: string | null
          categoria: Database["public"]["Enums"]["categoria_ticket_soporte"]
          cerrado_en: string | null
          creado_en: string
          creado_por: string
          estado: Database["public"]["Enums"]["estado_ticket_soporte"]
          id: string
          leido_comercio_en: string | null
          leido_regalones_en: string | null
          negocio_id: string
          ultima_actividad_en: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets_soporte"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_vinculacion_lector_movil: {
        Args: { p_nombre_lector?: string; p_terminal_id: string }
        Returns: {
          caja_id: string
          expira_sesion_en: string
          expira_vinculacion_en: string
          sesion_id: string
          terminal_id: string
          token_vinculacion: string
        }[]
      }
      crear_vinculacion_lector_terminal: {
        Args: {
          p_nombre_lector?: string
          p_terminal_id: string
          p_token_terminal: string
        }
        Returns: {
          caja_id: string
          expira_sesion_en: string
          expira_vinculacion_en: string
          sesion_id: string
          terminal_id: string
          token_vinculacion: string
        }[]
      }
      entregar_llavero: {
        Args: {
          p_codigo_publico: string
          p_solicitud_id: string
          p_token: string
        }
        Returns: {
          asignado_en: string
          codigo_publico: string
          estado: Database["public"]["Enums"]["estado_llavero_nfc"]
          id: string
          solicitud_id: string
          vecino_id: string
        }[]
      }
      es_admin_regalones: { Args: never; Returns: boolean }
      es_miembro_negocio: {
        Args: {
          p_negocio_id: string
          p_roles?: Database["public"]["Enums"]["rol_miembro_negocio"][]
        }
        Returns: boolean
      }
      es_operador_terminal: {
        Args: { p_terminal_id: string }
        Returns: boolean
      }
      expirar_reservas_canje_regis: { Args: never; Returns: number }
      informar_monto_cajero: {
        Args: { p_monto: number; p_solicitud_id: string }
        Returns: {
          actualizado_en: string
          caja_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_solicitud_compra"]
          expira_en: string
          id: string
          idempotency_key: string
          informado_por: Database["public"]["Enums"]["informado_por"] | null
          lectura_terminal_id: string | null
          llavero_id: string | null
          monto_corregido: number | null
          monto_informado: number | null
          motivo_correccion: string | null
          motivo_rechazo: string | null
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      informar_monto_vecino: {
        Args: { p_monto: number; p_solicitud_id: string }
        Returns: {
          actualizado_en: string
          caja_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_solicitud_compra"]
          expira_en: string
          id: string
          idempotency_key: string
          informado_por: Database["public"]["Enums"]["informado_por"] | null
          lectura_terminal_id: string | null
          llavero_id: string | null
          monto_corregido: number | null
          monto_informado: number | null
          motivo_correccion: string | null
          motivo_rechazo: string | null
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      listar_beneficios_regis_disponibles: {
        Args: { p_negocio_id?: string }
        Returns: {
          beneficio_id: string
          beneficio_version_id: string
          compra_minima_clp: number
          costo_regis: number
          cupos_disponibles: number
          descripcion: string
          monto_descuento_fijo_clp: number
          mostrar_cupos: boolean
          negocio_id: string
          nombre_beneficio: string
          nombre_negocio: string
          porcentaje_descuento_bp: number
          porcentaje_maximo_canje_bp: number
          puede_reservar: boolean
          saldo_disponible: number
          tipo: Database["public"]["Enums"]["tipo_beneficio_regis"]
          tope_descuento_clp: number
          vigencia_hasta: string
        }[]
      }
      listar_gestion_llaveros: {
        Args: never
        Returns: {
          asignado_en: string
          codigo_publico: string
          entregado_en: string
          estado_llavero: Database["public"]["Enums"]["estado_llavero_nfc"]
          estado_solicitud: Database["public"]["Enums"]["estado_solicitud_llavero"]
          llavero_id: string
          modalidad_atencion: Database["public"]["Enums"]["modalidad_atencion"]
          negocio_solicitud_id: string
          nombre_negocio: string
          nombre_vecino: string
          observaciones: string
          programado_para: string
          solicitado_en: string
          solicitud_id: string
          vecino_id: string
        }[]
      }
      listar_gestion_llaveros_detalle: {
        Args: never
        Returns: {
          activado_en: string
          codigo_publico: string
          comuna_vecino: string
          correo_vecino: string
          entregado_en: string
          estado_llavero: Database["public"]["Enums"]["estado_llavero_nfc"]
          estado_solicitud: Database["public"]["Enums"]["estado_solicitud_llavero"]
          llavero_id: string
          metodo_activacion: Database["public"]["Enums"]["metodo_verificacion_llavero"]
          modalidad_atencion: Database["public"]["Enums"]["modalidad_atencion"]
          negocio_solicitud_id: string
          nombre_negocio: string
          nombre_vecino: string
          observaciones: string
          preparado_en: string
          programado_para: string
          solicitado_en: string
          solicitud_id: string
          telefono_vecino: string
          vecino_id: string
        }[]
      }
      listar_historial_canjes_admin: {
        Args: {
          p_beneficio_id?: string
          p_limite?: number
          p_negocio_id?: string
        }
        Returns: {
          beneficio_id: string
          beneficio_version_id: string
          canje_id: string
          codigo_publico: string
          confirmado_en: string
          costo_regis: number
          descuento_total_clp: number
          leido: boolean
          monto_compra_bruto_clp: number
          monto_final_pagado_clp: number
          negocio_id: string
          nombre_beneficio: string
          nombre_negocio: string
          origen: Database["public"]["Enums"]["origen_canje_regis"]
        }[]
      }
      listar_historial_canjes_negocio: {
        Args: {
          p_beneficio_id?: string
          p_limite?: number
          p_negocio_id: string
        }
        Returns: {
          beneficio_id: string
          beneficio_version_id: string
          canje_id: string
          codigo_publico: string
          confirmado_en: string
          costo_regis: number
          descuento_total_clp: number
          leido: boolean
          monto_compra_bruto_clp: number
          monto_final_pagado_clp: number
          negocio_id: string
          nombre_beneficio: string
          nombre_negocio: string
          origen: Database["public"]["Enums"]["origen_canje_regis"]
        }[]
      }
      listar_historial_canjes_vecino: {
        Args: { p_limite?: number }
        Returns: {
          beneficio_id: string
          beneficio_version_id: string
          canje_id: string
          codigo_publico: string
          confirmado_en: string
          costo_regis: number
          descuento_total_clp: number
          leido: boolean
          monto_compra_bruto_clp: number
          monto_final_pagado_clp: number
          negocio_id: string
          nombre_beneficio: string
          nombre_negocio: string
          origen: Database["public"]["Enums"]["origen_canje_regis"]
        }[]
      }
      listar_lecturas_pendientes_terminal: {
        Args: { p_terminal_id: string }
        Returns: {
          codigo_publico_llavero: string
          expira_en: string
          lectura_id: string
          leido_en: string
          llavero_id: string
          nombre_vecino: string
          vecino_id: string
        }[]
      }
      listar_saldos_regis_propios: {
        Args: never
        Returns: {
          actualizado_en: string
          canjeados: number
          disponibles: number
          negocio_id: string
          nombre_negocio: string
          pendientes: number
          remanente_valor_clp: number
          reservados: number
        }[]
      }
      marcar_canje_regis_leido: {
        Args: {
          p_canje_id: string
          p_destino: Database["public"]["Enums"]["destino_notificacion_canje_regis"]
        }
        Returns: {
          canje_id: string
          destino: Database["public"]["Enums"]["destino_notificacion_canje_regis"]
          leido_en: string
        }[]
      }
      marcar_ticket_soporte_leido: {
        Args: { p_ticket_id: string }
        Returns: {
          actualizado_en: string
          asunto: string
          beneficio_id: string | null
          categoria: Database["public"]["Enums"]["categoria_ticket_soporte"]
          cerrado_en: string | null
          creado_en: string
          creado_por: string
          estado: Database["public"]["Enums"]["estado_ticket_soporte"]
          id: string
          leido_comercio_en: string | null
          leido_regalones_en: string | null
          negocio_id: string
          ultima_actividad_en: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets_soporte"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      obtener_lectura_operacion_interna: {
        Args: {
          p_lectura_id: string
          p_terminal_id: string
          p_token_terminal: string
        }
        Returns: {
          caja_id: string
          consumida_en: string | null
          consumida_por: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_lectura_llavero_terminal"]
          expira_en: string
          id: string
          leido_en: string
          llavero_id: string
          reclamada_en: string | null
          reclamada_por: string | null
          sesion_id: string
          terminal_id: string
        }
        SetofOptions: {
          from: "*"
          to: "lecturas_llavero_terminal"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      preparar_llavero: {
        Args: {
          p_codigo_publico: string
          p_pin?: string
          p_solicitud_id: string
          p_token: string
        }
        Returns: {
          codigo_publico: string
          estado: Database["public"]["Enums"]["estado_llavero_nfc"]
          id: string
          preparado_en: string
          solicitud_id: string
          tiene_pin: boolean
          vecino_id: string
        }[]
      }
      programar_entrega_llavero: {
        Args: {
          p_observaciones?: string
          p_programado_para: string
          p_solicitud_id: string
        }
        Returns: {
          actualizado_en: string
          creado_en: string
          entregado_en: string | null
          estado: Database["public"]["Enums"]["estado_solicitud_llavero"]
          id: string
          negocio_solicitud_id: string | null
          observaciones: string | null
          programado_para: string | null
          solicitado_en: string
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_llavero"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      puede_acceder_ticket_soporte: {
        Args: { p_ticket_id: string }
        Returns: boolean
      }
      rechazar_solicitud_compra: {
        Args: { p_motivo: string; p_solicitud_id: string }
        Returns: {
          actualizado_en: string
          caja_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_solicitud_compra"]
          expira_en: string
          id: string
          idempotency_key: string
          informado_por: Database["public"]["Enums"]["informado_por"] | null
          lectura_terminal_id: string | null
          llavero_id: string | null
          monto_corregido: number | null
          monto_informado: number | null
          motivo_correccion: string | null
          motivo_rechazo: string | null
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reclamar_lectura_llavero_terminal: {
        Args: {
          p_lectura_id: string
          p_terminal_id: string
          p_token_terminal: string
        }
        Returns: {
          caja_id: string
          canjeados: number
          codigo_publico: string
          disponibles: number
          entregado: boolean
          estado: Database["public"]["Enums"]["estado_llavero_nfc"]
          expira_en: string
          lectura_id: string
          llavero_id: string
          negocio_id: string
          nombre_negocio: string
          nombre_vecino: string
          pendientes: number
          puede_activar: boolean
          remanente_valor_clp: number
          reservados: number
          saldo_actualizado_en: string
          tiene_pin: boolean
          vecino_id: string
        }[]
      }
      registrar_entrega_llavero: {
        Args: { p_solicitud_id: string }
        Returns: {
          actualizado_en: string
          creado_en: string
          entregado_en: string | null
          estado: Database["public"]["Enums"]["estado_solicitud_llavero"]
          id: string
          negocio_solicitud_id: string | null
          observaciones: string | null
          programado_para: string | null
          solicitado_en: string
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_llavero"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_lectura_llavero_terminal: {
        Args: { p_token_lector: string; p_token_llavero: string }
        Returns: {
          caja_nombre: string
          codigo_publico_llavero: string
          expira_en: string
          lectura_id: string
          leido_en: string
          terminal_identificador: string
        }[]
      }
      registrar_terminal_pwa: {
        Args: {
          p_caja_id: string
          p_nombre_dispositivo: string
          p_version_app?: string
        }
        Returns: {
          caja_id: string
          estado: Database["public"]["Enums"]["estado_terminal"]
          identificador_publico: string
          nombre_dispositivo: string
          terminal_id: string
          token_terminal: string
        }[]
      }
      reservar_canje_regis_desde_lectura: {
        Args: {
          p_beneficio_version_id: string
          p_idempotency_key: string
          p_lectura_id: string
          p_terminal_id: string
          p_token_terminal: string
        }
        Returns: {
          canje_id: string
          codigo_publico: string
          costo_regis: number
          estado: Database["public"]["Enums"]["estado_canje_regis"]
          expira_en: string
        }[]
      }
      reservar_canje_regis_llavero: {
        Args: {
          p_beneficio_version_id: string
          p_caja_id: string
          p_idempotency_key: string
          p_token_llavero: string
        }
        Returns: {
          canje_id: string
          codigo_publico: string
          costo_regis: number
          estado: Database["public"]["Enums"]["estado_canje_regis"]
          expira_en: string
        }[]
      }
      reservar_canje_regis_qr: {
        Args: {
          p_beneficio_version_id: string
          p_idempotency_key: string
          p_qr_token: string
        }
        Returns: {
          canje_id: string
          codigo_publico: string
          costo_regis: number
          estado: Database["public"]["Enums"]["estado_canje_regis"]
          expira_en: string
        }[]
      }
      resolver_etiqueta: {
        Args: { p_token: string }
        Returns: {
          caja_id: string
          negocio_id: string
          sucursal_id: string
          tipo: Database["public"]["Enums"]["tipo_etiqueta_nfc"]
        }[]
      }
      responder_ticket_soporte: {
        Args: { p_mensaje: string; p_ticket_id: string }
        Returns: {
          autor_id: string | null
          creado_en: string
          id: string
          mensaje: string
          origen: Database["public"]["Enums"]["origen_mensaje_soporte"]
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "mensajes_ticket_soporte"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revocar_terminal_pwa: {
        Args: { p_terminal_id: string }
        Returns: undefined
      }
      solicitar_reingreso_monto: {
        Args: { p_motivo: string; p_solicitud_id: string }
        Returns: {
          actualizado_en: string
          caja_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_solicitud_compra"]
          expira_en: string
          id: string
          idempotency_key: string
          informado_por: Database["public"]["Enums"]["informado_por"] | null
          lectura_terminal_id: string | null
          llavero_id: string | null
          monto_corregido: number | null
          monto_informado: number | null
          motivo_correccion: string | null
          motivo_rechazo: string | null
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validar_configuracion_beneficio_regis: {
        Args: {
          p_compra_minima_clp: number
          p_costo_regis: number
          p_monto_descuento_fijo_clp: number
          p_porcentaje_descuento_bp: number
          p_porcentaje_maximo_canje_bp: number
          p_tipo: Database["public"]["Enums"]["tipo_beneficio_regis"]
          p_tope_descuento_clp: number
          p_valor_regis_clp: number
        }
        Returns: undefined
      }
      validar_terminal_operacion_interna: {
        Args: { p_terminal_id: string; p_token_terminal: string }
        Returns: {
          actualizado_en: string
          caja_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_terminal"]
          id: string
          identificador_publico: string
          nombre_dispositivo: string | null
          token_hash: string
          ultima_conexion_en: string | null
          version_app: string | null
        }
        SetofOptions: {
          from: "*"
          to: "terminales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validar_terminal_pwa: {
        Args: {
          p_terminal_id: string
          p_token_terminal: string
          p_version_app?: string
        }
        Returns: {
          caja_id: string
          estado: Database["public"]["Enums"]["estado_terminal"]
          identificador_publico: string
          nombre_dispositivo: string
          terminal_id: string
          valida: boolean
        }[]
      }
      versionar_beneficio_regis: {
        Args: {
          p_beneficio_id: string
          p_compra_minima_clp: number
          p_costo_regis: number
          p_cupos_totales?: number
          p_descripcion?: string
          p_limite_por_vecino?: number
          p_monto_descuento_fijo_clp?: number
          p_mostrar_cupos?: boolean
          p_nombre: string
          p_porcentaje_descuento_bp?: number
          p_publicar?: boolean
          p_tipo: Database["public"]["Enums"]["tipo_beneficio_regis"]
          p_tope_descuento_clp?: number
          p_vigencia_desde?: string
          p_vigencia_hasta?: string
        }
        Returns: {
          beneficio_id: string
          compra_minima_clp: number
          costo_regis: number
          creado_en: string
          creado_por: string | null
          cupos_totales: number | null
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_beneficio_regis"]
          id: string
          limite_por_vecino: number
          monto_descuento_fijo_clp: number | null
          mostrar_cupos: boolean
          nombre: string
          porcentaje_descuento_bp: number | null
          porcentaje_maximo_canje_bp: number
          publicado_en: string | null
          regla_regis_id: string
          tipo: Database["public"]["Enums"]["tipo_beneficio_regis"]
          tope_descuento_clp: number | null
          valor_regis_clp: number
          version: number
          vigencia_desde: string
          vigencia_hasta: string | null
        }
        SetofOptions: {
          from: "*"
          to: "versiones_beneficio_regis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vincular_lector_movil: {
        Args: { p_nombre_lector?: string; p_token_vinculacion: string }
        Returns: {
          caja_nombre: string
          expira_en: string
          sesion_id: string
          terminal_identificador: string
          token_lector: string
        }[]
      }
    }
    Enums: {
      accion_supervision_beneficio_regis:
        | "borrador_creado"
        | "publicado"
        | "pausado"
        | "reactivado"
        | "finalizado"
      categoria_ticket_soporte:
        | "beneficios"
        | "compras"
        | "llaveros"
        | "cuenta"
        | "otro"
      destino_notificacion_canje_regis: "vecino" | "negocio" | "admin_regalones"
      estado_alerta_riesgo:
        | "abierta"
        | "en_revision"
        | "resuelta"
        | "descartada"
      estado_beneficio_regis: "borrador" | "activo" | "pausado" | "finalizado"
      estado_caja: "activa" | "inactiva" | "bloqueada"
      estado_canje_regis: "reservado" | "confirmado" | "expirado" | "cancelado"
      estado_compra: "confirmada" | "observada" | "revertida"
      estado_etiqueta_nfc:
        | "sin_asignar"
        | "activa"
        | "suspendida"
        | "reemplazada"
      estado_lectura_llavero_terminal:
        | "pendiente"
        | "consumida"
        | "expirada"
        | "rechazada"
      estado_llavero_nfc:
        | "sin_asignar"
        | "activo"
        | "bloqueado"
        | "perdido"
        | "reemplazado"
        | "revocado"
      estado_miembro_negocio: "activo" | "suspendido" | "revocado"
      estado_movimiento_regis:
        | "pendiente"
        | "disponible"
        | "canjeado"
        | "revertido"
        | "bloqueado"
      estado_negocio: "pendiente" | "activo" | "suspendido" | "rechazado"
      estado_perfil: "activo" | "bloqueado" | "eliminado"
      estado_plan: "activo" | "inactivo" | "archivado"
      estado_sesion_lector_movil:
        | "pendiente_vinculacion"
        | "vinculada"
        | "cerrada"
        | "expirada"
        | "reemplazada"
      estado_solicitud_compra:
        | "esperando_monto"
        | "esperando_cajero"
        | "pendiente_validacion"
        | "aprobada"
        | "rechazada"
        | "vencida"
        | "cancelada"
      estado_solicitud_llavero:
        | "pendiente"
        | "programada_entrega"
        | "entregada"
        | "cancelada"
      estado_sucursal: "activa" | "inactiva"
      estado_suscripcion:
        | "prueba"
        | "activa"
        | "vencida"
        | "suspendida"
        | "cancelada"
      estado_terminal:
        | "pendiente_activacion"
        | "activa"
        | "bloqueada"
        | "revocada"
      estado_ticket_soporte:
        | "abierto"
        | "en_revision"
        | "esperando_comercio"
        | "resuelto"
        | "cerrado"
      informado_por: "vecino" | "cajero"
      metodo_verificacion_llavero: "cedula" | "pin" | "sms"
      modalidad_atencion: "digital" | "asistida"
      origen_canje_regis: "qr" | "llavero"
      origen_compra: "autoservicio" | "asistido" | "integracion_pos"
      origen_mensaje_soporte: "comercio" | "regalones"
      rol_miembro_negocio: "propietario" | "administrador" | "cajero"
      rol_plataforma: "usuario" | "admin_regalones"
      severidad_riesgo: "baja" | "media" | "alta" | "critica"
      tipo_beneficio_regis: "porcentaje_descuento" | "monto_fijo"
      tipo_etiqueta_nfc: "inscripcion" | "compra"
      tipo_movimiento_regis:
        | "acreditacion_compra"
        | "canje"
        | "reversa"
        | "ajuste"
        | "bonificacion"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      accion_supervision_beneficio_regis: [
        "borrador_creado",
        "publicado",
        "pausado",
        "reactivado",
        "finalizado",
      ],
      categoria_ticket_soporte: [
        "beneficios",
        "compras",
        "llaveros",
        "cuenta",
        "otro",
      ],
      destino_notificacion_canje_regis: [
        "vecino",
        "negocio",
        "admin_regalones",
      ],
      estado_alerta_riesgo: [
        "abierta",
        "en_revision",
        "resuelta",
        "descartada",
      ],
      estado_beneficio_regis: ["borrador", "activo", "pausado", "finalizado"],
      estado_caja: ["activa", "inactiva", "bloqueada"],
      estado_canje_regis: ["reservado", "confirmado", "expirado", "cancelado"],
      estado_compra: ["confirmada", "observada", "revertida"],
      estado_etiqueta_nfc: [
        "sin_asignar",
        "activa",
        "suspendida",
        "reemplazada",
      ],
      estado_lectura_llavero_terminal: [
        "pendiente",
        "consumida",
        "expirada",
        "rechazada",
      ],
      estado_llavero_nfc: [
        "sin_asignar",
        "activo",
        "bloqueado",
        "perdido",
        "reemplazado",
        "revocado",
      ],
      estado_miembro_negocio: ["activo", "suspendido", "revocado"],
      estado_movimiento_regis: [
        "pendiente",
        "disponible",
        "canjeado",
        "revertido",
        "bloqueado",
      ],
      estado_negocio: ["pendiente", "activo", "suspendido", "rechazado"],
      estado_perfil: ["activo", "bloqueado", "eliminado"],
      estado_plan: ["activo", "inactivo", "archivado"],
      estado_sesion_lector_movil: [
        "pendiente_vinculacion",
        "vinculada",
        "cerrada",
        "expirada",
        "reemplazada",
      ],
      estado_solicitud_compra: [
        "esperando_monto",
        "esperando_cajero",
        "pendiente_validacion",
        "aprobada",
        "rechazada",
        "vencida",
        "cancelada",
      ],
      estado_solicitud_llavero: [
        "pendiente",
        "programada_entrega",
        "entregada",
        "cancelada",
      ],
      estado_sucursal: ["activa", "inactiva"],
      estado_suscripcion: [
        "prueba",
        "activa",
        "vencida",
        "suspendida",
        "cancelada",
      ],
      estado_terminal: [
        "pendiente_activacion",
        "activa",
        "bloqueada",
        "revocada",
      ],
      estado_ticket_soporte: [
        "abierto",
        "en_revision",
        "esperando_comercio",
        "resuelto",
        "cerrado",
      ],
      informado_por: ["vecino", "cajero"],
      metodo_verificacion_llavero: ["cedula", "pin", "sms"],
      modalidad_atencion: ["digital", "asistida"],
      origen_canje_regis: ["qr", "llavero"],
      origen_compra: ["autoservicio", "asistido", "integracion_pos"],
      origen_mensaje_soporte: ["comercio", "regalones"],
      rol_miembro_negocio: ["propietario", "administrador", "cajero"],
      rol_plataforma: ["usuario", "admin_regalones"],
      severidad_riesgo: ["baja", "media", "alta", "critica"],
      tipo_beneficio_regis: ["porcentaje_descuento", "monto_fijo"],
      tipo_etiqueta_nfc: ["inscripcion", "compra"],
      tipo_movimiento_regis: [
        "acreditacion_compra",
        "canje",
        "reversa",
        "ajuste",
        "bonificacion",
      ],
    },
  },
} as const
