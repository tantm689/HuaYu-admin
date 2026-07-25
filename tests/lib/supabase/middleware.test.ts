import { describe, it, expect, vi } from 'vitest'
import { shouldRedirectToLogin } from '@/lib/supabase/middleware'

describe('shouldRedirectToLogin', () => {
  it('redirects when there is no session and path is protected', () => {
    expect(shouldRedirectToLogin(null, '/books')).toBe(true)
  })

  it('does not redirect when there is a session', () => {
    expect(shouldRedirectToLogin({ user: { id: '1' } } as any, '/books')).toBe(false)
  })

  it('does not redirect for the login page itself', () => {
    expect(shouldRedirectToLogin(null, '/login')).toBe(false)
  })
})
