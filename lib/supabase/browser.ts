import { createBrowserClient } from '@supabase/ssr'

// Admin and User apps share one Supabase project (same URL/anon key), so
// they'd otherwise write the same default cookie name and silently share
// sessions when run on localhost (cookie domain isn't port-scoped). A
// distinct cookie name per app keeps their sessions isolated.
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { name: 'sb-admin-auth-token' } }
  )
}
