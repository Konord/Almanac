
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_log": {
                  Row: {
                    "action": string,"actor_member_id": string | null,"at": string,"created_at": string,"details": NonNullable<Json>,"household_id": string,"id": string,"target_id": string | null,"target_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_member_id"?: string | null,"at"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"household_id": string,"id"?: string,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_member_id"?: string | null,"at"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"household_id"?: string,"id"?: string,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_log_actor_member_id_fkey"
      columns: ["actor_member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_log_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"event_exceptions": {
                  Row: {
                    "created_at": string,"event_id": string,"household_id": string,"id": string,"new_ends_at": string | null,"new_starts_at": string | null,"original_date": string,"skipped": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"household_id": string,"id"?: string,"new_ends_at"?: string | null,"new_starts_at"?: string | null,"original_date": string,"skipped"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"household_id"?: string,"id"?: string,"new_ends_at"?: string | null,"new_starts_at"?: string | null,"original_date"?: string,"skipped"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_exceptions_event_id_household_id_fkey"
      columns: ["event_id","household_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "event_exceptions_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "all_day": boolean,"created_at": string,"created_by": string | null,"ends_at": string,"energy_cost": number,"household_id": string,"id": string,"layer_id": string,"member_id": string | null,"notes": string | null,"recurrence_rule": string | null,"starts_at": string,"timezone": string,"title": string,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day"?: boolean,"created_at"?: string,"created_by"?: string | null,"ends_at": string,"energy_cost"?: number,"household_id": string,"id"?: string,"layer_id": string,"member_id"?: string | null,"notes"?: string | null,"recurrence_rule"?: string | null,"starts_at": string,"timezone": string,"title": string,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "all_day"?: boolean,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"energy_cost"?: number,"household_id"?: string,"id"?: string,"layer_id"?: string,"member_id"?: string | null,"notes"?: string | null,"recurrence_rule"?: string | null,"starts_at"?: string,"timezone"?: string,"title"?: string,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_created_by_household_id_fkey"
      columns: ["created_by","household_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "events_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_layer_id_household_id_fkey"
      columns: ["layer_id","household_id"]
isOneToOne: false
      referencedRelation: "layers"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "events_member_id_household_id_fkey"
      columns: ["member_id","household_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"households": {
                  Row: {
                    "auth_user_id": string | null,"created_at": string,"id": string,"name": string,"settings": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_user_id"?: string | null,"created_at"?: string,"id"?: string,"name": string,"settings"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "auth_user_id"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"settings"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"layers": {
                  Row: {
                    "colour": string,"counts_toward_busyness": boolean,"created_at": string,"created_by": string | null,"household_id": string,"id": string,"name": string,"owner_member_id": string | null,"sort_order": number,"type": string,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "colour"?: string,"counts_toward_busyness"?: boolean,"created_at"?: string,"created_by"?: string | null,"household_id": string,"id"?: string,"name": string,"owner_member_id"?: string | null,"sort_order"?: number,"type"?: string,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "colour"?: string,"counts_toward_busyness"?: boolean,"created_at"?: string,"created_by"?: string | null,"household_id"?: string,"id"?: string,"name"?: string,"owner_member_id"?: string | null,"sort_order"?: number,"type"?: string,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "layers_created_by_household_id_fkey"
      columns: ["created_by","household_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "layers_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "layers_owner_member_id_household_id_fkey"
      columns: ["owner_member_id","household_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"members": {
                  Row: {
                    "birth_year": number | null,"colour": string,"created_at": string,"household_id": string,"id": string,"name": string,"pin_hash": string | null,"role": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "birth_year"?: number | null,"colour"?: string,"created_at"?: string,"household_id": string,"id"?: string,"name": string,"pin_hash"?: string | null,"role": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "birth_year"?: number | null,"colour"?: string,"created_at"?: string,"household_id"?: string,"id"?: string,"name"?: string,"pin_hash"?: string | null,"role"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"themes": {
                  Row: {
                    "active_from": string | null,"active_until": string | null,"created_at": string,"decorations": NonNullable<Json>,"household_id": string,"id": string,"name": string,"slug": string,"tokens": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_from"?: string | null,"active_until"?: string | null,"created_at"?: string,"decorations"?: NonNullable<Json>,"household_id": string,"id"?: string,"name": string,"slug": string,"tokens": NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "active_from"?: string | null,"active_until"?: string | null,"created_at"?: string,"decorations"?: NonNullable<Json>,"household_id"?: string,"id"?: string,"name"?: string,"slug"?: string,"tokens"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "themes_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"views": {
                  Row: {
                    "created_at": string,"household_id": string,"id": string,"layer_ids": (string)[],"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"id"?: string,"layer_ids"?: (string)[],"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"id"?: string,"layer_ids"?: (string)[],"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "views_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_starter_layers":
{ Args: { "target_household": string }; Returns: undefined
                           },
"create_household":
{ Args: { "household_name": string }; Returns: string
                           },
"current_household_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"member_has_pin":
{ Args: { "member_id": string }; Returns: boolean
                           },
"set_member_pin":
{ Args: { "member_id": string,"pin": string }; Returns: undefined
                           },
"verify_member_pin":
{ Args: { "member_id": string,"pin": string }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
