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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      action_items: {
        Row: {
          case_id: string | null
          created_at: string
          deadline: string | null
          description: string
          event_id: string | null
          id: string
          priority: Database["public"]["Enums"]["action_priority"]
          status: Database["public"]["Enums"]["action_status"]
          type: Database["public"]["Enums"]["action_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          deadline?: string | null
          description: string
          event_id?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["action_priority"]
          status?: Database["public"]["Enums"]["action_status"]
          type?: Database["public"]["Enums"]["action_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string
          event_id?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["action_priority"]
          status?: Database["public"]["Enums"]["action_status"]
          type?: Database["public"]["Enums"]["action_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          admin_notes: string | null
          category: Database["public"]["Enums"]["bug_report_category"]
          created_at: string
          description: string
          email: string | null
          id: string
          page_url: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["bug_report_status"]
          subject: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          category?: Database["public"]["Enums"]["bug_report_category"]
          created_at?: string
          description: string
          email?: string | null
          id?: string
          page_url?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["bug_report_status"]
          subject: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          category?: Database["public"]["Enums"]["bug_report_category"]
          created_at?: string
          description?: string
          email?: string | null
          id?: string
          page_url?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["bug_report_status"]
          subject?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cases: {
        Row: {
          case_numbers: string[]
          case_type: string | null
          children_count: number | null
          children_summary: string | null
          court_name: string | null
          created_at: string
          goals_summary: string | null
          id: string
          jurisdiction_county: string | null
          jurisdiction_state: string | null
          lawyer_email: string | null
          lawyer_name: string | null
          next_court_date: string | null
          notes: string | null
          opposing_party_name: string | null
          opposing_party_role: string | null
          parenting_schedule: string | null
          risk_flags: string[]
          stage: string | null
          title: string
          updated_at: string
          user_id: string
          your_role: string | null
        }
        Insert: {
          case_numbers?: string[]
          case_type?: string | null
          children_count?: number | null
          children_summary?: string | null
          court_name?: string | null
          created_at?: string
          goals_summary?: string | null
          id?: string
          jurisdiction_county?: string | null
          jurisdiction_state?: string | null
          lawyer_email?: string | null
          lawyer_name?: string | null
          next_court_date?: string | null
          notes?: string | null
          opposing_party_name?: string | null
          opposing_party_role?: string | null
          parenting_schedule?: string | null
          risk_flags?: string[]
          stage?: string | null
          title: string
          updated_at?: string
          user_id: string
          your_role?: string | null
        }
        Update: {
          case_numbers?: string[]
          case_type?: string | null
          children_count?: number | null
          children_summary?: string | null
          court_name?: string | null
          created_at?: string
          goals_summary?: string | null
          id?: string
          jurisdiction_county?: string | null
          jurisdiction_state?: string | null
          lawyer_email?: string | null
          lawyer_name?: string | null
          next_court_date?: string | null
          notes?: string | null
          opposing_party_name?: string | null
          opposing_party_role?: string | null
          parenting_schedule?: string | null
          risk_flags?: string[]
          stage?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          your_role?: string | null
        }
        Relationships: []
      }
      chats: {
        Row: {
          agent: string | null
          case_id: string
          created_at: string | null
          id: string
          messages: Json | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agent?: string | null
          case_id: string
          created_at?: string | null
          id?: string
          messages?: Json | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agent?: string | null
          case_id?: string
          created_at?: string | null
          id?: string
          messages?: Json | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          agreement_violation: boolean | null
          body_text: string
          child_involved: boolean | null
          created_at: string
          direction: Database["public"]["Enums"]["communication_direction"]
          event_id: string | null
          evidence_id: string | null
          from_identity: string | null
          id: string
          medium: Database["public"]["Enums"]["communication_medium"]
          other_participants: string[]
          safety_concern: boolean | null
          sent_at: string | null
          subject: string | null
          summary: string
          timestamp_precision: Database["public"]["Enums"]["timestamp_precision"]
          to_identities: string[]
          updated_at: string
          user_id: string
          welfare_impact: Database["public"]["Enums"]["welfare_impact"]
        }
        Insert: {
          agreement_violation?: boolean | null
          body_text: string
          child_involved?: boolean | null
          created_at?: string
          direction?: Database["public"]["Enums"]["communication_direction"]
          event_id?: string | null
          evidence_id?: string | null
          from_identity?: string | null
          id?: string
          medium?: Database["public"]["Enums"]["communication_medium"]
          other_participants?: string[]
          safety_concern?: boolean | null
          sent_at?: string | null
          subject?: string | null
          summary: string
          timestamp_precision?: Database["public"]["Enums"]["timestamp_precision"]
          to_identities?: string[]
          updated_at?: string
          user_id: string
          welfare_impact?: Database["public"]["Enums"]["welfare_impact"]
        }
        Update: {
          agreement_violation?: boolean | null
          body_text?: string
          child_involved?: boolean | null
          created_at?: string
          direction?: Database["public"]["Enums"]["communication_direction"]
          event_id?: string | null
          evidence_id?: string | null
          from_identity?: string | null
          id?: string
          medium?: Database["public"]["Enums"]["communication_medium"]
          other_participants?: string[]
          safety_concern?: boolean | null
          sent_at?: string | null
          subject?: string | null
          summary?: string
          timestamp_precision?: Database["public"]["Enums"]["timestamp_precision"]
          to_identities?: string[]
          updated_at?: string
          user_id?: string
          welfare_impact?: Database["public"]["Enums"]["welfare_impact"]
        }
        Relationships: [
          {
            foreignKeyName: "communications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      event_evidence: {
        Row: {
          created_at: string
          event_id: string
          evidence_id: string
          is_primary: boolean
        }
        Insert: {
          created_at?: string
          event_id: string
          evidence_id: string
          is_primary?: boolean
        }
        Update: {
          created_at?: string
          event_id?: string
          evidence_id?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_evidence_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_evidence_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      event_evidence_suggestions: {
        Row: {
          created_at: string
          description: string
          dismissed_at: string | null
          event_id: string
          evidence_status: Database["public"]["Enums"]["evidence_mention_status"]
          evidence_type: Database["public"]["Enums"]["evidence_source_type"]
          fulfilled_at: string | null
          fulfilled_evidence_id: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          dismissed_at?: string | null
          event_id: string
          evidence_status: Database["public"]["Enums"]["evidence_mention_status"]
          evidence_type: Database["public"]["Enums"]["evidence_source_type"]
          fulfilled_at?: string | null
          fulfilled_evidence_id?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          dismissed_at?: string | null
          event_id?: string
          evidence_status?: Database["public"]["Enums"]["evidence_mention_status"]
          evidence_type?: Database["public"]["Enums"]["evidence_source_type"]
          fulfilled_at?: string | null
          fulfilled_evidence_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_evidence_suggestions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_evidence_suggestions_fulfilled_evidence_id_fkey"
            columns: ["fulfilled_evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          event_id: string
          id: string
          label: string
          role: Database["public"]["Enums"]["participant_role"]
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          label: string
          role: Database["public"]["Enums"]["participant_role"]
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          label?: string
          role?: Database["public"]["Enums"]["participant_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_patterns: {
        Row: {
          event_id: string
          pattern_id: string
        }
        Insert: {
          event_id: string
          pattern_id: string
        }
        Update: {
          event_id?: string
          pattern_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_patterns_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_patterns_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          agreement_violation: boolean | null
          case_id: string
          child_involved: boolean
          child_statements: Json
          coparent_interaction: Json | null
          created_at: string
          description: string
          duration_minutes: number | null
          id: string
          journal_entry_id: string | null
          location: string | null
          patterns_noted_v2: Json
          primary_timestamp: string | null
          recording_id: string | null
          safety_concern: boolean | null
          timestamp_precision: Database["public"]["Enums"]["timestamp_precision"]
          title: string
          type: Database["public"]["Enums"]["event_type"]
          type_v2: string | null
          updated_at: string
          user_id: string
          welfare_category: string | null
          welfare_direction: string | null
          welfare_impact: Database["public"]["Enums"]["welfare_impact"]
          welfare_severity: string | null
        }
        Insert: {
          agreement_violation?: boolean | null
          case_id: string
          child_involved?: boolean
          child_statements?: Json
          coparent_interaction?: Json | null
          created_at?: string
          description: string
          duration_minutes?: number | null
          id?: string
          journal_entry_id?: string | null
          location?: string | null
          patterns_noted_v2?: Json
          primary_timestamp?: string | null
          recording_id?: string | null
          safety_concern?: boolean | null
          timestamp_precision?: Database["public"]["Enums"]["timestamp_precision"]
          title: string
          type: Database["public"]["Enums"]["event_type"]
          type_v2?: string | null
          updated_at?: string
          user_id: string
          welfare_category?: string | null
          welfare_direction?: string | null
          welfare_impact?: Database["public"]["Enums"]["welfare_impact"]
          welfare_severity?: string | null
        }
        Update: {
          agreement_violation?: boolean | null
          case_id?: string
          child_involved?: boolean
          child_statements?: Json
          coparent_interaction?: Json | null
          created_at?: string
          description?: string
          duration_minutes?: number | null
          id?: string
          journal_entry_id?: string | null
          location?: string | null
          patterns_noted_v2?: Json
          primary_timestamp?: string | null
          recording_id?: string | null
          safety_concern?: boolean | null
          timestamp_precision?: Database["public"]["Enums"]["timestamp_precision"]
          title?: string
          type?: Database["public"]["Enums"]["event_type"]
          type_v2?: string | null
          updated_at?: string
          user_id?: string
          welfare_category?: string | null
          welfare_direction?: string | null
          welfare_impact?: Database["public"]["Enums"]["welfare_impact"]
          welfare_severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "voice_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          case_id: string
          created_at: string
          extraction_raw: Json | null
          id: string
          mime_type: string | null
          original_filename: string | null
          source_type: Database["public"]["Enums"]["evidence_source_type"]
          storage_path: string | null
          summary: string | null
          tags: string[]
          updated_at: string
          user_annotation: string | null
          user_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          extraction_raw?: Json | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          source_type: Database["public"]["Enums"]["evidence_source_type"]
          storage_path?: string | null
          summary?: string | null
          tags?: string[]
          updated_at?: string
          user_annotation?: string | null
          user_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          extraction_raw?: Json | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          source_type?: Database["public"]["Enums"]["evidence_source_type"]
          storage_path?: string | null
          summary?: string | null
          tags?: string[]
          updated_at?: string
          user_annotation?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_mentions: {
        Row: {
          case_id: string | null
          created_at: string
          description: string
          event_id: string
          id: string
          status: Database["public"]["Enums"]["evidence_mention_status"]
          type: Database["public"]["Enums"]["evidence_source_type"]
          user_id: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          description: string
          event_id: string
          id?: string
          status: Database["public"]["Enums"]["evidence_mention_status"]
          type: Database["public"]["Enums"]["evidence_source_type"]
          user_id: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          description?: string
          event_id?: string
          id?: string
          status?: Database["public"]["Enums"]["evidence_mention_status"]
          type?: Database["public"]["Enums"]["evidence_source_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_mentions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_mentions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          created_at: string
          focus: string
          id: string
          markdown_content: string
          metadata: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          focus?: string
          id?: string
          markdown_content: string
          metadata?: Json
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          focus?: string
          id?: string
          markdown_content?: string
          metadata?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          journal_entry_id: string | null
          result_summary: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          journal_entry_id?: string | null
          result_summary?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          journal_entry_id?: string | null
          result_summary?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type?: Database["public"]["Enums"]["job_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          case_id: string
          completed_at: string | null
          created_at: string
          event_text: string | null
          extraction_job_id: string | null
          extraction_raw: Json | null
          id: string
          processed_at: string | null
          processing_error: string | null
          reference_date: string | null
          reference_time_description: string | null
          status: Database["public"]["Enums"]["journal_entry_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          completed_at?: string | null
          created_at?: string
          event_text?: string | null
          extraction_job_id?: string | null
          extraction_raw?: Json | null
          id?: string
          processed_at?: string | null
          processing_error?: string | null
          reference_date?: string | null
          reference_time_description?: string | null
          status?: Database["public"]["Enums"]["journal_entry_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          completed_at?: string | null
          created_at?: string
          event_text?: string | null
          extraction_job_id?: string | null
          extraction_raw?: Json | null
          id?: string
          processed_at?: string | null
          processing_error?: string | null
          reference_date?: string | null
          reference_time_description?: string | null
          status?: Database["public"]["Enums"]["journal_entry_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_extraction_job_id_fkey"
            columns: ["extraction_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_evidence: {
        Row: {
          created_at: string
          evidence_id: string
          id: string
          is_processed: boolean
          journal_entry_id: string
          processed_at: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          evidence_id: string
          id?: string
          is_processed?: boolean
          journal_entry_id: string
          processed_at?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          evidence_id?: string
          id?: string
          is_processed?: boolean
          journal_entry_id?: string
          processed_at?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_evidence_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_evidence_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          case_id: string
          created_at: string
          evidence_id: string | null
          first_sent_at: string | null
          flags: string[]
          id: string
          last_sent_at: string | null
          message_count: number
          model: string | null
          participants: string[]
          search_anchors: Json
          subject: string | null
          summary: string | null
          summary_fts: unknown
          summary_version: number
          thread_id: string
          tone: Database["public"]["Enums"]["thread_tone"] | null
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          evidence_id?: string | null
          first_sent_at?: string | null
          flags?: string[]
          id?: string
          last_sent_at?: string | null
          message_count?: number
          model?: string | null
          participants?: string[]
          search_anchors?: Json
          subject?: string | null
          summary?: string | null
          summary_fts?: unknown
          summary_version?: number
          thread_id: string
          tone?: Database["public"]["Enums"]["thread_tone"] | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          evidence_id?: string | null
          first_sent_at?: string | null
          flags?: string[]
          id?: string
          last_sent_at?: string | null
          message_count?: number
          model?: string | null
          participants?: string[]
          search_anchors?: Json
          subject?: string | null
          summary?: string | null
          summary_fts?: unknown
          summary_version?: number
          thread_id?: string
          tone?: Database["public"]["Enums"]["thread_tone"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string
          case_id: string
          created_at: string
          evidence_id: string
          first_viewed_at: string | null
          id: string
          message_number: number | null
          recipient: string
          sender: string
          sent_at: string
          sequence_number: number
          subject: string | null
          thread_id: string | null
          user_id: string
          word_count: number | null
        }
        Insert: {
          attachments?: Json
          body: string
          case_id: string
          created_at?: string
          evidence_id: string
          first_viewed_at?: string | null
          id?: string
          message_number?: number | null
          recipient: string
          sender: string
          sent_at: string
          sequence_number: number
          subject?: string | null
          thread_id?: string | null
          user_id: string
          word_count?: number | null
        }
        Update: {
          attachments?: Json
          body?: string
          case_id?: string
          created_at?: string
          evidence_id?: string
          first_viewed_at?: string | null
          id?: string
          message_number?: number | null
          recipient?: string
          sender?: string
          sent_at?: string
          sequence_number?: number
          subject?: string | null
          thread_id?: string | null
          user_id?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      patterns: {
        Row: {
          created_at: string
          id: string
          key: string
          label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_case_id: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          gclid: string | null
          gclid_captured_at: string | null
          id: string
          is_employee: boolean | null
          onboarding_completed_at: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          active_case_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          gclid?: string | null
          gclid_captured_at?: string | null
          id: string
          is_employee?: boolean | null
          onboarding_completed_at?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          active_case_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          gclid?: string | null
          gclid_captured_at?: string | null
          id?: string
          is_employee?: boolean | null
          onboarding_completed_at?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_case_id_fkey"
            columns: ["active_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          plan_tier: Database["public"]["Enums"]["plan_tier"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_recordings: {
        Row: {
          created_at: string
          extraction_raw: Json | null
          id: string
          mime_type: string | null
          original_filename: string | null
          recording_duration_seconds: number | null
          recording_timestamp: string | null
          storage_path: string | null
          transcript: string | null
          transcription_confidence: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extraction_raw?: Json | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          recording_duration_seconds?: number | null
          recording_timestamp?: string | null
          storage_path?: string | null
          transcript?: string | null
          transcription_confidence?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extraction_raw?: Json | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          recording_duration_seconds?: number | null
          recording_timestamp?: string | null
          storage_path?: string | null
          transcript?: string | null
          transcription_confidence?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      case_thread_message_counts: {
        Args: { p_case_id: string }
        Returns: {
          message_count: number
          thread_id: string
        }[]
      }
      evidence_thread_ids: {
        Args: { p_case_id: string; p_evidence_id: string }
        Returns: {
          thread_id: string
        }[]
      }
      message_threads_fts: {
        Args: { p_participants: string[]; p_subject: string; p_summary: string }
        Returns: unknown
      }
    }
    Enums: {
      action_priority: "urgent" | "high" | "normal" | "low"
      action_status: "open" | "in_progress" | "done" | "cancelled"
      action_type: "document" | "contact" | "file" | "obtain" | "other"
      billing_interval: "month" | "year"
      bug_report_category:
        | "bug"
        | "feature_request"
        | "question"
        | "feedback"
        | "other"
      bug_report_status:
        | "new"
        | "triaged"
        | "in_progress"
        | "resolved"
        | "closed"
        | "wont_fix"
      communication_direction: "incoming" | "outgoing" | "mixed" | "unknown"
      communication_medium: "text" | "email" | "unknown"
      event_type:
        | "incident"
        | "positive"
        | "medical"
        | "school"
        | "communication"
        | "legal"
      evidence_mention_status: "have" | "need_to_get" | "need_to_create"
      evidence_source_type:
        | "text"
        | "email"
        | "photo"
        | "document"
        | "recording"
        | "other"
        | "ofw_export"
      job_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "pending_confirmation"
      job_type: "journal_extraction" | "evidence_processing" | "ofw_ingest"
      journal_entry_status:
        | "draft"
        | "processing"
        | "review"
        | "completed"
        | "cancelled"
      participant_role: "primary" | "witness" | "professional"
      plan_tier: "free" | "alpha" | "starter" | "pro" | "enterprise"
      subscription_status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
        | "paused"
      thread_tone: "cooperative" | "neutral" | "tense" | "hostile" | "mixed"
      timestamp_precision: "exact" | "day" | "approximate" | "unknown"
      welfare_impact:
        | "none"
        | "minor"
        | "moderate"
        | "significant"
        | "positive"
        | "unknown"
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
  public: {
    Enums: {
      action_priority: ["urgent", "high", "normal", "low"],
      action_status: ["open", "in_progress", "done", "cancelled"],
      action_type: ["document", "contact", "file", "obtain", "other"],
      billing_interval: ["month", "year"],
      bug_report_category: [
        "bug",
        "feature_request",
        "question",
        "feedback",
        "other",
      ],
      bug_report_status: [
        "new",
        "triaged",
        "in_progress",
        "resolved",
        "closed",
        "wont_fix",
      ],
      communication_direction: ["incoming", "outgoing", "mixed", "unknown"],
      communication_medium: ["text", "email", "unknown"],
      event_type: [
        "incident",
        "positive",
        "medical",
        "school",
        "communication",
        "legal",
      ],
      evidence_mention_status: ["have", "need_to_get", "need_to_create"],
      evidence_source_type: [
        "text",
        "email",
        "photo",
        "document",
        "recording",
        "other",
        "ofw_export",
      ],
      job_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "pending_confirmation",
      ],
      job_type: ["journal_extraction", "evidence_processing", "ofw_ingest"],
      journal_entry_status: [
        "draft",
        "processing",
        "review",
        "completed",
        "cancelled",
      ],
      participant_role: ["primary", "witness", "professional"],
      plan_tier: ["free", "alpha", "starter", "pro", "enterprise"],
      subscription_status: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "unpaid",
        "paused",
      ],
      thread_tone: ["cooperative", "neutral", "tense", "hostile", "mixed"],
      timestamp_precision: ["exact", "day", "approximate", "unknown"],
      welfare_impact: [
        "none",
        "minor",
        "moderate",
        "significant",
        "positive",
        "unknown",
      ],
    },
  },
} as const
