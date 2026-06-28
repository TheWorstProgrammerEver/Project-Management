import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2'

export type AppInvocationContext = {
  client: SupabaseClient
  user: User
}
