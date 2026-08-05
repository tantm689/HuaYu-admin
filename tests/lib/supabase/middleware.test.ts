import { describe, it, expect } from 'vitest'
import { shouldRedirectToLogin, shouldRedirectForNonAdmin } from '@/lib/supabase/middleware'

describe('shouldRedirectToLogin', () => {
  it('redirects when there is no user and path is protected', () => {
    expect(shouldRedirectToLogin(null, '/books')).toBe(true)
  })

  it('does not redirect when there is a user', () => {
    expect(shouldRedirectToLogin({ id: '1' } as any, '/books')).toBe(false)
  })

  it('does not redirect for the login page itself', () => {
    expect(shouldRedirectToLogin(null, '/login')).toBe(false)
  })
})

describe('shouldRedirectForNonAdmin', () => {
  // The Admin and User apps share one Supabase project - the specific bug
  // this guards against: a logged-in account with no admins-table row
  // (e.g. a User-app account) reaching an admin page purely because
  // shouldRedirectToLogin only checked "is there a user at all".
  it('redirects a logged-in non-admin user away from an admin page', () => {
    expect(shouldRedirectForNonAdmin({ id: '1' } as any, '/books', false)).toBe(true)
  })

  it('does not redirect a logged-in admin user', () => {
    expect(shouldRedirectForNonAdmin({ id: '1' } as any, '/books', true)).toBe(false)
  })

  it('does not redirect when there is no user at all (shouldRedirectToLogin already handles that case)', () => {
    expect(shouldRedirectForNonAdmin(null, '/books', false)).toBe(false)
  })

  it('does not redirect for the login page itself, even for a non-admin user - otherwise the redirect-to-login-with-error itself would loop', () => {
    expect(shouldRedirectForNonAdmin({ id: '1' } as any, '/login', false)).toBe(false)
  })
})
