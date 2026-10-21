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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_scores: {
        Row: {
          column_id: string
          created_at: string
          id: string
          score: number | null
          student_id: string
          updated_at: string
        }
        Insert: {
          column_id: string
          created_at?: string
          id?: string
          score?: number | null
          student_id: string
          updated_at?: string
        }
        Update: {
          column_id?: string
          created_at?: string
          id?: string
          score?: number | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_scores_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "grading_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          archived_at: string | null
          attachments: Json | null
          audience: Json
          body: string
          created_at: string
          created_by: string
          created_by_name: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_name: string | null
          edited_by: string | null
          edited_by_name: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          attachments?: Json | null
          audience?: Json
          body: string
          created_at?: string
          created_by: string
          created_by_name?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_name?: string | null
          edited_by?: string | null
          edited_by_name?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          attachments?: Json | null
          audience?: Json
          body?: string
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_name?: string | null
          edited_by?: string | null
          edited_by_name?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          created_at: string
          device_info: Json | null
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          target_label: string | null
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          device_info?: Json | null
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
          target_label?: string | null
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          device_info?: Json | null
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          target_label?: string | null
        }
        Relationships: []
      }
      broadcast_messages: {
        Row: {
          broadcast_type: string
          class_name: string | null
          created_at: string
          id: string
          message: string
          sender_id: string
          target_student_id: string | null
          task_id: string | null
        }
        Insert: {
          broadcast_type?: string
          class_name?: string | null
          created_at?: string
          id?: string
          message: string
          sender_id: string
          target_student_id?: string | null
          task_id?: string | null
        }
        Update: {
          broadcast_type?: string
          class_name?: string | null
          created_at?: string
          id?: string
          message?: string
          sender_id?: string
          target_student_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "exam_analytics"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "broadcast_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          live_event_id: string | null
          meeting_id: string | null
          owner_id: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          live_event_id?: string | null
          meeting_id?: string | null
          owner_id: string
          status?: string
          title?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          live_event_id?: string | null
          meeting_id?: string | null
          owner_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_sessions_live_event_id_fkey"
            columns: ["live_event_id"]
            isOneToOne: false
            referencedRelation: "live_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_sessions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_sources: {
        Row: {
          device_label: string
          ended_at: string | null
          id: string
          is_active: boolean
          joined_at: string
          last_heartbeat: string
          session_id: string
          token_id: string
          user_agent: string | null
        }
        Insert: {
          device_label?: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          joined_at?: string
          last_heartbeat?: string
          session_id: string
          token_id: string
          user_agent?: string | null
        }
        Update: {
          device_label?: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          joined_at?: string
          last_heartbeat?: string
          session_id?: string
          token_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_sources_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "broadcast_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_sources_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "broadcast_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_tokens: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          max_devices: number
          revoked_at: string | null
          session_id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          max_devices?: number
          revoked_at?: string | null
          session_id: string
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          max_devices?: number
          revoked_at?: string | null
          session_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_tokens_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "broadcast_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_viewers: {
        Row: {
          id: string
          joined_at: string
          last_seen: string
          session_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          last_seen?: string
          session_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          last_seen?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_viewers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "broadcast_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      class_posts: {
        Row: {
          attachments: Json | null
          author_id: string
          class_name: string
          content: string
          created_at: string
          id: string
          parent_id: string | null
          post_type: string | null
          target_class: string | null
          visibility: string | null
        }
        Insert: {
          attachments?: Json | null
          author_id: string
          class_name: string
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_type?: string | null
          target_class?: string | null
          visibility?: string | null
        }
        Update: {
          attachments?: Json | null
          author_id?: string
          class_name?: string
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_type?: string | null
          target_class?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_posts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "class_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      class_switch_requests: {
        Row: {
          created_at: string
          from_class: string | null
          id: string
          reviewed_by: string | null
          status: string | null
          student_card: string | null
          student_id: string
          student_name: string
          to_class: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_class?: string | null
          id?: string
          reviewed_by?: string | null
          status?: string | null
          student_card?: string | null
          student_id: string
          student_name: string
          to_class: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_class?: string | null
          id?: string
          reviewed_by?: string | null
          status?: string | null
          student_card?: string | null
          student_id?: string
          student_name?: string
          to_class?: string
          updated_at?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          parent_id: string
          parent_type: string
          visibility: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          parent_id: string
          parent_type: string
          visibility?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          parent_id?: string
          parent_type?: string
          visibility?: string
        }
        Relationships: []
      }
      data_retention_policy: {
        Row: {
          last_run_at: string | null
          resource: string
          ttl_days: number
          updated_at: string
        }
        Insert: {
          last_run_at?: string | null
          resource: string
          ttl_days: number
          updated_at?: string
        }
        Update: {
          last_run_at?: string | null
          resource?: string
          ttl_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      exam_admin_actions: {
        Row: {
          action_type: string
          created_at: string
          id: string
          metadata: Json | null
          performed_by: string
          performed_by_name: string | null
          performed_by_role: string | null
          reason: string | null
          student_id: string | null
          submission_id: string | null
          task_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          metadata?: Json | null
          performed_by: string
          performed_by_name?: string | null
          performed_by_role?: string | null
          reason?: string | null
          student_id?: string | null
          submission_id?: string | null
          task_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          performed_by?: string
          performed_by_name?: string | null
          performed_by_role?: string | null
          reason?: string | null
          student_id?: string | null
          submission_id?: string | null
          task_id?: string | null
        }
        Relationships: []
      }
      exam_security_config: {
        Row: {
          allow_secondary_monitor: boolean
          block_clipboard: boolean
          blocked_shortcuts: Json
          created_at: string
          default_max_warnings: number
          force_fullscreen: boolean
          id: string
          prohibited_apps: Json
          singleton: boolean
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          allow_secondary_monitor?: boolean
          block_clipboard?: boolean
          blocked_shortcuts?: Json
          created_at?: string
          default_max_warnings?: number
          force_fullscreen?: boolean
          id?: string
          prohibited_apps?: Json
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          allow_secondary_monitor?: boolean
          block_clipboard?: boolean
          blocked_shortcuts?: Json
          created_at?: string
          default_max_warnings?: number
          force_fullscreen?: boolean
          id?: string
          prohibited_apps?: Json
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: []
      }
      exam_sessions: {
        Row: {
          created_at: string
          expected_duration_seconds: number | null
          id: string
          is_active: boolean | null
          last_heartbeat: string | null
          question_order_hash: string | null
          started_at: string | null
          student_id: string
          task_id: string
          warning_details: Json | null
          warnings: number | null
        }
        Insert: {
          created_at?: string
          expected_duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          last_heartbeat?: string | null
          question_order_hash?: string | null
          started_at?: string | null
          student_id: string
          task_id: string
          warning_details?: Json | null
          warnings?: number | null
        }
        Update: {
          created_at?: string
          expected_duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          last_heartbeat?: string | null
          question_order_hash?: string | null
          started_at?: string | null
          student_id?: string
          task_id?: string
          warning_details?: Json | null
          warnings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "exam_analytics"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "exam_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_columns: {
        Row: {
          activity_date: string
          created_at: string
          id: string
          label: string
          max_score: number
          subject_id: string
          teacher_id: string
          term_id: string
        }
        Insert: {
          activity_date?: string
          created_at?: string
          id?: string
          label: string
          max_score?: number
          subject_id: string
          teacher_id: string
          term_id: string
        }
        Update: {
          activity_date?: string
          created_at?: string
          id?: string
          label?: string
          max_score?: number
          subject_id?: string
          teacher_id?: string
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_columns_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_columns_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_event_audience: {
        Row: {
          class_name: string | null
          created_at: string
          event_id: string
          id: string
          role_target: string | null
          user_id: string | null
        }
        Insert: {
          class_name?: string | null
          created_at?: string
          event_id: string
          id?: string
          role_target?: string | null
          user_id?: string | null
        }
        Update: {
          class_name?: string | null
          created_at?: string
          event_id?: string
          id?: string
          role_target?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_event_audience_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "live_events"
            referencedColumns: ["id"]
          },
        ]
      }
      live_event_comments: {
        Row: {
          content: string
          created_at: string
          event_id: string
          id: string
          reaction: string | null
          user_id: string
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          content: string
          created_at?: string
          event_id: string
          id?: string
          reaction?: string | null
          user_id: string
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          event_id?: string
          id?: string
          reaction?: string | null
          user_id?: string
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_event_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "live_events"
            referencedColumns: ["id"]
          },
        ]
      }
      live_events: {
        Row: {
          audience: Json
          created_at: string
          created_by: string
          created_by_name: string | null
          description: string | null
          ended_at: string | null
          host_id: string
          host_name: string | null
          id: string
          recording_enabled: boolean | null
          room_code: string
          scheduled_start: string | null
          started_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Json
          created_at?: string
          created_by: string
          created_by_name?: string | null
          description?: string | null
          ended_at?: string | null
          host_id: string
          host_name?: string | null
          id?: string
          recording_enabled?: boolean | null
          room_code: string
          scheduled_start?: string | null
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Json
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          description?: string | null
          ended_at?: string | null
          host_id?: string
          host_name?: string | null
          id?: string
          recording_enabled?: boolean | null
          room_code?: string
          scheduled_start?: string | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      meeting_invitees: {
        Row: {
          class_name: string | null
          created_at: string
          id: string
          meeting_id: string
          role_target: string | null
          user_id: string | null
        }
        Insert: {
          class_name?: string | null
          created_at?: string
          id?: string
          meeting_id: string
          role_target?: string | null
          user_id?: string | null
        }
        Update: {
          class_name?: string | null
          created_at?: string
          id?: string
          meeting_id?: string
          role_target?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_invitees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_participants: {
        Row: {
          connection_quality: string | null
          device_info: Json | null
          duration_seconds: number | null
          id: string
          joined_at: string
          left_at: string | null
          meeting_id: string
          role: string
          user_id: string
        }
        Insert: {
          connection_quality?: string | null
          device_info?: Json | null
          duration_seconds?: number | null
          id?: string
          joined_at?: string
          left_at?: string | null
          meeting_id: string
          role?: string
          user_id: string
        }
        Update: {
          connection_quality?: string | null
          device_info?: Json | null
          duration_seconds?: number | null
          id?: string
          joined_at?: string
          left_at?: string | null
          meeting_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_reports: {
        Row: {
          generated_at: string
          generated_by: string
          id: string
          meeting_id: string
          payload: Json
        }
        Insert: {
          generated_at?: string
          generated_by: string
          id?: string
          meeting_id: string
          payload?: Json
        }
        Update: {
          generated_at?: string
          generated_by?: string
          id?: string
          meeting_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "meeting_reports_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_speak_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          meeting_id: string
          status: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          meeting_id: string
          status?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          meeting_id?: string
          status?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_speak_requests_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          audience: Json
          created_at: string
          created_by: string
          created_by_name: string | null
          description: string | null
          ended_at: string | null
          host_id: string
          host_name: string | null
          id: string
          kind: string
          max_active_speakers: number | null
          recording_enabled: boolean | null
          room_code: string
          scheduled_end: string | null
          scheduled_start: string | null
          started_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Json
          created_at?: string
          created_by: string
          created_by_name?: string | null
          description?: string | null
          ended_at?: string | null
          host_id: string
          host_name?: string | null
          id?: string
          kind?: string
          max_active_speakers?: number | null
          recording_enabled?: boolean | null
          room_code: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Json
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          description?: string | null
          ended_at?: string | null
          host_id?: string
          host_name?: string | null
          id?: string
          kind?: string
          max_active_speakers?: number | null
          recording_enabled?: boolean | null
          room_code?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      modules: {
        Row: {
          created_at: string
          full_name: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      parent_children: {
        Row: {
          created_at: string
          id: string
          parent_id: string
          relationship: string | null
          student_id: string
          updated_at: string
          verified: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          parent_id: string
          relationship?: string | null
          student_id: string
          updated_at?: string
          verified?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          parent_id?: string
          relationship?: string | null
          student_id?: string
          updated_at?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      parent_messages: {
        Row: {
          attachments: Json | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      pii_access_log: {
        Row: {
          actor_id: string
          actor_role: string | null
          created_at: string
          field: string
          id: string
          reason: string | null
          subject_user_id: string
        }
        Insert: {
          actor_id: string
          actor_role?: string | null
          created_at?: string
          field: string
          id?: string
          reason?: string | null
          subject_user_id: string
        }
        Update: {
          actor_id?: string
          actor_role?: string | null
          created_at?: string
          field?: string
          id?: string
          reason?: string | null
          subject_user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          class_history: Json | null
          created_at: string
          current_class: string | null
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          student_card: string | null
          teacher_mcode: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          class_history?: Json | null
          created_at?: string
          current_class?: string | null
          full_name: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          student_card?: string | null
          teacher_mcode?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          class_history?: Json | null
          created_at?: string
          current_class?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          student_card?: string | null
          teacher_mcode?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          attempts: number
          blocked_until: string | null
          bucket: string
          created_at: string
          id: string
          identifier: string
          updated_at: string
          window_start: string
        }
        Insert: {
          attempts?: number
          blocked_until?: string | null
          bucket: string
          created_at?: string
          id?: string
          identifier: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          attempts?: number
          blocked_until?: string | null
          bucket?: string
          created_at?: string
          id?: string
          identifier?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      recordings: {
        Row: {
          created_at: string
          created_by: string
          created_by_name: string | null
          duration_seconds: number | null
          id: string
          source_id: string
          source_type: string
          storage_path: string
          title: string | null
          visibility: Json | null
        }
        Insert: {
          created_at?: string
          created_by: string
          created_by_name?: string | null
          duration_seconds?: number | null
          id?: string
          source_id: string
          source_type: string
          storage_path: string
          title?: string | null
          visibility?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          duration_seconds?: number | null
          id?: string
          source_id?: string
          source_type?: string
          storage_path?: string
          title?: string | null
          visibility?: Json | null
        }
        Relationships: []
      }
      registered_students: {
        Row: {
          age: number | null
          batch_name: string | null
          class_name: string | null
          created_at: string
          full_name: string
          id: string
          is_registered: boolean | null
          registered_user_id: string | null
          student_card: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          age?: number | null
          batch_name?: string | null
          class_name?: string | null
          created_at?: string
          full_name: string
          id?: string
          is_registered?: boolean | null
          registered_user_id?: string | null
          student_card: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          age?: number | null
          batch_name?: string | null
          class_name?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_registered?: boolean | null
          registered_user_id?: string | null
          student_card?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      student_scores: {
        Row: {
          created_at: string
          id: string
          max_score: number | null
          score: number | null
          score_type: string | null
          student_id: string
          subject_id: string | null
          task_id: string | null
          term_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          max_score?: number | null
          score?: number | null
          score_type?: string | null
          student_id: string
          subject_id?: string | null
          task_id?: string | null
          term_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          max_score?: number | null
          score?: number | null
          score_type?: string | null
          student_id?: string
          subject_id?: string | null
          task_id?: string | null
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_scores_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_scores_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "exam_analytics"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "student_scores_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_scores_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_scores_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          class_name: string
          code: string | null
          created_at: string
          id: string
          level: number | null
          module: string | null
          name: string
          teacher_id: string | null
        }
        Insert: {
          class_name: string
          code?: string | null
          created_at?: string
          id?: string
          level?: number | null
          module?: string | null
          name: string
          teacher_id?: string | null
        }
        Update: {
          class_name?: string
          code?: string | null
          created_at?: string
          id?: string
          level?: number | null
          module?: string | null
          name?: string
          teacher_id?: string | null
        }
        Relationships: []
      }
      task_submissions: {
        Row: {
          answers: Json | null
          created_at: string
          id: string
          score: number | null
          status: string | null
          student_id: string
          submitted_at: string | null
          task_id: string
          warnings: number | null
        }
        Insert: {
          answers?: Json | null
          created_at?: string
          id?: string
          score?: number | null
          status?: string | null
          student_id: string
          submitted_at?: string | null
          task_id: string
          warnings?: number | null
        }
        Update: {
          answers?: Json | null
          created_at?: string
          id?: string
          score?: number | null
          status?: string | null
          student_id?: string
          submitted_at?: string | null
          task_id?: string
          warnings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "exam_analytics"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "task_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          class_name: string
          created_at: string
          created_by: string
          description: string | null
          duration_minutes: number | null
          ends_at: string | null
          id: string
          is_active: boolean | null
          max_warnings: number | null
          questions: Json | null
          required_fields: Json | null
          scores_published: boolean | null
          security_settings: Json | null
          starts_at: string | null
          subject_id: string | null
          task_type: string
          term_id: string | null
          title: string
          total_marks: number | null
        }
        Insert: {
          class_name: string
          created_at?: string
          created_by: string
          description?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          max_warnings?: number | null
          questions?: Json | null
          required_fields?: Json | null
          scores_published?: boolean | null
          security_settings?: Json | null
          starts_at?: string | null
          subject_id?: string | null
          task_type: string
          term_id?: string | null
          title: string
          total_marks?: number | null
        }
        Update: {
          class_name?: string
          created_at?: string
          created_by?: string
          description?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          max_warnings?: number | null
          questions?: Json | null
          required_fields?: Json | null
          scores_published?: boolean | null
          security_settings?: Json | null
          starts_at?: string | null
          subject_id?: string | null
          task_type?: string
          term_id?: string | null
          title?: string
          total_marks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          is_active: boolean | null
          name: string
          starts_at: string | null
          term_number: number
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          starts_at?: string | null
          term_number: number
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          starts_at?: string | null
          term_number?: number
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      exam_analytics: {
        Row: {
          avg_score: number | null
          avg_warnings: number | null
          class_name: string | null
          completed_submissions: number | null
          completion_rate: number | null
          high_warning_count: number | null
          in_progress: number | null
          task_created_at: string | null
          task_id: string | null
          task_title: string | null
          task_type: string | null
          total_marks: number | null
          total_submissions: number | null
          total_warnings: number | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          current_class: string | null
          full_name: string | null
          id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          teacher_mcode: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          current_class?: string | null
          full_name?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          teacher_mcode?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          current_class?: string | null
          full_name?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          teacher_mcode?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tasks_safe: {
        Row: {
          class_name: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          ends_at: string | null
          id: string | null
          is_active: boolean | null
          max_warnings: number | null
          questions: Json | null
          required_fields: Json | null
          security_settings: Json | null
          starts_at: string | null
          task_type: string | null
          title: string | null
          total_marks: number | null
        }
        Insert: {
          class_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          id?: string | null
          is_active?: boolean | null
          max_warnings?: number | null
          questions?: never
          required_fields?: Json | null
          security_settings?: Json | null
          starts_at?: string | null
          task_type?: string | null
          title?: string | null
          total_marks?: number | null
        }
        Update: {
          class_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          id?: string | null
          is_active?: boolean | null
          max_warnings?: number | null
          questions?: never
          required_fields?: Json | null
          security_settings?: Json | null
          starts_at?: string | null
          task_type?: string | null
          title?: string | null
          total_marks?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      broadcast_source_heartbeat: {
        Args: { _source_id: string; _stop?: boolean; _token: string }
        Returns: Json
      }
      can_access_score: {
        Args: { _mode?: string; _subject_id: string; _task_id: string }
        Returns: boolean
      }
      can_message_user: { Args: { _recipient: string }; Returns: boolean }
      can_view_event: { Args: { _event_id: string }; Returns: boolean }
      can_view_meeting: { Args: { _meeting_id: string }; Returns: boolean }
      check_rate_limit: {
        Args: {
          _block_seconds?: number
          _bucket: string
          _identifier: string
          _max_attempts?: number
          _window_seconds?: number
        }
        Returns: boolean
      }
      check_student_card_exists: {
        Args: { card_number: string }
        Returns: boolean
      }
      create_broadcast_token: {
        Args: {
          _max_devices?: number
          _meeting_id: string
          _ttl_minutes?: number
        }
        Returns: Json
      }
      create_event_broadcast_token: {
        Args: {
          _live_event_id: string
          _max_devices?: number
          _ttl_minutes?: number
        }
        Returns: Json
      }
      create_profile_with_role: {
        Args: {
          _admin_code?: string
          _current_class?: string
          _full_name: string
          _phone?: string
          _role: Database["public"]["Enums"]["user_role"]
          _student_card?: string
          _user_id: string
        }
        Returns: undefined
      }
      end_live_event: { Args: { _live_event_id: string }; Returns: Json }
      end_meeting: { Args: { _meeting_id: string }; Returns: Json }
      exam_deadline: {
        Args: { _student_id: string; _task_id: string }
        Returns: string
      }
      exam_session_heartbeat: { Args: { _task_id: string }; Returns: undefined }
      exam_submission_state: {
        Args: { _student_id: string; _task_id: string }
        Returns: string
      }
      find_teacher_by_mcode: {
        Args: { _code: string }
        Returns: {
          avatar_url: string
          full_name: string
          teacher_mcode: string
          user_id: string
        }[]
      }
      generate_class_gen_name: {
        Args: {
          _level: number
          _module: string
          _section: string
          _year_letter: string
        }
        Returns: string
      }
      get_exam_questions: { Args: { _task_id: string }; Returns: Json }
      get_meeting_report: { Args: { _meeting_id: string }; Returns: Json }
      get_my_children: {
        Args: never
        Returns: {
          avatar_url: string
          class_history: Json
          current_class: string
          full_name: string
          student_card: string
          user_id: string
        }[]
      }
      get_own_role: { Args: never; Returns: string }
      get_public_profiles: {
        Args: { _class_name?: string; _role_filter?: string; _search?: string }
        Returns: {
          avatar_url: string
          created_at: string
          current_class: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }[]
      }
      get_student_contact: {
        Args: { _reason: string; _student_id: string }
        Returns: {
          phone: string
          student_card: string
        }[]
      }
      get_student_registration_info: {
        Args: { card_number: string }
        Returns: {
          class_name: string
          full_name: string
          student_card: string
        }[]
      }
      is_main_admin: { Args: { _user_id: string }; Returns: boolean }
      log_audit: {
        Args: {
          _action_type: string
          _device_info?: Json
          _metadata?: Json
          _resource_id?: string
          _resource_type: string
          _target_label?: string
        }
        Returns: string
      }
      mark_meeting_attendance: {
        Args: { _device?: Json; _meeting_id: string; _role?: string }
        Returns: string
      }
      redeem_broadcast_token: {
        Args: { _device_label?: string; _token: string; _user_agent?: string }
        Returns: Json
      }
      revoke_broadcast_token: { Args: { _token_id: string }; Returns: Json }
      run_retention_sweep: { Args: never; Returns: Json }
      search_students_for_parent: {
        Args: { _search: string; _search_by?: string }
        Returns: {
          avatar_url: string
          current_class: string
          full_name: string
          source: string
          student_card: string
          user_id: string
        }[]
      }
      start_exam_session: { Args: { _task_id: string }; Returns: Json }
      submit_exam: {
        Args: {
          _answers: Json
          _force?: boolean
          _task_id: string
          _warnings?: number
        }
        Returns: Json
      }
      upsert_activity_score: {
        Args: { _column_id: string; _score: number; _student_id: string }
        Returns: string
      }
      upsert_term_score: {
        Args: {
          _max_score?: number
          _score: number
          _student_id: string
          _subject_id: string
          _term_id: string
        }
        Returns: string
      }
      verify_admin_code: { Args: { input_code: string }; Returns: boolean }
    }
    Enums: {
      user_role: "student" | "teacher" | "admin" | "parent"
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
      user_role: ["student", "teacher", "admin", "parent"],
    },
  },
} as const
