import { describe, it, expect, vi } from 'vitest'

const { singleJobMock, downloadMock, updateMock, extractMock } = vi.hoisted(() => ({
  singleJobMock: vi.fn(),
  downloadMock: vi.fn(),
  updateMock: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  extractMock: vi.fn(),
}))

vi.mock('@/lib/supabase/requireAdmin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ authorized: true }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'extraction_jobs') {
        return {
          select: () => ({ eq: () => ({ single: singleJobMock }) }),
          update: updateMock,
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: { from: () => ({ download: downloadMock }) },
  }),
}))

vi.mock('@/lib/gemini/extract', () => ({ extractLessonFromPdf: extractMock }))

import { POST } from '@/app/api/jobs/[jobId]/run/route'

describe('POST /api/jobs/[jobId]/run', () => {
  it('downloads the sliced pdf, extracts, and marks the job pending with raw_json on success', async () => {
    singleJobMock.mockResolvedValue({
      data: { id: 'job-1', book_id: 'book-1', lesson_no: 1, page_start: 27, page_end: 45, sliced_pdf_path: 'jobs/job-1.pdf' },
      error: null,
    })
    downloadMock.mockResolvedValue({ data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }, error: null })
    extractMock.mockResolvedValue({ lesson: { lessonNo: 1 }, dialogues: [], vocabulary: [], grammarMarkdown: '' })

    const req = new Request('http://localhost/api/jobs/job-1/run', { method: 'POST' })
    const res = await POST(req as any, { params: Promise.resolve({ jobId: 'job-1' }) })

    expect(res.status).toBe(200)
    expect(downloadMock).toHaveBeenCalledWith('jobs/job-1.pdf')
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', error_message: null })
    )
  })

  it('marks the job failed with an error message when extraction throws', async () => {
    singleJobMock.mockResolvedValue({
      data: { id: 'job-1', book_id: 'book-1', lesson_no: 1, page_start: 27, page_end: 45, sliced_pdf_path: 'jobs/job-1.pdf' },
      error: null,
    })
    downloadMock.mockResolvedValue({ data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }, error: null })
    extractMock.mockRejectedValue(new Error('Gemini timeout'))

    const req = new Request('http://localhost/api/jobs/job-1/run', { method: 'POST' })
    const res = await POST(req as any, { params: Promise.resolve({ jobId: 'job-1' }) })

    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error_message: 'Gemini timeout' })
    )
  })
})
