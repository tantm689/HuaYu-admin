import { describe, it, expect, vi } from 'vitest'

const insertedJob = { id: 'job-1', book_id: 'book-1', lesson_no: 1, page_start: 27, page_end: 45, status: 'pending' }
const updatedJob = { ...insertedJob, sliced_pdf_path: 'jobs/job-1.pdf' }

const insertMock = vi.fn().mockReturnValue({
  select: () => ({ single: () => Promise.resolve({ data: insertedJob, error: null }) }),
})
const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'jobs/job-1.pdf' }, error: null })
const eqMock = vi.fn().mockReturnValue({
  select: () => ({ single: () => Promise.resolve({ data: updatedJob, error: null }) }),
})
const updateMock = vi.fn().mockReturnValue({ eq: eqMock })

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({ insert: insertMock, update: updateMock }),
    storage: { from: () => ({ upload: uploadMock }) },
  }),
}))

import { POST } from '@/app/api/jobs/route'

function buildForm(fields: Record<string, string>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value)
  }
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'lesson-1.pdf', { type: 'application/pdf' }))
  return form
}

describe('POST /api/jobs', () => {
  it('inserts the job, uploads the sliced pdf, and updates sliced_pdf_path', async () => {
    const form = buildForm({ bookId: 'book-1', lessonNo: '1', pageStart: '27', pageEnd: '45' })
    const req = new Request('http://localhost/api/jobs', { method: 'POST', body: form })
    const res = await POST(req as any)
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.status).toBe('pending')
    expect(json.sliced_pdf_path).toBe('jobs/job-1.pdf')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ book_id: 'book-1', lesson_no: 1, page_start: 27, page_end: 45, status: 'pending' })
    )
    expect(uploadMock).toHaveBeenCalledWith(
      'jobs/job-1.pdf',
      expect.anything(),
      expect.objectContaining({ contentType: 'application/pdf' })
    )
    expect(updateMock).toHaveBeenCalledWith({ sliced_pdf_path: 'jobs/job-1.pdf' })
  })

  it('rejects when pageStart > pageEnd', async () => {
    const form = buildForm({ bookId: 'book-1', lessonNo: '1', pageStart: '45', pageEnd: '27' })
    const req = new Request('http://localhost/api/jobs', { method: 'POST', body: form })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })

  it('rejects and never inserts when the file field is missing', async () => {
    insertMock.mockClear()
    const form = new FormData()
    form.set('bookId', 'book-1')
    form.set('lessonNo', '1')
    form.set('pageStart', '27')
    form.set('pageEnd', '45')
    // no 'file' field set

    const req = new Request('http://localhost/api/jobs', { method: 'POST', body: form })
    const res = await POST(req as any)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(typeof json.error).toBe('string')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects and never inserts when pageStart is missing/malformed', async () => {
    insertMock.mockClear()
    const form = buildForm({ bookId: 'book-1', lessonNo: '1', pageStart: 'not-a-number', pageEnd: '45' })
    const req = new Request('http://localhost/api/jobs', { method: 'POST', body: form })
    const res = await POST(req as any)

    expect(res.status).toBe(400)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects and never inserts when bookId is missing', async () => {
    insertMock.mockClear()
    const form = buildForm({ lessonNo: '1', pageStart: '27', pageEnd: '45' })
    const req = new Request('http://localhost/api/jobs', { method: 'POST', body: form })
    const res = await POST(req as any)

    expect(res.status).toBe(400)
    expect(insertMock).not.toHaveBeenCalled()
  })
})
