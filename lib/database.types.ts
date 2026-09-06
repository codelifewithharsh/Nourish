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
      ai_rate_limits: {
        Row: {
          action: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          action: string
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          action?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          action: string
          cache_hit: boolean
          cost_micros: number | null
          created_at: string
          id: string
          latency_ms: number | null
          meta: Json | null
          status: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string | null
        }
        Insert: {
          action: string
          cache_hit?: boolean
          cost_micros?: number | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          meta?: Json | null
          status: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Update: {
          action?: string
          cache_hit?: boolean
          cost_micros?: number | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          meta?: Json | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      daily_logs: {
        Row: {
          calories: number
          carbs: number
          date: string
          fat: number
          fibre: number
          id: string
          logged_at: string | null
          meal_name: string
          meal_type: string
          photo_path: string | null
          protein: number
          sat_fat: number
          sodium: number
          source: string | null
          sugar: number
          user_id: string
        }
        Insert: {
          calories?: number
          carbs?: number
          date?: string
          fat?: number
          fibre?: number
          id?: string
          logged_at?: string | null
          meal_name: string
          meal_type: string
          photo_path?: string | null
          protein?: number
          sat_fat?: number
          sodium?: number
          source?: string | null
          sugar?: number
          user_id: string
        }
        Update: {
          calories?: number
          carbs?: number
          date?: string
          fat?: number
          fibre?: number
          id?: string
          logged_at?: string | null
          meal_name?: string
          meal_type?: string
          photo_path?: string | null
          protein?: number
          sat_fat?: number
          sodium?: number
          source?: string | null
          sugar?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          contact: string | null
          created_at: string | null
          id: string
          message: string
          type: string
          user_id: string | null
        }
        Insert: {
          contact?: string | null
          created_at?: string | null
          id?: string
          message: string
          type: string
          user_id?: string | null
        }
        Update: {
          contact?: string | null
          created_at?: string | null
          id?: string
          message?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      meal_plan_cache: {
        Row: {
          cache_key: string
          generated_at: string
          hits: number
          plan: Json
        }
        Insert: {
          cache_key: string
          generated_at?: string
          hits?: number
          plan: Json
        }
        Update: {
          cache_key?: string
          generated_at?: string
          hits?: number
          plan?: Json
        }
        Relationships: []
      }
      meal_plans: {
        Row: {
          generated_at: string | null
          id: string
          plan: Json
          user_id: string
        }
        Insert: {
          generated_at?: string | null
          id?: string
          plan: Json
          user_id: string
        }
        Update: {
          generated_at?: string | null
          id?: string
          plan?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_cache: {
        Row: {
          calories: number
          carbs: number
          created_at: string
          fat: number
          fibre: number
          hits: number
          name: string
          protein: number
          query_key: string
          sat_fat: number
          serving: string | null
          sodium: number
          sugar: number
        }
        Insert: {
          calories: number
          carbs: number
          created_at?: string
          fat: number
          fibre?: number
          hits?: number
          name: string
          protein: number
          query_key: string
          sat_fat?: number
          serving?: string | null
          sodium?: number
          sugar?: number
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string
          fat?: number
          fibre?: number
          hits?: number
          name?: string
          protein?: number
          query_key?: string
          sat_fat?: number
          serving?: string | null
          sodium?: number
          sugar?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: string | null
          age: number | null
          allergies: string | null
          budget_tier: string | null
          cooking_time: string | null
          created_at: string | null
          cuisines: string[] | null
          daily_calories: number | null
          daily_protein: number | null
          diet_type: string | null
          eats_out_frequency: string | null
          email: string
          expo_push_token: string | null
          goal: string | null
          height_cm: number | null
          id: string
          is_early_bird: boolean
          is_pro: boolean
          kitchen_ingredients: string | null
          meal_notification_times: Json | null
          meals_per_day: number | null
          medical_flags: string[] | null
          name: string | null
          onboarding_completed: boolean | null
          phone: string | null
          preferred_units: string | null
          pro_since: string
          region: string | null
          restrictions: string[] | null
          sex: string | null
          target_date: string | null
          target_weight_kg: number | null
          updated_at: string | null
          weight_kg: number | null
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          allergies?: string | null
          budget_tier?: string | null
          cooking_time?: string | null
          created_at?: string | null
          cuisines?: string[] | null
          daily_calories?: number | null
          daily_protein?: number | null
          diet_type?: string | null
          eats_out_frequency?: string | null
          email: string
          expo_push_token?: string | null
          goal?: string | null
          height_cm?: number | null
          id: string
          is_early_bird?: boolean
          is_pro?: boolean
          kitchen_ingredients?: string | null
          meal_notification_times?: Json | null
          meals_per_day?: number | null
          medical_flags?: string[] | null
          name?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          preferred_units?: string | null
          pro_since?: string
          region?: string | null
          restrictions?: string[] | null
          sex?: string | null
          target_date?: string | null
          target_weight_kg?: number | null
          updated_at?: string | null
          weight_kg?: number | null
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          allergies?: string | null
          budget_tier?: string | null
          cooking_time?: string | null
          created_at?: string | null
          cuisines?: string[] | null
          daily_calories?: number | null
          daily_protein?: number | null
          diet_type?: string | null
          eats_out_frequency?: string | null
          email?: string
          expo_push_token?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string
          is_early_bird?: boolean
          is_pro?: boolean
          kitchen_ingredients?: string | null
          meal_notification_times?: Json | null
          meals_per_day?: number | null
          medical_flags?: string[] | null
          name?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          preferred_units?: string | null
          pro_since?: string
          region?: string | null
          restrictions?: string[] | null
          sex?: string | null
          target_date?: string | null
          target_weight_kg?: number | null
          updated_at?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      recipes: {
        Row: {
          chef_tip: string | null
          creator_handle: string | null
          difficulty: string | null
          generated_at: string
          hero_emoji: string | null
          image_path: string | null
          ingredients: Json
          instagram_url: string | null
          meal_key: string
          name: string
          prep_minutes: number | null
          serves: number | null
          steps: Json
          tagline: string | null
          views: number | null
          youtube_url: string | null
        }
        Insert: {
          chef_tip?: string | null
          creator_handle?: string | null
          difficulty?: string | null
          generated_at?: string
          hero_emoji?: string | null
          image_path?: string | null
          ingredients?: Json
          instagram_url?: string | null
          meal_key: string
          name: string
          prep_minutes?: number | null
          serves?: number | null
          steps?: Json
          tagline?: string | null
          views?: number | null
          youtube_url?: string | null
        }
        Update: {
          chef_tip?: string | null
          creator_handle?: string | null
          difficulty?: string | null
          generated_at?: string
          hero_emoji?: string | null
          image_path?: string | null
          ingredients?: Json
          instagram_url?: string | null
          meal_key?: string
          name?: string
          prep_minutes?: number | null
          serves?: number | null
          steps?: Json
          tagline?: string | null
          views?: number | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      water_logs: {
        Row: {
          date: string
          glasses: number
          id: string
          user_id: string
        }
        Insert: {
          date?: string
          glasses?: number
          id?: string
          user_id: string
        }
        Update: {
          date?: string
          glasses?: number
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "water_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_logs: {
        Row: {
          date: string
          id: string
          logged_at: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          date?: string
          id?: string
          logged_at?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          date?: string
          id?: string
          logged_at?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_meal_plan_cache_hits: { Args: { p_key: string }; Returns: undefined }
      bump_nutrition_cache_hits: { Args: { p_key: string }; Returns: undefined }
      check_and_increment_rate_limit: {
        Args: { p_action: string; p_daily_limit: number; p_user_id: string }
        Returns: boolean
      }
      get_config_int: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      get_config_text: {
        Args: { p_default: string; p_key: string }
        Returns: string
      }
      prune_rate_limits: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
