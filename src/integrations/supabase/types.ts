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
    PostgrestVersion: "14.5"
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
          created_at: string
          id: string
          is_correct: boolean | null
          points_awarded: number
          question_id: string
          selected_index: number | null
          session_id: string
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean | null
          points_awarded?: number
          question_id: string
          selected_index?: number | null
          session_id: string
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean | null
          points_awarded?: number
          question_id?: string
          selected_index?: number | null
          session_id?: string
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
            foreignKeyName: "exam_session_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sessions: {
        Row: {
          answered_questions: number
          correct_answers: number
          created_at: string
          expires_at: string | null
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
          correct_answers?: number
          created_at?: string
          expires_at?: string | null
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
          correct_answers?: number
          created_at?: string
          expires_at?: string | null
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
      lesson_resources: {
        Row: {
          created_at: string
          description: string | null
          id: string
          lesson_id: string
          resource_type: Database["public"]["Enums"]["lesson_resource_type"]
          sort_order: number
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          lesson_id: string
          resource_type: Database["public"]["Enums"]["lesson_resource_type"]
          sort_order?: number
          title: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          lesson_id?: string
          resource_type?: Database["public"]["Enums"]["lesson_resource_type"]
          sort_order?: number
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_resources_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
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
          created_at: string
          details: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          type: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          created_at?: string
          details?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          type: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          created_at?: string
          details?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          type?: string
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
      questions: {
        Row: {
          correct_index: number
          created_at: string
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
          correct_index: number
          created_at?: string
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
          correct_index?: number
          created_at?: string
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
      [_ in never]: never
    }
    Functions: {
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
      can_access_lesson: { Args: { _lesson_id: string }; Returns: boolean }
      can_access_subject: { Args: { _subject_id: string }; Returns: boolean }
      check_lesson_question: {
        Args: { _question_id: string; _selected_index: number }
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
      grade_lesson_quiz: {
        Args: { _answers: Json; _lesson_id: string }
        Returns: Json
      }
      grade_unit_practice: {
        Args: { _answers: Json; _unit_id: string }
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
      is_first_lesson_in_subject: {
        Args: { _lesson_id: string }
        Returns: boolean
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
      pay_subscription_from_wallet: {
        Args: {
          _grade_id?: string
          _idempotency_key?: string
          _plan_id: string
          _semester?: number
        }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      refresh_dashboard_stats: { Args: never; Returns: undefined }
      reject_payment_request: {
        Args: { _admin_notes?: string; _request_id: string }
        Returns: Json
      }
      start_exam_session: { Args: { _template_id: string }; Returns: string }
      subject_matches_track: {
        Args: { _subject_id: string; _track_id: string }
        Returns: boolean
      }
      submit_exam_session: { Args: { _session_id: string }; Returns: Json }
      submit_unit_practice_attempt: {
        Args: { _answers: Json; _unit_id: string }
        Returns: Json
      }
      user_can_access_subject_curriculum: {
        Args: { _subject_id: string }
        Returns: boolean
      }
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
      app_role: "admin" | "moderator" | "user"
      exam_mode: "training" | "strict" | "ministry"
      exam_session_status: "in_progress" | "submitted" | "expired"
      lesson_resource_type: "video" | "mindmap" | "experiment" | "pdf" | "link"
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
      app_role: ["admin", "moderator", "user"],
      exam_mode: ["training", "strict", "ministry"],
      exam_session_status: ["in_progress", "submitted", "expired"],
      lesson_resource_type: ["video", "mindmap", "experiment", "pdf", "link"],
    },
  },
} as const
