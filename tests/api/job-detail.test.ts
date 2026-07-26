import { describe, it, expect, vi, beforeEach } from 'vitest'

let jobStatus = 'pending'
const singleMock = vi.fn(() => Promise.resolve({ data: { id: 'job-1', status: jobStatus, book_id: 'book-1', raw_json: { lesson: { lessonNo: 1 } } }, error: null }))
const eqUpdateMock = vi.fn().mockResolvedValue({ error: null })
const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

vi.mock('@/lib/supabase/requireAdmin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ authorized: true }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'extraction_jobs') {
        return {
          select: () => ({ eq: () => ({ single: singleMock }) }),
          update: updateMock,
        }
      }
      if (table === 'lessons') {
        // No existing lesson for this (book_id, lessonNo) in these tests.
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }
      }
      return { select: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }
    },
  }),
}))

import { GET, PATCH } from '@/app/api/jobs/[jobId]/route'

describe('/api/jobs/[jobId]', () => {
  beforeEach(() => {
    jobStatus = 'pending'
    updateMock.mockClear()
  })

  it('GET returns the job', async () => {
    const res = await GET(new Request('http://localhost') as any, { params: { jobId: 'job-1' } as any })
    const json = await res.json()
    expect(json.id).toBe('job-1')
  })

  it('PATCH saves edited raw_json and marks the job reviewed', async () => {
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ raw_json: { lesson: { lessonNo: 1, titleZh: 'edited' } } }),
    })
    const res = await PATCH(req as any, { params: { jobId: 'job-1' } as any })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'reviewed' })
    )
  })

  it('PATCH rejects saving a job that has already been imported', async () => {
    jobStatus = 'imported'
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ raw_json: { lesson: { lessonNo: 1, titleZh: 'edited' } } }),
    })
    const res = await PATCH(req as any, { params: { jobId: 'job-1' } as any })
    expect(res.status).toBe(400)
    expect(updateMock).not.toHaveBeenCalled()
  })
})
