import { describe, it, expect, vi } from 'vitest'

const singleMock = vi.fn().mockResolvedValue({ data: { id: 'lesson-1', status: 'draft' }, error: null })
const eqUpdateMock = vi.fn().mockResolvedValue({ error: null })
const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

vi.mock('@/lib/supabase/requireAdmin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ authorized: true }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: singleMock }) }),
      update: updateMock,
    }),
  }),
}))

import { PATCH } from '@/app/api/lessons/[lessonId]/publish/route'

describe('PATCH /api/lessons/[lessonId]/publish', () => {
  it('allows draft -> published', async () => {
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'published' }) })
    const res = await PATCH(req as any, { params: Promise.resolve({ lessonId: 'lesson-1' }) })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ status: 'published' })
  })

  it('rejects an unknown status value', async () => {
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'bogus' }) })
    const res = await PATCH(req as any, { params: Promise.resolve({ lessonId: 'lesson-1' }) })
    expect(res.status).toBe(400)
  })
})
