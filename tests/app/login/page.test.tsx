// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const { signOutMock, pushMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  pushMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

vi.mock('@/lib/supabase/browser', () => ({
  createBrowserSupabase: () => ({
    auth: {
      signOut: signOutMock,
      signInWithPassword: vi.fn(),
    },
  }),
}))

// Mutated per test before render() - useSearchParams() above reads it.
let mockSearch = ''

import LoginPage from '@/app/login/page'

describe('LoginPage', () => {
  beforeEach(() => {
    signOutMock.mockClear()
    pushMock.mockClear()
  })


  // The bug this guards against: middleware.ts redirects a logged-in
  // non-admin account back to /login with ?error=not_admin instead of
  // blocking it in place, since it has no way to clear the session itself
  // (it can only redirect). Without this client-side sign-out, that account
  // would stay logged in and get bounced right back here on every
  // subsequent request - this is the one place that actually breaks the
  // loop.
  it('signs the user out and shows an error when redirected here with ?error=not_admin', async () => {
    mockSearch = 'error=not_admin'
    render(<LoginPage />)

    await waitFor(() => expect(signOutMock).toHaveBeenCalled())
    expect(screen.getByRole('alert')).toHaveTextContent(/không có quyền/i)
  })

  it('does not sign out or show an error on a normal visit with no error param', () => {
    mockSearch = ''
    render(<LoginPage />)

    expect(signOutMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
