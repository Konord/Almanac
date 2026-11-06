
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
                },"backup_parts": {
                  Row: {
                    "household_id": string,"id": string,"item_id": string,"keep_at_least": number,"on_hand": number,"position": number,"recipe_id": string,"uses": number
                  }
                  ComputedFields: never
                  Insert: {
                    "household_id": string,"id"?: string,"item_id": string,"keep_at_least"?: number,"on_hand"?: number,"position"?: number,"recipe_id": string,"uses"?: number
                  }
                  Update: {
                    "household_id"?: string,"id"?: string,"item_id"?: string,"keep_at_least"?: number,"on_hand"?: number,"position"?: number,"recipe_id"?: string,"uses"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "backup_parts_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "backup_parts_item_id_household_id_fkey"
      columns: ["item_id","household_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "backup_parts_recipe_id_household_id_fkey"
      columns: ["recipe_id","household_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"days": {
                  Row: {
                    "date": string,"energy_mode": string,"household_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "date": string,"energy_mode"?: string,"household_id": string,"updated_at"?: string
                  }
                  Update: {
                    "date"?: string,"energy_mode"?: string,"household_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "days_household_id_fkey"
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
                },"event_members": {
                  Row: {
                    "event_id": string,"household_id": string,"member_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"household_id": string,"member_id": string
                  }
                  Update: {
                    "event_id"?: string,"household_id"?: string,"member_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_members_event_id_household_id_fkey"
      columns: ["event_id","household_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "event_members_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_members_member_id_household_id_fkey"
      columns: ["member_id","household_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"event_tags": {
                  Row: {
                    "event_id": string,"household_id": string,"tag_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"household_id": string,"tag_id": string
                  }
                  Update: {
                    "event_id"?: string,"household_id"?: string,"tag_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_tags_event_id_household_id_fkey"
      columns: ["event_id","household_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "event_tags_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_tags_tag_id_household_id_fkey"
      columns: ["tag_id","household_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"event_templates": {
                  Row: {
                    "all_day": boolean,"created_at": string,"household_id": string,"icon": string | null,"id": string,"member_ids": (string)[],"minutes": number,"notes": string | null,"sort_order": number,"start_time": string | null,"tag_ids": (string)[],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day"?: boolean,"created_at"?: string,"household_id": string,"icon"?: string | null,"id"?: string,"member_ids"?: (string)[],"minutes"?: number,"notes"?: string | null,"sort_order"?: number,"start_time"?: string | null,"tag_ids"?: (string)[],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "all_day"?: boolean,"created_at"?: string,"household_id"?: string,"icon"?: string | null,"id"?: string,"member_ids"?: (string)[],"minutes"?: number,"notes"?: string | null,"sort_order"?: number,"start_time"?: string | null,"tag_ids"?: (string)[],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_templates_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "all_day": boolean,"created_at": string,"created_by": string | null,"ends_at": string,"energy_cost": number,"household_id": string,"icon": string | null,"id": string,"layer_id": string,"notes": string | null,"recurrence_rule": string | null,"starts_at": string,"timezone": string,"title": string,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day"?: boolean,"created_at"?: string,"created_by"?: string | null,"ends_at": string,"energy_cost"?: number,"household_id": string,"icon"?: string | null,"id"?: string,"layer_id": string,"notes"?: string | null,"recurrence_rule"?: string | null,"starts_at": string,"timezone": string,"title": string,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "all_day"?: boolean,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"energy_cost"?: number,"household_id"?: string,"icon"?: string | null,"id"?: string,"layer_id"?: string,"notes"?: string | null,"recurrence_rule"?: string | null,"starts_at"?: string,"timezone"?: string,"title"?: string,"updated_at"?: string,"visibility"?: string
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
                },"items": {
                  Row: {
                    "aisle": string,"created_at": string,"household_id": string,"icon": string | null,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aisle"?: string,"created_at"?: string,"household_id": string,"icon"?: string | null,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "aisle"?: string,"created_at"?: string,"household_id"?: string,"icon"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
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
                },"meal_categories": {
                  Row: {
                    "active": boolean,"created_at": string,"household_id": string,"icon": string | null,"id": string,"meal_time_ids": (string)[],"name": string,"premade": boolean,"sort_order": number,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"household_id": string,"icon"?: string | null,"id"?: string,"meal_time_ids"?: (string)[],"name": string,"premade"?: boolean,"sort_order"?: number,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"household_id"?: string,"icon"?: string | null,"id"?: string,"meal_time_ids"?: (string)[],"name"?: string,"premade"?: boolean,"sort_order"?: number,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_categories_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"meal_members": {
                  Row: {
                    "household_id": string,"meal_id": string,"member_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "household_id": string,"meal_id": string,"member_id": string
                  }
                  Update: {
                    "household_id"?: string,"meal_id"?: string,"member_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_members_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meal_members_meal_id_household_id_fkey"
      columns: ["meal_id","household_id"]
isOneToOne: false
      referencedRelation: "meals"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "meal_members_member_id_household_id_fkey"
      columns: ["member_id","household_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"meal_presets": {
                  Row: {
                    "category_id": string,"created_at": string,"household_id": string,"id": string,"meal_time_id": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"created_at"?: string,"household_id": string,"id"?: string,"meal_time_id": string,"weekday": number
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"household_id"?: string,"id"?: string,"meal_time_id"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_presets_category_id_household_id_fkey"
      columns: ["category_id","household_id"]
isOneToOne: false
      referencedRelation: "meal_categories"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "meal_presets_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meal_presets_meal_time_id_household_id_fkey"
      columns: ["meal_time_id","household_id"]
isOneToOne: false
      referencedRelation: "meal_times"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"meal_tags": {
                  Row: {
                    "created_at": string,"household_id": string,"icon": string | null,"id": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"icon"?: string | null,"id"?: string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"icon"?: string | null,"id"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_tags_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"meal_times": {
                  Row: {
                    "created_at": string,"household_id": string,"icon": string | null,"id": string,"name": string,"show_on_planner": boolean,"sort_order": number,"updated_at": string,"usual_time": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"icon"?: string | null,"id"?: string,"name": string,"show_on_planner"?: boolean,"sort_order"?: number,"updated_at"?: string,"usual_time"?: string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"icon"?: string | null,"id"?: string,"name"?: string,"show_on_planner"?: boolean,"sort_order"?: number,"updated_at"?: string,"usual_time"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_times_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"meal_weeks": {
                  Row: {
                    "household_id": string,"week_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "household_id": string,"week_start": string
                  }
                  Update: {
                    "household_id"?: string,"week_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_weeks_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"meals": {
                  Row: {
                    "category_id": string | null,"created_at": string,"date": string,"from_preset": boolean,"household_id": string,"id": string,"meal_time_id": string,"recipe_id": string | null,"servings": number | null,"sort_order": number,"status": string,"swapped_for_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string,"date": string,"from_preset"?: boolean,"household_id": string,"id"?: string,"meal_time_id": string,"recipe_id"?: string | null,"servings"?: number | null,"sort_order"?: number,"status"?: string,"swapped_for_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string,"date"?: string,"from_preset"?: boolean,"household_id"?: string,"id"?: string,"meal_time_id"?: string,"recipe_id"?: string | null,"servings"?: number | null,"sort_order"?: number,"status"?: string,"swapped_for_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meals_category_id_household_id_fkey"
      columns: ["category_id","household_id"]
isOneToOne: false
      referencedRelation: "meal_categories"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "meals_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meals_meal_time_id_household_id_fkey"
      columns: ["meal_time_id","household_id"]
isOneToOne: false
      referencedRelation: "meal_times"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "meals_recipe_id_household_id_fkey"
      columns: ["recipe_id","household_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "meals_swapped_for_id_household_id_fkey"
      columns: ["swapped_for_id","household_id"]
isOneToOne: false
      referencedRelation: "meals"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"members": {
                  Row: {
                    "birth_year": number | null,"colour": string,"created_at": string,"household_id": string,"icon": string | null,"id": string,"name": string,"pin_hash": string | null,"role": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "birth_year"?: number | null,"colour"?: string,"created_at"?: string,"household_id": string,"icon"?: string | null,"id"?: string,"name": string,"pin_hash"?: string | null,"role": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "birth_year"?: number | null,"colour"?: string,"created_at"?: string,"household_id"?: string,"icon"?: string | null,"id"?: string,"name"?: string,"pin_hash"?: string | null,"role"?: string,"sort_order"?: number,"updated_at"?: string
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
                },"recipe_categories": {
                  Row: {
                    "category_id": string,"household_id": string,"recipe_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"household_id": string,"recipe_id": string
                  }
                  Update: {
                    "category_id"?: string,"household_id"?: string,"recipe_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_categories_category_id_household_id_fkey"
      columns: ["category_id","household_id"]
isOneToOne: false
      referencedRelation: "meal_categories"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "recipe_categories_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_categories_recipe_id_household_id_fkey"
      columns: ["recipe_id","household_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"recipe_ingredients": {
                  Row: {
                    "amount": number | null,"household_id": string,"id": string,"item_id": string,"note": string | null,"position": number,"put_away_if_skipped": boolean,"recipe_id": string,"unit": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"household_id": string,"id"?: string,"item_id": string,"note"?: string | null,"position"?: number,"put_away_if_skipped"?: boolean,"recipe_id": string,"unit"?: string | null
                  }
                  Update: {
                    "amount"?: number | null,"household_id"?: string,"id"?: string,"item_id"?: string,"note"?: string | null,"position"?: number,"put_away_if_skipped"?: boolean,"recipe_id"?: string,"unit"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ingredients_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_ingredients_item_id_household_id_fkey"
      columns: ["item_id","household_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "recipe_ingredients_recipe_id_household_id_fkey"
      columns: ["recipe_id","household_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"recipe_steps": {
                  Row: {
                    "household_id": string,"id": string,"position": number,"recipe_id": string,"text": string
                  }
                  ComputedFields: never
                  Insert: {
                    "household_id": string,"id"?: string,"position"?: number,"recipe_id": string,"text": string
                  }
                  Update: {
                    "household_id"?: string,"id"?: string,"position"?: number,"recipe_id"?: string,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_steps_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_steps_recipe_id_household_id_fkey"
      columns: ["recipe_id","household_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"recipe_tags": {
                  Row: {
                    "household_id": string,"recipe_id": string,"tag_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "household_id": string,"recipe_id": string,"tag_id": string
                  }
                  Update: {
                    "household_id"?: string,"recipe_id"?: string,"tag_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_tags_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_tags_recipe_id_household_id_fkey"
      columns: ["recipe_id","household_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "recipe_tags_tag_id_household_id_fkey"
      columns: ["tag_id","household_id"]
isOneToOne: false
      referencedRelation: "meal_tags"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "created_at": string,"hands_on_minutes": number | null,"household_id": string,"icon": string | null,"id": string,"is_backup": boolean,"last_cooked_on": string | null,"name": string,"notes": string | null,"premade": boolean,"serves": number,"source_url": string | null,"total_minutes": number | null,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"hands_on_minutes"?: number | null,"household_id": string,"icon"?: string | null,"id"?: string,"is_backup"?: boolean,"last_cooked_on"?: string | null,"name": string,"notes"?: string | null,"premade"?: boolean,"serves"?: number,"source_url"?: string | null,"total_minutes"?: number | null,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "created_at"?: string,"hands_on_minutes"?: number | null,"household_id"?: string,"icon"?: string | null,"id"?: string,"is_backup"?: boolean,"last_cooked_on"?: string | null,"name"?: string,"notes"?: string | null,"premade"?: boolean,"serves"?: number,"source_url"?: string | null,"total_minutes"?: number | null,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipes_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"routine_assignments": {
                  Row: {
                    "active": boolean,"created_at": string,"household_id": string,"id": string,"member_id": string,"on_date": string | null,"template_id": string,"updated_at": string,"weekdays": (number)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"household_id": string,"id"?: string,"member_id": string,"on_date"?: string | null,"template_id": string,"updated_at"?: string,"weekdays"?: (number)[] | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"household_id"?: string,"id"?: string,"member_id"?: string,"on_date"?: string | null,"template_id"?: string,"updated_at"?: string,"weekdays"?: (number)[] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_assignments_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routine_assignments_member_id_household_id_fkey"
      columns: ["member_id","household_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "routine_assignments_template_id_household_id_fkey"
      columns: ["template_id","household_id"]
isOneToOne: false
      referencedRelation: "routine_templates"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"routine_checks": {
                  Row: {
                    "check_date": string,"done_at": string,"household_id": string,"id": string,"member_id": string,"step_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "check_date": string,"done_at"?: string,"household_id": string,"id"?: string,"member_id": string,"step_id": string
                  }
                  Update: {
                    "check_date"?: string,"done_at"?: string,"household_id"?: string,"id"?: string,"member_id"?: string,"step_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_checks_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routine_checks_member_id_household_id_fkey"
      columns: ["member_id","household_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "routine_checks_step_id_household_id_fkey"
      columns: ["step_id","household_id"]
isOneToOne: false
      referencedRelation: "routine_steps"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"routine_steps": {
                  Row: {
                    "created_at": string,"essential": boolean,"household_id": string,"icon": string | null,"id": string,"position": number,"target_time": string | null,"template_id": string,"text": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"essential"?: boolean,"household_id": string,"icon"?: string | null,"id"?: string,"position"?: number,"target_time"?: string | null,"template_id": string,"text": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"essential"?: boolean,"household_id"?: string,"icon"?: string | null,"id"?: string,"position"?: number,"target_time"?: string | null,"template_id"?: string,"text"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_steps_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routine_steps_template_id_household_id_fkey"
      columns: ["template_id","household_id"]
isOneToOne: false
      referencedRelation: "routine_templates"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"routine_templates": {
                  Row: {
                    "audience": string,"created_at": string,"household_id": string,"id": string,"kind": string,"name": string,"premade": boolean,"sort_order": number,"updated_at": string,"usual_minutes": number | null,"usual_start": string | null,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audience"?: string,"created_at"?: string,"household_id": string,"id"?: string,"kind"?: string,"name": string,"premade"?: boolean,"sort_order"?: number,"updated_at"?: string,"usual_minutes"?: number | null,"usual_start"?: string | null,"visibility"?: string
                  }
                  Update: {
                    "audience"?: string,"created_at"?: string,"household_id"?: string,"id"?: string,"kind"?: string,"name"?: string,"premade"?: boolean,"sort_order"?: number,"updated_at"?: string,"usual_minutes"?: number | null,"usual_start"?: string | null,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_templates_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"shopping_list": {
                  Row: {
                    "amount": number | null,"backup_part_id": string | null,"checked": boolean,"checked_at": string | null,"created_at": string,"detail": string | null,"household_id": string,"id": string,"item_id": string,"source": string,"status": string,"unit": string | null,"week_of": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"backup_part_id"?: string | null,"checked"?: boolean,"checked_at"?: string | null,"created_at"?: string,"detail"?: string | null,"household_id": string,"id"?: string,"item_id": string,"source"?: string,"status"?: string,"unit"?: string | null,"week_of": string
                  }
                  Update: {
                    "amount"?: number | null,"backup_part_id"?: string | null,"checked"?: boolean,"checked_at"?: string | null,"created_at"?: string,"detail"?: string | null,"household_id"?: string,"id"?: string,"item_id"?: string,"source"?: string,"status"?: string,"unit"?: string | null,"week_of"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shopping_list_backup_part_id_household_id_fkey"
      columns: ["backup_part_id","household_id"]
isOneToOne: false
      referencedRelation: "backup_parts"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "shopping_list_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shopping_list_item_id_household_id_fkey"
      columns: ["item_id","household_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"step_helpers": {
                  Row: {
                    "household_id": string,"id": string,"kind": string,"label": string | null,"minutes": number | null,"step_id": string,"temperature": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "household_id": string,"id"?: string,"kind": string,"label"?: string | null,"minutes"?: number | null,"step_id": string,"temperature"?: number | null
                  }
                  Update: {
                    "household_id"?: string,"id"?: string,"kind"?: string,"label"?: string | null,"minutes"?: number | null,"step_id"?: string,"temperature"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "step_helpers_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "step_helpers_step_id_household_id_fkey"
      columns: ["step_id","household_id"]
isOneToOne: false
      referencedRelation: "recipe_steps"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "created_at": string,"household_id": string,"icon": string | null,"id": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"icon"?: string | null,"id"?: string,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"icon"?: string | null,"id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tags_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"task_instances": {
                  Row: {
                    "actual_minutes": number | null,"assignee_id": string | null,"completed_at": string | null,"completed_by": string | null,"completed_on": string | null,"created_at": string,"due_date": string | null,"household_id": string,"icon": string | null,"id": string,"list_id": string | null,"meal_id": string | null,"must_do": boolean,"notes": string | null,"status": string,"template_id": string | null,"title": string | null,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_minutes"?: number | null,"assignee_id"?: string | null,"completed_at"?: string | null,"completed_by"?: string | null,"completed_on"?: string | null,"created_at"?: string,"due_date"?: string | null,"household_id": string,"icon"?: string | null,"id"?: string,"list_id"?: string | null,"meal_id"?: string | null,"must_do"?: boolean,"notes"?: string | null,"status"?: string,"template_id"?: string | null,"title"?: string | null,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "actual_minutes"?: number | null,"assignee_id"?: string | null,"completed_at"?: string | null,"completed_by"?: string | null,"completed_on"?: string | null,"created_at"?: string,"due_date"?: string | null,"household_id"?: string,"icon"?: string | null,"id"?: string,"list_id"?: string | null,"meal_id"?: string | null,"must_do"?: boolean,"notes"?: string | null,"status"?: string,"template_id"?: string | null,"title"?: string | null,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_instances_assignee_id_household_id_fkey"
      columns: ["assignee_id","household_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "task_instances_completed_by_household_id_fkey"
      columns: ["completed_by","household_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "task_instances_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_instances_list_id_household_id_fkey"
      columns: ["list_id","household_id"]
isOneToOne: false
      referencedRelation: "task_lists"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "task_instances_meal_fk"
      columns: ["meal_id","household_id"]
isOneToOne: false
      referencedRelation: "meals"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "task_instances_template_id_household_id_fkey"
      columns: ["template_id","household_id"]
isOneToOne: false
      referencedRelation: "task_templates"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"task_lists": {
                  Row: {
                    "created_at": string,"household_id": string,"icon": string | null,"id": string,"name": string,"sort_order": number,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"icon"?: string | null,"id"?: string,"name": string,"sort_order"?: number,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"icon"?: string | null,"id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_lists_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"task_templates": {
                  Row: {
                    "active": boolean,"created_at": string,"default_assignee_id": string | null,"est_minutes": number | null,"household_id": string,"icon": string | null,"id": string,"importance": string,"location": string,"name": string,"notes": string | null,"preferred_weekday": number | null,"premade": boolean,"repeat_every": number,"repeat_unit": string,"season_end": string | null,"season_start": string | null,"size": string,"sort_order": number,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"default_assignee_id"?: string | null,"est_minutes"?: number | null,"household_id": string,"icon"?: string | null,"id"?: string,"importance"?: string,"location"?: string,"name": string,"notes"?: string | null,"preferred_weekday"?: number | null,"premade"?: boolean,"repeat_every"?: number,"repeat_unit"?: string,"season_end"?: string | null,"season_start"?: string | null,"size"?: string,"sort_order"?: number,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"default_assignee_id"?: string | null,"est_minutes"?: number | null,"household_id"?: string,"icon"?: string | null,"id"?: string,"importance"?: string,"location"?: string,"name"?: string,"notes"?: string | null,"preferred_weekday"?: number | null,"premade"?: boolean,"repeat_every"?: number,"repeat_unit"?: string,"season_end"?: string | null,"season_start"?: string | null,"size"?: string,"sort_order"?: number,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_templates_default_assignee_id_household_id_fkey"
      columns: ["default_assignee_id","household_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "task_templates_household_id_fkey"
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
                },"weekly_buys": {
                  Row: {
                    "amount": number | null,"created_at": string,"every_weeks": number,"household_id": string,"id": string,"item_id": string,"last_week": string | null,"unit": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"created_at"?: string,"every_weeks"?: number,"household_id": string,"id"?: string,"item_id": string,"last_week"?: string | null,"unit"?: string | null
                  }
                  Update: {
                    "amount"?: number | null,"created_at"?: string,"every_weeks"?: number,"household_id"?: string,"id"?: string,"item_id"?: string,"last_week"?: string | null,"unit"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "weekly_buys_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "weekly_buys_item_id_household_id_fkey"
      columns: ["item_id","household_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","household_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_starter_chores":
{ Args: { "target_household": string }; Returns: undefined
                           },
"add_starter_layers":
{ Args: { "target_household": string }; Returns: undefined
                           },
"add_starter_meals":
{ Args: { "target_household": string }; Returns: undefined
                           },
"add_starter_routines":
{ Args: { "target_household": string }; Returns: undefined
                           },
"bright_theme_tokens":
{ Args: Record<PropertyKey, never>; Returns: Json
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
