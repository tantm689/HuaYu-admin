import { describe, it, expect } from 'vitest'
import { shouldRedirectToLogin } from '@/lib/supabase/middleware'

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
