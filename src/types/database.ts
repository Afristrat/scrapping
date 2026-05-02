export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      admin_prompt_runs: {
        Row: {
          completion_tokens: number
          cost: number
          error: string | null
          executed_at: string
          id: string
          model_used: string | null
          org_id: string
          output_markdown: string | null
          prompt_id: string
          prompt_tokens: number
          provider_used: string | null
          status: string
          user_id: string
        }
        Insert: {
          completion_tokens?: number
          cost?: number
          error?: string | null
          executed_at?: string
          id?: string
          model_used?: string | null
          org_id?: string
          output_markdown?: string | null
          prompt_id: string
          prompt_tokens?: number
          provider_used?: string | null
          status: string
          user_id: string
        }
        Update: {
          completion_tokens?: number
          cost?: number
          error?: string | null
          executed_at?: string
          id?: string
          model_used?: string | null
          org_id?: string
          output_markdown?: string | null
          prompt_id?: string
          prompt_tokens?: number
          provider_used?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'admin_prompt_runs_prompt_id_fkey'
            columns: ['prompt_id']
            isOneToOne: false
            referencedRelation: 'admin_prompts'
            referencedColumns: ['id']
          },
        ]
      }
      admin_prompts: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_seed: boolean
          name: string
          org_id: string
          source_filter: Json
          system_prompt: string
          task_kind: string
          updated_at: string
          user_id: string
          user_prompt_template: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_seed?: boolean
          name: string
          org_id?: string
          source_filter?: Json
          system_prompt: string
          task_kind: string
          updated_at?: string
          user_id: string
          user_prompt_template: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_seed?: boolean
          name?: string
          org_id?: string
          source_filter?: Json
          system_prompt?: string
          task_kind?: string
          updated_at?: string
          user_id?: string
          user_prompt_template?: string
        }
        Relationships: []
      }
      digests: {
        Row: {
          content: string
          cost: number | null
          generated_at: string
          id: string
          language: string
          min_score: number
          model_used: string | null
          org_id: string
          signal_count: number
          user_id: string
          window_hours: number
        }
        Insert: {
          content: string
          cost?: number | null
          generated_at?: string
          id?: string
          language?: string
          min_score?: number
          model_used?: string | null
          org_id?: string
          signal_count?: number
          user_id: string
          window_hours?: number
        }
        Update: {
          content?: string
          cost?: number | null
          generated_at?: string
          id?: string
          language?: string
          min_score?: number
          model_used?: string | null
          org_id?: string
          signal_count?: number
          user_id?: string
          window_hours?: number
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database['public']['Enums']['org_role']
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database['public']['Enums']['org_role']
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database['public']['Enums']['org_role']
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invitations_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      llm_costs: {
        Row: {
          completion_tokens: number
          cost: number
          id: number
          model: string
          org_id: string
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
          org_id?: string
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
          org_id?: string
          prompt_tokens?: number
          task?: Database['public']['Enums']['llm_task']
          ts?: string
          user_id?: string
        }
        Relationships: []
      }
      llm_providers: {
        Row: {
          auth_scheme: string
          base_url_overridable: boolean
          created_at: string
          default_base_url: string
          display_order: number
          enabled: boolean
          extra_headers: Json
          hint: string | null
          id: string
          label: string
          models_endpoint: string
          models_requires_auth: boolean
          updated_at: string
        }
        Insert: {
          auth_scheme: string
          base_url_overridable?: boolean
          created_at?: string
          default_base_url: string
          display_order?: number
          enabled?: boolean
          extra_headers?: Json
          hint?: string | null
          id: string
          label: string
          models_endpoint?: string
          models_requires_auth?: boolean
          updated_at?: string
        }
        Update: {
          auth_scheme?: string
          base_url_overridable?: boolean
          created_at?: string
          default_base_url?: string
          display_order?: number
          enabled?: boolean
          extra_headers?: Json
          hint?: string | null
          id?: string
          label?: string
          models_endpoint?: string
          models_requires_auth?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      logs: {
        Row: {
          action: string
          id: number
          org_id: string
          payload: Json | null
          status: string | null
          ts: string
          user_id: string | null
        }
        Insert: {
          action: string
          id?: number
          org_id?: string
          payload?: Json | null
          status?: string | null
          ts?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          id?: number
          org_id?: string
          payload?: Json | null
          status?: string | null
          ts?: string
          user_id?: string | null
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          joined_at: string
          org_id: string
          role: Database['public']['Enums']['org_role']
          user_id: string
        }
        Insert: {
          joined_at?: string
          org_id: string
          role?: Database['public']['Enums']['org_role']
          user_id: string
        }
        Update: {
          joined_at?: string
          org_id?: string
          role?: Database['public']['Enums']['org_role']
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'organization_members_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      organizations: {
        Row: {
          billing_email: string | null
          billing_mode: Database['public']['Enums']['billing_mode']
          created_at: string
          id: string
          name: string
          plan: Database['public']['Enums']['org_plan']
          segment: Database['public']['Enums']['org_segment']
          slug: string
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          billing_mode?: Database['public']['Enums']['billing_mode']
          created_at?: string
          id?: string
          name: string
          plan?: Database['public']['Enums']['org_plan']
          segment?: Database['public']['Enums']['org_segment']
          slug: string
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          billing_mode?: Database['public']['Enums']['billing_mode']
          created_at?: string
          id?: string
          name?: string
          plan?: Database['public']['Enums']['org_plan']
          segment?: Database['public']['Enums']['org_segment']
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_minio_writes: {
        Row: {
          attempts: number
          content: string
          created_at: string
          id: string
          org_id: string
          run_at: string
          topic_id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          content: string
          created_at?: string
          id?: string
          org_id?: string
          run_at: string
          topic_id: string
          user_id: string
        }
        Update: {
          attempts?: number
          content?: string
          created_at?: string
          id?: string
          org_id?: string
          run_at?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'pending_minio_writes_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'topics'
            referencedColumns: ['id']
          },
        ]
      }
      provider_models: {
        Row: {
          capabilities: Json
          context_window: number | null
          display_name: string | null
          fetched_at: string
          model_id: string
          org_id: string
          pricing_input_per_1m: number | null
          pricing_output_per_1m: number | null
          provider: string
          user_id: string
        }
        Insert: {
          capabilities?: Json
          context_window?: number | null
          display_name?: string | null
          fetched_at?: string
          model_id: string
          org_id?: string
          pricing_input_per_1m?: number | null
          pricing_output_per_1m?: number | null
          provider: string
          user_id: string
        }
        Update: {
          capabilities?: Json
          context_window?: number | null
          display_name?: string | null
          fetched_at?: string
          model_id?: string
          org_id?: string
          pricing_input_per_1m?: number | null
          pricing_output_per_1m?: number | null
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      scores: {
        Row: {
          cost: number
          model_used: string
          org_id: string
          reasoning: string | null
          score: number
          scored_at: string
          signal_id: string
          user_id: string
        }
        Insert: {
          cost?: number
          model_used: string
          org_id?: string
          reasoning?: string | null
          score: number
          scored_at?: string
          signal_id: string
          user_id: string
        }
        Update: {
          cost?: number
          model_used?: string
          org_id?: string
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
      scoring_rubrics: {
        Row: {
          created_at: string
          criteria: Json
          description: string | null
          id: string
          is_default: boolean
          name: string
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          model_config: Json
          org_id: string
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
          model_config?: Json
          org_id?: string
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
          model_config?: Json
          org_id?: string
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
            foreignKeyName: 'settings_active_rubric_id_fkey'
            columns: ['active_rubric_id']
            isOneToOne: false
            referencedRelation: 'scoring_rubrics'
            referencedColumns: ['id']
          },
        ]
      }
      signals: {
        Row: {
          external_id: string
          id: string
          org_id: string
          raw_payload: Json
          scraped_at: string
          signal_date: string | null
          source: Database['public']['Enums']['signal_source']
          title: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          external_id: string
          id?: string
          org_id?: string
          raw_payload: Json
          scraped_at?: string
          signal_date?: string | null
          source: Database['public']['Enums']['signal_source']
          title?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          external_id?: string
          id?: string
          org_id?: string
          raw_payload?: Json
          scraped_at?: string
          signal_date?: string | null
          source?: Database['public']['Enums']['signal_source']
          title?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscription_seats: {
        Row: {
          assigned_at: string
          id: string
          subscription_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          subscription_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subscription_seats_subscription_id_fkey'
            columns: ['subscription_id']
            isOneToOne: false
            referencedRelation: 'subscriptions'
            referencedColumns: ['id']
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_mode: Database['public']['Enums']['billing_mode']
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          org_id: string
          plan: Database['public']['Enums']['org_plan']
          seats: number
          status: Database['public']['Enums']['subscription_status']
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_mode: Database['public']['Enums']['billing_mode']
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id: string
          plan: Database['public']['Enums']['org_plan']
          seats?: number
          status?: Database['public']['Enums']['subscription_status']
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_mode?: Database['public']['Enums']['billing_mode']
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id?: string
          plan?: Database['public']['Enums']['org_plan']
          seats?: number
          status?: Database['public']['Enums']['subscription_status']
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      topic_runs: {
        Row: {
          id: string
          minio_appended: boolean
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: 'topic_runs_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'topics'
            referencedColumns: ['id']
          },
        ]
      }
      topic_signals: {
        Row: {
          org_id: string
          signal_id: string
          topic_id: string
          user_id: string
        }
        Insert: {
          org_id?: string
          signal_id: string
          topic_id: string
          user_id: string
        }
        Update: {
          org_id?: string
          signal_id?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'topic_signals_signal_id_fkey'
            columns: ['signal_id']
            isOneToOne: false
            referencedRelation: 'signals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'topic_signals_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'topics'
            referencedColumns: ['id']
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
          slug?: string
          total_signal_count?: number
          trend?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_records: {
        Row: {
          apify_cost_eur: number
          id: string
          llm_cost_eur: number
          org_id: string
          period_end: string
          period_start: string
          recorded_at: string
          reported_to_stripe: boolean
          signals_count: number
        }
        Insert: {
          apify_cost_eur?: number
          id?: string
          llm_cost_eur?: number
          org_id: string
          period_end: string
          period_start: string
          recorded_at?: string
          reported_to_stripe?: boolean
          signals_count?: number
        }
        Update: {
          apify_cost_eur?: number
          id?: string
          llm_cost_eur?: number
          org_id?: string
          period_end?: string
          period_start?: string
          recorded_at?: string
          reported_to_stripe?: boolean
          signals_count?: number
        }
        Relationships: [
          {
            foreignKeyName: 'usage_records_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      user_api_keys: {
        Row: {
          base_url: string | null
          created_at: string
          encrypted_key: string
          id: string
          last_validated_at: string | null
          masked_key: string
          org_id: string
          provider: string
          updated_at: string
          user_id: string
          validation_status: string | null
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          encrypted_key: string
          id?: string
          last_validated_at?: string | null
          masked_key: string
          org_id?: string
          provider: string
          updated_at?: string
          user_id: string
          validation_status?: string | null
        }
        Update: {
          base_url?: string | null
          created_at?: string
          encrypted_key?: string
          id?: string
          last_validated_at?: string | null
          masked_key?: string
          org_id?: string
          provider?: string
          updated_at?: string
          user_id?: string
          validation_status?: string | null
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
      billing_mode: 'maison' | 'byok'
      llm_task: 'scraping' | 'scoring' | 'monitoring'
      org_plan: 'solo' | 'pro' | 'enterprise'
      org_role: 'owner' | 'admin' | 'member' | 'viewer'
      org_segment: 'vc_pe' | 'legal' | 'newsletter' | 'brand' | 'cto_sme' | 'solo'
      signal_source: 'reddit' | 'arxiv' | 'x'
      subscription_status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete'
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
  public: {
    Enums: {
      billing_mode: ['maison', 'byok'],
      llm_task: ['scraping', 'scoring', 'monitoring'],
      org_plan: ['solo', 'pro', 'enterprise'],
      org_role: ['owner', 'admin', 'member', 'viewer'],
      org_segment: ['vc_pe', 'legal', 'newsletter', 'brand', 'cto_sme', 'solo'],
      signal_source: ['reddit', 'arxiv', 'x'],
      subscription_status: ['active', 'past_due', 'canceled', 'trialing', 'incomplete'],
    },
  },
} as const
