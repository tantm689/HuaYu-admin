import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { isAdmin } from './isAdmin'

export function shouldRedirectToLogin(user: User | null, pathname: string): boolean {
  if (pathname.startsWith('/login')) return false
  return user === null
}

// The Admin and User apps share one Supabase project - being logged in only
// proves a valid account, not an admin one. A non-admin account (e.g. one
// created through the User app) must not reach any admin page. Takes the
// admin-check result as a plain boolean (rather than calling isAdmin()
// itself) so this decision is a pure, synchronously testable function -
// updateSession is the only caller that needs to actually await the DB
// check.
export function shouldRedirectForNonAdmin(user: User | null, pathname: string, userIsAdmin: boolean): boolean {
  if (!user) return false
  if (pathname.startsWith('/login')) return false
  return !userIsAdmin
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Distinct cookie name from the User app - see lib/supabase/browser.ts.
      cookieOptions: { name: 'sb-admin-auth-token' },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (shouldRedirectToLogin(user, request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirected to /login (not just blocked in place) with a query flag the
  // login page uses to sign the account out client-side - otherwise the
  // account stays logged in but permanently bounced, since middleware would
  // redirect it right back here on every subsequent request.
  const userIsAdmin = user ? await isAdmin(user.id) : false
  if (shouldRedirectForNonAdmin(user, request.nextUrl.pathname, userIsAdmin)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('error', 'not_admin')
    return NextResponse.redirect(url)
  }

  return response
}
