import { describe, it, expect, vi, beforeEach } from 'vitest'

let jobStatus = 'pending'
let slicedPdfPath: string | null = null
const singleMock = vi.fn(() =>
  Promise.resolve({
    data: { id: 'job-1', status: jobStatus, book_id: 'book-1', sliced_pdf_path: slicedPdfPath, raw_json: { lesson: { lessonNo: 1 } } },
    error: null,
  })
)
const eqUpdateMock = vi.fn().mockResolvedValue({ error: null })
const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })
const jobDeleteMock = vi.fn()
const storageRemoveMock = vi.fn()

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
          delete: () => ({
            eq: (_col: string, id: string) => {
              jobDeleteMock(id)
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      if (table === 'lessons') {
        // No existing lesson for this (book_id, lessonNo) in these tests.
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }
      }
      return { select: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }
    },
    storage: {
      from: () => ({
        remove: (paths: string[]) => {
          storageRemoveMock(paths)
          return Promise.resolve({ data: null, error: null })
        },
      }),
    },
  }),
}))

import { GET, PATCH, DELETE } from '@/app/api/jobs/[jobId]/route'

describe('/api/jobs/[jobId]', () => {
  beforeEach(() => {
    jobStatus = 'pending'
    slicedPdfPath = null
    updateMock.mockClear()
    jobDeleteMock.mockClear()
    storageRemoveMock.mockClear()
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

  it('DELETE removes the job with no status restriction', async () => {
    jobStatus = 'imported'
    const res = await DELETE(new Request('http://localhost') as any, { params: { jobId: 'job-1' } as any })
    expect(res.status).toBe(200)
    expect(jobDeleteMock).toHaveBeenCalledWith('job-1')
  })

  it('DELETE also removes the sliced PDF from storage if one is still attached', async () => {
    slicedPdfPath = 'jobs/job-1.pdf'
    const res = await DELETE(new Request('http://localhost') as any, { params: { jobId: 'job-1' } as any })
    expect(res.status).toBe(200)
    expect(storageRemoveMock).toHaveBeenCalledWith(['jobs/job-1.pdf'])
    expect(jobDeleteMock).toHaveBeenCalledWith('job-1')
  })
})
