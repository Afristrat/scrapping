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
      llm_costs: {
        Row: {
          completion_tokens: number
          cost: number
          id: number
          model: string
          prompt_tokens: number
          task: Database["public"]["Enums"]["llm_task"]
          ts: string
          user_id: string
        }
        Insert: {
          completion_tokens?: number
          cost?: number
          id?: number
          model: string
          prompt_tokens?: number
          task: Database["public"]["Enums"]["llm_task"]
          ts?: string
          user_id: string
        }
        Update: {
          completion_tokens?: number
          cost?: number
          id?: number
          model?: string
          prompt_tokens?: number
          task?: Database["public"]["Enums"]["llm_task"]
          ts?: string
          user_id?: string
        }
        Relationships: []
      }
      logs: {
        Row: {
          action: string
          id: number
          payload: Json | null
          status: string | null
          ts: string
          user_id: string | null
        }
        Insert: {
          action: string
          id?: number
          payload?: Json | null
          status?: string | null
          ts?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          id?: number
          payload?: Json | null
          status?: string | null
          ts?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pending_minio_writes: {
        Row: {
          attempts: number
          content: string
          created_at: string
          id: string
          run_at: string
          topic_id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          content: string
          created_at?: string
          id?: string
          run_at: string
          topic_id: string
          user_id: string
        }
        Update: {
          attempts?: number
          content?: string
          created_at?: string
          id?: string
          run_at?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_minio_writes_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          cost: number
          model_used: string
          reasoning: string | null
          score: number
          scored_at: string
          signal_id: string
          user_id: string
        }
        Insert: {
          cost?: number
          model_used: string
          reasoning?: string | null
          score: number
          scored_at?: string
          signal_id: string
          user_id: string
        }
        Update: {
          cost?: number
          model_used?: string
          reasoning?: string | null
          score?: number
          scored_at?: string
          signal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scores_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_rubrics: {
        Row: {
          created_at: string
          criteria: Json
          description: string | null
          id: string
          is_default: boolean
          name: string
          prompt: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          prompt: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          prompt?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          active_rubric_id: string | null
          apify_config: Json
          arxiv_categories: string[]
          branding: Json
          daily_budget_usd: number
          language: string
          model_digest: string
          model_monitoring: string
          model_scoring: string
          model_scraping: string
          prompt_scoring: string
          reddit_subs: string[]
          score_concurrency: number
          source_priority: Json
          topic_seeds: string[]
          updated_at: string
          user_id: string
          x_queries: string[]
        }
        Insert: {
          active_rubric_id?: string | null
          apify_config?: Json
          arxiv_categories?: string[]
          branding?: Json
          daily_budget_usd?: number
          language?: string
          model_digest?: string
          model_monitoring?: string
          model_scoring?: string
          model_scraping?: string
          prompt_scoring?: string
          reddit_subs?: string[]
          score_concurrency?: number
          source_priority?: Json
          topic_seeds?: string[]
          updated_at?: string
          user_id: string
          x_queries?: string[]
        }
        Update: {
          active_rubric_id?: string | null
          apify_config?: Json
          arxiv_categories?: string[]
          branding?: Json
          daily_budget_usd?: number
          language?: string
          model_digest?: string
          model_monitoring?: string
          model_scoring?: string
          model_scraping?: string
          prompt_scoring?: string
          reddit_subs?: string[]
          score_concurrency?: number
          source_priority?: Json
          topic_seeds?: string[]
          updated_at?: string
          user_id?: string
          x_queries?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "settings_active_rubric_id_fkey"
            columns: ["active_rubric_id"]
            isOneToOne: false
            referencedRelation: "scoring_rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          external_id: string
          id: string
          raw_payload: Json
          scraped_at: string
          signal_date: string | null
          source: Database["public"]["Enums"]["signal_source"]
          title: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          external_id: string
          id?: string
          raw_payload: Json
          scraped_at?: string
          signal_date?: string | null
          source: Database["public"]["Enums"]["signal_source"]
          title?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          external_id?: string
          id?: string
          raw_payload?: Json
          scraped_at?: string
          signal_date?: string | null
          source?: Database["public"]["Enums"]["signal_source"]
          title?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      topic_runs: {
        Row: {
          id: string
          minio_appended: boolean
          run_at: string
          signal_count: number
          sources: Json
          top_signal_score: number | null
          top_signal_title: string | null
          topic_id: string
          user_id: string
        }
        Insert: {
          id?: string
          minio_appended?: boolean
          run_at?: string
          signal_count?: number
          sources?: Json
          top_signal_score?: number | null
          top_signal_title?: string | null
          topic_id: string
          user_id: string
        }
        Update: {
          id?: string
          minio_appended?: boolean
          run_at?: string
          signal_count?: number
          sources?: Json
          top_signal_score?: number | null
          top_signal_title?: string | null
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_runs_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_signals: {
        Row: {
          signal_id: string
          topic_id: string
          user_id: string
        }
        Insert: {
          signal_id: string
          topic_id: string
          user_id: string
        }
        Update: {
          signal_id?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_signals_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_signals_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          baseline_m2: number
          baseline_mean: number
          baseline_n: number
          first_seen_at: string
          id: string
          is_emerging: boolean
          is_seed: boolean
          last_seen_at: string
          name: string
          slug: string
          total_signal_count: number
          trend: string
          user_id: string
        }
        Insert: {
          baseline_m2?: number
          baseline_mean?: number
          baseline_n?: number
          first_seen_at?: string
          id?: string
          is_emerging?: boolean
          is_seed?: boolean
          last_seen_at?: string
          name: string
          slug: string
          total_signal_count?: number
          trend?: string
          user_id: string
        }
        Update: {
          baseline_m2?: number
          baseline_mean?: number
          baseline_n?: number
          first_seen_at?: string
          id?: string
          is_emerging?: boolean
          is_seed?: boolean
          last_seen_at?: string
          name?: string
          slug?: string
          total_signal_count?: number
          trend?: string
          user_id?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          created_at: string
          encrypted_key: string
          id: string
          masked_key: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_key: string
          id?: string
          masked_key: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_key?: string
          id?: string
          masked_key?: string
          provider?: string
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
      costs_by_day: {
        Args: { days?: number }
        Returns: {
          day: string
          task: Database["public"]["Enums"]["llm_task"]
          total_cost: number
        }[]
      }
      tokens_summary: {
        Args: { days?: number }
        Returns: {
          calls: number
          completion_tokens: number
          day: string
          model: string
          prompt_tokens: number
          total_cost: number
        }[]
      }
      unscored_signals: {
        Args: { lim?: number }
        Returns: {
          id: string
        }[]
      }
    }
    Enums: {
      llm_task: "scraping" | "scoring" | "monitoring"
      signal_source: "reddit" | "arxiv" | "x"
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
      llm_task: ["scraping", "scoring", "monitoring"],
      signal_source: ["reddit", "arxiv", "x"],
    },
  },
} as const
<claude-code-hint v="1" type="plugin" value="supabase@claude-plugins-official" />
