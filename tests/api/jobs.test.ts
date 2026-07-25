import { describe, it, expect, vi } from 'vitest'

const insertMock = vi.fn().mockReturnValue({
  select: () => ({
    single: () => Promise.resolve({
      data: { id: 'job-1', book_id: 'book-1', lesson_no: 1, page_start: 27, page_end: 45, status: 'pending' },
      error: null,
    }),
  }),
})

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({ from: () => ({ insert: insertMock }) }),
}))

import { POST } from '@/app/api/jobs/route'

describe('POST /api/jobs', () => {
  it('creates a pending extraction job', async () => {
    const req = new Request('http://localhost/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ bookId: 'book-1', lessonNo: 1, pageStart: 27, pageEnd: 45 }),
    })
    const res = await POST(req as any)
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.status).toBe('pending')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ book_id: 'book-1', lesson_no: 1, page_start: 27, page_end: 45, status: 'pending' })
    )
  })

  it('rejects when pageStart > pageEnd', async () => {
    const req = new Request('http://localhost/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ bookId: 'book-1', lessonNo: 1, pageStart: 45, pageEnd: 27 }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })
})
