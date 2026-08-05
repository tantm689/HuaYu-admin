import { describe, it, expect, vi } from 'vitest'

const { maybeSingleMock, eqMock } = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  eqMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table !== 'admins') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            eqMock(column, value)
            return { maybeSingle: maybeSingleMock }
          },
        }),
      }
    },
  }),
}))

import { isAdmin } from '@/lib/supabase/isAdmin'

describe('isAdmin', () => {
  it('returns true when a matching row exists in the admins table', async () => {
    maybeSingleMock.mockResolvedValue({ data: { user_id: 'user-1' } })
    expect(await isAdmin('user-1')).toBe(true)
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('returns false when no matching row exists', async () => {
    maybeSingleMock.mockResolvedValue({ data: null })
    expect(await isAdmin('user-2')).toBe(false)
  })
})
