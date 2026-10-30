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
  public: {
    Tables: {
      appointment_schedules: {
        Row: {
          created_at: string
          current_bookings: number
          day_of_week: number
          end_time: string
          id: string
          is_closed: boolean | null
          is_recurring: boolean | null
          max_capacity: number
          specific_date: string | null
          start_time: string
          status: Database["public"]["Enums"]["schedule_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_bookings?: number
          day_of_week: number
          end_time: string
          id?: string
          is_closed?: boolean | null
          is_recurring?: boolean | null
          max_capacity?: number
          specific_date?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["schedule_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_bookings?: number
          day_of_week?: number
          end_time?: string
          id?: string
          is_closed?: boolean | null
          is_recurring?: boolean | null
          max_capacity?: number
          specific_date?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["schedule_status"]
          updated_at?: string
        }
        Relationships: []
      }
      appointment_status_history: {
        Row: {
          appointment_id: string
          changed_by_id: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["appointment_status"]
          notes: string | null
          previous_status:
            | Database["public"]["Enums"]["appointment_status"]
            | null
          reason: string | null
        }
        Insert: {
          appointment_id: string
          changed_by_id?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["appointment_status"]
          notes?: string | null
          previous_status?:
            | Database["public"]["Enums"]["appointment_status"]
            | null
          reason?: string | null
        }
        Update: {
          appointment_id?: string
          changed_by_id?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["appointment_status"]
          notes?: string | null
          previous_status?:
            | Database["public"]["Enums"]["appointment_status"]
            | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_status_history_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_status_history_changed_by_id_fkey"
            columns: ["changed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          assigned_veterinarian_id: string | null
          auto_cancelled: boolean
          cancellation_reason:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["appointment_mode"]
          no_show_at: string | null
          notes: string | null
          owner_id: string
          pet_id: string
          preferred_date: string | null
          preferred_time: string | null
          reason: string | null
          requested_at: string
          rescheduled_from: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          assigned_veterinarian_id?: string | null
          auto_cancelled?: boolean
          cancellation_reason?:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["appointment_mode"]
          no_show_at?: string | null
          notes?: string | null
          owner_id: string
          pet_id: string
          preferred_date?: string | null
          preferred_time?: string | null
          reason?: string | null
          requested_at?: string
          rescheduled_from?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          assigned_veterinarian_id?: string | null
          auto_cancelled?: boolean
          cancellation_reason?:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["appointment_mode"]
          no_show_at?: string | null
          notes?: string | null
          owner_id?: string
          pet_id?: string
          preferred_date?: string | null
          preferred_time?: string | null
          reason?: string | null
          requested_at?: string
          rescheduled_from?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_veterinarian_id_fkey"
            columns: ["assigned_veterinarian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_notes: {
        Row: {
          assessment: string | null
          chief_complaint: string | null
          created_at: string
          encounter_id: string
          id: string
          objective: string | null
          plan: string | null
          subjective: string | null
          updated_at: string
        }
        Insert: {
          assessment?: string | null
          chief_complaint?: string | null
          created_at?: string
          encounter_id: string
          id?: string
          objective?: string | null
          plan?: string | null
          subjective?: string | null
          updated_at?: string
        }
        Update: {
          assessment?: string | null
          chief_complaint?: string | null
          created_at?: string
          encounter_id?: string
          id?: string
          objective?: string | null
          plan?: string | null
          subjective?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_notes_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnoses: {
        Row: {
          created_at: string
          description: string
          diagnosis_code: string | null
          encounter_id: string
          id: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          description: string
          diagnosis_code?: string | null
          encounter_id: string
          id?: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          diagnosis_code?: string | null
          encounter_id?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnoses_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      encounter_amendments: {
        Row: {
          amendment_text: string
          created_at: string
          encounter_id: string
          id: string
          veterinarian_id: string
        }
        Insert: {
          amendment_text: string
          created_at?: string
          encounter_id: string
          id?: string
          veterinarian_id: string
        }
        Update: {
          amendment_text?: string
          created_at?: string
          encounter_id?: string
          id?: string
          veterinarian_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "encounter_amendments_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounter_amendments_veterinarian_id_fkey"
            columns: ["veterinarian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      encounters: {
        Row: {
          appointment_id: string | null
          created_at: string
          id: string
          notes: string | null
          pet_id: string
          signed_at: string | null
          status: Database["public"]["Enums"]["encounter_status"]
          updated_at: string
          veterinarian_id: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          pet_id: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["encounter_status"]
          updated_at?: string
          veterinarian_id: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          pet_id?: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["encounter_status"]
          updated_at?: string
          veterinarian_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "encounters_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_veterinarian_id_fkey"
            columns: ["veterinarian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          is_vatable: boolean
          quantity: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          is_vatable?: boolean
          quantity?: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          is_vatable?: boolean
          quantity?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_invoices_id_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          discount_amount: number
          due_date: string | null
          encounter_id: string | null
          id: string
          invoice_number: string
          issue_date: string
          owner_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          total_amount: number
          updated_at: string
          vat_amount: number
          vat_exempt_sales: number
          vatable_sales: number
          zero_rated_sales: number
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          due_date?: string | null
          encounter_id?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          owner_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_exempt_sales?: number
          vatable_sales?: number
          zero_rated_sales?: number
        }
        Update: {
          created_at?: string
          discount_amount?: number
          due_date?: string | null
          encounter_id?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_exempt_sales?: number
          vatable_sales?: number
          zero_rated_sales?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_encounter_id_encounters_id_fk"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_owner_id_profiles_id_fk"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_paid: number
          created_at: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          payment_date: string
          receipt_number: string
          recorded_by: string
          reference_number: string | null
        }
        Insert: {
          amount_paid: number
          created_at?: string
          id?: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          payment_date?: string
          receipt_number: string
          recorded_by: string
          reference_number?: string | null
        }
        Update: {
          amount_paid?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          payment_date?: string
          receipt_number?: string
          recorded_by?: string
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_invoices_id_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_profiles_id_fk"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_owners: {
        Row: {
          can_receive_notifications: boolean
          can_view_medical_records: boolean
          created_at: string
          id: string
          is_primary_contact: boolean
          owner_profile_id: string
          pet_id: string
          relationship: Database["public"]["Enums"]["owner_relationship"]
          updated_at: string
        }
        Insert: {
          can_receive_notifications?: boolean
          can_view_medical_records?: boolean
          created_at?: string
          id?: string
          is_primary_contact?: boolean
          owner_profile_id: string
          pet_id: string
          relationship?: Database["public"]["Enums"]["owner_relationship"]
          updated_at?: string
        }
        Update: {
          can_receive_notifications?: boolean
          can_view_medical_records?: boolean
          created_at?: string
          id?: string
          is_primary_contact?: boolean
          owner_profile_id?: string
          pet_id?: string
          relationship?: Database["public"]["Enums"]["owner_relationship"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_owners_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_owners_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          age: number | null
          breed: string | null
          color: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
          notes: string | null
          sex: Database["public"]["Enums"]["pet_sex"]
          species: Database["public"]["Enums"]["pet_species"]
          species_detail: string | null
          updated_at: string
        }
        Insert: {
          age?: number | null
          breed?: string | null
          color?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name: string
          notes?: string | null
          sex?: Database["public"]["Enums"]["pet_sex"]
          species: Database["public"]["Enums"]["pet_species"]
          species_detail?: string | null
          updated_at?: string
        }
        Update: {
          age?: number | null
          breed?: string | null
          color?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          sex?: Database["public"]["Enums"]["pet_sex"]
          species?: Database["public"]["Enums"]["pet_species"]
          species_detail?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pets_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          created_at: string
          dosage: string
          duration: string
          encounter_id: string
          frequency: string
          id: string
          instructions: string | null
          medication_name: string
          pet_id: string
          status: Database["public"]["Enums"]["prescription_status"]
          updated_at: string
          veterinarian_id: string
        }
        Insert: {
          created_at?: string
          dosage: string
          duration: string
          encounter_id: string
          frequency: string
          id?: string
          instructions?: string | null
          medication_name: string
          pet_id: string
          status?: Database["public"]["Enums"]["prescription_status"]
          updated_at?: string
          veterinarian_id: string
        }
        Update: {
          created_at?: string
          dosage?: string
          duration?: string
          encounter_id?: string
          frequency?: string
          id?: string
          instructions?: string | null
          medication_name?: string
          pet_id?: string
          status?: Database["public"]["Enums"]["prescription_status"]
          updated_at?: string
          veterinarian_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_veterinarian_id_fkey"
            columns: ["veterinarian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          approval_status: Database["public"]["Enums"]["approval_status"]
          approved_at: string | null
          approved_by: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          phone: string | null
          requested_role: Database["public"]["Enums"]["user_role"] | null
          role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          address?: string | null
          approval_status?: Database["public"]["Enums"]["approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          last_seen_at?: string | null
          phone?: string | null
          requested_role?: Database["public"]["Enums"]["user_role"] | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          address?: string | null
          approval_status?: Database["public"]["Enums"]["approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          phone?: string | null
          requested_role?: Database["public"]["Enums"]["user_role"] | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          next_values: Json | null
          previous_values: Json | null
          target_schedule_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          next_values?: Json | null
          previous_values?: Json | null
          target_schedule_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          next_values?: Json | null
          previous_values?: Json | null
          target_schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_audit_logs_target_schedule_id_fkey"
            columns: ["target_schedule_id"]
            isOneToOne: false
            referencedRelation: "appointment_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          display_order: number | null
          duration_minutes: number | null
          icon: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          is_published: boolean | null
          name: string
          price_from: number | null
          price_label: string | null
          price_to: number | null
          short_desc: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_minutes?: number | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          is_published?: boolean | null
          name: string
          price_from?: number | null
          price_label?: string | null
          price_to?: number | null
          short_desc?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_minutes?: number | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          is_published?: boolean | null
          name?: string
          price_from?: number | null
          price_label?: string | null
          price_to?: number | null
          short_desc?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          next_values: Json | null
          previous_values: Json | null
          target_profile_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          next_values?: Json | null
          previous_values?: Json | null
          target_profile_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          next_values?: Json | null
          previous_values?: Json | null
          target_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_audit_logs_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          cost: number | null
          created_at: string
          description: string | null
          encounter_id: string
          id: string
          name: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          description?: string | null
          encounter_id: string
          id?: string
          name: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          description?: string | null
          encounter_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatments_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_owner: { Args: { p_owner_id: string }; Returns: string }
      approve_appointment: {
        Args: { p_appointment_id: string }
        Returns: {
          assigned_veterinarian_id: string | null
          auto_cancelled: boolean
          cancellation_reason:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["appointment_mode"]
          no_show_at: string | null
          notes: string | null
          owner_id: string
          pet_id: string
          preferred_date: string | null
          preferred_time: string | null
          reason: string | null
          requested_at: string
          rescheduled_from: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      book_appointment: {
        Args: {
          p_notes?: string
          p_pet_id: string
          p_preferred_date: string
          p_preferred_time: string
          p_reason?: string
          p_scheduled_end?: string
          p_scheduled_start?: string
          p_service_id: string
        }
        Returns: {
          assigned_veterinarian_id: string | null
          auto_cancelled: boolean
          cancellation_reason:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["appointment_mode"]
          no_show_at: string | null
          notes: string | null
          owner_id: string
          pet_id: string
          preferred_date: string | null
          preferred_time: string | null
          reason: string | null
          requested_at: string
          rescheduled_from: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_overdue_appointments: { Args: never; Returns: number }
      clinic_member_names: {
        Args: { p_ids: string[] }
        Returns: {
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      consume_captcha_challenge: { Args: { p_nonce: string }; Returns: boolean }
      create_owned_pet: {
        Args: {
          p_age?: number
          p_breed?: string
          p_color?: string
          p_date_of_birth?: string
          p_name: string
          p_notes?: string
          p_sex?: Database["public"]["Enums"]["pet_sex"]
          p_species: Database["public"]["Enums"]["pet_species"]
          p_species_detail?: string
        }
        Returns: {
          age: number | null
          breed: string | null
          color: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
          notes: string | null
          sex: Database["public"]["Enums"]["pet_sex"]
          species: Database["public"]["Enums"]["pet_species"]
          species_detail: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purge_pet: { Args: { p_pet_id: string }; Returns: string }
      purge_team_member: { Args: { p_profile_id: string }; Returns: string }
      quick_bill_appointment: {
        Args: {
          p_amount: number
          p_appointment_id: string
          p_description: string
          p_is_vatable: boolean
          p_method: Database["public"]["Enums"]["payment_method"]
          p_reference?: string
        }
        Returns: {
          invoice_id: string
          receipt_number: string
        }[]
      }
      restore_owner: { Args: { p_owner_id: string }; Returns: string }
      restore_pet: { Args: { p_pet_id: string }; Returns: string }
      restore_team_member: { Args: { p_profile_id: string }; Returns: string }
      touch_last_seen: { Args: never; Returns: undefined }
      trash_owner: { Args: { p_owner_id: string }; Returns: string }
      trash_pet: { Args: { p_pet_id: string }; Returns: string }
      trash_team_member: { Args: { p_profile_id: string }; Returns: string }
    }
    Enums: {
      appointment_mode: "in_person" | "virtual"
      appointment_status:
        | "requested"
        | "scheduled"
        | "completed"
        | "cancelled"
        | "no_show"
        | "confirmed"
        | "diagnosed"
        | "finished"
        | "paid"
        | "booked"
      approval_status: "pending" | "approved" | "rejected"
      cancellation_reason:
        | "owner_request"
        | "clinic_emergency"
        | "weather"
        | "no_veterinarian_available"
        | "pet_health_issue"
        | "other"
      encounter_status: "draft" | "signed"
      invoice_status: "draft" | "unpaid" | "partial" | "paid" | "voided"
      owner_relationship: "owner" | "co_owner" | "family" | "caretaker"
      payment_method: "cash" | "gcash" | "card" | "bank_transfer"
      pet_sex: "male" | "female" | "unknown"
      pet_species: "dog" | "cat" | "bird" | "rabbit" | "reptile" | "other"
      prescription_status: "active" | "cancelled" | "completed"
      reschedule_reason:
        | "owner_request"
        | "veterinarian_unavailable"
        | "clinic_schedule_conflict"
        | "equipment_issue"
        | "pet_health_issue"
        | "other"
      schedule_status: "active" | "inactive"
      user_role: "admin" | "veterinarian" | "owner" | "staff"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      appointment_mode: ["in_person", "virtual"],
      appointment_status: [
        "requested",
        "scheduled",
        "completed",
        "cancelled",
        "no_show",
        "confirmed",
        "diagnosed",
        "finished",
        "paid",
        "booked",
      ],
      approval_status: ["pending", "approved", "rejected"],
      cancellation_reason: [
        "owner_request",
        "clinic_emergency",
        "weather",
        "no_veterinarian_available",
        "pet_health_issue",
        "other",
      ],
      encounter_status: ["draft", "signed"],
      invoice_status: ["draft", "unpaid", "partial", "paid", "voided"],
      owner_relationship: ["owner", "co_owner", "family", "caretaker"],
      payment_method: ["cash", "gcash", "card", "bank_transfer"],
      pet_sex: ["male", "female", "unknown"],
      pet_species: ["dog", "cat", "bird", "rabbit", "reptile", "other"],
      prescription_status: ["active", "cancelled", "completed"],
      reschedule_reason: [
        "owner_request",
        "veterinarian_unavailable",
        "clinic_schedule_conflict",
        "equipment_issue",
        "pet_health_issue",
        "other",
      ],
      schedule_status: ["active", "inactive"],
      user_role: ["admin", "veterinarian", "owner", "staff"],
    },
  },
} as const
