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
      daily_logs: {
        Row: {
          calories: number
          carbs: number
          date: string
          fat: number
          id: string
          logged_at: string | null
          meal_name: string
          meal_type: string
          protein: number
          user_id: string
        }
        Insert: {
          calories?: number
          carbs?: number
          date?: string
          fat?: number
          id?: string
          logged_at?: string | null
          meal_name: string
          meal_type: string
          protein?: number
          user_id: string
        }
        Update: {
          calories?: number
          carbs?: number
          date?: string
          fat?: number
          id?: string
          logged_at?: string | null
          meal_name?: string
          meal_type?: string
          protein?: number
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
      recipes: {
        Row: {
          chef_tip: string | null
          creator_handle: string | null
          difficulty: string | null
          generated_at: string
          hero_emoji: string | null
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
      profiles: {
        Row: {
          activity_level: string | null
          age: number | null
          created_at: string | null
          credits: number
          cuisines: string[] | null
          daily_calories: number | null
          daily_protein: number | null
          diet_type: string | null
          email: string
          goal: string | null
          height_cm: number | null
          id: string
          kitchen_ingredients: string | null
          last_daily_refill: string | null
          name: string | null
          onboarding_completed: boolean | null
          credits_intro_seen: boolean
          preferred_units: string | null
          restrictions: string[] | null
          updated_at: string | null
          weight_kg: number | null
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          created_at?: string | null
          credits?: number
          cuisines?: string[] | null
          daily_calories?: number | null
          daily_protein?: number | null
          diet_type?: string | null
          email: string
          goal?: string | null
          height_cm?: number | null
          id: string
          kitchen_ingredients?: string | null
          last_daily_refill?: string | null
          name?: string | null
          onboarding_completed?: boolean | null
          credits_intro_seen?: boolean
          preferred_units?: string | null
          restrictions?: string[] | null
          updated_at?: string | null
          weight_kg?: number | null
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          created_at?: string | null
          credits?: number
          cuisines?: string[] | null
          daily_calories?: number | null
          daily_protein?: number | null
          diet_type?: string | null
          email?: string
          goal?: string | null
          height_cm?: number | null
          id?: string
          kitchen_ingredients?: string | null
          last_daily_refill?: string | null
          name?: string | null
          onboarding_completed?: boolean | null
          credits_intro_seen?: boolean
          preferred_units?: string | null
          restrictions?: string[] | null
          updated_at?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      credit_pack_interest: {
        Row: {
          user_id: string
          created_at: string
          meta: Json
        }
        Insert: {
          user_id: string
          created_at?: string
          meta?: Json
        }
        Update: {
          user_id?: string
          created_at?: string
          meta?: Json
        }
        Relationships: []
      }
      ai_rate_limits: {
        Row: {
          user_id: string
          action: string
          window_start: string
          count: number
        }
        Insert: {
          user_id: string
          action: string
          window_start: string
          count?: number
        }
        Update: {
          user_id?: string
          action?: string
          window_start?: string
          count?: number
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          id: string
          user_id: string | null
          action: string
          status: string
          cache_hit: boolean
          tokens_in: number | null
          tokens_out: number | null
          cost_micros: number | null
          credits_charged: number
          latency_ms: number | null
          meta: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          status: string
          cache_hit?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
          cost_micros?: number | null
          credits_charged?: number
          latency_ms?: number | null
          meta?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          action?: string
          status?: string
          cache_hit?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
          cost_micros?: number | null
          credits_charged?: number
          latency_ms?: number | null
          meta?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          id: string
          user_id: string
          delta: number
          balance_after: number
          reason: string
          action: string | null
          ref_id: string | null
          meta: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          delta: number
          balance_after: number
          reason: string
          action?: string | null
          ref_id?: string | null
          meta?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          delta?: number
          balance_after?: number
          reason?: string
          action?: string | null
          ref_id?: string | null
          meta?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      meal_plan_cache: {
        Row: {
          cache_key: string
          plan: Json
          hits: number
          generated_at: string
        }
        Insert: {
          cache_key: string
          plan: Json
          hits?: number
          generated_at?: string
        }
        Update: {
          cache_key?: string
          plan?: Json
          hits?: number
          generated_at?: string
        }
        Relationships: []
      }
      nutrition_cache: {
        Row: {
          query_key: string
          name: string
          calories: number
          protein: number
          carbs: number
          fat: number
          serving: string | null
          hits: number
          created_at: string
        }
        Insert: {
          query_key: string
          name: string
          calories: number
          protein: number
          carbs: number
          fat: number
          serving?: string | null
          hits?: number
          created_at?: string
        }
        Update: {
          query_key?: string
          name?: string
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          serving?: string | null
          hits?: number
          created_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
