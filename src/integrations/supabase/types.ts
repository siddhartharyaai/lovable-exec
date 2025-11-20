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
      audit_log: {
        Row: {
          action: string
          context: Json | null
          created_at: string
          id: string
          intent: string | null
          reason: string | null
          result: string | null
          tool_args: Json | null
          tool_used: string | null
          trace_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          context?: Json | null
          created_at?: string
          id?: string
          intent?: string | null
          reason?: string | null
          result?: string | null
          tool_args?: Json | null
          tool_used?: string | null
          trace_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          context?: Json | null
          created_at?: string
          id?: string
          intent?: string | null
          reason?: string | null
          result?: string | null
          tool_args?: Json | null
          tool_used?: string | null
          trace_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_notifications: {
        Row: {
          created_at: string
          event_id: string
          event_start_time: string
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          event_start_time: string
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          event_start_time?: string
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_drafts: {
        Row: {
          body: string
          created_at: string
          id: string
          message_id: string | null
          sent_at: string | null
          status: string
          subject: string | null
          to_email: string | null
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          message_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          message_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guidelines: {
        Row: {
          action: string
          condition: Json
          created_at: string
          description: string | null
          enabled: boolean | null
          id: string
          name: string
          priority: number | null
          updated_at: string
        }
        Insert: {
          action: string
          condition: Json
          created_at?: string
          description?: string | null
          enabled?: boolean | null
          id?: string
          name: string
          priority?: number | null
          updated_at?: string
        }
        Update: {
          action?: string
          condition?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean | null
          id?: string
          name?: string
          priority?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      interaction_feedback: {
        Row: {
          ai_response: string
          created_at: string
          failure_reason: string | null
          id: string
          interaction_id: string
          reflection_analysis: Json | null
          success_score: number | null
          tools_used: string[] | null
          user_feedback: string | null
          user_id: string
          user_message: string
        }
        Insert: {
          ai_response: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          interaction_id: string
          reflection_analysis?: Json | null
          success_score?: number | null
          tools_used?: string[] | null
          user_feedback?: string | null
          user_id: string
          user_message: string
        }
        Update: {
          ai_response?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          interaction_id?: string
          reflection_analysis?: Json | null
          success_score?: number | null
          tools_used?: string[] | null
          user_feedback?: string | null
          user_id?: string
          user_message?: string
        }
        Relationships: []
      }
      learned_patterns: {
        Row: {
          context: Json | null
          created_at: string
          frequency: number | null
          id: string
          is_active: boolean | null
          pattern_description: string
          pattern_type: string
          prompt_rule: string | null
          updated_at: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          frequency?: number | null
          id?: string
          is_active?: boolean | null
          pattern_description: string
          pattern_type: string
          prompt_rule?: string | null
          updated_at?: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          frequency?: number | null
          id?: string
          is_active?: boolean | null
          pattern_description?: string
          pattern_type?: string
          prompt_rule?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      logs: {
        Row: {
          created_at: string
          id: string
          payload: Json
          trace_id: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          trace_id: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          trace_id?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          dir: Database["public"]["Enums"]["message_direction"]
          id: string
          media_url: string | null
          parsed_intent: Json | null
          provider_sid: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dir: Database["public"]["Enums"]["message_direction"]
          id?: string
          media_url?: string | null
          parsed_intent?: Json | null
          provider_sid?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dir?: Database["public"]["Enums"]["message_direction"]
          id?: string
          media_url?: string | null
          parsed_intent?: Json | null
          provider_sid?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          provider: string
          refresh_token: string | null
          scopes: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          provider?: string
          refresh_token?: string | null
          scopes?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          provider?: string
          refresh_token?: string | null
          scopes?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          created_at: string
          due_ts: string
          id: string
          last_attempt_ts: string | null
          origin_msg_id: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_ts: string
          id?: string
          last_attempt_ts?: string | null
          origin_msg_id?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_ts?: string
          id?: string
          last_attempt_ts?: string | null
          origin_msg_id?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_origin_msg_id_fkey"
            columns: ["origin_msg_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_state: {
        Row: {
          clarify_sent_at: string | null
          confirmation_pending: Json | null
          contacts_search_name: string | null
          contacts_search_results: Json | null
          contacts_search_timestamp: string | null
          context: Json | null
          current_topic: string | null
          drive_search_results: Json | null
          drive_search_timestamp: string | null
          journey_state: Json | null
          journey_step: number | null
          last_doc: Json | null
          last_doc_summary: string | null
          last_email_recipient: Json | null
          last_upload_ts: string | null
          last_uploaded_doc_id: string | null
          last_uploaded_doc_name: string | null
          pending_intent: Json | null
          pending_slots: Json | null
          recent_actions: Json | null
          updated_at: string | null
          user_id: string
          waiting_for: string[] | null
        }
        Insert: {
          clarify_sent_at?: string | null
          confirmation_pending?: Json | null
          contacts_search_name?: string | null
          contacts_search_results?: Json | null
          contacts_search_timestamp?: string | null
          context?: Json | null
          current_topic?: string | null
          drive_search_results?: Json | null
          drive_search_timestamp?: string | null
          journey_state?: Json | null
          journey_step?: number | null
          last_doc?: Json | null
          last_doc_summary?: string | null
          last_email_recipient?: Json | null
          last_upload_ts?: string | null
          last_uploaded_doc_id?: string | null
          last_uploaded_doc_name?: string | null
          pending_intent?: Json | null
          pending_slots?: Json | null
          recent_actions?: Json | null
          updated_at?: string | null
          user_id: string
          waiting_for?: string[] | null
        }
        Update: {
          clarify_sent_at?: string | null
          confirmation_pending?: Json | null
          contacts_search_name?: string | null
          contacts_search_results?: Json | null
          contacts_search_timestamp?: string | null
          context?: Json | null
          current_topic?: string | null
          drive_search_results?: Json | null
          drive_search_timestamp?: string | null
          journey_state?: Json | null
          journey_step?: number | null
          last_doc?: Json | null
          last_doc_summary?: string | null
          last_email_recipient?: Json | null
          last_upload_ts?: string | null
          last_uploaded_doc_id?: string | null
          last_uploaded_doc_name?: string | null
          pending_intent?: Json | null
          pending_slots?: Json | null
          recent_actions?: Json | null
          updated_at?: string | null
          user_id?: string
          waiting_for?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "session_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_documents: {
        Row: {
          content_text: string
          created_at: string
          filename: string
          id: string
          mime_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_text: string
          created_at?: string
          filename: string
          id?: string
          mime_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_text?: string
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_memories: {
        Row: {
          category: string
          content: string
          created_at: string | null
          id: string
          source: string
          user_id: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          id?: string
          source: string
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_memories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          confidence_score: number | null
          created_at: string
          id: string
          preference_type: string
          preference_value: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          preference_type: string
          preference_value: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          preference_type?: string
          preference_value?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          birthday_reminders_enabled: boolean
          city: string | null
          created_at: string
          daily_briefing_enabled: boolean
          email: string | null
          id: string
          name: string | null
          phone: string
          primary_task_list_id: string | null
          tz: string
          updated_at: string
        }
        Insert: {
          birthday_reminders_enabled?: boolean
          city?: string | null
          created_at?: string
          daily_briefing_enabled?: boolean
          email?: string | null
          id?: string
          name?: string | null
          phone: string
          primary_task_list_id?: string | null
          tz?: string
          updated_at?: string
        }
        Update: {
          birthday_reminders_enabled?: boolean
          city?: string | null
          created_at?: string
          daily_briefing_enabled?: boolean
          email?: string | null
          id?: string
          name?: string | null
          phone?: string
          primary_task_list_id?: string | null
          tz?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      message_direction: "in" | "out"
      reminder_status: "pending" | "sent" | "failed"
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
      message_direction: ["in", "out"],
      reminder_status: ["pending", "sent", "failed"],
    },
  },
} as const
