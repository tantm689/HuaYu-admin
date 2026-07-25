import { describe, it, expect, vi } from 'vitest'

const singleMock = vi.fn().mockResolvedValue({ data: { id: 'lesson-1', status: 'draft' }, error: null })
const eqUpdateMock = vi.fn().mockResolvedValue({ error: null })
const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

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
  it('allows draft -> reviewed', async () => {
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'reviewed' }) })
    const res = await PATCH(req as any, { params: Promise.resolve({ lessonId: 'lesson-1' }) })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ status: 'reviewed' })
  })

  it('rejects draft -> published (must go through reviewed)', async () => {
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'published' }) })
    const res = await PATCH(req as any, { params: Promise.resolve({ lessonId: 'lesson-1' }) })
    expect(res.status).toBe(400)
  })
})
