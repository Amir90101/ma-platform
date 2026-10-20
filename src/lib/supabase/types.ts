
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
            "customers": {
                  Row: {
                    "consent_at": string | null,"created_at": string,"id": string,"name": string | null,"notes": string | null,"phone": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consent_at"?: string | null,"created_at"?: string,"id"?: string,"name"?: string | null,"notes"?: string | null,"phone": string,"venue_id": string
                  }
                  Update: {
                    "consent_at"?: string | null,"created_at"?: string,"id"?: string,"name"?: string | null,"notes"?: string | null,"phone"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"hall_objects": {
                  Row: {
                    "created_at": string,"h": number,"hall_id": string,"id": string,"kind": Database["public"]['Enums']["hall_object_kind"],"label": string | null,"rotation": number,"w": number,"x": number,"y": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"h": number,"hall_id": string,"id"?: string,"kind": Database["public"]['Enums']["hall_object_kind"],"label"?: string | null,"rotation"?: number,"w": number,"x": number,"y": number
                  }
                  Update: {
                    "created_at"?: string,"h"?: number,"hall_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["hall_object_kind"],"label"?: string | null,"rotation"?: number,"w"?: number,"x"?: number,"y"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "hall_objects_hall_id_fkey"
      columns: ["hall_id"]
isOneToOne: false
      referencedRelation: "halls"
      referencedColumns: ["id"]
    }
                  ]
                },"halls": {
                  Row: {
                    "created_at": string,"height": number,"id": string,"name": string,"sort": number,"venue_id": string,"width": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"height"?: number,"id"?: string,"name": string,"sort"?: number,"venue_id": string,"width"?: number
                  }
                  Update: {
                    "created_at"?: string,"height"?: number,"id"?: string,"name"?: string,"sort"?: number,"venue_id"?: string,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "halls_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "created_at": string,"org_id": string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"org_id": string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"org_id"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"owner_id": string,"plan": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"owner_id": string,"plan"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string,"plan"?: string
                  }
                  Relationships: [
                    
                  ]
                },"packages": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"minutes": number,"name": string,"price": number,"resource_kinds": (Database["public"]['Enums']["resource_kind"])[],"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"minutes": number,"name": string,"price": number,"resource_kinds": (Database["public"]['Enums']["resource_kind"])[],"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"minutes"?: number,"name"?: string,"price"?: number,"resource_kinds"?: (Database["public"]['Enums']["resource_kind"])[],"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "packages_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"resources": {
                  Row: {
                    "bookable_online": boolean,"capacity": number | null,"created_at": string,"h": number,"hall_id": string,"id": string,"is_active": boolean,"kind": Database["public"]['Enums']["resource_kind"],"name": string,"rotation": number,"shape": string,"venue_id": string,"w": number,"x": number,"y": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bookable_online"?: boolean,"capacity"?: number | null,"created_at"?: string,"h": number,"hall_id": string,"id"?: string,"is_active"?: boolean,"kind": Database["public"]['Enums']["resource_kind"],"name": string,"rotation"?: number,"shape"?: string,"venue_id": string,"w": number,"x": number,"y": number
                  }
                  Update: {
                    "bookable_online"?: boolean,"capacity"?: number | null,"created_at"?: string,"h"?: number,"hall_id"?: string,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["resource_kind"],"name"?: string,"rotation"?: number,"shape"?: string,"venue_id"?: string,"w"?: number,"x"?: number,"y"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "resources_hall_id_venue_id_fkey"
      columns: ["hall_id","venue_id"]
isOneToOne: false
      referencedRelation: "halls"
      referencedColumns: ["id","venue_id"]
    },{
      foreignKeyName: "resources_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"session_items": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"price": number,"qty": number,"session_id": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"price": number,"qty"?: number,"session_id": string,"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"price"?: number,"qty"?: number,"session_id"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_items_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_items_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"session_segments": {
                  Row: {
                    "ended_at": string | null,"id": string,"kind": Database["public"]['Enums']["segment_kind"],"resource_id": string,"session_id": string,"started_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ended_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["segment_kind"],"resource_id": string,"session_id": string,"started_at": string,"venue_id": string
                  }
                  Update: {
                    "ended_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["segment_kind"],"resource_id"?: string,"session_id"?: string,"started_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_segments_resource_id_fkey"
      columns: ["resource_id"]
isOneToOne: false
      referencedRelation: "resources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_segments_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_segments_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"sessions": {
                  Row: {
                    "booking_id": string | null,"closed_at": string | null,"closed_by": string | null,"customer_id": string | null,"discount_amount": number,"expected_end_at": string | null,"id": string,"items_amount": number | null,"package_id": string | null,"started_at": string,"started_by": string,"status": Database["public"]['Enums']["session_status"],"tariff_snapshot": Json | null,"time_amount": number | null,"total_amount": number | null,"venue_id": string,"void_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id"?: string | null,"closed_at"?: string | null,"closed_by"?: string | null,"customer_id"?: string | null,"discount_amount"?: number,"expected_end_at"?: string | null,"id"?: string,"items_amount"?: number | null,"package_id"?: string | null,"started_at"?: string,"started_by": string,"status"?: Database["public"]['Enums']["session_status"],"tariff_snapshot"?: Json | null,"time_amount"?: number | null,"total_amount"?: number | null,"venue_id": string,"void_reason"?: string | null
                  }
                  Update: {
                    "booking_id"?: string | null,"closed_at"?: string | null,"closed_by"?: string | null,"customer_id"?: string | null,"discount_amount"?: number,"expected_end_at"?: string | null,"id"?: string,"items_amount"?: number | null,"package_id"?: string | null,"started_at"?: string,"started_by"?: string,"status"?: Database["public"]['Enums']["session_status"],"tariff_snapshot"?: Json | null,"time_amount"?: number | null,"total_amount"?: number | null,"venue_id"?: string,"void_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sessions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "packages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"shifts": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"closing_cash": number | null,"expected_cash": number | null,"id": string,"opened_at": string,"opened_by": string,"opening_cash": number,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"closing_cash"?: number | null,"expected_cash"?: number | null,"id"?: string,"opened_at"?: string,"opened_by": string,"opening_cash": number,"venue_id": string
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"closing_cash"?: number | null,"expected_cash"?: number | null,"id"?: string,"opened_at"?: string,"opened_by"?: string,"opening_cash"?: number,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shifts_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"tariffs": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"price_per_hour": number,"priority": number,"resource_kinds": (Database["public"]['Enums']["resource_kind"])[],"time_from": string,"time_to": string,"venue_id": string,"weekdays": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"price_per_hour": number,"priority"?: number,"resource_kinds": (Database["public"]['Enums']["resource_kind"])[],"time_from": string,"time_to": string,"venue_id": string,"weekdays": (number)[]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"price_per_hour"?: number,"priority"?: number,"resource_kinds"?: (Database["public"]['Enums']["resource_kind"])[],"time_from"?: string,"time_to"?: string,"venue_id"?: string,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "tariffs_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"venue_photos": {
                  Row: {
                    "created_at": string,"id": string,"sort": number,"storage_path": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"sort"?: number,"storage_path": string,"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"sort"?: number,"storage_path"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venue_photos_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"venues": {
                  Row: {
                    "address": string | null,"buffer_min": number,"city": string,"created_at": string,"description": string | null,"id": string,"is_published": boolean,"max_days_ahead": number,"min_duration_min": number,"min_lead_min": number,"name": string,"no_show_after_min": number,"online_booking_enabled": boolean,"org_id": string,"phone": string | null,"rounding_min": number,"slot_step_min": number,"slug": string,"timezone": string,"type": Database["public"]['Enums']["venue_type"],"working_hours": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"buffer_min"?: number,"city": string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_published"?: boolean,"max_days_ahead"?: number,"min_duration_min"?: number,"min_lead_min"?: number,"name": string,"no_show_after_min"?: number,"online_booking_enabled"?: boolean,"org_id": string,"phone"?: string | null,"rounding_min"?: number,"slot_step_min"?: number,"slug": string,"timezone"?: string,"type": Database["public"]['Enums']["venue_type"],"working_hours"?: NonNullable<Json>
                  }
                  Update: {
                    "address"?: string | null,"buffer_min"?: number,"city"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_published"?: boolean,"max_days_ahead"?: number,"min_duration_min"?: number,"min_lead_min"?: number,"name"?: string,"no_show_after_min"?: number,"online_booking_enabled"?: boolean,"org_id"?: string,"phone"?: string | null,"rounding_min"?: number,"slot_step_min"?: number,"slug"?: string,"timezone"?: string,"type"?: Database["public"]['Enums']["venue_type"],"working_hours"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "venues_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "calc_play_amount":
{ Args: { "p_at"?: string,"p_package_id"?: string,"p_segments": Json,"p_venue_id": string }; Returns: Json
                           },
"calc_session_amount":
{ Args: { "p_at"?: string,"p_session_id": string }; Returns: Json
                           },
"close_open_segment":
{ Args: { "p_at": string,"p_session_id": string }; Returns: {
              "ended_at": string | null,
"id": string,
"kind": Database["public"]['Enums']["segment_kind"],
"resource_id": string,
"session_id": string,
"started_at": string,
"venue_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "session_segments"
        isOneToOne: true
        isSetofReturn: false
      } },
"close_session":
{ Args: { "p_discount_amount"?: number,"p_session_id": string }; Returns: Json
                           },
"close_shift":
{ Args: { "p_closing_cash": number,"p_shift_id": string }; Returns: {
              "closed_at": string | null,
"closed_by": string | null,
"closing_cash": number | null,
"expected_cash": number | null,
"id": string,
"opened_at": string,
"opened_by": string,
"opening_cash": number,
"venue_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "shifts"
        isOneToOne: true
        isSetofReturn: false
      } },
"find_tariff":
{ Args: { "p_kind": Database["public"]['Enums']["resource_kind"],"p_local": string,"p_venue_id": string }; Returns: {
              "created_at": string,
"id": string,
"is_active": boolean,
"name": string,
"price_per_hour": number,
"priority": number,
"resource_kinds": (Database["public"]['Enums']["resource_kind"])[],
"time_from": string,
"time_to": string,
"venue_id": string,
"weekdays": (number)[]
            }
                          SetofOptions: {
        from: "*"
        to: "tariffs"
        isOneToOne: true
        isSetofReturn: false
      } },
"get_org_staff":
{ Args: { "p_org_id": string }; Returns: {
              "created_at": string,"email": string,"full_name": string,"role": Database["public"]['Enums']["member_role"],"user_id": string
            }[]
                           },
"hall_venue_id":
{ Args: { "p_hall_id": string }; Returns: string
                           },
"is_org_member":
{ Args: { "p_org_id": string }; Returns: boolean
                           },
"is_org_owner":
{ Args: { "p_org_id": string }; Returns: boolean
                           },
"is_venue_member":
{ Args: { "p_venue_id": string }; Returns: boolean
                           },
"is_venue_owner":
{ Args: { "p_venue_id": string }; Returns: boolean
                           },
"lock_session":
{ Args: { "p_session_id": string }; Returns: {
              "booking_id": string | null,
"closed_at": string | null,
"closed_by": string | null,
"customer_id": string | null,
"discount_amount": number,
"expected_end_at": string | null,
"id": string,
"items_amount": number | null,
"package_id": string | null,
"started_at": string,
"started_by": string,
"status": Database["public"]['Enums']["session_status"],
"tariff_snapshot": Json | null,
"time_amount": number | null,
"total_amount": number | null,
"venue_id": string,
"void_reason": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "sessions"
        isOneToOne: true
        isSetofReturn: false
      } },
"open_segment":
{ Args: { "p_at": string,"p_kind": Database["public"]['Enums']["segment_kind"],"p_resource_id": string,"p_session": Omit<Database["public"]['Tables']["sessions"]['Row'], Database["public"]['Tables']["sessions"]['ComputedFields']> }; Returns: undefined
                           },
"open_shift":
{ Args: { "p_opening_cash": number,"p_venue_id": string }; Returns: string
                           },
"pause_session":
{ Args: { "p_session_id": string }; Returns: undefined
                           },
"resume_session":
{ Args: { "p_session_id": string }; Returns: undefined
                           },
"save_hall_layout":
{ Args: { "p_hall_id": string,"p_objects": Json,"p_resources": Json }; Returns: undefined
                           },
"server_now":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"start_session":
{ Args: { "p_customer_name"?: string,"p_customer_phone"?: string,"p_expected_end_at"?: string,"p_package_id"?: string,"p_resource_id": string }; Returns: string
                           },
"tariff_week_grid":
{ Args: { "p_kind": Database["public"]['Enums']["resource_kind"],"p_venue_id": string }; Returns: {
              "minute": number,"price_per_hour": number,"tariff_id": string,"tariff_name": string,"weekday": number
            }[]
                           },
"transfer_session":
{ Args: { "p_resource_id": string,"p_session_id": string }; Returns: undefined
                           },
"user_id_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"venue_photo_venue_id":
{ Args: { "p_name": string }; Returns: string
                           },
"void_session":
{ Args: { "p_reason": string,"p_session_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "hall_object_kind": "bar"|"entrance"|"wall"|"label"|"zone","member_role": "owner"|"admin","resource_kind": "pool_table"|"russian_table"|"ps_zone"|"pc_seat"|"karaoke_room"|"sauna_room"|"court"|"other","segment_kind": "play"|"pause","session_status": "active"|"paused"|"closed"|"voided","venue_type": "billiards"|"ps_club"|"pc_club"|"ps_pc_club"|"karaoke"|"sauna"|"sports_court"
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
            "hall_object_kind": ["bar", "entrance", "wall", "label", "zone"],"member_role": ["owner", "admin"],"resource_kind": ["pool_table", "russian_table", "ps_zone", "pc_seat", "karaoke_room", "sauna_room", "court", "other"],"segment_kind": ["play", "pause"],"session_status": ["active", "paused", "closed", "voided"],"venue_type": ["billiards", "ps_club", "pc_club", "ps_pc_club", "karaoke", "sauna", "sports_court"]
          }
        }
} as const
