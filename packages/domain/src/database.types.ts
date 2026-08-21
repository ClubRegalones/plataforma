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
    PostgrestVersion: "14.15"
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
      compras: {
        Row: {
          caja_id: string
          cajero_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_compra"]
          folio_boleta: string | null
          id: string
          monto_final: number
          negocio_id: string
          origen: Database["public"]["Enums"]["origen_compra"]
          revertido_en: string | null
          riesgo: Database["public"]["Enums"]["severidad_riesgo"] | null
          solicitud_id: string
          sucursal_id: string
          vecino_id: string
        }
        Insert: {
          caja_id: string
          cajero_id: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_compra"]
          folio_boleta?: string | null
          id?: string
          monto_final: number
          negocio_id: string
          origen?: Database["public"]["Enums"]["origen_compra"]
          revertido_en?: string | null
          riesgo?: Database["public"]["Enums"]["severidad_riesgo"] | null
          solicitud_id: string
          sucursal_id: string
          vecino_id: string
        }
        Update: {
          caja_id?: string
          cajero_id?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_compra"]
          folio_boleta?: string | null
          id?: string
          monto_final?: number
          negocio_id?: string
          origen?: Database["public"]["Enums"]["origen_compra"]
          revertido_en?: string | null
          riesgo?: Database["public"]["Enums"]["severidad_riesgo"] | null
          solicitud_id?: string
          sucursal_id?: string
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
      llaveros_nfc: {
        Row: {
          actualizado_en: string
          asignado_en: string | null
          asignado_por: string | null
          bloqueado_en: string | null
          codigo_publico: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_llavero_nfc"]
          id: string
          reemplazado_por_id: string | null
          solicitud_id: string | null
          token_hash: string
          vecino_id: string | null
        }
        Insert: {
          actualizado_en?: string
          asignado_en?: string | null
          asignado_por?: string | null
          bloqueado_en?: string | null
          codigo_publico: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_llavero_nfc"]
          id?: string
          reemplazado_por_id?: string | null
          solicitud_id?: string | null
          token_hash: string
          vecino_id?: string | null
        }
        Update: {
          actualizado_en?: string
          asignado_en?: string | null
          asignado_por?: string | null
          bloqueado_en?: string | null
          codigo_publico?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_llavero_nfc"]
          id?: string
          reemplazado_por_id?: string | null
          solicitud_id?: string | null
          token_hash?: string
          vecino_id?: string | null
        }
        Relationships: [
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aprobar_compra: {
        Args: {
          p_folio_boleta?: string
          p_origen?: Database["public"]["Enums"]["origen_compra"]
          p_solicitud_id: string
        }
        Returns: {
          caja_id: string
          cajero_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_compra"]
          folio_boleta: string | null
          id: string
          monto_final: number
          negocio_id: string
          origen: Database["public"]["Enums"]["origen_compra"]
          revertido_en: string | null
          riesgo: Database["public"]["Enums"]["severidad_riesgo"] | null
          solicitud_id: string
          sucursal_id: string
          vecino_id: string
        }
        SetofOptions: {
          from: "*"
          to: "compras"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      es_admin_regalones: { Args: never; Returns: boolean }
      es_miembro_negocio: {
        Args: {
          p_negocio_id: string
          p_roles?: Database["public"]["Enums"]["rol_miembro_negocio"][]
        }
        Returns: boolean
      }
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
      resolver_etiqueta: {
        Args: { p_token: string }
        Returns: {
          caja_id: string
          negocio_id: string
          sucursal_id: string
          tipo: Database["public"]["Enums"]["tipo_etiqueta_nfc"]
        }[]
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
    }
    Enums: {
      estado_caja: "activa" | "inactiva" | "bloqueada"
      estado_compra: "confirmada" | "observada" | "revertida"
      estado_etiqueta_nfc:
        | "sin_asignar"
        | "activa"
        | "suspendida"
        | "reemplazada"
      estado_llavero_nfc:
        | "sin_asignar"
        | "activo"
        | "bloqueado"
        | "perdido"
        | "reemplazado"
        | "revocado"
      estado_miembro_negocio: "activo" | "suspendido" | "revocado"
      estado_negocio: "pendiente" | "activo" | "suspendido" | "rechazado"
      estado_perfil: "activo" | "bloqueado" | "eliminado"
      estado_plan: "activo" | "inactivo" | "archivado"
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
      informado_por: "vecino" | "cajero"
      modalidad_atencion: "digital" | "asistida"
      origen_compra: "autoservicio" | "asistido" | "integracion_pos"
      rol_miembro_negocio: "propietario" | "administrador" | "cajero"
      rol_plataforma: "usuario" | "admin_regalones"
      severidad_riesgo: "baja" | "media" | "alta" | "critica"
      tipo_etiqueta_nfc: "inscripcion" | "compra"
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
      estado_caja: ["activa", "inactiva", "bloqueada"],
      estado_compra: ["confirmada", "observada", "revertida"],
      estado_etiqueta_nfc: [
        "sin_asignar",
        "activa",
        "suspendida",
        "reemplazada",
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
      estado_negocio: ["pendiente", "activo", "suspendido", "rechazado"],
      estado_perfil: ["activo", "bloqueado", "eliminado"],
      estado_plan: ["activo", "inactivo", "archivado"],
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
      informado_por: ["vecino", "cajero"],
      modalidad_atencion: ["digital", "asistida"],
      origen_compra: ["autoservicio", "asistido", "integracion_pos"],
      rol_miembro_negocio: ["propietario", "administrador", "cajero"],
      rol_plataforma: ["usuario", "admin_regalones"],
      severidad_riesgo: ["baja", "media", "alta", "critica"],
      tipo_etiqueta_nfc: ["inscripcion", "compra"],
    },
  },
} as const
