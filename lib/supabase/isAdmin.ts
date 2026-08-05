import { createServerSupabase } from './server'

// The `admins` table has RLS enabled with no policies for anon/authenticated
// (see supabase/migrations/0021_admins.sql), so it can only be read via the
// service-role client - the same client every other server-side DB query in
// this app already uses (lib/supabase/server.ts).
export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = createServerSupabase()
  const { data } = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle()
  return data !== null
}
