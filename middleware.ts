import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // icon added alongside removing the static favicon.ico in favor of a
  // generated app/icon.tsx route - unlike favicon.ico, /icon isn't a static
  // file the matcher's negative-lookahead would otherwise skip, so it was
  // getting bounced through the auth/admin redirect chain like any other
  // page (harmless in effect - Next.js still resolved the icon after the
  // redirect - but pointless work and an extra hop on every page load).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|api).*)'],
}
