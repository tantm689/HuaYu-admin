import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Route Handlers receive a plain `Request`, not `NextRequest`, so cookies
// have to be read off the raw `Cookie` header rather than `request.cookies`
// (the API `lib/supabase/middleware.ts` uses). This mirrors the same
// getAll/setAll cookie-adapter shape `@supabase/ssr` expects.
function parseCookieHeader(header: string | null): { name: string; value: string }[] {
  if (!header) return []
  return header
    .split(';')
    .map((pair) => {
      const idx = pair.indexOf('=')
      if (idx === -1) return null
      const name = pair.slice(0, idx).trim()
      const value = pair.slice(idx + 1).trim()
      if (!name) return null
      try {
        return { name, value: decodeURIComponent(value) }
      } catch {
        return { name, value }
      }
    })
    .filter((c): c is { name: string; value: string } => c !== null)
}

export type RequireAdminResult = { authorized: true } | { authorized: false; response: Response }

/**
 * Verifies the incoming request carries a valid Supabase admin session.
 * Every /api/* route handler must call this first and return `.response`
 * early when `!authorized` - none of them are otherwise protected, since
 * middleware.ts's matcher excludes /api entirely.
 */
export async function requireAdmin(request: Request): Promise<RequireAdminResult> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => parseCookieHeader(request.headers.get('cookie')),
        // Route handlers can't reliably write cookies back onto an arbitrary
        // outgoing Response here; this check only needs to read the current
        // session, not persist rotated tokens, so setAll is a no-op.
        setAll: () => {},
      },
    }
  )

  // Deliberately getUser(), not getSession() - getSession() only reads the
  // (unverified) JWT out of the cookie, getUser() round-trips to Supabase to
  // verify it against the auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  return { authorized: true }
}
