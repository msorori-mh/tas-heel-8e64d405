export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      ai_usage_logs: {
        Row: {
          created_at: string
          error_message: string | null
          feature: string
          id: string
          model: string | null
          success: boolean | null
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          feature: string
          id?: string
          model?: string | null
          success?: boolean | null
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          feature?: string
          id?: string
          model?: string | null
          success?: boolean | null
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: []
      }
      assessment_questions: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          points: number
          question_id: string
          sort_order: number
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          points?: number
          question_id: string
          sort_order?: number
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          points?: number
          question_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "lesson_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      badges: {
        Row: {
          color: string
          condition_type: string
          condition_value: number
          created_at: string
          description: string
          icon: string
          id: string
          name: string
          points_reward: number
          sort_order: number
        }
        Insert: {
          color?: string
          condition_type: string
          condition_value?: number
          created_at?: string
          description: string
          icon?: string
          id?: string
          name: string
          points_reward?: number
          sort_order?: number
        }
        Update: {
          color?: string
          condition_type?: string
          condition_value?: number
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          points_reward?: number
          sort_order?: number
        }
        Relationships: []
      }
      certificates: {
        Row: {
          id: string
          issued_at: string
          subject_id: string
          user_id: string
        }
        Insert: {
          id?: string
          issued_at?: string
          subject_id: string
          user_id: string
        }
        Update: {
          id?: string
          issued_at?: string
          subject_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_read: boolean
          message: string
          subject: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_read?: boolean
          message: string
          subject: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_read?: boolean
          message?: string
          subject?: string
        }
        Relationships: []
      }
      content_feature_flags: {
        Row: {
          description: string | null
          flag_key: string
          id: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          description?: string | null
          flag_key: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          description?: string | null
          flag_key?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      content_import_batches: {
        Row: {
          actor_id: string
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          status: string
        }
        Insert: {
          actor_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          status?: string
        }
        Update: {
          actor_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          status?: string
        }
        Relationships: []
      }
      content_package_validations: {
        Row: {
          created_at: string
          created_by_server: boolean
          findings: Json
          id: string
          is_valid: boolean
          package_hash: string
          resource_id: string
          resource_version_id: string
          scanner_version: string
          storage_object_path: string
          storage_object_version: string | null
          upload_session_id: string
          valid_until: string
          validated_at: string
        }
        Insert: {
          created_at?: string
          created_by_server?: boolean
          findings?: Json
          id?: string
          is_valid?: boolean
          package_hash: string
          resource_id: string
          resource_version_id: string
          scanner_version: string
          storage_object_path: string
          storage_object_version?: string | null
          upload_session_id: string
          valid_until: string
          validated_at?: string
        }
        Update: {
          created_at?: string
          created_by_server?: boolean
          findings?: Json
          id?: string
          is_valid?: boolean
          package_hash?: string
          resource_id?: string
          resource_version_id?: string
          scanner_version?: string
          storage_object_path?: string
          storage_object_version?: string | null
          upload_session_id?: string
          valid_until?: string
          validated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_package_validations_session_composite_fk"
            columns: ["upload_session_id", "resource_id"]
            isOneToOne: false
            referencedRelation: "lesson_resource_upload_sessions"
            referencedColumns: ["id", "resource_id"]
          },
          {
            foreignKeyName: "content_package_validations_version_composite_fk"
            columns: ["resource_version_id", "resource_id"]
            isOneToOne: false
            referencedRelation: "lesson_resource_versions"
            referencedColumns: ["id", "resource_id"]
          },
        ]
      }
      curriculum_tracks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          track_code: string
          track_name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          track_code: string
          track_name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          track_code?: string
          track_name?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      exam_session_answers: {
        Row: {
          answered_at: string | null
          assigned_grader_id: string | null
          auto_score: number | null
          created_at: string
          exam_session_question_id: string | null
          final_score: number | null
          finalized_at: string | null
          graded_at: string | null
          grading_status: string | null
          id: string
          is_correct: boolean | null
          manual_score: number | null
          max_score: number | null
          pin_mode: string | null
          points_awarded: number
          question_id: string
          question_revision_id: string | null
          requires_manual_review: boolean
          response_payload: Json | null
          response_text: string | null
          selected_index: number | null
          selected_option_code: string | null
          session_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          assigned_grader_id?: string | null
          auto_score?: number | null
          created_at?: string
          exam_session_question_id?: string | null
          final_score?: number | null
          finalized_at?: string | null
          graded_at?: string | null
          grading_status?: string | null
          id?: string
          is_correct?: boolean | null
          manual_score?: number | null
          max_score?: number | null
          pin_mode?: string | null
          points_awarded?: number
          question_id: string
          question_revision_id?: string | null
          requires_manual_review?: boolean
          response_payload?: Json | null
          response_text?: string | null
          selected_index?: number | null
          selected_option_code?: string | null
          session_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          assigned_grader_id?: string | null
          auto_score?: number | null
          created_at?: string
          exam_session_question_id?: string | null
          final_score?: number | null
          finalized_at?: string | null
          graded_at?: string | null
          grading_status?: string | null
          id?: string
          is_correct?: boolean | null
          manual_score?: number | null
          max_score?: number | null
          pin_mode?: string | null
          points_awarded?: number
          question_id?: string
          question_revision_id?: string | null
          requires_manual_review?: boolean
          response_payload?: Json | null
          response_text?: string | null
          selected_index?: number | null
          selected_option_code?: string | null
          session_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_session_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_answers_question_revision_id_fkey"
            columns: ["question_revision_id"]
            isOneToOne: false
            referencedRelation: "question_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_answers_session_question_fk"
            columns: ["session_id", "exam_session_question_id"]
            isOneToOne: false
            referencedRelation: "exam_session_questions"
            referencedColumns: ["exam_session_id", "id"]
          },
        ]
      }
      exam_session_questions: {
        Row: {
          created_at: string
          exam_session_id: string
          id: string
          logical_question_id: string
          max_score: number
          option_order_mapping: Json
          payload_hash: string
          payload_hash_version: string
          pin_mode: string
          question_order: number
          question_revision_id: string
          rendered_options: Json
          rendered_question_text: string
          rendered_stimulus_text: string | null
        }
        Insert: {
          created_at?: string
          exam_session_id: string
          id?: string
          logical_question_id: string
          max_score?: number
          option_order_mapping?: Json
          payload_hash: string
          payload_hash_version?: string
          pin_mode: string
          question_order: number
          question_revision_id: string
          rendered_options?: Json
          rendered_question_text: string
          rendered_stimulus_text?: string | null
        }
        Update: {
          created_at?: string
          exam_session_id?: string
          id?: string
          logical_question_id?: string
          max_score?: number
          option_order_mapping?: Json
          payload_hash?: string
          payload_hash_version?: string
          pin_mode?: string
          question_order?: number
          question_revision_id?: string
          rendered_options?: Json
          rendered_question_text?: string
          rendered_stimulus_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_session_questions_exam_session_id_fkey"
            columns: ["exam_session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_questions_logical_question_id_fkey"
            columns: ["logical_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_questions_question_revision_id_fkey"
            columns: ["question_revision_id"]
            isOneToOne: false
            referencedRelation: "question_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sessions: {
        Row: {
          answered_questions: number
          attempt_pin_mode: string
          correct_answers: number
          created_at: string
          expires_at: string | null
          grading_status: string
          id: string
          mode: Database["public"]["Enums"]["exam_mode"]
          result_json: Json | null
          score: number
          started_at: string
          status: Database["public"]["Enums"]["exam_session_status"]
          submitted_at: string | null
          template_id: string
          total_points: number
          total_questions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          answered_questions?: number
          attempt_pin_mode?: string
          correct_answers?: number
          created_at?: string
          expires_at?: string | null
          grading_status?: string
          id?: string
          mode: Database["public"]["Enums"]["exam_mode"]
          result_json?: Json | null
          score?: number
          started_at?: string
          status?: Database["public"]["Enums"]["exam_session_status"]
          submitted_at?: string | null
          template_id: string
          total_points?: number
          total_questions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          answered_questions?: number
          attempt_pin_mode?: string
          correct_answers?: number
          created_at?: string
          expires_at?: string | null
          grading_status?: string
          id?: string
          mode?: Database["public"]["Enums"]["exam_mode"]
          result_json?: Json | null
          score?: number
          started_at?: string
          status?: Database["public"]["Enums"]["exam_session_status"]
          submitted_at?: string | null
          template_id?: string
          total_points?: number
          total_questions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "exam_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_template_questions: {
        Row: {
          created_at: string
          id: string
          points: number
          question_id: string
          sort_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          points?: number
          question_id: string
          sort_order?: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          points?: number
          question_id?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_template_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_template_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "exam_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_templates: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          is_active: boolean
          lesson_id: string | null
          mode: Database["public"]["Enums"]["exam_mode"]
          subject_id: string | null
          title: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean
          lesson_id?: string | null
          mode?: Database["public"]["Enums"]["exam_mode"]
          subject_id?: string | null
          title: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean
          lesson_id?: string | null
          mode?: Database["public"]["Enums"]["exam_mode"]
          subject_id?: string | null
          title?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_templates_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_templates_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_templates_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      governorate_curriculum_map: {
        Row: {
          created_at: string
          curriculum_track_id: string
          governorate_id: string
          id: string
        }
        Insert: {
          created_at?: string
          curriculum_track_id: string
          governorate_id: string
          id?: string
        }
        Update: {
          created_at?: string
          curriculum_track_id?: string
          governorate_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "governorate_curriculum_map_curriculum_track_id_fkey"
            columns: ["curriculum_track_id"]
            isOneToOne: false
            referencedRelation: "curriculum_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governorate_curriculum_map_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
        ]
      }
      governorates: {
        Row: {
          created_at: string
          default_curriculum_track_id: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          default_curriculum_track_id?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          default_curriculum_track_id?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "governorates_default_curriculum_track_id_fkey"
            columns: ["default_curriculum_track_id"]
            isOneToOne: false
            referencedRelation: "curriculum_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          category: string
          created_at: string
          curriculum_track_id: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          category: string
          created_at?: string
          curriculum_track_id?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          curriculum_track_id?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "grades_curriculum_track_id_fkey"
            columns: ["curriculum_track_id"]
            isOneToOne: false
            referencedRelation: "curriculum_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_ledger: {
        Row: {
          actor_id: string
          completed_at: string | null
          created_at: string
          error: Json | null
          id: string
          idempotency_key: string
          operation: string
          result: Json | null
          status: string
        }
        Insert: {
          actor_id: string
          completed_at?: string | null
          created_at?: string
          error?: Json | null
          id?: string
          idempotency_key: string
          operation: string
          result?: Json | null
          status?: string
        }
        Update: {
          actor_id?: string
          completed_at?: string | null
          created_at?: string
          error?: Json | null
          id?: string
          idempotency_key?: string
          operation?: string
          result?: Json | null
          status?: string
        }
        Relationships: []
      }
      import_errors: {
        Row: {
          column_name: string | null
          created_at: string
          entity_code: string | null
          entity_type: string | null
          error_code: string
          field_name: string | null
          id: string
          job_id: string
          message: string
          metadata: Json
          raw_value: string | null
          row_data: Json
          row_number: number | null
          severity: string
          sheet_name: string | null
        }
        Insert: {
          column_name?: string | null
          created_at?: string
          entity_code?: string | null
          entity_type?: string | null
          error_code: string
          field_name?: string | null
          id?: string
          job_id: string
          message: string
          metadata?: Json
          raw_value?: string | null
          row_data?: Json
          row_number?: number | null
          severity?: string
          sheet_name?: string | null
        }
        Update: {
          column_name?: string | null
          created_at?: string
          entity_code?: string | null
          entity_type?: string | null
          error_code?: string
          field_name?: string | null
          id?: string
          job_id?: string
          message?: string
          metadata?: Json
          raw_value?: string | null
          row_data?: Json
          row_number?: number | null
          severity?: string
          sheet_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_errors_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          error_message: string | null
          file_size_bytes: number | null
          id: string
          import_type: string
          inserted_count: number
          invalid_rows: number
          metadata: Json
          mime_type: string | null
          mode: string
          original_filename: string | null
          skipped_count: number
          started_at: string | null
          status: string
          summary: Json
          template_key: string | null
          total_rows: number
          updated_at: string
          updated_count: number
          valid_rows: number
          warning_rows: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          import_type: string
          inserted_count?: number
          invalid_rows?: number
          metadata?: Json
          mime_type?: string | null
          mode?: string
          original_filename?: string | null
          skipped_count?: number
          started_at?: string | null
          status?: string
          summary?: Json
          template_key?: string | null
          total_rows?: number
          updated_at?: string
          updated_count?: number
          valid_rows?: number
          warning_rows?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          import_type?: string
          inserted_count?: number
          invalid_rows?: number
          metadata?: Json
          mime_type?: string | null
          mode?: string
          original_filename?: string | null
          skipped_count?: number
          started_at?: string | null
          status?: string
          summary?: Json
          template_key?: string | null
          total_rows?: number
          updated_at?: string
          updated_count?: number
          valid_rows?: number
          warning_rows?: number
        }
        Relationships: []
      }
      lesson_assessments: {
        Row: {
          created_at: string
          id: string
          instructions: string | null
          lesson_id: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string | null
          lesson_id: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string | null
          lesson_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_assessments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_book_contents: {
        Row: {
          content: string | null
          created_at: string
          id: string
          lesson_id: string
          pdf_url: string | null
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          lesson_id: string
          pdf_url?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          lesson_id?: string
          pdf_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_book_contents_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          lesson_id: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          lesson_id: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          lesson_id?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_comments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "lesson_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_explanations: {
        Row: {
          content: string
          created_at: string
          id: string
          lesson_id: string
          sort_order: number
          title: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          lesson_id: string
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lesson_id?: string
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_explanations_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_resource_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          resource_id: string | null
          resource_version_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          resource_id?: string | null
          resource_version_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          resource_id?: string | null
          resource_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_resource_events_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "lesson_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_resource_events_resource_version_id_fkey"
            columns: ["resource_version_id"]
            isOneToOne: false
            referencedRelation: "lesson_resource_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_resource_files: {
        Row: {
          byte_size: number
          content_sha256: string
          created_at: string
          id: string
          mime_type: string
          relative_path: string
          resource_id: string
          storage_object_path: string
          version_id: string
        }
        Insert: {
          byte_size: number
          content_sha256: string
          created_at?: string
          id?: string
          mime_type: string
          relative_path: string
          resource_id: string
          storage_object_path: string
          version_id: string
        }
        Update: {
          byte_size?: number
          content_sha256?: string
          created_at?: string
          id?: string
          mime_type?: string
          relative_path?: string
          resource_id?: string
          storage_object_path?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_resource_files_composite_fk"
            columns: ["resource_id", "version_id"]
            isOneToOne: false
            referencedRelation: "lesson_resource_versions"
            referencedColumns: ["resource_id", "id"]
          },
        ]
      }
      lesson_resource_reviews: {
        Row: {
          created_at: string
          decision: string
          id: string
          reason: string | null
          resource_id: string
          resource_version_id: string
          reviewer_id: string
        }
        Insert: {
          created_at?: string
          decision: string
          id?: string
          reason?: string | null
          resource_id: string
          resource_version_id: string
          reviewer_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          id?: string
          reason?: string | null
          resource_id?: string
          resource_version_id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_resource_reviews_composite_fk"
            columns: ["resource_id", "resource_version_id"]
            isOneToOne: false
            referencedRelation: "lesson_resource_versions"
            referencedColumns: ["resource_id", "id"]
          },
        ]
      }
      lesson_resource_upload_sessions: {
        Row: {
          actor_id: string
          batch_id: string
          created_at: string
          expected_package_hash: string
          expires_at: string
          finalized_at: string | null
          id: string
          original_filename: string
          resource_code: string | null
          resource_id: string
          staging_path: string
          status: string
        }
        Insert: {
          actor_id: string
          batch_id: string
          created_at?: string
          expected_package_hash: string
          expires_at: string
          finalized_at?: string | null
          id?: string
          original_filename: string
          resource_code?: string | null
          resource_id: string
          staging_path: string
          status?: string
        }
        Update: {
          actor_id?: string
          batch_id?: string
          created_at?: string
          expected_package_hash?: string
          expires_at?: string
          finalized_at?: string | null
          id?: string
          original_filename?: string
          resource_code?: string | null
          resource_id?: string
          staging_path?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_resource_upload_sessions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "content_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_resource_upload_sessions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "lesson_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_resource_versions: {
        Row: {
          content_sha256: string
          created_at: string
          created_by: string | null
          id: string
          immutable_at: string | null
          immutable_reason: string | null
          manifest: Json
          resource_id: string
          version_number: number
        }
        Insert: {
          content_sha256: string
          created_at?: string
          created_by?: string | null
          id?: string
          immutable_at?: string | null
          immutable_reason?: string | null
          manifest?: Json
          resource_id: string
          version_number: number
        }
        Update: {
          content_sha256?: string
          created_at?: string
          created_by?: string | null
          id?: string
          immutable_at?: string | null
          immutable_reason?: string | null
          manifest?: Json
          resource_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_resource_versions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "lesson_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_resources: {
        Row: {
          approved_version_id: string | null
          created_at: string
          current_draft_version_id: string | null
          description: string | null
          html_resource_type: string | null
          id: string
          lesson_id: string
          lifecycle_status: string
          lock_version: number
          published_version_id: string | null
          resource_code: string | null
          resource_type: Database["public"]["Enums"]["lesson_resource_type"]
          sort_order: number
          title: string
          updated_at: string | null
          url: string
        }
        Insert: {
          approved_version_id?: string | null
          created_at?: string
          current_draft_version_id?: string | null
          description?: string | null
          html_resource_type?: string | null
          id?: string
          lesson_id: string
          lifecycle_status?: string
          lock_version?: number
          published_version_id?: string | null
          resource_code?: string | null
          resource_type: Database["public"]["Enums"]["lesson_resource_type"]
          sort_order?: number
          title: string
          updated_at?: string | null
          url: string
        }
        Update: {
          approved_version_id?: string | null
          created_at?: string
          current_draft_version_id?: string | null
          description?: string | null
          html_resource_type?: string | null
          id?: string
          lesson_id?: string
          lifecycle_status?: string
          lock_version?: number
          published_version_id?: string | null
          resource_code?: string | null
          resource_type?: Database["public"]["Enums"]["lesson_resource_type"]
          sort_order?: number
          title?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_resources_approved_version_fk"
            columns: ["id", "approved_version_id"]
            isOneToOne: false
            referencedRelation: "lesson_resource_versions"
            referencedColumns: ["resource_id", "id"]
          },
          {
            foreignKeyName: "lesson_resources_draft_version_fk"
            columns: ["id", "current_draft_version_id"]
            isOneToOne: false
            referencedRelation: "lesson_resource_versions"
            referencedColumns: ["resource_id", "id"]
          },
          {
            foreignKeyName: "lesson_resources_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_resources_published_version_fk"
            columns: ["id", "published_version_id"]
            isOneToOne: false
            referencedRelation: "lesson_resource_versions"
            referencedColumns: ["resource_id", "id"]
          },
        ]
      }
      lesson_simulations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          lesson_id: string
          phet_url: string
          sort_order: number
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          lesson_id: string
          phet_url: string
          sort_order?: number
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          lesson_id?: string
          phet_url?: string
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_simulations_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_summaries: {
        Row: {
          created_at: string
          id: string
          key_points: Json
          lesson_id: string
          study_tip: string | null
          summary: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_points?: Json
          lesson_id: string
          study_tip?: string | null
          summary: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key_points?: Json
          lesson_id?: string
          study_tip?: string | null
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_summaries_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content_pdf_url: string | null
          content_text: string | null
          created_at: string
          duration: string | null
          has_content_pdf: boolean | null
          has_video: boolean | null
          id: string
          is_free: boolean | null
          semester: number | null
          slug: string
          sort_order: number
          subject_id: string
          title: string
          unit_id: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          content_pdf_url?: string | null
          content_text?: string | null
          created_at?: string
          duration?: string | null
          has_content_pdf?: boolean | null
          has_video?: boolean | null
          id?: string
          is_free?: boolean | null
          semester?: number | null
          slug: string
          sort_order?: number
          subject_id: string
          title: string
          unit_id?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          content_pdf_url?: string | null
          content_text?: string | null
          created_at?: string
          duration?: string | null
          has_content_pdf?: boolean | null
          has_video?: boolean | null
          id?: string
          is_free?: boolean | null
          semester?: number | null
          slug?: string
          sort_order?: number
          subject_id?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          account_name: string | null
          account_number: string | null
          barcode_url: string | null
          created_at: string
          details: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          barcode_url?: string | null
          created_at?: string
          details?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          sort_order?: number
          type: string
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          barcode_url?: string | null
          created_at?: string
          details?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string
          currency: string
          fraud_flags: Json
          id: string
          normalized_amount: number | null
          payment_date: string | null
          payment_method_id: string | null
          plan_id: string | null
          receipt_hash: string | null
          receipt_url: string | null
          refund_transaction_id: string | null
          refunded_at: string | null
          refunded_by: string | null
          reversal_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_name: string | null
          status: string
          subscription_id: string | null
          transaction_reference: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string
          currency?: string
          fraud_flags?: Json
          id?: string
          normalized_amount?: number | null
          payment_date?: string | null
          payment_method_id?: string | null
          plan_id?: string | null
          receipt_hash?: string | null
          receipt_url?: string | null
          refund_transaction_id?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          reversal_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_name?: string | null
          status?: string
          subscription_id?: string | null
          transaction_reference?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string
          currency?: string
          fraud_flags?: Json
          id?: string
          normalized_amount?: number | null
          payment_date?: string | null
          payment_method_id?: string | null
          plan_id?: string | null
          receipt_hash?: string | null
          receipt_url?: string | null
          refund_transaction_id?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          reversal_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_name?: string | null
          status?: string
          subscription_id?: string | null
          transaction_reference?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_refund_transaction_id_fkey"
            columns: ["refund_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_attempt_questions: {
        Row: {
          created_at: string
          id: string
          logical_question_id: string
          max_score: number
          option_order_mapping: Json
          payload_hash: string
          payload_hash_version: string
          practice_attempt_id: string
          question_order: number
          question_revision_id: string
          rendered_options: Json
          rendered_question_text: string
          rendered_stimulus_text: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          logical_question_id: string
          max_score?: number
          option_order_mapping?: Json
          payload_hash: string
          payload_hash_version?: string
          practice_attempt_id: string
          question_order: number
          question_revision_id: string
          rendered_options?: Json
          rendered_question_text: string
          rendered_stimulus_text?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          logical_question_id?: string
          max_score?: number
          option_order_mapping?: Json
          payload_hash?: string
          payload_hash_version?: string
          practice_attempt_id?: string
          question_order?: number
          question_revision_id?: string
          rendered_options?: Json
          rendered_question_text?: string
          rendered_stimulus_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_attempt_questions_logical_question_id_fkey"
            columns: ["logical_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_attempt_questions_practice_attempt_id_fkey"
            columns: ["practice_attempt_id"]
            isOneToOne: false
            referencedRelation: "practice_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_attempt_questions_question_revision_id_fkey"
            columns: ["question_revision_id"]
            isOneToOne: false
            referencedRelation: "question_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_attempt_responses: {
        Row: {
          auto_score: number | null
          created_at: string
          final_score: number | null
          finalized_at: string | null
          graded_at: string | null
          grading_status: string | null
          id: string
          manual_score: number | null
          max_score: number | null
          practice_attempt_id: string
          practice_attempt_question_id: string
          requires_manual_review: boolean
          response_payload: Json | null
          response_text: string | null
          selected_option_code: string | null
          submitted_at: string | null
        }
        Insert: {
          auto_score?: number | null
          created_at?: string
          final_score?: number | null
          finalized_at?: string | null
          graded_at?: string | null
          grading_status?: string | null
          id?: string
          manual_score?: number | null
          max_score?: number | null
          practice_attempt_id: string
          practice_attempt_question_id: string
          requires_manual_review?: boolean
          response_payload?: Json | null
          response_text?: string | null
          selected_option_code?: string | null
          submitted_at?: string | null
        }
        Update: {
          auto_score?: number | null
          created_at?: string
          final_score?: number | null
          finalized_at?: string | null
          graded_at?: string | null
          grading_status?: string | null
          id?: string
          manual_score?: number | null
          max_score?: number | null
          practice_attempt_id?: string
          practice_attempt_question_id?: string
          requires_manual_review?: boolean
          response_payload?: Json | null
          response_text?: string | null
          selected_option_code?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_attempt_responses_attempt_question_fk"
            columns: ["practice_attempt_id", "practice_attempt_question_id"]
            isOneToOne: false
            referencedRelation: "practice_attempt_questions"
            referencedColumns: ["practice_attempt_id", "id"]
          },
          {
            foreignKeyName: "practice_attempt_responses_practice_attempt_id_fkey"
            columns: ["practice_attempt_id"]
            isOneToOne: false
            referencedRelation: "practice_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_attempts: {
        Row: {
          attempt_pin_mode: string
          attempt_type: string
          grading_status: string
          id: string
          lesson_assessment_id: string | null
          max_score: number | null
          started_at: string
          submitted_at: string | null
          total_score: number | null
          unit_id: string | null
          user_id: string
        }
        Insert: {
          attempt_pin_mode?: string
          attempt_type: string
          grading_status?: string
          id?: string
          lesson_assessment_id?: string | null
          max_score?: number | null
          started_at?: string
          submitted_at?: string | null
          total_score?: number | null
          unit_id?: string | null
          user_id: string
        }
        Update: {
          attempt_pin_mode?: string
          attempt_type?: string
          grading_status?: string
          id?: string
          lesson_assessment_id?: string | null
          max_score?: number | null
          started_at?: string
          submitted_at?: string | null
          total_score?: number | null
          unit_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_attempts_lesson_assessment_id_fkey"
            columns: ["lesson_assessment_id"]
            isOneToOne: false
            referencedRelation: "lesson_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_attempts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          curriculum_track_id: string | null
          full_name: string | null
          governorate: string | null
          governorate_id: string | null
          grade_id: string | null
          grade_uuid: string | null
          id: string
          parent_email: string | null
          parent_phone: string | null
          phone: string | null
          referral_code: string | null
          referred_by: string | null
          school_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          curriculum_track_id?: string | null
          full_name?: string | null
          governorate?: string | null
          governorate_id?: string | null
          grade_id?: string | null
          grade_uuid?: string | null
          id?: string
          parent_email?: string | null
          parent_phone?: string | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          school_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          curriculum_track_id?: string | null
          full_name?: string | null
          governorate?: string | null
          governorate_id?: string | null
          grade_id?: string | null
          grade_uuid?: string | null
          id?: string
          parent_email?: string | null
          parent_phone?: string | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          school_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_curriculum_track_id_fkey"
            columns: ["curriculum_track_id"]
            isOneToOne: false
            referencedRelation: "curriculum_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_grade_uuid_fkey"
            columns: ["grade_uuid"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
        ]
      }
      question_accepted_answers: {
        Row: {
          answer_text: string
          created_at: string
          id: string
          is_primary: boolean
          normalization_policy: string
          normalized_answer: string
          question_revision_id: string
          sort_order: number
        }
        Insert: {
          answer_text: string
          created_at?: string
          id?: string
          is_primary?: boolean
          normalization_policy?: string
          normalized_answer: string
          question_revision_id: string
          sort_order?: number
        }
        Update: {
          answer_text?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          normalization_policy?: string
          normalized_answer?: string
          question_revision_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_accepted_answers_question_revision_id_fkey"
            columns: ["question_revision_id"]
            isOneToOne: false
            referencedRelation: "question_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_bank_capability_grants: {
        Row: {
          capability: string
          granted_at: string
          granted_by: string | null
          id: string
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          scope_id: string | null
          scope_type: string
          user_id: string
        }
        Insert: {
          capability: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          reason: string
          revoked_at?: string | null
          revoked_by?: string | null
          scope_id?: string | null
          scope_type?: string
          user_id: string
        }
        Update: {
          capability?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          reason?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scope_id?: string | null
          scope_type?: string
          user_id?: string
        }
        Relationships: []
      }
      question_bank_rpc_idempotency: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          idempotency_key: string
          request_fingerprint: string
          result: Json
          rpc_name: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          request_fingerprint: string
          result: Json
          rpc_name: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          request_fingerprint?: string
          result?: Json
          rpc_name?: string
        }
        Relationships: []
      }
      question_bank_runtime_config: {
        Row: {
          attempt_pin_mode: string
          enabled_at: string | null
          enabled_by: string | null
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attempt_pin_mode?: string
          enabled_at?: string | null
          enabled_by?: string | null
          id: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attempt_pin_mode?: string
          enabled_at?: string | null
          enabled_by?: string | null
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      question_media: {
        Row: {
          alt_text_ar: string
          caption: string | null
          created_at: string
          created_by: string | null
          file_size: number | null
          id: string
          media_code: string
          mime_type: string
          question_revision_id: string
          requires_media: boolean
          sha256: string | null
          sort_order: number
          storage_path: string
        }
        Insert: {
          alt_text_ar: string
          caption?: string | null
          created_at?: string
          created_by?: string | null
          file_size?: number | null
          id?: string
          media_code: string
          mime_type: string
          question_revision_id: string
          requires_media?: boolean
          sha256?: string | null
          sort_order?: number
          storage_path: string
        }
        Update: {
          alt_text_ar?: string
          caption?: string | null
          created_at?: string
          created_by?: string | null
          file_size?: number | null
          id?: string
          media_code?: string
          mime_type?: string
          question_revision_id?: string
          requires_media?: boolean
          sha256?: string | null
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_media_question_revision_id_fkey"
            columns: ["question_revision_id"]
            isOneToOne: false
            referencedRelation: "question_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_options: {
        Row: {
          body: string
          created_at: string
          id: string
          is_correct: boolean
          option_code: string
          question_revision_id: string
          sort_order: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_correct?: boolean
          option_code: string
          question_revision_id: string
          sort_order?: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_correct?: boolean
          option_code?: string
          question_revision_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_revision_id_fkey"
            columns: ["question_revision_id"]
            isOneToOne: false
            referencedRelation: "question_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_response_reviews: {
        Row: {
          action_id: string
          assigned_grader_id: string | null
          created_at: string
          exam_answer_id: string | null
          feedback: string | null
          grader_id: string
          id: string
          idempotency_key: string
          is_final: boolean
          practice_response_id: string | null
          previous_score: number | null
          reason: string | null
          score_awarded: number
        }
        Insert: {
          action_id?: string
          assigned_grader_id?: string | null
          created_at?: string
          exam_answer_id?: string | null
          feedback?: string | null
          grader_id: string
          id?: string
          idempotency_key: string
          is_final?: boolean
          practice_response_id?: string | null
          previous_score?: number | null
          reason?: string | null
          score_awarded: number
        }
        Update: {
          action_id?: string
          assigned_grader_id?: string | null
          created_at?: string
          exam_answer_id?: string | null
          feedback?: string | null
          grader_id?: string
          id?: string
          idempotency_key?: string
          is_final?: boolean
          practice_response_id?: string | null
          previous_score?: number | null
          reason?: string | null
          score_awarded?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_response_reviews_exam_answer_id_fkey"
            columns: ["exam_answer_id"]
            isOneToOne: false
            referencedRelation: "exam_session_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_response_reviews_practice_response_id_fkey"
            columns: ["practice_response_id"]
            isOneToOne: false
            referencedRelation: "practice_attempt_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      question_revisions: {
        Row: {
          allow_partial: boolean
          backfill_version: string | null
          created_at: string
          created_by: string | null
          educational_label: string | null
          grading_mode: string | null
          id: string
          interaction_type: string
          manual_grading_required: boolean
          max_score: number
          payload_hash: string | null
          payload_hash_version: string
          published_at: string | null
          published_by: string | null
          question_id: string
          question_text: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requires_media: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          revision_number: number
          source_payload_hash: string | null
          status: string
          stimulus_text: string | null
          superseded_at: string | null
        }
        Insert: {
          allow_partial?: boolean
          backfill_version?: string | null
          created_at?: string
          created_by?: string | null
          educational_label?: string | null
          grading_mode?: string | null
          id?: string
          interaction_type: string
          manual_grading_required?: boolean
          max_score?: number
          payload_hash?: string | null
          payload_hash_version?: string
          published_at?: string | null
          published_by?: string | null
          question_id: string
          question_text: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requires_media?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_number: number
          source_payload_hash?: string | null
          status: string
          stimulus_text?: string | null
          superseded_at?: string | null
        }
        Update: {
          allow_partial?: boolean
          backfill_version?: string | null
          created_at?: string
          created_by?: string | null
          educational_label?: string | null
          grading_mode?: string | null
          id?: string
          interaction_type?: string
          manual_grading_required?: boolean
          max_score?: number
          payload_hash?: string | null
          payload_hash_version?: string
          published_at?: string | null
          published_by?: string | null
          question_id?: string
          question_text?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requires_media?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_number?: number
          source_payload_hash?: string | null
          status?: string
          stimulus_text?: string | null
          superseded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_revisions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_solution_steps: {
        Row: {
          body: string
          id: string
          solution_id: string
          sort_order: number
          step_code: string
        }
        Insert: {
          body: string
          id?: string
          solution_id: string
          sort_order: number
          step_code: string
        }
        Update: {
          body?: string
          id?: string
          solution_id?: string
          sort_order?: number
          step_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_solution_steps_solution_id_fkey"
            columns: ["solution_id"]
            isOneToOne: false
            referencedRelation: "question_solutions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_solutions: {
        Row: {
          common_mistakes: string | null
          created_at: string
          created_by: string | null
          explanation: string | null
          hint: string | null
          id: string
          model_answer: string | null
          question_revision_id: string
          reveal_policy: string
          simplified_rubric: string | null
          solution_code: string
          solution_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          common_mistakes?: string | null
          created_at?: string
          created_by?: string | null
          explanation?: string | null
          hint?: string | null
          id?: string
          model_answer?: string | null
          question_revision_id: string
          reveal_policy?: string
          simplified_rubric?: string | null
          solution_code: string
          solution_type?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          common_mistakes?: string | null
          created_at?: string
          created_by?: string | null
          explanation?: string | null
          hint?: string | null
          id?: string
          model_answer?: string | null
          question_revision_id?: string
          reveal_policy?: string
          simplified_rubric?: string | null
          solution_code?: string
          solution_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_solutions_question_revision_id_fkey"
            columns: ["question_revision_id"]
            isOneToOne: false
            referencedRelation: "question_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_targets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          lesson_id: string | null
          question_id: string
          subject_id: string | null
          target_type: string
          unit_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          lesson_id?: string | null
          question_id: string
          subject_id?: string | null
          target_type: string
          unit_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          lesson_id?: string | null
          question_id?: string
          subject_id?: string | null
          target_type?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_targets_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_targets_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_targets_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_targets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          code: string | null
          correct_index: number
          created_at: string
          created_by: string | null
          current_published_revision_id: string | null
          explanation: string | null
          id: string
          lesson_id: string | null
          options: Json
          question_text: string
          question_type: string | null
          semester: number | null
          sort_order: number
          subject_id: string | null
          unit: string | null
          year: number | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          code?: string | null
          correct_index: number
          created_at?: string
          created_by?: string | null
          current_published_revision_id?: string | null
          explanation?: string | null
          id?: string
          lesson_id?: string | null
          options: Json
          question_text: string
          question_type?: string | null
          semester?: number | null
          sort_order?: number
          subject_id?: string | null
          unit?: string | null
          year?: number | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          code?: string | null
          correct_index?: number
          created_at?: string
          created_by?: string | null
          current_published_revision_id?: string | null
          explanation?: string | null
          id?: string
          lesson_id?: string | null
          options?: Json
          question_text?: string
          question_type?: string | null
          semester?: number | null
          sort_order?: number
          subject_id?: string | null
          unit?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_current_published_revision_fk"
            columns: ["id", "current_published_revision_id"]
            isOneToOne: false
            referencedRelation: "question_revisions"
            referencedColumns: ["question_id", "id"]
          },
          {
            foreignKeyName: "questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string
          discount_percent: number
          id: string
          referred_id: string
          referred_reward_applied: boolean
          referrer_id: string
          referrer_reward_applied: boolean
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          discount_percent?: number
          id?: string
          referred_id: string
          referred_reward_applied?: boolean
          referrer_id: string
          referrer_reward_applied?: boolean
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          discount_percent?: number
          id?: string
          referred_id?: string
          referred_reward_applied?: boolean
          referrer_id?: string
          referrer_reward_applied?: boolean
          status?: string
        }
        Relationships: []
      }
      storage_operations: {
        Row: {
          actor_id: string
          attempt_count: number
          completed_at: string | null
          created_at: string
          expected_hash: string | null
          failure_code: string | null
          id: string
          idempotency_key: string | null
          operation_type: string
          parent_operation_id: string | null
          resource_id: string
          resource_version_id: string
          retry_number: number
          source_path: string
          status: string
          target_path: string
          upload_session_id: string | null
        }
        Insert: {
          actor_id: string
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          expected_hash?: string | null
          failure_code?: string | null
          id?: string
          idempotency_key?: string | null
          operation_type: string
          parent_operation_id?: string | null
          resource_id: string
          resource_version_id: string
          retry_number?: number
          source_path: string
          status?: string
          target_path: string
          upload_session_id?: string | null
        }
        Update: {
          actor_id?: string
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          expected_hash?: string | null
          failure_code?: string | null
          id?: string
          idempotency_key?: string | null
          operation_type?: string
          parent_operation_id?: string | null
          resource_id?: string
          resource_version_id?: string
          retry_number?: number
          source_path?: string
          status?: string
          target_path?: string
          upload_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storage_operations_parent_operation_id_fkey"
            columns: ["parent_operation_id"]
            isOneToOne: false
            referencedRelation: "storage_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_operations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "lesson_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_operations_resource_version_id_fkey"
            columns: ["resource_version_id"]
            isOneToOne: false
            referencedRelation: "lesson_resource_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_operations_upload_session_id_fkey"
            columns: ["upload_session_id"]
            isOneToOne: false
            referencedRelation: "lesson_resource_upload_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_operations_version_composite_fk"
            columns: ["resource_version_id", "resource_id"]
            isOneToOne: false
            referencedRelation: "lesson_resource_versions"
            referencedColumns: ["id", "resource_id"]
          },
        ]
      }
      student_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      student_points: {
        Row: {
          created_at: string
          id: string
          points: number
          reason: string
          reference_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          points?: number
          reason: string
          reference_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          points?: number
          reason?: string
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          code: string | null
          color: string | null
          created_at: string
          curriculum_track_id: string | null
          grade_id: string
          icon: string | null
          id: string
          lessons_count: number | null
          name: string
          semester: number | null
          slug: string
          sort_order: number
        }
        Insert: {
          code?: string | null
          color?: string | null
          created_at?: string
          curriculum_track_id?: string | null
          grade_id: string
          icon?: string | null
          id?: string
          lessons_count?: number | null
          name: string
          semester?: number | null
          slug: string
          sort_order?: number
        }
        Update: {
          code?: string | null
          color?: string | null
          created_at?: string
          curriculum_track_id?: string | null
          grade_id?: string
          icon?: string | null
          id?: string
          lessons_count?: number | null
          name?: string
          semester?: number | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "subjects_curriculum_track_id_fkey"
            columns: ["curriculum_track_id"]
            isOneToOne: false
            referencedRelation: "curriculum_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          currency: string
          duration_months: number
          duration_type: string
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          currency?: string
          duration_months?: number
          duration_type: string
          id?: string
          is_active?: boolean
          name: string
          price: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          currency?: string
          duration_months?: number
          duration_type?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          expires_at: string | null
          grade_id: string | null
          id: string
          plan_id: string | null
          refund_reason: string | null
          refunded_at: string | null
          refunded_by: string | null
          semester: number | null
          starts_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          expires_at?: string | null
          grade_id?: string | null
          id?: string
          plan_id?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          semester?: number | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          expires_at?: string | null
          grade_id?: string | null
          id?: string
          plan_id?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          semester?: number | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      unit_practice_attempts: {
        Row: {
          answered: number
          answers: Json
          correct: number
          created_at: string
          id: string
          per_question: Json
          score: number
          subject_id: string
          total: number
          unit_id: string
          user_id: string
        }
        Insert: {
          answered: number
          answers?: Json
          correct: number
          created_at?: string
          id?: string
          per_question?: Json
          score: number
          subject_id: string
          total: number
          unit_id: string
          user_id: string
        }
        Update: {
          answered?: number
          answers?: Json
          correct?: number
          created_at?: string
          id?: string
          per_question?: Json
          score?: number
          subject_id?: string
          total?: number
          unit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_practice_attempts_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_practice_attempts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          is_free: boolean
          semester: number | null
          sort_order: number
          subject_id: string
          title: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_free?: boolean
          semester?: number | null
          sort_order?: number
          subject_id: string
          title: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_free?: boolean
          semester?: number | null
          sort_order?: number
          subject_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progress: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string
          id: string
          lesson_id: string
          quiz_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id: string
          quiz_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id?: string
          quiz_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_accounts: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_topup_requests: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string
          credited_transaction_id: string | null
          currency: string
          fraud_flags: Json
          id: string
          payment_date: string | null
          payment_method_id: string
          receipt_hash: string | null
          receipt_path: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_account: string | null
          sender_name: string | null
          status: string
          transaction_reference: string | null
          updated_at: string
          user_id: string
          wallet_account_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string
          credited_transaction_id?: string | null
          currency?: string
          fraud_flags?: Json
          id?: string
          payment_date?: string | null
          payment_method_id: string
          receipt_hash?: string | null
          receipt_path: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_account?: string | null
          sender_name?: string | null
          status?: string
          transaction_reference?: string | null
          updated_at?: string
          user_id: string
          wallet_account_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string
          credited_transaction_id?: string | null
          currency?: string
          fraud_flags?: Json
          id?: string
          payment_date?: string | null
          payment_method_id?: string
          receipt_hash?: string | null
          receipt_path?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_account?: string | null
          sender_name?: string | null
          status?: string
          transaction_reference?: string | null
          updated_at?: string
          user_id?: string
          wallet_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_topup_requests_credited_transaction_id_fkey"
            columns: ["credited_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_topup_requests_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_topup_requests_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "wallet_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          direction: string
          id: string
          metadata: Json
          reference_id: string | null
          reference_type: string | null
          reverses_transaction_id: string | null
          type: string
          user_id: string
          wallet_account_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          direction: string
          id?: string
          metadata?: Json
          reference_id?: string | null
          reference_type?: string | null
          reverses_transaction_id?: string | null
          type: string
          user_id: string
          wallet_account_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          direction?: string
          id?: string
          metadata?: Json
          reference_id?: string | null
          reference_type?: string | null
          reverses_transaction_id?: string | null
          type?: string
          user_id?: string
          wallet_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_reverses_transaction_id_fkey"
            columns: ["reverses_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "wallet_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_schedule: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          period_number: number
          subject_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          period_number: number
          subject_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          period_number?: number
          subject_name?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_question_responses_unified: {
        Row: {
          attempt_id: string | null
          created_at: string | null
          final_score: number | null
          grading_status: string | null
          logical_question_id: string | null
          max_score: number | null
          question_revision_id: string | null
          response_id: string | null
          response_text: string | null
          selected_option_code: string | null
          surface_type: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _assert_html_admin_caller: { Args: never; Returns: undefined }
      _assert_html_content_staff_caller: { Args: never; Returns: undefined }
      _qb_assert_revision_payload_hash: {
        Args: {
          p_payload_hash: string
          p_payload_hash_version: string
          p_revision_id: string
        }
        Returns: undefined
      }
      _qb_build_revision_canonical_jcs: {
        Args: { p_revision_id: string }
        Returns: string
      }
      _qb_compute_revision_payload_hash: {
        Args: { p_revision_id: string }
        Returns: string
      }
      _qb_json_num: { Args: { p: number }; Returns: string }
      _qb_json_str: { Args: { p: string }; Returns: string }
      _qb_validate_revision_for_publish: {
        Args: { p_revision_id: string }
        Returns: undefined
      }
      admin_adjust_wallet: {
        Args: {
          _amount: number
          _direction: string
          _idempotency_key?: string
          _reason: string
          _user_id: string
        }
        Returns: Json
      }
      admin_get_lesson_media_urls: {
        Args: { _lesson_id: string }
        Returns: {
          content_pdf_url: string
          video_url: string
        }[]
      }
      admin_refund_subscription: {
        Args: {
          _amount?: number
          _cancel_subscription?: boolean
          _idempotency_key?: string
          _reason?: string
          _subscription_id: string
        }
        Returns: Json
      }
      answer_exam_question: {
        Args: {
          _question_id: string
          _selected_index: number
          _session_id: string
        }
        Returns: Json
      }
      approve_payment_request: {
        Args: { _admin_notes?: string; _request_id: string }
        Returns: Json
      }
      approve_resource: {
        Args: {
          p_expected_lock_version?: number
          p_resource_id: string
          p_version_id: string
        }
        Returns: undefined
      }
      approve_wallet_topup_request: {
        Args: { p_admin_notes?: string; p_request_id: string }
        Returns: Json
      }
      can_access_lesson: { Args: { _lesson_id: string }; Returns: boolean }
      can_access_subject: { Args: { _subject_id: string }; Returns: boolean }
      can_delete_draft_question: {
        Args: { p_user_id?: string }
        Returns: boolean
      }
      can_edit_question_bank: { Args: { p_user_id?: string }; Returns: boolean }
      can_grade_manual_response: {
        Args: { p_user_id?: string }
        Returns: boolean
      }
      can_publish_question_revision: {
        Args: { p_user_id?: string }
        Returns: boolean
      }
      can_read_hidden_solutions: {
        Args: { p_user_id?: string }
        Returns: boolean
      }
      can_review_question_content: {
        Args: { p_user_id?: string }
        Returns: boolean
      }
      check_lesson_question: {
        Args: { _question_id: string; _selected_index: number }
        Returns: Json
      }
      claim_idempotency_key: {
        Args: { p_key: string; p_operation: string }
        Returns: {
          claimed: boolean
          current_status: string
          ledger_id: string
          previous_error: Json
          previous_result: Json
        }[]
      }
      complete_idempotency_key: {
        Args: { p_ledger_id: string; p_result: Json }
        Returns: undefined
      }
      compute_and_set_revision_payload_hash: {
        Args: { p_revision_id: string }
        Returns: Json
      }
      create_exam_session_with_snapshot: {
        Args: { p_template_id: string }
        Returns: Json
      }
      create_practice_attempt_with_snapshot: {
        Args: { p_params: Json }
        Returns: Json
      }
      create_wallet_topup_request: {
        Args: {
          p_amount: number
          p_currency?: string
          p_payment_date?: string
          p_payment_method_id: string
          p_receipt_hash?: string
          p_receipt_path: string
          p_sender_account?: string
          p_sender_name?: string
          p_transaction_reference?: string
        }
        Returns: Json
      }
      create_wallet_transaction: {
        Args: {
          _amount: number
          _currency?: string
          _description?: string
          _direction: string
          _metadata?: Json
          _reference_id?: string
          _reference_type?: string
          _type: string
          _user_id: string
        }
        Returns: Json
      }
      delete_draft_question: {
        Args: {
          p_idempotency_key: string
          p_question_id: string
          p_reason: string
        }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_wallet_account: {
        Args: { _currency?: string; _user_id: string }
        Returns: string
      }
      fail_idempotency_key: {
        Args: { p_error: Json; p_ledger_id: string }
        Returns: undefined
      }
      fetch_published_lesson_resources: {
        Args: { p_lesson_id: string }
        Returns: {
          resource_id: string
          resource_type: string
          sort_order: number
          title: string
          version_id: string
        }[]
      }
      get_dashboard_stats: {
        Args: never
        Returns: {
          active_subscriptions: number
          approved_payments: number
          expired_subscriptions: number
          pending_payments: number
          pending_subscriptions: number
          rejected_payments: number
          total_grades: number
          total_lessons: number
          total_questions: number
          total_revenue: number
          total_students: number
          total_subjects: number
        }[]
      }
      get_exam_session_state: { Args: { _session_id: string }; Returns: Json }
      get_lesson_full_content: { Args: { _lesson_id: string }; Returns: Json }
      get_lesson_quiz_questions: {
        Args: { _lesson_id: string }
        Returns: {
          id: string
          options: Json
          question_text: string
          question_type: string
          sort_order: number
        }[]
      }
      get_lesson_safe_extras: {
        Args: { _lesson_id: string }
        Returns: {
          external_video_url: string
          has_content_pdf: boolean
          has_video: boolean
          id: string
          title: string
        }[]
      }
      get_report_governorate_data: {
        Args: { _grade_id?: string; _months_back?: number }
        Returns: {
          governorate: string
          student_count: number
        }[]
      }
      get_report_grade_content: {
        Args: never
        Returns: {
          grade_name: string
          lessons_count: number
          subjects_count: number
        }[]
      }
      get_report_monthly_data: {
        Args: { _grade_id?: string; _months_back?: number }
        Returns: {
          new_students: number
          revenue: number
          year_month: string
        }[]
      }
      get_report_school_data: {
        Args: { _grade_id?: string; _limit?: number; _months_back?: number }
        Returns: {
          governorate: string
          school_name: string
          student_count: number
        }[]
      }
      get_report_subscription_status: {
        Args: { _grade_id?: string; _months_back?: number }
        Returns: {
          status: string
          sub_count: number
        }[]
      }
      get_user_email: { Args: { _user_id: string }; Returns: string }
      get_user_total_points: { Args: { _user_id: string }; Returns: number }
      get_valid_server_validation: {
        Args: { p_resource_version_id: string; p_upload_session_id: string }
        Returns: {
          is_valid: boolean
          package_hash: string
          resource_version_id: string
          storage_object_path: string
          upload_session_id: string
          valid_until: string
          validation_id: string
        }[]
      }
      grade_lesson_quiz: {
        Args: { _answers: Json; _lesson_id: string }
        Returns: Json
      }
      grade_unit_practice: {
        Args: { _answers: Json; _unit_id: string }
        Returns: Json
      }
      grant_question_bank_capability: {
        Args: {
          p_capability: string
          p_reason: string
          p_scope_id: string
          p_scope_type: string
          p_user_id: string
        }
        Returns: Json
      }
      has_active_subscription: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_content_feature_enabled: { Args: { p_key: string }; Returns: boolean }
      is_content_staff: { Args: { _user_id: string }; Returns: boolean }
      is_first_lesson_in_subject: {
        Args: { _lesson_id: string }
        Returns: boolean
      }
      is_full_admin: { Args: { _user_id: string }; Returns: boolean }
      list_published_html_resources_for_lesson: {
        Args: { p_lesson_id: string }
        Returns: {
          resource_code: string
          resource_id: string
          resource_type: string
          sort_order: number
          title: string
          version_id: string
          version_number: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_resource_code: { Args: { p_code: string }; Returns: string }
      pay_subscription_from_wallet: {
        Args: {
          _grade_id?: string
          _idempotency_key?: string
          _plan_id: string
          _semester?: number
        }
        Returns: Json
      }
      publish_question_revision: {
        Args: {
          p_expected_current_revision_id: string
          p_idempotency_key: string
          p_question_id: string
          p_revision_id: string
        }
        Returns: Json
      }
      qb_has_capability: {
        Args: { p_capability: string; p_user_id: string }
        Returns: boolean
      }
      qb_i_have_capability: { Args: { p_capability: string }; Returns: boolean }
      qb_sync_question_legacy: {
        Args: { _question_id: string }
        Returns: undefined
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_server_validation: {
        Args: {
          p_findings: Json
          p_is_valid: boolean
          p_package_hash: string
          p_resource_version_id: string
          p_scanner_version: string
          p_storage_object_path: string
          p_storage_object_version?: string
          p_upload_session_id: string
          p_valid_until: string
        }
        Returns: string
      }
      record_successful_resource_publication: {
        Args: {
          p_expected_lock_version: number
          p_resource_id: string
          p_storage_operation_id: string
          p_upload_session_id?: string
          p_version_id: string
        }
        Returns: undefined
      }
      refresh_dashboard_stats: { Args: never; Returns: undefined }
      reject_payment_request: {
        Args: { _admin_notes?: string; _request_id: string }
        Returns: Json
      }
      reject_resource: {
        Args: {
          p_expected_lock_version?: number
          p_reason: string
          p_resource_id: string
          p_version_id: string
        }
        Returns: undefined
      }
      reject_wallet_topup_request: {
        Args: { p_rejection_reason: string; p_request_id: string }
        Returns: Json
      }
      resolve_promotion_binding: {
        Args: { p_resource_version_id?: string; p_upload_session_id?: string }
        Returns: {
          expected_hash: string
          lock_version: number
          published_target_path: string
          resource_code: string
          resource_id: string
          staging_path: string
          upload_session_id: string
          valid_validation_id: string
          version_id: string
          version_number: number
        }[]
      }
      resolve_student_resource_binding: {
        Args: { p_resource_id: string }
        Returns: {
          lesson_id: string
          published_version_number: number
          resource_id: string
          resource_type: string
          title: string
          version_id: string
        }[]
      }
      resolve_upload_session: {
        Args: { p_upload_session_id: string }
        Returns: {
          actor_id: string
          batch_id: string
          expected_package_hash: string
          expires_at: string
          is_expired: boolean
          resource_code: string
          resource_id: string
          session_id: string
          staging_path: string
          status: string
        }[]
      }
      retarget_question: {
        Args: { p_question_id: string; p_reason: string; p_targets: Json }
        Returns: Json
      }
      revoke_question_bank_capability: {
        Args: { p_grant_id: string; p_reason: string }
        Returns: Json
      }
      rollback_resource: {
        Args: {
          p_expected_lock_version: number
          p_resource_id: string
          p_target_version_id: string
        }
        Returns: undefined
      }
      set_question_bank_attempt_pin_mode: {
        Args: { p_attempt_pin_mode: string; p_reason: string }
        Returns: Json
      }
      start_exam_session: { Args: { _template_id: string }; Returns: string }
      subject_matches_track: {
        Args: { _subject_id: string; _track_id: string }
        Returns: boolean
      }
      submit_exam_session: { Args: { _session_id: string }; Returns: Json }
      submit_resource_for_review: {
        Args: { p_expected_lock_version?: number; p_resource_id: string }
        Returns: undefined
      }
      submit_unit_practice_attempt: {
        Args: { _answers: Json; _unit_id: string }
        Returns: Json
      }
      unpublish_resource: {
        Args: { p_expected_lock_version?: number; p_resource_id: string }
        Returns: undefined
      }
      user_can_access_subject_curriculum: {
        Args: { _subject_id: string }
        Returns: boolean
      }
      validate_staging_path: { Args: { p_path: string }; Returns: boolean }
      write_audit_log: {
        Args: {
          _action: string
          _metadata?: Json
          _target_id: string
          _target_type: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "content_manager"
      exam_mode: "training" | "strict" | "ministry"
      exam_session_status: "in_progress" | "submitted" | "expired"
      lesson_resource_type:
        | "video"
        | "mindmap"
        | "experiment"
        | "pdf"
        | "link"
        | "html"
        | "interactive_html"
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
      app_role: ["admin", "moderator", "user", "content_manager"],
      exam_mode: ["training", "strict", "ministry"],
      exam_session_status: ["in_progress", "submitted", "expired"],
      lesson_resource_type: [
        "video",
        "mindmap",
        "experiment",
        "pdf",
        "link",
        "html",
        "interactive_html",
      ],
    },
  },
} as const
