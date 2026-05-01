export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

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
      llm_costs: {
        Row: {
          completion_tokens: number
          cost: number
          id: number
          model: string
          prompt_tokens: number
          task: Database['public']['Enums']['llm_task']
          ts: string
          user_id: string
        }
        Insert: {
          completion_tokens?: number
          cost?: number
          id?: number
          model: string
          prompt_tokens?: number
          task: Database['public']['Enums']['llm_task']
          ts?: string
          user_id: string
        }
        Update: {
          completion_tokens?: number
          cost?: number
          id?: number
          model?: string
          prompt_tokens?: number
          task?: Database['public']['Enums']['llm_task']
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
            foreignKeyName: 'scores_signal_id_fkey'
            columns: ['signal_id']
            isOneToOne: false
            referencedRelation: 'signals'
            referencedColumns: ['id']
          },
        ]
      }
      settings: {
        Row: {
          active_rubric_id: string | null
          apify_config: Json
          arxiv_categories: string[]
          branding: Json
          daily_budget_usd: number
          model_monitoring: string
          model_scoring: string
          model_scraping: string
          prompt_scoring: string
          reddit_subs: string[]
          source_priority: Json
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
          model_monitoring?: string
          model_scoring?: string
          model_scraping?: string
          prompt_scoring?: string
          reddit_subs?: string[]
          source_priority?: Json
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
          model_monitoring?: string
          model_scoring?: string
          model_scraping?: string
          prompt_scoring?: string
          reddit_subs?: string[]
          source_priority?: Json
          updated_at?: string
          user_id?: string
          x_queries?: string[]
        }
        Relationships: [
          {
            foreignKeyName: 'settings_active_rubric_id_fkey'
            columns: ['active_rubric_id']
            isOneToOne: false
            referencedRelation: 'scoring_rubrics'
            referencedColumns: ['id']
          },
        ]
      }
      user_api_keys: {
        Row: {
          id: string
          user_id: string
          provider: string
          encrypted_key: string
          masked_key: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: string
          encrypted_key: string
          masked_key: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: string
          encrypted_key?: string
          masked_key?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      scoring_rubrics: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          prompt: string
          criteria: Json
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          prompt: string
          criteria?: Json
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          prompt?: string
          criteria?: Json
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          external_id: string
          id: string
          raw_payload: Json
          scraped_at: string
          source: Database['public']['Enums']['signal_source']
          title: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          external_id: string
          id?: string
          raw_payload: Json
          scraped_at?: string
          source: Database['public']['Enums']['signal_source']
          title?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          external_id?: string
          id?: string
          raw_payload?: Json
          scraped_at?: string
          source?: Database['public']['Enums']['signal_source']
          title?: string | null
          url?: string | null
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
          task: Database['public']['Enums']['llm_task']
          total_cost: number
        }[]
      }
      tokens_summary: {
        Args: { days?: number }
        Returns: {
          day: string
          model: string
          prompt_tokens: number
          completion_tokens: number
          total_cost: number
          calls: number
        }[]
      }
    }
    Enums: {
      llm_task: 'scraping' | 'scoring' | 'monitoring'
      signal_source: 'reddit' | 'arxiv' | 'x'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      llm_task: ['scraping', 'scoring', 'monitoring'],
      signal_source: ['reddit', 'arxiv', 'x'],
    },
  },
} as const
