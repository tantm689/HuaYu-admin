import { describe, it, expect, vi } from 'vitest'

const { getUserMock, isAdminMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  isAdminMock: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}))

vi.mock('@/lib/supabase/isAdmin', () => ({
  isAdmin: isAdminMock,
}))

import { requireAdmin } from '@/lib/supabase/requireAdmin'

describe('requireAdmin', () => {
  it('returns unauthorized (401) when there is no logged-in user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const result = await requireAdmin(new Request('http://localhost/api/books'))

    expect(result.authorized).toBe(false)
    if (!result.authorized) expect(result.response.status).toBe(401)
    expect(isAdminMock).not.toHaveBeenCalled()
  })

  // The bug this guards against: a logged-in account (e.g. one created
  // through the User app, which shares this Supabase project) was
  // previously authorized purely for having a valid session, with no check
  // that it's actually an admin account.
  it('returns forbidden (403) when the user is logged in but not an admin', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    isAdminMock.mockResolvedValue(false)

    const result = await requireAdmin(new Request('http://localhost/api/books'))

    expect(result.authorized).toBe(false)
    if (!result.authorized) expect(result.response.status).toBe(403)
    expect(isAdminMock).toHaveBeenCalledWith('user-1')
  })

  it('authorizes when the user is logged in and is an admin', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    isAdminMock.mockResolvedValue(true)

    const result = await requireAdmin(new Request('http://localhost/api/books'))

    expect(result.authorized).toBe(true)
  })
})
